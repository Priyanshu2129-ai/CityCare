# CityCare Hospital - Contact Form Email Server

A small, secure **Node.js + Express + Nodemailer** backend that powers the Contact Us form on the CityCare Hospital Management System. It receives enquiries from the website, emails them to the hospital's admin inbox, and persists a copy server-side.

## Setup

```bash
cd server
cp .env.example .env     # then edit .env with real credentials
npm install
npm start
```

The server listens on `http://localhost:3000` by default (change `PORT` in `.env`).

## Configuration (server/.env)

All secrets live only in `server/.env`, which is git-ignored. They are **never** exposed to the frontend.

Use one of two transports:

- **Generic SMTP**: set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`.
- **Gmail**: leave `SMTP_HOST` blank and set `GMAIL_USER` and `GMAIL_APP_PASSWORD` (an **App Password**, not your account password).

Set `ADMIN_EMAIL` to the address that should receive enquiries.

## Endpoints

| Method | Path             | Purpose                                                      |
|--------|------------------|--------------------------------------------------------------|
| GET    | `/api/health`    | Reports whether email is configured (`emailConfigured`)      |
| POST   | `/api/contact`   | Validates + sends an enquiry email; persists a copy          |

`POST /api/contact` body: `{ name, email, phone, subject, message }`.

- `200 { ok:true, id }` – email sent successfully.
- `400 { ok:false, errors }` – validation failed.
- `503 { ok:false, savedLocally:true, error:'MAIL_NOT_CONFIGURED' }` – email not configured.
- `500 { ok:false, savedLocally:true, error:'SEND_FAILED' }` – provider rejected the request.

Sent enquiries are also appended to `server/data/enquiries.json` so the hospital keeps a record independent of the visitor's browser.

## Notes

- The frontend post `js/modules/contact.js` calls this server and **only shows success after the server confirms the email was sent**. If the server is down or email is not configured, the visitor sees a clear message (and their enquiry is still saved locally in the website's localStorage).
- `CORS_ORIGIN` should be your frontend origin (default `http://localhost:58023`). Lock it down in production.