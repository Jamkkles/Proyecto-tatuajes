# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Independent tattoo artists — solo operators, not studios with shared staff. Each account belongs to one artist who runs their own business alone and does both the artistic work (placing/fitting a design on a client's body) and the administrative work (scheduling, tracking what clients owe and have paid). Requirements were captured with a real professional tattoo artist in Curicó, Chile (Héctor Salazar Moya) who validates the platform against his own studio's workflow.

## Product Purpose

Unify a solo tattoo artist's fragmented workflow — today split across paper stencils, generic calendar apps, and manual notes — into one web platform. The current MVP covers: a cloud-backed sketch gallery, 3D previsualization that drapes an uploaded sketch onto an anatomical body model so an artist and client can find placement and scale before anything touches skin, and an agenda that models an appointment the way tattoo work actually happens (client → project → session, each session carrying its own price/payment and progress photos). Success looks like fewer wasted stencils/placement iterations and a clean, trustworthy record of each client's history and what they owe.

## Positioning

Unlike a generic scheduling app or paper-stencil placement, this platform is purpose-built around two things tattoo work specifically needs: 3D-anatomical sketch previsualization (find placement/scale on a body model instead of wasting stencil material or guessing), and an appointment model shaped around tattoo projects (a session is an appointment with its own price and paid amount, nested under a client's project) rather than a generic calendar event.

## Operating Context

Used from a browser, client-server, requires an internet connection. Artists use it both at a desk for admin work and in-studio during consultations (placement previews, booking), so mobile/responsive usability matters. Sketches are uploaded as flat images (JPG/PNG/WEBP/GIF, ≤5MB).

## Capabilities and Constraints

Implemented today (see `CLAUDE.md` for exact API contracts) — this is the scope design work should target:
- Email/password auth (JWT, 7-day expiry).
- Sketch gallery: upload, tag, filter, edit metadata, delete; pluggable local/Cloudinary storage.
- 3D previsualization: drape a sketch onto a pre-built anatomical 3D model (full body, arm, leg, torso) and link the scene to a project. No user-uploaded 3D models, no AR/live-skin overlay.
- Agenda: clients → projects → sessions (each session = one appointment: date, time, duration, price, paid amount) → session photos. Calendar view queries sessions by date range.
- Strict per-artist data isolation: every query filters by the owning artist's `user_id`; a foreign id in a URL returns 404 (not 403), and a foreign reference in a request body is rejected.

Explicitly out of scope for design work right now (user decision, 2026-09-14): automated cost quoting from sketch analysis, inventory management, and WhatsApp appointment reminders. These are described as future work in the project's thesis (`memoria.md`) but are not built — do not design screens or flows for them yet.

Each account is one independent artist; there is no shared/multi-staff studio account model, and none is currently planned.

## Brand Commitments

No product/brand name has been decided yet (explicitly left open by the user). Do not invent or commit to a name, logo, or tagline in design work — use a neutral placeholder until a name is confirmed.

## Evidence on Hand

`memoria.md` / `memoria.pdf` (this project's engineering thesis, Universidad de Talca) documents the researched problem and the rationale for each module, validated through interviews with a real professional tattoo artist in Curicó, Chile. Useful as background on user pain points, not as source copy. No confirmed testimonials, press, case studies, or brand/logo assets exist yet — do not fabricate them.

## Product Principles

1. One artist's whole workflow — placing the design and running the business — belongs in one tool, not several disconnected ones.
2. Placement decisions (where and how big a tattoo sits on the body) should be explorable digitally before anything touches skin or wastes stencil material.
3. An appointment is never just a calendar slot — it's tied to a client, a project, and what's owed/paid, and that structure should stay visible in the UI.
4. An artist's data is theirs alone; cross-artist access is refused without even revealing that a foreign record exists.
5. Design only for what's real: the quoting, inventory, and WhatsApp-reminder modules described in the thesis don't exist yet and are out of scope until built.
