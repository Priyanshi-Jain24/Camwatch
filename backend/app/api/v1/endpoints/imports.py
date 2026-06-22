import io
import json
import re
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
import pandas as pd

from app.db.session import get_db
from app.models import Device, Site, DeviceType, DeviceStatus, ImportLog, RtspMode, RtspStreamType
from app.schemas import ImportLogOut, _validate_ip
from app.api.deps import get_current_admin, get_current_user
from app.services.device_urls import build_rtsp_url, normalize_vendor

router = APIRouter()

REQUIRED_COLS = {"site_name", "device_name", "device_type", "ip_address"}
STANDARD_REQUIRED_COLS = {"hub_name"}
VALID_TYPES = {"camera", "nvr"}
VALID_RTSP_MODES = {mode.value for mode in RtspMode}


def device_identity_key(*, site_id: str, device_type: str, ip_address: str, port: int, rtsp_port: int) -> tuple[str, str, str, int, int]:
    return (site_id, device_type, ip_address, port, rtsp_port)


def cell_value(row, key: str) -> str:
    value = row.get(key, "")
    if pd.isna(value):
        return ""
    return str(value).strip()


def parse_int(value: str, default: int) -> int:
    if not value:
        return default
    cleaned = value.strip()
    if "/" in cleaned:
        raise ValueError(f"Ambiguous numeric value '{value}'")
    return int(float(cleaned))


def parse_channel_count(value: str) -> int | None:
    if not value:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if "," in cleaned:
        parts = [part.strip() for part in cleaned.split(",") if part.strip()]
        return sum(int(float(part)) for part in parts)
    return int(float(cleaned))


def parse_rtsp_mode(rtsp_mode: str, rtsp_url: str) -> RtspMode:
    raw = rtsp_mode.strip().lower()
    if raw:
        if raw not in VALID_RTSP_MODES:
            raise ValueError(f"Invalid rtsp_mode '{rtsp_mode}'")
        return RtspMode(raw)
    if rtsp_url.strip():
        return RtspMode.custom
    return RtspMode.auto


def parse_rtsp_stream_type(stream_type: str) -> RtspStreamType:
    raw = stream_type.strip().lower()
    if not raw:
        return RtspStreamType.main
    return RtspStreamType(raw)


def is_standard_hub_format(columns: set[str]) -> bool:
    return STANDARD_REQUIRED_COLS.issubset(columns)


def build_standard_notes(*, zone: str, hub_code: str) -> str | None:
    parts = []
    if zone:
        parts.append(f"Zone: {zone}")
    if hub_code:
        parts.append(f"Hub Code: {hub_code}")
    return "\n".join(parts) if parts else None


