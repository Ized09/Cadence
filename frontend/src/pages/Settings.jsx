import React, { useEffect, useState, useCallback } from "react";
import Nav from "@/components/Nav";
import api from "@/lib/api";
import { toast } from "sonner";
import { Sparkles, Save, Link2 } from "lucide-react";

function SanitySection({ target, setTarget, hasToken, busy, onSave }) {
  return (
    <section className="surface p-6">
      <div className="flex items-center gap-2 mb-1">
        <Link2 size={16} className="text-sage" />
        <div className="label-mono">SANITY · PUBLISH TARGET</div>
      </div>
      <h2 className="font-serif text-2xl text-paper mb-1">Your blog connection</h2>
      <p className="text-text-secondary text-sm mb-5">
        Find these in Sanity Manage → your project. The API token must have <em>Editor</em> access.
      </p>

      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <div>
          <div className="label-mono mb-1">PROJECT ID</div>
          <input data-testid="sanity-project-id" className="input-ink font-mono" placeholder="abc1234x" value={target.project_id} onChange={(e) => setTarget({ ...target, project_id: e.target.value })} />
        </div>
        <div>
          <div className="label-mono mb-1">DATASET</div>
          <input data-testid="sanity-dataset" className="input-ink font-mono" placeholder="production" value={target.dataset} onChange={(e) => setTarget({ ...target, dataset: e.target.value })} />
        </div>
        <div>
          <div className="label-mono mb-1">DOCUMENT TYPE</div>
          <input data-testid="sanity-doctype" className="input-ink font-mono" placeholder="post" value={target.document_type} onChange={(e) => setTarget({ ...target, document_type: e.target.value })} />
        </div>
        <div>
          <div className="label-mono mb-1">API TOKEN {hasToken && <span className="text-sage ml-1">· STORED</span>}</div>
          <input data-testid="sanity-token" type="password" className="input-ink font-mono" placeholder={hasToken ? "•••••• (leave blank to keep)" : "sk... (write access)"} value={target.api_token} onChange={(e) => setTarget({ ...target, api_token: e.target.value })} />
        </div>
      </div>
      <button data-testid="save-sanity" disabled={busy} onClick={onSave} className="btn-primary inline-flex items-center gap-2">
        <Save size={15} /> Save connection
      </button>
    </section>
  );
}

function VoiceSection({ profile, samplesCount, editSummary, setEditSummary, refineText, setRefineText, busy, onSaveSummary, onRefine }) {
  if (!profile) {
    return (
      <section className="surface p-6">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={16} className="text-sage" />
          <div className="label-mono">VOICE PROFILE</div>
        </div>
        <h2 className="font-serif text-2xl text-paper mb-1">How Cadence writes as you</h2>
        <div className="text-text-secondary text-sm mt-4">
          No voice profile yet. <a href="/onboarding" className="text-coral underline">Run onboarding</a>.
        </div>
      </section>
    );
  }
  return (
    <section className="surface p-6">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={16} className="text-sage" />
        <div className="label-mono">VOICE PROFILE</div>
      </div>
      <h2 className="font-serif text-2xl text-paper mb-1">How Cadence writes as you</h2>
      <p className="text-text-secondary text-sm mb-5">
        Built from <span className="text-paper">{samplesCount}</span> sample{samplesCount === 1 ? "" : "s"}.
        Edit directly, or refine in plain language.
      </p>

      <textarea data-testid="voice-summary-edit" className="input-ink h-72 resize-y font-serif text-[15px] leading-relaxed" value={editSummary} onChange={(e) => setEditSummary(e.target.value)} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button data-testid="save-summary" disabled={busy || editSummary === profile?.style_summary} onClick={onSaveSummary} className="btn-primary inline-flex items-center gap-2">
          <Save size={15} /> Save edits
        </button>
        <div className="flex-1 flex items-center gap-2 min-w-[280px]">
          <input data-testid="refine-instr" className="input-ink flex-1" placeholder='Refine in plain language: "more direct"' value={refineText} onChange={(e) => setRefineText(e.target.value)} />
          <button data-testid="refine-go" disabled={busy || !refineText.trim()} onClick={onRefine} className="btn-ghost">Revise</button>
        </div>
      </div>
      <div className="mt-4 label-mono">{profile.sample_ids?.length || 0} SAMPLES USED · LAST UPDATED {new Date(profile.last_updated).toLocaleString()}</div>
    </section>
  );
}

