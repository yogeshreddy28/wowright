import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
// Tests use an isolated in-memory SQLite database, never the live D1 catalogue.
export function testDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  class Statement {
    values: any[] = [];
    constructor(public sql: string) {}
    bind(...values: unknown[]) {
      const s = new Statement(this.sql);
      s.values = values.map((v) => (typeof v === 'boolean' ? Number(v) : v));
      return s;
    }
    async first<T>(column?: string): Promise<T | null> {
      const result = sqlite.prepare(this.sql).get(...this.values);
      return (result ? (column ? result[column] : result) : null) as T | null;
    }
    async all<T>() {
      const results = sqlite.prepare(this.sql).all(...this.values) as T[];
      return { results, success: true, meta: { changes: 0 } };
    }
    async run() {
      const result = sqlite.prepare(this.sql).run(...this.values);
      return {
        results: [],
        success: true,
        meta: {
          changes: Number(result.changes),
          last_row_id: Number(result.lastInsertRowid),
        },
      };
    }
  }
  const db = {
    prepare: (sql: string) => new Statement(sql),
    async batch(statements: Statement[]) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const s of statements) {
          if (/^\s*SELECT/i.test(s.sql)) results.push(await s.all());
          else results.push(await s.run());
        }
        sqlite.exec('COMMIT');
        return results;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as D1Database;
  return { db, sqlite };
}
