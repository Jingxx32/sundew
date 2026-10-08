/**
 * Every table that holds one user's data, derived from the schema so a new
 * table cannot be forgotten. Shared by account deletion, the sample-workspace
 * exporter and the sample seeder. Pure: no database access.
 */
import { is, sql, type SQL } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";

export type OwnedTable = { name: string; table: PgTable; scope: (userId: string) => SQL };

/** Tables with a user_id that this registry must not purge, and why. */
export const EXCLUDED_TABLES: Record<string, string> = {
  sessions: "Better Auth; cascades when the users row is deleted",
  accounts: "Better Auth; cascades when the users row is deleted",
};

/** Owned tables without user_id, scoped through their parent rows. */
const CHILD_SCOPES: Record<string, (userId: string) => SQL> = {
  quiz_passages: (userId) =>
    sql`${schema.quizPassages.setId} in (select ${schema.quizSets.id} from ${schema.quizSets} where ${schema.quizSets.userId} = ${userId})`,
  quiz_questions: (userId) =>
    sql`${schema.quizQuestions.passageId} in (select ${schema.quizPassages.id} from ${schema.quizPassages} join ${schema.quizSets} on ${schema.quizSets.id} = ${schema.quizPassages.setId} where ${schema.quizSets.userId} = ${userId})`,
};

const allTables = (Object.values(schema) as unknown[]).filter((value): value is PgTable => is(value, PgTable));

function collectOwned(): OwnedTable[] {
  const owned: OwnedTable[] = [];
  for (const table of allTables) {
    const { name, columns } = getTableConfig(table);
    if (name in EXCLUDED_TABLES) continue;
    const userColumn = columns.find((column) => column.name === "user_id");
    if (userColumn) owned.push({ name, table, scope: (userId) => sql`${userColumn} = ${userId}` });
    else if (CHILD_SCOPES[name]) owned.push({ name, table, scope: CHILD_SCOPES[name] });
  }
  return owned;
}

/** Foreign-key edges [child, parent] between owned tables. */
export function ownedEdges(tables: OwnedTable[]): Array<[string, string]> {
  const names = new Set(tables.map((t) => t.name));
  const edges: Array<[string, string]> = [];
  for (const { name, table } of tables) {
    for (const fk of getTableConfig(table).foreignKeys) {
      const parent = getTableConfig(fk.reference().foreignTable).name;
      if (parent !== name && names.has(parent)) edges.push([name, parent]);
    }
  }
  return edges;
}

/** Kahn's algorithm: parents before children, ties alphabetical. Throws on a cycle. */
export function parentsFirst(names: string[], edges: Array<[string, string]>): string[] {
  const pending = new Map(names.map((n) => [n, new Set<string>()]));
  for (const [child, parent] of edges) pending.get(child)?.add(parent);
  const order: string[] = [];
  while (pending.size) {
    const ready = [...pending].filter(([, parents]) => parents.size === 0).map(([n]) => n).sort();
    if (!ready.length) throw new Error(`Foreign-key cycle among: ${[...pending.keys()].join(", ")}`);
    for (const name of ready) {
      order.push(name);
      pending.delete(name);
      for (const parents of pending.values()) parents.delete(name);
    }
  }
  return order;
}

const collected = collectOwned();
const byName = new Map(collected.map((t) => [t.name, t]));

/** Parents first — the insert order. */
export const OWNED_TABLES: OwnedTable[] = parentsFirst([...byName.keys()], ownedEdges(collected)).map((n) => byName.get(n)!);
/** Children first — the delete order. */
export const OWNED_DELETE_ORDER: OwnedTable[] = [...OWNED_TABLES].reverse();
