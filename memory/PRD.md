# Cadence — PRD

## Original problem statement
Build a web app called Cadence — a content co-pilot for coaches, consultants, and independent experts who already have a personal blog or portfolio (Sanity, v1) but struggle to publish consistently. It learns how the user writes from past samples, helps them co-write new drafts in that voice, reminds them until a finished draft goes live, and publishes straight to their Sanity site.

## Stack decisions (deviation from spec)
- Backend: FastAPI + MongoDB + JWT (user chose 1a over Supabase).
- LLM: Claude Sonnet 4.6 via Emergent Universal LLM Key (`emergentintegrations`), streaming.
- Auth: dual — JWT email/password AND Emergent Google OAuth (user chose "both").
- Email: Resend (real key wired).
- Publish: real Sanity HTTP mutate API; per-user target stored in `publish_targets`.

## Architecture
- React (CRA + craco), tailwind, shadcn/ui — single SPA.
- Routes: `/`, `/login`, `/auth/callback`, `/onboarding` (3 steps), `/dashboard`, `/draft/:id`, `/draft/:id/review`, `/settings`.
- Backend FastAPI app at `/api/*` covering auth, voice samples, voice profile (generate/refine/edit), drafts CRUD, SSE chat for co-writing, publish-targets, publish, reminders.
- Mongo collections: `users`, `user_sessions`, `voice_samples`, `voice_profiles`, `drafts`, `chat_messages`, `publish_targets`, `reminders`.
- Co-writing model: Claude streams response in SSE; if it emits a `<draft>...</draft>` block with `TITLE:` line, backend strips that block from the chat message and replaces the draft body atomically.

## Personas
- Solo expert (designer/coach/consultant) with a Sanity blog and an audience who falls silent for weeks at a time. Busy, not confused; resents generic SaaS UI.

## Core requirements (static)
1. Onboarding: voice intake (paste/upload), audience prompt, generated style summary with plain-language refinement.
2. Dashboard with status pills (drafting/ready/published), calendar, "new draft".
3. Brainstorm + draft split screen with editable draft panel.
4. Review with publish (real Sanity) or schedule email reminder.
5. Settings to manage Sanity connection, voice profile, notifications.

## Out of scope (v1)
Push notifications, non-Sanity targets, auto-publish schedule, multi-seat, audio voice intake.

## Implemented (2026-06-25)
- All five pages with editorial dark-ink design (Fraunces / Inter / IBM Plex Mono).
- JWT email/password registration + login.
- Emergent Google OAuth callback exchange.
- Voice samples paste/upload, profile generation + plain-language refinement + direct edit.
- Drafts CRUD with autosave.
- SSE streaming Claude chat that updates draft body via `<draft>` block extraction.
- Real Sanity publish via mutate API.
- Reminder scheduling + Resend-powered email + `/reminders/process` cron endpoint.
- Calendar in dashboard with marked publish dates / scheduled nudges.

## Backlog / next
- P0: Visual edit-mode toggle inside chat to retry/regenerate just the last assistant turn.
- P1: Background scheduler (APScheduler / cron job) hitting `/reminders/process` automatically every 10 min.
- P1: Voice sample preview/expand in Settings.
- P1: Multiple connected publish targets (different document types).
- P2: Tag drafts with topic (cheaper Claude Haiku call) and group on dashboard.
- P2: Voice samples from URL fetch.
- P2: Custom Sanity field mapping in Settings.
