"""
ICICI Credit Card PDF extractor.

Extracts transactions, EMI/loans, and statement metadata from ICICI credit card PDF statements.
Ported from credit_cards/pdf_extractor.py.
"""
import re
import csv
import json
import io
from decimal import Decimal, InvalidOperation
from datetime import datetime, date
from typing import Optional, Dict, Any, List

try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
except ImportError:
    PDFPLUMBER_AVAILABLE = False

from . import BaseExtractor, ExtractionResult, ArtifactSpec, register_extractor


EXTRACTOR_VERSION = '1.1'


def parse_date(date_str):
    """Parse date string like '27/03/2023' to date object."""
    if not date_str:
        return None
    formats = [
        '%d/%m/%Y',    # 27/03/2023
        '%d/%m/%y',    # 27/03/23
        '%d-%m-%Y',    # 27-03-2023
        '%d-%m-%y',    # 27-03-23
        '%d %b %Y',    # 01 Jan 2024
        '%d-%b-%y',    # 01-Jan-24
        '%d-%b-%Y',    # 01-Jan-2024
    ]
    for fmt in formats:
        try:
            return datetime.strptime(date_str.strip(), fmt).date()
        except ValueError:
            continue
    return None


def parse_amount(amount_str):
    """Parse amount string like '923.05 CR' or '22.49' to Decimal.

    CR = Credit (payment received, negative in our schema)
    No suffix = Debit (charge, positive in our schema)
    """
    if not amount_str:
        return Decimal('0'), False

    amount_str = str(amount_str).strip()
    is_credit = 'CR' in amount_str.upper()
    clean = re.sub(r'[,\s]|(CR|cr|Cr)', '', amount_str)

    try:
        amount = Decimal(clean)
        return amount, is_credit
    except (InvalidOperation, ValueError):
        return Decimal('0'), False


def _get_card_for_position(card_headers, pos):
    """Find which card a transaction at position belongs to."""
    card_no = None
    for card_pos, card_num in card_headers:
        if card_pos < pos:
            card_no = card_num
        else:
            break
    return card_no


def _get_currency_from_next_lines(line_positions, match_end, max_lines=5):
    """Find currency code within the next few lines after a match."""
    lines_checked = 0
    for start_pos, line in line_positions:
        if start_pos >= match_end:
            stripped = line.strip()
            if re.match(r'^[A-Z]{3}$', stripped):
                return stripped
            m = re.search(r'(?:^|\s)([A-Z]{3})$', stripped)
            if m:
                return m.group(1)
            lines_checked += 1
            if lines_checked >= max_lines:
                break
    return None


def _extract_inline_intl_transactions(text, card_headers):
    """Extract inline international transactions (currency on same line)."""
    pattern = r'(\d{2}/\d{2}/\d{4})\s+(\d{7,})\s+(.+?)\s+(?:(-?\d+)\s+)?([\d,]+(?:\.\d+)?)\s+([A-Z]{3})\s+([\d,]+\.\d{2})\s*(CR)?'
    matches = []

    for match in re.finditer(pattern, text):
        date_str, serial, description, _, intl_amount_str, currency, amount_str, is_cr = match.groups()

        txn_date = parse_date(date_str)
        if not txn_date:
            continue

        amount, _ = parse_amount(amount_str)
        intl_amount, _ = parse_amount(intl_amount_str)

        if amount == 0:
            continue

        if is_cr:
            amount = -amount

        matches.append((match.start(), {
            'date': txn_date,
            'ser_no': serial,
            'description': description.strip(),
            'amount': amount,
            'intl_amount': intl_amount,
            'intl_currency': currency,
            'card_number': _get_card_for_position(card_headers, match.start()),
        }))

    return matches


