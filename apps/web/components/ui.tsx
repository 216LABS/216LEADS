import clsx from "clsx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { COLORS } from "@/lib/theme";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "navy";

const variants: Record<Variant, string> = {
  primary: "bg-signal-600 text-white hover:bg-signal-700 disabled:bg-signal-600/50",
  navy: "bg-navy text-white hover:bg-navy-700 disabled:bg-navy/50",
  secondary: "bg-white text-navy border border-line hover:border-navy/30 disabled:text-slate/50",
  ghost: "text-navy hover:bg-navy-50",
  danger: "bg-lost text-white hover:bg-lost/90",
};

export function buttonClass(variant: Variant = "primary", extra?: string) {
  return clsx(
    "tap focus-ring inline-flex items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed",
    variants[variant],
    extra,
  );
}

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function LinkButton({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={clsx("card", className)} {...props} />;
}

export function Badge({ tone = "slate", className, children }: { tone?: "slate" | "signal" | "won" | "lost" | "navy"; className?: string; children: ReactNode }) {
  const tones = {
    slate: "bg-navy-50 text-slate",
    signal: "bg-signal-50 text-signal-600",
    won: "bg-won-50 text-won",
    lost: "bg-lost-50 text-lost",
    navy: "bg-navy text-white",
  };
  return <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}>{children}</span>;
}

export function Label({ children, hint, htmlFor }: { children: ReactNode; hint?: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-navy">
      {children}
      {hint ? <span className="ml-2 font-normal text-slate">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "tap focus-ring w-full rounded-[10px] border border-line bg-white px-3 text-base text-navy placeholder:text-slate/60 focus:border-navy";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={clsx(inputClass, props.className)} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={clsx(inputClass, "py-2", props.className)} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={clsx(inputClass, "pr-8", props.className)} />;
}

export function SegmentedControl<T extends string>({
  value, options, onChange, label,
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-full rounded-[10px] border border-line bg-white p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "focus-ring min-h-[40px] flex-1 rounded-[8px] px-2 text-sm font-semibold transition-colors",
            value === o.value ? "bg-navy text-white" : "text-slate hover:text-navy",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="focus-ring tap flex w-full items-center justify-between gap-4 rounded-[10px] text-left"
    >
      <span>
        <span className="block text-sm font-semibold text-navy">{label}</span>
        {description ? <span className="block text-sm text-slate">{description}</span> : null}
      </span>
      <span className={clsx("relative h-7 w-12 shrink-0 rounded-full transition-colors", checked ? "bg-signal" : "bg-line")}>
        <span className={clsx("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-6" : "left-1")} />
      </span>
    </button>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <svg aria-hidden viewBox="0 0 48 48" className="mb-4 h-12 w-12">
        <path d="M8 24 24 11l16 13v15a2 2 0 0 1-2 2h-9V30h-10v11h-9a2 2 0 0 1-2-2z" fill="none" stroke={COLORS.navy} strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx="24" cy="7" r="3.5" fill={COLORS.signal} />
      </svg>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children ? <div className="mt-2 max-w-md text-sm text-slate">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function MetricTile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "won" | "signal" }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate">{label}</div>
      <div className={clsx("num mt-1 text-title font-semibold leading-tight", tone === "won" && "text-won", tone === "signal" && "text-signal-600")}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-slate">{sub}</div> : null}
    </div>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-title font-semibold leading-tight tracking-tight">{title}</h1>
        {sub ? <p className="mt-0.5 text-sm text-slate">{sub}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
