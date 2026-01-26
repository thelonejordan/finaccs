import { useState, useEffect } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import {
  XIcon,
  ArrowLeftIcon,
  GitCompareIcon,
  HashIcon,
  WalletIcon,
  CalendarIcon,
  CreditCardIcon,
  BuildingIcon,
  UserIcon,
} from "lucide-react"
import {
  fetchEntities,
  compareEntities,
  type Entity,
  type EntityComparisonResult,
  type EntityTransaction,
} from "@/lib/api"

interface CompareEntitiesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

type TabType = "common" | string

function TransactionTable({ transactions }: { transactions: EntityTransaction[] }) {
  if (transactions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No transactions
      </div>
    )
  }

  return (
    <div className="overflow-auto max-h-64">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 sticky top-0">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Date</th>
            <th className="text-left px-3 py-2 font-medium">Description</th>
            <th className="text-left px-3 py-2 font-medium">Source</th>
            <th className="text-left px-3 py-2 font-medium">Category</th>
            <th className="text-right px-3 py-2 font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {transactions.map((txn) => (
            <tr key={`${txn.type}-${txn.id}`} className="hover:bg-muted/30">
              <td className="px-3 py-2 whitespace-nowrap">
                <div className="flex items-center gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  {formatDate(txn.date)}
                </div>
              </td>
              <td className="px-3 py-2 max-w-xs truncate" title={txn.description}>
                {txn.description}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <div className="flex items-center gap-1.5">
                  {txn.type === "credit_card" ? (
                    <CreditCardIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <BuildingIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="text-xs">{txn.source}</span>
                </div>
              </td>
              <td className="px-3 py-2">
                <span className="px-2 py-0.5 bg-muted rounded-full text-xs">
                  {txn.category}
                </span>
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap font-mono">
                <span className={txn.amount >= 0 ? "text-red-600" : "text-green-600"}>
                  {formatCurrency(Math.abs(txn.amount))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function CompareEntitiesModal({ open, onOpenChange }: CompareEntitiesModalProps) {
  const [view, setView] = useState<"selection" | "results">("selection")
  const [entities, setEntities] = useState<Entity[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [comparing, setComparing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<EntityComparisonResult | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>("common")

  useEffect(() => {
    if (open) {
      loadEntities()
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      // Reset state when modal closes
      setView("selection")
      setSelectedIds(new Set())
      setResult(null)
      setActiveTab("common")
      setError(null)
    }
  }, [open])

  const loadEntities = async () => {
    setLoading(true)
    try {
      const data = await fetchEntities()
      setEntities(data.entities)
    } catch (err) {
      console.error("Failed to load entities:", err)
    } finally {
      setLoading(false)
    }
  }

  const toggleSelection = (entityId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(entityId)) {
        next.delete(entityId)
      } else {
        next.add(entityId)
      }
      return next
    })
  }

  const handleCompare = async () => {
    if (selectedIds.size < 2) return

    setComparing(true)
    setError(null)

    try {
      const data = await compareEntities(Array.from(selectedIds))
      setResult(data)
      setView("results")
      setActiveTab("common")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to compare entities")
    } finally {
      setComparing(false)
    }
  }

  const handleBack = () => {
    setView("selection")
    setResult(null)
    setActiveTab("common")
  }

  const getTabTransactions = (): EntityTransaction[] => {
    if (!result) return []
    if (activeTab === "common") {
      return result.common_transactions
    }
    return result.unique_transactions[activeTab] || []
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] overflow-hidden z-50 flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
            {view === "results" ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleBack}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                >
                  <ArrowLeftIcon className="h-5 w-5" />
                </button>
                <Dialog.Title className="text-lg font-semibold">
                  Comparison Results
                </Dialog.Title>
              </div>
            ) : (
              <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
                <GitCompareIcon className="h-5 w-5" />
                Compare Entities
              </Dialog.Title>
            )}
            <Dialog.Close asChild>
              <button
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                aria-label="Close"
              >
                <XIcon className="h-5 w-5 text-muted-foreground" />
              </button>
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-6">
            {view === "selection" ? (
              <>
                <Dialog.Description className="text-sm text-muted-foreground mb-4">
                  Select 2 or more entities to compare their transactions.
                </Dialog.Description>

                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : entities.length < 2 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    You need at least 2 entities to compare.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {entities.map((entity) => (
                      <label
                        key={entity.entity_id}
                        className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                          selectedIds.has(entity.entity_id)
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(entity.entity_id)}
                          onChange={() => toggleSelection(entity.entity_id)}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-2xl">{entity.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate flex items-center gap-1.5">
                            {entity.name}
                            {entity.entity_type === "person" ? (
                              <UserIcon className="h-3.5 w-3.5 text-blue-500" />
                            ) : (
                              <BuildingIcon className="h-3.5 w-3.5 text-purple-500" />
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-0.5">
                            <span className="flex items-center gap-1">
                              <HashIcon className="h-3 w-3" />
                              {entity.transaction_count} txns
                            </span>
                            <span className="flex items-center gap-1">
                              <WalletIcon className="h-3 w-3" />
                              {formatCurrency(entity.total_spent)}
                            </span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                {error && (
                  <p className="mt-4 text-sm text-red-500">{error}</p>
                )}
              </>
            ) : result ? (
              <>
                {/* Entity Cards */}
                <div className="flex gap-3 overflow-x-auto pb-4 mb-4">
                  {result.entities.map((entity) => (
                    <div
                      key={entity.entity_id}
                      className="flex-shrink-0 p-4 rounded-lg border border-border bg-muted/30 min-w-[160px]"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-3xl">{entity.icon}</span>
                        {entity.entity_type === "person" ? (
                          <UserIcon className="h-4 w-4 text-blue-500" />
                        ) : (
                          <BuildingIcon className="h-4 w-4 text-purple-500" />
                        )}
                      </div>
                      <div className="font-medium truncate">{entity.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {entity.transaction_count} txns
                      </div>
                      <div className="text-sm font-medium mt-1">
                        {formatCurrency(entity.total_spent)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Overlap Stats */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 text-sm mb-4">
                  <GitCompareIcon className="h-4 w-4" />
                  <span>
                    <strong>{result.overlap_stats.common_count}</strong> common transaction{result.overlap_stats.common_count !== 1 ? "s" : ""} found
                  </span>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 overflow-x-auto pb-2 mb-4 border-b border-border">
                  <button
                    onClick={() => setActiveTab("common")}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                      activeTab === "common"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-accent"
                    }`}
                  >
                    Common ({result.common_transactions.length})
                  </button>
                  {result.entities.map((entity) => (
                    <button
                      key={entity.entity_id}
                      onClick={() => setActiveTab(entity.entity_id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                        activeTab === entity.entity_id
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted hover:bg-accent"
                      }`}
                    >
                      <span>{entity.icon}</span>
                      {entity.name} Only ({result.unique_transactions[entity.entity_id]?.length || 0})
                    </button>
                  ))}
                </div>

                {/* Transactions Table */}
                <TransactionTable transactions={getTabTransactions()} />
              </>
            ) : null}
          </div>

          {/* Footer */}
          {view === "selection" && (
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3 flex-shrink-0">
              <button
                onClick={() => onOpenChange(false)}
                className="px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleCompare}
                disabled={selectedIds.size < 2 || comparing}
                className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                {comparing ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Comparing...
                  </>
                ) : (
                  <>
                    <GitCompareIcon className="h-4 w-4" />
                    Compare ({selectedIds.size} selected)
                  </>
                )}
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
