import { verifyAdmin } from '@/lib/admin-auth';
import { getAIEncryptionMaster } from '@/lib/services/ai-runtime';
import { validateAIEncryptionKey } from '@/lib/services/ai-secret-crypto';

export async function GET(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json(
    {
      encryptionConfigured: validateAIEncryptionKey(getAIEncryptionMaster()),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
