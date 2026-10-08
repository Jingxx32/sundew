"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LockKeyhole, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { SundewLogo } from "@/components/sundew-logo";
import { canUse, type Access } from "@/lib/access/features";
import {
  ADMIN_NAVIGATION,
  PRIMARY_NAVIGATION,
  SECONDARY_NAVIGATION,
  isNavigationItemActive,
  type NavigationItem,
} from "@/lib/navigation";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function NavigationLink({ item, pathname, locked }: { item: NavigationItem; pathname: string; locked: boolean }) {
  const Icon = item.icon;
  const active = isNavigationItemActive(item, pathname);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        active ? "bg-accent-soft font-semibold text-accent" : "text-muted-foreground hover:bg-surface-blue hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
      <span>{item.label}</span>
      {locked && <LockKeyhole className="ml-auto h-3.5 w-3.5 text-subtle-foreground" aria-label="Invite only" />}
    </Link>
  );
}

function isLocked(item: NavigationItem, access: Access) {
  return item.feature ? canUse(access, item.feature) !== true : false;
}

function MobileNavigation({ pathname, access }: { pathname: string; access: Access }) {
  const moreItems = [...SECONDARY_NAVIGATION, ...(access === "admin" ? ADMIN_NAVIGATION : [])];
  const moreIsActive = moreItems.some((item) => isNavigationItemActive(item, pathname));
  return (
    <nav aria-label="Primary navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-surface/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-4">
        {PRIMARY_NAVIGATION.map((item) => {
          const Icon = item.icon;
          const active = isNavigationItemActive(item, pathname);
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40", active ? "text-accent" : "text-muted-foreground")}>
              <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.1 : 1.8} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <Dialog>
          <DialogTrigger asChild>
            <button type="button" aria-label="Open more navigation" className={cn("flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40", moreIsActive ? "text-accent" : "text-muted-foreground")}>
              <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
              <span>More</span>
            </button>
          </DialogTrigger>
          <DialogContent className="bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-3 right-3 top-auto w-auto max-w-none translate-x-0 translate-y-0 p-4 sm:max-w-none">
            <DialogHeader><DialogTitle>More</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-1.5">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const active = isNavigationItemActive(item, pathname);
                return (
                  <DialogClose key={item.href} asChild>
                    <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40", active ? "bg-accent-soft text-accent" : "text-muted-foreground hover:bg-surface-blue hover:text-foreground")}>
                      <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{item.label}
                      {isLocked(item, access) && <LockKeyhole className="ml-auto h-3.5 w-3.5 text-subtle-foreground" aria-label="Invite only" />}
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

export function Sidebar({ account, access }: { account: { primary: string; secondary: string }; access: Access }) {
  const pathname = usePathname();
  return (
    <>
      <aside className="hidden min-h-screen w-[216px] shrink-0 flex-col border-r border-border/80 bg-surface px-4 py-5 md:flex">
        <Link href="/today" className="mb-8 flex w-fit rounded-lg py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><SundewLogo priority /></Link>
        <nav className="flex flex-col gap-1" aria-label="Primary navigation">
          {PRIMARY_NAVIGATION.map((item) => <NavigationLink key={item.href} item={item} pathname={pathname} locked={isLocked(item, access)} />)}
          <p className="mb-1 mt-6 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Workspace</p>
          {SECONDARY_NAVIGATION.map((item) => <NavigationLink key={item.href} item={item} pathname={pathname} locked={isLocked(item, access)} />)}
          {access === "admin" && ADMIN_NAVIGATION.map((item) => <NavigationLink key={item.href} item={item} pathname={pathname} locked={isLocked(item, access)} />)}
        </nav>
        <Link
          href="/account"
          className="mt-auto rounded-lg border-t border-border/70 px-3 pt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <p className="truncate text-xs font-medium" title={account.primary}>{account.primary}</p>
          <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            {account.secondary}
          </p>
        </Link>
      </aside>
      <MobileNavigation pathname={pathname} access={access} />
    </>
  );
}
