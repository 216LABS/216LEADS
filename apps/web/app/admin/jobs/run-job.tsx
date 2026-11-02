"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function RunJobButton({ job }: { job: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "started" | "error">("idle");
  async function run() {
    setState("busy");
    const res = await fetch("/api/admin/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job }) });
    setState(res.ok ? "started" : "error");
    setTimeout(() => router.refresh(), 1500);
  }
  return (
    <Button variant="secondary" className="min-h-[36px] px-3 text-xs" onClick={run} disabled={state === "busy"}>
      {state === "started" ? "Started" : state === "error" ? "Failed" : `Run ${job}`}
    </Button>
  );
}
