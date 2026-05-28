import { useEffect, useState, useMemo } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  ArrowLeftIcon,
  TrashIcon,
  PencilIcon,
  CheckIcon,
  XIcon,
  CreditCardIcon,
  CalendarIcon,
  HashIcon,
  TrendingUpIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "lucide-react"
import * as Dialog from "@radix-ui/react-dialog"
import * as Tooltip from "@radix-ui/react-tooltip"
import { Footer } from "@/components/Footer"
import { RefundLinkBadge, StoriesBadges, EntitiesBadges, PaymentLinkBadge } from "@/components/shared/TransactionLinkBadges"
import {
  fetchEMI,
  updateEMI,
  deleteEMI,
  removeTransactionsFromEMI,
  updateEMILink,
  getTransactionStories,
  getTransactionEntities,
  type EMIDetail,
  type EMITransaction,
  type EMIComponentType,
  type StoryBadge,
  type EntityBadge,
} from "@/lib/api"

const COMPONENT_COLORS: Record<EMIComponentType, string> = {
  purchase: "bg-purple-100 text-purple-700 border-purple-200",
  loan: "bg-indigo-100 text-indigo-700 border-indigo-200",
  principal: "bg-blue-100 text-blue-700 border-blue-200",
  interest: "bg-amber-100 text-amber-700 border-amber-200",
  processing_fee: "bg-red-100 text-red-700 border-red-200",
  tax: "bg-orange-100 text-orange-700 border-orange-200",
  foreclosure: "bg-rose-100 text-rose-700 border-rose-200",
  other: "bg-gray-100 text-gray-700 border-gray-200",
}

