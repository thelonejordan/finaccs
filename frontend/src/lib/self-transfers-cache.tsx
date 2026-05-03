import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { fetchSelfTransferSuggestions } from './api'

interface SelfTransfersCache {
  count: number | null
  previousCount: number | null
  lastFetched: number | null
  isLoading: boolean
  isStale: boolean
}

interface SelfTransfersCacheContextValue {
  cache: SelfTransfersCache
  invalidate: () => void
  refresh: () => Promise<void>
}

const SelfTransfersCacheContext = createContext<SelfTransfersCacheContextValue | null>(null)

export function SelfTransfersCacheProvider({ children }: { children: ReactNode }) {
  const [cache, setCache] = useState<SelfTransfersCache>({
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
      const result = await fetchSelfTransferSuggestions()
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
        console.error('Failed to fetch self-transfers count:', error)
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
    <SelfTransfersCacheContext.Provider value={{ cache, invalidate, refresh }}>
      {children}
    </SelfTransfersCacheContext.Provider>
  )
}

export function useSelfTransfersCache() {
  const context = useContext(SelfTransfersCacheContext)
  if (!context) {
    throw new Error('useSelfTransfersCache must be used within SelfTransfersCacheProvider')
  }
  return context
}
