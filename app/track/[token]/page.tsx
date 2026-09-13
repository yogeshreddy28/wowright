import { TrackingView } from '@/components/tracking-view';
export const metadata = {
  title: 'Private order tracking | WOW RIGHT',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return <TrackingView token={(await params).token} />;
}
