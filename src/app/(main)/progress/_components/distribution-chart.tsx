"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";
import { CATEGORY_STYLES } from "@/lib/category-styles";
import { ERROR_TAXONOMY } from "@/lib/taxonomy";
import type { ErrorCategory } from "@/lib/taxonomy";

type Props = {
  counts: Record<ErrorCategory, number>;
};

export function DistributionChart({ counts }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const data = Object.entries(counts)
    .map(([cat, count]) => ({
      cat: cat as ErrorCategory,
      label: ERROR_TAXONOMY[cat as ErrorCategory]?.label ?? cat,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  function handleBarClick(entry: { cat: ErrorCategory }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("category", entry.cat);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Distribution</h2>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 8, left: 8, bottom: 0 }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onClick={(e: any) => {
              if (e?.activePayload?.[0]?.payload) {
                handleBarClick(e.activePayload[0].payload as { cat: ErrorCategory });
              }
            }}
          >
            <XAxis
              type="number"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => (Number.isInteger(v) ? String(v) : "")}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fontSize: 11 }}
              width={90}
            />
            <Tooltip cursor={{ fill: "var(--surface-muted)" }} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} className="cursor-pointer">
              {data.map((entry) => (
                <Cell
                  key={entry.cat}
                  fill={CATEGORY_STYLES[entry.cat].chartColor}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
