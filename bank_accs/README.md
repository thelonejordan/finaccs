# Extraction Pipelines

Extraction pipelines define how bank statement files are parsed and which accounts they belong to.

## Overview

Each pipeline specifies:
- **name** - Human-readable identifier (e.g., "SBI PDF Statements")
- **extractor** - Parser type (`sbi_pdf`, `generic_xlsx`, `generic_txt`, etc.)
- **file_pattern** - Glob pattern to match filenames (e.g., `8645*.pdf`)
- **password** - Optional password for encrypted files
- **default_bank_account** - Auto-link new files to this account

## Configured Pipelines

| Pipeline | Pattern | Password | Default Account |
|----------|---------|----------|-----------------|
| SBI PDF Statements | `8645*.pdf` | Yes | SBI |
| HDFC Text Statement | `Acct_Statement_*.txt` | No | HDFC |
| ICICI Account Statement | `AccountStatement_*.xlsx` | No | - |
| ICICI Email Statement | `Email_Statement*.xlsx` | No | - |

## Usage

### Extract a file (auto-detects pipeline)

```bash
uv run python manage.py load_transactions --file bank_accs/data/8645978307931012024.pdf
```

The command will:
1. Match the filename against pipeline patterns
2. Use the pipeline's password (if set)
3. Auto-link to the pipeline's default bank account (if not already linked)

### Force re-extract

```bash
uv run python manage.py load_transactions --file bank_accs/data/8645978307931012024.pdf --force
```

### Extract all files

```bash
uv run python manage.py load_transactions --all
```

## API

### List pipelines

```
GET /api/pipelines/
```

Returns:
```json
{
  "pipelines": [
    {
      "id": 1,
      "name": "SBI PDF Statements",
      "extractor": "sbi_pdf",
      "file_pattern": "8645*.pdf",
      "has_password": true,
      "default_bank_account_id": 1,
      "default_bank_account_name": "SBI",
      "description": "",
      "source_file_count": 30,
      "source_files": ["8645978307931012024.pdf", "..."]
    }
  ]
}
```

## Managing Pipelines

Pipelines are managed via Django shell:

### Create a pipeline

```python
from bank_accs.models import ExtractionPipeline, BankAccount

sbi = BankAccount.objects.get(nickname='SBI')
ExtractionPipeline.objects.create(
    name='SBI PDF Statements',
    extractor='sbi_pdf',
    file_pattern='8645*.pdf',
    password='your_password',
    default_bank_account=sbi,
)
```

### List pipelines

```python
from bank_accs.models import ExtractionPipeline

for p in ExtractionPipeline.objects.all():
    print(f'{p.name}: {p.file_pattern} -> {p.default_bank_account}')
```

### Update a pipeline

```python
pipeline = ExtractionPipeline.objects.get(name='SBI PDF Statements')
pipeline.password = 'new_password'
pipeline.save()
```

### Delete a pipeline

```python
ExtractionPipeline.objects.get(name='Old Pipeline').delete()
```

## Extractor Types

| Extractor | Description |
|-----------|-------------|
| `sbi_pdf` | SBI PDF bank statements |
| `icici_xlsx` | ICICI Excel statements |
| `hdfc_txt` | HDFC text/CSV statements |
| `generic_xlsx` | Generic Excel format |
| `generic_txt` | Generic CSV/TXT format |
