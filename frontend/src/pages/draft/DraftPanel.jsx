import React from "react";

export default function DraftPanel({ body, setBody, bodyDirty }) {
  const wordCount = body.split(/\s+/).filter(Boolean).length;
  return (
    <section className="md:col-span-3 p-6 md:p-10 overflow-y-auto bg-ink-900">
      <div className="max-w-3xl mx-auto">
        <div className="paper p-8 md:p-12 min-h-[70vh]">
          <div className="label-mono mb-6" style={{ color: "#6B7280" }}>
            THE DRAFT · {wordCount} WORDS
            {bodyDirty && <span className="text-coral ml-2">· UNSAVED</span>}
          </div>
          <textarea
            data-testid="draft-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="The draft will appear here as Cadence writes — or you can start typing yourself."
            className="w-full bg-transparent outline-none font-serif text-[18px] leading-[1.75] text-ink-900 resize-none"
            style={{ minHeight: "60vh" }}
          />
        </div>
      </div>
    </section>
  );
}
