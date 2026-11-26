import { cn } from "@/lib/utils";

export function Logo({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
          <path d="M20 12a8 8 0 1 1-3.2-6.4" strokeLinecap="round" />
          <path d="M20 4v4h-4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
        </svg>
      </span>
      <span className={cn("text-[17px]", dark ? "text-white" : "text-slate-900")}>
        CLIENTE<span className="text-brand-500">360</span>
      </span>
    </span>
  );
}
