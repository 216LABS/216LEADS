import clsx from "clsx";

/**
 * The mark: a roofline, one lit window (the signal) and the ground line. Drawn, not boxed in an
 * app tile, so it sits on paper, white or navy. Same geometry as public/icon.svg.
 */
export function LogoMark({ className, light }: { className?: string; light?: boolean }) {
  const ink = light ? "#F7F5F0" : "#0F2A44";
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={clsx("h-7 w-7", className)}>
      <path d="M4 16 16 5.5 28 16" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" />
      <rect x="12.5" y="14" width="7" height="7" fill="#F26B1D" />
      <path d="M7 26.5h18" stroke={ink} strokeWidth="3" strokeLinecap="square" />
    </svg>
  );
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <LogoMark light={light} />
      <span className={clsx("text-[17px] leading-none tracking-tight", light ? "text-white" : "text-navy")}>
        <span className={clsx("font-medium", light ? "text-white/70" : "text-slate")}>216</span>{" "}
        <span className="font-semibold">HomeSignal</span>
      </span>
    </span>
  );
}
