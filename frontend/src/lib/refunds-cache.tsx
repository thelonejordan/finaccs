import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { fetchRefundSuggestions } from './api'

interface RefundsCache {
  count: number | null
  previousCount: number | null
  lastFetched: number | null
  isLoading: boolean
  isStale: boolean
}

interface RefundsCacheContextValue {
  cache: RefundsCache
  invalidate: () => void
  refresh: () => Promise<void>
}

const RefundsCacheContext = createContext<RefundsCacheContextValue | null>(null)

export function RefundsCacheProvider({ children }: { children: ReactNode }) {
  const [cache, setCache] = useState<RefundsCache>({
    count: null,
    previousCount: null,
    lastFetched: null,
    isLoading: false,
    isStale: false,
  })

  const abortControllerRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    setCache(prev => ({
      ...prev,
      isLoading: true,
      previousCount: prev.count ?? prev.previousCount,
    }))

    try {
      const result = await fetchRefundSuggestions()
      const total = result.total

      setCache({
        count: total,
        previousCount: total,
        lastFetched: Date.now(),
        isLoading: false,
        isStale: false,
      })
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Failed to fetch refunds count:', error)
        setCache(prev => ({ ...prev, isLoading: false, isStale: false }))
      }
    }
  }, [])

  useEffect(() => {
    if ((cache.count === null || cache.isStale) && !cache.isLoading) {
      fetchData()
    }
  }, [cache.count, cache.isStale, cache.isLoading, fetchData])

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
    <RefundsCacheContext.Provider value={{ cache, invalidate, refresh }}>
      {children}
    </RefundsCacheContext.Provider>
  )
}

export function useRefundsCache() {
  const context = useContext(RefundsCacheContext)
  if (!context) {
    throw new Error('useRefundsCache must be used within RefundsCacheProvider')
  }
  return context
}