def _extract_two_amount_intl_transactions(text, card_headers, line_positions, matched_positions):
    """Extract two-amount international transactions with currency on next lines."""
    pattern = r'(\d{2}/\d{2}/\d{4})\s+(\d{7,})\s+(.+?)\s+(?:(-?\d+)\s+)?([\d,]+\.\d+)\s+([\d,]+\.\d{2})\s*(CR)?'
    matches = []

    for match in re.finditer(pattern, text):
        if match.start() in matched_positions:
            continue

        currency = _get_currency_from_next_lines(line_positions, match.end(), max_lines=5)
        if not currency:
            continue

        date_str, serial, description, _, intl_amount_str, amount_str, is_cr = match.groups()

        txn_date = parse_date(date_str)
        if not txn_date:
            continue

        amount, _ = parse_amount(amount_str)
        intl_amount, _ = parse_amount(intl_amount_str)

        if amount == 0:
            continue

        if is_cr:
            amount = -amount

        matches.append((match.start(), {
            'date': txn_date,
            'ser_no': serial,
            'description': description.strip(),
            'amount': amount,
            'intl_amount': intl_amount,
            'intl_currency': currency,
            'card_number': _get_card_for_position(card_headers, match.start()),
        }))

    return matches


def _extract_domestic_transactions(text, card_headers, matched_positions):
    """Extract domestic transactions (single amount, not already matched)."""
    pattern = r'(\d{2}/\d{2}/\d{4})\s+(\d{7,})\s+(.+?)\s+(?:(-?\d+)\s+)?([\d,]+\.\d{2})\s*(CR)?'
    matches = []

    for match in re.finditer(pattern, text):
        if match.start() in matched_positions:
            continue

        date_str, serial, description, _, amount_str, is_cr = match.groups()

        txn_date = parse_date(date_str)
        if not txn_date:
            continue

        amount, _ = parse_amount(amount_str)

        if amount == 0:
            continue

        if is_cr:
            amount = -amount

        matches.append((match.start(), {
            'date': txn_date,
            'ser_no': serial,
            'description': description.strip(),
            'amount': amount,
            'intl_amount': Decimal('0'),
            'intl_currency': '',
            'card_number': _get_card_for_position(card_headers, match.start()),
        }))

    return matches


def extract_transactions_from_text(text):
    """Extract transactions from raw PDF text using regex.

    Returns:
        dict: {'by_card': {card_number: [transactions], ...}, 'all': [all_transactions]}
    """
    # Find all card number headers with their positions
    card_pattern = r'\n(\d{4}X{4,}X*\d{4})\n'
    card_headers = [(m.start(), m.group(1)) for m in re.finditer(card_pattern, text)]

    # Build line positions for currency lookup
    line_positions = []
    pos = 0
    for line in text.split('\n'):
        line_positions.append((pos, line))
        pos += len(line) + 1

    matched_positions = set()
    all_matches = []

    # Pass 1: Inline international transactions
    inline_matches = _extract_inline_intl_transactions(text, card_headers)
    all_matches.extend(inline_matches)
    matched_positions.update(m[0] for m in inline_matches)

    # Pass 2: Two-amount international transactions
    two_amount_matches = _extract_two_amount_intl_transactions(text, card_headers, line_positions, matched_positions)
    all_matches.extend(two_amount_matches)
    matched_positions.update(m[0] for m in two_amount_matches)

    # Pass 3: Domestic transactions
    domestic_matches = _extract_domestic_transactions(text, card_headers, matched_positions)
    all_matches.extend(domestic_matches)

    # Sort by position and group by card
    all_matches.sort(key=lambda x: x[0])

    transactions_by_card = {}
    all_transactions = []

    for row_id, (_, txn) in enumerate(all_matches, start=1):
        txn['row_id'] = row_id
        all_transactions.append(txn)

        card_no = txn.get('card_number')
        if card_no:
            if card_no not in transactions_by_card:
                transactions_by_card[card_no] = []
            transactions_by_card[card_no].append(txn)

    return {'by_card': transactions_by_card, 'all': all_transactions}


