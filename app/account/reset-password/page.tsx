import type { Metadata } from 'next';
import { ResetPasswordView } from '@/components/account-token-flow';
export const metadata: Metadata = { title: 'Reset Password', robots: { index: false, follow: false } };
export default function Page() { return <ResetPasswordView />; }
