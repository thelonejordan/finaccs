import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { fetchBankInconsistencies, fetchCreditCardInconsistencies } from './api'

interface InconsistencyCache {
  // Combined total for Header badge
  count: number | null
  previousCount: number | null
  // Separate counts for each tab
  bankCount: number | null
  creditCardCount: number | null
  creditCardCounts: {
    duplicate: number
    cross_card: number
    missing_description: number
  } | null
  // Meta
  lastFetched: number | null
  isLoading: boolean
  isStale: boolean
}

interface InconsistencyCacheContextValue {
  cache: InconsistencyCache
  invalidate: () => void
  refresh: () => Promise<void>
}

const InconsistencyCacheContext = createContext<InconsistencyCacheContextValue | null>(null)

export function InconsistencyCacheProvider({ children }: { children: ReactNode }) {
  const [cache, setCache] = useState<InconsistencyCache>({
    count: null,
    previousCount: null,
    bankCount: null,
    creditCardCount: null,
    creditCardCounts: null,
    lastFetched: null,
    isLoading: false,
    isStale: false,
  })

  const abortControllerRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(async () => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    setCache(prev => ({
      ...prev,
      isLoading: true,
      previousCount: prev.count ?? prev.previousCount, // Preserve for display
    }))

    try {
      const [bankResult, creditResult] = await Promise.all([
        // Fetch with limit=1 just to get the count (uses new bank-inconsistencies endpoint)
        fetchBankInconsistencies({ limit: 1, offset: 0 }),
        // Fetch credit card inconsistencies to get counts
        fetchCreditCardInconsistencies(),
      ])
      const total = bankResult.total + creditResult.total

      setCache({
        count: total,
        previousCount: total,
        bankCount: bankResult.total,
        creditCardCount: creditResult.total,
        creditCardCounts: creditResult.counts,
        lastFetched: Date.now(),
        isLoading: false,
        isStale: false,
      })
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Failed to fetch inconsistency counts:', error)
        setCache(prev => ({ ...prev, isLoading: false, isStale: false }))
      }
    }
  }, [])

  // Initial fetch and refetch when stale
  useEffect(() => {
    if ((cache.count === null || cache.isStale) && !cache.isLoading) {
      fetchData()
    }
  }, [cache.count, cache.isStale, cache.isLoading, fetchData])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const invalidate = useCallback(() => {
    setCache(prev => ({ ...prev, isStale: true }))
  }, [])

  const refresh = useCallback(async () => {
    await fetchData()
  }, [fetchData])

  return (
    <InconsistencyCacheContext.Provider value={{ cache, invalidate, refresh }}>
      {children}
    </InconsistencyCacheContext.Provider>
  )
}

export function useInconsistencyCache() {
  const context = useContext(InconsistencyCacheContext)
  if (!context) {
    throw new Error('useInconsistencyCache must be used within InconsistencyCacheProvider')
  }
  return context
}
