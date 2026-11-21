"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { btn, field } from "@/components/admin/ui";
import { addOrderNote } from "../actions";

export function NoteForm({ id }: { id: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!message.trim()) {
          setError("Write a note first.");
          return;
        }
        start(async () => {
          setError(null);
          try {
            const res = await addOrderNote({ id, message });
            if (!res.ok) return setError(res.error);
            setMessage("");
            router.refresh();
          } catch {
            setError("We couldn't reach the server. Check your connection and try again.");
          }
        });
      }}
      className="space-y-2"
    >
      <label htmlFor="note" className="sr-only">
        Add a note
      </label>
      <textarea
        id="note"
        rows={2}
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          if (error) setError(null);
        }}
        maxLength={2000}
        placeholder="Add a note for yourself (the customer never sees it)…"
        className={`${field} resize-y`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "note-error" : undefined}
      />
      {error && (
        <p id="note-error" className="text-sm font-medium text-brand" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className={btn.secondary}>
        {pending ? "Saving…" : "Add note"}
      </button>
    </form>
  );
}
