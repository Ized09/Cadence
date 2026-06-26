"""Cadence backend regression tests."""
import os
import time
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://voice-first-publish.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

UNIQUE = uuid.uuid4().hex[:8]
EMAIL = f"test_{UNIQUE}@cadence.dev"
PASSWORD = os.environ.get("CADENCE_TEST_PASSWORD", "password123")
NAME = "Cadence Tester"

SAMPLE_1 = (
    "Most pricing pages are theatre. They promise tiers and outcomes but really they're "
    "asking the buyer to decide for the seller. After fifteen years of designing them, "
    "I think the better move is to make a single decision visible: which of three buckets "
    "you're optimizing for — speed, certainty, or scope. Everything else is consequence. "
    "If you can't articulate the bucket out loud, you don't have a price; you have a wish. "
    "Pick the bucket, then negotiate the constraints, not the number."
)
SAMPLE_2 = (
    "The hardest part of consulting is not the work — it's the silence after you send the proposal. "
    "I used to fill it with follow-ups and discounts. Then I noticed the clients who eventually said yes "
    "were almost never the ones I'd chased. Silence is a signal, not an emergency. Sit with it. "
    "Re-read the proposal once, fix the one sentence you keep tripping over, and move on. "
    "The right clients return. The wrong ones rescue you from a bad fit you couldn't see yet."
)

state = {}


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- auth ----------
def test_register(session):
    r = session.post(f"{API}/auth/register", json={"email": EMAIL, "password": PASSWORD, "name": NAME})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and isinstance(data["token"], str)
    assert data["user"]["email"] == EMAIL
    assert not data["user"]["onboarded"]
    # cookie set
    assert "session_token" in r.cookies or any(c.name == "session_token" for c in session.cookies)
    state["token"] = data["token"]
    state["user_id"] = data["user"]["user_id"]
    session.headers.update({"Authorization": f"Bearer {data['token']}"})


def test_login(session):
    s2 = requests.Session()
    s2.headers.update({"Content-Type": "application/json"})
    r = s2.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data
    assert data["user"]["email"] == EMAIL


def test_me(session):
    r = session.get(f"{API}/auth/me")
    assert r.status_code == 200, r.text
    assert r.json()["email"] == EMAIL


def test_me_cookie_only(session):
    """/auth/me must work with only session_token cookie (no Authorization header)."""
    cookie_val = None
    for c in session.cookies:
        if c.name == "session_token":
            cookie_val = c.value
            break
    assert cookie_val, "session_token cookie should be set after register"
    r = requests.get(
        f"{API}/auth/me",
        cookies={"session_token": cookie_val},
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["email"] == EMAIL


# ---------- voice samples ----------
def test_add_voice_samples(session):
    for txt in [SAMPLE_1, SAMPLE_2]:
        r = session.post(f"{API}/voice/samples", json={"source_type": "paste", "raw_text": txt})
        assert r.status_code == 200, r.text
        assert r.json()["raw_text"].startswith(txt[:20])
    r = session.get(f"{API}/voice/samples")
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 2


# ---------- voice profile generation (claude) ----------
def test_generate_voice_profile(session):
    r = session.post(
        f"{API}/voice/profile/generate",
        json={"audience_note": "I write about pricing, consulting, and the silent emotional parts of running a small expert practice."},
        timeout=120,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "style_summary" in data and len(data["style_summary"]) > 200
    state["style_summary"] = data["style_summary"]
    # verify onboarded flipped
    me = session.get(f"{API}/auth/me").json()
    assert me["onboarded"] is True  # boolean identity check intentional — value is exact `True`


def test_refine_voice_profile(session):
    r = session.post(f"{API}/voice/profile/refine", json={"instruction": "less corporate, more direct"}, timeout=90)
    assert r.status_code == 200, r.text
    new_sum = r.json()["style_summary"]
    assert new_sum and new_sum != state.get("style_summary")


def test_patch_voice_profile(session):
    r = session.patch(f"{API}/voice/profile", json={"style_summary": "Hand-edited summary that is at least twenty characters."})
    assert r.status_code == 200
    assert r.json()["style_summary"].startswith("Hand-edited")


# ---------- drafts ----------
def test_create_and_list_drafts(session):
    r = session.post(f"{API}/drafts", json={"title": "First draft", "body": "Some body"})
    assert r.status_code == 200, r.text
    state["draft_id"] = r.json()["id"]
    r = session.get(f"{API}/drafts")
    assert r.status_code == 200
    assert any(d["id"] == state["draft_id"] for d in r.json())


def test_get_and_patch_draft(session):
    did = state["draft_id"]
    r = session.get(f"{API}/drafts/{did}")
    assert r.status_code == 200
    r = session.patch(f"{API}/drafts/{did}", json={"title": "First draft revised", "body": "Edited body"})
    assert r.status_code == 200
    assert r.json()["title"] == "First draft revised"


# ---------- SSE chat ----------
def test_chat_stream_and_draft_block(session):
    did = state["draft_id"]
    headers = dict(session.headers)
    headers["Accept"] = "text/event-stream"
    msg = "Draft a 200-word post about why most pricing advice is too abstract for solo consultants. Use my voice. Emit it as a draft."
    with requests.post(f"{API}/drafts/{did}/chat", json={"message": msg}, headers=headers, stream=True, timeout=120) as r:
        assert r.status_code == 200
        got_delta = False
        got_done = False
        for line in r.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data:"):
                continue
            import json as _j
            payload = _j.loads(line[5:].strip())
            if payload.get("delta"):
                got_delta = True
            if payload.get("done"):
                got_done = True
                break
        assert got_delta and got_done


# ---------- publish targets ----------
def test_publish_target_upsert_and_mask(session):
    r = session.put(f"{API}/publish-targets", json={
        "type": "sanity",
        "project_id": "abc12345",
        "dataset": "production",
        "api_token": "skTest_" + "x" * 40,
        "document_type": "post",
    })
    assert r.status_code == 200
    r = session.get(f"{API}/publish-targets")
    assert r.status_code == 200
    body = r.json()
    assert "api_token" not in body
    assert "api_token_masked" in body


def test_publish_without_target_then_with(session):
    # delete the user's target to force the "no target" branch
    # (no delete endpoint — use direct PUT with empty project_id is invalid; use a new draft against current target)
    did = state["draft_id"]
    r = session.post(f"{API}/drafts/{did}/publish")
    # current target has a fake project — Sanity will reject
    assert r.status_code in (400, 502)


# ---------- reminders ----------
def test_schedule_and_process_reminder(session):
    did = state["draft_id"]
    past = (datetime.now(timezone.utc) - timedelta(seconds=5)).isoformat()
    r = session.post(f"{API}/drafts/{did}/reminder", json={"scheduled_for": past, "channel": "email"})
    assert r.status_code == 200, r.text
    r = session.get(f"{API}/reminders")
    assert any(rr["draft_id"] == did for rr in r.json())
    r = session.post(f"{API}/reminders/process")
    assert r.status_code == 200
    assert r.json()["processed"] >= 1


# ---------- cleanup ----------
def test_delete_draft(session):
    did = state["draft_id"]
    r = session.delete(f"{API}/drafts/{did}")
    assert r.status_code == 200
