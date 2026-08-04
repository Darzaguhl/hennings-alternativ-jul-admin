# Hennings Alternativ Jul — Admin dashboard

Admin dashboard for managing vakter, oppgaver, roles, check-in, and the
pool/assignment queue for a 56-year-old Oslo Christmas charity. React +
Vite + TypeScript + Tailwind CSS. **No backend of its own** — a pure
client against the Django REST API in a separate repo.

Related repos (not in this checkout):
- Backend API — `Darzaguhl/hennings-alternativ-jul-app` (Django REST
  Framework; this dashboard's `VITE_API_BASE_URL` points at it).
- Public website — `Darzaguhl/hennings-alternativ-jul` (volunteer
  registration form, no login; links here via an "Admin" button).

## Stack

React 19 + TypeScript, Vite 8, Tailwind CSS v4 (CSS-based `@theme` tokens,
not a `tailwind.config.js`), `react-router-dom` v7, `chart.js`/`react-chartjs-2`
for the dashboard charts, `qrcode` for rendering check-in codes. Linting via
`oxlint`, not ESLint. **No test framework** — no Jest/Vitest dependency, no
test files.

## Build / run / lint commands (verified working)

```bash
npm install
npm run dev        # vite — local dev server, default port 5173
npm run build        # tsc -b && vite build — typecheck + production build
npm run lint           # oxlint
npm run preview          # serve the built dist/ locally
```

`npm run build` is the typecheck step — there's no separate `tsc --noEmit`
script, but `npx tsc -b` on its own works too if you want typecheck without
a full build.

`npm run lint` currently reports 2 pre-existing warnings on a clean
checkout (`react/only-export-components` in `src/context/AuthContext.tsx`
and `src/context/EventContext.tsx`, both from exporting a hook alongside
the provider component in the same file). Don't treat these as something
you introduced unless your diff touches those exact lines.

There is no automated test suite — verification is manual: run `npm run
dev`, log in, and exercise the page you changed in a browser.

## Folder structure

```
src/
  main.tsx                Entry point
  App.tsx                   Route table — <AuthProvider> wraps everything;
                              protected routes are nested under
                              <ProtectedRoute> (which itself wraps them in
                              <EventProvider> — see Conventions)
  api/
    client.ts                Single API surface: tokenStore (localStorage
                               access/refresh tokens), the request()
                               wrapper (401 → refresh → retry once), and
                               the `api.*` namespace of typed methods
                               (api.events(), api.shifts(), api.x1Signups(), ...)
  context/
    AuthContext.tsx            user/login/logout, backed by api/client.ts
    EventContext.tsx             Event list + selected event, persisted to
                                   localStorage (`haj_admin_selected_event`)
  components/
    Layout.tsx                  Sidebar nav — each nav item's visibility is
                                  gated by the selected event's viewer_role
    ProtectedRoute.tsx            Auth gate + mounts <EventProvider>
    ui.tsx                          Shared primitives: Card, PageHeader,
                                     Button, Input, Select, Label, Badge,
                                     ErrorText — see Conventions
  pages/                       One file per route: Dashboard, Vakter,
                                Frivillige, Pool, Innsjekk, Roller,
                                Arrangement, Historikk, Oppgaver, Login,
                                AcceptInvite
  utils/roles.ts               hasAdminAccess()/isOwner() — role-gating
                                helpers, see Conventions
  types.ts                     TypeScript types mirroring backend
                                serializer shapes (Shift, OppgaveSlot,
                                User, Event, X1Signup, ...) — no codegen,
                                kept in sync by hand
  index.css                    Tailwind v4 import + @theme color tokens
```

## Key conventions

- **All API access goes through `api.*` in `src/api/client.ts`**, not ad
  hoc `fetch`. Its `request()` wrapper attaches the bearer token, and on a
  401 calls `refreshAccessToken()` (deduped via a shared in-flight promise
  so concurrent 401s don't each fire their own refresh) and retries once.
  Add new endpoints as a new `api.*` method there, following the existing
  ones' shape, rather than calling `fetch` directly from a page/component.
- **Provider nesting matters**: `EventProvider` is mounted *inside*
  `ProtectedRoute`, not at the app root — `useEvents()` only works for
  already-authenticated routes, by design (event data is meaningless
  before login). A component that calls `useEvents()` outside that subtree
  throws immediately (`"useEvents must be used within EventProvider"`) —
  that's the intended failure mode, not a bug to route around.
- **Role gating is per-event, not global.** `selectedEvent.viewer_role`
  (from `EventContext`) is what every page checks — via
  `hasAdminAccess(role)` / `isOwner(role)` from `utils/roles.ts` — never a
  standalone "is this user an admin" flag on `User`. The same person can
  have different roles on different events (owner of one, checkin_staff on
  another), and `Layout.tsx`'s nav visibility is the reference example of
  how to gate a new page/section correctly.
- **Reuse `src/components/ui.tsx`** (`Card`, `PageHeader`, `Button`,
  `Input`, `Select`, `Label`, `Badge`, `ErrorText`) instead of writing raw
  Tailwind classes for the same kind of element inline. `Badge` in
  particular has a `tone` prop (`neutral`/`critical`/`success`/`warning`) —
  use it rather than inventing new badge styling per page.
- **The color palette in `src/index.css`'s `@theme` block matches the
  public website's CSS custom properties** (same green/gold/cream/ink
  hex values) — the two repos deliberately share a brand palette even
  though they're unrelated codebases. If a brand color changes, it needs
  updating in both places; nothing keeps them in sync automatically.
- **`VITE_API_BASE_URL` is baked in at Vite build time**, not read at
  runtime — unlike the public website repo, which swaps a plain JS
  `config.js` file per-environment. Changing it requires a rebuild, not
  just editing a deployed file. See Gotchas for the local-dev implication.

## Deploy

Render Static Site. Build command: `npm install && npm run build`. Publish
directory: `dist`. `VITE_API_BASE_URL` is set as a Render env var per
service (preprod vs prod point at different API URLs). Branch pattern
matches the other two repos: `main` = preprod (auto-deploy on push),
`production` = prod (fast-forwarded from `main` when promoting) — same
convention documented in this repo's own README.

## Workflow

Feature branches + PRs into `main` (same as the backend/app repo; unlike
the public website repo, which pushes straight to `main`) — see git log
for the pattern.

## Gotchas

- **`.env.local` does NOT override `.env.development`** in this project's
  Vite setup, despite that being documented Vite precedence elsewhere.
  `.env.development` (committed, defaults to the preprod API) is what
  actually wins locally. To point the dev server at a local backend:
  back up `.env.development` (`cp .env.development .env.development.orig`),
  overwrite it directly with `VITE_API_BASE_URL=http://localhost:8000`,
  test, then restore the backup — confirm `git status --short` shows no
  diff afterward. Don't rely on `.env.local` for this.
- **No runtime env swap** — see the `VITE_API_BASE_URL` note above under
  Conventions. A code change that assumes the API URL can be swapped
  without a rebuild (e.g. reading it from `window` at runtime) doesn't
  match how this app is actually deployed.
- **No test suite and no CI** — nothing catches a broken build/lint
  automatically. Run `npm run build` and `npm run lint` yourself before
  opening a PR, and manually click through whatever page changed.
- **`localStorage` (not a secure store) holds both the JWT tokens and the
  selected-event id.** That's an accepted tradeoff for this internal admin
  tool (unlike the volunteer-facing mobile app, which uses
  `expo-secure-store` on native platforms) — don't "fix" it by adding
  encryption/secure-storage machinery unless asked; it'd be inconsistent
  with how the rest of a browser-based SPA already works here.