def extract_emi_loans_from_tables(tables):
    """Extract EMI/Personal Loan data from PDF tables."""
    emi_loans = []

    for table in tables:
        if not table or len(table) < 2:
            continue

        header = table[0]
        if not header or len(header) < 6:
            continue

        first_cell = str(header[0]).lower().replace('\n', ' ') if header[0] else ''
        if 'transaction' not in first_cell and 'loantype' not in first_cell:
            continue

        for row in table[1:]:
            if not row or len(row) < 8:
                continue

            loan_type = str(row[0]).replace('\n', ' ').strip() if row[0] else ''
            creation_date = parse_date(str(row[1]).strip()) if row[1] else None
            finish_date = parse_date(str(row[2]).strip()) if row[2] else None
            num_installments = int(re.sub(r'[^\d]', '', str(row[3]))) if row[3] else 0
            emi_amount, _ = parse_amount(str(row[4])) if row[4] else (Decimal('0'), False)
            pending_installments = int(re.sub(r'[^\d]', '', str(row[5]))) if row[5] else 0
            outstanding_amount, _ = parse_amount(str(row[6])) if row[6] else (Decimal('0'), False)
            monthly_installment, _ = parse_amount(str(row[7])) if row[7] else (Decimal('0'), False)

            if not loan_type or emi_amount == 0:
                continue

            emi_loans.append({
                'loan_type': loan_type,
                'creation_date': creation_date,
                'finish_date': finish_date,
                'num_installments': num_installments,
                'emi_amount': emi_amount,
                'pending_installments': pending_installments,
                'outstanding_amount': outstanding_amount,
                'monthly_installment': monthly_installment,
            })

    return emi_loans


def extract_statement_summary(text):
    """Extract statement summary information from PDF text."""
    summary = {}

    # Statement Date
    stmt_date_match = re.search(r'STATEMENT\s*DATE\s*[\n\r]*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4})', text, re.IGNORECASE)
    if stmt_date_match:
        date_str = stmt_date_match.group(1).strip()
        for fmt in ['%B %d, %Y', '%B %d %Y', '%d %B %Y', '%b %d, %Y', '%d %b %Y']:
            try:
                summary['statement_date'] = datetime.strptime(date_str.replace(',', ''), fmt.replace(',', '')).date()
                break
            except ValueError:
                continue

    # Payment Due Date
    due_date_match = re.search(r'PAYMENT\s*DUE\s*DATE\s*[\n\r]*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4})', text, re.IGNORECASE)
    if due_date_match:
        date_str = due_date_match.group(1).strip()
        for fmt in ['%B %d, %Y', '%B %d %Y', '%d %B %Y', '%b %d, %Y', '%d %b %Y']:
            try:
                summary['payment_due_date'] = datetime.strptime(date_str.replace(',', ''), fmt.replace(',', '')).date()
                break
            except ValueError:
                continue

    # Statement Period
    period_match = re.search(
        r'Statement\s*period\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s*to\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})',
        text, re.IGNORECASE
    )
    if period_match:
        start_str, end_str = period_match.groups()
        for fmt in ['%B %d, %Y', '%B %d %Y', '%b %d, %Y', '%b %d %Y']:
            try:
                summary['period_start'] = datetime.strptime(start_str.replace(',', ''), fmt.replace(',', '')).date()
                summary['period_end'] = datetime.strptime(end_str.replace(',', ''), fmt.replace(',', '')).date()
                break
            except ValueError:
                continue

    # Total Amount Due
    total_due_match = re.search(r'Total\s*Amount\s*due\s*[`₹]?\s*([\d,]+\.?\d*)', text, re.IGNORECASE)
    if total_due_match:
        summary['total_amount_due'], _ = parse_amount(total_due_match.group(1))

    # Minimum Amount Due
    min_due_match = re.search(r'Minimum\s*Amount\s*due[^`₹\d]*[`₹]\s*([\d,]+\.?\d*)', text, re.IGNORECASE)
    if min_due_match:
        summary['minimum_amount_due'], _ = parse_amount(min_due_match.group(1))

    # Card Number
    card_match = re.search(r'(\d{4}X{4,}X*\d{4})', text)
    if card_match:
        summary['card_no'] = card_match.group(1)

    # Invoice No
    invoice_match = re.search(r'Invoice\s*No\.?:?\s*(\S+)', text, re.IGNORECASE)
    if invoice_match:
        summary['invoice_no'] = invoice_match.group(1)

    return summary


