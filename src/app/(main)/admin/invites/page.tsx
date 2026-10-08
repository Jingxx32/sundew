import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/session";
import { listInviteCodes } from "@/lib/actions/invites";
import { CreateInviteForm } from "./_components/create-invite-form";
import { InviteList } from "./_components/invite-list";

export const dynamic = "force-dynamic";

export default async function InvitesPage() {
  const user = await requirePageUser();
  if (user.access !== "admin") notFound();
  const invites = await listInviteCodes();

  return (
    <div className="mx-auto max-w-2xl px-10 py-10">
      <h1 className="mb-1 text-[38px] font-bold tracking-[-0.035em]">Invites</h1>
      <p className="mb-10 text-sm text-muted-foreground">Codes that let someone create a full account.</p>
      <section className="rounded-2xl bg-surface p-6 shadow-card">
        <h2 className="mb-4 text-sm font-medium">New code</h2>
        <CreateInviteForm />
      </section>
      <section className="mt-6 rounded-2xl bg-surface p-6 shadow-card">
        <h2 className="mb-4 text-sm font-medium">All codes</h2>
        <InviteList invites={invites} />
      </section>
    </div>
  );
}
