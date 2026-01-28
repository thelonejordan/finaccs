"""
Slice Credit Card PDF extractor.

Extracts transactions from Slice credit card PDF statements.
"""
import re
import csv
import json
import io
from decimal import Decimal, InvalidOperation
from datetime import datetime, date
from typing import Optional, Dict, Any, List, Tuple

try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
except ImportError:
    PDFPLUMBER_AVAILABLE = False

from . import BaseExtractor, ExtractionResult, ArtifactSpec, register_extractor


EXTRACTOR_VERSION = '1.1'

# Green color used for credit amounts in Slice PDFs (RGB values 0-1 scale)
# Main digits: (0.2627, 0.6275, 0.2784) and decimals: (0.451, 0.8157, 0.6431)
CREDIT_COLORS = [
    (0.2627, 0.6275, 0.2784),
    (0.451, 0.8157, 0.6431),
]

# Tolerance for color matching (colors may vary slightly)
COLOR_TOLERANCE = 0.05

# Month abbreviation to number mapping
MONTH_MAP = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
}


def is_credit_color(color) -> bool:
    """Check if a color matches the green credit color."""
    if not color:
        return False
    if isinstance(color, (list, tuple)) and len(color) >= 3:
        for credit_color in CREDIT_COLORS:
            if all(abs(color[i] - credit_color[i]) < COLOR_TOLERANCE for i in range(3)):
                return True
    return False


def extract_credit_amounts_from_pdf(pdf) -> Dict[str, int]:
    """
    Extract credit amounts by detecting green-colored text in the PDF.
    Returns a dict mapping amount strings to their count of green occurrences.
    This handles cases where the same amount appears multiple times but only some are credits.
    Only scans transaction pages (skips summary page which also has green amounts).
    """
    credit_amounts: Dict[str, int] = {}

    for page in pdf.pages:
        # Skip pages that don't have transaction tables (like summary, instalments, rewards)
        text = page.extract_text() or ''
        if 'DATE' not in text or 'MERCHANT' not in text or 'AMOUNT' not in text:
            continue
        chars = page.chars
        if not chars:
            continue

        # Group consecutive green characters to form amounts
        current_amount = []
        for char in chars:
            color = char.get('non_stroking_color')
            text = char.get('text', '')

            if is_credit_color(color) and (text.isdigit() or text in '₹,.-'):
                current_amount.append(text)
            else:
                if current_amount:
                    # Save the amount we've collected
                    amount_str = ''.join(current_amount)
                    # Clean up and extract just the numeric part
                    clean_amount = amount_str.replace('₹', '').replace(',', '').strip()
                    if clean_amount and clean_amount.replace('.', '').replace('-', '').isdigit():
                        credit_amounts[clean_amount] = credit_amounts.get(clean_amount, 0) + 1
                    current_amount = []

        # Don't forget the last amount
        if current_amount:
            amount_str = ''.join(current_amount)
            clean_amount = amount_str.replace('₹', '').replace(',', '').strip()
            if clean_amount and clean_amount.replace('.', '').replace('-', '').isdigit():
                credit_amounts[clean_amount] = credit_amounts.get(clean_amount, 0) + 1

    return credit_amounts


def check_and_consume_credit(amount: Decimal, credit_amounts: Dict[str, int]) -> bool:
    """
    Check if a transaction is a credit based on color-detected amounts.
    If it is a credit, decrement the count so duplicate amounts are handled correctly.
    Returns True if this is a credit transaction.
    """
    if not credit_amounts or amount is None:
        return False

    amount_str = str(abs(amount))

    # Try matching with the exact amount string
    if amount_str in credit_amounts and credit_amounts[amount_str] > 0:
        credit_amounts[amount_str] -= 1
        return True

    # Try without decimal if it's .0 or .00
    if '.' in amount_str:
        int_part, dec_part = amount_str.split('.')
        if dec_part in ('0', '00'):
            if int_part in credit_amounts and credit_amounts[int_part] > 0:
                credit_amounts[int_part] -= 1
                return True

    return False


def parse_slice_date(date_str: str, year: int) -> Optional[date]:
    """Parse date string like '29 Apr' with a given year to date object."""
    if not date_str:
        return None

    date_str = date_str.strip()

    # Pattern: "29 Apr" or "29\nApr" (newline in tables)
    match = re.match(r'(\d{1,2})\s*\n?\s*([A-Za-z]{3})', date_str)
    if not match:
        return None

    day_str, month_abbr = match.groups()
    try:
        day = int(day_str)
        month = MONTH_MAP.get(month_abbr.lower())
        if not month:
            return None
        return date(year, month, day)
    except (ValueError, TypeError):
        return None


def parse_slice_amount(amount_str: str) -> Decimal:
    """Parse amount string like '₹273.00' or '₹13,087.36' to Decimal."""
    if not amount_str:
        return Decimal('0')

    amount_str = str(amount_str).strip()

    # Remove currency symbols and commas
    clean = re.sub(r'[₹`\s,]', '', amount_str)

    try:
        return Decimal(clean)
    except (InvalidOperation, ValueError):
        return Decimal('0')


