import clsx from "clsx";

/** House outline with an orange pulse dot at the roof peak. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={clsx("h-8 w-8", className)}>
      <rect width="32" height="32" rx="7" fill="#0F2A44" />
      <path d="M7 16.5 16 9l9 7.5V25a1 1 0 0 1-1 1h-5v-6h-6v6H8a1 1 0 0 1-1-1z" fill="none" stroke="#F7F5F0" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="16" cy="7.2" r="2.6" fill="#F26B1D" />
    </svg>
  );
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className={clsx("text-lg font-extrabold tracking-tight", light ? "text-white" : "text-navy")}>
        216 <span className="text-signal">Leads</span>
      </span>
    </span>
  );
}
