import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function getGreeting(name: string) {
  const h = new Date().getHours();
  const prefix = h < 12 ? "Buenos días" : h < 18 ? "Buenas tardes" : "Buenas noches";
  return `${prefix}, ${name}`;
}
