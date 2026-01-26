import { useEffect, useState, useRef } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import {
  ArrowLeftIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  TrashIcon,
  XIcon,
  HashIcon,
  CalendarIcon,
  PencilIcon,
  CheckIcon,
  CreditCardIcon,
  LandmarkIcon,
  MoveIcon,
  CopyIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  UserIcon,
  BuildingIcon,
} from "lucide-react"
import * as Dialog from "@radix-ui/react-dialog"
import { Footer } from "@/components/Footer"
import { MoveOrCopyToEntityModal } from "@/components/entities/MoveOrCopyToEntityModal"
import { CreateEntityModal } from "@/components/entities/CreateEntityModal"
import {
  fetchEntity,
  updateEntity,
  deleteEntity,
  removeTransactionsFromEntity,
  type EntityDetail,
  type EntityTransaction,
  type TransactionRef,
  type EntityType,
} from "@/lib/api"

const EMOJI_OPTIONS = [
  // Row 1 - People
  "👤", "👨", "👩", "👴", "👵", "👶", "🧑", "🧔",
  // Row 2 - Business & Work
  "🏢", "🏪", "🏬", "🏭", "🏥", "🏦", "🏨", "🏛️",
  // Row 3 - Shopping & Services
  "🛒", "🛍️", "🍔", "☕", "🍕", "💊", "✈️", "🚗",
  // Row 4 - Tech & Entertainment
  "📱", "💻", "🎬", "🎮", "📚", "🎵", "📺", "🎁",
  // Row 5 - Finance & Misc
  "💰", "💳", "📈", "💼", "🏠", "⚡", "💡", "🔧",
  // Row 6 - More options
  "⭐", "❤️", "🔖", "📌", "🏷️", "📋", "🗂️", "📁",
]

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

