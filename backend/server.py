"""Cadence backend — content co-pilot for solo experts."""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Cookie, Header
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import jwt
import bcrypt
import asyncio
import json
import httpx
import resend
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta

from anthropic import Anthropic

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
CLAUDE_API_KEY = os.environ.get("CLAUDE_API_KEY")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
DEFAULT_SANITY_TOKEN = os.environ.get("DEFAULT_SANITY_TOKEN", "")

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Cadence API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("cadence")


# ---------- helpers ----------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:12]}"


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def make_jwt(user_id: str) -> str:
    payload = {"sub": user_id, "exp": now_utc() + timedelta(days=30)}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_jwt(token: str) -> Optional[str]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"]).get("sub")
    except Exception:
        return None


def _extract_token(authorization: Optional[str], session_token: Optional[str]) -> Optional[str]:
    if session_token:
        return session_token
    if authorization and authorization.lower().startswith("bearer "):
        return authorization.split(None, 1)[1].strip()
    return None


def _session_is_active(sess: dict) -> bool:
    expires_at = sess.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return bool(expires_at and expires_at >= now_utc())


async def _user_from_session_token(token: str) -> Optional[dict]:
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess or not _session_is_active(sess):
        return None
    return await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0, "password_hash": 0})


async def _user_from_jwt(token: str) -> Optional[dict]:
    uid = decode_jwt(token)
    if not uid:
        return None
    return await db.users.find_one({"user_id": uid}, {"_id": 0, "password_hash": 0})


async def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    session_token: Optional[str] = Cookie(default=None),
) -> dict:
    """Resolve current user from session_token cookie, Authorization header, or JWT."""
    token = _extract_token(authorization, session_token)
    if token:
        user = await _user_from_session_token(token) or await _user_from_jwt(token)
        if user:
            return user
    raise HTTPException(status_code=401, detail="Not authenticated")


# ---------- models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class VoiceSampleIn(BaseModel):
    source_type: Literal["paste", "upload"] = "paste"
    raw_text: str
    title: Optional[str] = None


class VoiceProfileGenIn(BaseModel):
    audience_note: Optional[str] = None  # "what do you write about and who for"


class VoiceProfileRefineIn(BaseModel):
    instruction: str  # plain language: "more direct", "less corporate"


class DraftIn(BaseModel):
    title: Optional[str] = ""
    body: Optional[str] = ""
    seed_note: Optional[str] = None  # initial brainstorm seed


class DraftUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    status: Optional[Literal["drafting", "ready", "published"]] = None


class ChatIn(BaseModel):
    message: str


class PublishTargetIn(BaseModel):
    type: Literal["sanity"] = "sanity"
    project_id: str
    dataset: str
    api_token: Optional[str] = None  # if empty, use platform default
    document_type: str = "post"


class ReminderIn(BaseModel):
    scheduled_for: datetime
    channel: Literal["email"] = "email"


