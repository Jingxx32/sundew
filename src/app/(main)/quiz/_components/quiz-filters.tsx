"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useTransition } from "react";

import { FilterChip } from "@/components/ui/filter-chip";

const SECTIONS = [
  { label: "All sections", value: "all" },
  { label: "Reading", value: "reading" },
  { label: "Listening", value: "listening" },
  { label: "Grammar", value: "grammar" },
  { label: "Vocabulary", value: "vocabulary" },
  { label: "Dictation", value: "dictation" },
  { label: "Conjugation", value: "conjugation" },
] as const;

export function QuizFilters({ exams }: { exams: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const activeExam = searchParams.get("exam") ?? "all";
  const activeSection = searchParams.get("section") ?? "all";

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value && value !== "all") params.set(key, value);
        else params.delete(key);
      }
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="flex flex-wrap items-center gap-y-2 gap-x-4 mb-6">
      {/* Exam chips */}
      <div className="flex items-center gap-1.5 text-xs">
        <QuizFilterChip
          label="All exams"
          active={activeExam === "all"}
          onClick={() => updateParams({ exam: "all" })}
        />
        {exams.map((exam) => (
          <QuizFilterChip
            key={exam}
            label={exam}
            active={activeExam === exam}
            onClick={() => updateParams({ exam })}
          />
        ))}
      </div>

      <span className="hidden sm:block h-5 w-px bg-border" />

      {/* Section chips */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {SECTIONS.map(({ label, value }) => (
          <QuizFilterChip
            key={value}
            label={label}
            active={activeSection === value}
            onClick={() => updateParams({ section: value })}
          />
        ))}
      </div>
    </div>
  );
}

function QuizFilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <FilterChip
      active={active}
      onClick={onClick}
    >
      {label}
    </FilterChip>
  );
}
