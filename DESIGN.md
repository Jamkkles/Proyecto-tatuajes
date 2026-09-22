---
name: Ink & Honor
description: Dark irezumi-ink workspace for a solo tattoo artist, with a washi-paper light mode
colors:
  ink-deep: "#07080a"
  ink-panel: "#0e1013"
  ink-sunken: "#15181d"
  line: "#23272e"
  line-soft: "#1a1d22"
  fog: "#aab6bf"
  ash: "#707b86"
  steel: "#c3d2db"
  steel-hi: "#e7eef2"
  vermillion: "#c0392f"
  danger: "#c2685f"
  status-info: "#78a0be"
  status-success: "#54c48a"
  status-warning: "#c89637"
typography:
  display:
    fontFamily: "'Cormorant Garamond', Georgia, 'Times New Roman', serif"
    fontSize: "clamp(28px, 6vw, 54px)"
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'Manrope', system-ui, 'Segoe UI', Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "'Manrope', system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.14em"
  mark:
    fontFamily: "'Pirata One', 'Cormorant Garamond', serif"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.02em"
rounded:
  flat: "3px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "18px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "20px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.steel-hi}"
    textColor: "{colors.ink-deep}"
    rounded: "{rounded.sm}"
    padding: "10px 18px"
  button-primary-hover:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink-deep}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.fog}"
    rounded: "{rounded.sm}"
    padding: "10px 18px"
  badge:
    backgroundColor: "{colors.status-info}"
    textColor: "{colors.steel-hi}"
    rounded: "{rounded.pill}"
    padding: "3px 9px"
  input:
    backgroundColor: "{colors.ink-sunken}"
    textColor: "{colors.steel-hi}"
    rounded: "{rounded.flat}"
    padding: "10px 12px"
  card:
    backgroundColor: "{colors.ink-panel}"
    rounded: "{rounded.lg}"
    padding: "20px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.ash}"
    rounded: "{rounded.sm}"
    padding: "11px 13px"
  nav-item-active:
    backgroundColor: "rgba(195, 210, 219, 0.07)"
    textColor: "{colors.steel-hi}"
---

# Design System: Ink & Honor

## Overview

**Creative North Star: "Ink & Honor"**

This name and its light-mode counterpart, "Washi," already exist verbatim in the project's own CSS comments (`AppShell.css`, `Login.css`) — this section makes that incumbent identity explicit rather than inventing a new one. The system reads as a tattoo studio's stencil-and-ink workshop translated into a dark, glass-paneled app: deep near-black ink canvases, cool steel-gray text, hairline borders, and exactly one warm color — a vermillion red the codebase's own comments call "the red of irezumi" — used with real restraint. Corners split into two deliberate dialects: flat 3px edges on stencil-like elements (the login card, form buttons, gallery cards) and soft 8–18px "glass" rounding on the app-shell surfaces that hold content (panels, stat cards, nav). A gothic blackletter mark (Pirata One) is reserved for the sidebar wordmark only, giving the brand a hand-tattooed signature without letting that voice bleed into body UI, which stays in a clean grotesque sans (Manrope) and a warm serif for display type (Cormorant Garamond).

Light mode is not a simple inversion; it's named "Washi" (rice paper) in the source and is described there as "the reverse of the irezumi" — the same structure rebuilt on warm paper tones (`#ebe8e1`/`#efece6`) with ink-dark text, keeping the vermillion accent as the one constant between both modes.

**Known drift from PRODUCT.md:** the sidebar currently hardcodes the wordmark "Hector Tattoos" / "by Héctor" (`AppShell.tsx`). PRODUCT.md records that no product brand name has been confirmed — this is leftover demo branding from the validating artist's test account, not a settled brand decision. Treat "Ink & Honor" here as the name of the *visual system*, not of the product; do not extend "Hector Tattoos" into new surfaces, and flag it to the user if a brand-naming decision is needed.

**Key Characteristics:**
- Dark-first, near-black ink canvas with a warm-paper "Washi" light mode that mirrors the same structure.
- Exactly one accent hue (vermillion), spent sparingly on status/brand marks, never as a UI-wide primary.
- Glass panels (translucent + backdrop-blur + a faint top-edge highlight) carry elevation instead of drop shadows; shadows are reserved for hover lifts and floating/modal layers, always soft and deep-set.
- Two coexisting corner languages: stencil-flat (3px) vs. glass-round (8–18px), plus full-pill badges/chips.
- An uppercase, heavily letter-spaced "eyebrow" label treatment is the connective tissue across every view.
- Literal stencil-alignment marks (hairline corner brackets) decorate key cards as a signature motif.

## Colors

