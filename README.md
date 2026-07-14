# Hennings Alternativ Jul — Admin

Admin dashboard for managing vakter, oppgaver, roles, check-in, and the pool/assignment queue for [Hennings Alternativ Jul](https://github.com/Darzaguhl/hennings-alternativ-jul). Talks to the [backend API](https://github.com/Darzaguhl/hennings-alternativ-jul-app).

React + Vite + TypeScript + Tailwind CSS. No backend of its own — pure client against the Django REST API.

## Local development

```bash
npm install
npm run dev
```

`VITE_API_BASE_URL` controls which backend it talks to. `.env.development` defaults to the preprod API for local dev.

## Deployment

Render Static Site. Build command: `npm install && npm run build`. Publish directory: `dist`. Set `VITE_API_BASE_URL` as an environment variable per Render service (preprod vs prod point at different API URLs) — Vite bakes it in at build time, so no runtime config file is needed.

Branch pattern matches the other two repos: `main` = preprod (auto-deploy), `production` = prod (fast-forwarded from `main` when promoting).