# ---------- auth ----------
@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    existing = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = new_id("user_")
    doc = {
        "user_id": user_id,
        "email": body.email.lower(),
        "name": body.name or body.email.split("@")[0],
        "picture": None,
        "password_hash": hash_password(body.password),
        "plan_tier": "starter",
        "onboarded": False,
        "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(doc)
    token = make_jwt(user_id)
    response.set_cookie("session_token", token, httponly=True, secure=True, samesite="none", path="/", max_age=60 * 60 * 24 * 30)
    doc.pop("_id", None)
    return {"token": token, "user": {k: v for k, v in doc.items() if k != "password_hash"}}


@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    user = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = make_jwt(user["user_id"])
    response.set_cookie("session_token", token, httponly=True, secure=True, samesite="none", path="/", max_age=60 * 60 * 24 * 30)
    user.pop("password_hash", None)
    return {"token": token, "user": user}


async def _read_session_id(request: Request) -> Optional[str]:
    sid = request.headers.get("X-Session-ID")
    if sid:
        return sid
    try:
        body = await request.json()
        return body.get("session_id")
    except Exception:
        return None


async def _fetch_oauth_session_data(session_id: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as hc:
        r = await hc.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    return r.json()


async def _upsert_oauth_user(data: dict) -> dict:
    email = (data.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=400, detail="No email returned")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user:
        return user
    user = {
        "user_id": new_id("user_"),
        "email": email,
        "name": data.get("name") or email.split("@")[0],
        "picture": data.get("picture"),
        "password_hash": None,
        "plan_tier": "starter",
        "onboarded": False,
        "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(user)
    user.pop("_id", None)
    return user


async def _store_oauth_session(user_id: str, session_token: str) -> None:
    expires_at = now_utc() + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "created_at": now_utc().isoformat(),
        "expires_at": expires_at.isoformat(),
    })


@api.post("/auth/session")
async def session_exchange(request: Request, response: Response):
    """Exchange Emergent OAuth session_id for our session_token cookie + user."""
    session_id = await _read_session_id(request)
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing session_id")

    data = await _fetch_oauth_session_data(session_id)
    user = await _upsert_oauth_user(data)
    session_token = data["session_token"]
    await _store_oauth_session(user["user_id"], session_token)

    response.set_cookie("session_token", session_token, httponly=True, secure=True, samesite="none", path="/", max_age=60 * 60 * 24 * 7)
    user.pop("password_hash", None)
    return {"user": user}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user


@api.post("/auth/logout")
async def logout(response: Response, session_token: Optional[str] = Cookie(default=None)):
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


# ---------- voice samples ----------
@api.post("/voice/samples")
async def add_sample(body: VoiceSampleIn, user=Depends(get_current_user)):
    doc = {
        "id": new_id("vs_"),
        "user_id": user["user_id"],
        "source_type": body.source_type,
        "title": body.title or "",
        "raw_text": body.raw_text,
        "created_at": now_utc().isoformat(),
    }
    await db.voice_samples.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/voice/samples")
async def list_samples(user=Depends(get_current_user)):
    items = await db.voice_samples.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items


@api.delete("/voice/samples/{sample_id}")
async def delete_sample(sample_id: str, user=Depends(get_current_user)):
    await db.voice_samples.delete_one({"id": sample_id, "user_id": user["user_id"]})
    return {"ok": True}


# ---------- voice profile ----------
VOICE_PROFILE_SYSTEM = """You are a careful editor analyzing a writer's voice from samples they've published. Produce a tight style summary another writer or AI could use to imitate this voice faithfully.

Format the summary with these sections, in plain prose paragraphs (not bullet lists):
1. Voice in one sentence.
2. Sentence rhythm & length tendencies.
3. Diction (formal/casual register, recurring word choices, what they avoid).
4. Structural moves (how they open, how they transition, how they end).
5. Topics & frames they return to.

Be specific. Quote distinctive 2-4 word fragments from the samples where useful. Avoid generic descriptors like "engaging" or "clear" — name the actual move.
Total length: 180-260 words."""


async def _claude_summarize(samples_text: str, audience_note: Optional[str]) -> str:
    """Generate voice profile summary using Claude."""
    anthropic_client = Anthropic(api_key=CLAUDE_API_KEY)

    prompt = f"Writing samples (separated by ---):\n\n{samples_text}"
    if audience_note:
        prompt += f"\n\nWriter's note about audience & topics: {audience_note}"
    prompt += "\n\nWrite the style summary now."

    response = await asyncio.to_thread(
        anthropic_client.messages.create,
        model="claude-sonnet-4-5",
        max_tokens=1024,
        system=VOICE_PROFILE_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text.strip()


@api.post("/voice/profile/generate")
async def generate_profile(body: VoiceProfileGenIn, user=Depends(get_current_user)):
    samples = await db.voice_samples.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(50)
    if not samples:
        raise HTTPException(status_code=400, detail="Add at least one writing sample first")

    joined = "\n\n---\n\n".join(s["raw_text"] for s in samples)[:60000]
    summary = await _claude_summarize(joined, body.audience_note)

    profile = {
        "id": new_id("vp_"),
        "user_id": user["user_id"],
        "style_summary": summary,
        "audience_note": body.audience_note or "",
        "sample_ids": [s["id"] for s in samples],
        "last_updated": now_utc().isoformat(),
    }
    await db.voice_profiles.replace_one({"user_id": user["user_id"]}, profile, upsert=True)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"onboarded": True}})
    profile.pop("_id", None)
    return profile


