export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getSimulation } from "@/lib/actions/speaking-simulation";
import { SimulationWorkbench } from "../../_components/simulation-workbench";

export default async function SimulationPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const state = await getSimulation(sessionId);
  if (!state) notFound();
  return <SimulationWorkbench state={state} />;
}