const COMPONENT_LABELS: Record<EMIComponentType, string> = {
  purchase: "Purchase",
  loan: "Loan",
  principal: "Principal",
  interest: "Interest",
  processing_fee: "Fee",
  tax: "Tax",
  foreclosure: "Foreclosure",
  other: "Other",
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function FormattedCurrency({ amount, className = "" }: { amount: number; className?: string }) {
  const formatted = formatCurrency(amount)
  const match = formatted.match(/^(.*?)(\.\d{2})$/)
  if (match) {
    return (
      <span className={className}>
        {match[1]}
        <span className="opacity-50">{match[2]}</span>
      </span>
    )
  }
  return <span className={className}>{formatted}</span>
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-"
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function ComponentBadge({ type, installmentNumber, taxInfo, onClick }: {
  type: EMIComponentType
  installmentNumber?: number | null
  taxInfo?: string | null
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border cursor-pointer hover:opacity-80 ${COMPONENT_COLORS[type]}`}
    >
      {COMPONENT_LABELS[type]}
      {installmentNumber != null && ` #${installmentNumber}`}
      {taxInfo && <span className="opacity-70 ml-0.5">{taxInfo}</span>}
    </button>
  )
}

// --- Grouping logic ---

interface TransactionGroup {
  type: 'onetime' | 'installment' | 'uncategorized'
  label: string
  installmentNumber?: number
  transactions: EMITransaction[]
  subtotal: number
}

function groupTransactions(transactions: EMITransaction[]): TransactionGroup[] {
  const loanTypes: EMIComponentType[] = ['purchase', 'loan']
  const oneTimeTypes: EMIComponentType[] = ['processing_fee', 'foreclosure']
  const installmentTypes: EMIComponentType[] = ['principal', 'interest']

  // Build a lookup of link_id -> transaction for tax parent resolution
  const linkMap = new Map<number, EMITransaction>()
  for (const txn of transactions) {
    linkMap.set(txn.link_id, txn)
  }

  const loanGroup: EMITransaction[] = []
  const onetime: EMITransaction[] = []
  const installments = new Map<number, EMITransaction[]>()
  const uncategorized: EMITransaction[] = []

  for (const txn of transactions) {
    if (loanTypes.includes(txn.component_type)) {
      loanGroup.push(txn)
    } else if (oneTimeTypes.includes(txn.component_type)) {
      onetime.push(txn)
    } else if (txn.component_type === 'tax') {
      // Tax goes where its parent is
      if (txn.tax_parent_link_id) {
        const parent = linkMap.get(txn.tax_parent_link_id)
        if (parent && loanTypes.includes(parent.component_type)) {
          loanGroup.push(txn)
        } else if (parent && oneTimeTypes.includes(parent.component_type)) {
          onetime.push(txn)
        } else if (parent && installmentTypes.includes(parent.component_type) && parent.installment_number != null) {
          const group = installments.get(parent.installment_number) || []
          group.push(txn)
          installments.set(parent.installment_number, group)
        } else {
          uncategorized.push(txn)
        }
      } else {
        uncategorized.push(txn)
      }
    } else if (installmentTypes.includes(txn.component_type) && txn.installment_number != null) {
      const group = installments.get(txn.installment_number) || []
      group.push(txn)
      installments.set(txn.installment_number, group)
    } else {
      uncategorized.push(txn)
    }
  }

  const groups: TransactionGroup[] = []

  if (loanGroup.length > 0) {
    groups.push({
      type: 'onetime',
      label: 'Loan',
      transactions: loanGroup,
      subtotal: loanGroup.reduce((s, t) => s + t.amount, 0),
    })
  }

  if (onetime.length > 0) {
    groups.push({
      type: 'onetime',
      label: 'One-time Charges',
      transactions: onetime,
      subtotal: onetime.reduce((s, t) => s + t.amount, 0),
    })
  }

  const sortedInstallments = Array.from(installments.entries()).sort((a, b) => a[0] - b[0])
  for (const [num, txns] of sortedInstallments) {
    groups.push({
      type: 'installment',
      label: `Installment #${num}`,
      installmentNumber: num,
      transactions: txns,
      subtotal: txns.reduce((s, t) => s + t.amount, 0),
    })
  }

  if (uncategorized.length > 0) {
    groups.push({
      type: 'uncategorized',
      label: 'Uncategorized',
      transactions: uncategorized,
      subtotal: uncategorized.reduce((s, t) => s + t.amount, 0),
    })
  }

  return groups
}

// --- Validations ---

interface ValidationResult {
  label: string
  status: 'pass' | 'warn' | 'error'
  detail: string
}

function runValidations(emi: EMIDetail): ValidationResult[] {
  const results: ValidationResult[] = []
  const txns = emi.transactions

  const purchaseTxns = txns.filter(t => t.component_type === 'purchase')
  const loanTxns = txns.filter(t => t.component_type === 'loan')
  const principalTxns = txns.filter(t => t.component_type === 'principal')
  const interestTxns = txns.filter(t => t.component_type === 'interest')
  const taxTxns = txns.filter(t => t.component_type === 'tax')

  // Rule 1a: Purchase matches Original Amount (exact)
  if (emi.original_amount != null && purchaseTxns.length > 0) {
    const purchaseTotal = Math.abs(purchaseTxns.reduce((s, t) => s + t.amount, 0))
    const diff = Math.abs(purchaseTotal - emi.original_amount)
    if (diff === 0) {
      results.push({ label: 'Purchase = Original Amount', status: 'pass', detail: `${formatCurrency(purchaseTotal)} = ${formatCurrency(emi.original_amount)}` })
    } else {
      results.push({ label: 'Purchase ≠ Original Amount', status: 'error', detail: `${formatCurrency(purchaseTotal)} vs ${formatCurrency(emi.original_amount)} (Δ${formatCurrency(diff)})` })
    }
  }

  // Rule 1b: Loan matches Original Amount (exact)
  if (emi.original_amount != null && loanTxns.length > 0) {
    const loanTotal = Math.abs(loanTxns.reduce((s, t) => s + t.amount, 0))
    const diff = Math.abs(loanTotal - emi.original_amount)
    if (diff === 0) {
      results.push({ label: 'Loan = Original Amount', status: 'pass', detail: `${formatCurrency(loanTotal)} = ${formatCurrency(emi.original_amount)}` })
    } else {
      results.push({ label: 'Loan ≠ Original Amount', status: 'error', detail: `${formatCurrency(loanTotal)} vs ${formatCurrency(emi.original_amount)} (Δ${formatCurrency(diff)})` })
    }
  }

  // Rule 4: Total principal = Original Amount (±₹1)
  if (emi.original_amount != null && principalTxns.length > 0) {
    const principalTotal = principalTxns.reduce((s, t) => s + t.amount, 0)
    const diff = Math.abs(principalTotal - emi.original_amount)
    if (diff <= 1) {
      results.push({ label: 'Total principal = Original Amount', status: 'pass', detail: `${formatCurrency(principalTotal)} ≈ ${formatCurrency(emi.original_amount)}` })
    } else {
      results.push({ label: 'Total principal ≠ Original Amount', status: 'error', detail: `${formatCurrency(principalTotal)} vs ${formatCurrency(emi.original_amount)} (Δ${formatCurrency(diff)})` })
    }
  }

  // Rule 5: Installment count
  if (emi.num_installments != null && principalTxns.length > 0) {
    const distinctInstallments = new Set(principalTxns.map(t => t.installment_number).filter(n => n != null))
    const count = distinctInstallments.size
    if (count === emi.num_installments) {
      results.push({ label: 'Installment count', status: 'pass', detail: `${count} of ${emi.num_installments}` })
    } else {
      results.push({ label: 'Installment count mismatch', status: 'warn', detail: `${count} of ${emi.num_installments} found` })
    }
  }

  // Rule 2: Monthly EMI = Principal + Interest per installment (±₹1)
  if (emi.monthly_installment != null) {
    const installmentNums = new Set<number>()
    for (const t of [...principalTxns, ...interestTxns]) {
      if (t.installment_number != null) installmentNums.add(t.installment_number)
    }
    for (const num of Array.from(installmentNums).sort((a, b) => a - b)) {
      const p = principalTxns.filter(t => t.installment_number === num).reduce((s, t) => s + t.amount, 0)
      const i = interestTxns.filter(t => t.installment_number === num).reduce((s, t) => s + t.amount, 0)
      const sum = p + i
      const diff = Math.abs(sum - emi.monthly_installment)
      if (diff <= 1) {
        results.push({ label: `EMI #${num}: P+I`, status: 'pass', detail: `${formatCurrency(sum)} ≈ ${formatCurrency(emi.monthly_installment)}` })
      } else {
        results.push({ label: `EMI #${num}: P+I ≠ monthly`, status: 'warn', detail: `${formatCurrency(sum)} vs ${formatCurrency(emi.monthly_installment)} (Δ${formatCurrency(diff)})` })
      }
    }
  }

  // Rule 3: Tax = rate% of parent (±₹0.10)
  const linkMap = new Map<number, EMITransaction>()
  for (const t of txns) linkMap.set(t.link_id, t)

  for (const tax of taxTxns) {
    if (tax.tax_parent_link_id && tax.tax_rate) {
      const parent = linkMap.get(tax.tax_parent_link_id)
      if (parent) {
        const expected = parent.amount * (tax.tax_rate / 100)
        const diff = Math.abs(tax.amount - expected)
        const parentLabel = `${COMPONENT_LABELS[parent.component_type]}${parent.installment_number != null ? ` #${parent.installment_number}` : ''}`
        if (diff <= 0.10) {
          results.push({ label: `Tax on ${parentLabel} (${tax.tax_rate}%)`, status: 'pass', detail: `${formatCurrency(tax.amount)} ≈ ${formatCurrency(expected)}` })
        } else {
          results.push({ label: `Tax on ${parentLabel} (${tax.tax_rate}%)`, status: 'warn', detail: `${formatCurrency(tax.amount)} vs ${formatCurrency(expected)} (Δ${formatCurrency(diff)})` })
        }
      }
    }
  }

  return results
}

export function EMIDetailPage() {
  const { emiId } = useParams<{ emiId: string }>()
  const navigate = useNavigate()

  const [emi, setEmi] = useState<EMIDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editMonthlyInstallment, setEditMonthlyInstallment] = useState("")
  const [editOriginalAmount, setEditOriginalAmount] = useState("")
  const [editNumInstallments, setEditNumInstallments] = useState("")
  const [editCreationDate, setEditCreationDate] = useState("")
  const [editFinishDate, setEditFinishDate] = useState("")

  const [selectedTxns, setSelectedTxns] = useState<Set<number>>(new Set())
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  // Inline link editing
  const [editingLinkId, setEditingLinkId] = useState<number | null>(null)
  const [editLinkType, setEditLinkType] = useState<EMIComponentType>("other")
  const [editLinkInstallment, setEditLinkInstallment] = useState("")
  const [editTaxParentId, setEditTaxParentId] = useState<string>("")
  const [editTaxRate, setEditTaxRate] = useState("")

  // Validations panel
  const [validationsOpen, setValidationsOpen] = useState(false)

  // Transaction link badges
  const [transactionStories, setTransactionStories] = useState<Record<string, StoryBadge[]>>({})
  const [transactionEntities, setTransactionEntities] = useState<Record<string, EntityBadge[]>>({})

  const loadEMI = async () => {
    if (!emiId) return
    try {
      const data = await fetchEMI(emiId)
      setEmi(data)
      setEditName(data.name)
      setEditDescription(data.description)
      setEditMonthlyInstallment(data.monthly_installment?.toString() || "")
      setEditOriginalAmount(data.original_amount?.toString() || "")
      setEditNumInstallments(data.num_installments?.toString() || "")
      setEditCreationDate(data.creation_date || "")
      setEditFinishDate(data.finish_date || "")

      if (data.transactions.length > 0) {
        const refs = data.transactions.map(t => ({ type: t.type as 'credit_card', id: t.id }))
        try {
          const [storiesData, entitiesData] = await Promise.all([
            getTransactionStories(refs),
            getTransactionEntities(refs),
          ])
          setTransactionStories(storiesData.transaction_stories)
          setTransactionEntities(entitiesData.transaction_entities)
        } catch (error) {
          console.error("Failed to load transaction stories/entities", error)
        }
      } else {
        setTransactionStories({})
        setTransactionEntities({})
      }
    } catch (err) {
      setError("Failed to load EMI")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEMI()
  }, [emiId])

  useEffect(() => {
    if (emi) document.title = `${emi.name} | EMIs | FinAccs`
  }, [emi])

  const handleSaveEdit = async () => {
    if (!emi || !emiId) return
    await updateEMI(emiId, {
      name: editName,
      description: editDescription,
      monthly_installment: editMonthlyInstallment ? parseFloat(editMonthlyInstallment) : null,
      original_amount: editOriginalAmount ? parseFloat(editOriginalAmount) : null,
      num_installments: editNumInstallments ? parseInt(editNumInstallments) : null,
      creation_date: editCreationDate || null,
      finish_date: editFinishDate || null,
    })
    setEditing(false)
    loadEMI()
  }

  const handleStatusChange = async (status: string) => {
    if (!emiId) return
    await updateEMI(emiId, { status })
    loadEMI()
  }

  const handleDelete = async () => {
    if (!emiId) return
    await deleteEMI(emiId)
    navigate("/emis")
  }

  const handleRemoveSelected = async () => {
    if (!emiId || selectedTxns.size === 0) return
    const txns = Array.from(selectedTxns).map(id => ({ type: 'credit_card' as const, id }))
    await removeTransactionsFromEMI(emiId, txns)
    setSelectedTxns(new Set())
    loadEMI()
  }

  const toggleTxnSelection = (id: number) => {
    setSelectedTxns(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const startEditLink = (txn: EMITransaction) => {
    setEditingLinkId(txn.link_id)
    setEditLinkType(txn.component_type)
    setEditLinkInstallment(txn.installment_number?.toString() || "")
    setEditTaxParentId(txn.tax_parent_link_id?.toString() || "")
    setEditTaxRate(txn.tax_rate?.toString() || "")
  }

  const cancelEditLink = () => {
    setEditingLinkId(null)
  }

  const saveEditLink = async () => {
    if (!emiId || !editingLinkId) return
    const payload: Record<string, unknown> = {
      component_type: editLinkType,
    }
    // Only send installment_number for principal/interest
    if (editLinkType === 'principal' || editLinkType === 'interest') {
      payload.installment_number = editLinkInstallment ? parseInt(editLinkInstallment) : null
    } else {
      payload.installment_number = null
    }
    // Only send tax fields for tax type
    if (editLinkType === 'tax') {
      payload.tax_parent_link_id = editTaxParentId ? parseInt(editTaxParentId) : null
      payload.tax_rate = editTaxRate ? parseFloat(editTaxRate) : null
    } else {
      payload.tax_parent_link_id = null
      payload.tax_rate = null
    }
    await updateEMILink(emiId, editingLinkId, payload as Parameters<typeof updateEMILink>[2])
    setEditingLinkId(null)
    loadEMI()
  }

  const groups = useMemo(() => {
    if (!emi) return []
    return groupTransactions(emi.transactions)
  }, [emi])

  const validations = useMemo(() => {
    if (!emi) return []
    return runValidations(emi)
  }, [emi])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error || !emi) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        {error || "EMI not found"}
      </div>
    )
  }

  const progress = emi.num_installments && emi.stats.installments_paid
    ? Math.min(100, (emi.stats.installments_paid / emi.num_installments) * 100)
    : 0

  const passCount = validations.filter(v => v.status === 'pass').length
  const warnCount = validations.filter(v => v.status === 'warn').length
  const errorCount = validations.filter(v => v.status === 'error').length

  // Build list of possible tax parents (non-tax links in this EMI)
  const taxParentOptions = emi.transactions.filter(t => t.component_type !== 'tax' && t.component_type !== 'other')

  const renderTaxInfo = (txn: EMITransaction): string | null => {
    if (txn.component_type !== 'tax') return null
    const parts: string[] = []
    if (txn.tax_rate) parts.push(`${txn.tax_rate}%`)
    if (txn.tax_parent_link_id) {
      const parent = emi.transactions.find(t => t.link_id === txn.tax_parent_link_id)
      if (parent) {
        const parentLabel = COMPONENT_LABELS[parent.component_type] + (parent.installment_number != null ? ` #${parent.installment_number}` : '')
        parts.push(`→ ${parentLabel}`)
      }
    }
    return parts.length > 0 ? parts.join(' ') : null
  }

  return (
    <Tooltip.Provider>
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 p-6 max-w-5xl mx-auto w-full">
        {/* Back button */}
        <button
          onClick={() => navigate("/emis")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to EMIs
        </button>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex-1">
            {editing && (
              <Dialog.Root open={editing} onOpenChange={setEditing}>
                <Dialog.Portal>
                  <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
                  <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded-lg shadow-lg p-6 w-[480px] max-h-[85vh] overflow-y-auto z-50">
                    <Dialog.Title className="text-lg font-semibold mb-4">Edit EMI</Dialog.Title>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Name *</label>
                        <input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="w-full mt-1 px-3 py-1.5 rounded border border-border bg-background text-sm"
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Description</label>
                        <textarea
                          value={editDescription}
                          onChange={e => setEditDescription(e.target.value)}
                          className="w-full mt-1 px-3 py-1.5 rounded border border-border bg-background text-sm"
                          rows={2}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Original Amount</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editOriginalAmount}
                            onChange={e => setEditOriginalAmount(e.target.value)}
                            className="w-full mt-1 px-3 py-1.5 rounded border border-border bg-background text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Monthly Installment</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editMonthlyInstallment}
                            onChange={e => setEditMonthlyInstallment(e.target.value)}
                            className="w-full mt-1 px-3 py-1.5 rounded border border-border bg-background text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Number of Installments</label>
                        <input
                          type="number"
                          value={editNumInstallments}
                          onChange={e => setEditNumInstallments(e.target.value)}
                          className="w-full mt-1 px-3 py-1.5 rounded border border-border bg-background text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Start Date</label>
                          <input
                            type="date"
                            value={editCreationDate}
                            onChange={e => setEditCreationDate(e.target.value)}
                            className="w-full mt-1 px-3 py-1.5 rounded border border-border bg-background text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">End Date</label>
                          <input
                            type="date"
                            value={editFinishDate}
                            onChange={e => setEditFinishDate(e.target.value)}
                            className="w-full mt-1 px-3 py-1.5 rounded border border-border bg-background text-sm"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
                      <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded border border-border text-sm hover:bg-muted">
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        disabled={!editName.trim()}
                        className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">{emi.name}</h1>
                <button onClick={() => setEditing(true)} className="p-1 rounded hover:bg-muted">
                  <PencilIcon className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
                {emi.description && (
                  <p className="text-sm text-muted-foreground mt-1">{emi.description}</p>
                )}
                {emi.credit_card && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <CreditCardIcon className="h-3 w-3" />
                    {emi.credit_card.nickname} ({emi.credit_card.card_number_mask})
                  </p>
                )}
              </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={emi.status}
              onChange={e => handleStatusChange(e.target.value)}
              className="text-xs border border-border rounded px-2 py-1 bg-background"
            >
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="foreclosed">Foreclosed</option>
            </select>
            <button
              onClick={() => setDeleteConfirmOpen(true)}
              className="p-1.5 rounded hover:bg-red-50 text-red-600"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Original Amount</div>
            <div className="text-lg font-semibold mt-1">
              {emi.original_amount ? formatCurrency(emi.original_amount) : "-"}
            </div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Monthly EMI</div>
            <div className="text-lg font-semibold mt-1">
              {emi.monthly_installment ? formatCurrency(emi.monthly_installment) : "-"}
            </div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Principal Paid</div>
            <div className="text-lg font-semibold mt-1">
              {formatCurrency(emi.stats.total_principal_paid)}
            </div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Interest Paid</div>
            <div className="text-lg font-semibold mt-1 text-amber-600">
              {formatCurrency(emi.stats.total_interest_paid)}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {emi.num_installments && (
          <div className="bg-card border border-border rounded-lg p-3 mb-6">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <span className="flex items-center gap-1">
                <HashIcon className="h-3 w-3" />
                {emi.stats.installments_paid} of {emi.num_installments} installments
              </span>
              <span className="flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" />
                {formatDate(emi.creation_date)} → {formatDate(emi.finish_date)}
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            {(emi.stats.total_fees_paid > 0 || emi.stats.total_tax_paid > 0) && (
              <div className="flex gap-4 mt-2 text-[10px] text-muted-foreground">
                {emi.stats.total_fees_paid > 0 && <span>Fees: {formatCurrency(emi.stats.total_fees_paid)}</span>}
                {emi.stats.total_tax_paid > 0 && <span>Tax: {formatCurrency(emi.stats.total_tax_paid)}</span>}
                <span className="ml-auto font-medium">Total cost: {formatCurrency(emi.stats.total_paid)}</span>
              </div>
            )}
          </div>
        )}

        {/* Validations */}
        {validations.length > 0 && (
          <div className="bg-card border border-border rounded-lg mb-6 overflow-hidden">
            <button
              onClick={() => setValidationsOpen(!validationsOpen)}
              className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-muted/50 text-sm font-medium text-left"
            >
              {validationsOpen ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
              <span>Validations</span>
              <span className="ml-auto flex items-center gap-3 text-xs font-normal">
                {passCount > 0 && <span className="text-green-600">{passCount} passed</span>}
                {warnCount > 0 && <span className="text-amber-600">{warnCount} warnings</span>}
                {errorCount > 0 && <span className="text-red-600">{errorCount} errors</span>}
              </span>
            </button>
            {validationsOpen && (
              <div className="border-t border-border divide-y divide-border">
                {validations.map((v, i) => (
                  <div key={i} className="flex items-center gap-2 px-4 py-2 text-xs">
                    {v.status === 'pass' && <CheckCircleIcon className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />}
                    {v.status === 'warn' && <AlertTriangleIcon className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />}
                    {v.status === 'error' && <XIcon className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />}
                    <span className="font-medium">{v.label}</span>
                    <span className="ml-auto text-muted-foreground">{v.detail}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Transactions - Grouped View */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-sm font-medium flex items-center gap-2">
              <TrendingUpIcon className="h-4 w-4" />
              Transactions ({emi.transactions.length})
            </h2>
            {selectedTxns.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{selectedTxns.size} selected</span>
                <button
                  onClick={() => setSelectedTxns(new Set())}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted border border-border"
                >
                  Clear
                </button>
                <button
                  onClick={handleRemoveSelected}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-red-600 hover:bg-red-50 border border-red-200"
                >
                  <XIcon className="h-3 w-3" />
                  Remove
                </button>
              </div>
            )}
          </div>

          {emi.transactions.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No transactions linked yet. Add transactions from a Story or the Credit Card Transactions page.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {groups.map((group, gi) => (
                <div key={gi}>
                  {/* Group header */}
                  <div className="flex items-center justify-between px-4 py-2 bg-muted/30">
                    <span className="text-xs font-medium text-muted-foreground">{group.label}</span>
                    <span className="text-xs font-mono text-muted-foreground">
                      <FormattedCurrency amount={group.subtotal} />
                    </span>
                  </div>
                  {/* Group transactions */}
                  {group.transactions.map(txn => (
                    <div
                      key={txn.id}
                      className={`px-4 py-2 text-sm hover:bg-muted/50 ${
                        selectedTxns.has(txn.id) ? "bg-primary/5" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedTxns.has(txn.id)}
                          onChange={() => toggleTxnSelection(txn.id)}
                          className="h-3.5 w-3.5 rounded border-border"
                        />
                        <span className="text-xs text-muted-foreground w-20 flex-shrink-0">
                          {formatDate(txn.date)}
                        </span>
                        <ComponentBadge
                          type={txn.component_type}
                          installmentNumber={txn.component_type === 'principal' || txn.component_type === 'interest' ? txn.installment_number : undefined}
                          taxInfo={renderTaxInfo(txn)}
                          onClick={() => startEditLink(txn)}
                        />
                        <span className="flex-1 truncate">{txn.description}</span>
                        <span className="flex items-center gap-0.5 flex-shrink-0">
                          {txn.refund_link && <RefundLinkBadge refundLink={txn.refund_link} transaction={{ ...txn, type: 'credit_card' as const }} onUnlinked={loadEMI} />}
                          <PaymentLinkBadge bankMatch={txn.bank_payment_match} transaction={{ ...txn, type: 'credit_card' as const }} onUnlinked={loadEMI} />
                          <StoriesBadges stories={transactionStories[`credit_card:${txn.id}`] || []} />
                          <EntitiesBadges entities={transactionEntities[`credit_card:${txn.id}`] || []} />
                        </span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0 w-20 text-right flex items-center justify-end gap-0.5">
                          <CreditCardIcon className="h-3 w-3" />
                          {txn.source}
                        </span>
                        <span className={`font-mono text-xs flex-shrink-0 w-24 text-right ${txn.amount < 0 ? "text-green-600" : ""}`}>
                          <FormattedCurrency amount={txn.amount} />
                        </span>
                      </div>
                      {editingLinkId === txn.link_id && (
                        <div className="flex items-center gap-2 ml-9 mt-2 flex-wrap">
                          <select
                            value={editLinkType}
                            onChange={e => setEditLinkType(e.target.value as EMIComponentType)}
                            className="px-2 py-1 rounded border border-border bg-background text-xs"
                          >
                            {Object.entries(COMPONENT_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                          {(editLinkType === 'principal' || editLinkType === 'interest') && (
                            <input
                              type="number"
                              value={editLinkInstallment}
                              onChange={e => setEditLinkInstallment(e.target.value)}
                              className="w-14 px-2 py-1 rounded border border-border bg-background text-xs"
                              placeholder="#"
                              min="1"
                            />
                          )}
                          {editLinkType === 'tax' && (
                            <>
                              <select
                                value={editTaxParentId}
                                onChange={e => setEditTaxParentId(e.target.value)}
                                className="px-2 py-1 rounded border border-border bg-background text-xs max-w-[180px]"
                              >
                                <option value="">No parent</option>
                                {taxParentOptions.filter(t => t.link_id !== txn.link_id).map(t => (
                                  <option key={t.link_id} value={t.link_id}>
                                    {COMPONENT_LABELS[t.component_type]}{t.installment_number != null ? ` #${t.installment_number}` : ''} ({formatCurrency(t.amount)})
                                  </option>
                                ))}
                              </select>
                              <input
                                type="number"
                                value={editTaxRate}
                                onChange={e => setEditTaxRate(e.target.value)}
                                className="w-16 px-2 py-1 rounded border border-border bg-background text-xs"
                                placeholder="%"
                                step="0.01"
                              />
                            </>
                          )}
                          <button onClick={saveEditLink} className="p-1 rounded hover:bg-muted">
                            <CheckIcon className="h-3.5 w-3.5 text-green-600" />
                          </button>
                          <button onClick={cancelEditLink} className="p-1 rounded hover:bg-muted">
                            <XIcon className="h-3.5 w-3.5 text-red-600" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Footer />

      {/* Delete confirmation dialog */}
      <Dialog.Root open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded-lg shadow-lg p-6 w-96 z-50">
            <Dialog.Title className="text-lg font-semibold">Delete EMI</Dialog.Title>
            <p className="text-sm text-muted-foreground mt-2">
              Are you sure you want to delete "{emi.name}"? This will remove all transaction links but won't delete the transactions themselves.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Dialog.Close asChild>
                <button className="px-3 py-1.5 rounded border border-border text-sm hover:bg-muted">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 rounded bg-red-600 text-white text-sm hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
    </Tooltip.Provider>
  )
}