def transactions_to_csv(transactions):
    """Convert transactions list to CSV string."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['row_id', 'date', 'ser_no', 'description', 'amount', 'intl_amount', 'intl_currency', 'card_number'])

    for txn in transactions:
        writer.writerow([
            txn.get('row_id', ''),
            txn['date'].isoformat() if txn['date'] else '',
            txn.get('ser_no', ''),
            txn['description'],
            float(txn['amount']),
            float(txn.get('intl_amount', 0)) if txn.get('intl_amount') else '',
            txn.get('intl_currency', ''),
            txn.get('card_number', ''),
        ])

    return output.getvalue()


def emi_loans_to_csv(emi_loans):
    """Convert EMI/loans list to CSV string."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'loan_type', 'creation_date', 'finish_date', 'num_installments',
        'emi_amount', 'pending_installments', 'outstanding_amount', 'monthly_installment'
    ])

    for loan in emi_loans:
        writer.writerow([
            loan['loan_type'],
            loan['creation_date'].isoformat() if loan['creation_date'] else '',
            loan['finish_date'].isoformat() if loan['finish_date'] else '',
            loan['num_installments'],
            float(loan['emi_amount']),
            loan['pending_installments'],
            float(loan['outstanding_amount']),
            float(loan['monthly_installment']),
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
class ICICICCPDFExtractor(BaseExtractor):
    """ICICI Credit Card PDF Statement Extractor."""
    name = 'icici_cc_pdf'
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
        metadata = {}

        with pdf:
            all_tables = []
            all_text = ""

            for page in pdf.pages:
                tables = page.extract_tables()
                if tables:
                    all_tables.extend(tables)
                text = page.extract_text()
                if text:
                    all_text += text + "\n"

            # Extract statement summary
            summary = extract_statement_summary(all_text)

            # Extract transactions from text
            text_extraction_result = extract_transactions_from_text(all_text)
            transactions = text_extraction_result['all']
            transactions_by_card = text_extraction_result['by_card']

            # Extract EMI/Loans
            emi_loans = extract_emi_loans_from_tables(all_tables)

            # Build metadata
            card_numbers = list(transactions_by_card.keys()) if transactions_by_card else []
            if not card_numbers and summary.get('card_no'):
                card_numbers = [summary.get('card_no')]

            metadata = {
                "metadata": {
                    "card_no": card_numbers if len(card_numbers) > 1 else (card_numbers[0] if card_numbers else summary.get('card_no')),
                    "invoice_no": summary.get('invoice_no'),
                },
                "timeline": {
                    "statement_date": summary.get('statement_date'),
                    "statement_period_begin": summary.get('period_start'),
                    "statement_period_end": summary.get('period_end'),
                    "payment_due_date": summary.get('payment_due_date'),
                },
                "statement_summary": {
                    "total_amount_due": summary.get('total_amount_due'),
                    "minimum_amount_due": summary.get('minimum_amount_due'),
                },
            }

            # Create transaction artifacts
            if transactions_by_card:
                # Multi-card: create per-card artifacts
                for card_no, card_txns in transactions_by_card.items():
                    card_csv = transactions_to_csv(card_txns)
                    artifacts.append(ArtifactSpec(
                        artifact_type=f'transactions',
                        content=card_csv,
                        content_format='csv',
                        row_count=len(card_txns),
                        artifact_key=card_no,
                        data_source_target='credit_card_transactions',
                        transformer='icici_cc_transactions',
                    ))
            elif transactions:
                # Single card
                transactions_csv = transactions_to_csv(transactions)
                artifacts.append(ArtifactSpec(
                    artifact_type='transactions',
                    content=transactions_csv,
                    content_format='csv',
                    row_count=len(transactions),
                    data_source_target='credit_card_transactions',
                    transformer='icici_cc_transactions',
                ))

            # Create EMI artifact
            if emi_loans:
                emi_csv = emi_loans_to_csv(emi_loans)
                artifacts.append(ArtifactSpec(
                    artifact_type='emi',
                    content=emi_csv,
                    content_format='csv',
                    row_count=len(emi_loans),
                ))

            # Create metadata artifact
            metadata_json = json.dumps(metadata, indent=2, default=json_serializer)
            artifacts.append(ArtifactSpec(
                artifact_type='metadata',
                content=metadata_json,
                content_format='json',
                row_count=0,
            ))

        return ExtractionResult(artifacts=artifacts, metadata=metadata)
