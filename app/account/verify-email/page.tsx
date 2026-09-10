import type { Metadata } from 'next';
import { VerifyEmailView } from '@/components/account-token-flow';
export const metadata: Metadata = { title: 'Verify Email', robots: { index: false, follow: false } };
export default function Page() { return <VerifyEmailView />; }
