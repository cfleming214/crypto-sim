// Transactional email via Resend's HTTP API (https://resend.com). Uses the
// Lambda runtime's global fetch, so it needs NO new npm dependency (keeping the
// lockfile — and its load-bearing zod overrides — untouched). No-ops when
// RESEND_API_KEY is unset, exactly like the Stripe MOCK mode, so the payout flow
// never breaks if email isn't configured yet.
//
// Setup (one time):
//   1. Create a Resend account, add + verify the sender domain (cryptocomp.app).
//   2. ampx sandbox secret set RESEND_API_KEY --identifier cflem   (paste re_...)
//   3. (optional) set PAYOUT_EMAIL_FROM env in the function resource.ts.
// Swappable: to use SES/Postmark/SendGrid instead, change only this file.

interface EmailArgs {
  to: string | undefined | null;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: EmailArgs): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.PAYOUT_EMAIL_FROM || 'CryptoComp <noreply@cryptocomp.app>';
  if (!key) { console.log('[email skipped — no RESEND_API_KEY]', subject, '→', to); return false; }
  if (!to) { console.log('[email skipped — no recipient]', subject); return false; }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html, ...(text ? { text } : {}) }),
    });
    if (!res.ok) {
      console.error('email send failed', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (e) {
    console.error('email send error', e); // never block the payout flow on email
    return false;
  }
}

// Minimal branded wrapper so both emails share a consistent look.
export function emailShell(heading: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;background:#0A0A0B;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:480px;background:#141416;border-radius:16px;padding:28px;color:#e6e6e6;">
      <tr><td style="font-size:20px;font-weight:700;color:#fff;padding-bottom:12px;">CryptoComp</td></tr>
      <tr><td style="font-size:17px;font-weight:700;color:#fff;padding-bottom:8px;">${heading}</td></tr>
      <tr><td style="font-size:14px;line-height:21px;color:#b8b8bd;">${bodyHtml}</td></tr>
      <tr><td style="font-size:11px;color:#6b6b70;padding-top:20px;">Contest prizes are paid via Stripe. Reply to this email if you didn't request this.</td></tr>
    </table>
  </td></tr></table></body></html>`;
}
