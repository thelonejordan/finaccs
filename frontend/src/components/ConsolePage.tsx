import { useState, useEffect, useRef } from "react"
import { useSearchParams } from "react-router-dom"
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
  LoaderIcon,
  Trash2Icon,
  SlidersHorizontalIcon,
  ChevronRightIcon,
  UploadIcon,
} from "lucide-react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import * as Tooltip from "@radix-ui/react-tooltip"
import * as Dialog from "@radix-ui/react-dialog"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { AccountsSection } from "@/components/AccountsSection"
import { DataSources } from "@/components/DataSources"
import {
  fetchCreditCards,
  createCreditCard,
  updateCreditCard,
  fetchBankAccounts,
  fetchDataSources,
  loadDataSource,
  unloadDataSource,
  deleteDataSource,
  previewDataSource,
  updateDataSource,
  type CreditCard,
  type CreditCardInput,
  type BankAccount,
  type IngestableTransactionRow,
  type DataSourceArtifact,
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
  dataSources,
  cards,
  selectedArtifactId,
  onSelectArtifact,
  onCardUpdated,
  onLoadArtifact,
  onUnloadArtifact,
  onDeleteArtifact,
  onRefresh,
}: {
  dataSources: DataSourceArtifact[]
  cards: CreditCard[]
  selectedArtifactId: string | null
  onSelectArtifact: (artifactId: string) => void
  onCardUpdated: () => void
  onLoadArtifact: (artifactIds: string[]) => Promise<void>
  onUnloadArtifact: (artifactIds: string[]) => Promise<void>
  onDeleteArtifact: (artifactId: string) => Promise<void>
  onRefresh?: () => void
}) {
  const [isLinking, setIsLinking] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [loadingArtifactIds, setLoadingArtifactIds] = useState<Set<string>>(new Set())
  const [deleteArtifactId, setDeleteArtifactId] = useState<string | null>(null)
  const [deletingArtifactId, setDeletingArtifactId] = useState<string | null>(null)

  const handleRefresh = async () => {
    if (!onRefresh) return
    setIsRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setIsRefreshing(false)
    }
  }

  // Handler for updating artifact credit card
  const handleUpdateArtifactCard = async (artifactId: string, cardId: number | null) => {
    setIsLinking(true)
    try {
      await updateDataSource(artifactId, { credit_card_id: cardId })
      onCardUpdated()
    } catch (error) {
      console.error("Failed to update artifact card:", error)
    } finally {
      setIsLinking(false)
    }
  }

  // Helper to get display name for data source
  const getDisplayName = (ds: DataSourceArtifact): string => {
    return ds.source_artifact_key
      ? `${ds.source_artifact_type} (${ds.source_artifact_key})`
      : ds.source_artifact_type
  }

  // Separate data sources by status
  const readyToLoadSources = dataSources.filter((ds) => ds.status === 'unloaded')
  const loadedSources = dataSources.filter((ds) => ds.status === 'loaded')

  // Sort each group by transformed date (most recent first)
  const sortByDate = (a: DataSourceArtifact, b: DataSourceArtifact) => {
    return new Date(b.transformed_at).getTime() - new Date(a.transformed_at).getTime()
  }
  readyToLoadSources.sort(sortByDate)
  loadedSources.sort(sortByDate)

  // Helper to render data source card
  const renderDataSourceCard = (ds: DataSourceArtifact, isLoading: boolean, isSelected: boolean) => (
    <div
      key={`artifact-${ds.artifact_id}`}
      className={`rounded-lg border transition-all hover:shadow-md ${isSelected ? 'border-primary bg-primary/5' : 'border-border'}`}
    >
      <div
        className="p-4 cursor-pointer"
        onClick={() => ds.artifact_id && onSelectArtifact(ds.artifact_id)}
      >
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-muted">
            <FileTextIcon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-sm truncate font-medium" title={getDisplayName(ds)}>{getDisplayName(ds)}</p>
                <p className="text-xs text-muted-foreground truncate">{ds.source_filename}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {getStatusBadge(ds)}
              </div>
            </div>

            {/* Row count and date */}
            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <HashIcon className="h-3 w-3" />
                {ds.row_count} transactions
              </span>
              {ds.transformed_at && (
                <span className="flex items-center gap-1">
                  <CalendarIcon className="h-3 w-3" />
                  {formatDate(ds.transformed_at)}
                </span>
              )}
            </div>

            {/* Credit card and actions */}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {ds.credit_card_id ? (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/15 hover:bg-blue-500/25 text-blue-600 dark:text-blue-400 transition-colors cursor-pointer">
                      <CreditCardIcon className="h-3.5 w-3.5" />
                      <span className="font-medium text-sm">{ds.credit_card_name || 'Linked'}</span>
                      <ChevronDownIcon className="h-3 w-3 opacity-60" />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      className="w-64 bg-card rounded-lg shadow-lg border border-border z-50 p-2 animate-in fade-in-0 zoom-in-95"
                      sideOffset={4}
                      align="start"
                    >
                      {cards.filter((c) => c.id !== ds.credit_card_id).length > 0 && (
                        <>
                          <DropdownMenu.Label className="text-xs font-medium text-muted-foreground px-2 py-1">
                            Change to different card
                          </DropdownMenu.Label>
                          {cards.filter((c) => c.id !== ds.credit_card_id).map((c) => (
                            <DropdownMenu.Item
                              key={c.id}
                              disabled={isLinking}
                              onSelect={() => handleUpdateArtifactCard(ds.artifact_id, c.id)}
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
                        onSelect={() => handleUpdateArtifactCard(ds.artifact_id, null)}
                        className="flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-red-500/10 text-red-600 dark:text-red-400 transition-colors cursor-pointer outline-none disabled:opacity-50"
                      >
                        <Link2OffIcon className="h-4 w-4" />
                        Unlink from card
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              ) : (
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
                      {cards.length > 0 ? (
                        <>
                          <DropdownMenu.Label className="text-xs font-medium text-muted-foreground px-2 py-1">
                            Link to existing card
                          </DropdownMenu.Label>
                          {cards.map((c) => (
                            <DropdownMenu.Item
                              key={c.id}
                              disabled={isLinking}
                              onSelect={() => handleUpdateArtifactCard(ds.artifact_id, c.id)}
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
                        </>
                      ) : (
                        <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                          No cards available. Create a card first.
                        </div>
                      )}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              )}

              <div className="ml-auto flex items-center gap-1">
                {ds.status === 'unloaded' && (
                  <Tooltip.Provider>
                    <Tooltip.Root>
                      <Tooltip.Trigger asChild>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleLoadArtifact(ds.artifact_id) }}
                          disabled={isLoading}
                          className="p-1.5 rounded-lg hover:bg-green-500/20 text-muted-foreground hover:text-green-600 dark:hover:text-green-400 transition-colors disabled:opacity-50"
                        >
                          {isLoading ? (
                            <LoaderIcon className="h-4 w-4 animate-spin" />
                          ) : (
                            <UploadIcon className="h-4 w-4" />
                          )}
                        </button>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content
                          className="bg-card text-card-foreground px-3 py-2 rounded-md shadow-lg border border-border text-sm"
                          sideOffset={4}
                        >
                          Load transactions to database
                          <Tooltip.Arrow className="fill-card" />
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  </Tooltip.Provider>
                )}
                {ds.status === 'loaded' && (
                  <Tooltip.Provider>
                    <Tooltip.Root>
                      <Tooltip.Trigger asChild>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleUnloadArtifact(ds.artifact_id) }}
                          disabled={isLoading}
                          className="p-1.5 rounded-lg hover:bg-amber-500/20 text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 transition-colors disabled:opacity-50"
                        >
                          {isLoading ? (
                            <LoaderIcon className="h-4 w-4 animate-spin" />
                          ) : (
                            <XIcon className="h-4 w-4" />
                          )}
                        </button>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content
                          className="bg-card text-card-foreground px-3 py-2 rounded-md shadow-lg border border-border text-sm"
                          sideOffset={4}
                        >
                          Unload transactions from database
                          <Tooltip.Arrow className="fill-card" />
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  </Tooltip.Provider>
                )}
                {/* Delete artifact button */}
                <Tooltip.Provider>
                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteArtifactId(ds.artifact_id) }}
                        disabled={isLoading || deletingArtifactId === ds.artifact_id}
                        className="p-1.5 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                      >
                        {deletingArtifactId === ds.artifact_id ? (
                          <LoaderIcon className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2Icon className="h-4 w-4" />
                        )}
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content
                        className="bg-card text-card-foreground px-3 py-2 rounded-md shadow-lg border border-border text-sm"
                        sideOffset={4}
                      >
                        Delete data source
                        <Tooltip.Arrow className="fill-card" />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                </Tooltip.Provider>
                {/* Selection indicator */}
                {ds.artifact_id && (
                  <ChevronRightIcon className={`h-4 w-4 text-muted-foreground transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  const handleLoadArtifact = async (artifactId: string) => {
    setLoadingArtifactIds((prev) => new Set(prev).add(artifactId))
    try {
      await onLoadArtifact([artifactId])
    } finally {
      setLoadingArtifactIds((prev) => {
        const next = new Set(prev)
        next.delete(artifactId)
        return next
      })
    }
  }

  const handleUnloadArtifact = async (artifactId: string) => {
    setLoadingArtifactIds((prev) => new Set(prev).add(artifactId))
    try {
      await onUnloadArtifact([artifactId])
    } finally {
      setLoadingArtifactIds((prev) => {
        const next = new Set(prev)
        next.delete(artifactId)
        return next
      })
    }
  }

  const confirmDeleteArtifact = async () => {
    if (!deleteArtifactId) return

    setDeletingArtifactId(deleteArtifactId)
    try {
      await onDeleteArtifact(deleteArtifactId)
    } finally {
      setDeletingArtifactId(null)
      setDeleteArtifactId(null)
    }
  }

  const getStatusBadge = (ds: DataSourceArtifact) => {
    switch (ds.status) {
      case 'loaded':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-700 dark:text-green-400">
            <CheckCircleIcon className="h-3 w-3" />
            Loaded
          </span>
        )
      case 'loading':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-600 dark:text-blue-400">
            <LoaderIcon className="h-3 w-3 animate-spin" />
            Loading...
          </span>
        )
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-600 dark:text-red-400">
            <XIcon className="h-3 w-3" />
            Error
          </span>
        )
      default: // 'unloaded'
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-600 dark:text-purple-400">
            <CheckCircleIcon className="h-3 w-3" />
            Ready to Load
          </span>
        )
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
          {dataSources.length === 0 ? (
            <div className="text-center py-8 rounded-xl bg-gradient-to-br from-muted/50 to-transparent border border-border">
              <div className="p-3 rounded-full bg-muted w-fit mx-auto mb-3">
                <FileTextIcon className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium">No data sources found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Transform extractions from the Extractions page
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Ready to Load Section */}
              {readyToLoadSources.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wider">Ready to Load</p>
                  {readyToLoadSources.map((ds) => {
                    const isLoading = loadingArtifactIds.has(ds.artifact_id)
                    const isSelected = selectedArtifactId === ds.artifact_id
                    return renderDataSourceCard(ds, isLoading, isSelected)
                  })}
                </div>
              )}

              {/* Loaded Section */}
              {loadedSources.length > 0 && (
                <div className="space-y-3">
                  {readyToLoadSources.length > 0 && (
                    <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wider">Loaded</p>
                  )}
                  {loadedSources.map((ds) => {
                    const isLoading = loadingArtifactIds.has(ds.artifact_id)
                    const isSelected = selectedArtifactId === ds.artifact_id
                    return renderDataSourceCard(ds, isLoading, isSelected)
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-card to-transparent pointer-events-none rounded-b-xl" />
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog.Root open={deleteArtifactId !== null} onOpenChange={(open) => !open && setDeleteArtifactId(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 animate-in fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded-xl shadow-lg w-full max-w-md p-6 animate-in fade-in-0 zoom-in-95">
            <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
              <div className="p-2 rounded-lg bg-red-500/20">
                <Trash2Icon className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              Delete Data Source
            </Dialog.Title>
            <Dialog.Description className="mt-3 text-muted-foreground">
              {deleteArtifactId && (
                <>
                  Are you sure you want to delete{' '}
                  <span className="font-mono text-foreground">
                    {dataSources.find(ds => ds.artifact_id === deleteArtifactId)?.source_filename || deleteArtifactId}
                  </span>?
                  <ul className="mt-3 space-y-1.5 text-sm">
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      This data source will be permanently deleted
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      Loaded transactions will be deleted
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                      Other data sources from the same extraction are not affected
                    </li>
                  </ul>
                </>
              )}
            </Dialog.Description>
            <div className="mt-6 flex justify-end gap-3">
              <Dialog.Close asChild>
                <button className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={confirmDeleteArtifact}
                disabled={deletingArtifactId !== null}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {deletingArtifactId !== null ? (
                  <>
                    <LoaderIcon className="h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2Icon className="h-4 w-4" />
                    Delete
                  </>
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}

// Data Source Preview Section Component
function DataSourcePreviewSection({
  dataSource,
  previewData,
  previewLoading,
  previewTotal,
  previewColumns,
  previewVisibleColumns,
  previewColumnSelectorOpen,
  onToggleColumnSelector,
  onToggleColumn,
}: {
  dataSource: DataSourceArtifact | null
  previewData: IngestableTransactionRow[]
  previewLoading: boolean
  previewTotal: number
  previewColumns: Array<{ key: string; header: string; align: 'left' | 'right' }>
  previewVisibleColumns: Set<string>
  previewColumnSelectorOpen: boolean
  onToggleColumnSelector: () => void
  onToggleColumn: (key: string) => void
}) {
  // Helper to get display name for data source
  const getDisplayName = (ds: DataSourceArtifact): string => {
    return ds.source_artifact_key
      ? `${ds.source_artifact_type} (${ds.source_artifact_key})`
      : ds.source_artifact_type
  }
  const renderPreviewCell = (row: IngestableTransactionRow, key: string) => {
    switch (key) {
      case 'date':
      case 'value_date':
        return <span className="font-mono">{row[key as keyof IngestableTransactionRow]}</span>
      case 'narration':
        return <span className="max-w-[200px] truncate block" title={row.narration}>{row.narration}</span>
      case 'debit_amount':
        return parseFloat(row.debit_amount) > 0
          ? <span className="text-red-600 dark:text-red-400">{formatCurrency(parseFloat(row.debit_amount))}</span>
          : ''
      case 'credit_amount':
        return parseFloat(row.credit_amount) > 0
          ? <span className="text-green-600 dark:text-green-400">{formatCurrency(parseFloat(row.credit_amount))}</span>
          : ''
      case 'closing_balance':
        return parseFloat(row.closing_balance) !== 0
          ? <span className="text-muted-foreground">{formatCurrency(parseFloat(row.closing_balance))}</span>
          : '-'
      case 'reference_number':
        return <span className="text-muted-foreground">{row.reference_number || '-'}</span>
      case 'intl_amount':
        return parseFloat(row.intl_amount) !== 0
          ? <span className="text-muted-foreground">{row.intl_amount}</span>
          : '-'
      case 'intl_currency':
        return <span className="text-muted-foreground">{row.intl_currency || '-'}</span>
      case 'exchange_rate':
        return parseFloat(row.exchange_rate) !== 0
          ? <span className="text-muted-foreground">{row.exchange_rate}</span>
          : '-'
      default:
        return row[key as keyof IngestableTransactionRow] || '-'
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm lg:col-span-2">
      <header className="p-6 pb-3">
        <h3 className="font-semibold flex items-center gap-2 text-lg">
          <div className="p-1.5 rounded-lg bg-muted">
            <EyeIcon className="h-5 w-5 text-muted-foreground" />
          </div>
          Data Source Preview
          {dataSource && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              — {getDisplayName(dataSource)}
            </span>
          )}
        </h3>
      </header>
      <div className="p-6 pt-0">
        {!dataSource ? (
          <div className="text-center py-8 rounded-xl bg-gradient-to-br from-muted/50 to-transparent border border-border">
            <div className="p-3 rounded-full bg-muted w-fit mx-auto mb-3">
              <EyeOffIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium">No data source selected</p>
            <p className="text-sm text-muted-foreground mt-1">
              Click on a data source above to preview its contents
            </p>
          </div>
        ) : previewLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoaderIcon className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                {dataSource.transformed_at && (
                  <span className="flex items-center gap-1">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {formatDate(dataSource.transformed_at)}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <HashIcon className="h-3.5 w-3.5" />
                  {dataSource.row_count} transactions
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  Showing {previewData.length} of {previewTotal} rows
                </span>
                {/* Column Selector */}
                <div className="relative">
                  <button
                    onClick={onToggleColumnSelector}
                    className="px-2 py-1 text-xs rounded border border-border hover:bg-muted transition-colors flex items-center gap-1"
                  >
                    <SlidersHorizontalIcon className="h-3 w-3" />
                    Columns ({previewVisibleColumns.size}/{previewColumns.length})
                  </button>
                  {previewColumnSelectorOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={onToggleColumnSelector} />
                      <div className="absolute right-0 top-full mt-1 z-20 bg-card border border-border rounded-lg shadow-lg p-2 min-w-[160px] max-h-[300px] overflow-auto">
                        {previewColumns.map((col) => (
                          <label
                            key={col.key}
                            className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={previewVisibleColumns.has(col.key)}
                              onChange={() => onToggleColumn(col.key)}
                              className="rounded border-border"
                            />
                            <span className="truncate">{col.header}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            {previewData.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      {previewColumns
                        .filter((col) => previewVisibleColumns.has(col.key))
                        .map((col) => (
                          <th
                            key={col.key}
                            className={`px-3 py-2 font-medium text-muted-foreground whitespace-nowrap ${
                              col.align === 'right' ? 'text-right' : 'text-left'
                            }`}
                          >
                            {col.header}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {previewData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-muted/30">
                        {previewColumns
                          .filter((col) => previewVisibleColumns.has(col.key))
                          .map((col) => (
                            <td
                              key={col.key}
                              className={`px-3 py-2 whitespace-nowrap font-mono ${
                                col.align === 'right' ? 'text-right' : 'text-left'
                              }`}
                            >
                              {renderPreviewCell(row, col.key)}
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No data available
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

// Bank Data Source Preview Section Component
function BankDataSourcePreviewSection({
  dataSource,
  previewData,
  previewLoading,
  previewTotal,
  previewColumns,
  previewVisibleColumns,
  previewColumnSelectorOpen,
  onToggleColumnSelector,
  onToggleColumn,
}: {
  dataSource: DataSourceArtifact | null
  previewData: Record<string, string>[]
  previewLoading: boolean
  previewTotal: number
  previewColumns: Array<{ key: string; header: string; align: 'left' | 'right' }>
  previewVisibleColumns: Set<string>
  previewColumnSelectorOpen: boolean
  onToggleColumnSelector: () => void
  onToggleColumn: (key: string) => void
}) {
  // Helper to get display name for data source
  const getDisplayName = (ds: DataSourceArtifact): string => {
    return ds.source_artifact_key
      ? `${ds.source_artifact_type} (${ds.source_artifact_key})`
      : ds.source_artifact_type
  }

  const renderPreviewCell = (row: Record<string, string>, key: string) => {
    const value = row[key] || ''
    switch (key) {
      case 'date':
      case 'value_date':
        return <span className="font-mono">{value}</span>
      case 'narration':
        return <span className="max-w-[200px] truncate block" title={value}>{value}</span>
      case 'debit_amount':
        return parseFloat(value) > 0
          ? <span className="text-red-600 dark:text-red-400">{formatCurrency(parseFloat(value))}</span>
          : ''
      case 'credit_amount':
        return parseFloat(value) > 0
          ? <span className="text-green-600 dark:text-green-400">{formatCurrency(parseFloat(value))}</span>
          : ''
      case 'closing_balance':
        return value && parseFloat(value) !== 0
          ? <span className="text-muted-foreground">{formatCurrency(parseFloat(value))}</span>
          : '-'
      case 'reference_number':
        return <span className="text-muted-foreground">{value || '-'}</span>
      default:
        return value || '-'
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm lg:col-span-2">
      <header className="p-6 pb-3">
        <h3 className="font-semibold flex items-center gap-2 text-lg">
          <div className="p-1.5 rounded-lg bg-muted">
            <EyeIcon className="h-5 w-5 text-muted-foreground" />
          </div>
          Data Source Preview
          {dataSource && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              — {getDisplayName(dataSource)}
            </span>
          )}
        </h3>
      </header>
      <div className="p-6 pt-0">
        {!dataSource ? (
          <div className="text-center py-8 rounded-xl bg-gradient-to-br from-muted/50 to-transparent border border-border">
            <div className="p-3 rounded-full bg-muted w-fit mx-auto mb-3">
              <EyeOffIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium">No data source selected</p>
            <p className="text-sm text-muted-foreground mt-1">
              Click on a data source above to preview its contents
            </p>
          </div>
        ) : previewLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoaderIcon className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                {dataSource.transformed_at && (
                  <span className="flex items-center gap-1">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {formatDate(dataSource.transformed_at)}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <HashIcon className="h-3.5 w-3.5" />
                  {dataSource.row_count} transactions
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  Showing {previewData.length} of {previewTotal} rows
                </span>
                {/* Column Selector */}
                <div className="relative">
                  <button
                    onClick={onToggleColumnSelector}
                    className="px-2 py-1 text-xs rounded border border-border hover:bg-muted transition-colors flex items-center gap-1"
                  >
                    <SlidersHorizontalIcon className="h-3 w-3" />
                    Columns ({previewVisibleColumns.size}/{previewColumns.length})
                  </button>
                  {previewColumnSelectorOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={onToggleColumnSelector} />
                      <div className="absolute right-0 top-full mt-1 z-20 bg-card border border-border rounded-lg shadow-lg p-2 min-w-[160px] max-h-[300px] overflow-auto">
                        {previewColumns.map((col) => (
                          <label
                            key={col.key}
                            className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={previewVisibleColumns.has(col.key)}
                              onChange={() => onToggleColumn(col.key)}
                              className="rounded border-border"
                            />
                            <span className="truncate">{col.header}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            {previewData.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      {previewColumns
                        .filter((col) => previewVisibleColumns.has(col.key))
                        .map((col) => (
                          <th
                            key={col.key}
                            className={`px-3 py-2 font-medium text-muted-foreground whitespace-nowrap ${
                              col.align === 'right' ? 'text-right' : 'text-left'
                            }`}
                          >
                            {col.header}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {previewData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-muted/30">
                        {previewColumns
                          .filter((col) => previewVisibleColumns.has(col.key))
                          .map((col) => (
                            <td
                              key={col.key}
                              className={`px-3 py-2 whitespace-nowrap font-mono ${
                                col.align === 'right' ? 'text-right' : 'text-left'
                              }`}
                            >
                              {renderPreviewCell(row, col.key)}
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No data available
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

type SettingsTab = "bank" | "credit"

// Main Console Page
export function ConsolePage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Get initial tab from URL param
  const getInitialTab = (): SettingsTab => {
    const domain = searchParams.get('domain')
    if (domain === 'credit-card') return 'credit'
    return 'bank'
  }

  const [activeTab, setActiveTab] = useState<SettingsTab>(getInitialTab)

  // Update URL when tab changes
  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab)
    setSearchParams({ domain: tab === 'credit' ? 'credit-card' : 'bank' }, { replace: true })
  }

  // Bank Accounts state
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [bankAddSourceFile, setBankAddSourceFile] = useState<string | null>(null)

  // Bank data source preview state
  const [selectedBankCSVId, setSelectedBankCSVId] = useState<number | null>(null)
  const [bankPreviewData, setBankPreviewData] = useState<Record<string, string>[]>([])
  const [bankPreviewLoading, setBankPreviewLoading] = useState(false)
  const [bankPreviewTotal, setBankPreviewTotal] = useState(0)
  const [bankPreviewColumnSelectorOpen, setBankPreviewColumnSelectorOpen] = useState(false)
  const [bankPreviewVisibleColumns, setBankPreviewVisibleColumns] = useState<Set<string>>(
    new Set(['date', 'narration', 'debit_amount', 'credit_amount', 'closing_balance', 'reference_number'])
  )

  // Credit Cards state
  const [creditCards, setCreditCards] = useState<CreditCard[]>([])
  const [creditAddSourceFile, setCreditAddSourceFile] = useState<string | null>(null)

  // Data sources state
  const [bankDataSources, setBankDataSources] = useState<DataSourceArtifact[]>([])
  const [ccDataSources, setCcDataSources] = useState<DataSourceArtifact[]>([])

  // Data source preview state (lifted from CreditCardDataSources)
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<IngestableTransactionRow[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewTotal, setPreviewTotal] = useState(0)
  const [previewColumnSelectorOpen, setPreviewColumnSelectorOpen] = useState(false)
  const [previewVisibleColumns, setPreviewVisibleColumns] = useState<Set<string>>(
    new Set(['date', 'narration', 'debit_amount', 'credit_amount', 'reference_number', 'intl_amount'])
  )

  const [loading, setLoading] = useState(true)

  // Preview columns configuration
  const previewColumns = [
    { key: 'date', header: 'Date', align: 'left' as const },
    { key: 'value_date', header: 'Value Date', align: 'left' as const },
    { key: 'narration', header: 'Narration', align: 'left' as const },
    { key: 'debit_amount', header: 'Debit', align: 'right' as const },
    { key: 'credit_amount', header: 'Credit', align: 'right' as const },
    { key: 'reference_number', header: 'Ref#', align: 'left' as const },
    { key: 'closing_balance', header: 'Balance', align: 'right' as const },
    { key: 'intl_amount', header: 'Intl Amt', align: 'right' as const },
    { key: 'intl_currency', header: 'Currency', align: 'left' as const },
    { key: 'exchange_rate', header: 'Rate', align: 'right' as const },
  ]

  const togglePreviewColumn = (key: string) => {
    setPreviewVisibleColumns(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size > 1) next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const toggleBankPreviewColumn = (key: string) => {
    setBankPreviewVisibleColumns(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size > 1) next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // Handle bank CSV selection and load preview data
  const handleSelectBankCSV = async (csvId: number | null) => {
    if (csvId === null || selectedBankCSVId === csvId) {
      // Deselect
      setSelectedBankCSVId(null)
      setBankPreviewData([])
      setBankPreviewTotal(0)
      return
    }

    setSelectedBankCSVId(csvId)
    setBankPreviewLoading(true)
    setBankPreviewData([])
    setBankPreviewTotal(0)

    try {
      // Find the data source by id to get its artifact_id
      const ds = bankDataSources.find(d => d.id === csvId)
      if (ds) {
        const result = await previewDataSource(ds.artifact_id, 20)
        setBankPreviewData(result.data as Record<string, string>[])
        setBankPreviewTotal(result.total || result.data.length)
      }
    } catch (error) {
      console.error("Failed to load bank preview:", error)
    } finally {
      setBankPreviewLoading(false)
    }
  }

  // Get selected bank CSV object (uses mapped data for consistent interface)
  const selectedBankDataSource = bankDataSources.find(ds => ds.id === selectedBankCSVId) || null

  // Handle artifact selection and load preview data
  const handleSelectArtifact = async (artifactId: string) => {
    if (selectedArtifactId === artifactId) {
      // Deselect
      setSelectedArtifactId(null)
      setPreviewData([])
      setPreviewTotal(0)
      return
    }

    setSelectedArtifactId(artifactId)
    setPreviewLoading(true)
    setPreviewData([])
    setPreviewTotal(0)

    try {
      const result = await previewDataSource(artifactId, 20)
      setPreviewData(result.data as unknown as IngestableTransactionRow[])
      setPreviewTotal(result.total || result.data.length)
    } catch (error) {
      console.error("Failed to load preview:", error)
    } finally {
      setPreviewLoading(false)
    }
  }

  // Get selected extraction object (uses mapped data for consistent interface)
  const selectedCcDataSource = ccDataSources.find(ds => ds.artifact_id === selectedArtifactId) || null

  useEffect(() => {
    document.title = "Console | FinAccs"
  }, [])

  useEffect(() => {
    async function loadData() {
      // Load each data source independently so one failure doesn't break everything
      try {
        const bankData = await fetchBankAccounts()
        setBankAccounts(bankData.accounts)
      } catch (error) {
        console.error("Failed to load bank accounts:", error)
      }

      try {
        const creditData = await fetchCreditCards()
        setCreditCards(creditData.cards)
      } catch (error) {
        console.error("Failed to load credit cards:", error)
      }

      // Load data sources
      try {
        const [bankDsRes, ccDsRes] = await Promise.all([
          fetchDataSources({ domain: 'bank_account_transactions', visibility: 'visible' }),
          fetchDataSources({ domain: 'credit_card_transactions', visibility: 'visible' }),
        ])
        setBankDataSources(bankDsRes.data)
        setCcDataSources(ccDsRes.data)
      } catch (error) {
        console.error("Failed to load data sources:", error)
      }

      setLoading(false)
    }
    loadData()
  }, [])

  const refreshBankData = async () => {
    const data = await fetchBankAccounts()
    setBankAccounts(data.accounts)
    try {
      const bankDsRes = await fetchDataSources({ domain: 'bank_account_transactions', visibility: 'visible' })
      setBankDataSources(bankDsRes.data)
    } catch (error) {
      console.error("Failed to refresh bank data sources:", error)
    }
  }

  const refreshCreditData = async () => {
    // Load each data source independently to avoid one failure blocking all
    try {
      const creditData = await fetchCreditCards()
      setCreditCards(creditData.cards)
    } catch (error) {
      console.error("Failed to refresh credit cards:", error)
    }

    try {
      const ccDsRes = await fetchDataSources({ domain: 'credit_card_transactions', visibility: 'visible' })
      setCcDataSources(ccDsRes.data)
    } catch (error) {
      console.error("Failed to refresh CC data sources:", error)
    }
  }

  const handleLoadArtifacts = async (artifactIds: string[]) => {
    // Load each artifact sequentially
    for (const artifactId of artifactIds) {
      await loadDataSource(artifactId)
    }
    await refreshCreditData()
  }

  const handleUnloadArtifacts = async (artifactIds: string[]) => {
    for (const artifactId of artifactIds) {
      await unloadDataSource(artifactId)
    }
    await refreshCreditData()
  }

  const handleDeleteArtifact = async (artifactId: string) => {
    const result = await deleteDataSource(artifactId)
    if (result.success) {
      await refreshCreditData()
    } else {
      alert(result.error || "Failed to delete data source")
    }
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

  // Clear data source selection when clicking outside the cards
  const handleCreditTabClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setSelectedArtifactId(null)
      setPreviewData([])
      setPreviewTotal(0)
    }
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
    <div className="min-h-screen bg-muted/40" onClick={handleCreditTabClick}>
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-8" onClick={handleCreditTabClick}>
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <SettingsIcon className="h-6 w-6 text-primary" />
                </div>
                Console
              </h1>
              <p className="text-muted-foreground mt-1">
                Manage your bank accounts, credit cards, and data sources
              </p>
            </div>
          </div>
        </header>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => handleTabChange("bank")}
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
            onClick={() => handleTabChange("credit")}
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
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <AccountsSection
                accounts={bankAccounts}
                onSave={handleBankAccountSave}
                initialAddSourceFile={bankAddSourceFile}
                onAddingStateChange={(isAdding) => {
                  if (!isAdding) setBankAddSourceFile(null)
                }}
              />
              <DataSources
                dataSources={bankDataSources}
                accounts={bankAccounts}
                onCreateAccount={(filename) => setBankAddSourceFile(filename)}
                onDataSourceUpdated={refreshBankData}
                onRefresh={refreshBankData}
                selectedId={selectedBankCSVId}
                onSelect={handleSelectBankCSV}
              />
            </div>
            {/* Bank Data Source Preview */}
            <BankDataSourcePreviewSection
              dataSource={selectedBankDataSource}
              previewData={bankPreviewData}
              previewLoading={bankPreviewLoading}
              previewTotal={bankPreviewTotal}
              previewColumns={previewColumns}
              previewVisibleColumns={bankPreviewVisibleColumns}
              previewColumnSelectorOpen={bankPreviewColumnSelectorOpen}
              onToggleColumnSelector={() => setBankPreviewColumnSelectorOpen(!bankPreviewColumnSelectorOpen)}
              onToggleColumn={toggleBankPreviewColumn}
            />
          </div>
        )}

        {activeTab === "credit" && (
          <div className="space-y-6" onClick={handleCreditTabClick}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" onClick={handleCreditTabClick}>
              <CreditCardsSection
                cards={creditCards}
                onSave={handleCreditCardSave}
                initialAddSourceFile={creditAddSourceFile}
                onAddingStateChange={(isAdding) => {
                  if (!isAdding) setCreditAddSourceFile(null)
                }}
              />
              <CreditCardDataSources
                dataSources={ccDataSources}
                cards={creditCards}
                selectedArtifactId={selectedArtifactId}
                onSelectArtifact={handleSelectArtifact}
                onCardUpdated={refreshCreditData}
                onLoadArtifact={handleLoadArtifacts}
                onUnloadArtifact={handleUnloadArtifacts}
                onDeleteArtifact={handleDeleteArtifact}
                onRefresh={refreshCreditData}
              />
            </div>
            <DataSourcePreviewSection
              dataSource={selectedCcDataSource}
              previewData={previewData}
              previewLoading={previewLoading}
              previewTotal={previewTotal}
              previewColumns={previewColumns}
              previewVisibleColumns={previewVisibleColumns}
              previewColumnSelectorOpen={previewColumnSelectorOpen}
              onToggleColumnSelector={() => setPreviewColumnSelectorOpen(!previewColumnSelectorOpen)}
              onToggleColumn={togglePreviewColumn}
            />
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}
