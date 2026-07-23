# Cadence

Cadence is a content co‑pilot for solo experts — coaches, consultants, and independent creators — that helps you capture voice, brainstorm angles, co‑write drafts in your voice, and publish to a Sanity blog. It pairs a React SPA (editor + dashboard) with a FastAPI backend that streams Claude responses for collaborative drafting, stores voice profiles and drafts in MongoDB, and can send reminder emails via Resend.

## Key features
- Onboard with writing samples (paste/upload) and generate a compact voice profile you can refine.
- Create, autosave, and manage drafts with status (drafting / ready / published).
- Chat-driven co‑writing with streaming LLM responses (SSE); assistant can output an atomic <draft>...</draft> block that replaces draft text.
- Publish drafts directly to Sanity via the HTTP mutate API.
- Schedule email reminders for drafts; a cron endpoint processes due reminders and sends mail via Resend.
- JWT + email/password auth and optional Emergent Google OAuth exchange.

## Stack
- Language(s): JavaScript (frontend), Python (backend)
- Frontend: Create React App (craco) + Tailwind + shadcn/ui patterns
- Backend: FastAPI + Motor (async MongoDB driver)
- LLM integration: Claude Sonnet (via Emergent LLM integrations), streaming chat (SSE)
- Mail: Resend
- Publish: Sanity HTTP mutate API
- DB: MongoDB

## What’s in the repo (top level)
- backend/         — FastAPI app (server.py) + requirements.txt
- frontend/        — Create React App SPA (src, public, package.json, craco)
- memory/          — PRD and product notes (memory/PRD.md)
- tests/           — test stubs
- test_reports/    — test artifacts and reports
- design_guidelines.json — design tokens / guidelines

## Quickstart — local development

Prerequisites
- Python 3.10+ (or compatible)
- Node 18+ / Yarn or npm
- MongoDB accessible (URI)
- Sanity project (optional for publish testing)
- Emergent LLM API key (for Claude streaming) — optional for offline dev
- Resend API key (optional; reminders will be logged if missing)

Common environment variables (backend)
- MONGO_URL — MongoDB connection string
- DB_NAME — database name
- JWT_SECRET — signing secret for JWT sessions
- EMERGENT_LLM_KEY — Emergent LLM key (used for Claude calls)
- RESEND_API_KEY — Resend API key for emails (optional)
- SENDER_EMAIL — from address used for reminder emails (default: onboarding@resend.dev)
- DEFAULT_SANITY_TOKEN — optional fallback token for Sanity publishes
- CORS_ORIGINS — comma-separated list of allowed origins (default: *)

Run the backend
```bash
# from repo root
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# set environment variables (export or .env file in backend/)
# then run
uvicorn backend.server:app --reload --port 8000
```

Run the frontend
```bash
cd frontend
# using yarn (packageManager is yarn) or npm
yarn install
yarn start
# or with npm:
# npm install
# npm start
```

Build for production
```bash
# frontend
cd frontend
yarn build

# backend: run with an ASGI server (uvicorn/gunicorn) and proper env vars
```

## API surface (high-level)
The backend mounts under `/api`. Important routes:
- POST /api/auth/register — register (email/password)
- POST /api/auth/login — login (returns token + session cookie)
- POST /api/auth/session — exchange Emergent OAuth session for session token
- POST /api/auth/logout — logout
- GET /api/auth/me — current user

Voice and profile management
- POST /api/voice/samples — add sample (paste/upload)
- GET /api/voice/samples — list samples
- POST /api/voice/profile/generate — generate profile from samples
- POST /api/voice/profile/refine — refine profile with plain text instructions
- GET /api/voice/profile — get profile

Drafts & co‑writing
- POST /api/drafts — create draft
- GET /api/drafts — list drafts
- GET /api/drafts/{id} — fetch draft
- PATCH /api/drafts/{id} — update draft
- DELETE /api/drafts/{id} — delete draft
- POST /api/drafts/{id}/chat — stream LLM chat (SSE) for brainstorming / drafting
- GET /api/drafts/{id}/messages — get chat history for a draft

Publish & reminders
- PUT /api/publish-targets — configure Sanity target
- POST /api/drafts/{id}/publish — publish draft to Sanity
- POST /api/drafts/{id}/reminder — schedule reminder
- POST /api/reminders/process — process/send due reminders (cron endpoint)

Behavior note: When the LLM emits content wrapped in <draft>...</draft> (with a leading "TITLE: ..." line), the backend will atomically replace the draft body with that block and store the assistant message separately.

## Design & UX
The product uses a dark editorial style (Fraunces serif for titles, Inter for UI, IBM Plex Mono for microcopy). The frontend uses shadcn/ui patterns and Radix components with Tailwind for layout and theming.

## Development notes & testing
- Backend tests: minimal stubs exist under tests/
- Use the backend `/reminders/process` endpoint to manually trigger reminder processing in development; if RESEND_API_KEY is missing the system logs the action instead of sending.
- LLM streaming requires the Emergent key; without it the chat/draft flows will not stream real LLM responses.

## Deployment
- Typical deployment: host frontend on a static host (Vercel/Netlify), backend as an ASGI app (Uvicorn + Gunicorn) with proper env vars, and ensure CORS_ORIGINS includes frontend origin.
- Ensure MongoDB is provisioned and SANITY_TOKEN / RESEND_API_KEY are set for full functionality.

## Contributing
- Open issues for bugs and feature requests.
- Prefer small focused PRs for UI/UX and API changes.
- Run frontend eslint and backend linters before PRs; include tests where helpful.

## License
No license
