import { useState, useEffect, useMemo } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { XIcon, SearchIcon, WalletIcon } from "lucide-react"
import { logError } from "@/lib/logger"
import {
  fetchEMIs,
  addTransactionsToEMI,
  type EMI,
  type EMIComponentType,
  type TransactionRef,
} from "@/lib/api"

const COMPONENT_OPTIONS: { value: EMIComponentType; label: string }[] = [
  { value: "principal", label: "Principal" },
  { value: "interest", label: "Interest" },
  { value: "purchase", label: "Purchase" },
  { value: "loan", label: "Loan" },
  { value: "processing_fee", label: "Processing Fee" },
  { value: "tax", label: "Tax" },
  { value: "foreclosure", label: "Foreclosure" },
  { value: "other", label: "Other" },
]

interface AddToEMIModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedTransactions: TransactionRef[]
  onAdded: () => void
}

export function AddToEMIModal({
  open,
  onOpenChange,
  selectedTransactions,
  onAdded,
}: AddToEMIModalProps) {
  const [emis, setEmis] = useState<EMI[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const [selectedEmiId, setSelectedEmiId] = useState<string | null>(null)
  const [componentType, setComponentType] = useState<EMIComponentType>("other")
  const [installmentNumber, setInstallmentNumber] = useState("")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [adding, setAdding] = useState(false)

  const filteredEmis = useMemo(() => {
    if (!searchQuery.trim()) return emis
    const query = searchQuery.toLowerCase()
    return emis.filter(e => e.name.toLowerCase().includes(query))
  }, [emis, searchQuery])

  useEffect(() => {
    if (open) {
      loadEMIs()
      setSelectedEmiId(null)
      setComponentType("other")
      setInstallmentNumber("")
      setShowAdvanced(false)
      setError(null)
      setSearchQuery("")
    }
  }, [open])

  const loadEMIs = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchEMIs()
      setEmis(data.emis)
    } catch (err) {
      logError("Failed to load EMIs", err)
      setError("Failed to load EMIs")
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async () => {
    if (!selectedEmiId) return
    setAdding(true)
    setError(null)
    try {
      const transactions = selectedTransactions
        .filter(t => t.type === "credit_card")
        .map(t => ({
          type: "credit_card" as const,
          id: t.id,
          component_type: componentType,
          installment_number: installmentNumber ? parseInt(installmentNumber) : null,
        }))
      await addTransactionsToEMI(selectedEmiId, transactions)
      onAdded()
      onOpenChange(false)
    } catch (err) {
      logError("Failed to add to EMI", err)
      setError(err instanceof Error ? err.message : "Failed to add to EMI")
    } finally {
      setAdding(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card rounded-lg shadow-xl p-6 w-full max-w-md max-h-[80vh] overflow-hidden z-50 flex flex-col">
          <Dialog.Title className="text-lg font-semibold text-foreground">
            Add to EMI
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            Add {selectedTransactions.length} transaction{selectedTransactions.length !== 1 ? "s" : ""} to an EMI record.
          </Dialog.Description>

          {error && (
            <div className="mt-3 p-2 rounded-md bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
              {error}
            </div>
          )}

          <div className="mt-4 flex-1 overflow-y-auto min-h-0">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="space-y-3">
                {emis.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <WalletIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No EMIs yet</p>
                    <p className="text-sm mt-1">Create an EMI from the EMIs page first.</p>
                  </div>
                ) : (
                  <>
                    {/* Search */}
                    <div className="relative">
                      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search EMIs..."
                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>

                    {/* EMI List */}
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {filteredEmis.length === 0 ? (
                        <div className="text-center py-4 text-muted-foreground text-sm">
                          No EMIs match "{searchQuery}"
                        </div>
                      ) : (
                        filteredEmis.map((emi) => (
                          <button
                            key={emi.id}
                            onClick={() => setSelectedEmiId(emi.emi_id)}
                            className={`w-full flex items-center gap-3 p-2.5 rounded-lg border transition-colors text-left ${
                              selectedEmiId === emi.emi_id
                                ? "border-primary bg-primary/5"
                                : "border-border hover:bg-muted/50"
                            }`}
                          >
                            <WalletIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{emi.name}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {emi.stats.transaction_count} txns · {emi.status}
                              </p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>

                    {/* Optional: Component Type & Installment Number */}
                    {selectedEmiId && (
                      <div className="pt-3 border-t border-border">
                        <button
                          type="button"
                          onClick={() => setShowAdvanced(!showAdvanced)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          {showAdvanced ? "▾ Hide classification" : "▸ Classify now (optional)"}
                        </button>
                        {showAdvanced && (
                          <div className="mt-2 space-y-3">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground">Component Type</label>
                              <select
                                value={componentType}
                                onChange={e => setComponentType(e.target.value as EMIComponentType)}
                                className="w-full mt-1 px-3 py-1.5 rounded border border-border bg-background text-sm"
                              >
                                {COMPONENT_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground">Installment Number (optional)</label>
                              <input
                                type="number"
                                value={installmentNumber}
                                onChange={e => setInstallmentNumber(e.target.value)}
                                className="w-full mt-1 px-3 py-1.5 rounded border border-border bg-background text-sm"
                                placeholder="e.g., 3"
                                min="1"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-border">
            <Dialog.Close asChild>
              <button className="px-3 py-1.5 rounded border border-border text-sm hover:bg-muted">
                Cancel
              </button>
            </Dialog.Close>
            <button
              onClick={handleAdd}
              disabled={!selectedEmiId || adding}
              className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {adding ? "Adding..." : "Add to EMI"}
            </button>
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
