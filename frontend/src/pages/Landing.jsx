import React from "react";
import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 md:px-12 py-6 flex items-center justify-between">
        <div className="font-serif text-2xl text-paper">Cadence</div>
        <Link data-testid="landing-signin" to="/login" className="label-mono text-text-secondary hover:text-paper">SIGN IN →</Link>
      </header>

      <main className="flex-1 px-6 md:px-12 max-w-5xl mx-auto pt-12 md:pt-24 pb-24 w-full">
        <div className="label-mono mb-6">A CONTENT CO-PILOT · NOT A CMS</div>
        <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl leading-[1.04] text-paper tracking-tight">
          You keep meaning <br />
          to write something. <br />
          <span className="text-coral italic">Cadence makes you.</span>
        </h1>

        <p className="mt-10 max-w-2xl text-lg md:text-xl text-text-secondary leading-relaxed">
          For solo experts with a Sanity blog they haven't updated in three months. It learns how you actually write,
          drafts with you in that voice, and nudges you until the post goes live.
        </p>

        <div className="mt-12 flex items-center gap-4">
          <Link to="/login" data-testid="landing-cta" className="btn-primary inline-block">Start writing again</Link>
          <Link to="/login" data-testid="landing-cta-secondary" className="btn-ghost inline-block">See how it works</Link>
        </div>

        <div className="mt-24 grid md:grid-cols-3 gap-px bg-ink-700 border border-ink-700 rounded-lg overflow-hidden">
          {[
            { k: "01", h: "Learn the voice", b: "Paste a few old posts. Cadence builds a style summary you can tweak in plain English — 'more direct,' 'less corporate.'" },
            { k: "02", h: "Co-write the next one", b: "Bring a topic or rough note. Chat in the left panel, the draft builds in the right. Edit either side at any moment." },
            { k: "03", h: "Publish to Sanity", b: "When it's done, hit Publish to site. Cadence pushes title and body to your dataset. Or schedule a nudge to remind you tomorrow." },
          ].map((c) => (
            <div key={c.k} className="bg-ink-800 p-8">
              <div className="label-mono mb-4 text-sage">STEP {c.k}</div>
              <h3 className="font-serif text-2xl text-paper mb-3">{c.h}</h3>
              <p className="text-text-secondary leading-relaxed text-sm">{c.b}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="px-6 md:px-12 py-8 border-t border-ink-700 flex items-center justify-between">
        <div className="label-mono">© CADENCE · MMXXVI</div>
        <div className="label-mono">SANITY · CLAUDE · RESEND</div>
      </footer>
    </div>
  );
}
