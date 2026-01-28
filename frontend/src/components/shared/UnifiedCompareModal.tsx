import { useState, useEffect, useMemo } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import {
  XIcon,
  SearchIcon,
  GitCompareIcon,
  BookOpenIcon,
  UsersIcon,
  UserIcon,
  BuildingIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  CreditCardIcon,
  LandmarkIcon,
} from "lucide-react"
import {
  fetchStories,
  fetchEntities,
  fetchStory,
  fetchEntity,
  type Story,
  type Entity,
  type StoryDetail,
  type EntityDetail,
  type StoryTransaction,
  type EntityTransaction,
} from "@/lib/api"

interface UnifiedCompareModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Optional: pre-select the current story or entity
  initialStoryId?: string
  initialEntityId?: string
}

type TransactionItem = StoryTransaction | EntityTransaction

interface SelectedItem {
  type: "story" | "entity"
  id: string
  name: string
  icon: string
}

interface ComparisonResult {
  items: Array<{
    type: "story" | "entity"
    id: string
    name: string
    icon: string
    transactionCount: number
    totalSpent: number
  }>
  commonTransactions: TransactionItem[]
  uniqueTransactions: Record<string, TransactionItem[]>
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-"
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function getTransactionKey(txn: TransactionItem): string {
  return `${txn.type}-${txn.id}`
}

export function UnifiedCompareModal({
  open,
  onOpenChange,
  initialStoryId,
  initialEntityId,
}: UnifiedCompareModalProps) {
  const [stories, setStories] = useState<Story[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  // Selection state
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])

