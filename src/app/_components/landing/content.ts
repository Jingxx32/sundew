import { ERROR_TAXONOMY } from "@/lib/taxonomy";

export const ROUTE_STEPS = [
  { number: "01", label: "Attempt", detail: "One original TCF-style question" },
  { number: "02", label: "Understand", detail: "The reasoning, not just the answer" },
  { number: "03", label: "Retrain", detail: "A drill built from the same signal" },
] as const;

const categories = Object.values(ERROR_TAXONOMY);
const errorTypes = categories.reduce((n, c) => n + Object.keys(c.subcategories).length, 0);

export type FeatureCard = {
  key: "writing" | "progress" | "tcf" | "speaking";
  title: string;
  body: string;
  /** What a guest account can open (src/lib/access/features.ts). */
  inGuestTour: boolean;
  /** Points locked features at something the visitor can try now. */
  hint?: string;
};

// Guest-visible cards first: recruiters click "Try the full app" next.
export const FEATURE_CARDS: readonly FeatureCard[] = [
  {
    key: "writing",
    title: "Writing feedback",
    body: `Write in French; AI feedback sorts every error into a ${categories.length}-category taxonomy (${errorTypes} error types).`,
    inGuestTour: true,
  },
  {
    key: "progress",
    title: "Progress and weak spots",
    body: "Every error feeds a learner profile; Progress shows your weak spots and Review brings them back.",
    inGuestTour: true,
  },
  {
    key: "tcf",
    title: "TCF Canada bank",
    body: "3,000+ listening and reading questions with drill and timed-exam modes.",
    inGuestTour: false,
    hint: "Try the sample question above",
  },
  {
    key: "speaking",
    title: "Speaking",
    body: "Read aloud and get pronunciation scores from Azure Speech.",
    inGuestTour: false,
  },
];

export type FeatureTag = "In the guest tour" | "For members" | "Invite only";

export function featureTag(card: Pick<FeatureCard, "inGuestTour">, guestEnabled: boolean): FeatureTag {
  if (!card.inGuestTour) return "Invite only";
  return guestEnabled ? "In the guest tour" : "For members";
}

export const STACK = [
  "Next.js 16", "React 19", "TypeScript", "PostgreSQL + Drizzle", "Better Auth",
  "OpenAI", "Azure Speech", "Cloudflare R2", "Vercel",
] as const;

export { SOURCE_URL } from "@/lib/site";

/** Who is looking at the landing page: a signed-out visitor or a signed-in guest. */
export type LandingViewer = "visitor" | "guest";

/** Main call to action: guests continue their demo; visitors start one, or sign in when guests are off. */
export function landingCta(viewer: LandingViewer, guestEnabled: boolean): "continue" | "guest-start" | "sign-in" {
  if (viewer === "guest") return "continue";
  return guestEnabled ? "guest-start" : "sign-in";
}
