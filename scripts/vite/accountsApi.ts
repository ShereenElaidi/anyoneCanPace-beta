/**
 * Dev server only (`apply: 'serve'`): runs the accounts API (server/handler.ts,
 * the same code as the Cloudflare Pages Function) under /api/, on a local
 * SQLite stand-in for D1 (.cache/accounts-dev.sqlite) with migrations applied.
 * Settings come from `.dev.vars` (git-ignored; see `.dev.vars.example`).
 * Never part of a build.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { applyMigrations, sqliteD1 } from '../../server/dev/sqliteD1.ts';
import { handle } from '../../server/handler.ts';
import type { Env } from '../../server/types.ts';

/** KEY=value lines; `#` comments and blank lines ignored; optional quotes removed. */
export function parseDevVars(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

const REQUIRED = ['AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET', 'AUTH0_M2M_CLIENT_ID', 'AUTH0_M2M_CLIENT_SECRET', 'RECOVERY_PEPPER'];

async function toRequest(req: IncomingMessage, origin: string): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers.set(k, v);
    else if (Array.isArray(v)) for (const x of v) headers.append(k, x);
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && chunks.length > 0;
  return new Request(`${origin}${req.url}`, { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined });
}

async function send(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key !== 'set-cookie') res.setHeader(key, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader('set-cookie', cookies);
  res.end(Buffer.from(await response.arrayBuffer()));
}

export function accountsApi(): Plugin {
  let base = '/';
  let root = process.cwd();
  let env: Env | null = null;
  return {
    name: 'dev-accounts-api',
    apply: 'serve',
    configResolved(config) {
      base = config.base;
      root = config.root;
    },
    configureServer(server) {
      server.middlewares.use('/api', (req, res) => {
        void (async () => {
          const varsFile = join(root, '.dev.vars');
          if (!existsSync(varsFile)) {
            res.statusCode = 503;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ error: 'not-configured', message: 'Accounts aren’t set up locally: create .dev.vars (see .dev.vars.example).' }));
            return;
          }
          if (!env) {
            const vars = parseDevVars(readFileSync(varsFile, 'utf8'));
            const missing = REQUIRED.filter((k) => !vars[k]);
            if (missing.length) throw new Error(`.dev.vars is missing ${missing.join(', ')}`);
            mkdirSync(join(root, '.cache'), { recursive: true });
            const db = sqliteD1(join(root, '.cache', 'accounts-dev.sqlite'));
            await applyMigrations(db, join(root, 'migrations'));
            env = { ...(vars as unknown as Env), DB: db, APP_BASE: vars.APP_BASE || base };
          }
          const proto = (req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http';
          // `server.middlewares.use('/api', …)` strips the prefix; put it back.
          req.url = `/api${req.url === '/' ? '' : req.url}`;
          await send(res, await handle(await toRequest(req, `${proto}://${req.headers.host}`), env));
        })().catch((err: unknown) => {
          server.config.logger.error(`[accounts] ${err instanceof Error ? err.message : String(err)}`);
          res.statusCode = 500;
          res.end('Local accounts API error (see the terminal).');
        });
      });
    },
  };
}
