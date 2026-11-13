---
name: deploy-express-prisma-vercel
description: Configure or troubleshoot Vercel deployment for an Express TypeScript ESM backend using Prisma and tsup, including bundled handlers, static output, and Swagger assets. Use for FixItNow or similar backends; do not apply this configuration to unrelated frameworks.
---

# Deploy Express and Prisma with tsup on Vercel

Use the bundled-handler workflow when the user wants to deploy an existing Express TypeScript ESM backend with Prisma using tsup. Preserve the selected architecture and adapt project-specific paths rather than replacing a working deployment unnecessarily.

## Reference

Read [the deployment guide](references/deploy_fix.md) for complete file contents, ordered setup steps, environment configuration, and verification. The guide comes from FixItNow; its route names, environment variables, Stripe setup, and Swagger paths are project-specific examples, not requirements for every backend. Keep the user's original `deploy_fix.md` in place. If maintaining both copies, update the reference when the workflow changes.

## Inspect before editing

- Read repository instructions, Git status, package scripts, module settings, tsup configuration, Vercel configuration, app/server entry points, Prisma generation settings, and supplied logs.
- Identify the actual repository root. Do not assume the current directory is the backend root.
- Distinguish TypeScript/build failures, Vercel packaging failures, and runtime failures. Diagnose the exact error before changing configuration.
- Respect requests for diagnosis only. Follow existing user authorization for edits, pushes, or deployment; the skill itself does not authorize those actions. Database migration and seeding require an intended database target and task authorization.

## Preserve these deployment invariants

1. Keep TypeScript source files and ESM package mode. For this bundling approach, local extensionless imports can remain: tsup must resolve them before Node runs the result.
2. Generate Prisma before bundling. Use the installed dependency versions rather than upgrading Prisma in response to an update notice.
3. Bundle both `src/server.ts` and `src/app.ts` as ESM, with splitting disabled. Keep the existing `createRequire(import.meta.url)` banner where needed for CommonJS compatibility. Do not emit CommonJS with that ESM-only banner.
4. Keep the Express app default export separate from the local port-listening startup. `npm start` uses `dist/server.js`; the Vercel handler exports `dist/app.js` through `api/index.js`.
5. Use the guide's modern `buildCommand`, `functions`, and `rewrites` configuration together. Do not retain legacy `builds` entries targeting unbundled source. A path change alone is insufficient if the bundle is not generated before function packaging.
6. Provide an actual `public` directory and explicitly select it as static output. Track `public/.gitkeep` so Git preserves the folder. Do not publish the server bundle or source maps by selecting `dist` as static output.
7. Include runtime-read assets in the function. For FixItNow, these are the generated bundles, Swagger comment source files, and swagger-ui-dist assets. Inspect other projects for their own file dependencies.
8. Keep production logging independent of development-only pretty-print transports. Configure the deployed environment without committing secrets.
9. Prisma generation is not migration. The exported app may connect lazily on a query instead of executing the local startup's explicit connection call.

## Validate and report

- Run the production build and verify both expected bundles exist.
- Import the actual API entry using Node, not only tsx, to expose runtime module-resolution problems.
- Smoke-test the root response and documentation/assets when present. Use read-only API requests for database verification when authorized.
- Check the static output directory and changed files. A successful tsup build does not prove Vercel packaging or deployment succeeded.
- When deployment access and authorization exist, inspect the resulting build and runtime logs. Report separately what passed locally and what was confirmed remotely.
- If a new failure appears, diagnose it from new evidence rather than repeating a push or changing unrelated dependencies. Stop dependent work when credentials, user input, or an external change is required; state the concrete blocker.
- Keep changes limited to deployment needs and summarize the files changed, checks performed, and any unverified live behavior.
