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
PASSWORD = "password123"
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
    assert data["user"]["onboarded"] is False
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
    assert me["onboarded"] is True


def test_refine_voice_profile(session):
    r = session.post(f"{API}/voice/profile/refine", json={"instruction": "less corporate, more direct"}, timeout=90)
    assert r.status_code == 200, r.text
    new_sum = r.json()["style_summary"]
    assert new_sum and new_sum != state.get("style_summary")


def test_patch_voice_profile(session):
    new_text = "Manual override summary — five sections in prose. " * 10
    r = session.patch(f"{API}/voice/profile", json={"style_summary": new_text})
    assert r.status_code == 200, r.text
    assert r.json()["style_summary"].startswith("Manual override")


# ---------- drafts CRUD ----------
def test_drafts_crud(session):
    # create
    r = session.post(f"{API}/drafts", json={"title": "TEST_draft", "body": "initial body", "seed_note": "test note"})
    assert r.status_code == 200, r.text
    d = r.json()
    state["draft_id"] = d["id"]
    assert d["status"] == "drafting"

    # list
    r = session.get(f"{API}/drafts")
    assert r.status_code == 200 and any(x["id"] == state["draft_id"] for x in r.json())

    # get
    r = session.get(f"{API}/drafts/{state['draft_id']}")
    assert r.status_code == 200 and r.json()["title"] == "TEST_draft"

    # patch
    r = session.patch(f"{API}/drafts/{state['draft_id']}", json={"title": "TEST_updated", "body": "updated body"})
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "TEST_updated"


def test_draft_chat_sse(session):
    """SSE: must stream delta lines and end with done:true."""
    url = f"{API}/drafts/{state['draft_id']}/chat"
    headers = {"Authorization": session.headers["Authorization"], "Content-Type": "application/json"}
    delta_count = 0
    done_seen = False
    with requests.post(url, json={"message": "Give me a 3-sentence opener for a post on pricing as theatre, then put a <draft> tag with TITLE and a 4-sentence body."}, headers=headers, stream=True, timeout=120) as r:
        assert r.status_code == 200, r.text
        for line in r.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data:"):
                continue
            import json as _j
            payload = _j.loads(line[5:].strip())
            if "delta" in payload:
                delta_count += 1
            if payload.get("done"):
                done_seen = True
                break
    assert delta_count > 0, "no delta chunks streamed"
    assert done_seen, "no done:true sentinel"


# ---------- publish targets ----------
def test_publish_target_upsert_and_get(session):
    r = session.put(
        f"{API}/publish-targets",
        json={"type": "sanity", "project_id": "fakeproject", "dataset": "production", "api_token": "sk_fake_token_123456", "document_type": "post"},
    )
    assert r.status_code == 200, r.text
    r = session.get(f"{API}/publish-targets")
    assert r.status_code == 200
    t = r.json()
    assert t.get("project_id") == "fakeproject"
    assert "api_token_masked" in t and "api_token" not in t
    assert "•••" in t["api_token_masked"]


# ---------- publish ----------
def test_publish_no_target_then_fake_target(session):
    # Create a fresh draft to publish against
    r = session.post(f"{API}/drafts", json={"title": "TEST_publish_draft", "body": "body for publish"})
    pid = r.json()["id"]
    state["publish_draft_id"] = pid

    # Remove publish target via direct put with empty? Instead test the previously-configured fake target -> 502
    r = session.post(f"{API}/drafts/{pid}/publish")
    # Either 400 (no target) or 502 (fake target rejected) is acceptable per spec; assert NOT 500
    assert r.status_code in (400, 502), f"unexpected status {r.status_code}: {r.text}"


# ---------- reminders ----------
def test_schedule_reminder_and_list(session):
    past = (datetime.now(timezone.utc) - timedelta(seconds=5)).isoformat()
    r = session.post(f"{API}/drafts/{state['draft_id']}/reminder", json={"scheduled_for": past, "channel": "email"})
    assert r.status_code == 200, r.text
    state["reminder_id"] = r.json()["id"]

    # draft status -> ready
    d = session.get(f"{API}/drafts/{state['draft_id']}").json()
    assert d["status"] == "ready"

    r = session.get(f"{API}/reminders")
    assert r.status_code == 200 and any(x["id"] == state["reminder_id"] for x in r.json())


def test_process_reminders(session):
    r = requests.post(f"{API}/reminders/process", timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["processed"] >= 1
    # verify sent_at set
    reminders = session.get(f"{API}/reminders").json()
    target = next((x for x in reminders if x["id"] == state["reminder_id"]), None)
    assert target and target.get("sent_at")


# ---------- cleanup ----------
def test_delete_draft(session):
    r = session.delete(f"{API}/drafts/{state['draft_id']}")
    assert r.status_code == 200
    r = session.get(f"{API}/drafts/{state['draft_id']}")
    assert r.status_code == 404
    # cleanup publish draft
    session.delete(f"{API}/drafts/{state.get('publish_draft_id','')}")
