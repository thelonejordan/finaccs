# FinAccs - Financial Dashboard

A personal finance dashboard for tracking bank transactions, categorizing expenses, and visualizing spending patterns.

## Tech Stack

**Backend:**
- Python 3.11+
- Django 5.2
- MySQL database
- Redis (optional caching)

**Frontend:**
- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- Recharts (charts)
- Radix UI (tooltips)

## Prerequisites

- [Python 3.11+](https://www.python.org/downloads/)
- [uv](https://docs.astral.sh/uv/getting-started/installation/) - Python package manager
- [Node.js 20+](https://nodejs.org/) and npm
- [Redis](https://redis.io/) (optional) - For server-side caching

## Project Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd finaccs
```

### 2. Backend Setup

Install Python dependencies using uv:

```bash
uv sync
```

Run database migrations:

```bash
uv run python manage.py migrate
```

If migration `extractions.0003_ensure_resolved_for_all_transactions` fails with a lock timeout (e.g. MySQL 1205), stop other processes using the DB, then run the backfill manually and fake the migration:

```bash
uv run python manage.py backfill_resolved_transactions
uv run python manage.py migrate extractions 0003 --fake
uv run python manage.py migrate
```

### 3. Frontend Setup

Navigate to the frontend directory and install dependencies:

```bash
cd frontend
npm install
cd ..
```

### 4. Add Bank Statement Data

Place your bank statement files in the `bank_accs/data/` directory:

```bash
mkdir -p bank_accs/data
# Copy your bank statement files here
```

**Supported file formats:**
- `.txt` - Plain text bank statements (comma-separated)
- `.xlsx`, `.xls` - Excel files (supports password-protected files)
- `.csv` - CSV files (pending support)

### 5. Configure Environment Variables (Optional)

Copy the example environment file and customize:

```bash
cp .env.example .env
```

**Environment Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | - | Django secret key (required in production) |
| `DEBUG` | `False` | Django debug mode |
| `ALLOWED_HOSTS` | - | Comma-separated allowed hosts |
| `DATABASE_URL` | - | MySQL connection string |
| `CORS_ALLOWED_ORIGINS` | - | Comma-separated CORS origins |
| `DEV_MODE` | `0` | Enable dev features (API docs, django-extensions) |
| `REDIS_ENABLED` | `0` | Enable Redis caching |
| `REDIS_HOST` | `127.0.0.1` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_USERNAME` | `default` | Redis username |
| `REDIS_PASSWORD` | - | Redis password |
| `VITE_API_BASE` | `http://localhost:8000` | Frontend API base URL |

**DEBUG vs DEV_MODE:**
- `DEBUG=True`: Enables Django debug mode (detailed error pages, no caching). Should be `False` in production. Backend only - frontend doesn't use this.
- `DEV_MODE=1`: Enables developer features (API docs at `/api/docs/`, django-extensions). Can be enabled independently of DEBUG.

### 6. Enable Redis Caching (Optional)

Redis caching improves API response times for dashboard data and inconsistency detection.

**Install and start Redis:**
```bash
# macOS
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt install redis-server
sudo systemctl start redis
```

**Enable in `.env`:**
```bash
REDIS_ENABLED=1
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password  # If authentication is enabled
```

Without Redis, the application works normally but may have slower response times for complex queries.

## Running the Development Servers

**Note:** Vite uses `base: "/"` for dev server and `base: "/static/"` for builds. This is configured in `frontend/vite.config.ts` so routes work correctly in both modes.

### Option 1: Run Both Servers (Recommended)

Open two terminal windows/tabs:

**Terminal 1 - Backend:**
```bash
uv run python manage.py runserver
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Access at http://localhost:5173

### Option 2: Django Only (No Vite Dev Server)

Build frontend and serve from Django:

```bash
# Build frontend
cd frontend && npm run build && cd ..

# Symlink to frontend_dist (recommended for dev)
ln -sf frontend/dist frontend_dist

# Or copy instead
cp -r frontend/dist frontend_dist

# Collect static files
uv run python manage.py collectstatic --noinput

# Run Django
uv run python manage.py runserver
```

Access at http://localhost:8000

## API Endpoints

Main API groups (enable `DEV_MODE=1` to access `/api/docs/` for full OpenAPI docs):

| Prefix | Description |
|--------|-------------|
| `/api/summary/`, `/api/monthly/`, `/api/categories/` | Dashboard analytics |
| `/api/transactions/` | Bank transactions CRUD |
| `/api/accounts/` | Bank accounts management |
| `/api/credit-cards/`, `/api/credit-card-transactions/` | Credit card management |
| `/api/cc-payment-*` | CC payment matching |
| `/api/bank-inconsistencies/`, `/api/credit-card-inconsistencies/` | Anomaly detection |
| `/api/extractions/` | Extraction pipeline (source files, artifacts, data sources) |

## Project Structure

```
finaccs/
├── bank_accounts/          # Bank accounts app (models, views)
├── bank_accs/              # Bank statement data directory
│   └── data/               # Place bank statement files here
├── credit_cards/           # Credit cards app (models, views)
├── dashboard/              # Dashboard/transactions app
├── extractions/            # PDF/CSV extraction pipeline
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # React page components
│   │   └── lib/            # API client, caches, theme
│   └── package.json
├── project/                # Django project settings
├── pyproject.toml          # Python dependencies (uv)
├── manage.py               # Django CLI
├── .env.example            # Environment template
└── MODELLING.md            # Data model documentation
```

## Features

- **Dashboard:** Summary cards, monthly charts, category breakdown, top expenses
- **Bank Transactions:** Browse, search, filter, and categorize bank transactions
- **Credit Card Transactions:** Track credit card spending with category management
- **CC Payment Matching:** Match bank payments to credit card transactions
- **Anomaly Detection:** Identify duplicate transactions and balance gaps
- **Extraction Pipeline:** Upload and process PDF/CSV bank statements
- **Console:** Manage bank accounts and credit cards
- **Dark/Light Mode:** Theme toggle in the header

## Documentation

- **[Development Workflow](docs/CONTRIB.md)** - Setup, running dev servers, available scripts, environment variables
- **[Operations Guide](docs/RUNBOOK.md)** - Docker deployment, manual deployment, health checks, troubleshooting

## Development Notes

### Database Reset

To reset the database and start fresh:

```bash
# Drop and recreate the MySQL database, then run migrations
uv run python manage.py migrate
```

### Creating a Superuser

To access Django admin:

```bash
uv run python manage.py createsuperuser
```

Then visit http://localhost:8000/admin/

### Building for Production

```bash
cd frontend
npm run build
```

The built files will be in `frontend/dist/`.
