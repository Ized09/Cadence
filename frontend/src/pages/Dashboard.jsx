import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Nav from "@/components/Nav";
import StatusPill from "@/components/StatusPill";
import api from "@/lib/api";
import { Plus, Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function Dashboard() {
  const [drafts, setDrafts] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const nav = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const [d, r] = await Promise.all([api.get("/drafts"), api.get("/reminders")]);
      setDrafts(d.data);
      setReminders(r.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const newDraft = async () => {
    try {
      const r = await api.post("/drafts", { title: "", body: "" });
      nav(`/draft/${r.data.id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't create draft.");
    }
  };

  const dateMarks = useMemo(() => {
    const set = new Set();
    drafts.forEach(d => { if (d.published_at) set.add(new Date(d.published_at).toDateString()); });
    reminders.forEach(r => { set.add(new Date(r.scheduled_for).toDateString()); });
    return set;
  }, [drafts, reminders]);

  const sectioned = {
    drafting: drafts.filter(d => d.status === "drafting"),
    ready: drafts.filter(d => d.status === "ready"),
    published: drafts.filter(d => d.status === "published"),
  };

  return (
    <div className="min-h-screen">
      <Nav />

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-end justify-between mb-10">
          <div>
            <div className="label-mono mb-2">YOUR DESK</div>
            <h1 className="font-serif text-4xl md:text-5xl text-paper tracking-tight">Drafts</h1>
          </div>
          <button data-testid="new-draft-btn" onClick={newDraft} className="btn-primary inline-flex items-center gap-2">
            <Plus size={16} strokeWidth={2} /> New draft
          </button>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* drafts list */}
          <div className="lg:col-span-2 space-y-10">
            {loading ? (
              <div className="label-mono">Loading…</div>
            ) : drafts.length === 0 ? (
              <div className="surface p-10 text-center" data-testid="empty-drafts">
                <div className="font-serif text-2xl text-paper mb-2">A blank desk.</div>
                <p className="text-text-secondary mb-6">Start your first draft — bring a topic, a half-formed thought, anything.</p>
                <button onClick={newDraft} className="btn-primary inline-flex items-center gap-2"><Plus size={16} /> New draft</button>
              </div>
            ) : (
              <>
                {["drafting", "ready", "published"].map((status) => {
                  const list = sectioned[status];
                  if (list.length === 0) return null;
                  return (
                    <section key={status}>
                      <div className="label-mono mb-3">{status.toUpperCase()} · {list.length}</div>
                      <div className="surface divide-soft" data-testid={`section-${status}`}>
                        {list.map((d) => (
                          <Link
                            key={d.id}
                            to={d.status === "published" ? `/draft/${d.id}` : `/draft/${d.id}`}
                            data-testid={`draft-row-${d.id}`}
                            className="flex items-center justify-between p-5 hover:bg-ink-700 transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-paper font-medium truncate">{d.title || "Untitled draft"}</div>
                              <div className="label-mono mt-1 normal-case tracking-normal text-text-dim">
                                {d.body ? `${d.body.split(/\s+/).filter(Boolean).length} words` : "empty"}
                                {" · "}
                                Updated {formatDate(d.updated_at)}
                                {d.published_at && <> · Published {formatDate(d.published_at)}</>}
                              </div>
                            </div>
                            <StatusPill status={d.status} />
                          </Link>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </>
            )}
          </div>

          {/* calendar */}
          <aside>
            <div className="surface p-5">
              <div className="flex items-center gap-2 mb-4">
                <CalendarIcon size={14} className="text-sage" />
                <div className="label-mono">CALENDAR</div>
              </div>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                modifiers={{ marked: (date) => dateMarks.has(date.toDateString()) }}
                modifiersClassNames={{ marked: "after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-coral relative" }}
                className="bg-transparent"
              />
              <div className="mt-5 pt-5 border-t border-ink-700">
                <div className="label-mono mb-2">UPCOMING NUDGES</div>
                {reminders.filter(r => !r.sent_at).slice(0, 5).map((r) => {
                  const d = drafts.find(x => x.id === r.draft_id);
                  return (
                    <div key={r.id} className="text-sm text-text-secondary py-2 flex justify-between gap-3">
                      <span className="truncate">{d?.title || "Draft"}</span>
                      <span className="font-mono text-xs text-coral whitespace-nowrap">{formatDate(r.scheduled_for)}</span>
                    </div>
                  );
                })}
                {reminders.filter(r => !r.sent_at).length === 0 && (
                  <div className="text-sm text-text-dim">No nudges scheduled.</div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
