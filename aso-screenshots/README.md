# CryptoComp — App Store screenshot kit

Branded marketing frames (headline + device + background) rendered to **exact**
App Store dimensions. You supply the real app screens; this handles the design and sizing.

## Use it

1. **Render the templates** (placeholders):
   ```
   node generate.mjs
   ```
   Output lands in `out/<size>/slide-01…06.png`.

2. **Drop in real captures** — put your app screenshots in `screens/` as
   `01.png … 06.png`. Any tall portrait capture works (they're `cover`-cropped to
   the device screen). Simulator captures (`xcrun simctl io booted screenshot`) or
   on-device screenshots are both fine.

3. **Re-render**:
   ```
   node generate.mjs
   ```
   Now `out/` has store-ready PNGs with your real screens framed in.

## What gets produced

| Folder | Device | Pixels | App Store type |
|---|---|---|---|
| `out/iphone_67` | iPhone 6.7" | 1290×2796 | `APP_IPHONE_67` (primary requirement) |
| `out/iphone_65` | iPhone 6.5" | 1242×2688 | `APP_IPHONE_65` |
| `out/iphone_55` | iPhone 5.5" | 1242×2208 | `APP_IPHONE_55` |

iPad has a different aspect ratio (4:3) — say the word and I'll add an iPad layout.

## Customize

Everything is in `generate.mjs`:
- `HEADLINES` / `SLIDES` — the caption copy per slide.
- `ACCENT_1` / `ACCENT_2` / `BG` — brand colors.
- `SIZES` — output device sizes.

Re-run `node generate.mjs` after any edit.

## Notes

- Rendering uses headless Google Chrome (no extra installs).
- These are **marketing frames**; the app screens inside must be genuine captures —
  App Review requires screenshots to reflect the actual app.
- To publish: the ASC API can upload `out/<size>/*` to the matching screenshot set
  on the editable 1.3.8 version (per locale). Ask Claude to wire the uploader when
  your real screens are in.
