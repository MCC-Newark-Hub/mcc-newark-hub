# Deployment

## Overview

| Environment | Branch | URL | Supabase project |
|---|---|---|---|
| Production | `main` | `mcc-newark-hub.vercel.app` (`mcc-newark-events.vercel.app` also stays live for existing links) | Production project |
| Preview | any feature branch | auto-generated Vercel URL | Staging project (recommended) |

---

## Production deployment

Merging to `master` triggers an automatic Vercel build and deploy. No manual steps required.

**Build command:** `npm run build`  
**Output directory:** `dist`  
**Framework preset:** Vite

---

## Environment variables (Vercel)

Set these in **Vercel Dashboard → Project → Settings → Environment Variables**.

| Variable | Environments |
|---|---|
| `VITE_SUPABASE_URL` | Production, Preview, Development |
| `VITE_SUPABASE_KEY` | Production, Preview, Development |

For a true staging setup, configure the **Preview** environment to point to a separate Supabase project (see below).

---

## Staging setup (recommended)

This prevents feature-branch preview URLs from hitting the production database.

1. Create a second Supabase project (e.g. `mcc-newark-hub-staging`)
2. Run the base schema SQL from [setup-local.md](setup-local.md#4-create-the-base-schema)
3. Run all migrations in order
4. Seed with enough test data to develop against
5. In Vercel → Environment Variables:
   - Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` for the **Preview** environment to the staging project values
   - Keep **Production** environment variables pointing to the real project
6. Feature branches now auto-deploy against staging; `master` deploys against production

---

## Deploying a hotfix

For urgent production fixes:

1. Branch from `master`: `git checkout -b hotfix/description`
2. Fix and verify locally
3. Open a PR → merge to `master`
4. Vercel deploys automatically within ~1 minute
5. Verify in production immediately after deploy

If the fix cannot wait for a PR review, push directly to `master` (only for P0 incidents — document the reason in the commit message).

---

## Manual deploy (Vercel CLI)

If the automatic deploy fails or you need to force a redeploy:

```bash
npx vercel --prod
```

This requires the Vercel CLI (`npm i -g vercel`) and being logged in (`vercel login`).

---

## Checking deploy status

- **Vercel Dashboard** → Deployments tab shows all builds with logs
- Each commit SHA links to its deployment log
- Build failures send email notifications to the project owner

---

## Rollback

See the [Rollback runbook](runbooks/rollback.md).
