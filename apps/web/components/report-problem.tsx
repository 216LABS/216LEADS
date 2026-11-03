"use client";
import { useRef, useState } from "react";
import { withBase } from "@216leads/shared";
import { Button, Textarea } from "./ui";

/** "Report a problem" (D6): sends the message with the page URL; the server adds org and user ids. */
export function ReportProblem({ className, label = "Report a problem" }: { className?: string; label?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const res = await fetch(withBase("/api/report"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, page: window.location.href }),
    });
    setState(res.ok ? "sent" : "error");
    if (res.ok) setMessage("");
  }

  return (
    <>
      <button
        type="button"
        className={className ?? "focus-ring underline underline-offset-2 hover:text-navy"}
        onClick={() => {
          setState("idle");
          dialog.current?.showModal();
        }}
      >
        {label}
      </button>
      <dialog ref={dialog} className="m-auto w-[min(92vw,28rem)] rounded-[12px] border border-line p-0 backdrop:bg-navy/40">
        <form onSubmit={send} className="space-y-3 p-5">
          <h2 className="text-lg font-semibold text-navy">Report a problem</h2>
          {state === "sent" ? (
            <p className="text-sm text-slate">Thanks. We got it and will follow up by email.</p>
          ) : (
            <>
              <p className="text-sm text-slate">What went wrong? We include this page&apos;s address so we can find it.</p>
              <Textarea aria-label="What went wrong" rows={5} required minLength={3} value={message} onChange={(e) => setMessage(e.target.value)} />
              {state === "error" ? <p role="alert" className="text-sm text-lost">Could not send. Please try again.</p> : null}
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => dialog.current?.close()}>
              {state === "sent" ? "Close" : "Cancel"}
            </Button>
            {state !== "sent" ? (
              <Button type="submit" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send"}</Button>
            ) : null}
          </div>
        </form>
      </dialog>
    </>
  );
}
