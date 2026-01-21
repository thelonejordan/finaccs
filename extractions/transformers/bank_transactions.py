"""
Bank transactions transformer.

Pass-through transformer for bank transactions - they are already in ingestable format.
"""
import csv
import io

from . import BaseTransformer, TransformResult, register_transformer


@register_transformer
class BankTransactionsTransformer(BaseTransformer):
    """
    Pass-through transformer for bank transactions.

    Bank transactions from extractors are already in the standardized format:
    row_id, date, value_date, narration, debit_amount, credit_amount, reference_number, closing_balance

    This transformer simply passes through the data with minimal validation.
    """
    name = 'bank_transactions'
    version = '1.0'
    output_target = 'bank_account_transactions'

    def transform(self, data: str, content_format: str, artifact_key: str = '') -> TransformResult:
        if content_format != 'csv':
            raise ValueError(f"Expected CSV content format, got: {content_format}")

        # Count rows
        reader = csv.reader(io.StringIO(data))
        row_count = max(0, sum(1 for _ in reader) - 1)  # Exclude header

        return TransformResult(
            data=data,  # Pass through unchanged
            content_format='csv',
            row_count=row_count,
        )
