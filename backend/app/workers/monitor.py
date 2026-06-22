import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlsplit, urlunsplit

import httpx
from sqlalchemy import select

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models import AlertSeverity, AlertType, CheckLog, CheckType, Device, DeviceStatus, DeviceType, RtspMode, Site
from app.services.alerts import escalate_stale_alerts, record_check_result
from app.services.notifications import redrive_pending_notifications
from app.services.device_urls import generate_nvr_channel_rtsp_urls, generate_rtsp_candidates, vendor_family

logger = logging.getLogger("monitor")

# Max devices checked concurrently. Must stay BELOW the DB pool ceiling
# (pool_size + max_overflow in db/session.py) or sessions block and time out
# with "QueuePool limit ... reached", and low enough that concurrent
# ffprobe/ping subprocesses don't exhaust a small (512MB) instance's memory.
CHECK_CONCURRENCY = 5


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_aware_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def parse_ping_latency(output: str) -> Optional[float]:
    # Matches both Linux (min/avg/max/mdev) and BusyBox (min/avg/max) stat lines
    avg_match = re.search(r"=\s*[\d.]+/([\d.]+)/[\d.]+(?:/[\d.]+)?\s*ms", output)
    if avg_match:
        return float(avg_match.group(1))

    time_matches = re.findall(r"time[=<]([\d.]+)\s*ms", output)
    if time_matches:
        values = [float(value) for value in time_matches]
        return sum(values) / len(values)

    return None


def parse_ping_packet_loss(output: str) -> Optional[float]:
    loss_match = re.search(r"(\d+(?:\.\d+)?)%\s*packet loss", output)
    if loss_match:
        return float(loss_match.group(1))
    return None


def has_ping_reply(output: str) -> bool:
    return bool(re.search(r"(bytes from|reply from)", output, re.IGNORECASE))


async def ping_host(ip: str) -> tuple[bool, Optional[float], Optional[float]]:
    try:
        proc = await asyncio.create_subprocess_exec(
            "ping", "-c", "2", "-W", str(int(settings.PING_TIMEOUT)), ip,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=8)
        output = stdout.decode(errors="ignore")
        latency = parse_ping_latency(output)
        packet_loss_pct = parse_ping_packet_loss(output)
        replied = has_ping_reply(output)
        if packet_loss_pct is None:
            packet_loss_pct = 0.0 if replied else 100.0
        return replied, latency, packet_loss_pct
    except Exception:
        return False, None, 100.0


async def check_rtsp(rtsp_url: str) -> tuple[bool, Optional[str]]:
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffprobe",
            "-v", "error",
            "-rtsp_transport", "tcp",
            "-i", rtsp_url,
            "-show_entries", "stream=codec_type",
            "-of", "default=noprint_wrappers=1",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=settings.RTSP_TIMEOUT)
        if proc.returncode == 0:
            return True, None
        message = (stderr or b"").decode(errors="ignore").strip()
        if "401" in message or "unauthorized" in message.lower():
            return False, "401 Unauthorized"
        if "404" in message or "not found" in message.lower():
            return False, "404 Not Found"
        return False, message or f"RTSP probe failed with exit code {proc.returncode}"
    except asyncio.TimeoutError:
        return False, "RTSP check timed out"
    except FileNotFoundError:
        return False, "ffprobe is not installed"
    except Exception as e:
        return False, str(e)


async def check_rtsp_with_retries(rtsp_url: str, attempts: int = 2) -> tuple[bool, Optional[str]]:
    errors: list[str] = []
    total_attempts = max(1, attempts)
    for attempt_index in range(total_attempts):
        ok, err = await check_rtsp(rtsp_url)
        if ok:
            return True, None
        if err:
            errors.append(err)
        if attempt_index < total_attempts - 1:
            await asyncio.sleep(1)
    return False, errors[-1] if errors else "RTSP failed"


