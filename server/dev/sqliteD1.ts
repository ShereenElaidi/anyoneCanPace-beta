/**
 * A small stand-in for Cloudflare D1 on top of Node's built-in SQLite, for the
 * local dev API (scripts/vite/accountsApi.ts) and tests. D1 is SQLite too, so
 * the same SQL and migrations run unchanged. Node only: never deployed.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { D1Database, D1PreparedStatement, D1Result } from '../types.ts';

export function sqliteD1(path = ':memory:'): D1Database & { exec(sql: string): void } {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON'); // D1 enforces foreign keys

  const statement = (sql: string, values: SQLInputValue[] = []): D1PreparedStatement & { runSync(): D1Result } => {
    const runSync = (): D1Result => {
      const s = db.prepare(sql);
      if (s.columns().length > 0) return { results: s.all(...values) as unknown[], meta: { changes: 0 } };
      const r = s.run(...values);
      return { results: [], meta: { changes: Number(r.changes) } };
    };
    return {
      bind: (...v) => statement(sql, v),
      first: async <T>() => ((db.prepare(sql).get(...values) as T | undefined) ?? null),
      all: async <T>() => runSync() as D1Result<T>,
      run: async () => runSync(),
      runSync,
    };
  };

  return {
    prepare: (sql) => statement(sql),
    // D1 runs a batch as one transaction.
    batch: async (statements) => {
      db.exec('BEGIN');
      try {
        const out = statements.map((s) => (s as ReturnType<typeof statement>).runSync());
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    exec: (sql) => db.exec(sql),
  };
}

/** Applies every `migrations/*.sql` not applied yet, in order (like `wrangler d1 migrations apply`). */
export async function applyMigrations(db: ReturnType<typeof sqliteD1>, dir: string) {
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)');
  const { results } = await db.prepare('SELECT name FROM _migrations').all<{ name: string }>();
  const done = new Set(results.map((r) => r.name));
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    db.exec(readFileSync(join(dir, file), 'utf8'));
    await db.prepare('INSERT INTO _migrations (name) VALUES (?)').bind(file).run();
  }
}
