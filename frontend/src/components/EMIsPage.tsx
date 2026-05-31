import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  PlusIcon,
  CalendarIcon,
  HashIcon,
  WalletIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  SparklesIcon,
  CheckCircleIcon,
  CircleIcon,
  AlertCircleIcon,
  CreditCardIcon,
} from "lucide-react"
import * as Dialog from "@radix-ui/react-dialog"
import { logError } from "@/lib/logger"
import { Footer } from "@/components/Footer"
import { SortDropdown, sortItems } from "@/components/SortDropdown"
import {
  fetchEMIs,
  fetchEMISuggestions,
  createEMI,
  fetchCreditCards,
  type EMI,
  type EMISuggestion,
  type CreditCard,
} from "@/lib/api"

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
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

function StatusBadge({ status }: { status: string }) {
  const config = {
    active: { icon: CircleIcon, label: "Active", className: "text-blue-600 bg-blue-50 border-blue-200" },
    completed: { icon: CheckCircleIcon, label: "Completed", className: "text-green-600 bg-green-50 border-green-200" },
    foreclosed: { icon: AlertCircleIcon, label: "Foreclosed", className: "text-orange-600 bg-orange-50 border-orange-200" },
  }[status] || { icon: CircleIcon, label: status, className: "text-muted-foreground bg-muted border-border" }

  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${config.className}`}>
      <Icon className="h-2.5 w-2.5" />
      {config.label}
    </span>
  )
}

function EMICard({ emi }: { emi: EMI }) {
  const progress = emi.num_installments && emi.stats.installments_paid
    ? Math.min(100, (emi.stats.installments_paid / emi.num_installments) * 100)
    : 0

  return (
    <Link
      to={`/emis/${emi.emi_id}`}
      className="block bg-card rounded-lg border border-border shadow-sm hover:shadow-md hover:border-primary/30 transition-all p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm truncate">{emi.name}</h3>
          {emi.credit_card && (
            <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
              <CreditCardIcon className="h-2.5 w-2.5" />
              {emi.credit_card.nickname}
            </p>
          )}
        </div>
        <StatusBadge status={emi.status} />
      </div>

      {emi.num_installments && (
        <div className="mt-2.5">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>{emi.stats.installments_paid}/{emi.num_installments} installments</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-2.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <WalletIcon className="h-3 w-3" />
          {emi.monthly_installment ? formatCurrency(emi.monthly_installment) + "/mo" : "-"}
        </span>
        <span className="flex items-center gap-1">
          <HashIcon className="h-3 w-3" />
          {emi.stats.transaction_count} txns
        </span>
      </div>

      {(emi.creation_date || emi.finish_date) && (
        <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
          <CalendarIcon className="h-3 w-3" />
          {formatDate(emi.creation_date)} → {formatDate(emi.finish_date)}
        </div>
      )}
    </Link>
  )
}

function CreateEMIModal({
  open,
  onOpenChange,
  onCreated,
  creditCards,
  prefill,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
  creditCards: CreditCard[]
  prefill?: Partial<EMISuggestion> | null
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [creditCardId, setCreditCardId] = useState<number | null>(null)
  const [originalAmount, setOriginalAmount] = useState("")
  const [numInstallments, setNumInstallments] = useState("")
  const [monthlyInstallment, setMonthlyInstallment] = useState("")
  const [creationDate, setCreationDate] = useState("")
  const [finishDate, setFinishDate] = useState("")
  const [sourceArtifactId, setSourceArtifactId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (prefill && open) {
      setName(prefill.loan_type || "")
      setOriginalAmount(prefill.emi_amount?.toString() || "")
      setNumInstallments(prefill.num_installments?.toString() || "")
      setMonthlyInstallment(prefill.monthly_installment?.toString() || "")
      setCreationDate(prefill.creation_date || "")
      setFinishDate(prefill.finish_date || "")
      setSourceArtifactId(prefill.artifact_id || null)
      // Try to match credit card by mask
      if (prefill.card_number_mask) {
        const last4 = prefill.card_number_mask.slice(-4)
        const match = creditCards.find(c => c.card_number_mask.endsWith(last4))
        if (match) setCreditCardId(match.id)
      }
    } else if (!open) {
      setName("")
      setDescription("")
      setCreditCardId(null)
      setOriginalAmount("")
      setNumInstallments("")
      setMonthlyInstallment("")
      setCreationDate("")
      setFinishDate("")
      setSourceArtifactId(null)
    }
  }, [prefill, open, creditCards])

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await createEMI({
        name: name.trim(),
        description: description.trim(),
        credit_card_id: creditCardId,
        original_amount: originalAmount ? parseFloat(originalAmount) : null,
        num_installments: numInstallments ? parseInt(numInstallments) : null,
        monthly_installment: monthlyInstallment ? parseFloat(monthlyInstallment) : null,
        creation_date: creationDate || null,
        finish_date: finishDate || null,
        source_artifact_id: sourceArtifactId,
      })
      onCreated()
      onOpenChange(false)
    } catch (err) {
      logError("Failed to create EMI", err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded-lg shadow-lg p-6 w-[480px] max-h-[85vh] overflow-y-auto z-50">
          <Dialog.Title className="text-lg font-semibold mb-4">Create EMI</Dialog.Title>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full mt-1 px-3 py-1.5 rounded border border-border bg-background text-sm"
                placeholder="e.g., CROMA MacBook Pro"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full mt-1 px-3 py-1.5 rounded border border-border bg-background text-sm"
                rows={2}
                placeholder="Optional notes"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Credit Card</label>
              <select
                value={creditCardId || ""}
                onChange={e => setCreditCardId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full mt-1 px-3 py-1.5 rounded border border-border bg-background text-sm"
              >
                <option value="">None</option>
                {creditCards.map(cc => (
                  <option key={cc.id} value={cc.id}>{cc.nickname} ({cc.card_number_mask})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Original Amount</label>
                <input
                  type="number"
                  value={originalAmount}
                  onChange={e => setOriginalAmount(e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 rounded border border-border bg-background text-sm"
                  step="0.01"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Monthly Installment</label>
                <input
                  type="number"
                  value={monthlyInstallment}
                  onChange={e => setMonthlyInstallment(e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 rounded border border-border bg-background text-sm"
                  step="0.01"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Number of Installments</label>
              <input
                type="number"
                value={numInstallments}
                onChange={e => setNumInstallments(e.target.value)}
                className="w-full mt-1 px-3 py-1.5 rounded border border-border bg-background text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Start Date</label>
                <input
                  type="date"
                  value={creationDate}
                  onChange={e => setCreationDate(e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 rounded border border-border bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">End Date</label>
                <input
                  type="date"
                  value={finishDate}
                  onChange={e => setFinishDate(e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 rounded border border-border bg-background text-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Dialog.Close asChild>
              <button className="px-3 py-1.5 rounded border border-border text-sm hover:bg-muted">
                Cancel
              </button>
            </Dialog.Close>
            <button
              onClick={handleSave}
              disabled={!name.trim() || saving}
              className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function EMIsPage() {
  const [emis, setEmis] = useState<EMI[]>([])
  const [suggestions, setSuggestions] = useState<EMISuggestion[]>([])
  const [creditCards, setCreditCards] = useState<CreditCard[]>([])
  const [loading, setLoading] = useState(true)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [prefillData, setPrefillData] = useState<Partial<EMISuggestion> | null>(null)
  const [sortBy, setSortBy] = useState("created_at")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

  useEffect(() => {
    document.title = "EMIs | FinAccs"
  }, [])

  const loadData = async () => {
    try {
      const [emisData, suggestionsData, cardsData] = await Promise.all([
        fetchEMIs(),
        fetchEMISuggestions(),
        fetchCreditCards(),
      ])
      setEmis(emisData.emis)
      setSuggestions(suggestionsData.suggestions)
      setCreditCards(cardsData.cards)
    } catch (error) {
      logError("Failed to load EMI data", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleCreateFromSuggestion = (suggestion: EMISuggestion) => {
    setPrefillData(suggestion)
    setCreateModalOpen(true)
  }

  const handleCreateManual = () => {
    setPrefillData(null)
    setCreateModalOpen(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  const emiSortOptions = [
    { value: "created_at", label: "Created at" },
    { value: "updated_at", label: "Last updated" },
    { value: "name", label: "Name" },
    { value: "original_amount", label: "EMI amount" },
    { value: "creation_date", label: "Start date" },
    { value: "finish_date", label: "End date" },
  ]

  const sortedEmis = sortItems(emis, sortBy, sortDirection)
  const activeEmis = sortedEmis.filter(e => e.status === 'active')
  const completedEmis = sortedEmis.filter(e => e.status !== 'active')

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Link to="/dashboard" className="hover:text-foreground transition-colors">home</Link>
              <span>/</span>
              <span>emis</span>
            </div>
            <h1 className="text-2xl font-bold">Credit Card EMIs</h1>
          </div>
          <div className="flex items-center gap-2">
            <SortDropdown
              options={emiSortOptions}
              sortBy={sortBy}
              sortDirection={sortDirection}
              onSortChange={(by, dir) => { setSortBy(by); setSortDirection(dir) }}
            />
            <button
              onClick={handleCreateManual}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm hover:bg-primary/90"
            >
              <PlusIcon className="h-4 w-4" />
              Create EMI
            </button>
          </div>
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="mb-6 border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setSuggestionsOpen(!suggestionsOpen)}
              className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/50 hover:bg-muted text-sm font-medium text-left"
            >
              {suggestionsOpen ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
              <SparklesIcon className="h-4 w-4 text-amber-500" />
              <span>{suggestions.length} EMIs from statements</span>
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {suggestions.filter(s => s.already_linked).length} linked · {suggestions.filter(s => !s.already_linked).length} unlinked
              </span>
            </button>
            {suggestionsOpen && (
              <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
                {suggestions.map((s, i) => (
                  <div key={i} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${s.already_linked ? 'opacity-60' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{s.loan_type}</span>
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {s.card_number_mask.slice(-4)}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {formatCurrency(s.emi_amount || 0)} · {s.num_installments} installments · {formatDate(s.creation_date)}
                      </div>
                    </div>
                    <div className="flex-shrink-0 w-48 text-right">
                      {s.already_linked && s.linked_emi_id ? (
                        <Link
                          to={`/emis/${s.linked_emi_id}`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:underline"
                        >
                          <CheckCircleIcon className="h-3 w-3" />
                          <span className="truncate max-w-[120px]">{s.linked_emi_name}</span>
                        </Link>
                      ) : (
                        <button
                          onClick={() => handleCreateFromSuggestion(s)}
                          className="px-2 py-1 rounded border border-border text-xs hover:bg-muted"
                        >
                          Create
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Active EMIs */}
        {activeEmis.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-medium text-muted-foreground mb-3">Active ({activeEmis.length})</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {activeEmis.map(emi => (
                <EMICard key={emi.emi_id} emi={emi} />
              ))}
            </div>
          </div>
        )}

        {/* Completed EMIs */}
        {completedEmis.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-medium text-muted-foreground mb-3">Completed ({completedEmis.length})</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {completedEmis.map(emi => (
                <EMICard key={emi.emi_id} emi={emi} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {emis.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <WalletIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg">No EMIs yet</p>
            <p className="text-sm mt-1">Create one manually or from a statement suggestion above.</p>
          </div>
        )}
      </main>

      <Footer />

      <CreateEMIModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onCreated={loadData}
        creditCards={creditCards}
        prefill={prefillData}
      />
    </div>
  )
}
