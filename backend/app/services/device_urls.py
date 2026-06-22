from __future__ import annotations

from typing import Optional
from urllib.parse import quote

from app.models import DeviceType, RtspMode, RtspStreamType


def normalize_vendor(vendor: Optional[str]) -> Optional[str]:
    value = (vendor or "").strip()
    if not value:
        return None

    lowered = value.lower()
    if any(token in lowered for token in ("uniview", "unv")):
        return "UNV"
    if any(token in lowered for token in ("hikvision", "prama")):
        return "Hikvision"
    if any(token in lowered for token in ("dahua",)):
        return "Dahua"
    if any(token in lowered for token in ("cp plus", "cp-plus")):
        return "CP Plus"
    if "axis" in lowered:
        return "Axis"
    return value


def _vendor_family(vendor: Optional[str]) -> str:
    value = (normalize_vendor(vendor) or "").strip().lower()
    if any(token in value for token in ("hikvision", "prama")):
        return "hikvision"
    if any(token in value for token in ("dahua", "cp plus", "cp-plus")):
        return "dahua"
    if any(token in value for token in ("uniview", "unv")):
        return "uniview"
    if "axis" in value:
        return "axis"
    return "generic"


def vendor_family(vendor: Optional[str]) -> str:
    return _vendor_family(vendor)


def _encoded_credentials(username: Optional[str], password: Optional[str]) -> str:
    user = (username or "").strip()
    pwd = (password or "").strip()
    if not user or not pwd:
        return ""

    encoded_user = quote(user, safe="")
    encoded_pwd = quote(pwd, safe="")
    return f"{encoded_user}:{encoded_pwd}@"


def _coerce_stream_type(stream_type: RtspStreamType | str | None) -> RtspStreamType:
    return RtspStreamType(stream_type or RtspStreamType.main.value)


def _default_rtsp_path(device_type: DeviceType, vendor: Optional[str], stream_type: RtspStreamType | str | None) -> str:
    family = _vendor_family(vendor)
    resolved_stream_type = _coerce_stream_type(stream_type)

    if family == "hikvision":
        return "/Streaming/Channels/101" if resolved_stream_type == RtspStreamType.main else "/Streaming/Channels/102"
    if family == "dahua":
        subtype = 0 if resolved_stream_type == RtspStreamType.main else 1
        return f"/cam/realmonitor?channel=1&subtype={subtype}"
    if family == "uniview":
        return "/unicast/c1/s0/live" if resolved_stream_type == RtspStreamType.main else "/unicast/c1/s1/live"
    if family == "axis":
        return "/axis-media/media.amp"
    if device_type == DeviceType.nvr:
        return "/Streaming/Channels/101" if resolved_stream_type == RtspStreamType.main else "/Streaming/Channels/102"
    return "/stream1" if resolved_stream_type == RtspStreamType.main else "/stream2"


def _candidate_paths(device_type: DeviceType, vendor: Optional[str], stream_type: RtspStreamType | str | None) -> list[str]:
    family = _vendor_family(vendor)
    resolved_stream_type = _coerce_stream_type(stream_type)

    if family == "hikvision":
        return [
            "/Streaming/Channels/101" if resolved_stream_type == RtspStreamType.main else "/Streaming/Channels/102",
            "/Streaming/Channels/301" if resolved_stream_type == RtspStreamType.main else "/Streaming/Channels/302",
        ]
    if family == "uniview":
        return [
            "/unicast/c1/s0/live" if resolved_stream_type == RtspStreamType.main else "/unicast/c1/s1/live",
            "/media/video1" if resolved_stream_type == RtspStreamType.main else "/media/video2",
        ]
    if family == "dahua":
        return [
            f"/cam/realmonitor?channel=1&subtype={0 if resolved_stream_type == RtspStreamType.main else 1}",
        ]
    if family == "axis":
        return ["/axis-media/media.amp"]
    if device_type == DeviceType.nvr:
        return [
            "/Streaming/Channels/101" if resolved_stream_type == RtspStreamType.main else "/Streaming/Channels/102",
            "/Streaming/Channels/301" if resolved_stream_type == RtspStreamType.main else "/Streaming/Channels/302",
        ]
    return [
        "/stream1" if resolved_stream_type == RtspStreamType.main else "/stream2",
    ]


