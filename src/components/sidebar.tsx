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
  Headphones,
  BookMarked,
  Mic,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { SundewLogo } from "@/components/sundew-logo";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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

const MOBILE_PRIMARY_ITEMS = NAV_ITEMS.filter((item) =>
  ["/today", "/library", "/practice", "/tcf"].includes(item.href),
);

function isActive(item: NavItem, pathname: string) {
  return item.matcher ? item.matcher(pathname) : pathname.startsWith(item.href);
}

function MobileNavigation({ pathname }: { pathname: string }) {
  const primaryHrefs = new Set(MOBILE_PRIMARY_ITEMS.map((item) => item.href));
  const moreIsActive = NAV_ITEMS.some(
    (item) => !primaryHrefs.has(item.href) && isActive(item, pathname),
  );

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-surface/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-5">
        {MOBILE_PRIMARY_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                active ? "text-accent" : "text-muted-foreground",
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.1 : 1.8} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label="Open more navigation"
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                moreIsActive ? "text-accent" : "text-muted-foreground",
              )}
            >
              <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
              <span>More</span>
            </button>
          </DialogTrigger>
          <DialogContent className="left-3 right-3 top-auto bottom-[calc(4.5rem+env(safe-area-inset-bottom))] w-auto max-w-none translate-x-0 translate-y-0 p-4 sm:max-w-none">
            <DialogHeader>
              <DialogTitle>More</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-1.5">
              {NAV_ITEMS.filter((item) => !primaryHrefs.has(item.href)).map((item) => {
                const Icon = item.icon;
                const active = isActive(item, pathname);
                return (
                  <DialogClose key={item.href} asChild>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                        active
                          ? "bg-accent-soft text-accent"
                          : "text-muted-foreground hover:bg-surface-blue hover:text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                      {item.label}
                    </Link>
                  </DialogClose>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </nav>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <>
    <aside className="hidden min-h-screen w-[208px] shrink-0 flex-col border-r border-border/80 bg-surface px-4 py-5 md:flex">
      <Link
        href="/library"
        className="mb-8 flex w-fit rounded-lg py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <SundewLogo priority />
      </Link>

      <nav className="flex flex-col gap-1.5" aria-label="Primary navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                active
                  ? "bg-accent-soft text-accent font-semibold"
                  : "text-muted-foreground hover:bg-surface-blue hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-border/70 px-3 pt-4">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          v0.2 · self
        </p>
      </div>
    </aside>
    <MobileNavigation pathname={pathname} />
    </>
  );
}
