import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

export default function useDraft(id, onMissing) {
  const [draft, setDraft] = useState(null);
  const [messages, setMessages] = useState([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [bodyDirty, setBodyDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, m] = await Promise.all([
        api.get(`/drafts/${id}`),
        api.get(`/drafts/${id}/messages`),
      ]);
      setDraft(d.data);
      setTitle(d.data.title || "");
      setBody(d.data.body || "");
      setMessages(m.data);
    } catch (err) {
      console.error("draft load failed", err);
      onMissing?.();
    }
  }, [id, onMissing]);

  const reloadMessages = useCallback(async () => {
    try {
      const m = await api.get(`/drafts/${id}/messages`);
      setMessages(m.data);
    } catch (err) {
      console.error("reload messages failed", err);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  return {
    draft, messages, setMessages,
    title, setTitle,
    body, setBody,
    bodyDirty, setBodyDirty,
    reload: load,
    reloadMessages,
  };
}
