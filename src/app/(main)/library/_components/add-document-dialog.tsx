"use client";

import { useActionState, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { InviteOnlyNote } from "@/components/invite-only-note";
import { useFeatureLocked } from "@/components/access-context";
import {
  createDocument,
  type CreateDocumentResult,
} from "@/lib/actions/documents";

export function AddDocumentDialog() {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const locked = useFeatureLocked("upload");

  const [state, action, pending] = useActionState<
    CreateDocumentResult | null,
    FormData
  >(
    async (_previousState, formData) => {
      const result = await createDocument(null, formData);

      if (result.ok) {
        formRef.current?.reset();
        setOpen(false);
      }

      return result;
    },
    null,
  );

  if (locked) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button disabled>
          <Plus className="h-4 w-4" />
          Add Document
        </Button>
        <InviteOnlyNote />
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Add Document
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add a French document</DialogTitle>
          <DialogDescription>
            Paste any French text — an article, a book chapter, a journal
            entry, or transcribed audio. Sundew will analyse it and let you
            generate writing tasks from it.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} action={action} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="title">
              Title
            </label>
            <Input
              id="title"
              name="title"
              placeholder="e.g. Le Petit Prince — Chapitre 2"
              required
            />
            {state && !state.ok && state.errors.title && (
              <p className="text-xs text-danger">{state.errors.title}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="source">
                Source
              </label>
              <Input
                id="source"
                name="source"
                placeholder="Le Monde, Camus, Personal…"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="type">
                Type
              </label>
              <select
                id="type"
                name="type"
                className="flex h-9 w-full rounded-[var(--radius-field)] border border-border bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                defaultValue="other"
              >
                <option value="literature">Literature</option>
                <option value="news">News</option>
                <option value="personal">Personal</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="sourceUrl">
              Source URL <span className="text-subtle-foreground">(optional)</span>
            </label>
            <Input
              id="sourceUrl"
              name="sourceUrl"
              type="url"
              placeholder="https://…"
            />
            {state && !state.ok && state.errors.sourceUrl && (
              <p className="text-xs text-danger">{state.errors.sourceUrl}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="content">
              Content (French)
            </label>
            <Textarea
              id="content"
              name="content"
              placeholder="Paste your French text here…"
              required
              className="min-h-[200px] text-base leading-relaxed"
            />
            {state && !state.ok && state.errors.content && (
              <p className="text-xs text-danger">{state.errors.content}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add to Library"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
