"""
ICICI Credit Card transactions transformer.

Transforms raw ICICI CC transactions to the ingestable format.
Ported from credit_cards/transformers.py.
"""
import csv
import io
from decimal import Decimal
from typing import Optional

from . import BaseTransformer, TransformResult, register_transformer


@register_transformer
class ICICICCTransactionsTransformer(BaseTransformer):
    """
    Transform ICICI CC raw transactions to ingestable format.

    Raw format: row_id, date, ser_no, description, amount, intl_amount, intl_currency, card_number
    Ingestable format: row_id, date, value_date, narration, debit_amount, credit_amount,
                       reference_number, closing_balance, intl_amount, intl_currency, exchange_rate
    """
    name = 'icici_cc_transactions'
    version = '1.2'
    output_target = 'credit_card_transactions'

    def transform(self, data: str, content_format: str, artifact_key: str = '') -> TransformResult:
        if content_format != 'csv':
            raise ValueError(f"Expected CSV content format, got: {content_format}")

        reader = csv.DictReader(io.StringIO(data))

        ingestable_rows = []
        for row in reader:
            date_val = row['date']
            amount = Decimal(row['amount']) if row['amount'] else Decimal('0')
            intl_amount_val = row.get('intl_amount', '')
            intl_amount = Decimal(intl_amount_val) if intl_amount_val else Decimal('0')
            intl_currency = row.get('intl_currency', '')

            # Split amount into debit/credit
            # Positive = charge (debit), Negative = payment (credit)
            debit_amount = amount if amount > 0 else Decimal('0')
            credit_amount = abs(amount) if amount < 0 else Decimal('0')

            # Calculate exchange rate if both amounts present
            exchange_rate = ''
            if intl_amount != 0 and amount != 0:
                exchange_rate = str(round(abs(amount / intl_amount), 4))

            ingestable_rows.append({
                'row_id': row.get('row_id', ''),
                'date': date_val,
                'value_date': date_val,  # CC has no separate value date
                'narration': row['description'],
                'debit_amount': str(debit_amount),
                'credit_amount': str(credit_amount),
                'reference_number': row.get('ser_no', ''),
                'closing_balance': '',  # CC has no running balance
                'intl_amount': intl_amount_val,
                'intl_currency': intl_currency,
                'exchange_rate': exchange_rate,
            })

        # Create ingestable CSV
        output = io.StringIO()
        fieldnames = [
            'row_id', 'date', 'value_date', 'narration', 'debit_amount', 'credit_amount',
            'reference_number', 'closing_balance', 'intl_amount', 'intl_currency', 'exchange_rate'
        ]
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(ingestable_rows)

        return TransformResult(
            data=output.getvalue(),
            content_format='csv',
            row_count=len(ingestable_rows),
        )
