# FinAccs - Financial Dashboard

A personal finance dashboard for tracking bank transactions, categorizing expenses, and visualizing spending patterns.

## Tech Stack

**Backend:**
- Python 3.11+
- Django 5.2
- SQLite database

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

For password-protected xlsx files, create a `.env` file:

```bash
echo "XLSX_PASSWORD=your_password_here" > .env
```

### 6. Load Transactions

Load transactions from bank statement files:

```bash
# Load from default file in bank_accs/data/
uv run python manage.py load_transactions

# Load from specific file
uv run python manage.py load_transactions --file bank_accs/data/statement.xlsx

# Clear existing and reload
uv run python manage.py load_transactions --clear

# Provide password for encrypted xlsx
uv run python manage.py load_transactions --file statement.xlsx --password mypassword
```

## Running the Development Servers

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

### Option 2: Run as Background Processes

```bash
# Start backend
uv run python manage.py runserver &

# Start frontend
cd frontend && npm run dev &
```

## Accessing the Application

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:8000

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/summary/` | GET | Financial summary (balance, totals) |
| `/api/monthly/` | GET | Monthly income/expense breakdown |
| `/api/categories/` | GET | Spending by category |
| `/api/transactions/` | GET | List transactions (with pagination) |
| `/api/top-expenses/` | GET | Top expenses by amount |
| `/api/accounts/` | GET, POST | Bank accounts management |
| `/api/accounts/<id>/` | GET, PUT, DELETE | Single account operations |

## Project Structure

```
finaccs/
├── bank_accs/              # Bank accounts app
│   ├── data/               # Bank statement files
│   ├── models.py           # BankAccount model
│   ├── views.py            # Account API views
│   └── urls.py             # Account URL routes
├── dashboard/              # Dashboard/transactions app
│   ├── models.py           # Transaction model
│   └── views.py            # Transaction API views
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── lib/            # API client, utilities
│   │   └── App.tsx         # Main app component
│   ├── package.json
│   └── vite.config.ts
├── project/                # Django project settings
│   ├── settings.py
│   └── urls.py
├── pyproject.toml          # Python dependencies
├── manage.py               # Django CLI
└── db.sqlite3              # SQLite database
```

## Features

- **Summary Cards:** Current balance, total income, expenses, transaction count
- **Monthly Chart:** Bar chart showing monthly income vs expenses
- **Category Waffle Chart:** Visual breakdown of spending by category
- **Recent Transactions:** Latest transactions with hover details
- **Top Expenses:** Largest expenses ranked by amount
- **Bank Account Management:** Add/edit bank account details
- **Data Sources:** View linked and pending statement files
- **Dark/Light Mode:** Theme toggle in the menu

## Development Notes

### Database Reset

To reset the database and start fresh:

```bash
rm db.sqlite3
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
