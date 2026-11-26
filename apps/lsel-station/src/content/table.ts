// A helper for the content tables: their ids in the order written.

/** A content table's ids, in the order written. */
export function idsOf<T extends Record<string, unknown>>(table: T): (keyof T & string)[] {
  // Object.keys is typed string[]; for a literal table the keys are exactly keyof T
  return Object.keys(table) as (keyof T & string)[];
}
