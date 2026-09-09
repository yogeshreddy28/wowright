import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { getCustomerFromRequest } from '@/lib/customer-auth';
import { durableRateLimit } from '@/lib/rate-limit';
import {
  CommerceError,
  safeError,
  sameOrigin,
} from '@/lib/services/launch-rules';
import { normalizeIndianPhone } from '@/lib/services/phone';
import { createHumanHandoffURL } from '@/lib/services/whatsapp';
export async function POST(request: Request) {
  const uploaded: string[] = [];
  try {
    sameOrigin(request);
    const account = await getCustomerFromRequest(request, env.DB);
    if (!account)
      throw new CommerceError(
        'Sign in before sending your request so you can approve the quote securely.',
        401,
      );
    if (!(await durableRateLimit(env.DB, 'quote:' + account.id, 5, 60000)))
      throw new CommerceError(
        'Please wait before sending another request.',
        429,
      );
    const form = await request.formData();
    const data = z
      .object({
        name: z.string().trim().min(2).max(100),
        mobile: z.string(),
        email: z.string().email().optional().or(z.literal('')),
        description: z.string().trim().min(10).max(5000),
        dimensions: z.string().max(300).optional(),
        quantity: z.coerce.number().int().min(1).max(99),
        desiredColour: z.string().max(100).optional(),
        notes: z.string().max(1000).optional(),
        requiredBy: z.string().max(10).optional(),
        budget: z.string().max(10).optional(),
        productId: z.string().max(100).optional(),
        sessionId: z.string().max(100).optional(),
      })
      .parse(Object.fromEntries(form));
    if (normalizeIndianPhone(data.mobile) !== account.mobile)
      throw new CommerceError('Use your account phone number.');
    if (
      data.productId &&
      !(await env.DB.prepare(
        "SELECT id FROM products WHERE id=? AND publishing_status='published'",
      )
        .bind(data.productId)
        .first())
    )
      throw new CommerceError('Product is unavailable.');
    const files = form
      .getAll('files')
      .filter((v): v is File => v instanceof File && v.size > 0);
    if (
      files.length > 8 ||
      files.reduce((sum, f) => sum + f.size, 0) > 40 * 1024 * 1024
    )
      throw new CommerceError('Use up to 8 files and 40 MB total.');
    for (const file of files)
      if (
        file.size > 15 * 1024 * 1024 ||
        !/\.(stl|3mf|obj|step|stp|jpe?g|png|webp|pdf)$/i.test(file.name)
      )
        throw new CommerceError(
          'Use supported reference files up to 15 MB each.',
        );
    const id = crypto.randomUUID(),
      requestNumber =
        'CQR-' +
        new Date().toISOString().slice(0, 10).replaceAll('-', '') +
        '-' +
        id.slice(0, 8).toUpperCase(),
      now = new Date().toISOString();
    const statements = [
      env.DB.prepare(
        "INSERT INTO custom_quote_requests(id,request_number,session_id,customer_id,name,mobile,email,description,dimensions,quantity,desired_colour,budget,required_by,notes,product_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'new',?,?)",
      ).bind(
        id,
        requestNumber,
        data.sessionId || null,
        account.id,
        data.name,
        account.mobile,
        data.email || null,
        data.description,
        data.dimensions || null,
        data.quantity,
        data.desiredColour || null,
        data.budget && Number.isFinite(Number(data.budget))
          ? Math.max(0, Number(data.budget))
          : null,
        data.requiredBy || null,
        data.notes || null,
        data.productId || null,
        now,
        now,
      ),
    ];
    for (const file of files) {
      const fileId = crypto.randomUUID(),
        safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120),
        key = 'custom-quotes/' + id + '/' + fileId;
      await env.FILES.put(key, file.stream(), {
        httpMetadata: { contentType: 'application/octet-stream' },
      });
      uploaded.push(key);
      statements.push(
        env.DB.prepare(
          'INSERT INTO uploaded_files(id,quote_request_id,storage_key,original_name,content_type,size,private,created_at) VALUES(?,?,?,?,?,?,1,?)',
        ).bind(
          fileId,
          id,
          key,
          safe,
          'application/octet-stream',
          file.size,
          now,
        ),
      );
    }
    statements.push(
      env.DB.prepare(
        'INSERT INTO analytics_events(id,customer_id,name,path,metadata,created_at) VALUES(?,?,?,?,?,?)',
      ).bind(
        crypto.randomUUID(),
        account.id,
        'custom_quote_submitted',
        '/custom-print',
        JSON.stringify({ requestNumber }),
        now,
      ),
    );
    await env.DB.batch(statements);
    return Response.json({
      requestNumber,
      url: createHumanHandoffURL({
        sessionId: requestNumber,
        summary:
          'Customization request: ' +
          requestNumber +
          '\u005cn' +
          data.description.slice(0, 500) +
          '\u005cnQuantity: ' +
          data.quantity,
      }),
    });
  } catch (error) {
    await Promise.all(
      uploaded.map((key) => env.FILES.delete(key).catch(() => {})),
    );
    return safeError(
      error,
      'Your request could not be saved. Please try again.',
    );
  }
}
