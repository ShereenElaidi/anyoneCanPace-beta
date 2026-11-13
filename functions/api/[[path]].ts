// Cloudflare Pages Function: every request under /api/ goes to the accounts API.
// Settings (Auth0, D1 binding `DB`) are set per Pages project; see server/types.ts.
import { handle } from '../../server/handler.ts';
import type { Env } from '../../server/types.ts';

export const onRequest = (context: { request: Request; env: Env }) => handle(context.request, context.env);