function NotificationsSection() {
  return (
    <section className="surface p-6">
      <div className="label-mono mb-3">NOTIFICATIONS</div>
      <h2 className="font-serif text-2xl text-paper mb-2">Nudges</h2>
      <p className="text-text-secondary text-sm">
        Reminders are sent by email when a draft you marked &ldquo;ready&rdquo; passes its scheduled time. v1 uses email only; no push, no SMS.
      </p>
    </section>
  );
}

const DEFAULT_TARGET = { project_id: "", dataset: "production", api_token: "", document_type: "post" };

export default function Settings() {
  const [target, setTarget] = useState(DEFAULT_TARGET);
  const [hasToken, setHasToken] = useState(false);
  const [profile, setProfile] = useState(null);
  const [samples, setSamples] = useState([]);
  const [refineText, setRefineText] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, p, s] = await Promise.all([
        api.get("/publish-targets"),
        api.get("/voice/profile"),
        api.get("/voice/samples"),
      ]);
      if (t.data?.project_id) {
        setTarget({
          project_id: t.data.project_id,
          dataset: t.data.dataset || "production",
          api_token: "",
          document_type: t.data.document_type || "post",
        });
        setHasToken(!!t.data.api_token_masked);
      }
      if (p.data?.style_summary) {
        setProfile(p.data);
        setEditSummary(p.data.style_summary);
      }
      setSamples(s.data || []);
    } catch (err) {
      console.error("settings load failed", err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveTarget = useCallback(async () => {
    setBusy(true);
    try {
      await api.put("/publish-targets", target);
      toast.success("Sanity connection saved.");
      load();
    } catch (e) {
      console.error("save target failed", e);
      toast.error(e?.response?.data?.detail || "Couldn't save.");
    } finally { setBusy(false); }
  }, [target, load]);

  const refine = useCallback(async () => {
    if (!refineText.trim()) return;
    setBusy(true);
    try {
      const r = await api.post("/voice/profile/refine", { instruction: refineText });
      setProfile(r.data);
      setEditSummary(r.data.style_summary);
      setRefineText("");
      toast.success("Voice updated.");
    } catch (e) {
      console.error("refine failed", e);
      toast.error(e?.response?.data?.detail || "Couldn't refine.");
    } finally { setBusy(false); }
  }, [refineText]);

  const saveSummary = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api.patch("/voice/profile", { style_summary: editSummary });
      setProfile(r.data);
      toast.success("Voice profile updated.");
    } catch (e) {
      console.error("save summary failed", e);
      toast.error(e?.response?.data?.detail || "Couldn't save.");
    } finally { setBusy(false); }
  }, [editSummary]);

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-3xl mx-auto px-6 py-10 space-y-12">
        <div>
          <div className="label-mono mb-2">SETTINGS</div>
          <h1 className="font-serif text-4xl text-paper">Connections &amp; voice</h1>
        </div>
        <SanitySection target={target} setTarget={setTarget} hasToken={hasToken} busy={busy} onSave={saveTarget} />
        <VoiceSection
          profile={profile}
          samplesCount={samples.length}
          editSummary={editSummary}
          setEditSummary={setEditSummary}
          refineText={refineText}
          setRefineText={setRefineText}
          busy={busy}
          onSaveSummary={saveSummary}
          onRefine={refine}
        />
        <NotificationsSection />
      </main>
    </div>
  );
}
