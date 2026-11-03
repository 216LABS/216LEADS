import { redirect } from "next/navigation";

/** Issue #72: people look for security settings here; password and sign-out live on Your account. */
export default function SecurityPage() {
  redirect("/settings/account");
}