  // Comparison state
  const [comparing, setComparing] = useState(false)
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null)
  const [activeResultTab, setActiveResultTab] = useState<string>("common")

  // Filter stories based on search query
  const filteredStories = useMemo(() => {
    if (!searchQuery.trim()) return stories
    const query = searchQuery.toLowerCase()
    return stories.filter(story => story.name.toLowerCase().includes(query))
  }, [stories, searchQuery])

  // Filter entities based on search query
  const filteredEntities = useMemo(() => {
    if (!searchQuery.trim()) return entities
    const query = searchQuery.toLowerCase()
    return entities.filter(entity => entity.name.toLowerCase().includes(query))
  }, [entities, searchQuery])

  useEffect(() => {
    if (open) {
      loadData()
      setSearchQuery("")
      setComparisonResult(null)
      setActiveResultTab("common")
    }
  }, [open])

  // Pre-select initial item when data loads
  useEffect(() => {
    if (!loading && (initialStoryId || initialEntityId)) {
      const items: SelectedItem[] = []

      if (initialStoryId) {
        const story = stories.find(s => s.story_id === initialStoryId)
        if (story) {
          items.push({
            type: "story",
            id: story.story_id,
            name: story.name,
            icon: story.icon,
          })
        }
      }

      if (initialEntityId) {
        const entity = entities.find(e => e.entity_id === initialEntityId)
        if (entity) {
          items.push({
            type: "entity",
            id: entity.entity_id,
            name: entity.name,
            icon: entity.icon,
          })
        }
      }

      if (items.length > 0) {
        setSelectedItems(items)
      }
    }
  }, [loading, initialStoryId, initialEntityId, stories, entities])

  const loadData = async () => {
    setLoading(true)
    try {
      const [storiesData, entitiesData] = await Promise.all([
        fetchStories(),
        fetchEntities(),
      ])
      setStories(storiesData.stories)
      setEntities(entitiesData.entities)
    } catch (err) {
      console.error("Failed to load data:", err)
    } finally {
      setLoading(false)
    }
  }

  const isSelected = (type: "story" | "entity", id: string) => {
    return selectedItems.some(item => item.type === type && item.id === id)
  }

  const toggleSelection = (type: "story" | "entity", id: string, name: string, icon: string) => {
    if (isSelected(type, id)) {
      setSelectedItems(prev => prev.filter(item => !(item.type === type && item.id === id)))
    } else {
      setSelectedItems(prev => [...prev, { type, id, name, icon }])
    }
  }

  const runComparison = async () => {
    if (selectedItems.length < 2) return

    setComparing(true)
    setComparisonResult(null)

    try {
      // Fetch all selected items' details
      const detailsPromises = selectedItems.map(async (item) => {
        if (item.type === "story") {
          const detail = await fetchStory(item.id)
          return { type: "story" as const, detail }
        } else {
          const detail = await fetchEntity(item.id)
          return { type: "entity" as const, detail }
        }
      })

      const details = await Promise.all(detailsPromises)

      // Build transaction sets for each item
      const itemTransactionSets: Map<string, Set<string>> = new Map()
      const allTransactions: Map<string, TransactionItem> = new Map()

      details.forEach((d, index) => {
        const itemKey = `${selectedItems[index].type}-${selectedItems[index].id}`
        const txnKeys = new Set<string>()

        const transactions = d.type === "story"
          ? (d.detail as StoryDetail).transactions
          : (d.detail as EntityDetail).transactions

        transactions.forEach(txn => {
          const key = getTransactionKey(txn)
          txnKeys.add(key)
          if (!allTransactions.has(key)) {
            allTransactions.set(key, txn)
          }
        })

        itemTransactionSets.set(itemKey, txnKeys)
      })

      // Find common transactions (intersection of all sets)
      const allItemKeys = Array.from(itemTransactionSets.keys())
      let commonKeys: Set<string> = new Set()

      if (allItemKeys.length > 0) {
        commonKeys = new Set(itemTransactionSets.get(allItemKeys[0])!)
        for (let i = 1; i < allItemKeys.length; i++) {
          const txnKeys = itemTransactionSets.get(allItemKeys[i])!
          commonKeys = new Set([...commonKeys].filter(k => txnKeys.has(k)))
        }
      }

      const commonTransactions: TransactionItem[] = []
      commonKeys.forEach(key => {
        const txn = allTransactions.get(key)
        if (txn) commonTransactions.push(txn)
      })

      // Find unique transactions per item
      const uniqueTransactions: Record<string, TransactionItem[]> = {}

      allItemKeys.forEach(itemKey => {
        const txnKeys = itemTransactionSets.get(itemKey)!
        const uniqueKeys = [...txnKeys].filter(k => !commonKeys.has(k))
        uniqueTransactions[itemKey] = uniqueKeys
          .map(k => allTransactions.get(k)!)
          .filter(Boolean)
      })

      // Build result items
      const resultItems = details.map((d, index) => {
        const item = selectedItems[index]
        const detail = d.detail as StoryDetail | EntityDetail
        return {
          type: item.type,
          id: item.id,
          name: item.name,
          icon: item.icon,
          transactionCount: detail.transaction_count,
          totalSpent: detail.total_spent,
        }
      })

      setComparisonResult({
        items: resultItems,
        commonTransactions: commonTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        uniqueTransactions,
      })
      setActiveResultTab("common")
    } catch (err) {
      console.error("Failed to compare:", err)
    } finally {
      setComparing(false)
    }
  }

  const getActiveTransactions = (): TransactionItem[] => {
    if (!comparisonResult) return []

    if (activeResultTab === "common") {
      return comparisonResult.commonTransactions
    }

    return comparisonResult.uniqueTransactions[activeResultTab] || []
  }

  const resetComparison = () => {
    setComparisonResult(null)
    setSelectedItems([])
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card rounded-lg shadow-xl p-6 w-full max-w-3xl max-h-[85vh] overflow-hidden z-50 flex flex-col">
          <Dialog.Title className="text-lg font-semibold text-foreground flex items-center gap-2">
            <GitCompareIcon className="h-5 w-5" />
            Compare Stories & Entities
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            Select stories and entities to compare their transactions.
          </Dialog.Description>

          <div className="mt-4 flex-1 overflow-hidden flex flex-col min-h-0">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : comparisonResult ? (
              // Comparison Results View
              <div className="flex-1 flex flex-col min-h-0">
                {/* Summary */}
                <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg mb-4">
                  <div className="flex items-center gap-2">
                    {comparisonResult.items.map((item, idx) => (
                      <span key={`${item.type}-${item.id}`} className="flex items-center gap-1">
                        {idx > 0 && <span className="text-muted-foreground mx-1">vs</span>}
                        <span className="text-lg">{item.icon}</span>
                        <span className="font-medium text-sm">{item.name}</span>
                      </span>
                    ))}
                  </div>
                  <div className="flex-1" />
                  <button
                    onClick={resetComparison}
                    className="px-3 py-1.5 text-sm font-medium rounded-md border border-border text-muted-foreground hover:bg-accent"
                  >
                    New Comparison
                  </button>
                </div>

                {/* Result Tabs */}
                <div className="flex gap-2 mb-4 flex-wrap">
                  <button
                    onClick={() => setActiveResultTab("common")}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                      activeResultTab === "common"
                        ? "border-green-500 bg-green-500/10 text-green-600"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    Common ({comparisonResult.commonTransactions.length})
                  </button>
                  {comparisonResult.items.map(item => {
                    const key = `${item.type}-${item.id}`
                    const uniqueCount = comparisonResult.uniqueTransactions[key]?.length || 0
                    return (
                      <button
                        key={key}
                        onClick={() => setActiveResultTab(key)}
                        className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors flex items-center gap-1.5 ${
                          activeResultTab === key
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        <span>{item.icon}</span>
                        <span>Only in {item.name} ({uniqueCount})</span>
                      </button>
                    )
                  })}
                </div>

                {/* Transaction List */}
                <div className="flex-1 overflow-y-auto min-h-0">
                  {getActiveTransactions().length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No {activeResultTab === "common" ? "common" : "unique"} transactions</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/30">
                            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider w-10">
                              Type
                            </th>
                            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider w-24">
                              Date
                            </th>
                            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Description
                            </th>
                            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider w-24">
                              Category
                            </th>
                            <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider w-28">
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {getActiveTransactions().map((txn) => (
                            <tr key={getTransactionKey(txn)} className="hover:bg-muted/30">
                              <td className="px-3 py-2">
                                {txn.type === "bank" ? (
                                  <LandmarkIcon className="h-4 w-4 text-blue-500" />
                                ) : (
                                  <CreditCardIcon className="h-4 w-4 text-purple-500" />
                                )}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                {formatDate(txn.date)}
                              </td>
                              <td className="px-3 py-2">
                                <span className="truncate block max-w-xs" title={txn.description}>
                                  {txn.description}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
                                  {txn.category || "Uncategorized"}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                {txn.amount >= 0 ? (
                                  <span className="text-(--color-expense) font-medium flex items-center justify-end gap-1">
                                    {formatCurrency(Math.abs(txn.amount))}
                                    <ArrowDownIcon className="h-3 w-3 flex-shrink-0" />
                                  </span>
                                ) : (
                                  <span className="text-(--color-income) font-medium flex items-center justify-end gap-1">
                                    {formatCurrency(Math.abs(txn.amount))}
                                    <ArrowUpIcon className="h-3 w-3 flex-shrink-0" />
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // Selection View
              <div className="flex-1 flex flex-col min-h-0">
                {/* Selected Items Display */}
                {selectedItems.length > 0 && (
                  <div className="mb-4 p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Selected ({selectedItems.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedItems.map(item => (
                        <button
                          key={`${item.type}-${item.id}`}
                          onClick={() => toggleSelection(item.type, item.id, item.name, item.icon)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-sm hover:bg-primary/20 transition-colors"
                        >
                          <span>{item.icon}</span>
                          <span>{item.name}</span>
                          <XIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Search */}
                <div className="relative mb-4">
                  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search stories and entities..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                {/* Stories Section */}
                <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
                  {filteredStories.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                        <BookOpenIcon className="h-4 w-4" />
                        Stories ({filteredStories.length})
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        {filteredStories.map(story => (
                          <button
                            key={story.story_id}
                            onClick={() => toggleSelection("story", story.story_id, story.name, story.icon)}
                            className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors text-left ${
                              isSelected("story", story.story_id)
                                ? "border-primary bg-primary/5"
                                : "border-border hover:bg-muted/50"
                            }`}
                          >
                            <span className="text-xl">{story.icon}</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{story.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {story.transaction_count} transactions
                              </p>
                            </div>
                            {isSelected("story", story.story_id) && (
                              <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                                <span className="text-primary-foreground text-xs">✓</span>
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {filteredEntities.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                        <UsersIcon className="h-4 w-4" />
                        Entities ({filteredEntities.length})
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        {filteredEntities.map(entity => (
                          <button
                            key={entity.entity_id}
                            onClick={() => toggleSelection("entity", entity.entity_id, entity.name, entity.icon)}
                            className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors text-left ${
                              isSelected("entity", entity.entity_id)
                                ? "border-primary bg-primary/5"
                                : "border-border hover:bg-muted/50"
                            }`}
                          >
                            <span className="text-xl">{entity.icon}</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate flex items-center gap-1">
                                {entity.name}
                                {entity.entity_type === "person" ? (
                                  <UserIcon className="h-3 w-3 text-blue-500" />
                                ) : (
                                  <BuildingIcon className="h-3 w-3 text-purple-500" />
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {entity.transaction_count} transactions
                              </p>
                            </div>
                            {isSelected("entity", entity.entity_id) && (
                              <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                                <span className="text-primary-foreground text-xs">✓</span>
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {filteredStories.length === 0 && filteredEntities.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      {searchQuery ? (
                        <p>No results match "{searchQuery}"</p>
                      ) : (
                        <p>No stories or entities to compare</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Compare Button */}
                <div className="pt-4 border-t border-border mt-4">
                  <button
                    onClick={runComparison}
                    disabled={selectedItems.length < 2 || comparing}
                    className="w-full px-4 py-2.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {comparing ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Comparing...
                      </>
                    ) : (
                      <>
                        <GitCompareIcon className="h-4 w-4" />
                        Compare Selected ({selectedItems.length})
                      </>
                    )}
                  </button>
                  {selectedItems.length < 2 && (
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      Select at least 2 items to compare
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <Dialog.Close asChild>
            <button
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-accent"
              aria-label="Close"
            >
              <XIcon className="h-4 w-4 text-muted-foreground" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