def extract_statement_period(text: str) -> Tuple[int, int, int]:
    """
    Extract year and months from statement period like "1 Apr - 30 Apr '22".

    Returns:
        (year, start_month, end_month) - year is full 4-digit year
    """
    # Pattern: "1 Apr - 30 Apr '22" or "20 Dec - 19 Jan '23"
    # Note: Various quote characters may appear: ' (U+0027), ' (U+2018), ' (U+2019)
    pattern = r"(\d{1,2})\s+([A-Za-z]{3})\s*[-–]\s*(\d{1,2})\s+([A-Za-z]{3})\s*['\u2018\u2019]?(\d{2})"
    match = re.search(pattern, text)

    if not match:
        # Default to current year if not found
        current_year = datetime.now().year
        return (current_year, 1, 12)

    _, start_month_abbr, _, end_month_abbr, year_short = match.groups()

    start_month = MONTH_MAP.get(start_month_abbr.lower(), 1)
    end_month = MONTH_MAP.get(end_month_abbr.lower(), 12)

    # Convert 2-digit year to 4-digit
    year_int = int(year_short)
    year = 2000 + year_int if year_int < 100 else year_int

    return (year, start_month, end_month)


def infer_year_for_month(month: int, start_month: int, end_month: int, statement_year: int) -> int:
    """
    Infer the year for a transaction based on its month and statement period.

    For cross-year statements (e.g., Dec-Jan), December dates use previous year.
    """
    if start_month > end_month:  # Cross-year (e.g., Dec-Jan)
        if month >= start_month:
            return statement_year - 1
        else:
            return statement_year
    else:
        return statement_year


def extract_card_number(text: str) -> Optional[str]:
    """Extract card number like 'XXXX XXXX XXXX 4171' from text."""
    # Pattern for Slice card format
    pattern = r'(XXXX\s+XXXX\s+XXXX\s+\d{4})'
    match = re.search(pattern, text)
    if match:
        return match.group(1)

    # Alternative pattern with asterisks
    pattern2 = r'(\*{4}\s+\*{4}\s+\*{4}\s+\d{4})'
    match2 = re.search(pattern2, text)
    if match2:
        return match2.group(1)

    return None


def extract_transactions_from_tables(tables: List, year: int, start_month: int, end_month: int, credit_amounts: Dict[str, int] = None) -> List[Dict]:
    """
    Extract transactions from PDF tables.

    Slice table format (single-cell rows):
    Row: "29 swiggy ₹273.00\nApr"
    Meaning: day=29, merchant=swiggy, amount=₹273.00, month=Apr
    """
    transactions = []

    for table in tables:
        if not table or len(table) < 2:
            continue

        # Check if this is a transaction table by looking at header
        header_str = ''
        for row in table[:2]:
            if row:
                header_str += ' '.join(str(cell).upper() if cell else '' for cell in row) + ' '

        # Must have DATE/MERCHANT/AMOUNT in header
        if 'DATE' not in header_str or 'MERCHANT' not in header_str:
            continue

        # Skip non-transaction tables (like instalments)
        if 'ORDER' in header_str or 'INSTALMENT' in header_str:
            continue

        for row in table:
            if not row:
                continue

            # Get the cell content (single cell per row)
            cell_content = str(row[0]).strip() if row[0] else ''
            if not cell_content:
                continue

            # Skip header rows
            if 'DATE' in cell_content.upper() and 'MERCHANT' in cell_content.upper():
                continue
            if cell_content.upper() == 'TRANSACTIONS':
                continue

            # Skip total row
            if 'Total' in cell_content:
                continue

            # Parse format: "29 swiggy ₹273.00\nApr" or "29 uber ₹337.59\nApr"
            # Pattern: day merchant amount\nmonth
            pattern = r'^(\d{1,2})\s+(.+?)\s+[₹`]?([\d,]+\.\d{2})\n([A-Za-z]{3})$'
            match = re.match(pattern, cell_content)

            if not match:
                # Try alternative: amount might have different format
                pattern2 = r'^(\d{1,2})\s+(.+?)\s+[₹`]?([\d,]+(?:\.\d{2})?)\n([A-Za-z]{3})$'
                match = re.match(pattern2, cell_content)

            if not match:
                continue

            day_str, merchant, amount_str, month_abbr = match.groups()

            month = MONTH_MAP.get(month_abbr.lower())
            if not month:
                continue

            # Infer the correct year for this transaction
            txn_year = infer_year_for_month(month, start_month, end_month, year)

            try:
                txn_date = date(txn_year, month, int(day_str))
            except (ValueError, TypeError):
                continue

            amount = parse_slice_amount(amount_str)
            if amount == 0:
                continue

            # Check if this is a credit transaction (by color-detected amount)
            merchant_clean = merchant.strip()
            if check_and_consume_credit(amount, credit_amounts):
                amount = -amount  # Credits are negative

            transactions.append({
                'date': txn_date,
                'description': merchant_clean,
                'amount': amount,
            })

    return transactions


