import { appEnv } from "@216leads/shared";

/** Small banner on every page outside production (D1). */
export function EnvBanner() {
  const env = appEnv();
  if (env === "production") return null;
  return (
    <div role="note" className="bg-warn-50 px-4 py-1 text-center text-xs font-semibold text-warn">
      {env === "staging" ? "STAGING" : "LOCAL"} · test data only · no real postcards or charges
    </div>
  );
}
