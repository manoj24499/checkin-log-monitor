"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/log", label: "Activity log" },
  { href: "/faces", label: "Faces" },
  { href: "/map", label: "Map" },
  { href: "/employees", label: "Employees" },
  { href: "/alerts", label: "Alerts" },
];

export default function NavLinks({ orientation }: { orientation: "side" | "top" }) {
  const path = usePathname();
  return (
    <nav className={orientation === "side" ? "flex flex-col gap-1" : "flex gap-1 overflow-x-auto"}>
      {ITEMS.map((i) => {
        const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
              active ? "bg-accent text-white" : "text-slate-700 hover:bg-orange-50"
            }`}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
