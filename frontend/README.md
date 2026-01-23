# FinAccs Frontend

React + TypeScript frontend for FinAccs personal finance management.

## Tech Stack

- React 19 + TypeScript
- Vite 7
- TailwindCSS 4
- React Router 7
- Radix UI primitives
- Recharts for data visualization

## Setup

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Start development server
npm run dev
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server (http://localhost:5173) |
| `npm run build` | TypeScript compile + production build |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview production build locally |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE` | `http://localhost:8000` | Backend API base URL |

## Project Structure

```
src/
  components/     # React components (pages and shared)
  lib/
    api.ts        # API client functions
    theme.tsx     # Theme provider
    *-cache.tsx   # Data caching providers
  App.tsx         # Router configuration
  main.tsx        # Entry point
```
