import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import Nav from "@/components/Nav";
import api from "@/lib/api";
import { toast } from "sonner";
import { Send, Clock, ChevronLeft, CheckCircle2 } from "lucide-react";

function PublishedBanner({ docId }) {
  return (
    <div className="surface p-6 flex items-center gap-3" data-testid="published-banner">
      <CheckCircle2 className="text-sage" size={22} />
      <div>
        <div className="text-paper font-medium">Published to your site.</div>
        <div className="label-mono mt-1">Sanity doc id: {docId}</div>
      </div>
    </div>
  );
}

function PublishCard({ target, busy, onPublish }) {
  return (
    <div className="surface p-6">
      <div className="label-mono mb-3 text-sage">SHIP IT</div>
      <h3 className="font-serif text-2xl text-paper mb-2">Publish to site</h3>
      <p className="text-text-secondary text-sm mb-4">
        Pushes title + body to your connected Sanity dataset as a new <code className="font-mono text-paper">{target?.document_type || "post"}</code> document.
      </p>
      {!target && (
        <div className="pill pill-coral mb-3" data-testid="target-missing">
          SANITY NOT CONNECTED — <Link to="/settings" className="underline ml-1">CONNECT</Link>
        </div>
      )}
      <button
        disabled={busy || !target}
        onClick={onPublish}
        className="btn-primary inline-flex items-center gap-2 w-full justify-center disabled:opacity-40"
        data-testid="publish-btn"
      >
        <Send size={15} /> {busy ? "Publishing…" : "Publish to site"}
      </button>
    </div>
  );
}

function ReminderCard({ reminderHours, setReminderHours, busy, onSchedule }) {
  return (
    <div className="surface p-6">
      <div className="label-mono mb-3 text-coral">NOT YET</div>
      <h3 className="font-serif text-2xl text-paper mb-2">Remind me later</h3>
      <p className="text-text-secondary text-sm mb-4">
        Set a nudge. You&apos;ll get an email when it&apos;s time. Draft moves to &ldquo;ready · nudge set&rdquo;.
      </p>
      <div className="flex items-center gap-2 mb-3">
        <input
          type="number"
          min="1"
          max="240"
          value={reminderHours}
          onChange={(e) => setReminderHours(+e.target.value)}
          className="input-ink w-24"
          data-testid="reminder-hours"
        />
        <span className="label-mono">HOURS FROM NOW</span>
      </div>
      <button
        disabled={busy}
        onClick={onSchedule}
        className="btn-attention inline-flex items-center gap-2 w-full justify-center"
        data-testid="schedule-reminder-btn"
      >
        <Clock size={15} /> Set nudge
      </button>
    </div>
  );
}

function useReviewActions(id, onAfterPublish, onAfterSchedule) {
  const [busy, setBusy] = useState(false);

  const publish = useCallback(async () => {
    setBusy(true);
    try {
      await api.post(`/drafts/${id}/publish`);
      toast.success("Published to your Sanity dataset.");
      onAfterPublish?.();
    } catch (e) {
      console.error("publish failed", e);
      toast.error(e?.response?.data?.detail || "Publish failed.");
    } finally { setBusy(false); }
  }, [id, onAfterPublish]);

  const schedule = useCallback(async (hours) => {
    setBusy(true);
    try {
      const when = new Date(Date.now() + hours * 3600 * 1000).toISOString();
      await api.post(`/drafts/${id}/reminder`, { scheduled_for: when, channel: "email" });
      toast.success(`Nudge set for ${hours}h from now.`);
      onAfterSchedule?.();
    } catch (e) {
      console.error("reminder failed", e);
      toast.error(e?.response?.data?.detail || "Couldn't schedule.");
    } finally { setBusy(false); }
  }, [id, onAfterSchedule]);

  return { busy, publish, schedule };
}

export default function Review() {
  const { id } = useParams();
  const nav = useNavigate();
  const [draft, setDraft] = useState(null);
  const [target, setTarget] = useState(null);
  const [reminderHours, setReminderHours] = useState(24);

  const load = useCallback(async () => {
    try {
      const [d, t] = await Promise.all([api.get(`/drafts/${id}`), api.get("/publish-targets")]);
      setDraft(d.data);
      setTarget(t.data && t.data.project_id ? t.data : null);
    } catch (err) {
      console.error("review load failed", err);
      toast.error("Draft not found");
      nav("/dashboard");
    }
  }, [id, nav]);

  useEffect(() => { load(); }, [load]);

  const { busy, publish, schedule } = useReviewActions(
    id,
    load,
    useCallback(() => nav("/dashboard"), [nav]),
  );

  if (!draft) {
    return (
      <div className="min-h-screen">
        <Nav />
        <div className="max-w-3xl mx-auto px-6 py-10 label-mono">Loading…</div>
      </div>
    );
  }

  const published = draft.status === "published";
  const wordCount = draft.body.split(/\s+/).filter(Boolean).length;

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <button onClick={() => nav(`/draft/${id}`)} className="label-mono inline-flex items-center gap-1.5 text-text-secondary hover:text-paper mb-6" data-testid="back-to-draft">
          <ChevronLeft size={14} /> Back to writing
        </button>

        <div className="label-mono mb-3">REVIEW</div>
        <h1 className="font-serif text-4xl md:text-5xl text-paper mb-2">{draft.title || "Untitled draft"}</h1>
        <div className="label-mono mb-10">{wordCount} WORDS · STATUS {draft.status.toUpperCase()}</div>

        <div className="paper p-10 md:p-14 mb-10">
          <h2 className="font-serif text-3xl text-ink-900 mb-6">{draft.title || "Untitled"}</h2>
          <div className="font-serif text-[18px] leading-[1.8] whitespace-pre-wrap text-ink-900" data-testid="review-body">
            {draft.body || "(empty draft)"}
          </div>
        </div>

        {published ? (
          <PublishedBanner docId={draft.published_doc_id} />
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            <PublishCard target={target} busy={busy} onPublish={() => {
              if (!target) {
                toast.error("Connect your Sanity project in Settings first.");
                return;
              }
              publish();
            }} />
            <ReminderCard
              reminderHours={reminderHours}
              setReminderHours={setReminderHours}
              busy={busy}
              onSchedule={() => schedule(reminderHours)}
            />
          </div>
        )}
      </main>
    </div>
  );
}
