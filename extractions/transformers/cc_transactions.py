"""
Credit card transactions pass-through transformer.

For data already in the ingestable credit card format (from standard_cc_csv extractor).
"""
import csv
import io

from . import BaseTransformer, TransformResult, register_transformer


@register_transformer
class CCTransactionsTransformer(BaseTransformer):
    """
    Pass-through transformer for credit card transactions.

    Used when credit card data is already in the ingestable format:
    row_id, date, value_date, narration, debit_amount, credit_amount,
    reference_number, closing_balance, intl_amount, intl_currency, exchange_rate
    """
    name = 'cc_transactions'
    version = '1.0'
    output_target = 'credit_card_transactions'

    def transform(self, data: str, content_format: str, artifact_key: str = '') -> TransformResult:
        if content_format != 'csv':
            raise ValueError(f"Expected CSV content format, got: {content_format}")

        reader = csv.reader(io.StringIO(data))
        row_count = max(0, sum(1 for _ in reader) - 1)

        return TransformResult(
            data=data,
            content_format='csv',
            row_count=row_count,
        )
