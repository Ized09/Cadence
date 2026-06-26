import React, { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

function cleanChat(txt) {
  return txt?.replace(/<draft>[\s\S]*?<\/draft>/gi, "").trim();
}

function EmptyChat() {
  return (
    <div className="text-text-secondary text-sm leading-relaxed" data-testid="empty-chat">
      <div className="label-mono mb-3 text-sage">START HERE</div>
      <p>Bring a topic, a question, a rough note. I&apos;ll propose two or three angles, then start drafting in your voice on the right.</p>
      <p className="mt-3 text-text-dim">Try: &ldquo;I want to write about why most positioning advice is too abstract for solo consultants.&rdquo;</p>
    </div>
  );
}

function Message({ role, content }) {
  return (
    <div data-testid={`msg-${role}`}>
      <div className={`label-mono mb-1.5 ${role === "assistant" ? "text-sage" : "text-coral"}`}>
        {role === "user" ? "YOU" : "CADENCE"}
      </div>
      <div className="text-paper text-[15px] leading-relaxed whitespace-pre-wrap">
        {cleanChat(content)}
      </div>
    </div>
  );
}

function StreamingMessage({ text }) {
  return (
    <div>
      <div className="label-mono mb-1.5 text-sage">CADENCE</div>
      <div className="text-paper text-[15px] leading-relaxed whitespace-pre-wrap">
        {cleanChat(text)}
        <span className="inline-block w-2 h-4 ml-0.5 bg-sage animate-pulse align-middle" />
      </div>
    </div>
  );
}

export default function ChatPanel({ messages, streaming, streamingText, onSend }) {
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamingText]);

  const submit = () => {
    if (!input.trim() || streaming) return;
    onSend(input);
    setInput("");
  };

  return (
    <section className="md:col-span-2 border-r border-ink-700 flex flex-col min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {messages.length === 0 && !streamingText && <EmptyChat />}
        {messages.map((m) => <Message key={m.id} role={m.role} content={m.content} />)}
        {streaming && streamingText && <StreamingMessage text={streamingText} />}
      </div>
      <div className="border-t border-ink-700 p-4 bg-ink-800">
        <div className="flex items-end gap-2">
          <textarea
            data-testid="chat-input"
            className="input-ink resize-none flex-1 h-20"
            placeholder="Bring a topic or a rough note…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
            disabled={streaming}
          />
          <button data-testid="chat-send" onClick={submit} disabled={streaming || !input.trim()} className="btn-primary inline-flex items-center gap-2 h-fit">
            <Send size={15} /> {streaming ? "…" : "Send"}
          </button>
        </div>
        <div className="label-mono mt-2 text-text-dim">⌘+Enter to send · Draft updates on the right as it&apos;s written</div>
      </div>
    </section>
  );
}
