import { redirect } from "next/navigation";

// The separate "Needs a fix" screen is gone: a citation for the org's trade now raises the score and
// reads as a reason on the lead ("City heating citation, cited 2026-03-13: gas valve inoperable").
// Old links land on the leads list filtered to homes with a citation.
export default function FixListPage() {
  redirect("/leads?chips=citation");
}
