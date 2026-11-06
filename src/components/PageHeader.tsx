import type { ReactNode } from "react";

// The top of every screen: the title and its line, actions on the right, then the screen's tabs on one baseline
export function PageHeader({
  title,
  subtitle,
  meta,
  actions,
  tabs,
}: {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
}) {
  return (
    <header className={`shrink-0 px-8 pt-6 ${tabs ? "" : "pb-5"}`}>
      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="font-heading text-[28px] leading-tight text-gold-gradient">{title}</h1>
            {meta && <div className="flex items-center gap-2">{meta}</div>}
          </div>
          {subtitle && <p className="mt-1 truncate text-[13.5px] text-white/50">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-3 pt-1">{actions}</div>}
      </div>
      {tabs && <div className="mt-3 flex items-end justify-between gap-4 border-b border-white/[0.06]">{tabs}</div>}
    </header>
  );
}

// A small status label: an icon and a few words on one line
export function Pill({
  icon,
  children,
  tone = "neutral",
}: {
  icon?: ReactNode;
  children: ReactNode;
  tone?: "neutral" | "gold" | "success" | "warning";
}) {
  const tones = {
    neutral: "border-white/10 bg-white/[0.04] text-white/65",
    gold: "border-wow-gold/35 bg-wow-gold/10 text-wow-gold-light",
    success: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    warning: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  };

  return (
    <span className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[11.5px] font-medium ${tones[tone]}`}>
      {icon && <span className="flex shrink-0 items-center [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>}
      {children}
    </span>
  );
}
