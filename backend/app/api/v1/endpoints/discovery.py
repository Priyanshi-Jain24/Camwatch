from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.db.session import get_db
from app.api.deps import get_current_admin
from app.services.discovery import discover_device

router = APIRouter()


@router.post("/discover")
async def trigger_discovery(
    ip_address: str,
    device_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    """
    Attempt to auto-discover device info (vendor, model, serial, firmware)
    via ONVIF, vendor API, and SNMP.
    """
    result = await discover_device(ip_address, device_id, db)
    return result


@router.post("/scan-subnet")
async def scan_subnet(
    subnet: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    """Ping-scan a subnet (e.g. 192.168.1.0/24) and return live hosts."""
    from app.services.discovery import scan_subnet_for_hosts
    hosts = await scan_subnet_for_hosts(subnet)
    return {"subnet": subnet, "live_hosts": hosts, "count": len(hosts)}
