# ABRO Kenya Product Catalog & AI Assistant

ABRO Kenya is a product catalog and customer-support application for browsing ABRO products, comparing carton and piece pricing, and asking an AI assistant product and usage questions. It also includes an admin workspace for maintaining catalog data and product images.

## Features

- Searchable product catalog with category filters and alphabetical product ordering.
- Product details, specifications, usage instructions, and VAT-aware piece/carton pricing.
- Product inquiry list and catalog exports to Excel and Word.
- Gemini-powered AI assistant for catalog questions and product guidance.
- Optional Google sign-in for saving and managing AI chat sessions with Firebase.
- Admin tools for product management, bulk spreadsheet imports, catalog enrichment, context editing, analytics, and audit history.
- Product image uploads to Cloudinary and product image replacement.
- Firebase Firestore persistence, with local JSON files used as a fallback by the server.

## Requirements

- Node.js with npm.
- Firebase project configuration for the client and Google sign-in (if customer authentication is needed).
- A Gemini API key for AI assistant and AI enrichment features.
- Cloudinary credentials for server-signed image uploads and image deletion.

## Getting started

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Create a `.env` file in the project root and set the server-side secrets described in [Configuration](#configuration). Do not commit `.env` or paste secret values into source files.

3. Check that `firebase-applet-config.json` contains the Firebase web app configuration for the intended project. It is read by the browser client and by the server for the Firebase project/database identifiers.

4. Start the development server:

   ```bash
   npm run dev
   ```

   The Express server and Vite development middleware run together at `http://localhost:3000`.

## Configuration

Set server secrets through `.env` for local development and through the hosting provider's secret/environment-variable settings for deployment.

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | For AI features | Gemini API access for chat, enrichment, and AI-powered parsing. |
| `ADMIN_PASSWORD` | Required for admin access | Password for admin login. Set a strong, unique value. If unset, admin login and protected routes return a configuration error. |
| `PORT` | Optional | HTTP port. Defaults to `3000`; set this to the port provided by the hosting platform. |
| `CLOUDINARY_CLOUD_NAME` | For Cloudinary | Cloudinary cloud name. |
| `CLOUDINARY_API_KEY` | For Cloudinary | Cloudinary API key. |
| `CLOUDINARY_API_SECRET` | Required for image replacement cleanup | Enables signed uploads and deletion of replaced app-managed Cloudinary images. Keep this server-side only. Without it, an unsigned upload may succeed but the previous asset cannot be deleted. |
| `CLOUDINARY_UPLOAD_PRESET` | For unsigned fallback | Cloudinary upload preset used when signed upload is unavailable. |
| `CLOUDINARY_FOLDER` | Optional | Cloudinary destination folder; defaults to `AbroKenya`. |
| `ALLOW_SANDBOX_IFRAME` | Optional | Set to `true` only when the app must be embedded in a sandboxed preview. |

The browser Firebase configuration is stored in `firebase-applet-config.json`. Enable Google under Firebase Authentication sign-in providers and add each local or production hostname to Firebase Authentication's authorized domains. For server-side Firestore access, configure Application Default Credentials or the hosting platform's equivalent service identity with access to the configured Firestore database.

Cloudinary API secrets and Gemini API keys must never be exposed in client-side code or committed to the repository. Review `.env.example` before using it as a template, and replace any real values with placeholders before sharing or committing it.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run the Express server with Vite development middleware. |
| `npm run lint` | Run the TypeScript compiler in no-emit validation mode. |
| `npm test` | Run behavioral tests for operational health routes and port configuration. |
| `npm run build` | Build the Vite client and bundle the Express server to `dist/server.cjs`. |
| `npm start` | Start the production server from `dist/server.cjs` (run `npm run build` first). |
| `npm run preview` | Run Vite's static preview server for the built client. This does not replace the Express production server. |
| `npm run clean` | Remove generated `dist` output and `server.js`. |

## Production build and start

```bash
npm ci
npm run build
npm start
```

The production server serves the built client and API from the same Express process. It listens on `PORT`, defaulting to `3000`; set `PORT` to the port provided by the hosting platform. Supply production secrets through the platform's secret manager/environment configuration, and ensure the service identity can access Firestore if Firestore persistence is enabled.

## Health checks and CI

- `GET /health/live` returns `200` when the process can respond.
- `GET /health/ready` returns `503` until datastore and server middleware initialization completes, then returns `200`.
- GitHub Actions runs TypeScript validation, behavioral tests, and a production build on pushes and pull requests.

## Data and persistence

- `data/products.json` contains the local product catalog and is used by the local JSON fallback.
- `data/context_document.txt` contains the context document used to ground the assistant.
- Product reads are cached in the server process for 15 seconds. Successful product writes invalidate that cache.
- Product image replacements reuse a stable SKU-based Cloudinary public ID when signed uploads are enabled and delete an older app-managed asset after the catalog update succeeds. Keep `CLOUDINARY_API_SECRET` configured for cleanup of existing assets.
- Firebase browser authentication and customer chat/session persistence use the project in `firebase-applet-config.json`.
- The server uses Firebase Admin credentials when available and falls back to local JSON persistence when Firestore is unavailable.

## Repository structure

```text
src/
  components/       React UI, catalog, admin tools, and AI assistant
  firebase.ts       Firebase client initialization and Firestore helpers
  cloudinaryUpload.ts
  productImageStore.ts
server.ts           Express API, Gemini integration, persistence, and production hosting
data/               Local catalog and context data
firebase-applet-config.json
```