async def check_http_api(
    ip: str,
    port: int = 80,
    username: Optional[str] = None,
    password: Optional[str] = None,
    vendor: Optional[str] = None,
) -> tuple[bool, Optional[str]]:
    root_candidates = build_device_root_candidates(ip=ip, port=port)
    root_ok, root_err = await check_http_url_candidates(
        root_candidates,
        username,
        password,
        attempts=2,
    )
    if root_ok:
        return True, None

    vendor_candidates = build_api_endpoint_candidates(ip=ip, port=port, vendor=vendor)
    vendor_ok, vendor_err = await check_http_url_candidates(
        vendor_candidates,
        username,
        password,
        attempts=2,
    )
    if vendor_ok:
        return True, None

    error_parts = [part for part in [root_err, vendor_err] if part]
    if not error_parts:
        return False, "No HTTP candidates to check"
    return False, " | ".join(error_parts)


async def check_http_url(
    url: str,
    username: Optional[str] = None,
    password: Optional[str] = None,
) -> tuple[bool, Optional[str]]:
    return await check_http_url_candidates(build_http_candidates(url), username, password)


def build_http_candidates(url: str) -> list[str]:
    raw = (url or "").strip()
    if not raw:
        return []

    if "://" not in raw:
        return [f"http://{raw}", f"https://{raw}"]

    parsed = urlsplit(raw)
    candidates = [raw]
    if parsed.scheme == "http":
        candidates.append(urlunsplit(("https", parsed.netloc, parsed.path, parsed.query, parsed.fragment)))
    elif parsed.scheme == "https":
        candidates.append(urlunsplit(("http", parsed.netloc, parsed.path, parsed.query, parsed.fragment)))
    return candidates


def build_device_root_candidates(*, ip: str, port: int, preferred_url: Optional[str] = None) -> list[str]:
    candidates: list[str] = []
    if preferred_url and preferred_url.strip():
        candidates.extend(build_http_candidates(preferred_url))
    candidates.extend([
        f"http://{ip}:{port}/",
        f"https://{ip}:{port}/",
    ])

    deduped: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        deduped.append(candidate)
    return deduped


def build_api_endpoint_candidates(
    *,
    ip: str,
    port: int,
    vendor: Optional[str] = None,
    preferred_url: Optional[str] = None,
) -> list[str]:
    candidates: list[str] = []
    family = vendor_family(vendor)

    if preferred_url and preferred_url.strip():
        candidates.extend(build_http_candidates(preferred_url))

    if family == "hikvision":
        paths = [
            "/doc/page/login.asp",
            "/ISAPI/System/deviceInfo",
            "/ISAPI/System/status",
        ]
    elif family == "dahua":
        paths = [
            "/cgi-bin/magicBox.cgi?action=getDeviceType",
            "/cgi-bin/magicBox.cgi?action=getSystemInfo",
        ]
    elif family == "uniview":
        paths = [
            "/onvif/device_service",
        ]
    elif family == "axis":
        paths = [
            "/axis-cgi/basicdeviceinfo.cgi",
        ]
    else:
        paths = [
            "/ISAPI/System/deviceInfo",
            "/cgi-bin/magicBox.cgi?action=getDeviceType",
            "/onvif/device_service",
        ]

    for scheme in ("http", "https"):
        for path in paths:
            candidates.append(f"{scheme}://{ip}:{port}{path}")

    deduped: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        deduped.append(candidate)
    return deduped


def _is_alive_status(status_code: int) -> bool:
    """Any response that proves the web service is running.
    401/403 = server is up but access-controlled — device is alive.
    Only 5xx (server crash) or no response (timeout/refused) means down."""
    return status_code < 400 or status_code in (401, 403)


