export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-slate-600 leading-relaxed mb-4">{children}</p>;
}

export function UL({ items }: { items: (string | React.ReactNode)[] }) {
  return (
    <ul className="space-y-2 mb-5 ml-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5 text-slate-600 leading-relaxed">
          <span className="mt-2 w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
