# Loci — Design System

Normative. Every screen is checked against this file and the anti-slop
constraints in [AGENTS.md](../AGENTS.md) before it ships.

## Direction (decided Phase 0)

**Telegram-native.** Base surfaces and text come from Telegram theme params,
so light/dark is automatic and the app feels native. Category accents are
the only saturated color in the UI. The map is the hero on Home; all chrome
stays low-contrast until interacted with.

## Color

### Base palette (theme-derived)

CSS custom properties, defined in `globals.css`, mapped from Telegram theme
params with fallbacks for browser dev:

| Token | Source | Light fallback |
|---|---|---|
| `--lm-bg` | `--tg-theme-bg-color` | `#ffffff` |
| `--lm-surface` | `--tg-theme-secondary-bg-color` | `#f4f4f5` |
| `--lm-text` | `--tg-theme-text-color` | `#18181b` |
| `--lm-muted` | `--tg-theme-hint-color` | `#71717a` |
| `--lm-accent` | `--tg-theme-button-color` | `#3390ec` |
| `--lm-accent-text` | `--tg-theme-button-text-color` | `#ffffff` |
| `--lm-border` | `color-mix(in srgb, var(--lm-text) 12%, transparent)` | — |

Rules: no other grays; borders always via `--lm-border`; text is `--lm-text`
or `--lm-muted`, nothing in between.

### Category accents

One accent per category. Used for map marker fills (with white glyph),
category chips, and small accents on the story page — never as large
surface backgrounds.

| Category | Slug | Hex | Lucide glyph |
|---|---|---|---|
| Love | `love` | `#E5484D` | `heart` |
| Happy Moments | `happy_moments` | `#FFB224` | `smile` |
| Dreams | `dreams` | `#6E56CF` | `sparkles` |
| Education | `education` | `#3E63DD` | `graduation-cap` |
| Career | `career` | `#64748B` | `briefcase` |
| Travel | `travel` | `#0BA5EC` | `plane` |
| Friendship | `friendship` | `#F76B15` | `users` |
| Childhood | `childhood` | `#EC4899` | `baby` |
| Achievements | `achievements` | `#18A957` | `trophy` |
| Beautiful Places | `beautiful_places` | `#12A594` | `mountain` |
| Memories | `memories` | `#A9714B` | `camera` |
| Urban Legends | `urban_legends` | `#A21CAF` | `ghost` |

These hexes are the single source; Phase 2 seeds them into the categories
table, `lib/map/` styles markers from the API values. Verify marker
legibility on both light and dark map styles in Phase 5; adjust here first
if any fail.

## Icons

- **Lucide only** (`lucide-react`), never mixed with another set.
- Single-color, `currentColor`, default 24 px grid / 2 px stroke; 20 px in
  dense chrome (chips, list rows).
- Category map markers: custom SVG pin containing the category's Lucide
  glyph in white on the category accent fill — drawn once per category in
  `lib/icons/`, reused by `lib/map/`.
- No emoji anywhere in shipped UI, including toasts and empty states.

## Typography

System font stack (Telegram WebView native):
`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`.

| Role | Size / weight |
|---|---|
| Display (story title on story page) | 24 px / 600 |
| Heading (sheet titles, profile name) | 20 px / 600 |
| Title (card titles, section labels) | 17 px / 600 |
| Body | 15 px / 400 |
| Secondary (meta, hints) | 13 px / 400, `--lm-muted` |

Hierarchy comes from size/weight, not borders, shadows, or color blocks.

## Spacing & shape

- Spacing scale (px): **4, 8, 12, 16, 24, 32, 48** — nothing off-scale.
- Radius: **8** for buttons/inputs, **12** for sheets and cards,
  **full** only for pills (chips, tags) and avatars.
- Elevation: one shadow token max, only on floating layers (bottom sheet,
  map controls). Flat surfaces separated by `--lm-border`, not shadows.

## Motion

Functional only, one purpose each. Easing `cubic-bezier(0.2, 0, 0, 1)`.

| Interaction | Duration |
|---|---|
| Tap feedback (reaction, chip select) | 150 ms |
| Fades, chip expand/collapse | 200 ms |
| Bottom sheet slide-up, cluster expand | 250 ms |

No spring-bounce, no decorative parallax, no animated gradients.

## Empty states

One Lucide glyph (24 px, `--lm-muted`) + one short sentence + one action.
No illustrations, no emoji, no multi-line apologetic copy.

## MVP basemap decision (confirmed Phase 6)

- The map basemap is OpenFreeMap `positron` (light) in **both** themes for
  MVP. No dark style/provider has been approved, so the shipped app does not
  silently introduce one. All chrome, sheets, and markers are theme-correct;
  only the tiles remain light. A future dark basemap change starts here and
  requires the full light/dark marker-legibility check.

## Transactional email (auth: verification, reset, change notice)

Loci restyle of the reference mailer — plain, typography-led, and legible in any
mail client including forced dark mode.

- No emoji, no gradient headers, no decorative imagery. A small uppercase "LOCI"
  wordmark, a bold title, body copy, then the code.
- Neutral surfaces only: white card / light-gray code block (`#f4f4f5`), zinc text
  ramp; no brand-color fills behind large areas. Background is transparent so the
  client's own surface shows through.
- The 6-digit code is a single monospace, letter-spaced block — selectable, never
  an image.
- Always ships an HTML part **and** a plain-text alternative.
- Localized in en/kk/ru (`app/integrations/email.py`); codes never appear in
  production logs.

## Definition of done (every UI task)

1. Screenshot in Telegram **light** and **dark** theme params.
2. No emoji anywhere.
3. All icons from Lucide.
4. No anti-slop violation (checklist in AGENTS.md).
5. Strings come from `lib/i18n/dict.ts` in all three locales.
