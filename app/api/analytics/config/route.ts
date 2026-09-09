export async function GET() {
  const id = process.env.META_PIXEL_ID || '';
  return Response.json({ pixelId: /^\d{5,30}$/.test(id) ? id : null });
}