@api.post("/voice/profile/refine")
async def refine_profile(body: VoiceProfileRefineIn, user=Depends(get_current_user)):
    profile = await db.voice_profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=400, detail="No voice profile yet")

    anthropic_client = Anthropic(api_key=CLAUDE_API_KEY)

    prompt = f"Current style summary:\n\n{profile['style_summary']}\n\nFeedback: {body.instruction}\n\nRewrite the summary applying this feedback. Keep the same five-section format and roughly the same length."
    response = await asyncio.to_thread(
        anthropic_client.messages.create,
        model="claude-sonnet-4-5",
        max_tokens=1024,
        system="You revise a writer's style-summary based on plain-language feedback. Output ONLY the revised summary (no preamble).",
        messages=[{"role": "user", "content": prompt}],
    )
    new_summary = response.content[0].text.strip()

    profile["style_summary"] = new_summary
    profile["last_updated"] = now_utc().isoformat()
    await db.voice_profiles.replace_one({"user_id": user["user_id"]}, profile)
    return profile


@api.get("/voice/profile")
async def get_profile(user=Depends(get_current_user)):
    profile = await db.voice_profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return profile or {}


@api.patch("/voice/profile")
async def update_profile_text(body: dict, user=Depends(get_current_user)):
    summary = body.get("style_summary")
    if not summary:
        raise HTTPException(status_code=400, detail="style_summary required")
    profile = await db.voice_profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="No voice profile")
    profile["style_summary"] = summary
    profile["last_updated"] = now_utc().isoformat()
    await db.voice_profiles.replace_one({"user_id": user["user_id"]}, profile)
    return profile


# ---------- drafts ----------
@api.post("/drafts")
async def create_draft(body: DraftIn, user=Depends(get_current_user)):
    doc = {
        "id": new_id("d_"),
        "user_id": user["user_id"],
        "title": body.title or "Untitled draft",
        "body": body.body or "",
        "seed_note": body.seed_note or "",
        "status": "drafting",
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
        "published_at": None,
        "published_doc_id": None,
    }
    await db.drafts.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/drafts")
async def list_drafts(user=Depends(get_current_user)):
    items = await db.drafts.find({"user_id": user["user_id"]}, {"_id": 0}).sort("updated_at", -1).to_list(200)
    return items


@api.get("/drafts/{draft_id}")
async def get_draft(draft_id: str, user=Depends(get_current_user)):
    draft = await db.drafts.find_one({"id": draft_id, "user_id": user["user_id"]}, {"_id": 0})
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    return draft


