import asyncio
import logging
from typing import Optional, List, Dict, Any
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import Device

logger = logging.getLogger("discovery")


async def ping_single(ip: str) -> bool:
    try:
        proc = await asyncio.create_subprocess_exec(
            "ping", "-c", "1", "-W", "2", ip,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.communicate(), timeout=5)
        return proc.returncode == 0
    except Exception:
        return False


async def try_onvif_discovery(
    ip: str,
) -> Dict[str, Any]:
    """Attempt ONVIF GetDeviceInformation."""
    try:
        from onvif import ONVIFCamera
        cam = ONVIFCamera(ip, 80, "admin", "admin123")
        await asyncio.wait_for(asyncio.get_running_loop().run_in_executor(None, cam.update_xaddrs), timeout=5)
        device_service = cam.create_devicemgmt_service()
        info = device_service.GetDeviceInformation()
        return {
            "vendor": info.Manufacturer,
            "model": info.Model,
            "serial_number": info.SerialNumber,
            "firmware_version": info.FirmwareVersion,
        }
    except Exception as e:
        logger.debug(f"ONVIF failed for {ip}: {e}")
        return {}


async def try_hikvision_api(ip: str, username: str = "admin", password: str = "admin123") -> Dict[str, Any]:
    """Try Hikvision ISAPI."""
    url = f"http://{ip}/ISAPI/System/deviceInfo"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(url, auth=(username, password))
            if resp.status_code == 200:
                import xml.etree.ElementTree as ET
                root = ET.fromstring(resp.text)
                ns = {"h": "http://www.hikvision.com/ver20/XMLSchema"}
                return {
                    "vendor": "Hikvision",
                    "model": root.findtext(".//h:model", namespaces=ns) or root.findtext("model"),
                    "serial_number": root.findtext(".//h:serialNumber", namespaces=ns) or root.findtext("serialNumber"),
                    "firmware_version": root.findtext(".//h:firmwareVersion", namespaces=ns) or root.findtext("firmwareVersion"),
                }
    except Exception as e:
        logger.debug(f"Hikvision API failed for {ip}: {e}")
    return {}


async def try_dahua_api(ip: str, username: str = "admin", password: str = "admin123") -> Dict[str, Any]:
    """Try Dahua HTTP API."""
    url = f"http://{ip}/cgi-bin/magicBox.cgi?action=getDeviceType"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(url, auth=(username, password))
            if resp.status_code == 200:
                return {
                    "vendor": "Dahua",
                    "model": resp.text.strip().replace("type=", ""),
                }
    except Exception as e:
        logger.debug(f"Dahua API failed for {ip}: {e}")
    return {}


async def try_snmp(ip: str) -> Dict[str, Any]:
    """SNMP sysDescr walk."""
    try:
        from pysnmp.hlapi.asyncio import getCmd, SnmpEngine, CommunityData, UdpTransportTarget, ContextData, ObjectType, ObjectIdentity
        engine = SnmpEngine()
        errorIndication, errorStatus, errorIndex, varBinds = await getCmd(
            engine,
            CommunityData("public"),
            await UdpTransportTarget.create((ip, 161), timeout=3, retries=0),
            ContextData(),
            ObjectType(ObjectIdentity("SNMPv2-MIB", "sysDescr", 0)),
        )
        if not errorIndication and not errorStatus:
            descr = str(varBinds[0][1])
            return {"snmp_description": descr}
    except Exception as e:
        logger.debug(f"SNMP failed for {ip}: {e}")
    return {}


async def discover_device(ip: str, device_id: Optional[str] = None, db: Optional[AsyncSession] = None) -> Dict[str, Any]:
    """
    Full discovery chain:
    1. Ping
    2. ONVIF
    3. Hikvision API
    4. Dahua API
    5. SNMP
    """
    result: Dict[str, Any] = {"ip": ip, "reachable": False}

    alive = await ping_single(ip)
    result["reachable"] = alive
    if not alive:
        return result

    # Try discovery methods in order, merge results
    info: Dict[str, Any] = {}

    onvif_info = await try_onvif_discovery(ip)
    if onvif_info:
        info.update(onvif_info)
        info["discovery_method"] = "onvif"

    if not info.get("vendor"):
        hik_info = await try_hikvision_api(ip)
        if hik_info:
            info.update({k: v for k, v in hik_info.items() if v})
            info["discovery_method"] = "hikvision_api"

    if not info.get("vendor"):
        dah_info = await try_dahua_api(ip)
        if dah_info:
            info.update({k: v for k, v in dah_info.items() if v})
            info["discovery_method"] = "dahua_api"

    if not info.get("vendor"):
        snmp_info = await try_snmp(ip)
        if snmp_info:
            info.update(snmp_info)
            info["discovery_method"] = "snmp"

    result.update(info)

    # Update device record if id provided
    if device_id and db:
        dev_result = await db.execute(select(Device).where(Device.id == device_id))
        device = dev_result.scalar_one_or_none()
        if device:
            if info.get("vendor") and not device.vendor:
                device.vendor = info["vendor"]
            if info.get("model") and not device.model:
                device.model = info["model"]
            if info.get("serial_number") and not device.serial_number:
                device.serial_number = info["serial_number"]
            if info.get("firmware_version") and not device.firmware_version:
                device.firmware_version = info["firmware_version"]
            await db.commit()

    return result


async def scan_subnet_for_hosts(subnet: str) -> List[str]:
    """Ping-scan all IPs in a /24 subnet."""
    import ipaddress
    try:
        network = ipaddress.ip_network(subnet, strict=False)
    except ValueError:
        return []

    hosts = [str(h) for h in network.hosts()]
    BATCH = 50
    live = []

    async def check(ip):
        if await ping_single(ip):
            live.append(ip)

    for i in range(0, len(hosts), BATCH):
        batch = hosts[i:i + BATCH]
        await asyncio.gather(*[check(ip) for ip in batch])

    return sorted(live)
