import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Upload, Trash2, ChevronRight, Sparkles } from "lucide-react";

export default function Onboarding() {
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [samples, setSamples] = useState([]); // [{title, raw_text}]
  const [pasteText, setPasteText] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [audience, setAudience] = useState("");
  const [profile, setProfile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refineText, setRefineText] = useState("");
  const fileRef = useRef(null);

  const addPaste = () => {
    if (!pasteText.trim() || pasteText.length < 200) {
      toast.error("Paste at least a few paragraphs (200+ chars).");
      return;
    }
    setSamples((s) => [...s, { source_type: "paste", title: pasteTitle || `Sample ${s.length + 1}`, raw_text: pasteText }]);
    setPasteText(""); setPasteTitle("");
  };

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      const text = await f.text();
      setSamples((s) => [...s, { source_type: "upload", title: f.name, raw_text: text }]);
    }
    e.target.value = "";
  };

  const removeSample = (i) => setSamples((s) => s.filter((_, idx) => idx !== i));

  const goToStep2 = async () => {
    if (samples.length === 0) { toast.error("Add at least one sample."); return; }
    setBusy(true);
    try {
      for (const s of samples) await api.post("/voice/samples", s);
      setStep(2);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't save samples.");
    } finally { setBusy(false); }
  };

  const generate = async () => {
    setBusy(true);
    try {
      const r = await api.post("/voice/profile/generate", { audience_note: audience });
      setProfile(r.data);
      setStep(3);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't analyze samples.");
    } finally { setBusy(false); }
  };

  const refine = async () => {
    if (!refineText.trim()) return;
    setBusy(true);
    try {
      const r = await api.post("/voice/profile/refine", { instruction: refineText });
      setProfile(r.data);
      setRefineText("");
      toast.success("Voice updated.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't refine.");
    } finally { setBusy(false); }
  };

  const finish = async () => {
    await refresh();
    nav("/dashboard");
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink-700">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="font-serif text-2xl text-paper">Cadence</div>
          <div className="label-mono">ONBOARDING · STEP {step} OF 3</div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        {step === 1 && (
          <div className="animate-fade-up">
            <div className="label-mono mb-4 text-sage">01 · YOUR PAST WRITING</div>
            <h1 className="font-serif text-4xl md:text-5xl text-paper mb-4">Show me how you write.</h1>
            <p className="text-text-secondary leading-relaxed mb-10 max-w-2xl">
              Paste two or three of your published posts, or upload <code className="font-mono text-paper bg-ink-800 px-1.5 py-0.5 rounded">.txt</code> / <code className="font-mono text-paper bg-ink-800 px-1.5 py-0.5 rounded">.md</code> files.
              The more honest material I have, the more the drafts will sound like you and not like a content marketer.
            </p>

            <div className="surface p-6 mb-6">
              <input
                data-testid="sample-title"
                className="input-ink mb-3"
                placeholder="Optional title (e.g. 'How I run discovery calls')"
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
              />
              <textarea
                data-testid="sample-paste"
                className="input-ink h-44 resize-y font-serif text-base leading-relaxed"
                placeholder="Paste an old post here…"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <div className="mt-3 flex items-center justify-between">
                <button
                  data-testid="sample-add"
                  onClick={addPaste}
                  className="btn-primary"
                >Add this sample</button>
                <div className="flex items-center gap-3">
                  <input ref={fileRef} type="file" multiple accept=".txt,.md,.markdown" onChange={onFiles} className="hidden" data-testid="sample-files" />
                  <button onClick={() => fileRef.current?.click()} className="btn-ghost inline-flex items-center gap-2" data-testid="sample-upload-trigger">
                    <Upload size={14} strokeWidth={1.5} /> Upload .txt / .md
                  </button>
                </div>
              </div>
            </div>

            {samples.length > 0 && (
              <div className="mb-8">
                <div className="label-mono mb-3">{samples.length} SAMPLE{samples.length === 1 ? "" : "S"} ADDED</div>
                <div className="surface divide-soft">
                  {samples.map((s, i) => (
                    <div key={i} className="p-4 flex items-center justify-between">
                      <div>
                        <div className="text-paper font-medium">{s.title}</div>
                        <div className="label-mono mt-0.5">{s.source_type.toUpperCase()} · {s.raw_text.length} CHARS</div>
                      </div>
                      <button onClick={() => removeSample(i)} className="text-text-secondary hover:text-coral" data-testid={`sample-remove-${i}`}>
                        <Trash2 size={15} strokeWidth={1.5} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                data-testid="onboarding-next-1"
                disabled={busy || samples.length === 0}
                onClick={goToStep2}
                className="btn-primary inline-flex items-center gap-2 disabled:opacity-40"
              >
                Next: tell me about your audience <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-fade-up">
            <div className="label-mono mb-4 text-sage">02 · WHO IT'S FOR</div>
            <h1 className="font-serif text-4xl md:text-5xl text-paper mb-4">What do you write about, and for whom?</h1>
            <p className="text-text-secondary leading-relaxed mb-10 max-w-2xl">
              One or two sentences. Specifics help — name the field, the kind of reader, the recurring questions you answer.
            </p>

            <textarea
              data-testid="audience-input"
              className="input-ink h-32 resize-y font-serif text-base leading-relaxed mb-8"
              placeholder="e.g. I write about pricing and positioning for solo design consultants — mostly people 3-5 years into freelance who keep undercharging."
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            />

            <div className="flex justify-between items-center">
              <button onClick={() => setStep(1)} className="btn-ghost" data-testid="onboarding-back-2">← Back</button>
              <button
                data-testid="onboarding-generate"
                disabled={busy}
                onClick={generate}
                className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
              >
                {busy ? "Reading your samples…" : <>Build my voice profile <Sparkles size={15} /></>}
              </button>
            </div>
          </div>
        )}

        {step === 3 && profile && (
          <div className="animate-fade-up">
            <div className="label-mono mb-4 text-sage">03 · YOUR VOICE</div>
            <h1 className="font-serif text-4xl md:text-5xl text-paper mb-4">Here's how I'll write as you.</h1>
            <p className="text-text-secondary leading-relaxed mb-8 max-w-2xl">
              Read it. If something's off, tell me in plain language ("less corporate," "use more sentence fragments"). I'll rewrite it.
            </p>

            <div className="paper p-8 md:p-10 mb-6">
              <div className="label-mono mb-4" style={{ color: "#6B7280" }}>STYLE SUMMARY</div>
              <div className="font-serif text-[17px] leading-[1.7] whitespace-pre-wrap" data-testid="voice-summary">
                {profile.style_summary}
              </div>
            </div>

            <div className="surface p-5 mb-8">
              <div className="label-mono mb-2">REFINE IN PLAIN LANGUAGE</div>
              <div className="flex gap-3">
                <input
                  data-testid="refine-input"
                  className="input-ink flex-1"
                  placeholder='e.g. "less corporate, more contrarian"'
                  value={refineText}
                  onChange={(e) => setRefineText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && refine()}
                />
                <button data-testid="refine-btn" disabled={busy || !refineText.trim()} onClick={refine} className="btn-ghost">
                  {busy ? "…" : "Revise"}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button data-testid="onboarding-finish" onClick={finish} className="btn-primary inline-flex items-center gap-2">
                Take me to the dashboard <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
