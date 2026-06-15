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
  GitCompareIcon,
  WalletIcon,
  ScissorsIcon,
} from "lucide-react"
import * as Dialog from "@radix-ui/react-dialog"
import * as Tooltip from "@radix-ui/react-tooltip"
import { Footer } from "@/components/Footer"
import { RefundLinkBadge, SelfTransferLinkBadge, StoriesBadges, EntitiesBadges, EMIsBadges, PaymentLinkBadge } from "@/components/shared/TransactionLinkBadges"
import { MoveOrCopyToStoryModal } from "@/components/stories/MoveOrCopyToStoryModal"
import { CreateStoryModal } from "@/components/stories/CreateStoryModal"
import { UnifiedCompareModal } from "@/components/shared/UnifiedCompareModal"
import { AddToEMIModal } from "@/components/emis/AddToEMIModal"
import {
  fetchStory,
  updateStory,
  deleteStory,
  removeTransactionsFromStory,
  getTransactionStories,
  getTransactionEntities,
  getTransactionEMIs,
  createBreakdown,
  type StoryDetail,
  type StoryTransaction,
  type TransactionRef,
  type StoryBadge,
  type EntityBadge,
  type EMIBadge,
} from "@/lib/api"

const EMOJI_OPTIONS = [
  // Row 1 - Generic & Organization
  "📁", "🗂️", "📂", "📋", "🏷️", "🔖", "⭐", "📌",
  // Row 2 - Income & Finance
  "💰", "💵", "💸", "💳", "🏦", "📈", "📊", "💼",
  // Row 3 - Shopping & Food
  "🛒", "🛍️", "🍔", "☕", "🥗", "🍕", "🛵", "📦",
  // Row 4 - Home & Utilities
  "🏠", "🔑", "💡", "⚡", "💧", "🔧", "🧹", "🏢",
  // Row 5 - Transport & Travel
  "🚗", "⛽", "✈️", "🚆", "🧳", "🏨", "🌴", "🗺️",
  // Row 6 - Health, Education & Entertainment
  "💊", "🏥", "📚", "🎓", "🎬", "🎮", "🎵", "📺",
  // Row 7 - Tech, Gifts & Misc
  "📱", "💻", "🎁", "👕", "🐱", "🐶", "🐷", "📝",
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

export function StoryDetailPage() {
  const { storyId } = useParams<{ storyId: string }>()
  const navigate = useNavigate()

  const [story, setStory] = useState<StoryDetail | null>(null)
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
  const [compareModalOpen, setCompareModalOpen] = useState(false)
  const [addToEMIModalOpen, setAddToEMIModalOpen] = useState(false)

  // Transaction stories, entities, and EMIs badges
  const [transactionStories, setTransactionStories] = useState<Record<string, StoryBadge[]>>({})
  const [transactionEntities, setTransactionEntities] = useState<Record<string, EntityBadge[]>>({})
  const [transactionEMIs, setTransactionEMIs] = useState<Record<string, EMIBadge[]>>({})

  useEffect(() => {
    document.title = story ? `${story.name} | Stories | FinAccs` : "Story | FinAccs"
  }, [story])

  const loadStory = async () => {
    if (!storyId) return
    try {
      const data = await fetchStory(storyId)
      setStory(data)
      setEditedName(data.name)
      setEditedDescription(data.description)

      // Fetch stories, entities, and EMIs badges for these transactions
      if (data.transactions.length > 0) {
        const transactionRefs = data.transactions.map(t => ({ type: t.type, id: t.id }))
        try {
          const [storiesData, entitiesData, emisData] = await Promise.all([
            getTransactionStories(transactionRefs),
            getTransactionEntities(transactionRefs),
            getTransactionEMIs(transactionRefs),
          ])
          setTransactionStories(storiesData.transaction_stories)
          setTransactionEntities(entitiesData.transaction_entities)
          setTransactionEMIs(emisData.transaction_emis)
        } catch (error) {
          console.error("Failed to load transaction stories/entities/emis", error)
        }
      } else {
        setTransactionStories({})
        setTransactionEntities({})
        setTransactionEMIs({})
      }
    } catch (err) {
      setError("Failed to load story")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStory()
  }, [storyId])

  const handleSaveName = async () => {
    if (!story || !storyId) return
    if (!editedName.trim()) return

    setIsSaving(true)
    try {
      await updateStory(storyId, { name: editedName.trim() })
      setStory({ ...story, name: editedName.trim() })
      setIsEditingName(false)
    } catch (err) {
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveDescription = async () => {
    if (!story || !storyId) return

    setIsSaving(true)
    try {
      await updateStory(storyId, { description: editedDescription.trim() })
      setStory({ ...story, description: editedDescription.trim() })
      setIsEditingDescription(false)
    } catch (err) {
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveIcon = async (newIcon: string) => {
    if (!story || !storyId) return

    setIsSaving(true)
    try {
      await updateStory(storyId, { icon: newIcon })
      setStory({ ...story, icon: newIcon })
      setIconPickerOpen(false)
    } catch (err) {
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteStory = async () => {
    if (!storyId) return

    setIsDeleting(true)
    try {
      await deleteStory(storyId)
      navigate("/stories")
    } catch (err) {
      console.error(err)
      setIsDeleting(false)
    }
  }

  const handleRemoveTransaction = async (txn: StoryTransaction) => {
    if (!storyId) return

    setRemovingId({ type: txn.type, id: txn.id })
    try {
      await removeTransactionsFromStory(storyId, [{ type: txn.type, id: txn.id }])
      // Reload story to get updated data
      loadStory()
    } catch (err) {
      console.error(err)
    } finally {
      setRemovingId(null)
    }
  }

  // Selection helpers
  const getTxnKey = (txn: StoryTransaction) => `${txn.type}-${txn.id}`

  const handleSelect = (txn: StoryTransaction, event: React.MouseEvent) => {
    const currentIndex = story!.transactions.findIndex(
      t => t.type === txn.type && t.id === txn.id
    )
    const key = getTxnKey(txn)

    if (event.shiftKey && lastSelectedIndexRef.current !== null) {
      // Shift-click: select range
      const start = Math.min(lastSelectedIndexRef.current, currentIndex)
      const end = Math.max(lastSelectedIndexRef.current, currentIndex)
      const newSet = new Set(selectedKeys)
      for (let i = start; i <= end; i++) {
        newSet.add(getTxnKey(story!.transactions[i]))
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
    if (!story) return
    if (selectedKeys.size === story.transactions.length) {
      setSelectedKeys(new Set())
    } else {
      setSelectedKeys(new Set(story.transactions.map(getTxnKey)))
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
    loadStory()
  }

  const handleBulkDelete = async () => {
    if (!storyId) return

    setIsBulkDeleting(true)
    try {
      await removeTransactionsFromStory(storyId, getSelectedTransactions())
      setSelectedKeys(new Set())
      setBulkDeleteDialogOpen(false)
      loadStory()
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

  if (error || !story) {
    return (
      <>
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-card rounded-xl border border-border shadow-sm p-12 text-center">
            <p className="text-muted-foreground">{error || "Story not found"}</p>
            <Link
              to="/stories"
              className="mt-4 inline-flex items-center gap-2 text-primary hover:underline"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back to Stories
            </Link>
          </div>
        </main>
        <Footer />
      </>
    )
  }

  return (
    <Tooltip.Provider>
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Link to="/dashboard" className="hover:text-foreground transition-colors">home</Link>
          <span>/</span>
          <Link to="/stories" className="hover:text-foreground transition-colors">stories</Link>
          <span>/</span>
          <span>{story.story_id}</span>
        </div>

        {/* Story Header */}
        <header className="mb-8">
          <div className="flex items-start gap-4">
            <div className="relative">
              <button
                onClick={() => setIconPickerOpen(!iconPickerOpen)}
                className="w-12 h-12 flex items-center justify-center text-2xl rounded-lg border border-border bg-muted/50 hover:bg-muted hover:border-muted-foreground/30 transition-colors cursor-pointer"
                title="Click to change icon"
              >
                {story.icon}
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
                          story.icon === emoji
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
                        setEditedName(story.name)
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
                      setEditedName(story.name)
                      setIsEditingName(false)
                    }}
                    className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
                  >
                    <XIcon className="h-5 w-5" />
                  </button>
                </div>
              ) : (
                <h1 className="text-2xl font-bold flex items-center gap-2 group">
                  {story.name}
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
                        setEditedDescription(story.description)
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
                  {story.description || (
                    <span className="text-muted-foreground/50 italic">
                      Add description
                    </span>
                  )}
                </p>
              )}
            </div>
            <button
              onClick={() => setCompareModalOpen(true)}
              className="p-2 rounded-lg border border-border hover:bg-accent text-foreground transition-colors"
              title="Compare with other stories or entities"
            >
              <GitCompareIcon className="h-5 w-5" />
            </button>
            <button
              onClick={() => setEditModalOpen(true)}
              className="p-2 rounded-lg border border-border hover:bg-accent text-foreground transition-colors"
              title="Edit story"
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
                <p className="text-xl font-bold">{story.transaction_count}</p>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${
                story.total_spent === 0
                  ? "bg-muted"
                  : story.total_spent < 0
                    ? "bg-green-500/10"
                    : "bg-red-500/10"
              }`}>
                {story.total_spent === 0
                  ? <TrendingUpIcon className="h-5 w-5 text-muted-foreground" />
                  : story.total_spent < 0
                    ? <TrendingUpIcon className="h-5 w-5 text-(--color-income)" />
                    : <TrendingDownIcon className="h-5 w-5 text-(--color-expense)" />
                }
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Sum</p>
                <p className={`text-xl font-bold inline-flex items-center gap-1 ${
                  story.total_spent === 0
                    ? ""
                    : story.total_spent < 0
                      ? "text-(--color-income)"
                      : "text-(--color-expense)"
                }`}>
                  <FormattedCurrency amount={Math.abs(story.total_spent)} />
                  {story.total_spent !== 0 && (
                    story.total_spent < 0
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
                  {story.min_date === story.max_date
                    ? formatDate(story.min_date)
                    : `${formatDate(story.min_date)} - ${formatDate(story.max_date)}`}
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
                  onClick={() => setAddToEMIModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <WalletIcon className="h-4 w-4" />
                  Add to EMI
                </button>
                {selectedKeys.size === 1 && (() => {
                  const key = Array.from(selectedKeys)[0]
                  const [type, id] = key.split('-')
                  const txn = story?.transactions.find(t => t.type === type && t.id === Number(id))
                  if (txn?.breakdown) return null
                  return (
                    <button
                      onClick={async () => {
                        try {
                          const result = await createBreakdown({ transaction_type: type as 'bank' | 'credit_card', transaction_id: Number(id) })
                          navigate(`/breakdowns/${result.breakdown_id}`)
                        } catch (err) {
                          console.error("Failed to create breakdown", err)
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      <ScissorsIcon className="h-4 w-4" />
                      Breakdown
                    </button>
                  )
                })()}
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
            {story.transactions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <HashIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No transactions in this story yet.</p>
                <p className="text-sm mt-1">
                  Go to Transactions and select items to add here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-border">
                      <th className="text-center px-3 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={selectedKeys.size === story.transactions.length && story.transactions.length > 0}
                          onChange={toggleSelectAll}
                          className="h-4 w-4 rounded border-border"
                        />
                      </th>
                      <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-14">
                        Type
                      </th>
                      <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-24">
                        Date
                      </th>
                      <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Description
                      </th>
                      <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-28">
                        Category
                      </th>
                      <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-20">
                        Source
                      </th>
                      <th className="text-center px-3 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-20">
                        Link
                      </th>
                      <th className="text-right px-3 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-28">
                        Amount
                      </th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {story.transactions.map((txn) => (
                      <tr
                        key={`${txn.type}-${txn.id}`}
                        className={`hover:bg-muted/30 transition-colors ${selectedKeys.has(getTxnKey(txn)) ? "bg-primary/5" : ""}`}
                      >
                        <td className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(getTxnKey(txn))}
                            onClick={(e) => handleSelect(txn, e)}
                            readOnly
                            className="h-4 w-4 rounded border-border"
                          />
                        </td>
                        <td className="px-3 py-3">
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
                        <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                          {formatDate(txn.date)}
                        </td>
                        <td className="px-3 py-3">
                          <span className="truncate block max-w-md" title={txn.description}>
                            {txn.description}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
                            {txn.category || "Uncategorized"}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground text-xs">
                          {txn.source}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {txn.refund_link && <RefundLinkBadge refundLink={txn.refund_link} transaction={txn} onUnlinked={loadStory} />}
                            {txn.linked_transaction && <SelfTransferLinkBadge linkedTransaction={txn.linked_transaction} transaction={txn} />}
                            <PaymentLinkBadge ccMatch={txn.cc_payment_match} bankMatch={txn.bank_payment_match} transaction={txn} onUnlinked={loadStory} />
                            <StoriesBadges stories={transactionStories[`${txn.type}:${txn.id}`] || []} excludeStoryId={storyId} />
                            <EntitiesBadges entities={transactionEntities[`${txn.type}:${txn.id}`] || []} />
                            <EMIsBadges emis={transactionEMIs[`${txn.type}:${txn.id}`] || []} />
                            {txn.breakdown && (
                              <Tooltip.Root>
                                <Tooltip.Trigger asChild>
                                  <Link
                                    to={`/breakdowns/${txn.breakdown.breakdown_id}`}
                                    className="p-1 rounded hover:bg-muted transition-colors"
                                  >
                                    <ScissorsIcon className="h-4 w-4 text-orange-500" />
                                  </Link>
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                  <Tooltip.Content
                                    className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-sm max-w-xs z-50"
                                    sideOffset={4}
                                  >
                                    <p className="font-medium">{txn.breakdown.name}</p>
                                    <Tooltip.Arrow className="fill-card" />
                                  </Tooltip.Content>
                                </Tooltip.Portal>
                              </Tooltip.Root>
                            )}
                            {!txn.refund_link && !txn.linked_transaction && !txn.cc_payment_match && !txn.bank_payment_match &&
                             !transactionStories[`${txn.type}:${txn.id}`]?.filter(s => s.story_id !== storyId).length &&
                             !transactionEntities[`${txn.type}:${txn.id}`]?.length &&
                             !transactionEMIs[`${txn.type}:${txn.id}`]?.length && !txn.breakdown && (
                              <span className="inline-flex items-center justify-center w-6 h-6 text-muted-foreground/40 text-xs">-</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          {txn.amount >= 0 ? (
                            <span className="text-(--color-expense) font-medium flex items-center justify-end gap-1">
                              <FormattedCurrency amount={Math.abs(txn.amount)} />
                              <ArrowDownIcon className="h-3 w-3 flex-shrink-0" />
                            </span>
                          ) : (
                            <span className="text-(--color-income) font-medium flex items-center justify-end gap-1">
                              <FormattedCurrency amount={Math.abs(txn.amount)} />
                              <ArrowUpIcon className="h-3 w-3 flex-shrink-0" />
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            onClick={() => handleRemoveTransaction(txn)}
                            disabled={removingId?.type === txn.type && removingId?.id === txn.id}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                            title="Remove from story"
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
              Are you sure you want to remove {selectedKeys.size} transaction{selectedKeys.size !== 1 ? "s" : ""} from this story? The transactions themselves will not be deleted.
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
      {storyId && (
        <MoveOrCopyToStoryModal
          open={moveOrCopyModalOpen}
          onOpenChange={setMoveOrCopyModalOpen}
          mode={moveOrCopyMode}
          currentStoryId={storyId}
          selectedTransactions={getSelectedTransactions()}
          onComplete={handleMoveOrCopyComplete}
        />
      )}

      {/* Edit Story Modal */}
      <CreateStoryModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        onCreated={loadStory}
        story={{
          story_id: story.story_id,
          name: story.name,
          description: story.description,
          icon: story.icon,
        }}
        onDelete={handleDeleteStory}
        isDeleting={isDeleting}
      />

      {/* Compare Modal */}
      <UnifiedCompareModal
        open={compareModalOpen}
        onOpenChange={setCompareModalOpen}
        initialStoryId={storyId}
      />

      {/* Add to EMI Modal */}
      <AddToEMIModal
        open={addToEMIModalOpen}
        onOpenChange={setAddToEMIModalOpen}
        selectedTransactions={getSelectedTransactions()}
        onAdded={async () => {
          setSelectedKeys(new Set())
          if (story && story.transactions.length > 0) {
            const transactionRefs = story.transactions.map(t => ({ type: t.type, id: t.id }))
            try {
              const emisData = await getTransactionEMIs(transactionRefs)
              setTransactionEMIs(emisData.transaction_emis)
            } catch (error) {
              console.error("Failed to refresh transaction EMIs", error)
            }
          }
        }}
      />

      <Footer />
    </Tooltip.Provider>
  )
}
