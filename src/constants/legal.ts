// Canonical legal document URLs. Hosted from the repo's `docs/` folder via
// GitHub Pages (Settings → Pages → Source: main / `/docs`). The same Privacy
// Policy URL must also be pasted into App Store Connect → App Information →
// Privacy Policy URL (App Review guideline 5.1.2).
//
// If the GitHub Pages base path changes (custom domain, different repo), update
// LEGAL_BASE — every in-app link and the sign-up consent gate read from here.
export const LEGAL_BASE = 'https://cfleming214.github.io/crypto-sim';

export const LEGAL_URLS = {
  terms:   `${LEGAL_BASE}/terms.html`,
  privacy: `${LEGAL_BASE}/privacy.html`,
  support: `${LEGAL_BASE}/support.html`,
} as const;

// Where reviewers / users can reach a human about reported content (also cited
// in the Terms' moderation clause).
export const SUPPORT_EMAIL = 'support@cryptocomp.app';
