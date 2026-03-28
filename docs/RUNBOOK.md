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
| Frontend blank | Verify `frontend/dist` exists, rebuild frontend |
| Database errors | Check `DATABASE_URL` format, run `migrate` |
| CORS errors | Add origin to `CORS_ALLOWED_ORIGINS` |

## Management Commands

### `backfill_resolved_transactions`

Creates single-member `ResolvedTransaction` records for any transactions that don't have one. Should be run after initial setup or deployment to ensure all transactions have a `resolved_transaction_id`, which is required for story/entity tags to work correctly.

```bash
uv run python manage.py backfill_resolved_transactions
```

### `recover_orphaned_links`

Recovers links orphaned when their `resolved_transaction` was set to NULL (e.g. after a resolved transaction deletion).

```bash
# Preview what would be recovered (no changes made)
uv run python manage.py recover_orphaned_links --dry-run

# Recover orphaned links
uv run python manage.py recover_orphaned_links
```

**Link types recovered:** CategoryLink, StoryLink, EntityLink, SelfTransferLink, CreditCardPaymentLink

The command finds links with a NULL `resolved_transaction` and attempts to re-associate them with the correct resolved transaction using origin transaction metadata.

### `cleanup_orphaned_resolved_transactions`

Deletes `ResolvedTransaction` rows not referenced by any `BankTransaction` or `CreditCardTransaction`. Useful after bulk deletions or resolution group removals.

```bash
# Preview what would be deleted (no changes made)
uv run python manage.py cleanup_orphaned_resolved_transactions --dry-run

# Delete orphaned rows (default batch size: 10000)
uv run python manage.py cleanup_orphaned_resolved_transactions

# Custom batch size
uv run python manage.py cleanup_orphaned_resolved_transactions --batch 5000
```

### `restore_source_files`

Restores source files from the database (`SourceFile.file_data`) back to disk. Useful when files are accidentally deleted — all file content is stored gzip-compressed in the database.

```bash
# Preview what would be restored (no files written)
uv run python manage.py restore_source_files --dry-run

# Restore all bank account files
uv run python manage.py restore_source_files --domain bank_account

# Restore all credit card files
uv run python manage.py restore_source_files --domain credit_card

# Restore a single file
uv run python manage.py restore_source_files --id sf_a1b2c3d4

# Force overwrite existing files on disk
uv run python manage.py restore_source_files --force
```

Verifies SHA-256 hash and file size after decompression. Skips files that already exist on disk unless `--force` is used.

## Rollback

```bash
# Docker
docker-compose down
docker-compose pull   # If using registry
docker-compose up -d

# Manual: redeploy previous version, run migrate if needed
```
