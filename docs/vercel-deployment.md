# Vercel API packaging

The app exposes its API through `src/app/api/[...endpoint]/route.ts`. Internal CommonJS handlers live in `server/handlers/` and are imported by that route. Keep internal handlers out of a root `api/` directory: Vercel also discovers that directory as standalone functions, duplicating the same endpoints outside Next and consuming the Hobby function quota.

The failed main deployment f5b2e66 compiled successfully but was rejected while deploying outputs with `exceeded_serverless_functions_per_deployment`. Adding the notes endpoint brought the root handlers to eleven, on top of the Next functions. Moving those handlers under `server/` preserves all public `/api/...` URLs, authentication, and behavior while removing duplicate function discovery. No database migration or account-plan upgrade is required for this packaging fix.

Run `npm ci`, `npm test`, `npm run build`, and a local `vercel build` to check deployment packaging. Inspect `.vercel/output/functions` for the actual function bundles; a Next build alone does not expose Vercel's additional root-API discovery. The API-layout regression prevents reintroducing a root `api/` directory.

Validated the fix using a clean lockfile install, Node 24.21.0, and Vercel CLI 59.25.4. Local production build output contains eight unique function bundles (eleven entries including aliases), with only the Next catch-all API bundles under `functions/api/` and no standalone endpoint bundles. All eleven public API URLs retain their expected responses; the API bundle includes every relocated handler. Production deployment remains a separate user action.
