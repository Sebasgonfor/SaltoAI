import Link from "next/link";
import { cn } from "@/lib/utils";

export type FlowStep = {
  href?: string;
  label: string;
  state: "done" | "current" | "todo";
};

export function FlowProgress({ steps, className }: { steps: FlowStep[]; className?: string }) {
  return (
    <nav aria-label="Flujo" className={cn("flex items-center gap-2 text-xs", className)}>
      {steps.map((s, i) => {
        const dot =
          s.state === "done"
            ? "bg-emerald-500"
            : s.state === "current"
            ? "bg-slate-900 ring-4 ring-slate-900/10"
            : "bg-slate-300";
        const label =
          s.state === "todo"
            ? "text-slate-400"
            : s.state === "current"
            ? "text-slate-900 font-medium"
            : "text-slate-500";
        const inner = (
          <span className={cn("flex items-center gap-1.5", label)}>
            <span className={cn("h-2 w-2 rounded-full transition-all", dot)} />
            {s.label}
          </span>
        );
        return (
          <span key={i} className="flex items-center gap-2">
            {s.href ? (
              <Link href={s.href} className="hover:text-slate-900 transition-colors">
                {inner}
              </Link>
            ) : (
              inner
            )}
            {i < steps.length - 1 && (
              <span className="h-px w-6 bg-slate-200" aria-hidden />
            )}
          </span>
        );
      })}
    </nav>
  );
}
