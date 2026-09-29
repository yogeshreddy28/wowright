import type { Metadata } from 'next';
import { FieldBookingApp } from '@/components/field-booking-app';

export const metadata: Metadata = {
  title: 'Retail field bookings | WOW RIGHT',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <FieldBookingApp />;
}
