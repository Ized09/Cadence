import { useCallback, useState } from "react";
import { toast } from "sonner";
import { API } from "@/lib/api";

function parseSSELine(line, onPayload) {
  if (!line.startsWith("data:")) return;
  const data = line.slice(5).trim();
  if (!data) return;
  try {
    onPayload(JSON.parse(data));
  } catch (err) {
    console.warn("bad SSE payload", err);
  }
}

export default function useChatStream(id, { onUserMessage, onDraftBlock, onDone }) {
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");

  const send = useCallback(async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onUserMessage?.(trimmed);
    setStreaming(true);
    setStreamingText("");

    try {
      const resp = await fetch(`${API}/drafts/${id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: trimmed }),
      });
      if (!resp.ok || !resp.body) throw new Error("stream failed");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assistantBuf = "";

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          parseSSELine(line, (j) => {
            if (j.delta) {
              assistantBuf += j.delta;
              setStreamingText(assistantBuf);
            } else if (j.done) {
              if (j.produced_draft) onDraftBlock?.(j);
            } else if (j.error) {
              toast.error(j.error);
            }
          });
        }
      }

      onDone?.();
      setStreamingText("");
    } catch (e) {
      console.error("chat stream failed", e);
      toast.error("Chat failed.");
    } finally {
      setStreaming(false);
    }
  }, [id, onUserMessage, onDraftBlock, onDone]);

  return { streaming, streamingText, send };
}