The palette is almost monochrome by design — a single stepped gray-blue ink scale plus one accent — so restraint is the whole point, not a limitation.

### Primary
- **Vermillion** (`#c0392f`, token `vermillion`, CSS var `--accent`): the one warm color in the system. Used only for: the sidebar's seal/logo chip, the "by Héctor" sub-label, the active-nav-item edge indicator, the notification dot, progress bars, and the hover state of the logout button. It never fills a large surface.

### Neutral
- **Ink Deep** (`#07080a`, `--ink`): the base canvas in dark mode.
- **Ink Panel** (`#0e1013`, `--ink-2`): flat panel surfaces (uploader box, gallery cards).
- **Ink Sunken** (`#15181d`, `--ink-3`): recessed surfaces — inputs, tag chips, avatar backgrounds.
- **Line** (`#23272e`, `--line`) / **Line Soft** (`#1a1d22`, `--line-soft`): hairline borders and dividers; soft is for internal separators, line for outer edges.
- **Fog** (`#aab6bf`, `--fog`): default body text color.
- **Ash** (`#707b86`, `--ash`): muted/secondary text — eyebrow labels, metadata, placeholders.
- **Steel** (`#c3d2db`, `--steel`): medium-emphasis text and links.
- **Steel Hi** (`#e7eef2`, `--steel-hi`): highest-emphasis text (headings, values) and the fill color of primary buttons.

### Status (semantic, used only in badges/pills/progress)
- **Status Info** (`#78a0be` family, ~`rgba(120,160,190,·)`): scheduled/active states (`agendada`, `activo`).
- **Status Success** (`#54c48a` family, ~`rgba(84,196,138,·)`): completed/paid/available states (`completada`, `terminado`, `disponible`, paid session pill).
- **Status Warning** (`#c89637` family, ~`rgba(200,150,55,·)`/`rgba(148,111,42,·)`): reserved/unpaid states (`reservado`, unpaid session pill).
- **Danger** (`#c2685f`, `--danger`, background `rgba(194,104,95,0.12)`): form/validation errors only.

### Named Rules
**The One Red Rule.** Vermillion is spent on fewer than a handful of small elements per screen — a seal, an edge, a dot, a bar. If a new component wants a second saturated color, it's wrong; route it through the status palette or drop the color.

**The Danger-Is-Not-Vermillion Rule.** `--danger` (`#c2685f`, a muted rose) and the vermillion accent (`--accent`, `#c0392f`) are deliberately different reds: danger means "this form field is wrong," vermillion means "this is the brand." Don't reach for one when you mean the other, even though they're visually adjacent.

## Typography

**Display Font:** Cormorant Garamond (with Georgia, Times New Roman fallback)
**Body Font:** Manrope (with system-ui fallback)
**Mark Font:** Pirata One (blackletter, wordmark only — falls back to Cormorant Garamond)

**Character:** An elegant, slightly cold serif for display type paired with a clean, modern grotesque-sans workhorse — old-world tattoo parlor meets modern SaaS tool. Both are self-hosted (`@font-face`, latin subset only) to avoid a render-blocking Google Fonts request.

### Hierarchy
- **Display** (weight 500–700, `clamp(28px, 6vw, 54px)`, line-height ~1.02–1.1): page greetings, hero titles, project/session titles. Cormorant Garamond; often paired with an italic "em" span in `--steel` for emphasis inside the title.
- **Headline** (weight 600, 18–22px, line-height 1.1–1.2): panel/card titles (`panelbox__title`, `st-title` on sub-pages, `dash__top-title`). Cormorant Garamond.
- **Title** (weight 600, 15–20px): list item titles, sketch card titles. Cormorant Garamond for anything editorial (sketch/session names), Manrope for anything list-like (client names).
- **Body** (weight 400, 13–15px, line-height 1.5): descriptions, notes, form hints. Manrope. Keep to a readable measure (~34–60ch) where the layout allows.
- **Label** (weight 700, 10–13px, letter-spacing 0.08–0.28em, uppercase): the system's signature "eyebrow" treatment — section headers, field labels, badges, chips, tab-like filters. Manrope, always `--ash` or `--fog`.

### Named Rules
**The Eyebrow Rule.** Every section, panel, and form group is preceded by an uppercase, heavily tracked (0.08–0.28em) micro-label in `--ash`. This is more load-bearing than any single heading style — it's what makes the dense admin views (agenda, clients, projects) scannable. Never skip it to save vertical space.

**The Mark-Is-Sacred Rule.** Pirata One (the blackletter mark font) appears in exactly one place: the sidebar wordmark. Do not use it for body headings, buttons, or emphasis — it's a signature, not a display option.