@api.patch("/drafts/{draft_id}")
async def update_draft(draft_id: str, body: DraftUpdate, user=Depends(get_current_user)):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    update["updated_at"] = now_utc().isoformat()
    res = await db.drafts.find_one_and_update(
        {"id": draft_id, "user_id": user["user_id"]},
        {"$set": update},
        return_document=True,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Draft not found")
    res.pop("_id", None)
    return res


@api.delete("/drafts/{draft_id}")
async def delete_draft(draft_id: str, user=Depends(get_current_user)):
    await db.drafts.delete_one({"id": draft_id, "user_id": user["user_id"]})
    await db.chat_messages.delete_many({"draft_id": draft_id})
    await db.reminders.delete_many({"draft_id": draft_id})
    return {"ok": True}


# ---------- chat / brainstorm ----------
def _build_chat_system(style_summary: Optional[str], current_body: str) -> str:
    base = """You are Cadence — a writing partner for a solo expert (designer, consultant, coach). You help them brainstorm angles and co-write blog posts in THEIR voice.

How you work:
- Take their topic, note, or question and propose 2-3 specific angles before drafting.
- When drafting, write in their style summary below — match rhythm, diction, structural moves.
- Be conversational in chat ("Want me to push harder on the contrarian angle?"), but write polished prose in drafts.
- When you produce or revise a draft, emit it inside <draft>...</draft> tags. Everything outside the tags is chat. Only emit <draft> when you have actually drafted or revised body content.
- Inside <draft>, include a leading line "TITLE: ..." then a blank line, then the body. The whole tag block replaces the current draft body.
- Never apologize for length. Never use generic SaaS phrases. Write like an editor who knows the writer.
"""
    style = f"\n\nWRITER'S STYLE SUMMARY:\n{style_summary or '(none yet — write neutral, clean prose)'}\n"
    cur = f"\nCURRENT DRAFT BODY (may be empty):\n---\n{current_body or '(empty)'}\n---\n"
    return base + style + cur


def _extract_draft_block(text: str) -> Optional[dict]:
    """Find <draft>...</draft> and parse TITLE: line + body."""
    import re
    m = re.search(r"<draft>([\s\S]*?)</draft>", text, re.IGNORECASE)
    if not m:
        return None
    block = m.group(1).strip()
    title = None
    body = block
    lines = block.split("\n", 2)
    if lines and lines[0].lower().startswith("title:"):
        title = lines[0].split(":", 1)[1].strip()
        body = "\n".join(lines[1:]).strip()
    return {"title": title, "body": body}


@api.get("/drafts/{draft_id}/messages")
async def get_messages(draft_id: str, user=Depends(get_current_user)):
    draft = await db.drafts.find_one({"id": draft_id, "user_id": user["user_id"]}, {"_id": 0})
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    msgs = await db.chat_messages.find({"draft_id": draft_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return msgs


import re as _re


async def _save_user_message(draft_id: str, content: str) -> None:
    await db.chat_messages.insert_one({
        "id": new_id("m_"),
        "draft_id": draft_id,
        "role": "user",
        "content": content,
        "created_at": now_utc().isoformat(),
    })


async def _apply_draft_block(draft_id: str, draft_block: dict) -> None:
    update = {"updated_at": now_utc().isoformat()}
    if draft_block.get("title"):
        update["title"] = draft_block["title"]
    if draft_block.get("body"):
        update["body"] = draft_block["body"]
    await db.drafts.update_one({"id": draft_id}, {"$set": update})


async def _persist_assistant_message(draft_id: str, visible_chat: str, produced_draft: bool) -> None:
    await db.chat_messages.insert_one({
        "id": new_id("m_"),
        "draft_id": draft_id,
        "role": "assistant",
        "content": visible_chat or "(updated the draft)",
        "produced_draft": produced_draft,
        "created_at": now_utc().isoformat(),
    })


@api.post("/drafts/{draft_id}/chat")
async def chat(draft_id: str, body: ChatIn, user=Depends(get_current_user)):
    """Stream Claude response via SSE. After stream, extract <draft> block, update draft body."""
    draft = await db.drafts.find_one({"id": draft_id, "user_id": user["user_id"]}, {"_id": 0})
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    profile = await db.voice_profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    style_summary = profile.get("style_summary") if profile else None
    system_msg = _build_chat_system(style_summary, draft.get("body", ""))

    await _save_user_message(draft_id, body.message)

    anthropic_client = Anthropic(api_key=CLAUDE_API_KEY)

    # Build conversation history from stored messages for context
    stored_msgs = await db.chat_messages.find({"draft_id": draft_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    conversation: list = []
    for m in stored_msgs:
        role = m.get("role")
        if role in ("user", "assistant"):
            conversation.append({"role": role, "content": m["content"]})

    async def event_gen():
        full = []
        queue: asyncio.Queue = asyncio.Queue()

        def _stream_in_thread():
            try:
                with anthropic_client.messages.stream(
                    model="claude-sonnet-4-5",
                    max_tokens=4096,
                    system=system_msg,
                    messages=conversation,
                ) as stream:
                    for text in stream.text_stream:
                        queue.put_nowait(("delta", text))
                queue.put_nowait(("done", None))
            except Exception as exc:
                queue.put_nowait(("error", str(exc)))

        loop = asyncio.get_event_loop()
        thread_future = loop.run_in_executor(None, _stream_in_thread)

        try:
            while True:
                kind, value = await queue.get()
                if kind == "delta":
                    full.append(value)
                    yield f"data: {json.dumps({'delta': value})}\n\n"
                elif kind == "done":
                    break
                elif kind == "error":
                    logger.error("chat stream failed: %s", value)
                    yield f"data: {json.dumps({'error': value})}\n\n"
                    break
        except Exception as e:
            logger.exception("chat stream failed")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

        await thread_future

        full_text = "".join(full)
        draft_block = _extract_draft_block(full_text)
        visible_chat = full_text
        if draft_block:
            visible_chat = _re.sub(r"<draft>[\s\S]*?</draft>", "", full_text, flags=_re.IGNORECASE).strip()
            await _apply_draft_block(draft_id, draft_block)

        await _persist_assistant_message(draft_id, visible_chat, bool(draft_block))

        payload = {"done": True, "produced_draft": bool(draft_block)}
        if draft_block:
            payload["draft_title"] = draft_block.get("title")
            payload["draft_body"] = draft_block.get("body")
        yield f"data: {json.dumps(payload)}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


# ---------- publish targets ----------
@api.get("/publish-targets")
async def get_publish_target(user=Depends(get_current_user)):
    t = await db.publish_targets.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not t:
        return {}
    # mask token
    if t.get("api_token"):
        t["api_token_masked"] = t["api_token"][:4] + "•••" + t["api_token"][-4:]
        t.pop("api_token")
    return t


@api.put("/publish-targets")
async def upsert_publish_target(body: PublishTargetIn, user=Depends(get_current_user)):
    existing = await db.publish_targets.find_one({"user_id": user["user_id"]}, {"_id": 0})
    token_to_store = body.api_token or (existing.get("api_token") if existing else "") or DEFAULT_SANITY_TOKEN
    doc = {
        "id": existing["id"] if existing else new_id("pt_"),
        "user_id": user["user_id"],
        "type": body.type,
        "project_id": body.project_id,
        "dataset": body.dataset,
        "api_token": token_to_store,
        "document_type": body.document_type,
        "updated_at": now_utc().isoformat(),
    }
    await db.publish_targets.replace_one({"user_id": user["user_id"]}, doc, upsert=True)
    return {"ok": True, "configured": bool(doc["project_id"] and doc["dataset"] and doc["api_token"])}


# ---------- publish ----------
@api.post("/drafts/{draft_id}/publish")
async def publish_draft(draft_id: str, user=Depends(get_current_user)):
    draft = await db.drafts.find_one({"id": draft_id, "user_id": user["user_id"]}, {"_id": 0})
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    target = await db.publish_targets.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not target or not target.get("project_id") or not target.get("dataset") or not target.get("api_token"):
        raise HTTPException(status_code=400, detail="Connect your Sanity project in Settings first")

    project_id = target["project_id"]
    dataset = target["dataset"]
    api_token = target["api_token"]
    doc_type = target.get("document_type") or "post"

    sanity_url = f"https://{project_id}.api.sanity.io/v2023-01-01/data/mutate/{dataset}"
    sanity_doc_id = new_id("cadence_")
    # Sanity body — title + body as portable-text-ish single block (simple string for v1)
    mutation = {
        "mutations": [{
            "create": {
                "_id": sanity_doc_id,
                "_type": doc_type,
                "title": draft["title"],
                "body": draft["body"],
                "publishedAt": now_utc().isoformat(),
                "source": "cadence",
            }
        }]
    }
    headers = {"Authorization": f"Bearer {api_token}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=20) as hc:
        r = await hc.post(sanity_url, json=mutation, headers=headers)
    if r.status_code != 200:
        logger.warning("sanity publish failed: %s %s", r.status_code, r.text[:500])
        raise HTTPException(status_code=502, detail=f"Sanity rejected publish: {r.text[:300]}")

    await db.drafts.update_one(
        {"id": draft_id},
        {"$set": {
            "status": "published",
            "published_at": now_utc().isoformat(),
            "published_doc_id": sanity_doc_id,
            "updated_at": now_utc().isoformat(),
        }}
    )
    return {"ok": True, "sanity_document_id": sanity_doc_id}


# ---------- reminders ----------
@api.post("/drafts/{draft_id}/reminder")
async def schedule_reminder(draft_id: str, body: ReminderIn, user=Depends(get_current_user)):
    draft = await db.drafts.find_one({"id": draft_id, "user_id": user["user_id"]}, {"_id": 0})
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    scheduled = body.scheduled_for
    if scheduled.tzinfo is None:
        scheduled = scheduled.replace(tzinfo=timezone.utc)
    doc = {
        "id": new_id("r_"),
        "draft_id": draft_id,
        "user_id": user["user_id"],
        "channel": body.channel,
        "scheduled_for": scheduled.isoformat(),
        "sent_at": None,
        "created_at": now_utc().isoformat(),
    }
    await db.reminders.insert_one(doc)
    await db.drafts.update_one({"id": draft_id}, {"$set": {"status": "ready", "updated_at": now_utc().isoformat()}})
    doc.pop("_id", None)
    return doc


@api.get("/reminders")
async def list_reminders(user=Depends(get_current_user)):
    items = await db.reminders.find({"user_id": user["user_id"]}, {"_id": 0}).sort("scheduled_for", 1).to_list(200)
    return items


async def _send_reminder_email(user_email: str, draft_title: str, draft_id: str) -> Optional[str]:
    if not RESEND_API_KEY:
        logger.info("RESEND_API_KEY missing — would send reminder for draft %s", draft_id)
        return None
    html = f"""
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#161B22;padding:32px 0;font-family:Inter,Arial,sans-serif;color:#F3EFE6;">
      <tr><td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#1E2530;border:1px solid #262E3A;border-radius:8px;padding:32px;">
          <tr><td>
            <p style="font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#8FAF9A;margin:0 0 16px;">CADENCE · REMINDER</p>
            <h1 style="font-family:'Fraunces',Georgia,serif;font-weight:400;font-size:26px;line-height:1.2;margin:0 0 16px;color:#F3EFE6;">You have a draft waiting.</h1>
            <p style="font-size:15px;line-height:1.6;color:#F3EFE6;margin:0 0 12px;">{draft_title}</p>
            <p style="font-size:14px;line-height:1.6;color:#A1A1AA;margin:0 0 24px;">It was ready to publish — still is. Open it and click "Publish to site" when you're done re-reading.</p>
            <a href="#" style="display:inline-block;background:#D9714B;color:#161B22;text-decoration:none;font-weight:500;padding:10px 18px;border-radius:8px;">Open draft</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
    """
    params = {"from": SENDER_EMAIL, "to": [user_email], "subject": f"Draft waiting: {draft_title}", "html": html}
    try:
        res = await asyncio.to_thread(resend.Emails.send, params)
        return res.get("id") if isinstance(res, dict) else None
    except Exception as e:
        logger.exception("resend send failed: %s", e)
        return None


@api.post("/reminders/process")
async def process_due_reminders():
    """Cron-style trigger. Finds due reminders for unpublished drafts and emails them."""
    now_iso = now_utc().isoformat()
    due = await db.reminders.find({"sent_at": None, "scheduled_for": {"$lte": now_iso}}, {"_id": 0}).to_list(200)
    sent = 0
    for r in due:
        draft = await db.drafts.find_one({"id": r["draft_id"]}, {"_id": 0})
        if not draft or draft.get("status") == "published":
            await db.reminders.update_one({"id": r["id"]}, {"$set": {"sent_at": now_utc().isoformat(), "skipped": True}})
            continue
        user = await db.users.find_one({"user_id": r["user_id"]}, {"_id": 0})
        if not user:
            continue
        email_id = await _send_reminder_email(user["email"], draft["title"], draft["id"])
        await db.reminders.update_one({"id": r["id"]}, {"$set": {"sent_at": now_utc().isoformat(), "email_id": email_id}})
        sent += 1
    return {"processed": len(due), "sent": sent}


# ---------- mount + cors ----------
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
