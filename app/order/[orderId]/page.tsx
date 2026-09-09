import { OrderView } from '@/components/order-view';
export default async function Page({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <OrderView id={orderId} />;
}
