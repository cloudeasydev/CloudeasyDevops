import { randomUUID } from "node:crypto";
import { eq, type SQL } from "drizzle-orm";
import type { MySqlColumn, MySqlTable } from "drizzle-orm/mysql-core";
import { db } from "./index.js";

function tableIdColumn(table: MySqlTable): MySqlColumn {
  return (table as unknown as { id: MySqlColumn }).id;
}

/** MySQL has no INSERT … RETURNING; insert then select by id. */
export async function insertReturning<TTable extends MySqlTable>(
  table: TTable,
  values: TTable["$inferInsert"],
): Promise<TTable["$inferSelect"]> {
  const idColumn = tableIdColumn(table);
  const rowValues = { ...values } as TTable["$inferInsert"] & { id?: string };
  if (!rowValues.id) {
    rowValues.id = randomUUID();
  }
  await db.insert(table).values(rowValues);
  const [row] = await db.select().from(table).where(eq(idColumn, rowValues.id)).limit(1);
  if (!row) {
    throw new Error("Insert succeeded but row could not be loaded");
  }
  return row;
}

/** MySQL has no UPDATE … RETURNING; update then select matching row. */
export async function updateReturning<TTable extends MySqlTable>(
  table: TTable,
  set: Partial<TTable["$inferInsert"]>,
  where: SQL | undefined,
): Promise<TTable["$inferSelect"] | undefined> {
  if (!where) {
    throw new Error("updateReturning requires a where clause");
  }
  await db.update(table).set(set as Record<string, unknown>).where(where);
  const [row] = await db.select().from(table).where(where).limit(1);
  return row;
}
