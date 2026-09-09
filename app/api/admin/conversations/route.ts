import { env } from 'cloudflare:workers';
import { verifyAdmin } from '@/lib/admin-auth';
export async function GET(r: Request) {
  if (!(await verifyAdmin(r)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(r.url).searchParams.get('id');
  if (id) {
    if (id.length > 100)
      return Response.json(
        { error: 'Conversation not found' },
        { status: 404 },
      );
    const conversation = await env.DB.prepare(
      'SELECT id,channel,status,updated_at FROM conversations WHERE id=?',
    )
      .bind(id)
      .first();
    if (!conversation)
      return Response.json(
        { error: 'Conversation not found' },
        { status: 404 },
      );
    const messages = await env.DB.prepare(
      'SELECT id,role,message,created_at FROM (SELECT id,role,message,created_at FROM conversation_messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT 200) ORDER BY created_at',
    )
      .bind(id)
      .all();
    return Response.json(
      { conversation, messages: messages.results },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const result = await env.DB.prepare(
    'SELECT c.*, (SELECT message FROM conversation_messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) last_message,(SELECT COUNT(*) FROM conversation_messages WHERE conversation_id=c.id) message_count FROM conversations c ORDER BY updated_at DESC LIMIT 100',
  ).all();
  return Response.json({ conversations: result.results });
}
