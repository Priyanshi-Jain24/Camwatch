import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import NotificationLog

logger = logging.getLogger("notifications")

DEFAULT_CHANNEL = settings.DEFAULT_NOTIFICATION_CHANNEL.lower() or "email"
SUPPORTED_CHANNELS = {"whatsapp", "email", "sms", "teams", "slack", "console"}

# Delivery-retry policy (post-creation; does NOT affect alert generation).
MAX_DELIVERY_ATTEMPTS = 6
RETRY_BASE_SECONDS = 60
RETRY_MAX_SECONDS = 1800


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _next_retry_at(attempts: int) -> datetime:
    """Exponential backoff capped at RETRY_MAX_SECONDS (1,2,4,8,16,30m...)."""
    delay = min(RETRY_BASE_SECONDS * (2 ** max(attempts - 1, 0)), RETRY_MAX_SECONDS)
    return _utcnow() + timedelta(seconds=delay)


@dataclass
class DeliveryResult:
    status: str
    error: Optional[str] = None


class NotificationProvider(ABC):
    channel: str

    @abstractmethod
    async def send(self, *, recipient: str, message: str, subject: Optional[str] = None) -> DeliveryResult:
        """Send a notification and return provider delivery status."""


class LoggingProvider(NotificationProvider):
    def __init__(self, channel: str):
        self.channel = channel

    async def send(self, *, recipient: str, message: str, subject: Optional[str] = None) -> DeliveryResult:
        logger.info("Notification [%s] to %s [%s]: %s", self.channel, recipient, subject or "no subject", message)
        return DeliveryResult(status="logged")


class EmailProvider(NotificationProvider):
    channel = "email"

    def _is_sendgrid_configured(self) -> bool:
        return bool(settings.SENDGRID_API_KEY and settings.SENDGRID_FROM_EMAIL)

    def _resolve_smtp_settings(self) -> dict[str, object]:
        host = settings.SMTP_HOST or settings.MAIL_SERVER
        port = settings.SMTP_PORT or settings.MAIL_PORT or 587
        username = settings.SMTP_USERNAME or settings.MAIL_USERNAME
        password = settings.SMTP_PASSWORD or settings.MAIL_PASSWORD
        from_email = settings.SMTP_FROM or settings.MAIL_FROM
        enabled = settings.SMTP_ENABLED or bool(settings.SMTP_HOST)
        return {
            "enabled": enabled,
            "host": host,
            "port": port,
            "username": username,
            "password": password,
            "from_email": from_email,
        }

    def _is_smtp_configured(self) -> bool:
        smtp = self._resolve_smtp_settings()
        return bool(smtp["enabled"] and smtp["host"] and smtp["from_email"] and smtp["username"] and smtp["password"])

    async def send(self, *, recipient: str, message: str, subject: Optional[str] = None) -> DeliveryResult:
        if self._is_smtp_configured():
            return await self._send_via_smtp(recipient=recipient, message=message, subject=subject)

        if self._is_sendgrid_configured():
            return await self._send_via_sendgrid(recipient=recipient, message=message, subject=subject)

        logger.warning(
            "EMAIL NOT SENT — falling back to log; SMTP/SendGrid not configured in this process. to=%s subject=%s",
            recipient,
            subject or "CamWatch Alert",
        )
        return DeliveryResult(status="logged")

    async def _send_via_sendgrid(self, *, recipient: str, message: str, subject: Optional[str] = None) -> DeliveryResult:
        try:
            import httpx

            payload = {
                "personalizations": [{"to": [{"email": recipient}]}],
                "from": {
                    "email": settings.SENDGRID_FROM_EMAIL,
                    "name": settings.SENDGRID_FROM_NAME or settings.MAIL_FROM_NAME or "CamWatch",
                },
                "subject": subject or "CamWatch Alert",
                "content": [{"type": "text/plain", "value": message}],
            }
            headers = {
                "Authorization": f"Bearer {settings.SENDGRID_API_KEY}",
                "Content-Type": "application/json",
            }
            async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT) as client:
                response = await client.post(
                    "https://api.sendgrid.com/v3/mail/send",
                    json=payload,
                    headers=headers,
                )
            if 200 <= response.status_code < 300:
                return DeliveryResult(status="sent")
            error = f"SendGrid status {response.status_code}: {response.text[:250]}"
            logger.error("SendGrid email failed to %s with status %s: %s", recipient, response.status_code, response.text)
            return DeliveryResult(status="failed", error=error)
        except Exception as e:
            logger.exception("SendGrid email failed to %s: %s", recipient, e)
            return DeliveryResult(status="failed", error=str(e))

    async def _send_via_smtp(self, *, recipient: str, message: str, subject: Optional[str] = None) -> DeliveryResult:
        try:
            from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType

            smtp = self._resolve_smtp_settings()
            conf = ConnectionConfig(
                MAIL_USERNAME=smtp["username"],
                MAIL_PASSWORD=smtp["password"],
                MAIL_FROM=smtp["from_email"],
                MAIL_PORT=smtp["port"],
                MAIL_SERVER=smtp["host"],
                MAIL_FROM_NAME=settings.MAIL_FROM_NAME,
                MAIL_STARTTLS=True,
                MAIL_SSL_TLS=False,
                USE_CREDENTIALS=True,
                VALIDATE_CERTS=settings.MAIL_VALIDATE_CERTS,
            )
            email = MessageSchema(
                subject=subject or "CamWatch Alert",
                recipients=[recipient],
                body=message,
                subtype=MessageType.plain,
            )
            await FastMail(conf).send_message(email)
            return DeliveryResult(status="sent")
        except Exception as e:
            logger.exception("SMTP email failed to %s: %s", recipient, e)
            return DeliveryResult(status="failed", error=str(e))


