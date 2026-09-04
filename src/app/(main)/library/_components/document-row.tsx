"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  Book,
  Newspaper,
  FileText,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

import { Chip } from "@/components/ui/chip";
import { CEFR_CHIP_CLASSES, type CefrLevel } from "@/lib/cefr";
import type { Document } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { getDocumentSessionCount } from "@/lib/actions/documents";
import { DeleteDocumentDialog } from "./delete-document-dialog";

const TYPE_ICON: Record<string, LucideIcon> = {
  literature: Book,
  news: Newspaper,
  personal: FileText,
  other: FileText,
};

export function DocumentRow({
  document: doc,
  errorCount = 0,
}: {
  document: Document;
  errorCount?: number;
}) {
  const Icon = TYPE_ICON[doc.type] ?? FileText;
  const level = (doc.estimatedLevel ?? "B1") as CefrLevel;
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [sessionCount, setSessionCount] = useState<number>(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    window.document.addEventListener("mousedown", handleMouseDown);
    return () => window.document.removeEventListener("mousedown", handleMouseDown);
  }, [menuOpen]);

  return (
    <>
      <div className="group relative flex items-center gap-4 rounded-xl px-4 py-3 hover:bg-surface transition-colors border border-transparent hover:border-border/60">
        {/* Full-row link overlay */}
        <Link
          href={`/documents/${doc.id}`}
          className="absolute inset-0 rounded-xl"
          aria-label={`Open ${doc.title}`}
        />

        {/* Type icon */}
        <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg bg-surface-muted text-muted-foreground relative z-10 pointer-events-none">
          <Icon className="h-4 w-4" strokeWidth={1.7} />
        </div>

        {/* Title + meta */}
        <div className="min-w-0 flex-1 relative z-10 pointer-events-none">
          <div className="text-base font-medium text-foreground truncate">
            {doc.title}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {doc.source ? `${doc.source} · ` : ""}
            {doc.wordCount.toLocaleString()} words · added{" "}
            {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}
          </div>
        </div>

        {/* Level chip + error count */}
        <div className="hidden sm:flex items-center gap-2 shrink-0 relative z-10 pointer-events-none">
          <Chip className={cn("ring-0", CEFR_CHIP_CLASSES[level])}>{level}</Chip>
          <Link
            href={`/progress?documentId=${doc.id}`}
            className="text-xs text-muted-foreground tabular-nums w-16 text-right hover:text-accent transition-colors relative z-10 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {errorCount} {errorCount === 1 ? "error" : "errors"}
          </Link>
        </div>

        {/* Row actions menu */}
        <div ref={menuRef} className="relative z-10 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setMenuOpen((o) => !o);
            }}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md text-subtle-foreground transition-colors",
              "opacity-0 group-hover:opacity-100",
              "hover:bg-surface-muted hover:text-foreground",
              menuOpen && "opacity-100 bg-surface-muted text-foreground",
            )}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-36 rounded-xl border border-border bg-surface shadow-lg py-1">
              <button
                type="button"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-danger hover:bg-danger-soft rounded-lg transition-colors w-full"
                onClick={async (e) => {
                  e.preventDefault();
                  setMenuOpen(false);
                  const n = await getDocumentSessionCount(doc.id);
                  setSessionCount(n);
                  setDeleteOpen(true);
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Dialog is always mounted outside the menu conditional so it survives menu close */}
      <DeleteDocumentDialog
        id={doc.id}
        title={doc.title}
        sessionCount={sessionCount}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}
