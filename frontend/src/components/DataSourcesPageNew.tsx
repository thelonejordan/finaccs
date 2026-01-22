import React, { useState, useEffect, useCallback, useRef } from "react"
import {
  DatabaseIcon,
  PlayIcon,
  PauseIcon,
  Loader2Icon,
  Trash2Icon,
  EyeOffIcon,
  EyeIcon,
  ToggleLeftIcon,
  ToggleRightIcon,
  CreditCardIcon,
  BuildingIcon,
} from "lucide-react"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import {
  StatusBadge,
  VisibilityDropdown,
  BulkActionBar,
  ConfirmDialog,
  DomainEntitySelector,
  type VisibilityFilter,
  type BulkAction,
} from "@/components/extraction"
import {
  fetchDataSourcesNew,
  bulkUpdateDataSourcesNew,
  updateDataSourceNew,
  loadDataSourceNew,
  unloadDataSourceNew,
  previewDataSourceNew,
  fetchBankAccounts,
  fetchCreditCards,
  type DataSourceArtifactNew,
  type BankAccount,
  type CreditCard,
} from "@/lib/api"

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

type DomainFilter = 'all' | 'bank_account_transactions' | 'credit_card_transactions'

export function DataSourcesPageNew() {
  const [dataSources, setDataSources] = useState<DataSourceArtifactNew[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [creditCards, setCreditCards] = useState<CreditCard[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Filters
  const [visibility, setVisibility] = useState<VisibilityFilter>('visible')
  const [domainFilter, setDomainFilter] = useState<DomainFilter>('all')

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // Loading states
  const [loadingId, setLoadingId] = useState<number | null>(null)

  // Confirm dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    action: () => void
    variant?: 'default' | 'danger'
  }>({ open: false, title: '', description: '', action: () => {} })

  // Entity assignment dialog
  const [assignDialog, setAssignDialog] = useState<{
    open: boolean
    type: 'bank_account' | 'credit_card'
    ids: number[]
  } | null>(null)
  const [assignValue, setAssignValue] = useState<number | null>(null)

  // Preview state
  const [previewArtifactId, setPreviewArtifactId] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<{
    data: Record<string, unknown>[]
    columns: string[]
    total: number
  } | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // Click outside to close preview
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (previewArtifactId !== null && listRef.current && !listRef.current.contains(event.target as Node)) {
        setPreviewArtifactId(null)
        setPreviewData(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [previewArtifactId])

  const loadData = useCallback(async () => {
    try {
      const [dsRes, accountsRes, cardsRes] = await Promise.all([
        fetchDataSourcesNew({
          visibility,
          domain: domainFilter === 'all' ? undefined : domainFilter,
        }),
        fetchBankAccounts(),
        fetchCreditCards(),
      ])
      setDataSources(dsRes.data)
      setBankAccounts(accountsRes.accounts)
      setCreditCards(cardsRes.cards)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setIsLoading(false)
    }
  }, [visibility, domainFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSelectAll = () => {
    if (selectedIds.size === dataSources.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(dataSources.map(ds => ds.id)))
    }
  }

  const handleSelect = (id: number) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  const handleLoad = async (ds: DataSourceArtifactNew) => {
    setLoadingId(ds.id)
    try {
      const result = await loadDataSourceNew(ds.artifact_id)
      if (!result.success) {
        alert(result.error || 'Load failed')
      }
      await loadData()
    } finally {
      setLoadingId(null)
    }
  }

  const handleUnload = async (ds: DataSourceArtifactNew) => {
    setConfirmDialog({
      open: true,
      title: 'Unload Data Source',
      description: `This will delete all ${ds.row_count} transactions loaded from this data source. The artifact will be preserved for reloading. Continue?`,
      variant: 'danger',
      action: async () => {
        setLoadingId(ds.id)
        setConfirmDialog(prev => ({ ...prev, open: false }))
        try {
          const result = await unloadDataSourceNew(ds.artifact_id)
          if (!result.success) {
            alert(result.error || 'Unload failed')
          }
          await loadData()
        } finally {
          setLoadingId(null)
        }
      },
    })
  }

  const handleToggleEnabled = async (ds: DataSourceArtifactNew) => {
    await updateDataSourceNew(ds.artifact_id, { enabled: !ds.enabled })
    await loadData()
  }

  const handleEntityChange = async (ds: DataSourceArtifactNew, entityId: number | null) => {
    if (ds.data_source_target === 'bank_account_transactions') {
      await updateDataSourceNew(ds.artifact_id, { bank_account_id: entityId })
    } else {
      await updateDataSourceNew(ds.artifact_id, { credit_card_id: entityId })
    }
    await loadData()
  }

  const handleBulkAction = async (action: string) => {
    const ids = Array.from(selectedIds)

    if (action === 'delete') {
      setConfirmDialog({
        open: true,
        title: 'Delete Data Sources',
        description: `Are you sure you want to delete ${ids.length} data source(s)? This will also delete all associated transactions. This action cannot be undone.`,
        variant: 'danger',
        action: async () => {
          await bulkUpdateDataSourcesNew(ids, 'delete')
          await loadData()
          setSelectedIds(new Set())
          setConfirmDialog(prev => ({ ...prev, open: false }))
        },
      })
    } else if (action === 'load' || action === 'unload') {
      if (action === 'unload') {
        setConfirmDialog({
          open: true,
          title: 'Unload Data Sources',
          description: `This will delete all transactions loaded from ${ids.length} data source(s). Continue?`,
          variant: 'danger',
          action: async () => {
            await bulkUpdateDataSourcesNew(ids, action)
            await loadData()
            setSelectedIds(new Set())
            setConfirmDialog(prev => ({ ...prev, open: false }))
          },
        })
      } else {
        await bulkUpdateDataSourcesNew(ids, action)
        await loadData()
        setSelectedIds(new Set())
      }
    } else if (action === 'assign_bank_account') {
      setAssignDialog({ open: true, type: 'bank_account', ids })
      setAssignValue(null)
    } else if (action === 'assign_credit_card') {
      setAssignDialog({ open: true, type: 'credit_card', ids })
      setAssignValue(null)
    } else {
      await bulkUpdateDataSourcesNew(ids, action as 'hide' | 'unhide' | 'enable' | 'disable')
      await loadData()
      setSelectedIds(new Set())
    }
  }

  const handleAssignConfirm = async () => {
    if (!assignDialog) return
    const action = assignDialog.type === 'bank_account' ? 'set_bank_account' : 'set_credit_card'
    await bulkUpdateDataSourcesNew(assignDialog.ids, action, assignValue ?? undefined)
    await loadData()
    setSelectedIds(new Set())
    setAssignDialog(null)
  }

  const handlePreviewArtifact = async (artifactId: string) => {
    if (previewArtifactId === artifactId) {
      // Toggle off
      setPreviewArtifactId(null)
      setPreviewData(null)
      return
    }

    setPreviewArtifactId(artifactId)
    setIsLoadingPreview(true)
    try {
      const result = await previewDataSourceNew(artifactId, 10)
      setPreviewData({
        data: result.data,
        columns: result.columns,
        total: result.total,
      })
    } catch (error) {
      console.error('Failed to load preview:', error)
      setPreviewData(null)
    } finally {
      setIsLoadingPreview(false)
    }
  }

  const bulkActions: BulkAction[] = [
    { label: 'Load', icon: <PlayIcon className="h-4 w-4" />, action: 'load' },
    { label: 'Unload', icon: <PauseIcon className="h-4 w-4" />, action: 'unload' },
    { label: 'Enable', icon: <ToggleRightIcon className="h-4 w-4" />, action: 'enable' },
    { label: 'Disable', icon: <ToggleLeftIcon className="h-4 w-4" />, action: 'disable' },
    { label: 'Assign Bank Account', icon: <BuildingIcon className="h-4 w-4" />, action: 'assign_bank_account' },
    { label: 'Assign Credit Card', icon: <CreditCardIcon className="h-4 w-4" />, action: 'assign_credit_card' },
    { label: 'Hide', icon: <EyeOffIcon className="h-4 w-4" />, action: 'hide' },
    { label: 'Unhide', icon: <EyeIcon className="h-4 w-4" />, action: 'unhide' },
    { label: 'Delete', icon: <Trash2Icon className="h-4 w-4" />, action: 'delete', variant: 'danger' },
  ]

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/40">
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-6 flex justify-center items-center h-96">
          <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold text-foreground">
          Data Sources (New)
        </h1>

        <div className="bg-card rounded-xl border border-border shadow-sm">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <DatabaseIcon className="h-5 w-5" />
                Data Source Artifacts
              </h2>
              <VisibilityDropdown value={visibility} onChange={setVisibility} />
            </div>

            {/* Domain tabs */}
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setDomainFilter('all')}
                className={`px-4 py-2 text-sm font-medium ${
                  domainFilter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-card text-foreground hover:bg-accent'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setDomainFilter('bank_account_transactions')}
                className={`px-4 py-2 text-sm font-medium border-l border-border ${
                  domainFilter === 'bank_account_transactions'
                    ? 'bg-blue-600 text-white'
                    : 'bg-card text-foreground hover:bg-accent'
                }`}
              >
                <BuildingIcon className="h-4 w-4 inline mr-1" />
                Bank
              </button>
              <button
                onClick={() => setDomainFilter('credit_card_transactions')}
                className={`px-4 py-2 text-sm font-medium border-l border-border ${
                  domainFilter === 'credit_card_transactions'
                    ? 'bg-blue-600 text-white'
                    : 'bg-card text-foreground hover:bg-accent'
                }`}
              >
                <CreditCardIcon className="h-4 w-4 inline mr-1" />
                Credit Card
              </button>
            </div>
          </div>

          <BulkActionBar
            selectedCount={selectedIds.size}
            actions={bulkActions}
            onAction={handleBulkAction}
            onClearSelection={() => setSelectedIds(new Set())}
          />

          <div ref={listRef} className="divide-y divide-border">
            {dataSources.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No data source artifacts found. Transform extraction artifacts to create data sources.
              </div>
            ) : (
              <>
                <div className="px-4 py-2 bg-muted flex items-center gap-4 text-xs font-medium text-muted-foreground uppercase">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === dataSources.length && dataSources.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-border"
                  />
                  <span className="flex-1">Artifact</span>
                  <span className="w-20">Type</span>
                  <span className="w-36">Entity</span>
                  <span className="w-16 text-right">Rows</span>
                  <span className="w-20">Status</span>
                  <span className="w-16">Enabled</span>
                  <span className="w-16">Actions</span>
                  <span className="w-24">Loaded</span>
                </div>

                {dataSources.map(ds => (
                  <React.Fragment key={ds.id}>
                    <div
                      onClick={() => handlePreviewArtifact(ds.artifact_id)}
                      className={`px-4 py-3 flex items-center gap-4 hover:bg-accent cursor-pointer ${
                        ds.hidden ? 'opacity-50' : ''
                      } ${!ds.enabled ? 'bg-background/30' : ''} ${
                        previewArtifactId === ds.artifact_id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(ds.id)}
                        onChange={() => handleSelect(ds.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-border"
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium font-mono text-foreground">
                            {ds.artifact_id}
                          </span>
                          {ds.hidden && (
                            <EyeOffIcon className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {ds.source_artifact_type}
                          {ds.source_artifact_key && (
                            <span className="text-muted-foreground dark:text-muted-foreground"> ({ds.source_artifact_key})</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground dark:text-muted-foreground truncate" title={ds.source_filename}>
                          {ds.source_filename}
                        </div>
                      </div>

                      <span className={`w-20 text-xs px-2 py-1 rounded ${
                        ds.data_source_target === 'bank_account_transactions'
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                          : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                      }`}>
                        {ds.data_source_target === 'bank_account_transactions' ? 'Bank' : 'CC'}
                      </span>

                      <div className="w-36" onClick={(e) => e.stopPropagation()}>
                        <DomainEntitySelector
                          type={ds.data_source_target === 'bank_account_transactions' ? 'bank_account' : 'credit_card'}
                          value={ds.bank_account_id || ds.credit_card_id}
                          onChange={(value) => handleEntityChange(ds, value)}
                          bankAccounts={bankAccounts}
                          creditCards={creditCards}
                          placeholder="Unassigned"
                        />
                      </div>

                      <span className="w-16 text-sm text-muted-foreground text-right">
                        {ds.row_count}
                      </span>

                      <div className="w-20">
                        <StatusBadge status={ds.status} />
                      </div>

                      <div className="w-16" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleToggleEnabled(ds)}
                          className={`p-1.5 rounded ${
                            ds.enabled
                              ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30'
                              : 'text-muted-foreground hover:bg-accent'
                          }`}
                          title={ds.enabled ? 'Disable' : 'Enable'}
                        >
                          {ds.enabled ? (
                            <ToggleRightIcon className="h-5 w-5" />
                          ) : (
                            <ToggleLeftIcon className="h-5 w-5" />
                          )}
                        </button>
                      </div>

                      <div className="w-16" onClick={(e) => e.stopPropagation()}>
                        {ds.status === 'loaded' ? (
                          <button
                            onClick={() => handleUnload(ds)}
                            disabled={loadingId === ds.id}
                            className="p-1.5 rounded text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 disabled:opacity-50"
                            title="Unload"
                          >
                            {loadingId === ds.id ? (
                              <Loader2Icon className="h-4 w-4 animate-spin" />
                            ) : (
                              <PauseIcon className="h-4 w-4" />
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleLoad(ds)}
                            disabled={loadingId === ds.id || !ds.bank_account_id && !ds.credit_card_id}
                            className="p-1.5 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 disabled:opacity-50"
                            title={!ds.bank_account_id && !ds.credit_card_id ? 'Assign entity first' : 'Load'}
                          >
                            {loadingId === ds.id ? (
                              <Loader2Icon className="h-4 w-4 animate-spin" />
                            ) : (
                              <PlayIcon className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>

                      <span className="w-24 text-xs text-muted-foreground" title={ds.loaded_at ? `Loaded: ${ds.loaded_at}` : ''}>
                        {ds.loaded_at ? formatDate(ds.loaded_at) : '-'}
                      </span>
                    </div>

                    {/* Preview Row */}
                    {previewArtifactId === ds.artifact_id && (
                      <div className="px-4 py-4 bg-background/30 border-t border-border">
                        {isLoadingPreview ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2Icon className="h-5 w-5 animate-spin text-muted-foreground" />
                            <span className="ml-2 text-muted-foreground">Loading preview...</span>
                          </div>
                        ) : previewData ? (
                          <div className="overflow-x-auto border border-border rounded">
                            <table className="min-w-full text-xs">
                              <thead className="bg-muted">
                                <tr>
                                  {previewData.columns.map(col => (
                                    <th key={col} className="px-2 py-1.5 text-left font-medium text-muted-foreground uppercase whitespace-nowrap">
                                      {col}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {previewData.data.map((row, i) => (
                                  <tr key={i} className="hover:bg-accent bg-card/50">
                                    {previewData.columns.map(col => (
                                      <td key={col} className="px-2 py-1.5 text-foreground whitespace-nowrap">
                                        {String(row[col] ?? '')}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {previewData.total > previewData.data.length && (
                              <div className="px-2 py-1.5 text-xs text-muted-foreground bg-muted border-t border-border">
                                Showing {previewData.data.length} of {previewData.total} rows
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-4 text-muted-foreground">
                            Preview not available
                          </div>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </>
            )}
          </div>
        </div>
      </main>

      <Footer />

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.action}
      />

      {/* Assign Entity Dialog */}
      {assignDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-card rounded-xl border border-border shadow-sm-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Assign {assignDialog.type === 'bank_account' ? 'Bank Account' : 'Credit Card'}
            </h3>
            <div className="mb-6">
              <DomainEntitySelector
                type={assignDialog.type}
                value={assignValue}
                onChange={setAssignValue}
                bankAccounts={bankAccounts}
                creditCards={creditCards}
                allowClear={false}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setAssignDialog(null)}
                className="px-4 py-2 text-sm font-medium rounded-md border border-border text-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignConfirm}
                disabled={assignValue === null}
                className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Assign to {assignDialog.ids.length} item(s)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
