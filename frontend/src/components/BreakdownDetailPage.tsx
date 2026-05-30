import { useEffect, useState, useMemo } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  ArrowLeftIcon,
  TrashIcon,
  PencilIcon,
  PlusIcon,
  CheckIcon,
  XIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ScissorsIcon,
} from "lucide-react"
import * as Dialog from "@radix-ui/react-dialog"
import { Footer } from "@/components/Footer"
import {
  fetchBreakdown,
  updateBreakdown,
  deleteBreakdown,
  updateBreakdownParts,
  type BreakdownDetail,
} from "@/lib/api"

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

interface ValidationResult {
  label: string
  status: 'pass' | 'warn' | 'error'
  detail: string
}

function runBreakdownValidations(breakdown: BreakdownDetail): ValidationResult[] {
  const results: ValidationResult[] = []
  if (!breakdown.transaction) return results

  const transactionAmount = Math.abs(breakdown.transaction.amount)
  const partsSum = breakdown.parts.reduce((s, p) => s + p.amount, 0)

  const sumDiff = Math.abs(partsSum - transactionAmount)
  if (sumDiff <= 0.01) {
    results.push({ label: 'Parts sum = Transaction', status: 'pass', detail: `${formatCurrency(partsSum)} = ${formatCurrency(transactionAmount)}` })
  } else {
    results.push({ label: 'Parts sum ≠ Transaction', status: 'error', detail: `${formatCurrency(partsSum)} vs ${formatCurrency(transactionAmount)} (Δ${formatCurrency(sumDiff)})` })
  }

  const partMap = new Map(breakdown.parts.map(p => [p.id, p]))
  for (const part of breakdown.parts) {
    if (part.rate != null) {
      let refAmount: number
      let refLabel: string
      if (part.rate_reference_id) {
        const ref = partMap.get(part.rate_reference_id)
        refAmount = ref?.amount ?? transactionAmount
        refLabel = ref?.label ?? 'unknown'
      } else {
        refAmount = transactionAmount
        refLabel = 'total'
      }
      const expected = refAmount * part.rate / 100
      const diff = Math.abs(part.amount - expected)
      if (diff <= 0.01) {
        results.push({ label: `${part.label} = ${part.rate}% of ${refLabel}`, status: 'pass', detail: `${formatCurrency(part.amount)} = ${formatCurrency(expected)}` })
      } else {
        results.push({ label: `${part.label} ≠ ${part.rate}% of ${refLabel}`, status: 'warn', detail: `${formatCurrency(part.amount)} vs ${formatCurrency(expected)} (Δ${formatCurrency(diff)})` })
      }
    }
  }

  return results
}

interface EditablePart {
  id?: number
  label: string
  amount: string
  rate: string
  rateReferenceOrder: string
  order: number
}

