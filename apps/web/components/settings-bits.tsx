import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "./ui";

/** Header for a Settings sub-page, with the way back. */
export function SettingsHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/settings" className="text-slate underline underline-offset-2">Settings</Link></p>
      <PageHeader title={title} sub={sub} actions={actions} />
    </>
  );
}
