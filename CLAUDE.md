# CLAUDE.md

FinAccs - Personal finance dashboard: Django REST backend + React SPA frontend.

## Backend (Django)

- Python 3.11+, Django 5.2, managed with `uv`
- Apps: `bank_accounts`, `credit_cards`, `dashboard`, `extractions`, `stories`, `entities`, `links`
- All API routes prefixed with `/api/`; frontend is a catch-all SPA route
- Settings: `project/settings.py`; uses `.env` via python-dotenv
- Templates and static files served from `frontend/dist` (no `frontend_dist` symlink)
- Swagger docs at `/api/docs/` (requires `DEV_MODE=1`)

## Frontend (React)

- React, TypeScript, Vite, Tailwind CSS, Radix UI
- Located in `frontend/`; see [frontend/README.md](frontend/README.md) for scripts and structure
- Production build outputs to `frontend/dist`

## Development strategy

- Always verify after making changes. Use `curl` to confirm APIs return expected responses, both when implementing and debugging.
- Be very careful with operations that modify data in the database or alter schema destructively.
- Add or update tests for changed behavior.
- Keep documentation in sync with code changes.

## Docs

- [README.md](README.md) - setup, env vars, project structure
- [docs/CONTRIB.md](docs/CONTRIB.md) - dev workflow, available scripts
- [docs/RUNBOOK.md](docs/RUNBOOK.md) - deployment, Docker, troubleshooting
- [docs/API.md](docs/API.md) - API reference

### Design docs

- [docs/MODELLING-REVAMP.md](docs/MODELLING-REVAMP.md) - banks, accounts, credit cards data model
- [docs/DURABLE-LINKS.md](docs/DURABLE-LINKS.md) - durable, transferable links via ResolvedTransaction
- [docs/REPLACE_SOURCE.md](docs/REPLACE_SOURCE.md) - transaction resolution and safe source merging
- [docs/RESOLUTION-NEIGHBOR-TIEBREAKER.md](docs/RESOLUTION-NEIGHBOR-TIEBREAKER.md) - neighbor balance tiebreaker for resolution
- [docs/STORIES.md](docs/STORIES.md) - stories feature design
- [frontend/docs/UI.md](frontend/docs/UI.md) - UI design system