async def _try_url(
    client: httpx.AsyncClient,
    url: str,
    username: Optional[str],
    password: Optional[str],
) -> tuple[bool, int, Optional[str]]:
    """Try a URL with Basic auth first, then Digest auth on 401.
    Returns (alive, status_code, error_message)."""
    basic_auth = (username, password) if username and password else None
    try:
        resp = await client.get(url, auth=basic_auth, follow_redirects=True)
        if _is_alive_status(resp.status_code):
            return True, resp.status_code, None

        # Got 401 with Basic — many NVRs (Hikvision, Dahua) require Digest Auth.
        # Retry with Digest before giving up.
        if resp.status_code == 401 and username and password:
            try:
                digest_resp = await client.get(
                    url,
                    auth=httpx.DigestAuth(username, password),
                    follow_redirects=True,
                )
                if _is_alive_status(digest_resp.status_code):
                    return True, digest_resp.status_code, None
                return False, digest_resp.status_code, f"HTTP {digest_resp.status_code}"
            except Exception:
                pass  # digest failed, fall through to original error

        return False, resp.status_code, f"HTTP {resp.status_code}"
    except Exception as exc:
        return False, 0, str(exc)


async def check_http_url_candidates(
    urls: list[str],
    username: Optional[str] = None,
    password: Optional[str] = None,
    attempts: int = 1,
) -> tuple[bool, Optional[str]]:
    try:
        async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT, verify=False) as client:
            errors: list[str] = []
            total_attempts = max(1, attempts)
            for attempt_index in range(total_attempts):
                errors.clear()
                for url in urls:
                    alive, status, err = await _try_url(client, url, username, password)
                    if alive:
                        return True, None
                    if err:
                        exc_obj = Exception(err)
                        if _is_noncritical_http_status(url, status):
                            errors.append(f"{url} -> Optional endpoint HTTP {status}")
                        elif _is_noncritical_http_exception(url, exc_obj):
                            errors.append(f"{url} -> Optional endpoint unavailable")
                        else:
                            errors.append(f"{url} -> {err}")

                if attempt_index < total_attempts - 1:
                    await asyncio.sleep(1)

            filtered_errors = _filter_http_errors(errors)
            return False, " | ".join(filtered_errors[-4:]) if filtered_errors else "HTTP check failed"
    except Exception as e:
        return False, str(e)


def _is_noncritical_http_status(url: str, status_code: int) -> bool:
    return "/onvif/device_service" in url and status_code in {404, 500}


def _is_noncritical_http_exception(url: str, exc: Exception) -> bool:
    message = str(exc).lower()
    return (
        url.startswith("https://")
        and ("wrong version number" in message or "ssl:" in message)
    )


def _filter_http_errors(errors: list[str]) -> list[str]:
    filtered = [error for error in errors if "Optional endpoint" not in error]
    return filtered or errors


async def log_check(db, *, device: Device, check_type: CheckType, success: bool, latency_ms=None, packet_loss_pct=None, error_message=None):
    db.add(CheckLog(
        device_id=device.id,
        check_type=check_type,
        success=success,
        latency_ms=latency_ms,
        packet_loss_pct=packet_loss_pct,
        error_message=error_message,
    ))


def packet_loss_warning(packet_loss_pct: Optional[float]) -> bool:
    return packet_loss_pct is not None and packet_loss_pct > 0 and packet_loss_pct < 100


def all_fail(values: list[Optional[bool]]) -> bool:
    filtered = [value for value in values if value is not None]
    return bool(filtered) and all(value is False for value in filtered)


def any_fail(values: list[Optional[bool]]) -> bool:
    return any(value is False for value in values if value is not None)


def resolve_device_status(
    *,
    ping_ok: Optional[bool],
    service_checks: list[Optional[bool]],
    has_warning: bool = False,
) -> DeviceStatus:
    if ping_ok is False:
        return DeviceStatus.offline

    all_checks = [ping_ok, *service_checks]
    if all_fail(all_checks):
        return DeviceStatus.offline

    if any(value is False for value in service_checks if value is not None):
        return DeviceStatus.degraded

    if any(value is True for value in all_checks if value is not None):
        # Packet loss on ping with otherwise healthy services → degraded
        if has_warning:
            return DeviceStatus.degraded
        return DeviceStatus.online

    if has_warning:
        return DeviceStatus.degraded

    return DeviceStatus.unknown


