from pydantic_settings import BaseSettings
from typing import List, Any
import json


class Settings(BaseSettings):
    DATABASE_URL: str
    SYNC_DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 720

    FIRST_SUPERUSER_EMAIL: str = "admin@camwatch.com"
    FIRST_SUPERUSER_PASSWORD: str = "admin123"

    BACKEND_CORS_ORIGINS: Any = '["http://localhost:3000","http://localhost:5173","https://camwatch-fli3.vercel.app"]'

    def get_cors_origins(self) -> List[str]:
        if isinstance(self.BACKEND_CORS_ORIGINS, str):
            return json.loads(self.BACKEND_CORS_ORIGINS)
        return self.BACKEND_CORS_ORIGINS

    # Monitoring intervals (seconds)
    PING_INTERVAL_SECONDS: int = 60
    RTSP_INTERVAL_SECONDS: int = 300
    API_HEALTH_INTERVAL_SECONDS: int = 300

    PING_TIMEOUT: float = 3.0
    RTSP_TIMEOUT: float = 10.0
    HTTP_TIMEOUT: float = 8.0

    DEFAULT_NOTIFICATION_CHANNEL: str = "email"

    MAIL_USERNAME: str = ""
    MAIL_PASSWORD: str = ""
    MAIL_FROM: str = ""
    MAIL_PORT: int = 587
    MAIL_SERVER: str = ""
    MAIL_FROM_NAME: str = "CamWatch"
    MAIL_STARTTLS: bool = True
    MAIL_SSL_TLS: bool = False
    MAIL_VALIDATE_CERTS: bool = True
    ALERT_EMAIL_RECIPIENTS: str = ""
    SENDGRID_API_KEY: str = ""
    SENDGRID_FROM_EMAIL: str = ""
    SENDGRID_FROM_NAME: str = "CamWatch"
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    SMTP_ENABLED: bool = False

    WHATSAPP_PROVIDER: str = "log"

    META_WHATSAPP_TOKEN: str = ""
    META_WHATSAPP_PHONE_NUMBER_ID: str = ""

    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_WHATSAPP_FROM: str = ""

    GUPSHUP_API_KEY: str = ""
    GUPSHUP_SOURCE_NUMBER: str = ""

    INTERAKT_API_KEY: str = ""

    GOOGLE_SSO_ENABLED: bool = False
    GOOGLE_CLIENT_ID: str = ""
    RUN_SCHEDULER: bool = False
    RUN_DB_INIT: bool = True

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
