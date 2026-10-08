import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  Headphones,
  Layers3,
  RotateCcw,
  Settings,
  Ticket,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  matches: (pathname: string) => boolean;
};

const within = (segment: string) => (pathname: string) =>
  pathname === segment || pathname.startsWith(`${segment}/`);

export const PRIMARY_NAVIGATION: NavigationItem[] = [
  { href: "/today", label: "Today", icon: CalendarCheck, matches: (p) => p === "/" || within("/today")(p) },
  {
    href: "/training",
    label: "Training",
    icon: Layers3,
    matches: (p) => ["/training", "/practice", "/speaking", "/quiz", "/conjugation"].some((s) => within(s)(p)),
  },
  { href: "/review", label: "Review", icon: RotateCcw, matches: (p) => within("/review")(p) || within("/vocabulary")(p) },
];

export const SECONDARY_NAVIGATION: NavigationItem[] = [
  { href: "/tcf", label: "TCF Canada", icon: Headphones, matches: within("/tcf") },
  { href: "/library", label: "Library", icon: BookOpen, matches: (p) => within("/library")(p) || within("/documents")(p) },
  { href: "/progress", label: "Progress", icon: BarChart3, matches: within("/progress") },
  { href: "/settings", label: "Settings", icon: Settings, matches: within("/settings") },
  { href: "/account", label: "Account", icon: UserRound, matches: within("/account") },
];

export const ADMIN_NAVIGATION: NavigationItem[] = [
  { href: "/admin/invites", label: "Invites", icon: Ticket, matches: within("/admin") },
];

export const ALL_NAVIGATION = [...PRIMARY_NAVIGATION, ...SECONDARY_NAVIGATION];

export function isNavigationItemActive(item: NavigationItem, pathname: string) {
  return item.matches(pathname);
}
