import { cn } from "@/lib/utils";

export function SaltoLogo({
  variant = "light",
  size = 32,
  className,
}: {
  variant?: "light" | "dark" | "emerald";
  size?: number;
  className?: string;
}) {
  const styles = {
    light: "bg-slate-900 text-white",
    dark: "bg-white text-slate-900",
    emerald: "bg-emerald-500 text-white",
  } as const;

  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center rounded-md font-display font-bold leading-none select-none shadow-sm",
        styles[variant],
        className
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }}
      aria-label="Salto"
    >
      <span className="-mt-0.5">S</span>
      <span
        className="absolute -right-1 -top-1 block h-1.5 w-1.5 rounded-full bg-emerald-400 ring-2 ring-white"
        aria-hidden
      />
    </span>
  );
}
