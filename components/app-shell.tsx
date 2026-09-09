import { SiteHeader } from './site-header';
import { SiteFooter } from './site-footer';
import { WowCompanion } from './wow-companion/WowCompanion';
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
      <WowCompanion />
    </>
  );
}
