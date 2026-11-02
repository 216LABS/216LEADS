// Addendum A8 golden business types, shared by the unit and integration tests.
import { answersSchema, suggestAdjacent, type WizardAnswers } from "@216leads/scoring";

export const GOLDEN: { name: string; answers: Partial<WizardAnswers>; preset: string; signals: string[]; permits: string[] }[] = [
  { name: "roofer", answers: { sells: "Roof replacement and repair, asphalt shingles", job_value: "10k_plus" }, preset: "roofing", signals: ["last_permit_age:roofing"], permits: [] },
  { name: "HVAC", answers: { sells: "Furnace and AC installs, heat pumps", job_value: "2k_10k" }, preset: "hvac", signals: ["last_permit_age:hvac"], permits: [] },
  { name: "fence company", answers: { sells: "Wood and vinyl fence installation", job_value: "2k_10k" }, preset: "fence", signals: ["new_owner"], permits: ["pool", "new_build"] },
  { name: "landscaper", answers: { sells: "Landscaping, lawn mowing and yard cleanups", job_value: "500_2k" }, preset: "lawn_care", signals: ["grass", "lot_size"], permits: ["new_build", "pool"] },
  { name: "dentist", answers: { sells: "Family dentist, cleanings and checkups", job_value: "500_2k", focus: "new_movers" }, preset: "new_movers", signals: ["new_owner"], permits: [] },
  { name: "insurance agent", answers: { sells: "Home and auto insurance agency", job_value: "500_2k", focus: "new_movers" }, preset: "new_movers", signals: ["new_owner", "owner_occupied"], permits: [] },
];

export function goldenAnswers(g: (typeof GOLDEN)[number]): WizardAnswers {
  return answersSchema.parse({
    business_name: `Golden ${g.name}`, zips: ["44107", "44111"], ...g.answers, adjacent: suggestAdjacent(g.answers.sells!),
  });
}