export function EntityDetailPage() {
  const { entityId } = useParams<{ entityId: string }>()
  const navigate = useNavigate()

  const [entity, setEntity] = useState<EntityDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Editing state
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState("")
  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const [editedDescription, setEditedDescription] = useState("")
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Delete state
  const [isDeleting, setIsDeleting] = useState(false)

  // Remove transaction state
  const [removingId, setRemovingId] = useState<{ type: string; id: number } | null>(null)

  // Selection state
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const lastSelectedIndexRef = useRef<number | null>(null)
  const [moveOrCopyMode, setMoveOrCopyMode] = useState<"move" | "copy">("move")
  const [moveOrCopyModalOpen, setMoveOrCopyModalOpen] = useState(false)
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)

  useEffect(() => {
    document.title = entity ? `${entity.name} | Entities | FinAccs` : "Entity | FinAccs"
  }, [entity])

  const loadEntity = async () => {
    if (!entityId) return
    try {
      const data = await fetchEntity(entityId)
      setEntity(data)
      setEditedName(data.name)
      setEditedDescription(data.description)
    } catch (err) {
      setError("Failed to load entity")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEntity()
  }, [entityId])

  const handleSaveName = async () => {
    if (!entity || !entityId) return
    if (!editedName.trim()) return

    setIsSaving(true)
    try {
      await updateEntity(entityId, { name: editedName.trim() })
      setEntity({ ...entity, name: editedName.trim() })
      setIsEditingName(false)
    } catch (err) {
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveDescription = async () => {
    if (!entity || !entityId) return

    setIsSaving(true)
    try {
      await updateEntity(entityId, { description: editedDescription.trim() })
      setEntity({ ...entity, description: editedDescription.trim() })
      setIsEditingDescription(false)
    } catch (err) {
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveIcon = async (newIcon: string) => {
    if (!entity || !entityId) return

    setIsSaving(true)
    try {
      await updateEntity(entityId, { icon: newIcon })
      setEntity({ ...entity, icon: newIcon })
      setIconPickerOpen(false)
    } catch (err) {
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleEntityType = async () => {
    if (!entity || !entityId) return

    const newType: EntityType = entity.entity_type === "person" ? "business" : "person"
    setIsSaving(true)
    try {
      await updateEntity(entityId, { entity_type: newType })
      setEntity({ ...entity, entity_type: newType })
    } catch (err) {
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteEntity = async () => {
    if (!entityId) return

    setIsDeleting(true)
    try {
      await deleteEntity(entityId)
      navigate("/entities")
    } catch (err) {
      console.error(err)
      setIsDeleting(false)
    }
  }

  const handleRemoveTransaction = async (txn: EntityTransaction) => {
    if (!entityId) return

    setRemovingId({ type: txn.type, id: txn.id })
    try {
      await removeTransactionsFromEntity(entityId, [{ type: txn.type, id: txn.id }])
      // Reload entity to get updated data
      loadEntity()
    } catch (err) {
      console.error(err)
    } finally {
      setRemovingId(null)
    }
  }

  // Selection helpers
  const getTxnKey = (txn: EntityTransaction) => `${txn.type}-${txn.id}`

  const handleSelect = (txn: EntityTransaction, event: React.MouseEvent) => {
    const currentIndex = entity!.transactions.findIndex(
      t => t.type === txn.type && t.id === txn.id
    )
    const key = getTxnKey(txn)

    if (event.shiftKey && lastSelectedIndexRef.current !== null) {
      // Shift-click: select range
      const start = Math.min(lastSelectedIndexRef.current, currentIndex)
      const end = Math.max(lastSelectedIndexRef.current, currentIndex)
      const newSet = new Set(selectedKeys)
      for (let i = start; i <= end; i++) {
        newSet.add(getTxnKey(entity!.transactions[i]))
      }
      setSelectedKeys(newSet)
    } else {
      // Normal click: toggle single item
      const newSet = new Set(selectedKeys)
      if (newSet.has(key)) {
        newSet.delete(key)
      } else {
        newSet.add(key)
      }
      setSelectedKeys(newSet)
      lastSelectedIndexRef.current = currentIndex
    }
  }

  const toggleSelectAll = () => {
    if (!entity) return
    if (selectedKeys.size === entity.transactions.length) {
      setSelectedKeys(new Set())
    } else {
      setSelectedKeys(new Set(entity.transactions.map(getTxnKey)))
    }
    lastSelectedIndexRef.current = null
  }

  const getSelectedTransactions = (): TransactionRef[] => {
    return Array.from(selectedKeys).map(key => {
      const [type, id] = key.split("-")
      return { type: type as "bank" | "credit_card", id: parseInt(id, 10) }
    })
  }

  const openMoveModal = () => {
    setMoveOrCopyMode("move")
    setMoveOrCopyModalOpen(true)
  }

  const openCopyModal = () => {
    setMoveOrCopyMode("copy")
    setMoveOrCopyModalOpen(true)
  }

  const handleMoveOrCopyComplete = () => {
    setSelectedKeys(new Set())
    loadEntity()
  }

  const handleBulkDelete = async () => {
    if (!entityId) return

    setIsBulkDeleting(true)
    try {
      await removeTransactionsFromEntity(entityId, getSelectedTransactions())
      setSelectedKeys(new Set())
      setBulkDeleteDialogOpen(false)
      loadEntity()
    } catch (err) {
      console.error(err)
    } finally {
      setIsBulkDeleting(false)
    }
  }

  if (loading) {
    return (
      <>
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </main>
        <Footer />
      </>
    )
  }

  if (error || !entity) {
    return (
      <>
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-card rounded-xl border border-border shadow-sm p-12 text-center">
            <p className="text-muted-foreground">{error || "Entity not found"}</p>
            <Link
              to="/entities"
              className="mt-4 inline-flex items-center gap-2 text-primary hover:underline"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back to Entities
            </Link>
          </div>
        </main>
        <Footer />
      </>
    )
  }

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Back link */}
        <Link
          to="/entities"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Entities
        </Link>

        {/* Entity Header */}
        <header className="mb-8">
          <div className="flex items-start gap-4">
            <div className="relative">
              <button
                onClick={() => setIconPickerOpen(!iconPickerOpen)}
                className="w-12 h-12 flex items-center justify-center text-2xl rounded-lg border border-border bg-muted/50 hover:bg-muted hover:border-muted-foreground/30 transition-colors cursor-pointer"
                title="Click to change icon"
              >
                {entity.icon}
              </button>
              {iconPickerOpen && (
                <div className="absolute top-full left-0 mt-2 p-3 bg-card border border-border rounded-lg shadow-xl z-50 w-max">
                  <div className="grid grid-cols-8 gap-1.5" style={{ width: "fit-content" }}>
                    {EMOJI_OPTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleSaveIcon(emoji)}
                        disabled={isSaving}
                        className={`w-9 h-9 flex items-center justify-center text-lg rounded-lg transition-colors flex-shrink-0 ${
                          entity.icon === emoji
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setIconPickerOpen(false)}
                    className="mt-2 w-full px-3 py-1.5 text-xs font-medium rounded-md border border-border text-muted-foreground hover:bg-accent"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="text-2xl font-bold bg-background border border-input rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveName()
                      if (e.key === "Escape") {
                        setEditedName(entity.name)
                        setIsEditingName(false)
                      }
                    }}
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={isSaving}
                    className="p-2 rounded-lg hover:bg-accent text-green-600"
                  >
                    <CheckIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => {
                      setEditedName(entity.name)
                      setIsEditingName(false)
                    }}
                    className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
                  >
                    <XIcon className="h-5 w-5" />
                  </button>
                </div>
              ) : (
                <h1 className="text-2xl font-bold flex items-center gap-2 group">
                  {entity.name}
                  <button
                    onClick={handleToggleEntityType}
                    disabled={isSaving}
                    className={`p-1.5 rounded-lg transition-colors ${
                      entity.entity_type === "person"
                        ? "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
                        : "bg-purple-500/10 text-purple-500 hover:bg-purple-500/20"
                    }`}
                    title={`${entity.entity_type === "person" ? "Person" : "Business"} - Click to toggle`}
                  >
                    {entity.entity_type === "person" ? (
                      <UserIcon className="h-4 w-4" />
                    ) : (
                      <BuildingIcon className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={() => setIsEditingName(true)}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-accent transition-opacity"
                  >
                    <PencilIcon className="h-4 w-4 text-muted-foreground" />
                  </button>
                </h1>
              )}

              {isEditingDescription ? (
                <div className="mt-2">
                  <textarea
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    className="w-full text-sm bg-background border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                    rows={2}
                    autoFocus
                    placeholder="Add a description..."
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={handleSaveDescription}
                      disabled={isSaving}
                      className="px-3 py-1 text-sm rounded-md bg-primary text-primary-foreground"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditedDescription(entity.description)
                        setIsEditingDescription(false)
                      }}
                      className="px-3 py-1 text-sm rounded-md border border-border"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p
                  onClick={() => setIsEditingDescription(true)}
                  className="text-muted-foreground mt-1 cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1"
                >
                  {entity.description || (
                    <span className="text-muted-foreground/50 italic">
                      Add description
                    </span>
                  )}
                </p>
              )}
            </div>
            <button
              onClick={() => setEditModalOpen(true)}
              className="p-2 rounded-lg hover:bg-accent text-muted-foreground transition-colors"
              title="Edit entity"
            >
              <PencilIcon className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Stats Cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-card rounded-xl border border-border shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <HashIcon className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Transactions</p>
                <p className="text-xl font-bold">{entity.transaction_count}</p>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${
                entity.total_spent === 0
                  ? "bg-muted"
                  : entity.total_spent < 0
                    ? "bg-green-500/10"
                    : "bg-red-500/10"
              }`}>
                {entity.total_spent === 0
                  ? <TrendingUpIcon className="h-5 w-5 text-muted-foreground" />
                  : entity.total_spent < 0
                    ? <TrendingUpIcon className="h-5 w-5 text-(--color-income)" />
                    : <TrendingDownIcon className="h-5 w-5 text-(--color-expense)" />
                }
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Sum</p>
                <p className={`text-xl font-bold inline-flex items-center gap-1 ${
                  entity.total_spent === 0
                    ? ""
                    : entity.total_spent < 0
                      ? "text-(--color-income)"
                      : "text-(--color-expense)"
                }`}>
                  <FormattedCurrency amount={Math.abs(entity.total_spent)} />
                  {entity.total_spent !== 0 && (
                    entity.total_spent < 0
                      ? <ArrowUpIcon className="h-4 w-4" />
                      : <ArrowDownIcon className="h-4 w-4" />
                  )}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <CalendarIcon className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Date Range</p>
                <p className="text-sm font-medium">
                  {entity.min_date === entity.max_date
                    ? formatDate(entity.min_date)
                    : `${formatDate(entity.min_date)} - ${formatDate(entity.max_date)}`}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Transactions Table */}
        <section className="bg-card rounded-xl border border-border shadow-sm">
          <header className="p-6 pb-0 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Transactions</h2>
          </header>

          {/* Selection Action Bar */}
          {selectedKeys.size > 0 && (
            <div className="mx-6 mt-4 p-3 bg-primary/5 border border-primary/20 rounded-lg flex items-center justify-between">
              <span className="text-sm font-medium">
                {selectedKeys.size} transaction{selectedKeys.size !== 1 ? "s" : ""} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={openMoveModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <MoveIcon className="h-4 w-4" />
                  Move
                </button>
                <button
                  onClick={openCopyModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-border bg-background hover:bg-accent"
                >
                  <CopyIcon className="h-4 w-4" />
                  Copy
                </button>
                <button
                  onClick={() => setBulkDeleteDialogOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700"
                >
                  <TrashIcon className="h-4 w-4" />
                  Remove
                </button>
                <button
                  onClick={() => setSelectedKeys(new Set())}
                  className="px-3 py-1.5 text-sm font-medium rounded-md border border-border text-muted-foreground hover:bg-accent"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          <div className="p-6">
            {entity.transactions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <HashIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No transactions in this entity yet.</p>
                <p className="text-sm mt-1">
                  Go to Transactions and select items to add here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-center px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={selectedKeys.size === entity.transactions.length && entity.transactions.length > 0}
                          onChange={toggleSelectAll}
                          className="h-4 w-4 rounded border-border"
                        />
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-10">
                        Type
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-28">
                        Date
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Description
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-32">
                        Category
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-32">
                        Source
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-28">
                        Amount
                      </th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-16">

                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {entity.transactions.map((txn) => (
                      <tr
                        key={`${txn.type}-${txn.id}`}
                        className={`hover:bg-muted/30 transition-colors ${selectedKeys.has(getTxnKey(txn)) ? "bg-primary/5" : ""}`}
                      >
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(getTxnKey(txn))}
                            onClick={(e) => handleSelect(txn, e)}
                            readOnly
                            className="h-4 w-4 rounded border-border"
                          />
                        </td>
                        <td className="px-4 py-3">
                          {txn.type === "bank" ? (
                            <span title="Bank Transaction">
                              <LandmarkIcon className="h-4 w-4 text-blue-500" />
                            </span>
                          ) : (
                            <span title="Credit Card Transaction">
                              <CreditCardIcon className="h-4 w-4 text-purple-500" />
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {formatDate(txn.date)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="truncate block max-w-md" title={txn.description}>
                            {txn.description}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
                            {txn.category || "Uncategorized"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {txn.source}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <FormattedCurrency
                            amount={Math.abs(txn.amount)}
                            className={txn.amount >= 0 ? "text-red-500" : "text-green-500"}
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleRemoveTransaction(txn)}
                            disabled={removingId?.type === txn.type && removingId?.id === txn.id}
                            className="p-1 rounded hover:bg-red-500/10 text-red-500 disabled:opacity-50"
                            title="Remove from entity"
                          >
                            {removingId?.type === txn.type && removingId?.id === txn.id ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            ) : (
                              <TrashIcon className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog.Root open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card rounded-lg shadow-xl p-6 w-full max-w-md z-50">
            <Dialog.Title className="text-lg font-semibold text-foreground">
              Remove Transactions
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to remove {selectedKeys.size} transaction{selectedKeys.size !== 1 ? "s" : ""} from this entity? The transactions themselves will not be deleted.
            </Dialog.Description>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setBulkDeleteDialogOpen(false)}
                disabled={isBulkDeleting}
                className="px-4 py-2 text-sm font-medium rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
                className="px-4 py-2 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isBulkDeleting ? "Removing..." : "Remove"}
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

      {/* Move/Copy Modal */}
      {entityId && (
        <MoveOrCopyToEntityModal
          open={moveOrCopyModalOpen}
          onOpenChange={setMoveOrCopyModalOpen}
          mode={moveOrCopyMode}
          currentEntityId={entityId}
          selectedTransactions={getSelectedTransactions()}
          onComplete={handleMoveOrCopyComplete}
        />
      )}

      {/* Edit Entity Modal */}
      <CreateEntityModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        onCreated={loadEntity}
        entity={{
          entity_id: entity.entity_id,
          name: entity.name,
          description: entity.description,
          icon: entity.icon,
          entity_type: entity.entity_type,
        }}
        onDelete={handleDeleteEntity}
        isDeleting={isDeleting}
      />

      <Footer />
    </>
  )
}
