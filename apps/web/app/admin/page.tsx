import { redirect } from "next/navigation";

// /admin had no page of its own and answered 404; the admin tabs start at Metrics (issue #77).
export default function AdminIndex() {
  redirect("/admin/metrics");
}
