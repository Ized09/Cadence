import React from "react";

const LABELS = {
  drafting: "DRAFTING",
  ready: "READY · NUDGE SET",
  published: "PUBLISHED",
};

export default function StatusPill({ status }) {
  const cls = status === "published" ? "pill pill-sage" : status === "ready" ? "pill pill-coral" : "pill pill-muted";
  return <span data-testid={`pill-${status}`} className={cls}>{LABELS[status] || status?.toUpperCase()}</span>;
}
