import { env } from 'cloudflare:workers';
import { sha256 } from '@/lib/customer-auth';
import { readCookie } from '@/lib/services/google-auth';
export async function GET(request: Request) {
  const state = readCookie(request, 'wow_google_oauth');
  if (!state) return Response.json({ pending: false }, { status: 401 });
  const row = await env.DB.prepare('SELECT pending_email,pending_name,return_to,expires_at,completed_at FROM google_oauth_states WHERE state_hash=?').bind(await sha256(state)).first<{ pending_email: string | null; pending_name: string | null; return_to: string; expires_at: string; completed_at: string | null }>();
  if (!row?.completed_at || !row.pending_email || row.expires_at <= new Date().toISOString()) return Response.json({ pending: false }, { status: 401 });
  return Response.json({ pending: true, email: row.pending_email, name: row.pending_name, returnTo: row.return_to }, { headers: { 'Cache-Control': 'no-store' } });
}
