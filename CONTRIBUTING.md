# Contributing to mcc-newark-hub

This is a private project maintained for Igreja Cristã Maranata, Newark, NJ. If you're reading this, you've been added as a collaborator — welcome.

---

## Before you start

Make sure you have:
- Node.js v18+
- Git configured with your name and email (`git config --global user.name "Your Name"`)
- Access to the Supabase project (ask the project owner for credentials)
- A `.env` file set up locally (copy `.env.example` and fill in the values)

If anything's unclear, check the [README](README.md) first.

---

## Branching

We use a simple GitFlow-inspired model:

| Branch | Purpose |
|---|---|
| `main` | Production — deploys automatically to Vercel |
| `develop` | Integration branch — merge feature branches here first |
| `feature/*` | New features (e.g., `feature/export-attendance`) |
| `fix/*` | Bug fixes (e.g., `fix/login-pin-validation`) |
| `chore/*` | Non-functional changes (deps, config, docs) |

Never push directly to `main`. Always go through a PR.

---

## Commit messages

Follow this convention:

```
type: short description (50 chars max)

Optional longer explanation if needed.
Closes #issue-number if applicable.
```

**Types:**

| Type | When to use |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `chore` | Dependency updates, config changes |
| `docs` | Documentation only |
| `refactor` | Code restructure, no behavior change |
| `style` | Formatting, no logic change |
| `test` | Adding or updating tests |

**Examples:**

```
feat: add bulk registration mode to admin dashboard
fix: handle missing email gracefully in confirmation flow
docs: update registration guide for new 4-step flow
chore: bump lucide-react to 0.400.0
```

---

## Pull requests

1. Branch off `develop` (not `main`)
2. Keep PRs focused — one feature or fix per PR
3. Write a clear PR description: what changed and why
4. If it's a UI change, include a screenshot
5. Request review from the project owner before merging

PR title should follow the same commit convention above.

---

## Code style

- JavaScript only (no TypeScript)
- Functional components and hooks — no class components
- Use `lucide-react` for icons, not inline SVGs or other libraries
- String literals for UI text go in `src/i18n/strings.js` — don't hardcode UI text in components
- Constants and seed data go in `src/constants/index.js`
- Keep components in `src/components/`, page-level views in `src/views/`

---

## Environment variables

Never commit `.env`. If you add a new env variable:
1. Add it to `.env.example` with a placeholder value
2. Document it in the README under the Environment Variables section
3. Let the project owner know so they can add it to Vercel

---

## Supabase

- The Supabase client is at `src/lib/supabase.js` — use it instead of importing the SDK directly
- RLS policies are set to `allow_all` for now — do not tighten without discussing first
- If you need to change the schema, write the SQL and share it for review before running it in production
- The legacy `eyJ...` anon key is required — the `sb_publishable...` format does not work with the custom client

---

## Questions?

Open a GitHub Discussion or reach out to the project owner directly.
