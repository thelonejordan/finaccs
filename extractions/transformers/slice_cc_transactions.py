"""
Slice Credit Card transactions transformer.

Transforms Slice CC transactions to the ingestable format.
"""
import csv
import io
from decimal import Decimal

from . import BaseTransformer, TransformResult, register_transformer


@register_transformer
class SliceCCTransactionsTransformer(BaseTransformer):
    """
    Transform Slice CC raw transactions to ingestable format.

    Raw format: row_id, date, ser_no, description, amount, intl_amount, intl_currency, card_number
    Ingestable format: row_id, date, value_date, narration, debit_amount, credit_amount,
                       reference_number, closing_balance, intl_amount, intl_currency, exchange_rate
    """
    name = 'slice_cc_transactions'
    version = '1.0'
    output_target = 'credit_card_transactions'

    def transform(self, data: str, content_format: str, artifact_key: str = '') -> TransformResult:
        if content_format != 'csv':
            raise ValueError(f"Expected CSV content format, got: {content_format}")

        reader = csv.DictReader(io.StringIO(data))

        ingestable_rows = []
        for row in reader:
            date_val = row['date']
            amount = Decimal(row['amount']) if row['amount'] else Decimal('0')

            # Slice: positive amounts are debits (charges)
            # Negative amounts would be credits (refunds)
            debit_amount = amount if amount > 0 else Decimal('0')
            credit_amount = abs(amount) if amount < 0 else Decimal('0')

            ingestable_rows.append({
                'row_id': row.get('row_id', ''),
                'date': date_val,
                'value_date': date_val,  # CC has no separate value date
                'narration': row['description'],
                'debit_amount': str(debit_amount),
                'credit_amount': str(credit_amount),
                'reference_number': '',  # Slice has no reference numbers
                'closing_balance': '',  # CC has no running balance
                'intl_amount': '',  # Slice has no international transactions
                'intl_currency': '',
                'exchange_rate': '',
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