async def check_rtsp_candidates_for_device(device: Device) -> tuple[Optional[bool], Optional[str], Optional[str]]:
    if device.rtsp_mode == RtspMode.disabled.value:
        return None, None, None

    if device.rtsp_mode == RtspMode.custom.value and device.rtsp_url:
        ok, err = await check_rtsp_with_retries(device.rtsp_url)
        return ok, err, device.rtsp_url if ok else None

    candidates = generate_rtsp_candidates(
        vendor=device.vendor,
        ip_address=device.ip_address,
        rtsp_port=device.rtsp_port,
        username=device.username,
        password=device.password,
        stream_type=device.rtsp_stream_type,
        device_type=device.device_type,
        current_rtsp_url=device.rtsp_url,
    )
    if not candidates:
        return None, None, None

    errors: list[str] = []
    for candidate in candidates:
        ok, err = await check_rtsp_with_retries(candidate)
        if ok:
            return True, None, candidate
        errors.append(f"{candidate} -> {err or 'RTSP failed'}")

    return False, " | ".join(errors[-3:]), None


def summarize_rtsp_error(message: Optional[str]) -> str:
    if not message:
        return "Unknown RTSP failure"
    lowered = message.lower()
    if "401" in lowered or "unauthorized" in lowered:
        return "401 Unauthorized"
    if "404" in lowered or "not found" in lowered:
        return "404 Not Found"
    if "refused" in lowered:
        return "Connection refused"
    if "timed out" in lowered or "timeout" in lowered:
        return "Timed out"
    return message.splitlines()[0][:120]


async def check_nvr_rtsp_channels_for_device(
    device: Device,
) -> tuple[Optional[bool], Optional[bool], Optional[str], Optional[str]]:
    if device.rtsp_mode == RtspMode.disabled.value:
        return None, None, None, None

    channel_capacity = max(device.channel_count or 0, device.channels_used or 0)
    if channel_capacity <= 0:
        rtsp_ok, rtsp_err, working_rtsp_url = await check_rtsp_candidates_for_device(device)
        return rtsp_ok, rtsp_ok, rtsp_err, working_rtsp_url

    candidates = generate_nvr_channel_rtsp_urls(
        vendor=device.vendor,
        ip_address=device.ip_address,
        rtsp_port=device.rtsp_port,
        username=device.username,
        password=device.password,
        channel_capacity=channel_capacity,
        stream_type=device.rtsp_stream_type,
        current_rtsp_url=device.rtsp_url if device.rtsp_mode == RtspMode.custom.value else None,
    )
    if not candidates:
        return None, None, None, None

    passing_channels: list[int] = []
    failing_channels: list[tuple[int, str]] = []
    working_rtsp_url: Optional[str] = None

    for channel_number, candidate in candidates:
        ok, err = await check_rtsp_with_retries(candidate)
        if ok:
            if channel_number > 0:
                passing_channels.append(channel_number)
            if working_rtsp_url is None:
                working_rtsp_url = candidate
        elif channel_number > 0:
            failing_channels.append((channel_number, summarize_rtsp_error(err)))

    any_pass = len(passing_channels) > 0
    expected_used = max(0, min(device.channels_used or 0, channel_capacity))

    summary_parts = [f"RTSP channels passing: {len(passing_channels)}/{channel_capacity}"]
    if expected_used:
        summary_parts.append(f"Expected channels used: {expected_used}")
        missing_expected = max(expected_used - len(passing_channels), 0)
        summary_parts.append(f"Expected channels still failing: {missing_expected}")
    if passing_channels:
        preview = ", ".join(str(channel) for channel in passing_channels[:12])
        summary_parts.append(f"Working channels: {preview}")
    if failing_channels:
        preview = ", ".join(f"{channel} ({error})" for channel, error in failing_channels[:12])
        summary_parts.append(f"Failed channels: {preview}")

    # Operationally, treat the NVR RTSP alert as healthy when any channel responds.
    # We still include missing-channel detail in the summary for diagnosis.
    return any_pass, any_pass, " | ".join(summary_parts), working_rtsp_url


