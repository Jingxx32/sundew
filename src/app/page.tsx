import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Access } from "@/lib/access/features";
import { getCurrentUser } from "@/lib/auth/session";
import { LandingPage } from "./_components/landing/landing-page";

export const metadata: Metadata = {
  title: "Sundew — TCF Canada practice that trains your weak spots",
  description:
    "Try one original TCF-style question and see how Sundew turns the result into a focused follow-up drill.",
};

export default async function Home() {
  let access: Access | null = null;
  try {
    access = (await getCurrentUser())?.access ?? null;
  } catch {
    // The landing page must not depend on the database being up.
  }
  // Guests (recruiters) keep the landing page: it holds the sample question and the way back.
  if (access && access !== "guest") redirect("/today");
  return <LandingPage viewer={access === "guest" ? "guest" : "visitor"} />;
}
