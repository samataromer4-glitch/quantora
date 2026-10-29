# Quantora

Quantora is a modern school management web application for students, attendance, academics, finance, staff, admissions, library, inventory, reports, and school operations.

## Stack

- React 19 + TypeScript
- Vite 6
- Express
- Supabase
- Tailwind CSS v4
- PWA support
- Motion + Lucide
- Recharts
- jsPDF / Excel import-export

## Local development

Prerequisites: Node.js 22+

```bash
npm ci
npm run dev
```

The development server runs the Vite SPA through Express.

## Production build

```bash
npm ci
npm run build
npm start
```

The production server serves the compiled SPA and API from the same Express process.

## Verification

The repository includes:

```bash
npm run lint
npm run test:students-contract
node scripts/server-smoke.mjs
npm run build
```

The GitHub Actions workflow runs type-checking, student production contract checks, the production build, the runtime smoke test, and a production dependency audit.

## Optional Render deployment

The repository includes `render.yaml` as a Render service configuration. Its presence does not establish that Render is the current hosting provider or that the service is deployed. Use the following only if choosing to deploy through Render.

Build command:

```
npm ci && npm run build
```

Start command:

```
npm start
```

The `render.yaml` service definition requests Node 22, production mode, and a health check on `/`.

### Required environment variables

If using Render, set the following in its service environment:

- `SESSION_SECRET` — a long random secret; the Blueprint is configured to generate one.
- `APP_URL` — the public application origin reachable by email recipients (HTTPS in production); use localhost only for local development.
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` — server-side only; never expose these in client/mobile builds.

Set `SESSION_SECRET` to a long random value. Add `GEMINI_API_KEY` and, when email is enabled, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`/`SMTP_PASS` (or `EMAIL_USER`/`EMAIL_PASS`), and optionally `SMTP_FROM`. The configured sender must be permitted by the SMTP provider. Keep real credentials in the ignored local `.env` or hosting secret manager; `.env.example` contains placeholders only.

## Security notes

Browser sessions use an HttpOnly, SameSite cookie. Authorization tokens are not persisted in localStorage. Protected API routes enforce authenticated sessions, tenant isolation, and role-based permissions.
