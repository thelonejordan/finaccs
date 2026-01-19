import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { fetchCCPaymentSuggestions } from './api'

interface StoryCache {
  count: number | null
  previousCount: number | null
  lastFetched: number | null
  isLoading: boolean
  isStale: boolean
}

interface StoryCacheContextValue {
  cache: StoryCache
  invalidate: () => void
  refresh: () => Promise<void>
}

const StoryCacheContext = createContext<StoryCacheContextValue | null>(null)

export function StoryCacheProvider({ children }: { children: ReactNode }) {
  const [cache, setCache] = useState<StoryCache>({
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
      const result = await fetchCCPaymentSuggestions()
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
        console.error('Failed to fetch story count:', error)
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
    <StoryCacheContext.Provider value={{ cache, invalidate, refresh }}>
      {children}
    </StoryCacheContext.Provider>
  )
}

export function useStoryCache() {
  const context = useContext(StoryCacheContext)
  if (!context) {
    throw new Error('useStoryCache must be used within StoryCacheProvider')
  }
  return context
}
