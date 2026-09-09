import { AdminOrderDetail } from '@/components/admin-order-detail';
export default async function Page({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <AdminOrderDetail id={orderId} />;
}
