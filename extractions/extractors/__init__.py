"""
Extractor framework for the unified extraction system.

This module provides:
- BaseExtractor: Abstract base class for all extractors
- Extractor registry: Maps extractor names to classes
- detect_extractor(): Auto-detection based on file extension and domain
- create_extraction(): Helper to create Extraction records with artifacts
"""
import gzip
import hashlib
import csv
import io
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, Type, Optional, List, Any, BinaryIO
from pathlib import Path


@dataclass
class ArtifactSpec:
    """Specification for an extraction artifact."""
    artifact_type: str
    content: str
    content_format: str  # 'csv', 'json', 'txt'
    row_count: int = 0
    artifact_key: str = ''  # e.g., card number for multi-card PDFs
    data_source_target: str = ''  # 'bank_account_transactions' | 'credit_card_transactions'
    transformer: str = ''  # transformer name


@dataclass
class ExtractionResult:
    """Result of an extraction operation."""
    artifacts: List[ArtifactSpec] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)  # Quick-access fields for Extraction model
    error: Optional[str] = None


class BaseExtractor(ABC):
    """Base class for all extractors."""
    name: str  # Extractor name (e.g., 'icici_cc_pdf')
    version: str = '1.0'
    domain: str  # 'bank_account' or 'credit_card'
    supported_extensions: List[str] = []  # e.g., ['.pdf', '.xlsx']

    @abstractmethod
    def extract(self, file_bytes: bytes, password: Optional[str] = None) -> ExtractionResult:
        """
        Extract data from file bytes.

        Args:
            file_bytes: Raw file content
            password: Optional password for encrypted files

        Returns:
            ExtractionResult with artifacts and metadata
        """
        pass

    def can_extract(self, filename: str) -> bool:
        """Check if this extractor can handle the given file."""
        ext = Path(filename).suffix.lower()
        return ext in self.supported_extensions


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


def count_csv_rows(csv_data: str) -> int:
    """Count rows in CSV data (excluding header)."""
    reader = csv.reader(io.StringIO(csv_data))
    return max(0, sum(1 for _ in reader) - 1)


# Extractor Registry
EXTRACTORS: Dict[str, Type[BaseExtractor]] = {}


def register_extractor(cls: Type[BaseExtractor]) -> Type[BaseExtractor]:
    """Decorator to register an extractor class."""
    EXTRACTORS[cls.name] = cls
    return cls


def get_extractor(name: str) -> Optional[BaseExtractor]:
    """Get an extractor instance by name."""
    cls = EXTRACTORS.get(name)
    return cls() if cls else None


def get_extractor_choices() -> List[tuple]:
    """Get list of (name, display_name) tuples for Django model choices."""
    return [(name, f"{cls.name} ({cls.domain})") for name, cls in EXTRACTORS.items()]


def detect_extractor(filename: str, domain: str) -> Optional[str]:
    """
    Auto-detect the appropriate extractor based on filename and domain.

    Args:
        filename: File name to analyze
        domain: 'bank_account' or 'credit_card'

    Returns:
        Extractor name or None if no suitable extractor found
    """
    ext = Path(filename).suffix.lower()

    # Find all extractors that can handle this file and domain
    candidates = []
    for name, cls in EXTRACTORS.items():
        extractor = cls()
        if extractor.domain == domain and extractor.can_extract(filename):
            candidates.append(name)

    # If only one candidate, use it
    if len(candidates) == 1:
        return candidates[0]

    # Multiple candidates - use heuristics based on filename
    filename_lower = filename.lower()

    if domain == 'bank_account':
        if 'sbi' in filename_lower and ext == '.pdf':
            return 'sbi_pdf' if 'sbi_pdf' in candidates else None
        if 'icici' in filename_lower and ext == '.xlsx':
            return 'icici_xlsx' if 'icici_xlsx' in candidates else None
        if 'hdfc' in filename_lower and ext in ['.txt', '.csv']:
            return 'hdfc_txt' if 'hdfc_txt' in candidates else None
        # Default to generic extractors
        if ext in ['.xlsx', '.xls'] and 'generic_xlsx' in candidates:
            return 'generic_xlsx'
        if ext in ['.txt', '.csv'] and 'hdfc_txt' in candidates:
            return 'hdfc_txt'
        if ext == '.pdf' and 'sbi_pdf' in candidates:
            return 'sbi_pdf'

    elif domain == 'credit_card':
        if ext == '.pdf':
            if 'slice' in filename_lower:
                return 'slice_cc_pdf' if 'slice_cc_pdf' in candidates else None
            if 'laststatement' in filename_lower or 'last_statement' in filename_lower:
                return 'icici_cc_laststatement_pdf' if 'icici_cc_laststatement_pdf' in candidates else None
            return 'icici_cc_pdf' if 'icici_cc_pdf' in candidates else None
        if ext == '.csv':
            return 'sbi_cc_csv' if 'sbi_cc_csv' in candidates else None

    return candidates[0] if candidates else None


def create_extraction(source_file, extractor_name: str, password: Optional[str] = None):
    """
    Run extraction and create Extraction record with artifacts.

    Args:
        source_file: SourceFile instance
        extractor_name: Name of extractor to use
        password: Optional password for encrypted files

    Returns:
        Extraction instance

    Raises:
        ValueError: If extractor not found or extraction fails
    """
    from extractions.models import Extraction, ExtractionArtifact, SourceFile

    extractor = get_extractor(extractor_name)
    if not extractor:
        raise ValueError(f"Unknown extractor: {extractor_name}")

    # Get file bytes
    if source_file.file_data:
        file_bytes = decompress_data(source_file.file_data)
        if isinstance(file_bytes, str):
            file_bytes = file_bytes.encode('utf-8')
    else:
        raise ValueError("Source file has no data")

    # Run extraction
    result = extractor.extract(file_bytes, password=password)

    if result.error:
        # Create failed extraction
        extraction = Extraction.objects.create(
            source_file=source_file,
            extractor_name=extractor_name,
            extractor_version=extractor.version,
            status='error',
            error_message=result.error,
        )
        return extraction

    # Create successful extraction
    extraction = Extraction.objects.create(
        source_file=source_file,
        extractor_name=extractor_name,
        extractor_version=extractor.version,
        status='completed',
    )

    # Create artifacts
    for spec in result.artifacts:
        ExtractionArtifact.objects.create(
            extraction=extraction,
            artifact_type=spec.artifact_type,
            artifact_key=spec.artifact_key,
            content_format=spec.content_format,
            content=compress_data(spec.content),
            content_hash=compute_hash(spec.content),
            row_count=spec.row_count,
            data_source_target=spec.data_source_target,
            transformer=spec.transformer,
            transformation_status='not_transformed' if spec.transformer else 'not_applicable',
        )

    # Update source file status
    source_file.extraction_status = 'extracted'
    source_file.extractor = extractor_name
    source_file.save()

    return extraction


# Import all extractors to register them
from . import icici_cc_pdf
from . import icici_cc_laststatement_pdf
from . import sbi_pdf
from . import icici_xlsx
from . import hdfc_txt
from . import sbi_cc_csv
from . import slice_cc_pdf
