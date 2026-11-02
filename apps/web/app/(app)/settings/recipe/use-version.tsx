"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { withBase } from "@216leads/shared";
import { Button } from "@/components/ui";

/** Revert to an earlier recipe version; the server re-scores leads before answering. */
export function UseVersionButton({ versionId }: { versionId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  async function use() {
    setState("busy");
    const res = await fetch(withBase("/api/profile/activate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version_id: versionId }),
    });
    if (!res.ok) return setState("error");
    setState("idle");
    router.refresh();
  }
  return (
    <Button variant="secondary" onClick={use} disabled={state === "busy"}>
      {state === "busy" ? "Re-scoring…" : state === "error" ? "Try again" : "Use this version"}
    </Button>
  );
}
