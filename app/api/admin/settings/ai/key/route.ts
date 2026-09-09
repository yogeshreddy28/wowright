import { env } from 'cloudflare:workers';
import { verifyAdmin } from '@/lib/admin-auth';
import { createD1AIConfigRepository } from '@/lib/services/ai-settings-repository';

export async function DELETE(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const repository = createD1AIConfigRepository(env.DB);
    await repository.removeKey();
    await repository.audit('ai_key_removed');
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: 'AI key could not be removed.' },
      { status: 500 },
    );
  }
}
