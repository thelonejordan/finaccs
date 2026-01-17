import { useState, useEffect, useRef } from "react"
import {
  CreditCardIcon,
  FileTextIcon,
  DatabaseIcon,
  LinkIcon,
  Link2OffIcon,
  PencilIcon,
  CheckIcon,
  XIcon,
  PlusIcon,
  ChevronDownIcon,
  CalendarIcon,
  HashIcon,
  EyeIcon,
  EyeOffIcon,
  WalletIcon,
  SparklesIcon,
  BuildingIcon,
  SettingsIcon,
  ClockIcon,
  TrendingDownIcon,
  CheckCircleIcon,
  RefreshCwIcon,
} from "lucide-react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import * as Tooltip from "@radix-ui/react-tooltip"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { AccountsSection } from "@/components/AccountsSection"
import { DataSources } from "@/components/DataSources"
import {
  fetchCreditCards,
  createCreditCard,
  updateCreditCard,
  toggleCreditCardSourceFileDisabled,
  fetchBankAccounts,
  type CreditCard,
  type CreditCardInput,
  type CreditCardSourceFile,
  type BankAccount,
  type ExtractedCSV,
} from "@/lib/api"

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
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

// Credit Card Form Component
function CreditCardForm({
  card,
  onSave,
  onCancel,
  defaultSourceFile,
}: {
  card: CreditCard | null
  onSave: (card: CreditCard) => void
  onCancel: () => void
  defaultSourceFile?: string | null
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [saving, setSaving] = useState(false)
  const initialSourceFiles = card?.source_files || (defaultSourceFile ? [defaultSourceFile] : [])
  const [formData, setFormData] = useState<CreditCardInput>({
    nickname: card?.nickname || "",
    card_name: card?.card_name || "",
    card_number_mask: card?.card_number_mask || "",
    issuer: card?.issuer || "",
    credit_limit: card?.credit_limit || null,
    source_files: initialSourceFiles,
  })

  useEffect(() => {
    const scrollParent = formRef.current?.parentElement
    if (scrollParent && formRef.current) {
      const formTop = formRef.current.offsetTop - 12
      scrollParent.scrollTo({ top: formTop, behavior: 'smooth' })
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      let savedCard: CreditCard
      if (card) {
        savedCard = await updateCreditCard(card.id, formData)
      } else {
        savedCard = await createCreditCard(formData)
      }
      onSave(savedCard)
    } catch (error) {
      console.error("Failed to save credit card:", error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 p-4 border border-primary/30 rounded-lg bg-gradient-to-br from-primary/10 to-transparent">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Nickname *</label>
          <input
            type="text"
            required
            placeholder="e.g., My SBI Card"
            value={formData.nickname}
            onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
            className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Card Name</label>
          <input
            type="text"
            placeholder="e.g., SBI SimplySAVE"
            value={formData.card_name}
            onChange={(e) => setFormData({ ...formData, card_name: e.target.value })}
            className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Card Number Mask</label>
          <input
            type="text"
            placeholder="e.g., 4315 XXXX XXXX 6004"
            value={formData.card_number_mask}
            onChange={(e) => setFormData({ ...formData, card_number_mask: e.target.value })}
            className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Issuer</label>
          <input
            type="text"
            placeholder="e.g., SBI Card"
            value={formData.issuer}
            onChange={(e) => setFormData({ ...formData, issuer: e.target.value })}
            className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Credit Limit (Optional)</label>
          <input
            type="number"
            placeholder="e.g., 100000"
            value={formData.credit_limit || ""}
            onChange={(e) => setFormData({ ...formData, credit_limit: e.target.value ? parseFloat(e.target.value) : null })}
            className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        {formData.source_files.length > 0 && (
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">
              Linked Source File{formData.source_files.length > 1 ? 's' : ''}
            </label>
            <div className="flex flex-wrap gap-2">
              {formData.source_files.map((file) => (
                <div
                  key={file}
                  className="px-3 py-1.5 rounded-md border border-input bg-muted/50 text-sm font-mono truncate max-w-xs"
                >
                  {file}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm rounded-md border border-input hover:bg-accent transition-colors inline-flex items-center gap-1.5"
        >
          <XIcon className="h-3.5 w-3.5" />
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <CheckIcon className="h-3.5 w-3.5" />
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  )
}

// Credit Card Display Component
function CreditCardCard({
  card,
  onEdit,
}: {
  card: CreditCard
  onEdit: () => void
}) {
  return (
    <div className="p-4 border border-border rounded-lg hover:border-border hover:shadow-md transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-muted">
            <CreditCardIcon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">{card.nickname}</p>
            <p className="text-sm text-muted-foreground">{card.issuer || card.card_name || "Credit Card"}</p>
          </div>
        </div>
        <button
          onClick={onEdit}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <PencilIcon className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Card Stats - matches AccountCard layout */}
      {(card.total_charges != null && card.total_charges > 0) && (
        <div className="mt-3 p-3 rounded-lg border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Total Charges</p>
              <FormattedCurrency
                amount={card.total_charges}
                className="text-lg font-bold text-red-600 dark:text-red-400"
              />
            </div>
            {card.last_transaction_date && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                  <ClockIcon className="h-3 w-3" />
                  Last transaction
                </p>
                <p className="text-sm font-medium">{formatDate(card.last_transaction_date)}</p>
              </div>
            )}
          </div>
          {(card.total_payments != null || card.first_transaction_date) && (
            <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <TrendingDownIcon className="h-3 w-3" />
                Payments: <FormattedCurrency amount={card.total_payments || 0} />
                {card.transaction_count != null && card.transaction_count > 0 && (
                  <span className="ml-1">({card.transaction_count} txns)</span>
                )}
              </span>
              {card.first_transaction_date && (
                <span className="flex items-center gap-1">
                  <CalendarIcon className="h-3 w-3" />
                  {formatDate(card.first_transaction_date)}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        {card.card_number_mask && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50">
            <CreditCardIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-mono text-xs">{card.card_number_mask}</span>
          </div>
        )}
        {card.credit_limit && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50">
            <HashIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Limit: {formatCurrency(card.credit_limit)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// Credit Cards Section Component
function CreditCardsSection({
  cards,
  onSave,
  initialAddSourceFile,
  onAddingStateChange,
}: {
  cards: CreditCard[]
  onSave: (card: CreditCard) => void
  initialAddSourceFile?: string | null
  onAddingStateChange?: (isAdding: boolean) => void
}) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [prefilledSourceFile, setPrefilledSourceFile] = useState<string | null>(null)

  useEffect(() => {
    if (initialAddSourceFile) {
      setPrefilledSourceFile(initialAddSourceFile)
      setIsAdding(true)
    }
  }, [initialAddSourceFile])

  useEffect(() => {
    onAddingStateChange?.(isAdding)
    if (!isAdding) {
      setPrefilledSourceFile(null)
    }
  }, [isAdding, onAddingStateChange])

  const handleSave = (card: CreditCard) => {
    onSave(card)
    setEditingId(null)
    setIsAdding(false)
  }

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="p-6 pb-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2 text-lg">
            <div className="p-1.5 rounded-lg bg-muted">
              <WalletIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            Credit Cards
          </h3>
          {!isAdding && cards.length > 0 && (
            <button
              onClick={() => setIsAdding(true)}
              className="px-3 py-1.5 text-sm rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors inline-flex items-center gap-1.5 font-medium"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add
            </button>
          )}
        </div>
      </header>
      <div className="relative">
        <div className="p-6 pt-0 space-y-3 max-h-[512px] overflow-y-auto">
          {cards.length === 0 && !isAdding ? (
            <div className="text-center py-8 rounded-xl bg-gradient-to-br from-primary/10 to-transparent border border-primary/20">
              <div className="p-3 rounded-full bg-primary/20 w-fit mx-auto mb-3">
                <SparklesIcon className="h-6 w-6 text-primary" />
              </div>
              <p className="font-medium">No credit cards configured</p>
              <p className="text-sm text-muted-foreground mt-1">Add a credit card to get started</p>
              <button
                onClick={() => setIsAdding(true)}
                className="mt-4 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-2 font-medium shadow-sm"
              >
                <PlusIcon className="h-4 w-4" />
                Add Credit Card
              </button>
            </div>
          ) : (
            <>
              {isAdding && (
                <CreditCardForm
                  card={null}
                  onSave={handleSave}
                  onCancel={() => setIsAdding(false)}
                  defaultSourceFile={prefilledSourceFile}
                />
              )}
              {cards.map((card) =>
                editingId === card.id ? (
                  <CreditCardForm
                    key={card.id}
                    card={card}
                    onSave={handleSave}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <CreditCardCard
                    key={card.id}
                    card={card}
                    onEdit={() => setEditingId(card.id)}
                  />
                )
              )}
            </>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-card to-transparent pointer-events-none rounded-b-xl" />
      </div>
    </section>
  )
}

// Credit Card Data Sources Component
function CreditCardDataSources({
  sourceFiles,
  cards,
  onCreateCard,
  onCardUpdated,
  onSourceFileUpdated,
  onRefresh,
}: {
  sourceFiles: CreditCardSourceFile[]
  cards: CreditCard[]
  onCreateCard: (filename: string) => void
  onCardUpdated: () => void
  onSourceFileUpdated: (sourceFile: CreditCardSourceFile) => void
  onRefresh?: () => void
}) {
  const [isLinking, setIsLinking] = useState(false)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    if (!onRefresh) return
    setIsRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleToggleDisabled = async (file: CreditCardSourceFile) => {
    setTogglingId(file.id)
    try {
      await toggleCreditCardSourceFileDisabled(file.id, !file.disabled)
      onSourceFileUpdated({ ...file, disabled: !file.disabled })
    } catch (error) {
      console.error("Failed to toggle source file:", error)
    } finally {
      setTogglingId(null)
    }
  }

  // Create a map of source_file -> card
  const fileToCard = new Map<string, CreditCard>()
  sourceFiles.forEach((sf) => {
    if (sf.credit_card_id) {
      const card = cards.find((c) => c.id === sf.credit_card_id)
      if (card) {
        fileToCard.set(sf.filename, card)
      }
    }
  })

  const handleLinkToCard = async (filename: string, cardId: number) => {
    setIsLinking(true)
    try {
      // Fetch fresh data to avoid stale state
      const freshData = await fetchCreditCards()
      const card = freshData.cards.find((c) => c.id === cardId)
      if (card) {
        const newSourceFiles = [...(card.source_files || []), filename]
        await updateCreditCard(cardId, { source_files: newSourceFiles })
        onCardUpdated()
      }
    } catch (error) {
      console.error("Failed to link card:", error)
    } finally {
      setIsLinking(false)
    }
  }

  const handleUnlinkFromCard = async (filename: string, currentCardId: number) => {
    setIsLinking(true)
    try {
      // Fetch fresh data to avoid stale state
      const freshData = await fetchCreditCards()
      const card = freshData.cards.find((c) => c.id === currentCardId)
      if (card) {
        const newSourceFiles = (card.source_files || []).filter((f) => f !== filename)
        await updateCreditCard(currentCardId, { source_files: newSourceFiles })
        onCardUpdated()
      }
    } catch (error) {
      console.error("Failed to unlink card:", error)
    } finally {
      setIsLinking(false)
    }
  }

  const handleChangeLinkToCard = async (filename: string, currentCardId: number, newCardId: number) => {
    setIsLinking(true)
    try {
      // Fetch fresh data to avoid stale state
      const freshData = await fetchCreditCards()

      // Remove from current card
      const currentCard = freshData.cards.find((c) => c.id === currentCardId)
      if (currentCard) {
        const newCurrentSourceFiles = (currentCard.source_files || []).filter((f) => f !== filename)
        await updateCreditCard(currentCardId, { source_files: newCurrentSourceFiles })
      }

      // Fetch fresh data again after the first update
      const freshData2 = await fetchCreditCards()

      // Add to new card
      const newCard = freshData2.cards.find((c) => c.id === newCardId)
      if (newCard) {
        const newSourceFiles = [...(newCard.source_files || []), filename]
        await updateCreditCard(newCardId, { source_files: newSourceFiles })
      }

      // Refresh UI
      onCardUpdated()
    } catch (error) {
      console.error("Failed to change link:", error)
    } finally {
      setIsLinking(false)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="p-6 pb-3">
        <h3 className="font-semibold flex items-center gap-2 text-lg">
          <div className="p-1.5 rounded-lg bg-muted">
            <DatabaseIcon className="h-5 w-5 text-muted-foreground" />
          </div>
          Data Sources
          <div className="ml-auto">
            {onRefresh && (
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
                title="Refresh data sources"
              >
                <RefreshCwIcon className={`h-4 w-4 text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </h3>
      </header>
      <div className="relative">
        <div className="p-6 pt-0 max-h-[512px] overflow-y-auto">
          {sourceFiles.length === 0 ? (
            <div className="text-center py-8 rounded-xl bg-gradient-to-br from-muted/50 to-transparent border border-border">
              <div className="p-3 rounded-full bg-muted w-fit mx-auto mb-3">
                <FileTextIcon className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium">No source files found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add credit card CSV files to <code className="bg-muted px-1.5 py-0.5 rounded text-xs">credit_cards/data/</code>
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sourceFiles.map((file) => {
                const linkedCard = fileToCard.get(file.filename)
                return (
                  <div
                    key={file.filename}
                    className={`p-4 rounded-lg border transition-all hover:shadow-md ${file.disabled ? 'border-border/50 bg-muted/30 opacity-60' : 'border-border'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2.5 rounded-xl ${file.disabled ? 'bg-muted/50' : 'bg-muted'}`}>
                        <FileTextIcon className={`h-5 w-5 ${file.disabled ? 'text-muted-foreground/50' : 'text-muted-foreground'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className={`font-mono text-sm truncate font-medium ${file.disabled ? 'line-through text-muted-foreground' : ''}`}>{file.extracted_csv_name || file.filename}</p>
                            {file.extracted_csv_name && (
                              <p className="text-xs text-muted-foreground truncate">{file.filename}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {file.disabled ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-600 dark:text-red-400">
                                <EyeOffIcon className="h-3 w-3" />
                                Disabled
                              </span>
                            ) : !linkedCard && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-600 dark:text-amber-400">
                                <Link2OffIcon className="h-3 w-3" />
                                Not linked
                              </span>
                            )}
                            {file.extracted_csv_name && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-700 dark:text-green-400">
                                <CheckCircleIcon className="h-3 w-3" />
                                Loaded
                              </span>
                            )}
                            <Tooltip.Provider>
                              <Tooltip.Root>
                                <Tooltip.Trigger asChild>
                                  <button
                                    onClick={() => handleToggleDisabled(file)}
                                    disabled={togglingId === file.id}
                                    className={`p-1.5 rounded-lg transition-colors ${file.disabled ? 'hover:bg-green-500/20 text-muted-foreground hover:text-green-600' : 'hover:bg-red-500/20 text-muted-foreground hover:text-red-600'} disabled:opacity-50`}
                                  >
                                    {file.disabled ? (
                                      <EyeIcon className="h-4 w-4" />
                                    ) : (
                                      <EyeOffIcon className="h-4 w-4" />
                                    )}
                                  </button>
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                  <Tooltip.Content
                                    className="bg-card text-card-foreground px-3 py-2 rounded-md shadow-lg border border-border text-sm"
                                    sideOffset={4}
                                  >
                                    {file.disabled ? 'Enable this source' : 'Disable this source'}
                                    <Tooltip.Arrow className="fill-card" />
                                  </Tooltip.Content>
                                </Tooltip.Portal>
                              </Tooltip.Root>
                            </Tooltip.Provider>
                          </div>
                        </div>

                        {/* Date range and transaction count */}
                        {file.first_transaction_date && file.last_transaction_date && (
                          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <CalendarIcon className="h-3 w-3" />
                              {formatDate(file.first_transaction_date)} — {formatDate(file.last_transaction_date)}
                            </span>
                            {file.transaction_count != null && file.transaction_count > 0 && (
                              <span className="flex items-center gap-1">
                                <HashIcon className="h-3 w-3" />
                                {file.transaction_count} transactions
                              </span>
                            )}
                          </div>
                        )}

                        {linkedCard ? (
                          <div className="mt-2 flex items-center gap-2 flex-wrap text-sm">
                            <DropdownMenu.Root>
                              <DropdownMenu.Trigger asChild>
                                <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/15 hover:bg-blue-500/25 text-blue-600 dark:text-blue-400 transition-colors cursor-pointer">
                                  <CreditCardIcon className="h-3.5 w-3.5" />
                                  <span className="font-medium">{linkedCard.nickname}</span>
                                  <ChevronDownIcon className="h-3 w-3 opacity-60" />
                                </button>
                              </DropdownMenu.Trigger>
                              <DropdownMenu.Portal>
                                <DropdownMenu.Content
                                  className="w-64 bg-card rounded-lg shadow-lg border border-border z-50 p-2 animate-in fade-in-0 zoom-in-95"
                                  sideOffset={4}
                                  align="start"
                                >
                                  {cards.filter((c) => c.id !== linkedCard.id).length > 0 && (
                                    <>
                                      <DropdownMenu.Label className="text-xs font-medium text-muted-foreground px-2 py-1">
                                        Change to different card
                                      </DropdownMenu.Label>
                                      {cards.filter((c) => c.id !== linkedCard.id).map((c) => (
                                        <DropdownMenu.Item
                                          key={c.id}
                                          disabled={isLinking}
                                          onSelect={() => handleChangeLinkToCard(file.filename, linkedCard.id, c.id)}
                                          className="flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-accent transition-colors cursor-pointer outline-none disabled:opacity-50"
                                        >
                                          <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
                                          <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">{c.nickname}</p>
                                            <p className="text-xs text-muted-foreground truncate">
                                              {c.issuer} {c.card_number_mask && `• ${c.card_number_mask.slice(-8)}`}
                                            </p>
                                          </div>
                                        </DropdownMenu.Item>
                                      ))}
                                      <DropdownMenu.Separator className="h-px bg-border my-1" />
                                    </>
                                  )}
                                  <DropdownMenu.Item
                                    disabled={isLinking}
                                    onSelect={() => handleUnlinkFromCard(file.filename, linkedCard.id)}
                                    className="flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-red-500/10 text-red-600 dark:text-red-400 transition-colors cursor-pointer outline-none disabled:opacity-50"
                                  >
                                    <Link2OffIcon className="h-4 w-4" />
                                    Unlink from card
                                  </DropdownMenu.Item>
                                </DropdownMenu.Content>
                              </DropdownMenu.Portal>
                            </DropdownMenu.Root>
                            {linkedCard.issuer && (
                              <span className="text-muted-foreground">
                                {linkedCard.issuer}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="mt-2">
                            <DropdownMenu.Root>
                              <DropdownMenu.Trigger asChild>
                                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium">
                                  <LinkIcon className="h-3.5 w-3.5" />
                                  Link Card
                                  <ChevronDownIcon className="h-3.5 w-3.5" />
                                </button>
                              </DropdownMenu.Trigger>
                              <DropdownMenu.Portal>
                                <DropdownMenu.Content
                                  className="w-64 bg-card rounded-lg shadow-lg border border-border z-50 p-2 animate-in fade-in-0 zoom-in-95"
                                  sideOffset={4}
                                  align="start"
                                >
                                  {cards.length > 0 && (
                                    <>
                                      <DropdownMenu.Label className="text-xs font-medium text-muted-foreground px-2 py-1">
                                        Link to existing card
                                      </DropdownMenu.Label>
                                      {cards.map((c) => (
                                        <DropdownMenu.Item
                                          key={c.id}
                                          disabled={isLinking}
                                          onSelect={() => handleLinkToCard(file.filename, c.id)}
                                          className="flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-accent transition-colors cursor-pointer outline-none disabled:opacity-50"
                                        >
                                          <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
                                          <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">{c.nickname}</p>
                                            <p className="text-xs text-muted-foreground truncate">
                                              {c.issuer} {c.card_number_mask && `• ${c.card_number_mask.slice(-8)}`}
                                            </p>
                                          </div>
                                        </DropdownMenu.Item>
                                      ))}
                                      <DropdownMenu.Separator className="h-px bg-border my-1" />
                                    </>
                                  )}
                                  <DropdownMenu.Item
                                    onSelect={() => onCreateCard(file.filename)}
                                    className="flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-accent transition-colors cursor-pointer outline-none font-medium"
                                  >
                                    <PlusIcon className="h-4 w-4" />
                                    Create new card
                                  </DropdownMenu.Item>
                                </DropdownMenu.Content>
                              </DropdownMenu.Portal>
                            </DropdownMenu.Root>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-card to-transparent pointer-events-none rounded-b-xl" />
      </div>
    </section>
  )
}

type SettingsTab = "bank" | "credit"

// Main Settings Page
export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("bank")

  // Bank Accounts state
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [extractedCSVs, setExtractedCSVs] = useState<ExtractedCSV[]>([])
  const [bankAddSourceFile, setBankAddSourceFile] = useState<string | null>(null)

  // Credit Cards state
  const [creditCards, setCreditCards] = useState<CreditCard[]>([])
  const [creditCardSourceFiles, setCreditCardSourceFiles] = useState<CreditCardSourceFile[]>([])
  const [creditAddSourceFile, setCreditAddSourceFile] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.title = "Settings | FinAccs"
  }, [])

  useEffect(() => {
    async function loadData() {
      try {
        const [bankData, creditData] = await Promise.all([
          fetchBankAccounts(),
          fetchCreditCards(),
        ])
        setBankAccounts(bankData.accounts)
        setExtractedCSVs(bankData.extracted_csvs)
        setCreditCards(creditData.cards)
        setCreditCardSourceFiles(creditData.source_files)
      } catch (error) {
        console.error("Failed to load data:", error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const refreshBankData = async () => {
    const data = await fetchBankAccounts()
    setBankAccounts(data.accounts)
    setExtractedCSVs(data.extracted_csvs)
  }

  const refreshCreditData = async () => {
    const data = await fetchCreditCards()
    setCreditCards(data.cards)
    setCreditCardSourceFiles(data.source_files)
  }

  const handleBankAccountSave = (account: BankAccount) => {
    setBankAccounts((prev) => {
      const existing = prev.find((a) => a.id === account.id)
      if (existing) {
        return prev.map((a) => (a.id === account.id ? account : a))
      }
      return [...prev, account]
    })
    refreshBankData()
  }

  const handleCreditCardSave = (card: CreditCard) => {
    setCreditCards((prev) => {
      const existing = prev.find((c) => c.id === card.id)
      if (existing) {
        return prev.map((c) => (c.id === card.id ? card : c))
      }
      return [...prev, card]
    })
    refreshCreditData()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/40">
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <SettingsIcon className="h-6 w-6 text-primary" />
            </div>
            Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your bank accounts, credit cards, and data sources
          </p>
        </header>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("bank")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === "bank"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <BuildingIcon className="h-4 w-4" />
            Bank Accounts
          </button>
          <button
            onClick={() => setActiveTab("credit")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === "credit"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <CreditCardIcon className="h-4 w-4" />
            Credit Cards
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "bank" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AccountsSection
              accounts={bankAccounts}
              extractedCSVs={extractedCSVs}
              onSave={handleBankAccountSave}
              initialAddSourceFile={bankAddSourceFile}
              onAddingStateChange={(isAdding) => {
                if (!isAdding) setBankAddSourceFile(null)
              }}
            />
            <DataSources
              extractedCSVs={extractedCSVs}
              accounts={bankAccounts}
              onCreateAccount={(filename) => setBankAddSourceFile(filename)}
              onCSVUpdated={(updatedCSV) => {
                setExtractedCSVs((prev) => {
                  const existing = prev.findIndex((csv) => csv.id === updatedCSV.id)
                  if (existing >= 0) {
                    const updated = [...prev]
                    updated[existing] = updatedCSV
                    return updated
                  }
                  return prev
                })
              }}
              onRefresh={refreshBankData}
            />
          </div>
        )}

        {activeTab === "credit" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CreditCardsSection
              cards={creditCards}
              onSave={handleCreditCardSave}
              initialAddSourceFile={creditAddSourceFile}
              onAddingStateChange={(isAdding) => {
                if (!isAdding) setCreditAddSourceFile(null)
              }}
            />
            <CreditCardDataSources
              sourceFiles={creditCardSourceFiles}
              cards={creditCards}
              onCreateCard={(filename) => setCreditAddSourceFile(filename)}
              onCardUpdated={refreshCreditData}
              onSourceFileUpdated={(sourceFile) => {
                setCreditCardSourceFiles((prev) =>
                  prev.map((sf) => (sf.id === sourceFile.id ? sourceFile : sf))
                )
              }}
              onRefresh={refreshCreditData}
            />
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}
