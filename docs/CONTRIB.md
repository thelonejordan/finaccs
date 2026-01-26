# Development Workflow

## Prerequisites

- Python 3.11+
- Node.js 20+
- uv (Python package manager)
- MySQL (optional, SQLite default)

## Environment Setup

```bash
# Clone and setup
cp .env.example .env
uv sync                      # Python deps
cd frontend && npm install   # Frontend deps
```

## Running Development Server

### Option A: Django only (no frontend dev)

```bash
# Build frontend and link/copy to frontend_dist
cd frontend && npm run build

# Option 1: Symlink (recommended for dev)
ln -sf frontend/dist frontend_dist

# Option 2: Copy
cp -r frontend/dist frontend_dist

# Collect static and run
python manage.py collectstatic --noinput
python manage.py runserver
```

### Option B: Vite + Django (hot reload)

```bash
# Terminal 1: Vite dev server
cd frontend && npm run dev   # Runs on :5173

# Terminal 2: Django backend
python manage.py runserver   # Runs on :8000

# Frontend served from Vite, API from Django
# Set VITE_API_BASE=http://localhost:8000 in frontend/.env
```

## Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| Frontend Dev | `npm run dev` | Vite dev server with HMR |
| Frontend Build | `npm run build` | TypeScript + Vite production build |
| Frontend Lint | `npm run lint` | ESLint check |
| Frontend Preview | `npm run preview` | Preview production build |
| Django Server | `python manage.py runserver` | Django dev server |
| Collect Static | `python manage.py collectstatic` | Collect for Whitenoise |
| Migrations | `python manage.py migrate` | Run database migrations |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SECRET_KEY` | Prod | insecure-key | Django secret key |
| `DEBUG` | No | True | Debug mode |
| `ALLOWED_HOSTS` | Yes | localhost | Comma-separated hosts |
| `DATABASE_URL` | No | SQLite | MySQL URL |
| `CORS_ALLOWED_ORIGINS` | No | localhost:5173 | CORS origins |
| `DEV_MODE` | No | 0 | Enable API docs |
| `REDIS_ENABLED` | No | 0 | Enable Redis cache |
| `VITE_API_BASE` | No | localhost:8000 | Frontend API base |
