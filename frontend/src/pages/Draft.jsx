import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import Nav from "@/components/Nav";
import { toast } from "sonner";
import { ChevronLeft, Eye } from "lucide-react";

import api from "@/lib/api";
import useDraft from "@/pages/draft/useDraft";
import useChatStream from "@/pages/draft/useChatStream";
import ChatPanel from "@/pages/draft/ChatPanel";
import DraftPanel from "@/pages/draft/DraftPanel";

const SAVE_DEBOUNCE_MS = 700;

function useAutosave(id, draft, title, body, bodyDirty, setBodyDirty) {
  useEffect(() => {
    if (!draft || !bodyDirty) return undefined;
    const timer = setTimeout(async () => {
      try {
        await api.patch(`/drafts/${id}`, { title, body });
        setBodyDirty(false);
      } catch (err) {
        console.error("autosave failed", err);
      }
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [title, body, bodyDirty, draft, id, setBodyDirty]);
}

export default function Draft() {
  const { id } = useParams();
  const nav = useNavigate();

  const onMissing = useCallback(() => {
    toast.error("Draft not found.");
    nav("/dashboard");
  }, [nav]);

  const { draft, messages, setMessages, title, setTitle, body, setBody, bodyDirty, setBodyDirty, reloadMessages } = useDraft(id, onMissing);

  useAutosave(id, draft, title, body, bodyDirty, setBodyDirty);

  const onDraftBlock = useCallback(({ draft_title, draft_body }) => {
    if (draft_title) setTitle(draft_title);
    if (draft_body) setBody(draft_body);
  }, [setTitle, setBody]);

  const { streaming, streamingText, send } = useChatStream(id, {
    onUserMessage: (text) =>
      setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", content: text, created_at: new Date().toISOString() }]),
    onDraftBlock,
    onDone: reloadMessages,
  });

  if (!draft) {
    return (
      <div className="min-h-screen">
        <Nav />
        <div className="max-w-6xl mx-auto px-6 py-10 label-mono">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Nav />

      <div className="border-b border-ink-700 bg-ink-900/85 sticky top-[65px] z-20">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <button onClick={() => nav("/dashboard")} className="label-mono inline-flex items-center gap-1.5 text-text-secondary hover:text-paper" data-testid="back-to-dashboard">
            <ChevronLeft size={14} /> All drafts
          </button>
          <input
            data-testid="draft-title"
            className="flex-1 bg-transparent font-serif text-2xl md:text-3xl text-paper outline-none px-2"
            value={title}
            placeholder="Untitled draft"
            onChange={(e) => { setTitle(e.target.value); setBodyDirty(true); }}
          />
          <Link to={`/draft/${id}/review`} data-testid="review-btn" className="btn-primary inline-flex items-center gap-2">
            <Eye size={15} /> Review &amp; publish
          </Link>
        </div>
      </div>

      <main className="flex-1 grid md:grid-cols-5 gap-0 min-h-0">
        <ChatPanel
          messages={messages}
          streaming={streaming}
          streamingText={streamingText}
          onSend={send}
        />
        <DraftPanel
          body={body}
          setBody={(b) => { setBody(b); setBodyDirty(true); }}
          bodyDirty={bodyDirty}
        />
      </main>
    </div>
  );
}
