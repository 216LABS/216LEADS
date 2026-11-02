"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { withBase } from "@216leads/shared";
import { Button } from "@/components/ui";

/** Spec 7.6 "Allow reset": drop the learned factors and start learning again from new outcomes. */
export function ResetLearnedButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  async function reset() {
    setState("busy");
    const res = await fetch(withBase("/api/settings/learned"), { method: "DELETE" });
    if (!res.ok) return setState("error");
    setState("idle");
    router.refresh();
  }
  return (
    <Button variant="secondary" onClick={reset} disabled={state === "busy"}>
      {state === "busy" ? "Re-scoring…" : state === "error" ? "Try again" : "Reset what we learned"}
    </Button>
  );
}
