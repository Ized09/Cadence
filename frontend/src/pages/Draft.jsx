import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import Nav from "@/components/Nav";
import api, { API } from "@/lib/api";
import { toast } from "sonner";
import { Send, ChevronLeft, Eye } from "lucide-react";

export default function Draft() {
  const { id } = useParams();
  const nav = useNavigate();
  const [draft, setDraft] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [bodyDirty, setBodyDirty] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const scrollRef = useRef(null);
  const saveTimer = useRef(null);

  const load = useCallback(async () => {
    try {
      const [d, m] = await Promise.all([api.get(`/drafts/${id}`), api.get(`/drafts/${id}/messages`)]);
      setDraft(d.data);
      setTitle(d.data.title || "");
      setBody(d.data.body || "");
      setMessages(m.data);
    } catch {
      toast.error("Draft not found.");
      nav("/dashboard");
    }
  }, [id, nav]);

  useEffect(() => { load(); }, [load]);

  // autosave title + body (debounced) when user edits
  useEffect(() => {
    if (!draft) return;
    if (!bodyDirty) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.patch(`/drafts/${id}`, { title, body });
        setBodyDirty(false);
      } catch {}
    }, 700);
    return () => clearTimeout(saveTimer.current);
  }, [title, body, bodyDirty, draft, id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamingText]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", content: text, created_at: new Date().toISOString() }]);
    setStreaming(true);
    setStreamingText("");

    try {
      // Use fetch + ReadableStream for SSE
      const token = localStorage.getItem("cadence_token");
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const resp = await fetch(`${API}/drafts/${id}/chat`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ message: text }),
      });
      if (!resp.ok || !resp.body) throw new Error("stream failed");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assistantBuf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data) continue;
          try {
            const j = JSON.parse(data);
            if (j.delta) {
              assistantBuf += j.delta;
              setStreamingText(assistantBuf);
            } else if (j.done) {
              if (j.produced_draft) {
                if (j.draft_title) setTitle(j.draft_title);
                if (j.draft_body) setBody(j.draft_body);
              }
            } else if (j.error) {
              toast.error(j.error);
            }
          } catch {}
        }
      }
      // refresh messages from server to get clean version
      const m = await api.get(`/drafts/${id}/messages`);
      setMessages(m.data);
      setStreamingText("");
    } catch (e) {
      toast.error("Chat failed.");
    } finally {
      setStreaming(false);
    }
  };

  if (!draft) {
    return (
      <div className="min-h-screen">
        <Nav />
        <div className="max-w-6xl mx-auto px-6 py-10 label-mono">Loading…</div>
      </div>
    );
  }

  // strip <draft> tags from visible assistant chat (in case server didn't)
  const cleanChat = (txt) => txt?.replace(/<draft>[\s\S]*?<\/draft>/gi, "").trim();

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
            <Eye size={15} /> Review & publish
          </Link>
        </div>
      </div>

      <main className="flex-1 grid md:grid-cols-5 gap-0 min-h-0">
        {/* chat — left 2/5 */}
        <section className="md:col-span-2 border-r border-ink-700 flex flex-col min-h-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
            {messages.length === 0 && !streamingText && (
              <div className="text-text-secondary text-sm leading-relaxed" data-testid="empty-chat">
                <div className="label-mono mb-3 text-sage">START HERE</div>
                <p>Bring a topic, a question, a rough note. I'll propose two or three angles, then start drafting in your voice on the right.</p>
                <p className="mt-3 text-text-dim">Try: "I want to write about why most positioning advice is too abstract for solo consultants."</p>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} data-testid={`msg-${m.role}`}>
                <div className={`label-mono mb-1.5 ${m.role === "assistant" ? "text-sage" : "text-coral"}`}>
                  {m.role === "user" ? "YOU" : "CADENCE"}
                </div>
                <div className="text-paper text-[15px] leading-relaxed whitespace-pre-wrap">
                  {cleanChat(m.content)}
                </div>
              </div>
            ))}
            {streaming && streamingText && (
              <div>
                <div className="label-mono mb-1.5 text-sage">CADENCE</div>
                <div className="text-paper text-[15px] leading-relaxed whitespace-pre-wrap">
                  {cleanChat(streamingText)}
                  <span className="inline-block w-2 h-4 ml-0.5 bg-sage animate-pulse align-middle" />
                </div>
              </div>
            )}
          </div>
          <div className="border-t border-ink-700 p-4 bg-ink-800">
            <div className="flex items-end gap-2">
              <textarea
                data-testid="chat-input"
                className="input-ink resize-none flex-1 h-20"
                placeholder="Bring a topic or a rough note…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
                disabled={streaming}
              />
              <button data-testid="chat-send" onClick={send} disabled={streaming || !input.trim()} className="btn-primary inline-flex items-center gap-2 h-fit">
                <Send size={15} /> {streaming ? "…" : "Send"}
              </button>
            </div>
            <div className="label-mono mt-2 text-text-dim">⌘+Enter to send · Draft updates on the right as it's written</div>
          </div>
        </section>

        {/* draft panel — right 3/5 */}
        <section className="md:col-span-3 p-6 md:p-10 overflow-y-auto bg-ink-900">
          <div className="max-w-3xl mx-auto">
            <div className="paper p-8 md:p-12 min-h-[70vh]">
              <div className="label-mono mb-6" style={{ color: "#6B7280" }}>
                THE DRAFT · {body.split(/\s+/).filter(Boolean).length} WORDS {bodyDirty && <span className="text-coral ml-2">· UNSAVED</span>}
              </div>
              <textarea
                data-testid="draft-body"
                value={body}
                onChange={(e) => { setBody(e.target.value); setBodyDirty(true); }}
                placeholder="The draft will appear here as Cadence writes — or you can start typing yourself."
                className="w-full bg-transparent outline-none font-serif text-[18px] leading-[1.75] text-ink-900 resize-none"
                style={{ minHeight: "60vh" }}
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