def extract_transactions_from_text(text: str, year: int, start_month: int, end_month: int, credit_amounts: Dict[str, int] = None) -> List[Dict]:
    """
    Extract transactions using regex patterns from raw text.
    Fallback if table extraction fails.

    Pattern matches lines like:
    29 Apr      swiggy               ₹273.00
    """
    transactions = []

    # Pattern: day month merchant amount
    pattern = r'(\d{1,2})\s+([A-Za-z]{3})\s+(.+?)\s+[₹`]?([\d,]+\.\d{2})'

    for match in re.finditer(pattern, text):
        day_str, month_abbr, merchant, amount_str = match.groups()

        month = MONTH_MAP.get(month_abbr.lower())
        if not month:
            continue

        # Skip total lines
        if 'Total' in merchant or 'total' in merchant:
            continue

        txn_year = infer_year_for_month(month, start_month, end_month, year)

        try:
            txn_date = date(txn_year, month, int(day_str))
        except (ValueError, TypeError):
            continue

        amount = parse_slice_amount(amount_str)
        if amount == 0:
            continue

        # Check if this is a credit transaction (by color-detected amount)
        merchant_clean = merchant.strip()
        if check_and_consume_credit(amount, credit_amounts):
            amount = -amount  # Credits are negative

        transactions.append({
            'date': txn_date,
            'description': merchant_clean,
            'amount': amount,
        })

    return transactions


def transactions_to_csv(transactions: List[Dict]) -> str:
    """Convert transactions list to CSV string (compatible with ICICI format)."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['row_id', 'date', 'ser_no', 'description', 'amount', 'intl_amount', 'intl_currency', 'card_number'])

    for txn in transactions:
        writer.writerow([
            txn.get('row_id', ''),
            txn['date'].isoformat() if txn['date'] else '',
            '',  # Slice has no serial number
            txn['description'],
            float(txn['amount']),
            '',  # No international amounts
            '',  # No international currency
            txn.get('card_number', ''),
        ])

    return output.getvalue()


def json_serializer(obj):
    """JSON serializer for objects not serializable by default."""
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    elif isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Type {type(obj)} not serializable")


@register_extractor
class SliceCCPDFExtractor(BaseExtractor):
    """Slice Credit Card PDF Statement Extractor."""
    name = 'slice_cc_pdf'
    version = EXTRACTOR_VERSION
    domain = 'credit_card'
    supported_extensions = ['.pdf']

    def extract(self, file_bytes: bytes, password: Optional[str] = None) -> ExtractionResult:
        if not PDFPLUMBER_AVAILABLE:
            return ExtractionResult(error='pdfplumber is required for PDF parsing. Install with: uv add pdfplumber')

        try:
            pdf = pdfplumber.open(io.BytesIO(file_bytes), password=password)
        except (OSError, ValueError, TypeError) as e:
            return ExtractionResult(error=f'Failed to open PDF: {str(e)}')

        artifacts = []

        with pdf:
            all_text = ""
            all_tables = []

            # Extract credit amounts by detecting green-colored text
            credit_amounts = extract_credit_amounts_from_pdf(pdf)

            # Extract text and tables from all pages
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    all_text += text + "\n"
                tables = page.extract_tables()
                if tables:
                    all_tables.extend(tables)

            # Extract statement period for year inference
            year, start_month, end_month = extract_statement_period(all_text)

            # Extract card number
            card_number = extract_card_number(all_text)

            # Extract transactions (try tables first, then text)
            transactions = extract_transactions_from_tables(all_tables, year, start_month, end_month, credit_amounts)
            if not transactions:
                transactions = extract_transactions_from_text(all_text, year, start_month, end_month, credit_amounts)

            if not transactions:
                return ExtractionResult(error='No transactions found in PDF')

            # Add row_ids and card number
            for row_id, txn in enumerate(transactions, start=1):
                txn['row_id'] = row_id
                txn['card_number'] = card_number or ''

            # Build CSV artifact
            csv_content = transactions_to_csv(transactions)
            artifacts.append(ArtifactSpec(
                artifact_type='transactions',
                content=csv_content,
                content_format='csv',
                row_count=len(transactions),
                artifact_key=card_number or '',
                data_source_target='credit_card_transactions',
                transformer='slice_cc_transactions',
            ))

            # Build metadata
            metadata = {
                "metadata": {
                    "card_no": card_number,
                },
                "timeline": {
                    "statement_period_year": year,
                    "statement_period_start_month": start_month,
                    "statement_period_end_month": end_month,
                },
            }

            # Create metadata artifact
            metadata_json = json.dumps(metadata, indent=2, default=json_serializer)
            artifacts.append(ArtifactSpec(
                artifact_type='metadata',
                content=metadata_json,
                content_format='json',
                row_count=0,
            ))

        return ExtractionResult(artifacts=artifacts, metadata=metadata)
