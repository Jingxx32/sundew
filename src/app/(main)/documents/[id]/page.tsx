import { notFound } from "next/navigation";
import { getDocument } from "@/lib/actions/documents";
import { getSavedWordsByDocument } from "@/lib/actions/vocabulary";
import { ReaderShell } from "./_components/reader-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Reading" };

export default async function DocumentReaderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [doc, initialSavedWords] = await Promise.all([
    getDocument(id),
    getSavedWordsByDocument(id),
  ]);
  if (!doc) notFound();

  const paragraphs = doc.content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return <ReaderShell doc={doc} paragraphs={paragraphs} initialSavedWords={initialSavedWords} />;
}