async def run_device_check(device_id: str):
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(Device)
                .join(Site, Device.site_id == Site.id)
                .where(Device.id == device_id, Device.is_active == True, Site.is_active == True)
            )
            device = result.scalar_one_or_none()
            if not device:
                return

            now = utc_now()
            ping_ok, ping_latency, ping_packet_loss_pct = await ping_host(device.ip_address)
            await log_check(
                db,
                device=device,
                check_type=CheckType.ping,
                success=ping_ok,
                latency_ms=ping_latency,
                packet_loss_pct=ping_packet_loss_pct,
                error_message=None if ping_ok else "Ping failed",
            )
            ping_warning = packet_loss_warning(ping_packet_loss_pct)

            rtsp_ok = None
            api_ok = None
            recording_ok = None

            if device.device_type == DeviceType.camera:
                await record_check_result(
                    db,
                    device=device,
                    alert_type=AlertType.ping_failure,
                    success=ping_ok,
                    severity=AlertSeverity.medium,
                    issue="Ping Failure",
                )

                # Skip RTSP check when ping already failed — no point probing stream
                # on an unreachable host, and it prevents duplicate alerts.
                if device.rtsp_mode != RtspMode.disabled.value and ping_ok is not False:
                    rtsp_ok, rtsp_err, working_rtsp_url = await check_rtsp_candidates_for_device(device)
                    if working_rtsp_url and device.rtsp_mode == RtspMode.auto.value and device.rtsp_url != working_rtsp_url:
                        device.rtsp_url = working_rtsp_url
                    await log_check(
                        db,
                        device=device,
                        check_type=CheckType.rtsp,
                        success=rtsp_ok,
                        error_message=rtsp_err,
                    )
                    await record_check_result(
                        db,
                        device=device,
                        alert_type=AlertType.rtsp_failure,
                        success=rtsp_ok,
                        severity=AlertSeverity.medium,
                        issue="RTSP Stream Unavailable",
                    )

                new_status = resolve_device_status(
                    ping_ok=ping_ok,
                    service_checks=[rtsp_ok],
                    has_warning=ping_warning,
                )

            elif device.device_type == DeviceType.nvr:
                await record_check_result(
                    db,
                    device=device,
                    alert_type=AlertType.nvr_ping_failure,
                    success=ping_ok,
                    severity=AlertSeverity.critical,
                    issue="NVR Ping Failure",
                )

                if ping_ok is False:
                    # Host is unreachable — skip expensive HTTP/RTSP probes but still
                    # count failures so alert thresholds increment correctly.
                    api_ok, api_err = False, "Host unreachable (ping failed)"
                    await log_check(db, device=device, check_type=CheckType.api, success=False, error_message=api_err)
                    await record_check_result(
                        db,
                        device=device,
                        alert_type=AlertType.nvr_http_failure,
                        success=False,
                        severity=AlertSeverity.critical,
                        issue="NVR HTTP/API Health Failure",
                    )
                    if device.rtsp_mode != RtspMode.disabled.value:
                        rtsp_ok = False
                        await log_check(db, device=device, check_type=CheckType.rtsp, success=False, error_message="Host unreachable (ping failed)")
                        await record_check_result(
                            db,
                            device=device,
                            alert_type=AlertType.nvr_rtsp_failure,
                            success=False,
                            severity=AlertSeverity.critical,
                            issue="NVR RTSP Stream Unavailable",
                        )
                    if device.recording_check_url:
                        recording_ok = False
                        await log_check(db, device=device, check_type=CheckType.recording, success=False, error_message="Host unreachable (ping failed)")
                        await record_check_result(
                            db,
                            device=device,
                            alert_type=AlertType.nvr_recording_failure,
                            success=False,
                            severity=AlertSeverity.critical,
                            issue="NVR Recording Service Failure",
                        )
                else:
                    api_url = device.api_url or device.http_url
                    if api_url:
                        api_ok, api_err = await check_http_url(api_url, device.username, device.password)
                    else:
                        api_ok, api_err = await check_http_api(
                            device.ip_address,
                            device.port,
                            device.username,
                            device.password,
                            device.vendor,
                        )

                    await log_check(db, device=device, check_type=CheckType.api, success=api_ok, error_message=api_err)
                    await record_check_result(
                        db,
                        device=device,
                        alert_type=AlertType.nvr_http_failure,
                        success=api_ok,
                        severity=AlertSeverity.critical,
                        issue="NVR HTTP/API Health Failure",
                    )

                    if device.rtsp_mode != RtspMode.disabled.value:
                        rtsp_ok, rtsp_alert_ok, rtsp_err, working_rtsp_url = await check_nvr_rtsp_channels_for_device(device)
                        if working_rtsp_url and device.rtsp_mode == RtspMode.auto.value and device.rtsp_url != working_rtsp_url:
                            device.rtsp_url = working_rtsp_url
                        await log_check(db, device=device, check_type=CheckType.rtsp, success=rtsp_ok, error_message=rtsp_err)
                        await record_check_result(
                            db,
                            device=device,
                            alert_type=AlertType.nvr_rtsp_failure,
                            success=rtsp_alert_ok if rtsp_alert_ok is not None else rtsp_ok,
                            severity=AlertSeverity.critical,
                            issue=rtsp_err or "NVR RTSP Stream Unavailable",
                        )

                    if device.recording_check_url:
                        recording_ok, recording_err = await check_http_url(
                            device.recording_check_url,
                            device.username,
                            device.password,
                        )
                        await log_check(db, device=device, check_type=CheckType.recording, success=recording_ok, error_message=recording_err)
                        await record_check_result(
                            db,
                            device=device,
                            alert_type=AlertType.nvr_recording_failure,
                            success=recording_ok,
                            severity=AlertSeverity.critical,
                            issue="NVR Recording Service Failure",
                        )

                checks = [ping_ok, api_ok]
                if rtsp_ok is not None:
                    checks.append(rtsp_ok)
                if recording_ok is not None:
                    checks.append(recording_ok)
                new_status = resolve_device_status(
                    ping_ok=ping_ok,
                    service_checks=checks[1:],
                    has_warning=ping_warning,
                )

            else:
                new_status = resolve_device_status(
                    ping_ok=ping_ok,
                    service_checks=[],
                    has_warning=ping_warning,
                )

            if new_status == DeviceStatus.offline and device.status != DeviceStatus.offline:
                device.downtime_start = now
            if new_status != DeviceStatus.offline and device.status == DeviceStatus.offline:
                downtime_start = as_aware_utc(device.downtime_start)
                if downtime_start:
                    secs = int((now - downtime_start).total_seconds())
                    device.downtime_seconds = (device.downtime_seconds or 0) + secs
                device.downtime_start = None

            device.status = new_status
            device.ping_status = ping_ok
            device.rtsp_status = rtsp_ok
            device.api_status = api_ok
            device.ping_packet_loss_pct = ping_packet_loss_pct
            if ping_ok:
                device.last_seen = now

            await db.commit()
            logger.debug("Checked %s (%s): %s", device.name, device.ip_address, new_status.value)

        except Exception as e:
            logger.error("Error checking device %s: %s", device_id, e)
            await db.rollback()