export function BreakdownDetailPage() {
  const { breakdownId } = useParams<{ breakdownId: string }>()
  const navigate = useNavigate()

  const [breakdown, setBreakdown] = useState<BreakdownDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState("")
  const [editDescription, setEditDescription] = useState("")

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [validationsOpen, setValidationsOpen] = useState(false)

  // Parts editing
  const [editingParts, setEditingParts] = useState(false)
  const [parts, setParts] = useState<EditablePart[]>([])
  const [savingParts, setSavingParts] = useState(false)

  const loadBreakdown = async () => {
    if (!breakdownId) return
    try {
      const data = await fetchBreakdown(breakdownId)
      setBreakdown(data)
      setEditName(data.name)
      setEditDescription(data.description)
    } catch (err) {
      setError("Failed to load breakdown")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBreakdown()
  }, [breakdownId])

  useEffect(() => {
    if (breakdown) document.title = `${breakdown.name} | Breakdowns | FinAccs`
  }, [breakdown])

  const startEditingParts = () => {
    if (!breakdown) return
    setParts(breakdown.parts.map(p => ({
      id: p.id,
      label: p.label,
      amount: p.amount.toString(),
      rate: p.rate?.toString() || "",
      rateReferenceOrder: p.rate_reference_id
        ? (breakdown.parts.find(x => x.id === p.rate_reference_id)?.order.toString() || "")
        : "",
      order: p.order,
    })))
    setEditingParts(true)
  }

  const addPart = () => {
    const maxOrder = parts.length > 0 ? Math.max(...parts.map(p => p.order)) + 1 : 0
    setParts([...parts, { label: "", amount: "", rate: "", rateReferenceOrder: "", order: maxOrder }])
  }

  const removePart = (index: number) => {
    setParts(parts.filter((_, i) => i !== index))
  }

  const updatePart = (index: number, field: keyof EditablePart, value: string | number) => {
    setParts(parts.map((p, i) => i === index ? { ...p, [field]: value } : p))
  }

  const handleSaveParts = async () => {
    if (!breakdownId) return
    setSavingParts(true)
    try {
      const partsData = parts
        .filter(p => p.label.trim() && p.amount)
        .map(p => ({
          label: p.label.trim(),
          amount: parseFloat(p.amount),
          rate: p.rate ? parseFloat(p.rate) : null,
          rate_reference_order: p.rateReferenceOrder ? parseInt(p.rateReferenceOrder) : null,
          order: p.order,
        }))
      const data = await updateBreakdownParts(breakdownId, partsData)
      setBreakdown(data)
      setEditingParts(false)
    } catch (err) {
      console.error("Failed to save parts", err)
    } finally {
      setSavingParts(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!breakdownId) return
    await updateBreakdown(breakdownId, {
      name: editName,
      description: editDescription,
    })
    setEditing(false)
    loadBreakdown()
  }

  const handleDelete = async () => {
    if (!breakdownId) return
    await deleteBreakdown(breakdownId)
    navigate("/breakdowns")
  }

  const validations = useMemo(() => {
    if (!breakdown) return []
    return runBreakdownValidations(breakdown)
  }, [breakdown])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error || !breakdown) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        {error || "Breakdown not found"}
      </div>
    )
  }

  const passCount = validations.filter(v => v.status === 'pass').length
  const warnCount = validations.filter(v => v.status === 'warn').length
  const errorCount = validations.filter(v => v.status === 'error').length

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 p-6 max-w-5xl mx-auto w-full">
        {/* Back button */}
        <button
          onClick={() => navigate("/breakdowns")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Breakdowns
        </button>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex-1">
            {editing && (
              <Dialog.Root open={editing} onOpenChange={setEditing}>
                <Dialog.Portal>
                  <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
                  <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded-lg shadow-lg p-6 w-[480px] max-h-[85vh] overflow-y-auto z-50">
                    <Dialog.Title className="text-lg font-semibold mb-4">Edit Breakdown</Dialog.Title>
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
            <div className="flex items-center gap-2">
              <ScissorsIcon className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-xl font-bold">{breakdown.name}</h1>
              <button onClick={() => setEditing(true)} className="p-1 rounded hover:bg-muted">
                <PencilIcon className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
            {breakdown.description && (
              <p className="text-sm text-muted-foreground mt-1">{breakdown.description}</p>
            )}
          </div>
          <button
            onClick={() => setDeleteConfirmOpen(true)}
            className="p-1.5 rounded hover:bg-red-50 text-red-600"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Transaction info */}
        {breakdown.transaction && (
          <div className="bg-card border border-border rounded-lg p-4 mb-6">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Transaction</div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{breakdown.transaction.description}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDate(breakdown.transaction.date)} · {breakdown.transaction.source} · {breakdown.transaction.type === 'credit_card' ? 'Credit Card' : 'Bank'}
                </p>
              </div>
              <span className="text-lg font-semibold font-mono">
                {formatCurrency(Math.abs(breakdown.transaction.amount))}
              </span>
            </div>
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

        {/* Parts */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-sm font-medium">Parts ({breakdown.parts.length})</h2>
            {!editingParts ? (
              <button
                onClick={startEditingParts}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-border hover:bg-muted"
              >
                <PencilIcon className="h-3 w-3" />
                Edit Parts
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditingParts(false)}
                  className="px-2 py-1 rounded text-xs border border-border hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveParts}
                  disabled={savingParts}
                  className="px-2 py-1 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {savingParts ? "Saving..." : "Save"}
                </button>
              </div>
            )}
          </div>

          {!editingParts ? (
            // Read-only view
            breakdown.parts.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No parts yet. Click "Edit Parts" to add breakdowns.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {breakdown.parts.map(part => (
                  <div key={part.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="text-xs text-muted-foreground w-6">{part.order + 1}.</span>
                    <span className="flex-1 font-medium">{part.label}</span>
                    {part.rate != null && (
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {part.rate}%
                        {part.rate_reference_id ? ` of ${breakdown.parts.find(p => p.id === part.rate_reference_id)?.label || '?'}` : ' of total'}
                      </span>
                    )}
                    <span className="font-mono text-xs w-28 text-right">{formatCurrency(part.amount)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30">
                  <span className="text-xs font-medium text-muted-foreground">Total</span>
                  <span className="font-mono text-xs font-medium">
                    {formatCurrency(breakdown.parts.reduce((s, p) => s + p.amount, 0))}
                  </span>
                </div>
              </div>
            )
          ) : (
            // Editable view
            <div className="p-4 space-y-2">
              <div className="grid grid-cols-[2rem_1fr_6rem_5rem_6rem_2rem] gap-2 text-[10px] text-muted-foreground font-medium px-1">
                <span>#</span>
                <span>Label</span>
                <span>Amount</span>
                <span>Rate %</span>
                <span>Ref</span>
                <span></span>
              </div>
              {parts.map((part, i) => (
                <div key={i} className="grid grid-cols-[2rem_1fr_6rem_5rem_6rem_2rem] gap-2 items-center">
                  <span className="text-xs text-muted-foreground text-center">{part.order + 1}</span>
                  <input
                    type="text"
                    value={part.label}
                    onChange={e => updatePart(i, 'label', e.target.value)}
                    className="px-2 py-1 rounded border border-border bg-background text-xs"
                    placeholder="Label"
                  />
                  <input
                    type="number"
                    value={part.amount}
                    onChange={e => updatePart(i, 'amount', e.target.value)}
                    className="px-2 py-1 rounded border border-border bg-background text-xs"
                    step="0.01"
                    placeholder="0.00"
                  />
                  <input
                    type="number"
                    value={part.rate}
                    onChange={e => updatePart(i, 'rate', e.target.value)}
                    className="px-2 py-1 rounded border border-border bg-background text-xs"
                    step="0.01"
                    placeholder="%"
                  />
                  <select
                    value={part.rateReferenceOrder}
                    onChange={e => updatePart(i, 'rateReferenceOrder', e.target.value)}
                    className="px-1 py-1 rounded border border-border bg-background text-xs"
                  >
                    <option value="">Total</option>
                    {parts.filter((_, j) => j !== i).map((p, j) => (
                      <option key={j} value={p.order}>
                        {p.label || `Part ${p.order + 1}`}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => removePart(i)}
                    className="p-1 rounded hover:bg-red-50 text-red-600"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={addPart}
                className="flex items-center gap-1 px-2 py-1.5 rounded border border-dashed border-border text-xs text-muted-foreground hover:bg-muted w-full justify-center mt-2"
              >
                <PlusIcon className="h-3 w-3" />
                Add Part
              </button>

              {/* Live sum indicator */}
              {breakdown.transaction && (
                <div className="flex items-center justify-between pt-3 border-t border-border mt-3">
                  <span className="text-xs text-muted-foreground">
                    Sum: {formatCurrency(parts.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0))}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Target: {formatCurrency(Math.abs(breakdown.transaction.amount))}
                  </span>
                  {(() => {
                    const sum = parts.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
                    const target = Math.abs(breakdown.transaction.amount)
                    const diff = Math.abs(sum - target)
                    if (diff <= 0.01) {
                      return <CheckIcon className="h-4 w-4 text-green-600" />
                    }
                    return <span className="text-xs text-red-600">Δ {formatCurrency(diff)}</span>
                  })()}
                </div>
              )}
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
            <Dialog.Title className="text-lg font-semibold">Delete Breakdown</Dialog.Title>
            <p className="text-sm text-muted-foreground mt-2">
              Are you sure you want to delete "{breakdown.name}"? This will remove all parts.
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
  )
}
