import { env } from 'cloudflare:workers';
import { verifyAdmin } from '@/lib/admin-auth';
import {
  getDataResetPreview,
  getOperationalClassificationPreview,
  classifyCurrentOperationalData,
  resetScopes,
  resetTestData,
  type ResetScope,
} from '@/lib/services/data-reset';

export async function GET(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const [preview, classification] = await Promise.all([
    getDataResetPreview(env.DB),
    getOperationalClassificationPreview(env.DB),
  ]);
  return Response.json({ preview, classification });
}

export async function PUT(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = (await request.json()) as { token?: string; confirmationText?: string };
    if (body.confirmationText !== 'MARK AS TEST')
      return Response.json({ error: 'Type MARK AS TEST to continue.' }, { status: 400 });
    const result = await classifyCurrentOperationalData(env.DB, body.token || '');
    return Response.json({ ok: true, result });
  } catch (error) {
    if (error instanceof Error && error.message === 'OPERATIONAL_DATA_CHANGED')
      return Response.json({ error: 'Operational data changed after the preview. Review the refreshed counts before trying again.' }, { status: 409 });
    return Response.json({ error: 'The records could not be classified. No catalogue or configuration data was targeted.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = (await request.json()) as {
      scopes?: unknown;
      confirmed?: boolean;
      confirmationText?: string;
    };
    if (!Array.isArray(body.scopes) || !body.scopes.length)
      return Response.json({ error: 'Choose at least one reset option.' }, { status: 400 });
    const scopes = body.scopes.filter((value): value is ResetScope =>
      typeof value === 'string' && resetScopes.includes(value as ResetScope),
    );
    if (scopes.length !== body.scopes.length)
      return Response.json({ error: 'One or more reset options are invalid.' }, { status: 400 });
    const all = resetScopes.every((scope) => scopes.includes(scope));
    if (!body.confirmed || (all && body.confirmationText !== 'RESET TEST DATA'))
      return Response.json({ error: all ? 'Type RESET TEST DATA to continue.' : 'Confirm the reviewed reset first.' }, { status: 400 });
    const result = await resetTestData(env.DB, scopes);
    return Response.json({ ok: true, result });
  } catch {
    return Response.json({ error: 'The reset could not be completed. No catalogue or configuration data was targeted.' }, { status: 500 });
  }
}