async def _get_active_device_ids() -> list[str]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Device.id)
            .join(Site, Device.site_id == Site.id)
            .where(Device.is_active == True, Site.is_active == True)
        )
        return [row[0] for row in result.all()]


async def run_all_checks():
    """Run all checks (ping + RTSP + API) for all active devices.
    Called by the service-checks scheduler job every RTSP_INTERVAL_SECONDS."""
    device_ids = await _get_active_device_ids()
    logger.info("Running full checks on %s devices", len(device_ids))
    batch_size = CHECK_CONCURRENCY
    for i in range(0, len(device_ids), batch_size):
        batch = device_ids[i:i + batch_size]
        await asyncio.gather(*[run_device_check(did) for did in batch])


async def run_ping_checks():
    """Run ping-only checks for all active devices.
    Called by the ping scheduler job every PING_INTERVAL_SECONDS.
    Uses stored RTSP/API statuses so the overall device status stays current."""
    device_ids = await _get_active_device_ids()
    logger.info("Running ping checks on %s devices", len(device_ids))

    async def _ping_only(device_id: str):
        async with AsyncSessionLocal() as db:
            try:
                result = await db.execute(
                    select(Device)
                    .join(Site, Device.site_id == Site.id)
                    .where(Device.id == device_id, Device.is_active == True, Site.is_active == True)
                )
                device = result.scalar_one_or_none()
                if not device:
                    return

                now = utc_now()
                ping_ok, ping_latency, ping_packet_loss_pct = await ping_host(device.ip_address)
                await log_check(
                    db,
                    device=device,
                    check_type=CheckType.ping,
                    success=ping_ok,
                    latency_ms=ping_latency,
                    packet_loss_pct=ping_packet_loss_pct,
                    error_message=None if ping_ok else "Ping failed",
                )
                ping_warning = packet_loss_warning(ping_packet_loss_pct)

                if device.device_type == DeviceType.camera:
                    await record_check_result(
                        db,
                        device=device,
                        alert_type=AlertType.ping_failure,
                        success=ping_ok,
                        severity=AlertSeverity.medium,
                        issue="Ping Failure",
                    )
                elif device.device_type == DeviceType.nvr:
                    await record_check_result(
                        db,
                        device=device,
                        alert_type=AlertType.nvr_ping_failure,
                        success=ping_ok,
                        severity=AlertSeverity.critical,
                        issue="NVR Ping Failure",
                    )

                # Re-use last known service check results for status computation
                stored_rtsp = device.rtsp_status
                stored_api = device.api_status
                service_checks: list[Optional[bool]] = []
                if device.device_type == DeviceType.camera:
                    service_checks = [stored_rtsp] if stored_rtsp is not None else []
                elif device.device_type == DeviceType.nvr:
                    service_checks = [x for x in [stored_api, stored_rtsp] if x is not None]

                new_status = resolve_device_status(
                    ping_ok=ping_ok,
                    service_checks=service_checks,
                    has_warning=ping_warning,
                )

                if new_status == DeviceStatus.offline and device.status != DeviceStatus.offline:
                    device.downtime_start = now
                if new_status != DeviceStatus.offline and device.status == DeviceStatus.offline:
                    downtime_start = as_aware_utc(device.downtime_start)
                    if downtime_start:
                        secs = int((now - downtime_start).total_seconds())
                        device.downtime_seconds = (device.downtime_seconds or 0) + secs
                    device.downtime_start = None

                device.status = new_status
                device.ping_status = ping_ok
                device.ping_packet_loss_pct = ping_packet_loss_pct
                if ping_ok:
                    device.last_seen = now

                await db.commit()
                logger.debug("Ping %s (%s): %s", device.name, device.ip_address, new_status.value)
            except Exception as e:
                logger.error("Error ping-checking device %s: %s", device_id, e)
                await db.rollback()

    batch_size = CHECK_CONCURRENCY
    for i in range(0, len(device_ids), batch_size):
        batch = device_ids[i:i + batch_size]
        await asyncio.gather(*[_ping_only(did) for did in batch])


async def run_alert_escalations():
    async with AsyncSessionLocal() as db:
        try:
            count = await escalate_stale_alerts(db)
            await db.commit()
            if count:
                logger.info("Escalated %s stale alerts", count)
        except Exception as e:
            logger.error("Error escalating alerts: %s", e)
            await db.rollback()


async def run_notification_retries():
    """Redrive notifications whose delivery failed, with backoff. Delivery-layer
    only — does not touch alert generation."""
    async with AsyncSessionLocal() as db:
        try:
            await redrive_pending_notifications(db)
            await db.commit()
        except Exception as e:
            logger.error("Error redriving notifications: %s", e)
            await db.rollback()
