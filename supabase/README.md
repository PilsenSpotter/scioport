# Supabase Migration (ScioPort)

## 1) Create Supabase project

- Create a new project in Supabase.
- In SQL editor, run [`supabase/schema.sql`](schema.sql).

## 2) Configure Auth (Google)

- Enable Google provider in Supabase Auth settings.
- In Authentication -> URL Configuration, set Site URL to:
  - `https://scioporn.netlify.app`
- Set allowed redirect URLs to include your deployed app URL(s), e.g.:
  - `https://scioporn.netlify.app/**`
  - `https://scioporn.netlify.app/login/index.html`
  - `https://scioporn.netlify.app/login/`
  - `https://scioporn.netlify.app/index.html`
  - `http://localhost:5500/login/index.html`
  - `http://localhost:5500/index.html`
  - `http://127.0.0.1:5500/login/index.html`
  - `http://127.0.0.1:5500/index.html`

Do not leave Site URL set to `http://localhost:3000`; Supabase uses Site URL as the fallback redirect after OAuth.

Note: OAuth redirects do not work from `file://` URLs. Serve the site via HTTP (any simple static server is fine).

## 3) Fill client config

- Update [`supabase/config.js`](config.js) with:
  - `window.SUPABASE_URL`
  - `window.SUPABASE_ANON_KEY`

Use the public anon/publishable browser key. Do not use keys that start with `sb_secret_` in frontend code.
The anon/publishable key is safe to use in the browser only when RLS policies are enabled (this schema enables RLS).

## 4) Main app compatibility layer

`index.html` no longer loads Firebase SDKs. It loads:

- `supabase/config.js`
- `supabase/client.js`
- `supabase/firebase-compat.js`

The compatibility layer maps the old `firebase.auth()` / `firebase.firestore()` calls used by `index.html` onto the Supabase tables in `schema.sql`. This keeps the existing UI logic working while the app is migrated.
