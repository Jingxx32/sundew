/**
 * Sample-workspace fixture format. Rows are keyed by Drizzle property names.
 * Timestamp columns hold an offset in milliseconds from export time; primary keys
 * and references to owned rows hold symbolic refs ("documents#3"); user_id is
 * omitted. Pure: no database access.
 */
import { getTableColumns } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { OWNED_TABLES } from "@/lib/account/owned-tables";

export type FixtureRow = Record<string, unknown>;

export type WorkspaceFixture = {
  version: 1;
  exportedAt: string;
  shared: { vocabularyLookups: Array<{ lemma: string; surface: string }> };
  /** Keyed by SQL table name. */
  tables: Record<string, FixtureRow[]>;
};

/** Owned tables that never enter the sample: copyrighted exam content and paid features. */
export const FORBIDDEN_TABLE = /^(tcf_|speaking_|quiz_)/;
/** Owned tables the sample skips: operational state, not learning data. */
export const SKIPPED_TABLES = new Set(["invite_redemptions", "review_backfill_jobs"]);
/** References to another owned row without a declared foreign key (see Task 13 Step 1). */
export const POLYMORPHIC_COLUMNS: Record<string, string> = {
  review_evidence: "attemptId",
  practice_run_items: "attemptId",
};

export type ColumnKind = "pk" | "ref" | "polymorphic" | "timestamp" | "user" | "plain";
export type ColumnPlan = { key: string; kind: ColumnKind; forbiddenTarget?: string };
export type SeedTable = { name: string; table: PgTable; rows: Record<string, unknown>[] };

/** Owned tables that may appear in a fixture, parents first. */
export const SAMPLE_TABLES = OWNED_TABLES.filter((t) => !FORBIDDEN_TABLE.test(t.name) && !SKIPPED_TABLES.has(t.name));
const OWNED_NAMES = new Set(OWNED_TABLES.map((t) => t.name));

export function columnPlan(table: PgTable): ColumnPlan[] {
  const config = getTableConfig(table);
  const keyOf = new Map(Object.entries(getTableColumns(table)).map(([key, column]) => [column.name, key]));
  const refs = new Set<string>();
  const forbidden = new Map<string, string>();
  for (const fk of config.foreignKeys) {
    const reference = fk.reference();
    const parent = getTableConfig(reference.foreignTable);
    const parentPk = parent.columns.filter((c) => c.primary);
    reference.columns.forEach((column, i) => {
      if (column.name === "user_id") return;
      if (FORBIDDEN_TABLE.test(parent.name)) forbidden.set(column.name, parent.name);
      else if (OWNED_NAMES.has(parent.name) && parentPk.length === 1 && reference.foreignColumns[i].name === parentPk[0].name) refs.add(column.name);
    });
  }
  const singlePk = config.columns.filter((c) => c.primary).length === 1;
  return config.columns.map((column): ColumnPlan => {
    const key = keyOf.get(column.name)!;
    if (column.name === "user_id") return { key, kind: "user" };
    if (forbidden.has(column.name)) return { key, kind: "plain", forbiddenTarget: forbidden.get(column.name) };
    if (refs.has(column.name)) return { key, kind: "ref" };
    if (singlePk && column.primary) return { key, kind: "pk" };
    if (POLYMORPHIC_COLUMNS[config.name] === key) return { key, kind: "polymorphic" };
    if (column.columnType.startsWith("PgTimestamp")) return { key, kind: "timestamp" };
    return { key, kind: "plain" };
  });
}

const isRef = (kind: ColumnKind) => kind === "pk" || kind === "ref" || kind === "polymorphic";

/** Export side: raw Drizzle rows per sample table → fixture. Ids are globally unique strings. */
export function encodeFixture(rowsByTable: Map<string, FixtureRow[]>, shared: WorkspaceFixture["shared"], exportedAt: Date): WorkspaceFixture {
  const refOf = new Map<string, string>();
  for (const { name, table } of SAMPLE_TABLES) {
    const pk = columnPlan(table).find((c) => c.kind === "pk");
    if (pk) (rowsByTable.get(name) ?? []).forEach((row, i) => refOf.set(String(row[pk.key]), `${name}#${i + 1}`));
  }
  const tables: Record<string, FixtureRow[]> = {};
  for (const { name, table } of SAMPLE_TABLES) {
    const rows = rowsByTable.get(name) ?? [];
    if (!rows.length) continue;
    const plan = columnPlan(table);
    tables[name] = rows.map((row) => {
      const out: FixtureRow = {};
      for (const column of plan) {
        if (column.kind === "user") continue;
        const value = row[column.key];
        if (column.forbiddenTarget && value != null) {
          throw new Error(`${name}.${column.key} points at ${column.forbiddenTarget}; the sample must not reference exam or quiz content`);
        }
        if (value == null) out[column.key] = null;
        else if (isRef(column.kind)) {
          const ref = refOf.get(String(value));
          if (!ref) throw new Error(`${name}.${column.key} = ${String(value)} has no exported target`);
          out[column.key] = ref;
        } else if (column.kind === "timestamp") out[column.key] = (value as Date).getTime() - exportedAt.getTime();
        else out[column.key] = value;
      }
      return out;
    });
  }
  return { version: 1, exportedAt: exportedAt.toISOString(), shared, tables };
}

/** Seed side: fresh ids, timestamps shifted to `now`, the new owner. Parents first. */
export function decodeFixture(fixture: WorkspaceFixture, userId: string, now: Date, newId: () => string): { tables: SeedTable[]; unknownKeys: string[] } {
  const plans = new Map(SAMPLE_TABLES.map((t) => [t.name, columnPlan(t.table)]));
  for (const name of Object.keys(fixture.tables)) if (!plans.has(name)) throw new Error(`Fixture table ${name} is not a sample table`);
  const idOf = new Map<string, string>();
  for (const { name } of SAMPLE_TABLES) {
    const pk = plans.get(name)!.find((c) => c.kind === "pk");
    if (pk) for (const row of fixture.tables[name] ?? []) idOf.set(String(row[pk.key]), newId());
  }
  const unknownKeys: string[] = [];
  const tables = SAMPLE_TABLES.filter((t) => fixture.tables[t.name]?.length).map(({ name, table }) => {
    const plan = plans.get(name)!;
    const known = new Set(plan.map((c) => c.key));
    for (const key of Object.keys(fixture.tables[name][0])) if (!known.has(key)) unknownKeys.push(`${name}.${key}`);
    const rows = fixture.tables[name].map((row) => {
      const out: Record<string, unknown> = {};
      for (const column of plan) {
        if (column.kind === "user") { out[column.key] = userId; continue; }
        if (!(column.key in row)) continue; // added after the export: the column default applies
        const value = row[column.key];
        if (value == null) out[column.key] = null;
        else if (isRef(column.kind)) {
          const id = idOf.get(String(value));
          if (!id) throw new Error(`${name}.${column.key}: unknown ref ${String(value)}`);
          out[column.key] = id;
        } else if (column.kind === "timestamp") out[column.key] = new Date(now.getTime() + Number(value));
        else out[column.key] = value;
      }
      return out;
    });
    return { name, table, rows };
  });
  return { tables, unknownKeys };
}
