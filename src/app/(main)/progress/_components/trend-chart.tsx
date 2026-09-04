"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import type { TrendBucket } from "@/lib/actions/errors";
import { cn } from "@/lib/utils";

const WINDOWS = [30, 90, 365] as const;
type WindowDays = (typeof WINDOWS)[number];

type Props = {
  data: TrendBucket[];
  windowDays: WindowDays;
};

function TrendTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: { payload: TrendBucket }[];
}) {
  if (!active || !payload?.length) return null;
  const bucket = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-sm space-y-0.5">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-accent">
        {bucket.density !== null ? `${bucket.density} errors / 100 words` : "No writing this week"}
      </p>
      <p className="text-muted-foreground">
        {bucket.errors} error{bucket.errors === 1 ? "" : "s"} · {bucket.words.toLocaleString()} words
      </p>
    </div>
  );
}

/** Weekly error density (errors / 100 words) as the headline line, with words
 *  written as volume bars — practice volume and quality read separately. */
export function TrendChart({ data, windowDays }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function setWindow(w: WindowDays) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("window", String(w));
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  }

  const isEmpty = data.length === 0 || data.every((b) => b.words === 0 && b.errors === 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Error density</h2>
          <p className="text-[11px] text-muted-foreground">
            errors per 100 words · bars show words written
          </p>
        </div>
        <div className="flex gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindow(w)}
              className={cn(
                "px-3 h-7 rounded-full text-xs transition-colors",
                w === windowDays
                  ? "bg-foreground text-background font-medium"
                  : "bg-surface text-muted-foreground hover:text-foreground border border-border/60",
              )}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>

      <div className="h-64 relative">
        {isEmpty ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No writing in this period</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 4, right: -8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="weekLabel" tick={{ fontSize: 11 }} />
              <YAxis
                yAxisId="density"
                tick={{ fontSize: 11 }}
                allowDecimals
                label={undefined}
              />
              <YAxis
                yAxisId="words"
                orientation="right"
                tick={{ fontSize: 11 }}
                allowDecimals={false}
              />
              <Tooltip content={<TrendTooltip />} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Bar
                yAxisId="words"
                dataKey="words"
                name="Words written"
                fill="var(--border)"
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
              />
              <Line
                yAxisId="density"
                type="monotone"
                dataKey="density"
                name="Errors / 100 words"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
