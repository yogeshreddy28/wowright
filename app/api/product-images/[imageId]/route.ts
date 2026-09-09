import { env } from 'cloudflare:workers';
import { verifyAdmin } from '@/lib/admin-auth';

export async function GET(request: Request,{params}:{params:Promise<{imageId:string}>}) {
  const {imageId}=await params;
  const image=await env.DB.prepare(`SELECT i.storage_key,i.content_type,p.publishing_status,p.active
    FROM product_images i LEFT JOIN products p ON p.id=i.product_id WHERE i.id=?`).bind(imageId).first<{storage_key:string;content_type:string;publishing_status:string|null;active:number|null}>();
  if(!image) return new Response('Not found',{status:404});
  const isGlobal=image.publishing_status==null;
  if(!isGlobal && !(image.publishing_status==='published' && image.active) && !(await verifyAdmin(request))) return new Response('Not found',{status:404});
  const object=await env.FILES.get(image.storage_key); if(!object) return new Response('Not found',{status:404});
  return new Response(object.body,{headers:{'Content-Type':image.content_type,'Cache-Control':isGlobal||image.publishing_status==='published'?'public, max-age=86400':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
