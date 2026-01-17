# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python app
FROM python:3.11-slim
WORKDIR /app

# Install MySQL client dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    default-libmysqlclient-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Install Python dependencies (core + extraction, no dev tools)
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --extra extraction

# Copy application
COPY . .

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist ./frontend_dist

# Collect static files
RUN uv run python manage.py collectstatic --noinput

EXPOSE 8000
CMD ["uv", "run", "gunicorn", "project.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2"]