## Layout

Mobile-first throughout; every page wraps its content in a page-scoped class (`.gal`, `.studio`, `.auth`, `.dash`) so light-mode tokens can be redefined locally rather than globally (see `CLAUDE.md`'s page convention). Breakpoints in active use: `380px`, `420px`, `560px`, `700px`, `900px`/`1000px` (the main desktop split point — differs slightly by page), and `1280px` for a few fine adjustments. Content is generally capped at `max-width: 1400px` and centered, with `clamp()`-based padding that scales continuously with viewport instead of stepping at breakpoints.

**App chrome:** a 268px sidebar drawer that overlays content on mobile (with a blurred backdrop) and pushes content via `margin-left` on desktop (≥900px); a sticky top bar that auto-hides on scroll-down and reappears on scroll-up or a mouse near the top edge (`useHideOnScroll`).

**The two-column admin pattern:** a narrow form/detail column (320–400px) beside a flexible content column, reused near-identically across Gallery (`.gal__body`), the agenda pages (`.st-cols`), and the dashboard's "today" split (`.split__row`) — on the agenda's own calendar page the order flips (calendar first, form second) since the calendar is the primary object there.

**Grids:** sketch and photo grids use `repeat(auto-fill, minmax(Npx, 1fr))` (230px for sketches, 92px for photos) rather than fixed column counts, so they reflow naturally at any width.

## Elevation & Depth

The system is a hybrid: flat "glass" panels carry resting elevation (translucent dark fill `rgba(14,16,19,0.74)` + `backdrop-filter: blur(8px)` + a faint radial white highlight top-right, standing in for a light source), and real box-shadows are reserved for motion — hover lifts, entrance animations, and floating/modal layers. Nothing at rest casts a shadow.

### Shadow Vocabulary
- **Card inset sheen** (`0 1px 0 rgba(255,255,255,0.03) inset`): a one-pixel light catch on the top edge of the login card — simulates a light source without a real shadow.
- **Entrance pool** (`0 30px 80px -40px rgba(0,0,0,0.9)`): deep, soft, negative-spread shadow under the login card on mount.
- **Hover lift** (`0 18px 40px -24px rgba(0,0,0,0.75)`): stat cards on hover, translated up 3px at the same time.
- **Modal/lightbox pool** (`0 24px 80px rgba(0,0,0,0.55)`): the enlarged image in sketch/photo lightboxes.
- **Sticky-bar separation** (`0 10px 26px -18px rgba(0,0,0,0.95)`): the top bar, to read as in front of scrolling content.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat (glass, not shadowed) at rest. A shadow only appears as a *response* — hover, entrance, or floating above the page. A static card should never carry a drop shadow.

## Shapes

Two deliberate corner languages coexist and both are correct, depending on what the element represents:
- **Stencil-flat** (`3px`, token `rounded.flat`): the login card, form inputs, the original `.btn` button family, gallery sketch cards — anything meant to feel like a flat paper/stencil object.
- **Glass-round** (`8–18px`, tokens `rounded.sm`–`rounded.xl`): app-shell chrome and the agenda's `.st-*` panels/buttons — nav items, stat cards, `.st-panel`, `.st-btn`. Larger surfaces (the 3D preview stage, `.st-panel`) round more (16–18px); small interactive controls (buttons, nav items) round less (8px).
- **Full pill** (`999px`): every badge, chip, tag, and status pill, with no exception observed anywhere in the codebase.

**Registration marks:** hairline L-shaped corner brackets (`14px`, 1px `--steel` border on two sides) decorate the login card and its panel wrapper — a literal reference to tattoo-stencil alignment marks.

**Dashed borders** consistently mean "optional / add / empty" — the sketch upload drop zone, the add-photo tile, empty-state boxes, and form fieldsets all use `border-style: dashed`.

### Named Rules
**The Stencil Marks Rule.** Corner registration marks are a signature flourish reserved for the most "arrival" moment in the app (login). Don't scatter them onto every card — they lose meaning if they stop being rare.

## Components

### Buttons
Two near-identical button systems exist in the codebase today and have drifted apart: `.btn` (Login, Gallery — 3px radius, 14px/20px padding, ink-sweep hover animation on `.btn` specifically in Login) and `.st-btn` (agenda pages — 8px radius, 10px/18px padding, no sweep). Both share the same primary/secondary logic below; treat `.st-btn`'s glass-round radius as canonical for new work, and flag the drift for consolidation rather than adding a third variant.
- **Shape:** flat 3px (`.btn`) or glass 8px (`.st-btn`), never pill.
- **Primary:** filled `--steel-hi` background, `--ink` text, uppercase label, heavy letter-spacing (0.12–0.16em); hover goes to pure white (`#fff`) background.
- **Secondary/Ghost:** transparent background, 1px `--line` border, `--fog` text; hover brightens border to `--ash` and text to `--steel-hi`.
- **Focus:** a 3px soft ring (`box-shadow: 0 0 0 3px rgba(195,210,219,0.25–0.3)`), never a hard outline.
- **Disabled:** opacity 0.5–0.7, `cursor: not-allowed` (or `progress` while a request is in flight).

### Badges / Chips / Pills
- **Style:** always fully rounded (999px), 1px border in the matching status hue at low opacity, background at ~15–20% opacity of the same hue, text at high-contrast tint of it.
- **Family:** status-info (scheduled), status-success (completed/paid/available), status-warning (reserved/unpaid), danger-tinted (tattooed/no-show) — see Colors → Status.
- **Filter chips** (`.chip`) use the neutral scale instead: transparent/`--ash` at rest, filled `--steel-hi`-on-`--ink` when active (`.chip--on`).

### Cards / Panels
- **Corner Style:** 16–18px on glass panels (`.st-panel`, `.statcard`, `.panelbox`), 4px on stencil-flat cards (sketch grid `.card`, login `.card`).
- **Background:** glass panels use the translucent-ink + top-highlight combo (see Elevation); flat cards use solid `--ink-2`.
- **Shadow:** none at rest; see Elevation's hover-lift/entrance-pool for the motion states.
- **Border:** always 1px `--line`.
- **Internal Padding:** `18–24px` for panels, `14px` for sketch card bodies.

### Inputs / Fields
- **Style:** sunken `--ink-3` background, 1px `--line` border, 3px radius on gallery/login forms, 8px on agenda forms (`.st-input`).
- **Focus:** border shifts to `--ash` or `--steel`; the auth form additionally adds a soft glow ring (`box-shadow: 0 0 0 3px rgba(195,210,219,0.14)`) that the agenda/gallery forms currently omit — worth carrying forward for consistency.
- **Error:** border to `--danger` plus `aria-invalid="true"`.
- **Disabled:** opacity 0.55.

### Navigation
Sidebar items are full-width, transparent at rest, 8px radius, `--ash` text with a text-shadow for legibility over the cloud-photo background. Active state adds a soft steel background wash and a 2px vermillion inset edge on the left — the only place vermillion marks "current location." Hover is a lighter steel wash with no edge. Disabled (not-yet-built) modules stay visible at 0.45 opacity rather than being hidden, signaling "coming soon" instead of pretending the feature doesn't exist.

### Signature Component: Atmos (cloud backdrop)
A shared, fixed, bottom-right cloud/smoke backdrop (`<Atmos/>`) sits behind every authenticated page at `z-index: 0`, masked into a low arc and revealed gradually on scroll (`--atmos-p` opacity ramp from ~0.34 to ~0.82). It's grayscale + high-contrast filtered so it reads as ink-wash smoke in dark mode and stays legible under light-mode "Washi" content too. Respects `prefers-reduced-motion` by disappearing entirely.

## Do's and Don'ts

### Do:
- **Do** keep vermillion to small marks (seal, indicator, dot, bar) — never a fill for a large surface (The One Red Rule).
- **Do** precede every section/group with an uppercase, tracked eyebrow label in `--ash` (The Eyebrow Rule).
- **Do** use glass panels (translucent + blur + top highlight) for resting elevation; reserve real shadows for hover/entrance/modal motion (The Flat-By-Default Rule).
- **Do** make every badge/chip/pill fully rounded (999px) — no exception exists in the current system.
- **Do** keep light mode ("Washi") token-driven via the page-scoped `[data-theme="light"] .page-class` pattern already established in `CLAUDE.md`, not a separate stylesheet.
- **Do** show not-yet-built nav items as visible-but-disabled (0.45 opacity) rather than hiding them.

### Don't:
- **Don't** use the Pirata One mark font anywhere but the sidebar wordmark (The Mark-Is-Sacred Rule).
- **Don't** confuse `--danger` (muted rose, form errors only) with the vermillion `--accent` (brand/status only) — they're intentionally different reds.
- **Don't** add a third button system alongside `.btn` and `.st-btn`; consolidate toward `.st-btn`'s glass-round 8px radius instead.
- **Don't** scatter the stencil corner-marks motif onto ordinary cards — it's reserved for arrival moments like login (The Stencil Marks Rule).
- **Don't** extend the hardcoded "Hector Tattoos" / "by Héctor" wordmark text into new surfaces — it's placeholder demo branding, not a confirmed product name (see PRODUCT.md).
