import type { Metadata } from 'next';
import { AccountView } from '@/components/account-view';
export const metadata: Metadata = {
  title: 'My Account',
  description: 'View WOW RIGHT orders and saved delivery addresses.',
};
export default function AccountPage() {
  return <AccountView />;
}