def normalize_ip_cell(raw_value: str) -> str:
    value = raw_value.strip()
    if not value:
        raise ValueError("Empty IP address")

    try:
        return _validate_ip(value)
    except ValueError:
        pass

    ipv4_matches = re.findall(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", value)
    ipv6_matches = re.findall(r"\b(?:[0-9A-Fa-f]{1,4}:){2,}[0-9A-Fa-f:]{1,4}\b", value)
    matches = ipv4_matches + ipv6_matches
    unique_matches = []
    for match in matches:
        try:
            normalized = _validate_ip(match)
        except ValueError:
            continue
        if normalized not in unique_matches:
            unique_matches.append(normalized)

    if len(unique_matches) == 1:
        return unique_matches[0]
    if len(unique_matches) > 1:
        raise ValueError(f"Multiple IP addresses found in '{raw_value}'")
    raise ValueError(f"Invalid IP address '{raw_value}'. Use a valid IPv4 or IPv6 format.")


def apply_device_import_fields(device: Device, item: dict, *, nvr_id: str | None = None) -> None:
    vendor = normalize_vendor(item["vendor"])
    device.name = item["device_name"]
    device.site_id = item["site_id"]
    device.nvr_id = nvr_id
    device.device_type = DeviceType(item["device_type"])
    device.ip_address = item["ip_address"]
    device.port = item["port"]
    device.rtsp_port = item["rtsp_port"]
    device.username = item["username"]
    device.password = item["password"]
    device.rtsp_mode = item["rtsp_mode"].value
    device.rtsp_stream_type = item["rtsp_stream_type"].value
    device.rtsp_url = build_rtsp_url(
        device_type=device.device_type,
        ip_address=item["ip_address"],
        rtsp_port=item["rtsp_port"],
        username=item["username"],
        password=item["password"],
        vendor=vendor,
        rtsp_stream_type=item["rtsp_stream_type"],
        rtsp_mode=item["rtsp_mode"],
        rtsp_url=item["rtsp_url"],
    )
    device.vendor = vendor
    device.model = item["model"]
    device.channel_count = item["channel_count"]
    device.channels_used = item["channels_used"]
    device.notes = item["notes"]
    device.status = device.status or DeviceStatus.unknown
    device.is_active = True


@router.post("/import", response_model=ImportLogOut)
async def import_devices_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted")

    content = await file.read()
    try:
        df = pd.read_csv(io.StringIO(content.decode("utf-8-sig")))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {str(e)}")

    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

    columns = set(df.columns)
    standard_format = is_standard_hub_format(columns)
    missing = (STANDARD_REQUIRED_COLS if standard_format else REQUIRED_COLS) - columns
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing columns: {missing}")

    errors = []
    success = 0
    total = len(df)

    site_cache: dict = {}
    nvr_cache: dict[tuple[str, str], str] = {}
    existing_device_cache: dict[tuple[str, str, str, int, int], Device] = {}
    pending_rows = []

    for idx, row in df.iterrows():
        row_num = idx + 2  # 1-indexed + header
        try:
            if standard_format:
                site_name = cell_value(row, "hub_name")
                device_name = cell_value(row, "nvr_name")
                device_type_str = "nvr"
                ip_address = cell_value(row, "public_static_ip_address")
            else:
                site_name = cell_value(row, "site_name")
                device_name = cell_value(row, "device_name")
                device_type_str = cell_value(row, "device_type").lower()
                ip_address = cell_value(row, "ip_address")

            if not site_name:
                errors.append(f"Row {row_num}: Empty required field")
                continue

            if not standard_format and (not device_name or not ip_address):
                errors.append(f"Row {row_num}: Empty required field")
                continue

            if device_name and device_type_str not in VALID_TYPES:
                errors.append(f"Row {row_num}: Invalid device_type '{device_type_str}'")
                continue

            if site_name not in site_cache:
                site_result = await db.execute(select(Site).where(Site.name == site_name))
                site = site_result.scalar_one_or_none()
                if not site:
                    site = Site(
                        name=site_name,
                        address=cell_value(row, "address") or None,
                        city=cell_value(row, "city") or None,
                        contact_name=cell_value(row, "contact_person_name") or None,
                        contact_phone=cell_value(row, "contact_number") or None,
                        is_active=True,
                    )
                    db.add(site)
                    await db.flush()
                else:
                    site.is_active = True
                    if standard_format:
                        site.address = site.address or (cell_value(row, "address") or None)
                        site.city = site.city or (cell_value(row, "city") or None)
                        site.contact_name = site.contact_name or (cell_value(row, "contact_person_name") or None)
                        site.contact_phone = site.contact_phone or (cell_value(row, "contact_number") or None)
                site_cache[site_name] = site.id

            notes = build_standard_notes(
                zone=cell_value(row, "zone"),
                hub_code=cell_value(row, "hub_code"),
            ) if standard_format else None

            has_device_payload = bool(device_name and ip_address)
            if has_device_payload:
                try:
                    ip_address = normalize_ip_cell(ip_address)
                except ValueError as exc:
                    errors.append(f"Row {row_num}: {str(exc)}")
                    continue
            elif standard_format:
                success += 1
                continue

            pending_rows.append(
                {
                    "row_num": row_num,
                    "site_name": site_name,
                    "site_id": site_cache[site_name],
                    "device_name": device_name,
                    "device_type": device_type_str,
                    "ip_address": ip_address,
                    "port": parse_int(cell_value(row, "http_port") or cell_value(row, "port"), 80),
                    "rtsp_port": parse_int(cell_value(row, "rtsp_port"), 554),
                    "username": cell_value(row, "username") or cell_value(row, "user_name") or None,
                    "password": cell_value(row, "password") or None,
                    "rtsp_mode": parse_rtsp_mode(cell_value(row, "rtsp_mode"), cell_value(row, "rtsp_url")),
                    "rtsp_stream_type": parse_rtsp_stream_type(cell_value(row, "stream_type") or cell_value(row, "rtsp_stream_type")),
                    "rtsp_url": cell_value(row, "rtsp_url") or None,
                    "vendor": cell_value(row, "vendor") or cell_value(row, "nvr/dvr_brand") or None,
                    "model": cell_value(row, "model") or None,
                    "nvr_name": cell_value(row, "nvr_name"),
                    "channel_count": parse_channel_count(cell_value(row, "channel_capacity_of_nvr")),
                    "channels_used": parse_channel_count(
                        cell_value(row, "channels_used") or cell_value(row, "number_of_cameras_connected")
                    ),
                    "notes": notes,
                }
            )

        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")

    site_ids = set(site_cache.values())
    if site_ids:
        existing_devices = await db.execute(
            select(Device).where(Device.site_id.in_(site_ids))
        )
        for existing in existing_devices.scalars().all():
            key = device_identity_key(
                site_id=existing.site_id,
                device_type=existing.device_type.value,
                ip_address=existing.ip_address,
                port=existing.port,
                rtsp_port=existing.rtsp_port,
            )
            existing_device_cache[key] = existing
            if existing.device_type == DeviceType.nvr:
                nvr_cache[(existing.site_id, existing.name)] = existing.id

    for item in pending_rows:
        if item["device_type"] != "nvr":
            continue
        try:
            key = device_identity_key(
                site_id=item["site_id"],
                device_type=item["device_type"],
                ip_address=item["ip_address"],
                port=item["port"],
                rtsp_port=item["rtsp_port"],
            )
            device = existing_device_cache.get(key) or Device(status=DeviceStatus.unknown)
            apply_device_import_fields(device, item)
            device.is_active = True
            if not device.id:
                db.add(device)
            await db.flush()
            existing_device_cache[key] = device
            nvr_cache[(item["site_id"], item["device_name"])] = device.id
            success += 1
        except Exception as e:
            errors.append(f"Row {item['row_num']}: {str(e)}")

    for item in pending_rows:
        if item["device_type"] != "camera":
            continue
        try:
            nvr_id = None
            if item["nvr_name"]:
                nvr_id = nvr_cache.get((item["site_id"], item["nvr_name"]))
                if not nvr_id:
                    errors.append(
                        f"Row {item['row_num']}: Linked NVR '{item['nvr_name']}' not found in site '{item['site_name']}'"
                    )
                    continue

            key = device_identity_key(
                site_id=item["site_id"],
                device_type=item["device_type"],
                ip_address=item["ip_address"],
                port=item["port"],
                rtsp_port=item["rtsp_port"],
            )
            device = existing_device_cache.get(key) or Device(status=DeviceStatus.unknown)
            apply_device_import_fields(device, item, nvr_id=nvr_id)
            device.is_active = True
            if not device.id:
                db.add(device)
            await db.flush()
            existing_device_cache[key] = device
            success += 1
        except Exception as e:
            errors.append(f"Row {item['row_num']}: {str(e)}")

    log = ImportLog(
        filename=file.filename,
        total_rows=total,
        success_rows=success,
        failed_rows=total - success,
        errors=json.dumps(errors) if errors else None,
        imported_by=current_user.id,
    )
    db.add(log)
    await db.flush()
    await db.refresh(log)

    return ImportLogOut.model_validate(log)


@router.get("/import/history", response_model=List[ImportLogOut])
async def import_history(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    result = await db.execute(
        select(ImportLog).order_by(ImportLog.created_at.desc()).limit(50)
    )
    return [ImportLogOut.model_validate(r) for r in result.scalars().all()]


@router.get("/import/template")
async def get_csv_template():
    """Return example CSV content."""
    from fastapi.responses import Response
    sample = (
        "Zone,Hub Code,Hub Name,Address,State,City,Pin Code,Contact Person Name,Contact Number,NVR Name,Public Static IP Address,HTTP Port,RTSP Port,RTSP Stream Type,User Name,Password,NVR/DVR Brand,Channel Capacity of NVR,Number of cameras connected,Channels Used,Channels Unused,HTTP,RTSP\n"
        "North,DLH001,Delhi HO,Plot 12 Industrial Area,Delhi,Delhi,110001,Rahul Sharma,9876543210,NVR-Delhi-01,103.211.205.11,83,554,main,admin,cars24@2024,Hikvision,16,12,12,4,Pass,Pass\n"
        "West,PUN001,Pune Hub,Warehouse 4 MIDC,Maharashtra,Pune,411045,Neha Patil,9898989898,NVR-Pune-01,103.1.100.5,80,554,main,admin,Secure@123,Dahua,32,24,24,8,Pass,Pass\n"
    )
    return Response(content=sample, media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=device_import_template.csv"})
