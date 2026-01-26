# Operations Guide

## Docker Deployment

### Quick Start

```bash
# Build and run with docker-compose
docker-compose up -d

# Or build image only
docker build -t finaccs .

# Run standalone (needs external MySQL)
docker run -p 8000:8000 \
  -e DATABASE_URL=mysql://user:pass@host:3306/db \
  -e SECRET_KEY=your-secret \
  -e ALLOWED_HOSTS=yourdomain.com \
  finaccs
```

### Docker Compose Services

- `web`: Django app on port 8000
- `db`: MySQL 8 with persistent volume

### Commands

```bash
docker-compose up -d          # Start services
docker-compose down           # Stop services
docker-compose logs -f web    # View logs
docker-compose exec web sh    # Shell access
docker-compose exec web uv run python manage.py migrate  # Run migrations
```

## Manual Deployment

```bash
# Build frontend
cd frontend && npm run build

# Copy to frontend_dist
cp -r frontend/dist frontend_dist

# Collect static files
python manage.py collectstatic --noinput

# Run migrations
python manage.py migrate

# Start with Gunicorn
gunicorn project.wsgi:application --bind 0.0.0.0:8000 --workers 2
```

## Health Check

```bash
curl http://localhost:8000/api/health/
# Returns: {"status": "ok", "project": "finaccs", "version": "1.0.0", "git_commit": "..."}
```

## Common Issues

| Issue | Solution |
|-------|----------|
| Static files 404 | Run `collectstatic`, verify `STATIC_URL=/static/` |
| MIME type errors | Check Whitenoise middleware, run `collectstatic` |
| Frontend blank | Verify `frontend_dist` exists, rebuild frontend |
| Database errors | Check `DATABASE_URL` format, run `migrate` |
| CORS errors | Add origin to `CORS_ALLOWED_ORIGINS` |

## Rollback

```bash
# Docker
docker-compose down
docker-compose pull   # If using registry
docker-compose up -d

# Manual: redeploy previous version, run migrate if needed
```
