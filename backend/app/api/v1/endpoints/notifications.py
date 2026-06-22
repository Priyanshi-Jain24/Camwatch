from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.models import User
from app.schemas import TestEmailRequest, TestEmailResponse
from app.services.notifications import send_notification

router = APIRouter()


@router.post("/test-email", response_model=TestEmailResponse, status_code=status.HTTP_200_OK)
async def send_test_email(
    payload: TestEmailRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    subject = "CamWatch Demo Test Email"
    body = (
        "This is a CamWatch demo test email.\n\n"
        "If you received this message, Gmail SMTP email delivery is working.\n\n"
        f"Triggered by: {current_user.email}"
    )
    log = await send_notification(
        db,
        channel="email",
        recipient=str(payload.to_email),
        subject=subject,
        message=body,
        alert_id=None,
    )
    await db.commit()
    return TestEmailResponse(
        success=log.status == "sent",
        status=log.status,
        detail=(
            "Test email sent successfully."
            if log.status == "sent"
            else "Email delivery failed or fell back to logging."
        ),
        delivery_error=log.delivery_error,
    )
