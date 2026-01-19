"""
Transformer registry for credit card extraction artifacts.

Transformers convert raw extraction artifacts into standardized formats
ready for loading into the database.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal
from typing import Dict, Type, Optional
import csv
import io


@dataclass
class TransformResult:
    """Result of a transformation operation."""
    data: str
    content_type: str
    row_count: int
    output_name: str


class BaseTransformer(ABC):
    """Base class for all transformers."""
    name: str
    version: str = '1.0'

    @abstractmethod
    def transform(self, data: str, content_type: str, artifact_type: str = '') -> TransformResult:
        """Transform input data to output format.

        Args:
            data: Raw data string (CSV or JSON)
            content_type: Input content type ('csv' or 'json')
            artifact_type: The artifact type being transformed (e.g., 'transactions-4375XXXXXXXX8007')

        Returns:
            TransformResult with transformed data
        """
        pass


class LegacyCCTransactionsTransformer(BaseTransformer):
    """Transform legacy CC CSV (date,description,amount,intl_amount) to ingestable format.

    This transformer handles the old CSV format from extract_sbi_credit_card_csv extractor.

    Legacy format: date, description, amount, intl_amount
    Ingestable format: date, value_date, narration, debit_amount, credit_amount,
                       reference_number, closing_balance, intl_amount, intl_currency, exchange_rate
    """
    name = 'legacy_cc_transactions'
    version = '1.0'

    def transform(self, data: str, content_type: str, artifact_type: str = '') -> TransformResult:
        if content_type != 'csv':
            raise ValueError(f"Expected CSV content type, got: {content_type}")

        reader = csv.DictReader(io.StringIO(data))

        ingestable_rows = []
        for row in reader:
            date_val = row['date']
            amount = Decimal(row['amount']) if row['amount'] else Decimal('0')
            intl_amount_val = row.get('intl_amount', '')
            intl_amount = Decimal(intl_amount_val) if intl_amount_val else Decimal('0')

            # Split amount into debit/credit
            # Positive = charge (debit), Negative = payment (credit)
            debit_amount = amount if amount > 0 else Decimal('0')
            credit_amount = abs(amount) if amount < 0 else Decimal('0')

            # Calculate exchange rate if both amounts present
            exchange_rate = ''
            if intl_amount != 0 and amount != 0:
                exchange_rate = str(abs(intl_amount / amount))

            ingestable_rows.append({
                'date': date_val,
                'value_date': date_val,  # CC has no separate value date
                'narration': row['description'],
                'debit_amount': str(debit_amount),
                'credit_amount': str(credit_amount),
                'reference_number': '',  # Legacy format has no reference number
                'closing_balance': '',  # CC has no running balance
                'intl_amount': intl_amount_val,
                'intl_currency': '',
                'exchange_rate': exchange_rate,
            })

        # Create ingestable CSV
        output = io.StringIO()
        fieldnames = [
            'date', 'value_date', 'narration', 'debit_amount', 'credit_amount',
            'reference_number', 'closing_balance', 'intl_amount', 'intl_currency', 'exchange_rate'
        ]
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(ingestable_rows)

        # Output name: ingestable_{artifact_type}
        output_name = f'ingestable_{artifact_type}' if artifact_type else 'ingestable_transactions'

        return TransformResult(
            data=output.getvalue(),
            content_type='csv',
            row_count=len(ingestable_rows),
            output_name=output_name,
        )


class ICICICCTransactionsTransformer(BaseTransformer):
    """Transform ICICI CC raw transactions to ingestable format.

    Raw format: row_id, date, ser_no, description, amount, intl_amount, intl_currency, card_number
    Ingestable format: row_id, date, value_date, narration, debit_amount, credit_amount,
                       reference_number, closing_balance, intl_amount, intl_currency, exchange_rate

    For per-card artifacts (transactions-{card_no}), outputs transactions_ingestable-{card_no}
    """
    name = 'icici_cc_transactions'
    version = '1.2'

    def transform(self, data: str, content_type: str, artifact_type: str = '') -> TransformResult:
        if content_type != 'csv':
            raise ValueError(f"Expected CSV content type, got: {content_type}")

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

            # Calculate exchange rate if both amounts present (up to 4 decimal places)
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

        # Output name: ingestable_{artifact_type}
        # transactions -> ingestable_transactions
        # transactions-4375XXXXXXXX8007 -> ingestable_transactions-4375XXXXXXXX8007
        output_name = f'ingestable_{artifact_type}' if artifact_type else 'ingestable_transactions'

        return TransformResult(
            data=output.getvalue(),
            content_type='csv',
            row_count=len(ingestable_rows),
            output_name=output_name,
        )


# Transformer Registry
TRANSFORMERS: Dict[str, Type[BaseTransformer]] = {
    'legacy_cc_transactions': LegacyCCTransactionsTransformer,
    'icici_cc_transactions': ICICICCTransactionsTransformer,
}


def get_transformer(name: str) -> Optional[BaseTransformer]:
    """Get a transformer instance by name.

    Args:
        name: Transformer name (e.g., 'icici_cc_transactions')

    Returns:
        BaseTransformer instance or None if not found
    """
    cls = TRANSFORMERS.get(name)
    return cls() if cls else None


def transform_artifact(artifact) -> Optional['ExtractionArtifact']:
    """Transform an artifact using its declared transformer.

    Args:
        artifact: ExtractionArtifact instance with is_transformable=True

    Returns:
        New ExtractionArtifact instance (transformed), or None if not transformable

    Raises:
        ValueError: If transformer_name is unknown
    """
    from .models import ExtractionArtifact
    from .pdf_extractor import decompress_data, compress_data, compute_hash

    if not artifact.is_transformable or not artifact.transformer_name:
        return None

    transformer = get_transformer(artifact.transformer_name)
    if not transformer:
        raise ValueError(f"Unknown transformer: {artifact.transformer_name}")

    data = decompress_data(artifact.data)
    result = transformer.transform(data, artifact.content_type, artifact.artifact_type)

    # Create transformed artifact
    return ExtractionArtifact.objects.create(
        extraction=artifact.extraction,
        artifact_type=result.output_name,
        content_type=result.content_type,
        data=compress_data(result.data),
        data_hash=compute_hash(result.data),
        row_count=result.row_count,
        is_transformed=True,
        source_artifact=artifact,
    )
