"""
Cache utilities for inconsistencies API.

Uses version-based invalidation since LocMemCache doesn't support pattern-based deletion.
When invalidating, we increment the version number, causing old cache keys to be orphaned.
"""
from django.core.cache import cache

VERSION_KEY_BANK = 'bank_inconsistencies_version'
VERSION_KEY_CC = 'cc_inconsistencies_version'


def _get_version(key):
    """Get the current version for a cache key prefix."""
    return cache.get(key, 1)


def _increment_version(key):
    """Increment the version, effectively invalidating all keys with old version."""
    version = _get_version(key)
    cache.set(key, version + 1, None)


def get_bank_inconsistencies_key(bank_account_id=None, limit=100, offset=0):
    """Generate cache key for bank inconsistencies API."""
    version = _get_version(VERSION_KEY_BANK)
    return f"bank_inc:v{version}:{bank_account_id}:{limit}:{offset}"


def get_cc_inconsistencies_key(credit_card_id=None, include_dismissed=False):
    """Generate cache key for credit card inconsistencies API."""
    version = _get_version(VERSION_KEY_CC)
    return f"cc_inc:v{version}:{credit_card_id}:{include_dismissed}"


def invalidate_bank_inconsistencies():
    """Invalidate all bank inconsistency cache entries."""
    _increment_version(VERSION_KEY_BANK)


def invalidate_cc_inconsistencies():
    """Invalidate all credit card inconsistency cache entries."""
    _increment_version(VERSION_KEY_CC)


def invalidate_all_inconsistencies():
    """Invalidate all inconsistency caches."""
    invalidate_bank_inconsistencies()
    invalidate_cc_inconsistencies()
