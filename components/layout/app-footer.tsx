export function AppFooter({ left, right }: { left: string; right: string }) {
  return (
    <footer className="border-t border-slate-200 py-6 px-4 sm:px-6 text-xs text-slate-500 max-w-7xl mx-auto w-full flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-center sm:text-left">
      <span>{left}</span>
      <span className="text-slate-400">{right}</span>
    </footer>
  );
}
