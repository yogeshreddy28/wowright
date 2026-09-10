import { env } from 'cloudflare:workers';

type Message = { to: string; subject: string; html: string };

function siteUrl() {
  return String(env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function shell(title: string, body: string, action: string, href: string) {
  return `<!doctype html><html><body style="margin:0;background:#fffaf5;font-family:Arial,sans-serif;color:#171717"><div style="max-width:560px;margin:auto;padding:36px 22px"><p style="font-weight:800;letter-spacing:.08em">WOW <span style="color:#f97316">RIGHT</span></p><div style="background:#fff;border:1px solid #eadfd5;border-radius:18px;padding:28px"><h1 style="font-size:26px;margin:0 0 14px">${title}</h1><p style="line-height:1.6;margin:0 0 24px">${body}</p><a href="${href}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;font-weight:700;padding:13px 18px;border-radius:10px">${action}</a><p style="font-size:13px;color:#666;line-height:1.5;margin:24px 0 0">If you did not request this, you can safely ignore this email.</p></div></div></body></html>`;
}

export async function sendCustomerEmail(message: Message, fetcher: typeof fetch = globalThis.fetch) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return { sent: false as const, reason: 'not_configured' as const };
  const response = await fetcher('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, ...message }),
  });
  if (!response.ok) return { sent: false as const, reason: 'provider_error' as const };
  return { sent: true as const };
}

export async function sendVerificationEmail(email: string, token: string) {
  const href = `${siteUrl()}/account/verify-email?token=${encodeURIComponent(token)}`;
  return sendCustomerEmail({
    to: email,
    subject: 'Verify your WOW RIGHT email',
    html: shell('Verify your email', 'Confirm this email address to complete checkout and receive important order updates. This link expires in 24 hours.', 'Verify email', href),
  });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const href = `${siteUrl()}/account/reset-password?token=${encodeURIComponent(token)}`;
  return sendCustomerEmail({
    to: email,
    subject: 'Reset your WOW RIGHT password',
    html: shell('Reset your password', 'Use this secure, single-use link to choose a new password. It expires in 30 minutes.', 'Reset password', href),
  });
}
