import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LandingPage } from "./_components/landing/landing-page";

export const metadata: Metadata = {
  title: "Sundew — TCF Canada practice that trains your weak spots",
  description:
    "Try one original TCF-style question and see how Sundew turns the result into a focused follow-up drill.",
};

export default async function Home() {
  let signedIn = false;
  try {
    signedIn = Boolean(await getCurrentUser());
  } catch {
    // The landing page must not depend on the database being up.
  }
  if (signedIn) redirect("/today");
  return <LandingPage />;
}
