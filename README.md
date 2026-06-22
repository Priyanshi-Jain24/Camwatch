# CamWatch - CCTV & NVR Monitoring Platform

Production-ready platform to monitor IP cameras and NVRs across multiple sites.

## Quick Start (Docker)

```bash
git clone <repo>
cd camwatch
docker-compose up --build
```

- Frontend: http://localhost
- API:      http://localhost:8000
- API Docs: http://localhost:8000/docs

Default login: `admin@camwatch.com` / `admin123`

---

## Project Structure

```text
camwatch/
|-- backend/
|   |-- app/
|   |   |-- api/v1/endpoints/    # FastAPI route handlers
|   |   |-- core/                # Config, security
|   |   |-- db/                  # Session, init
|   |   |-- models/              # SQLAlchemy ORM models
|   |   |-- schemas/             # Pydantic schemas
|   |   |-- services/            # Monitoring, discovery, notifications
|   |   `-- workers/             # Monitor engine, scheduler
|   |-- requirements.txt
|   `-- Dockerfile
|-- frontend/
|   |-- src/
|   |   |-- api/                 # Axios client + service functions
|   |   |-- components/          # Layout + shared UI
|   |   |-- pages/               # Route pages
|   |   |-- store/               # Zustand auth store
|   |   |-- types/               # TypeScript interfaces
|   |   `-- utils/               # Helpers
|   |-- Dockerfile
|   `-- nginx.conf
`-- docker-compose.yml
```

---

## Features

### Phase 1 - Foundation
- FastAPI backend with JWT authentication
- Google SSO login path mapped onto existing CamWatch roles
- PostgreSQL database with SQLAlchemy ORM
- React + TypeScript + Tailwind frontend
- Docker Compose deployment

### Phase 2 - Device Management
- Sites CRUD
- Cameras CRUD
- NVRs CRUD
- Full device inventory (IP, credentials, vendor, model, serial, firmware)

### Phase 3 - CSV Import
- Drag and drop CSV upload
- Auto-creates sites if missing
- Import history logs
- Downloadable template

### Phase 4 - Monitoring Engine
- ICMP ping check (every 60s)
- RTSP stream check via `ffprobe`
- HTTP/API health check for NVRs
- Automatic online/offline state transitions
- Downtime tracking

### Phase 5 - Device Discovery
- ONVIF auto-discovery
- Hikvision ISAPI
- Dahua API
- SNMP fallback
- Subnet scanner

### Phase 6 - Alerting
- Camera and NVR failure alerts after 3 consecutive failures
- Separate alert types for ping, RTSP, NVR HTTP/API, and NVR recording checks
- States: Open -> Acknowledged -> Recovered -> Resolved
- One-click acknowledge and human-only resolve
- Gmail SMTP / SendGrid-ready email delivery with logged fallback

### Phase 7 - Dashboard
- Total Cameras / Online / Offline / Total NVRs
- Area Status bars
- Critical Alerts feed
- Offline Cameras list
- Critical NVRs list
- Auto-refreshes every 30s

### Phase 8 - Device Details
- Camera detail: all fields, ping/RTSP status, last seen, recent checks, open alerts
- NVR detail: all fields, ping/API status, recent checks

### Phase 9 - Reports
- Daily / Weekly / Monthly uptime
- Per-device uptime percent, downtime, check counts
- Bar chart visualization

---

## Environment Variables (Backend)

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | required | Async PostgreSQL URL |
| `SYNC_DATABASE_URL` | required | Sync PostgreSQL URL used by initialization |
| `SECRET_KEY` | required | JWT signing key |
| `ALGORITHM` | `HS256` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | JWT lifetime |
| `FIRST_SUPERUSER_EMAIL` | `admin@camwatch.com` | Seed admin email |
| `FIRST_SUPERUSER_PASSWORD` | `admin123` | Seed admin password |
| `PING_INTERVAL_SECONDS` | `60` | How often to ping all devices |
| `RTSP_INTERVAL_SECONDS` | `300` | RTSP check interval |
| `API_HEALTH_INTERVAL_SECONDS` | `300` | API health check interval |
| `PING_TIMEOUT` | `3.0` | Ping timeout |
| `RTSP_TIMEOUT` | `10.0` | RTSP timeout |
| `HTTP_TIMEOUT` | `8.0` | HTTP timeout |
| `DEFAULT_NOTIFICATION_CHANNEL` | `email` | Default channel for alert creation, escalation, recovery, and resolution |
| `ALERT_EMAIL_RECIPIENTS` | optional | Optional comma-separated global alert recipients |
| `SENDGRID_API_KEY` | optional | SendGrid API key used for real alert email delivery |
| `SENDGRID_FROM_EMAIL` | optional | Verified sender email used by SendGrid |
| `SENDGRID_FROM_NAME` | `CamWatch` | Sender display name used by SendGrid |
| `SMTP_ENABLED` | `false` | Enables SMTP email delivery for demo mode |
| `SMTP_HOST` | optional | SMTP server hostname, for Gmail use `smtp.gmail.com` |
| `SMTP_PORT` | `587` | SMTP port, for Gmail use `587` |
| `SMTP_USERNAME` | optional | SMTP username, usually the Gmail address |
| `SMTP_PASSWORD` | optional | SMTP password, for Gmail use an App Password |
| `SMTP_FROM` | optional | Sender email address used by SMTP |
| `MAIL_USERNAME` | optional | SMTP username, optional fallback when not using SendGrid |
| `MAIL_PASSWORD` | optional | SMTP password, optional fallback when not using SendGrid |
| `MAIL_FROM` | optional | Sender email address for SMTP-based alerts |
| `MAIL_PORT` | `587` | SMTP port |
| `MAIL_SERVER` | optional | SMTP server hostname |
| `MAIL_FROM_NAME` | `CamWatch` | SMTP sender display name |
| `MAIL_STARTTLS` | `true` | Enable STARTTLS |
| `MAIL_SSL_TLS` | `false` | Enable SSL/TLS from connection start |
| `MAIL_VALIDATE_CERTS` | `true` | Validate SMTP TLS certificates |
| `GOOGLE_SSO_ENABLED` | `false` | Enables Google SSO on the login page |
| `GOOGLE_CLIENT_ID` | optional | Google OAuth client ID used for frontend sign-in and backend verification |
| `WHATSAPP_PROVIDER` | `log` | WhatsApp provider selector: `log`, `meta`, `twilio`, `gupshup`, `interakt` |
| `META_WHATSAPP_TOKEN` | optional | Meta WhatsApp Business API token |
| `META_WHATSAPP_PHONE_NUMBER_ID` | optional | Meta WhatsApp phone number ID |
| `TWILIO_ACCOUNT_SID` | optional | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | optional | Twilio auth token |
| `TWILIO_WHATSAPP_FROM` | optional | Twilio WhatsApp sender |
| `GUPSHUP_API_KEY` | optional | Gupshup API key |
| `GUPSHUP_SOURCE_NUMBER` | optional | Gupshup source number |
| `INTERAKT_API_KEY` | optional | Interakt API key |

### Email Alert Behavior

- Camera and NVR alerts are created after 3 consecutive failed checks.
- Ping failure emails are sent when the ping alert is created, re-opened after recovery, escalated, recovered, or resolved.
- Recipients are resolved from `ALERT_EMAIL_RECIPIENTS`, then site `contact_email`, then regional head/manager fields only if they contain email addresses.
- If no valid recipient exists, CamWatch falls back to `FIRST_SUPERUSER_EMAIL`.
- If `SMTP_ENABLED=true` and Gmail SMTP settings are present, CamWatch sends real email using SMTP with STARTTLS on port `587`.
- If SMTP is not enabled/configured but SendGrid is configured, CamWatch can still use SendGrid.
- If neither SendGrid nor SMTP is configured, notifications are still written to the notification log and backend logs through the same provider abstraction.
- SMTP failures are logged and stored on the notification log entry without crashing the monitoring scheduler.

### Gmail SMTP Demo Setup

1. Create or use a Gmail account for demo notifications.
2. Enable Google 2-Step Verification on that account.
3. Generate a Gmail App Password. Do not use the normal Gmail password.
4. Set these backend environment variables:

```env
SMTP_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-demo@gmail.com
SMTP_PASSWORD=your-16-char-app-password
SMTP_FROM=your-demo@gmail.com
```

5. Restart the backend:

```bash
docker compose up -d --build api monitor
```

6. Send a test email:

```bash
curl -X POST http://localhost:8000/api/v1/notifications/test-email \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d "{\"to_email\":\"test@example.com\"}"
```

7. If SMTP is unavailable or credentials are missing, CamWatch will continue logging notifications instead of crashing.

### Google SSO Behavior

- Google SSO is optional and controlled by `GOOGLE_SSO_ENABLED`.
- The frontend loads the configured Google client ID from `/api/v1/auth/google/config`.
- Google sign-in only succeeds for users whose email already exists in the CamWatch user table.
- After Google credential verification, CamWatch issues its normal JWT and keeps using the same `ADMIN` and `USER` roles.

---

## Local Development

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# Set DATABASE_URL and other settings in .env
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev   # runs on http://localhost:5173
```

---

## CSV Import Format

```csv
site_name,device_name,device_type,ip_address,username,password,rtsp_url,vendor,model
Delhi HQ,Gate Cam 01,camera,192.168.1.101,admin,admin123,rtsp://192.168.1.101/stream1,Hikvision,DS-2CD2143G2-I
Delhi HQ,NVR-01,nvr,192.168.1.200,admin,admin123,,Hikvision,DS-7608NI-K2
Mumbai Branch,Reception Cam,camera,192.168.2.101,admin,pass,,Dahua,IPC-HDW2831T-AS
```
