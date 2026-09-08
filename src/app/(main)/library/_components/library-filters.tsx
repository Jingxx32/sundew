"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useTransition } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FilterChip } from "@/components/ui/filter-chip";

const TYPES = [
  { label: "All", value: "all" },
  { label: "News", value: "news" },
  { label: "Literature", value: "literature" },
  { label: "Personal", value: "personal" },
] as const;

export function LibraryFilters({ counts }: { counts: Record<string, number> }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const activeType = searchParams.get("type") ?? "all";
  const activeQuery = searchParams.get("q") ?? "";

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    },
    [router, pathname, searchParams],
  );

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="flex items-center gap-3 mb-6">
      {/* Search */}
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-subtle-foreground" />
        <Input
          type="search"
          aria-label="Search your library"
          placeholder="Search your library…"
          className="pl-9"
          defaultValue={activeQuery}
          onChange={(e) => updateParams({ q: e.target.value, type: activeType === "all" ? "" : activeType })}
        />
      </div>

      {/* Type chips */}
      <div className="flex items-center gap-1.5 text-xs">
        {TYPES.map(({ label, value }) => {
          const count = value === "all" ? total : (counts[value] ?? 0);
          const isActive = activeType === value;
          return (
            <FilterChip
              key={value}
              active={isActive}
              onClick={() => updateParams({ type: value === "all" ? "" : value, q: activeQuery })}
            >
              {label} ({count})
            </FilterChip>
          );
        })}
      </div>
    </div>
  );
}