class WhatsAppProvider(NotificationProvider):
    channel = "whatsapp"

    async def send(self, *, recipient: str, message: str, subject: Optional[str] = None) -> DeliveryResult:
        provider_name = (settings.WHATSAPP_PROVIDER or "log").lower()

        if provider_name == "meta" and settings.META_WHATSAPP_TOKEN and settings.META_WHATSAPP_PHONE_NUMBER_ID:
            return await self._send_meta(recipient=recipient, message=message)
        if provider_name == "twilio" and settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN:
            return await self._send_twilio(recipient=recipient, message=message)
        if provider_name == "gupshup" and settings.GUPSHUP_API_KEY:
            return await self._send_gupshup(recipient=recipient, message=message)
        if provider_name == "interakt" and settings.INTERAKT_API_KEY:
            return await self._send_interakt(recipient=recipient, message=message)

        logger.info(
            "WhatsApp notification logged because provider credentials are unavailable [%s] to %s: %s",
            provider_name,
            recipient,
            message,
        )
        return DeliveryResult(status="logged")

    async def _send_meta(self, *, recipient: str, message: str) -> DeliveryResult:
        logger.info("Meta WhatsApp provider configured; outbound API integration pending for %s", recipient)
        return DeliveryResult(status="logged")

    async def _send_twilio(self, *, recipient: str, message: str) -> DeliveryResult:
        logger.info("Twilio WhatsApp provider configured; outbound API integration pending for %s", recipient)
        return DeliveryResult(status="logged")

    async def _send_gupshup(self, *, recipient: str, message: str) -> DeliveryResult:
        logger.info("Gupshup WhatsApp provider configured; outbound API integration pending for %s", recipient)
        return DeliveryResult(status="logged")

    async def _send_interakt(self, *, recipient: str, message: str) -> DeliveryResult:
        logger.info("Interakt WhatsApp provider configured; outbound API integration pending for %s", recipient)
        return DeliveryResult(status="logged")


