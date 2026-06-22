from fastapi import APIRouter
from app.api.v1.endpoints import auth, sites, devices, alerts, dashboard, imports, reports, discovery, users, notifications

api_router = APIRouter()

api_router.include_router(auth.router,      prefix="/auth",      tags=["auth"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(sites.router,     prefix="/sites",     tags=["sites"])
api_router.include_router(devices.router,   prefix="/devices",   tags=["devices"])
api_router.include_router(alerts.router,    prefix="/alerts",    tags=["alerts"])
api_router.include_router(imports.router,   prefix="/devices",   tags=["import"])
api_router.include_router(reports.router,   prefix="/reports",   tags=["reports"])
api_router.include_router(discovery.router, prefix="/discovery", tags=["discovery"])
api_router.include_router(users.router,     prefix="/users",     tags=["users"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
