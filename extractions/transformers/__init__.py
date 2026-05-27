"""
Transformer framework for the unified extraction system.

This module provides:
- BaseTransformer: Abstract base class for all transformers
- Transformer registry: Maps transformer names to classes
- transform_artifact(): Helper to transform ExtractionArtifact to DataSourceArtifact
"""
import gzip
import hashlib
import csv
import io
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Dict, Type, Optional, List
from decimal import Decimal


@dataclass
class TransformResult:
    """Result of a transformation operation."""
    data: str
    content_format: str
    row_count: int


class BaseTransformer(ABC):
    """Base class for all transformers."""
    name: str
    version: str = '1.0'
    output_target: str  # 'bank_account_transactions' or 'credit_card_transactions'

    @abstractmethod
    def transform(self, data: str, content_format: str, artifact_key: str = '') -> TransformResult:
        """
        Transform input data to output format.

        Args:
            data: Raw data string (CSV or JSON)
            content_format: Input content format ('csv' or 'json')
            artifact_key: Optional key (e.g., card number for multi-card PDFs)

        Returns:
            TransformResult with transformed data
        """
        pass


# Utility functions
def compress_data(data_str: str) -> bytes:
    """Compress string data with gzip."""
    return gzip.compress(data_str.encode('utf-8'))


def decompress_data(data_bytes: bytes) -> str:
    """Decompress gzip data to string."""
    return gzip.decompress(data_bytes).decode('utf-8')


def compute_hash(data_str: str) -> str:
    """Compute SHA-256 hash of string data."""
    return hashlib.sha256(data_str.encode('utf-8')).hexdigest()


# Transformer Registry
TRANSFORMERS: Dict[str, Type[BaseTransformer]] = {}


def register_transformer(cls: Type[BaseTransformer]) -> Type[BaseTransformer]:
    """Decorator to register a transformer class."""
    TRANSFORMERS[cls.name] = cls
    return cls


def get_transformer(name: str) -> Optional[BaseTransformer]:
    """Get a transformer instance by name."""
    cls = TRANSFORMERS.get(name)
    return cls() if cls else None


def transform_artifact(extraction_artifact, transformer_name: Optional[str] = None):
    """
    Transform an ExtractionArtifact to create a DataSourceArtifact.

    Args:
        extraction_artifact: ExtractionArtifact instance
        transformer_name: Optional override for transformer name

    Returns:
        DataSourceArtifact instance

    Raises:
        ValueError: If transformer not found or transformation fails
    """
    from extractions.models import DataSourceArtifact

    # Get transformer name
    name = transformer_name or extraction_artifact.transformer
    if not name:
        raise ValueError("No transformer specified for artifact")

    transformer = get_transformer(name)
    if not transformer:
        raise ValueError(f"Unknown transformer: {name}")

    # Decompress and transform
    data = decompress_data(extraction_artifact.content)
    result = transformer.transform(data, extraction_artifact.content_format, extraction_artifact.artifact_key)

    # Create DataSourceArtifact
    data_source_artifact = DataSourceArtifact.objects.create(
        source_artifact=extraction_artifact,
        data_source_target=transformer.output_target,
        content=compress_data(result.data),
        content_hash=compute_hash(result.data),
        row_count=result.row_count,
        transformer=name,
    )

    # Update extraction artifact status
    extraction_artifact.transformation_status = 'transformed'
    extraction_artifact.save()

    return data_source_artifact


def bulk_transform_artifacts(extraction_artifacts, transformer_name: Optional[str] = None):
    """
    Transform multiple ExtractionArtifacts to create DataSourceArtifacts.

    Args:
        extraction_artifacts: List of ExtractionArtifact instances
        transformer_name: Optional override for transformer name

    Returns:
        List of created DataSourceArtifact instances
    """
    results = []
    for artifact in extraction_artifacts:
        try:
            result = transform_artifact(artifact, transformer_name)
            results.append(result)
        except ValueError:
            # Skip artifacts that can't be transformed
            continue
    return results


# Import all transformers to register them
from . import icici_cc_transactions
from . import bank_transactions
from . import legacy_cc_transactions
from . import slice_cc_transactions
from . import cc_transactions
