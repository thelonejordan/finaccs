import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { fetchCCPaymentSuggestions, fetchCCPaymentSuggestionsReverse } from './api'

interface PaymentsCache {
  count: number | null
  previousCount: number | null
  lastFetched: number | null
  isLoading: boolean
  isStale: boolean
}

interface PaymentsCacheContextValue {
  cache: PaymentsCache
  invalidate: () => void
  refresh: () => Promise<void>
}

const PaymentsCacheContext = createContext<PaymentsCacheContextValue | null>(null)

export function PaymentsCacheProvider({ children }: { children: ReactNode }) {
  const [cache, setCache] = useState<PaymentsCache>({
    count: null,
    previousCount: null,
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
      // Fetch both bank-first and cc-first unmatched counts
      const [bankFirstResult, ccFirstResult] = await Promise.all([
        fetchCCPaymentSuggestions(),
        fetchCCPaymentSuggestionsReverse(),
      ])
      const total = bankFirstResult.total + ccFirstResult.total

      setCache({
        count: total,
        previousCount: total,
        lastFetched: Date.now(),
        isLoading: false,
        isStale: false,
      })
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Failed to fetch payments count:', error)
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
    <PaymentsCacheContext.Provider value={{ cache, invalidate, refresh }}>
      {children}
    </PaymentsCacheContext.Provider>
  )
}

export function usePaymentsCache() {
  const context = useContext(PaymentsCacheContext)
  if (!context) {
    throw new Error('usePaymentsCache must be used within PaymentsCacheProvider')
  }
  return context
}
