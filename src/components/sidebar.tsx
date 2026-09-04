"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CalendarCheck,
  PenLine,
  ListChecks,
  Repeat,
  BarChart3,
  Settings,
  Sparkles,
  Headphones,
  BookMarked,
  Mic,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  matcher?: (pathname: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/today",
    label: "Today",
    icon: CalendarCheck,
    matcher: (p) => p === "/" || p.startsWith("/today"),
  },
  {
    href: "/library",
    label: "Library",
    icon: BookOpen,
    matcher: (p) => p.startsWith("/library") || p.startsWith("/documents"),
  },
  {
    href: "/vocabulary",
    label: "Vocabulary",
    icon: BookMarked,
    matcher: (p) => p.startsWith("/vocabulary"),
  },
  {
    href: "/practice",
    label: "Practice",
    icon: PenLine,
    matcher: (p) => p.startsWith("/practice"),
  },
  {
    href: "/quiz",
    label: "Quiz",
    icon: ListChecks,
    matcher: (p) => p.startsWith("/quiz"),
  },
  {
    href: "/tcf",
    label: "TCF",
    icon: Headphones,
    matcher: (p) => p.startsWith("/tcf"),
  },
  {
    href: "/speaking",
    label: "Speaking",
    icon: Mic,
    matcher: (p) => p.startsWith("/speaking"),
  },
  {
    href: "/conjugation",
    label: "Conjugation",
    icon: Repeat,
    matcher: (p) => p.startsWith("/conjugation"),
  },
  {
    href: "/progress",
    label: "Progress",
    icon: BarChart3,
    matcher: (p) => p.startsWith("/progress"),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    matcher: (p) => p.startsWith("/settings"),
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-[200px] shrink-0 flex-col px-3 py-6">
      <Link
        href="/library"
        className="flex items-center gap-2 px-3 mb-8 group"
      >
        <Sparkles className="h-[18px] w-[18px] text-foreground" strokeWidth={2} />
        <span className="text-xl font-bold tracking-[-0.04em] text-foreground">
          Lumière
        </span>
      </Link>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.matcher
            ? item.matcher(pathname)
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-surface text-foreground font-semibold shadow-card"
                  : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.8} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          v0.2 · self
        </p>
      </div>
    </aside>
  );
}