def get_provider(channel: str) -> NotificationProvider:
    normalized = (channel or DEFAULT_CHANNEL).lower()
    if normalized == "email":
        return EmailProvider()
    if normalized == "whatsapp":
        return WhatsAppProvider()
    if normalized in SUPPORTED_CHANNELS:
        return LoggingProvider(normalized)
    raise ValueError(f"Unsupported notification channel: {channel}")


async def send_email(*, to_email: str, subject: str, body: str) -> DeliveryResult:
    provider = EmailProvider()
    return await provider.send(recipient=to_email, message=body, subject=subject)


async def send_notification(
    db: AsyncSession,
    *,
    channel: str = DEFAULT_CHANNEL,
    recipient: str,
    message: str,
    subject: Optional[str] = None,
    alert_id: Optional[str] = None,
) -> NotificationLog:
    provider = get_provider(channel)
    result = await provider.send(recipient=recipient, message=message, subject=subject)
    log = NotificationLog(
        alert_id=alert_id,
        channel=provider.channel,
        recipient=recipient,
        subject=subject,
        message=message,
        status=result.status,
        delivery_error=result.error,
        attempts=1,
        sent_at=_utcnow(),
    )
    if result.status == "failed":
        # Real send error (SMTP/Gmail hiccup, transient network). The alert
        # already exists; queue this notification so the redrive job retries it
        # instead of silently dropping the only notification to the recipient.
        log.status = "pending"
        log.next_attempt_at = _next_retry_at(1)
        logger.warning(
            "Email delivery FAILED for to=%s subject=%s — queued for retry (attempt 1/%s). error=%s",
            recipient, subject or "CamWatch Alert", MAX_DELIVERY_ATTEMPTS, result.error,
        )
    db.add(log)
    return log


async def redrive_pending_notifications(db: AsyncSession, *, batch_size: int = 200) -> dict:
    """Re-attempt delivery of notifications left in 'pending' by a failed send.

    Runs out-of-band (scheduler job) so SMTP latency never blocks device checks.
    Only touches go-forward 'pending' rows — never the historical 'logged'/'failed'
    backlog. Does NOT create, modify, or suppress any alert."""
    now = _utcnow()
    result = await db.execute(
        select(NotificationLog)
        .where(
            NotificationLog.status == "pending",
            NotificationLog.attempts < MAX_DELIVERY_ATTEMPTS,
            or_(NotificationLog.next_attempt_at.is_(None), NotificationLog.next_attempt_at <= now),
        )
        .order_by(NotificationLog.next_attempt_at.asc())
        .limit(batch_size)
    )
    rows = list(result.scalars().all())
    delivered = 0
    exhausted = 0
    for log in rows:
        try:
            provider = get_provider(log.channel)
            attempt = await provider.send(recipient=log.recipient, message=log.message, subject=log.subject)
        except Exception as e:  # unknown channel / provider crash — treat as a failed attempt
            attempt = DeliveryResult(status="failed", error=str(e))

        log.attempts = (log.attempts or 0) + 1
        if attempt.status == "sent":
            log.status = "sent"
            log.delivery_error = None
            log.next_attempt_at = None
            log.sent_at = _utcnow()
            delivered += 1
        else:
            log.delivery_error = attempt.error or f"provider returned status={attempt.status}"
            if log.attempts >= MAX_DELIVERY_ATTEMPTS:
                log.status = "failed"
                log.next_attempt_at = None
                exhausted += 1
                logger.error(
                    "Notification PERMANENTLY FAILED after %s attempts: to=%s subject=%s error=%s",
                    log.attempts, log.recipient, log.subject or "CamWatch Alert", log.delivery_error,
                )
            else:
                log.next_attempt_at = _next_retry_at(log.attempts)

    if rows:
        logger.info(
            "Notification redrive: %s due, %s delivered, %s exhausted, %s still pending",
            len(rows), delivered, exhausted, len(rows) - delivered - exhausted,
        )
    return {"due": len(rows), "delivered": delivered, "exhausted": exhausted}
