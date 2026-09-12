import { SiteHeader } from './site-header';
import { SiteFooter } from './site-footer';
import { WhatsAppHelpLink } from './whatsapp-help-link';
export function AppShell({
  children,
  whatsappContext,
  hideFloatingWhatsApp = false,
}: {
  children: React.ReactNode;
  whatsappContext?: { productName?: string; productURL?: string };
  hideFloatingWhatsApp?: boolean;
}) {
  return (
    <>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
      {!hideFloatingWhatsApp && (
        <WhatsAppHelpLink
          className="whatsapp-floating"
          productName={whatsappContext?.productName}
          productURL={whatsappContext?.productURL}
        />
      )}
    </>
  );
}