def generate_rtsp_url(
    vendor: Optional[str],
    ip_address: Optional[str],
    rtsp_port: Optional[int],
    username: Optional[str],
    password: Optional[str],
    stream_type: str = "main",
    device_type: DeviceType = DeviceType.nvr,
) -> Optional[str]:
    host = (ip_address or "").strip()
    if not host:
        return None

    resolved_stream_type = _coerce_stream_type(stream_type)
    port = rtsp_port or 554
    credentials = _encoded_credentials(username, password)
    path = _default_rtsp_path(device_type, vendor, resolved_stream_type)
    return f"rtsp://{credentials}{host}:{port}{path}"


def generate_rtsp_candidates(
    vendor: Optional[str],
    ip_address: Optional[str],
    rtsp_port: Optional[int],
    username: Optional[str],
    password: Optional[str],
    stream_type: str = "main",
    device_type: DeviceType = DeviceType.nvr,
    current_rtsp_url: Optional[str] = None,
) -> list[str]:
    host = (ip_address or "").strip()
    if not host:
        return []

    resolved_stream_type = _coerce_stream_type(stream_type)
    port = rtsp_port or 554
    credentials = _encoded_credentials(username, password)

    candidates: list[str] = []
    if current_rtsp_url and current_rtsp_url.strip():
        candidates.append(current_rtsp_url.strip())

    for path in _candidate_paths(device_type, vendor, resolved_stream_type):
        candidates.append(f"rtsp://{credentials}{host}:{port}{path}")

    deduped: list[str] = []
    for candidate in candidates:
        if candidate not in deduped:
            deduped.append(candidate)
    return deduped


def build_rtsp_url(
    *,
    device_type: DeviceType,
    ip_address: Optional[str],
    rtsp_port: Optional[int],
    username: Optional[str],
    password: Optional[str],
    vendor: Optional[str],
    rtsp_stream_type: RtspStreamType = RtspStreamType.main,
    rtsp_mode: RtspMode,
    rtsp_url: Optional[str] = None,
) -> Optional[str]:
    if rtsp_mode == RtspMode.disabled:
        return None

    if rtsp_mode == RtspMode.custom:
        return rtsp_url.strip() if rtsp_url and rtsp_url.strip() else None

    return generate_rtsp_url(
        vendor=vendor,
        ip_address=ip_address,
        rtsp_port=rtsp_port,
        username=username,
        password=password,
        stream_type=_coerce_stream_type(rtsp_stream_type).value,
        device_type=device_type,
    )


def generate_nvr_channel_rtsp_urls(
    vendor: Optional[str],
    ip_address: Optional[str],
    rtsp_port: Optional[int],
    username: Optional[str],
    password: Optional[str],
    channel_capacity: Optional[int],
    stream_type: str = "main",
    current_rtsp_url: Optional[str] = None,
) -> list[tuple[int, str]]:
    host = (ip_address or "").strip()
    if not host:
        return []

    capacity = max(0, min(int(channel_capacity or 0), 256))
    if capacity <= 0:
        return []

    family = _vendor_family(vendor)
    resolved_stream_type = _coerce_stream_type(stream_type)
    port = rtsp_port or 554
    credentials = _encoded_credentials(username, password)

    stream_suffix = "01" if resolved_stream_type == RtspStreamType.main else "02"
    subtype = 0 if resolved_stream_type == RtspStreamType.main else 1
    uniview_suffix = "s0" if resolved_stream_type == RtspStreamType.main else "s1"

    urls: list[tuple[int, str]] = []
    if current_rtsp_url and current_rtsp_url.strip():
        urls.append((0, current_rtsp_url.strip()))

    for channel in range(1, capacity + 1):
        if family == "hikvision" or family == "generic":
            path = f"/Streaming/Channels/{channel}{stream_suffix}"
        elif family == "dahua":
            path = f"/cam/realmonitor?channel={channel}&subtype={subtype}"
        elif family == "uniview":
            path = f"/unicast/c{channel}/{uniview_suffix}/live"
        elif family == "axis":
            path = "/axis-media/media.amp"
        else:
            path = f"/Streaming/Channels/{channel}{stream_suffix}"
        urls.append((channel, f"rtsp://{credentials}{host}:{port}{path}"))

    deduped: list[tuple[int, str]] = []
    seen: set[str] = set()
    for channel, url in urls:
        if url in seen:
            continue
        seen.add(url)
        deduped.append((channel, url))
    return deduped
