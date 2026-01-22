import { useState, useEffect } from "react"
import {
  FileTextIcon,
  PlayIcon,
  Loader2Icon,
  CheckCircleIcon,
  XCircleIcon,
  TableIcon,
  LandmarkIcon,
  CalendarIcon,
  HashIcon,
  ChevronRightIcon,
  RefreshCwIcon,
  FileArchiveIcon,
  AlertCircleIcon,
  LockIcon,
  LockKeyholeIcon,
  EyeOffIcon,
  EyeIcon,
  DownloadIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import * as Dialog from "@radix-ui/react-dialog"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import {
  // Legacy APIs
  fetchBankSourceFiles,
  fetchBankAccounts,
  triggerBankExtraction,
  loadExtractedCSVs,
  getBankExtractedCSVUrl,
  toggleBankExtractionHidden,
  deleteBankExtraction,
  syncBankSourceFiles,
  // New (experimental) APIs
  fetchSourceFilesNew,
  fetchExtractionsNew,
  fetchDataSourcesNew,
  extractSourceFileNew,
  loadDataSourceNew,
  deleteExtractionNew,
  refreshSourceFilesNew,
  previewArtifactNew,
  previewDataSourceNew,
  updateExtractionNew,
  type SourceFileNew,
  type ExtractionNew,
  type DataSourceArtifactNew,
  type BankSourceFile,
  type ExtractedCSV,
} from "@/lib/api"
import { useInconsistencyCache } from "@/lib/inconsistency-cache"
import { useStoryCache } from "@/lib/story-cache"

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function StatusBadge({ status }: { status: ExtractedCSV['status'] }) {
  const styles: Record<ExtractedCSV['status'], string> = {
    extracted: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
    transformed: "bg-purple-500/20 text-purple-600 dark:text-purple-400",
    loading: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
    loaded: "bg-green-500/20 text-green-600 dark:text-green-400",
    error: "bg-red-500/20 text-red-600 dark:text-red-400",
  }
  const icons: Record<ExtractedCSV['status'], React.ReactNode> = {
    extracted: <CheckCircleIcon className="h-3 w-3" />,
    transformed: <CheckCircleIcon className="h-3 w-3" />,
    loading: <Loader2Icon className="h-3 w-3 animate-spin" />,
    loaded: <CheckCircleIcon className="h-3 w-3" />,
    error: <XCircleIcon className="h-3 w-3" />,
  }
  const labels: Record<ExtractedCSV['status'], string> = {
    extracted: "Extracted",
    transformed: "Ready",
    loading: "Loading...",
    loaded: "Loaded",
    error: "Error",
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {icons[status]}
      {labels[status]}
    </span>
  )
}

// Bank Source Files Section
function BankSourceFilesSection({
  files,
  onExtract,
  extractingId,
  onPasswordNeeded,
  passwordNeededFileId,
  highlightedFileId,
}: {
  files: BankSourceFile[]
  onExtract: (fileId: number, password?: string) => void
  extractingId: number | null
  onPasswordNeeded: (fileId: number | null) => void
  passwordNeededFileId: number | null
  highlightedFileId: number | null
}) {
  const [passwordFileId, setPasswordFileId] = useState<number | null>(null)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isUpdateMode, setIsUpdateMode] = useState(false)

  // Show password input when extraction fails due to password protection
  useEffect(() => {
    if (passwordNeededFileId !== null) {
      setPasswordFileId(passwordNeededFileId)
      setPassword('')
      setShowPassword(false)
      setIsUpdateMode(false)
      onPasswordNeeded(null)
    }
  }, [passwordNeededFileId, onPasswordNeeded])

  const handleExtract = (fileId: number) => {
    if (passwordFileId === fileId && password) {
      onExtract(fileId, password)
      setPasswordFileId(null)
      setPassword('')
      setShowPassword(false)
      setIsUpdateMode(false)
    } else {
      onExtract(fileId)
    }
  }

  const handlePasswordPrompt = (fileId: number, file: BankSourceFile) => {
    setPasswordFileId(fileId)
    setPassword(file.has_password ? file.pipeline_password : '')
    setShowPassword(false)
    setIsUpdateMode(file.has_password)
  }

  const handleCancelPassword = () => {
    setPasswordFileId(null)
    setPassword('')
    setShowPassword(false)
    setIsUpdateMode(false)
  }

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="p-6 pb-3">
        <h3 className="font-semibold flex items-center gap-2 text-lg">
          <div className="p-1.5 rounded-lg bg-muted">
            <FileTextIcon className="h-5 w-5 text-muted-foreground" />
          </div>
          Source Files
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Bank statement files available for extraction
        </p>
      </header>
      <div className="relative">
        <div className="p-6 pt-0 max-h-[400px] overflow-y-auto">
          {files.length === 0 ? (
            <div className="text-center py-8 rounded-xl bg-gradient-to-br from-muted/50 to-transparent border border-border">
              <div className="p-3 rounded-full bg-muted w-fit mx-auto mb-3">
                <FileTextIcon className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium">No source files found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Upload bank statement files using the upload button
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className={`p-3 rounded-lg border transition-all ${
                    highlightedFileId === file.id
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-border hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <FileTextIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm truncate">{file.filename}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        {file.extractor && (
                          <span className="px-1.5 py-0.5 rounded bg-muted font-medium">
                            {file.extractor}
                          </span>
                        )}
                        {file.bank_account && (
                          <span className="flex items-center gap-1">
                            <LandmarkIcon className="h-3 w-3" />
                            {file.bank_account.nickname}
                          </span>
                        )}
                        {file.extractions_count > 0 && (
                          <span className="flex items-center gap-1">
                            <HashIcon className="h-3 w-3" />
                            {file.extractions_count} extraction{file.extractions_count !== 1 ? 's' : ''}
                          </span>
                        )}
                        {file.last_extracted && (
                          <span className="flex items-center gap-1">
                            <CalendarIcon className="h-3 w-3" />
                            {formatDate(file.last_extracted)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Only show lock icon for files that might need password (PDF, XLSX) or already have one */}
                      {(() => {
                        const ext = file.filename.split('.').pop()?.toLowerCase()
                        const mightNeedPassword = ext === 'pdf' || ext === 'xlsx' || file.has_password
                        if (!mightNeedPassword) return null

                        if (passwordFileId === file.id) {
                          return (
                            <button
                              onClick={handleCancelPassword}
                              className="px-2 py-1.5 text-sm rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                            >
                              Cancel
                            </button>
                          )
                        }
                        return (
                          <button
                            onClick={() => handlePasswordPrompt(file.id, file)}
                            className={`p-1.5 rounded-lg hover:bg-muted transition-colors ${
                              file.has_password ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                            }`}
                            title={file.has_password ? "Password saved in pipeline - Click to update" : "Set password for extraction"}
                          >
                            {file.has_password ? (
                              <LockKeyholeIcon className="h-4 w-4" />
                            ) : (
                              <LockIcon className="h-4 w-4" />
                            )}
                          </button>
                        )
                      })()}
                      <button
                        onClick={() => handleExtract(file.id)}
                        disabled={!file.has_data || extractingId === file.id}
                        className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {extractingId === file.id ? (
                          <>
                            <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                            Extracting...
                          </>
                        ) : (
                          <>
                            <PlayIcon className="h-3.5 w-3.5" />
                            Extract
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  {passwordFileId === file.id && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <div className="flex items-center gap-2">
                        {isUpdateMode ? (
                          <LockKeyholeIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
                        ) : (
                          <LockIcon className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div className="relative flex-1">
                          <input
                            type={showPassword ? "text" : "password"}
                            placeholder={isUpdateMode ? "Update or use existing password" : "PDF Password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && password) {
                                handleExtract(file.id)
                              }
                            }}
                            className="w-full px-3 py-1.5 pr-10 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                            title={showPassword ? "Hide password" : "Show password"}
                          >
                            {showPassword ? (
                              <EyeOffIcon className="h-3.5 w-3.5" />
                            ) : (
                              <EyeIcon className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                        <button
                          onClick={() => handleExtract(file.id)}
                          disabled={!password || extractingId === file.id}
                          className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {extractingId === file.id ? (
                            <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <PlayIcon className="h-3.5 w-3.5" />
                          )}
                          Extract
                        </button>
                      </div>
                      {isUpdateMode && (
                        <p className="text-xs text-muted-foreground mt-1.5 ml-6">
                          Password is loaded from the pipeline. You can modify it for this extraction.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-card to-transparent pointer-events-none rounded-b-xl" />
      </div>
    </section>
  )
}

// Extractions List Section
function ExtractionsListSection({
  extractions,
  selectedId,
  onSelect,
  onLoad,
  loadingIds,
  showHidden,
  onToggleShowHidden,
  onHide,
  onDelete,
}: {
  extractions: ExtractedCSV[]
  selectedId: number | null
  onSelect: (id: number) => void
  onLoad: (ids: number[]) => void
  loadingIds: Set<number>
  showHidden: boolean
  onToggleShowHidden: () => void
  onHide: (id: number, hidden: boolean) => void
  onDelete: (extraction: ExtractedCSV) => void
}) {
  const hiddenCount = extractions.filter(e => e.hidden).length
  const visibleExtractions = showHidden ? extractions : extractions.filter(e => !e.hidden)

  // Count extractions ready to load (both 'extracted' and 'transformed' can be loaded)
  const readyToLoadCount = visibleExtractions.filter(e => e.status === 'extracted' || e.status === 'transformed').length

  const handleLoadAll = () => {
    const ids = visibleExtractions.filter(e => e.status === 'extracted' || e.status === 'transformed').map(e => e.id)
    if (ids.length > 0) {
      onLoad(ids)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="p-6 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold flex items-center gap-2 text-lg">
              <div className="p-1.5 rounded-lg bg-muted">
                <FileArchiveIcon className="h-5 w-5 text-muted-foreground" />
              </div>
              Extractions
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Extracted CSV data from bank statements
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hiddenCount > 0 && (
              <button
                onClick={onToggleShowHidden}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                  showHidden
                    ? "bg-muted text-foreground"
                    : "bg-muted/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                {showHidden ? <EyeIcon className="h-3.5 w-3.5" /> : <EyeOffIcon className="h-3.5 w-3.5" />}
                {hiddenCount} hidden
              </button>
            )}
            {readyToLoadCount > 0 && (
              <button
                onClick={handleLoadAll}
                disabled={loadingIds.size > 0}
                className="px-3 py-1.5 text-xs rounded-lg font-medium transition-colors flex items-center gap-1.5 bg-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingIds.size > 0 ? (
                  <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircleIcon className="h-3.5 w-3.5" />
                )}
                Load {readyToLoadCount} to DB
              </button>
            )}
          </div>
        </div>
      </header>
      <div className="relative">
        <div className="p-6 pt-0 max-h-[400px] overflow-y-auto">
          {visibleExtractions.length === 0 ? (
            <div className="text-center py-8 rounded-xl bg-gradient-to-br from-muted/50 to-transparent border border-border">
              <div className="p-3 rounded-full bg-muted w-fit mx-auto mb-3">
                <FileArchiveIcon className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium">No extractions yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Extract a source file to see results here
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleExtractions.map((ext) => (
                <div
                  key={ext.id}
                  onClick={() => onSelect(ext.id)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedId === ext.id
                      ? "border-primary bg-primary/5 shadow-sm"
                      : ext.hidden
                        ? "border-border/50 bg-muted/30 opacity-60"
                        : "border-border hover:border-border hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <TableIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-sm truncate">{ext.name}</p>
                        <StatusBadge status={ext.status} />
                        {ext.hidden && (
                          <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-xs font-medium flex items-center gap-1">
                            <EyeOffIcon className="h-3 w-3" />
                            Hidden
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <FileTextIcon className="h-3 w-3" />
                          {ext.source_filename}
                        </span>
                        {ext.extracted_at && (
                          <span className="flex items-center gap-1">
                            <CalendarIcon className="h-3 w-3" />
                            {formatDate(ext.extracted_at)}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <HashIcon className="h-3 w-3" />
                          {ext.row_count} rows
                        </span>
                        {ext.artifacts && ext.artifacts.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {ext.artifacts.map(a => (
                              <span
                                key={a.artifact_id}
                                className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs"
                                title={`${a.artifact_id} (${a.row_count} rows)`}
                              >
                                {a.artifact_type.replace(/_/g, ' ')}
                                {a.artifact_key && <span className="ml-1 opacity-70">({a.artifact_key})</span>}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {ext.status === 'error' && ext.error_message && (
                        <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                          <AlertCircleIcon className="h-3 w-3" />
                          {ext.error_message}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {(ext.status === 'extracted' || ext.status === 'transformed') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onLoad([ext.id])
                          }}
                          disabled={loadingIds.has(ext.id)}
                          className="px-2.5 py-1 text-xs rounded-lg font-medium transition-colors bg-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
                        >
                          {loadingIds.has(ext.id) ? (
                            <Loader2Icon className="h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircleIcon className="h-3 w-3" />
                          )}
                          Load
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onHide(ext.id, !ext.hidden)
                        }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title={ext.hidden ? "Unhide" : "Hide"}
                      >
                        {ext.hidden ? <EyeIcon className="h-3.5 w-3.5" /> : <EyeOffIcon className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(ext)
                        }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        title="Delete"
                      >
                        <Trash2Icon className="h-3.5 w-3.5" />
                      </button>
                      <ChevronRightIcon className={`h-4 w-4 text-muted-foreground transition-transform ${selectedId === ext.id ? 'rotate-90' : ''}`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-card to-transparent pointer-events-none rounded-b-xl" />
      </div>
    </section>
  )
}

// Column selector component
function ColumnSelector({
  columns,
  visibleColumns,
  onToggle,
}: {
  columns: string[]
  visibleColumns: Set<string>
  onToggle: (column: string) => void
}) {
  const [open, setOpen] = useState(false)

  if (columns.length <= 1) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-2 py-1 text-xs rounded border border-border hover:bg-muted transition-colors flex items-center gap-1"
      >
        <SettingsIcon className="h-3 w-3" />
        Columns ({visibleColumns.size}/{columns.length})
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-card border border-border rounded-lg shadow-lg p-2 min-w-[160px] max-h-[300px] overflow-auto">
            {columns.map((col) => (
              <label
                key={col}
                className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={visibleColumns.has(col)}
                  onChange={() => onToggle(col)}
                  className="rounded border-border"
                />
                <span className="truncate">{col}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Artifact Preview Panel
function ArtifactPreviewSection({
  extraction,
  source = 'legacy',
  dataSourcesNewRaw = [],
}: {
  extraction: ExtractedCSV | null
  source?: 'legacy' | 'experimental'
  dataSourcesNewRaw?: DataSourceArtifactNew[]
}) {
  const [previewData, setPreviewData] = useState<{
    data: Record<string, string>[]
    total: number
    columns: string[]
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set())
  const [activeArtifact, setActiveArtifact] = useState<string | null>(null)
  const [previewLimit] = useState<number>(50) // Limit rows shown in preview

  // Get available artifacts
  const artifacts = extraction?.artifacts || []

  // Get current artifact - handles fallback to first artifact
  const currentArtifact = artifacts.find(a => a.artifact_id === activeArtifact)
    || (artifacts.length > 0 && !activeArtifact ? artifacts[0] : undefined)

  // Auto-select first artifact when extraction changes
  useEffect(() => {
    if (artifacts.length > 0) {
      // If current artifact not in list, select first one
      if (!activeArtifact || !artifacts.find(a => a.artifact_id === activeArtifact)) {
        setActiveArtifact(artifacts[0].artifact_id)
      }
    } else {
      setActiveArtifact(null)
    }
  }, [extraction?.id, artifacts.length])

  // Load preview when extraction or artifact changes
  useEffect(() => {
    if (!extraction) {
      setPreviewData(null)
      return
    }

    const extractionId = extraction.id
    const limit = previewLimit

    async function loadPreview() {
      setLoading(true)
      try {
        if (source === 'experimental') {
          // For experimental, need an active artifact to preview
          if (!activeArtifact) {
            setPreviewData(null)
            setLoading(false)
            return
          }
          // Find the data source artifact for this extraction artifact
          const dsArtifact = dataSourcesNewRaw.find(ds => ds.source_artifact_id === activeArtifact)
          if (dsArtifact) {
            // Preview the data source artifact (uses /api/extractions/data-sources/{id}/preview/)
            const result = await previewDataSourceNew(dsArtifact.artifact_id, limit)
            setPreviewData({
              data: result.data as Record<string, string>[],
              total: result.total,
              columns: result.columns || Object.keys(result.data[0] || {}),
            })
            setVisibleColumns(new Set(result.columns || Object.keys(result.data[0] || {})))
          } else {
            // Fall back to previewing the extraction artifact directly (uses /api/extractions/artifacts/{id}/preview/)
            const result = await previewArtifactNew(activeArtifact, limit)
            setPreviewData({
              data: result.data as Record<string, string>[],
              total: result.total ?? 0,
              columns: result.columns || Object.keys((result.data as Record<string, string>[])[0] || {}),
            })
            setVisibleColumns(new Set(result.columns || Object.keys((result.data as Record<string, string>[])[0] || {})))
          }
        } else {
          // Legacy: Pass artifact_id to the API if we have one selected
          const url = activeArtifact
            ? `${import.meta.env.VITE_API_BASE || "http://localhost:8000"}/api/bank-extracted-csvs/${extractionId}/preview/?artifact_id=${activeArtifact}&limit=${limit}`
            : `${import.meta.env.VITE_API_BASE || "http://localhost:8000"}/api/bank-extracted-csvs/${extractionId}/preview/?limit=${limit}`
          const res = await fetch(url)
          const data = await res.json()
          setPreviewData(data)
          setVisibleColumns(new Set(data.columns))
        }
      } catch (error) {
        console.error("Failed to load preview:", error)
        setPreviewData(null)
      } finally {
        setLoading(false)
      }
    }

    loadPreview()
  }, [extraction?.id, activeArtifact, source, dataSourcesNewRaw, previewLimit])

  const toggleColumn = (column: string) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev)
      if (next.has(column)) {
        if (next.size > 1) next.delete(column)
      } else {
        next.add(column)
      }
      return next
    })
  }

  // Helper to get short ID from artifact_id (e.g., "ext_art_abc12345" -> "abc12345")
  const getShortId = (artifactId: string) => artifactId.replace('ext_art_', '').replace('artifact_', '')

  // Get download URL (with artifact_id if selected)
  const getDownloadUrl = () => {
    const baseUrl = getBankExtractedCSVUrl(extraction!.id)
    return activeArtifact ? `${baseUrl}?artifact_id=${activeArtifact}` : baseUrl
  }

  if (!extraction) {
    return (
      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="p-6">
          <div className="text-center py-12 rounded-xl bg-gradient-to-br from-muted/50 to-transparent border border-border">
            <div className="p-3 rounded-full bg-muted w-fit mx-auto mb-3">
              <TableIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium">No extraction selected</p>
            <p className="text-sm text-muted-foreground mt-1">
              Select an extraction above to preview data
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="p-6 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold flex items-center gap-2 text-lg">
              <div className="p-1.5 rounded-lg bg-muted">
                <TableIcon className="h-5 w-5 text-muted-foreground" />
              </div>
              Artifact Preview
            </h3>
            <p className="text-sm text-muted-foreground mt-1 font-mono truncate">
              {extraction.name}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {previewData && previewData.columns.length > 0 && (
              <ColumnSelector
                columns={previewData.columns}
                visibleColumns={visibleColumns}
                onToggle={toggleColumn}
              />
            )}
            <a
              href={getDownloadUrl()}
              className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted transition-colors inline-flex items-center gap-1.5 font-medium shrink-0"
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              Download
            </a>
          </div>
        </div>

        {/* Artifact Type Tabs */}
        {artifacts.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {artifacts.map((artifact) => {
              // Use currentArtifact for highlighting since it handles fallback to first artifact
              const isActive = currentArtifact?.artifact_id === artifact.artifact_id
              return (
                <button
                  key={artifact.artifact_id}
                  onClick={() => setActiveArtifact(artifact.artifact_id)}
                  className={`group relative px-3 py-2 text-sm rounded-lg border transition-all flex items-center gap-2 ${
                    isActive
                      ? "bg-primary/10 border-primary/50 text-foreground"
                      : "bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${
                    isActive
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground group-hover:text-foreground"
                  }`}>
                    {artifact.artifact_type.replace(/_/g, ' ')}
                  </span>
                  {artifact.artifact_key && (
                    <span className={`font-mono text-xs ${
                      isActive
                        ? "text-foreground/70"
                        : "text-muted-foreground/70"
                    }`}>
                      {artifact.artifact_key}
                    </span>
                  )}
                  <span className={`font-mono text-xs ${
                    isActive
                      ? "text-foreground/50"
                      : "text-muted-foreground/50"
                  }`}>
                    {getShortId(artifact.artifact_id)}
                  </span>
                  {artifact.row_count > 0 && (
                    <span className={`text-xs ${
                      isActive
                        ? "text-primary"
                        : "text-muted-foreground"
                    }`}>
                      ({artifact.row_count})
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </header>

      <div className="p-6 pt-0">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !previewData || previewData.data.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">
            No data found
          </p>
        ) : (
          <>
            <div className="overflow-auto max-h-[500px] border border-border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    {previewData.columns
                      .filter(col => visibleColumns.has(col))
                      .map((col) => (
                        <th
                          key={col}
                          className="text-left py-2 px-3 font-medium text-muted-foreground whitespace-nowrap border-b border-border"
                        >
                          {col}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.data.map((row, rowIdx) => (
                    <tr key={rowIdx} className="border-b border-border/50 hover:bg-muted/30">
                      {previewData.columns
                        .filter(col => visibleColumns.has(col))
                        .map((col) => (
                          <td
                            key={col}
                            className="py-2 px-3 font-mono text-xs whitespace-nowrap"
                          >
                            {row[col] ?? ''}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Showing {previewData.data.length} of {previewData.total} row{previewData.total !== 1 ? 's' : ''}
            </p>
          </>
        )}
      </div>
    </section>
  )
}

// Mapping functions for experimental source
function mapSourceFileNew(sf: SourceFileNew): BankSourceFile {
  return {
    id: sf.id,
    filename: sf.filename,
    pipeline: null,
    bank_account: null,
    extractions_count: sf.extractions?.length ?? 0,
    last_extracted: sf.extractions?.[0]?.extracted_at ?? null,
    has_password: !!sf.password,
    pipeline_password: sf.password,
    file_size: sf.file_size,
    has_data: sf.extraction_status === 'extracted',
    extractor: sf.extractor,
    disabled: false,
  }
}

function mapExtractionNew(ext: ExtractionNew, dataSources: DataSourceArtifactNew[], sourceFiles: SourceFileNew[]): ExtractedCSV {
  const dsArtifacts = dataSources.filter(ds => ds.source_extraction_id === ext.extraction_id)
  const loadedDs = dsArtifacts.find(ds => ds.status === 'loaded')
  const anyDs = dsArtifacts[0]
  // Find the matching source file by its string ID to get the numeric ID for highlighting
  const matchingSourceFile = sourceFiles.find(sf => sf.source_file_id === ext.source_file_id)
  return {
    id: ext.id,
    name: ext.extraction_id,
    source_filename: ext.source_filename,
    source_file_id: matchingSourceFile?.id ?? ext.id,
    status: loadedDs ? 'loaded' : dsArtifacts.length > 0 ? 'transformed' : 'extracted',
    bank_account_id: loadedDs?.bank_account_id ?? anyDs?.bank_account_id ?? null,
    disabled: false,
    hidden: ext.hidden,
    row_count: ext.artifacts?.reduce((sum, a) => sum + a.row_count, 0) ?? 0,
    extracted_at: ext.extracted_at,
    loaded_at: loadedDs?.loaded_at ?? null,
    first_transaction_date: null,
    last_transaction_date: null,
    transaction_count: loadedDs?.row_count ?? 0,
    error_message: ext.error_message,
    artifacts: ext.artifacts?.map(a => ({
      artifact_id: a.artifact_id,
      artifact_type: a.artifact_type,
      artifact_key: a.artifact_key,
      content_type: a.content_format,
      row_count: a.row_count,
      data_hash: a.content_hash,
    })) ?? [],
  }
}

// Main Bank Extractions Page
export function BankExtractionsPage() {
  // Source toggle: 'legacy' or 'experimental'
  const [source, setSource] = useState<'legacy' | 'experimental'>('experimental')

  const [sourceFiles, setSourceFiles] = useState<BankSourceFile[]>([])
  const [extractions, setExtractions] = useState<ExtractedCSV[]>([])
  const [selectedExtractionId, setSelectedExtractionId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [extractingId, setExtractingId] = useState<number | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [passwordNeededFileId, setPasswordNeededFileId] = useState<number | null>(null)
  const [loadingIds, setLoadingIds] = useState<Set<number>>(new Set())
  const [showHidden, setShowHidden] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ExtractedCSV | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Raw data from new APIs (for lookups in handlers)
  const [sourceFilesNewRaw, setSourceFilesNewRaw] = useState<SourceFileNew[]>([])
  const [extractionsNewRaw, setExtractionsNewRaw] = useState<ExtractionNew[]>([])
  const [dataSourcesNewRaw, setDataSourcesNewRaw] = useState<DataSourceArtifactNew[]>([])

  const { invalidate: invalidateInconsistencyCache } = useInconsistencyCache()
  const { invalidate: invalidateStoryCache } = useStoryCache()

  useEffect(() => {
    document.title = "Bank Extractions | FinAccs"
  }, [])

  const loadData = async () => {
    try {
      if (source === 'experimental') {
        const visibility = showHidden ? 'all' : 'visible'
        const [filesRes, extractionsRes, dataSourcesRes] = await Promise.all([
          fetchSourceFilesNew({ domain: 'bank_account', visibility }),
          fetchExtractionsNew({ domain: 'bank_account', visibility }),
          fetchDataSourcesNew({ domain: 'bank_account_transactions', visibility }),
        ])
        // Store raw data for lookups
        setSourceFilesNewRaw(filesRes.data)
        setExtractionsNewRaw(extractionsRes.data)
        setDataSourcesNewRaw(dataSourcesRes.data)
        // Map to legacy interfaces for UI
        setSourceFiles(filesRes.data.map(mapSourceFileNew))
        setExtractions(extractionsRes.data.map(ext => mapExtractionNew(ext, dataSourcesRes.data, filesRes.data)))
      } else {
        const [filesRes, accountsRes] = await Promise.all([
          fetchBankSourceFiles(),
          fetchBankAccounts(),
        ])
        setSourceFiles(filesRes.data)
        setExtractions(accountsRes.extracted_csvs)
      }
    } catch (error) {
      console.error("Failed to load data:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [source])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    if (source === 'experimental') {
      await refreshSourceFilesNew()
    } else {
      await syncBankSourceFiles()
    }
    await loadData()
    setIsRefreshing(false)
  }

  const handleExtract = async (fileId: number, password?: string) => {
    setExtractingId(fileId)
    try {
      if (source === 'experimental') {
        // Find the source file to get its source_file_id (UUID)
        const sf = sourceFilesNewRaw.find(f => f.id === fileId)
        if (!sf) {
          alert("Source file not found")
          return
        }
        const result = await extractSourceFileNew(sf.source_file_id, { password })
        if (result.success && result.extraction) {
          await loadData()
          // Select the new extraction
          setSelectedExtractionId(result.extraction.id)
        } else {
          if (result.needs_password) {
            setPasswordNeededFileId(fileId)
          } else {
            alert(result.error || "Extraction failed")
          }
        }
      } else {
        const result = await triggerBankExtraction(fileId, password)
        if (result.success && result.extraction) {
          await loadData()
          // Find the new extraction and select it
          const newExt = extractions.find(e => e.name === result.extraction?.name)
          if (newExt) {
            setSelectedExtractionId(newExt.id)
          }
        } else {
          if (result.needs_password) {
            setPasswordNeededFileId(fileId)
          } else {
            alert(result.error || "Extraction failed")
          }
        }
      }
    } catch (error) {
      console.error("Extraction failed:", error)
      alert("Extraction failed")
    } finally {
      setExtractingId(null)
    }
  }

  const handleLoad = async (ids: number[]) => {
    setLoadingIds(new Set(ids))
    try {
      if (source === 'experimental') {
        // For experimental, find data source artifacts for these extraction IDs and load them
        const failures: string[] = []
        for (const extId of ids) {
          const ext = extractionsNewRaw.find(e => e.id === extId)
          if (!ext) {
            failures.push(`Extraction ${extId} not found`)
            continue
          }
          // Find data source artifacts for this extraction
          const dsArtifacts = dataSourcesNewRaw.filter(ds => ds.source_extraction_id === ext.extraction_id)
          if (dsArtifacts.length === 0) {
            failures.push(`No data sources found for extraction ${ext.extraction_id}`)
            continue
          }
          // Load each data source artifact
          for (const ds of dsArtifacts) {
            if (ds.status !== 'loaded') {
              const result = await loadDataSourceNew(ds.artifact_id)
              if (!result.success) {
                failures.push(result.error || `Failed to load ${ds.artifact_id}`)
              }
            }
          }
        }
        if (failures.length > 0) {
          alert(`Some loads failed:\n${failures.join('\n')}`)
        }
        await loadData()
      } else {
        const result = await loadExtractedCSVs(ids)
        const failures = result.results.filter(r => !r.success)
        if (failures.length > 0) {
          alert(`Some loads failed:\n${failures.map(f => f.message).join('\n')}`)
        }
        await loadData()
      }
    } catch (error) {
      console.error("Load failed:", error)
      alert("Load failed")
    } finally {
      setLoadingIds(new Set())
    }
  }

  const handleHide = async (id: number, hidden: boolean) => {
    try {
      if (source === 'experimental') {
        // Find the extraction to get its extraction_id (UUID)
        const ext = extractionsNewRaw.find(e => e.id === id)
        if (!ext) {
          console.error("Extraction not found")
          return
        }
        await updateExtractionNew(ext.extraction_id, { hidden })
        setExtractions(prev => prev.map(e =>
          e.id === id ? { ...e, hidden } : e
        ))
        invalidateInconsistencyCache()
        invalidateStoryCache()
      } else {
        const result = await toggleBankExtractionHidden(id, hidden)
        if (result.success) {
          setExtractions(prev => prev.map(e =>
            e.id === id ? { ...e, hidden: result.hidden } : e
          ))
          // Invalidate caches since transactions are now included/excluded
          invalidateInconsistencyCache()
          invalidateStoryCache()
        }
      }
    } catch (error) {
      console.error("Toggle hidden failed:", error)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return

    setIsDeleting(true)
    try {
      if (source === 'experimental') {
        // Find the extraction to get its extraction_id (UUID)
        const ext = extractionsNewRaw.find(e => e.id === deleteTarget.id)
        if (!ext) {
          alert("Extraction not found")
          return
        }
        const result = await deleteExtractionNew(ext.extraction_id)
        if (result.success) {
          setExtractions(prev => prev.filter(e => e.id !== deleteTarget.id))
          if (selectedExtractionId === deleteTarget.id) {
            setSelectedExtractionId(null)
          }
          setDeleteTarget(null)
          invalidateInconsistencyCache()
          invalidateStoryCache()
        } else {
          alert("Delete failed")
        }
      } else {
        const result = await deleteBankExtraction(deleteTarget.id)
        if (result.success) {
          setExtractions(prev => prev.filter(e => e.id !== deleteTarget.id))
          if (selectedExtractionId === deleteTarget.id) {
            setSelectedExtractionId(null)
          }
          setDeleteTarget(null)
          // Invalidate caches since transactions are now removed
          invalidateInconsistencyCache()
          invalidateStoryCache()
        } else {
          alert(result.error || "Delete failed")
        }
      }
    } catch (error) {
      console.error("Delete failed:", error)
      alert("Delete failed")
    } finally {
      setIsDeleting(false)
    }
  }

  // Get the source file ID for the selected extraction to highlight it
  const selectedExtraction = extractions.find(e => e.id === selectedExtractionId) || null
  const highlightedSourceFileId = selectedExtraction?.source_file_id ?? null

  // Clear selection when clicking outside the cards
  const handleMainClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setSelectedExtractionId(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/40">
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2Icon className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/40" onClick={handleMainClick}>
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-8" onClick={handleMainClick}>
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <LandmarkIcon className="h-6 w-6 text-primary" />
              </div>
              Bank Extractions
            </h1>
            <p className="text-muted-foreground mt-1">
              Extract transactions from bank statement files
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCwIcon className={`h-5 w-5 text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </header>

        {/* Two columns: Source Files & Extractions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6" onClick={handleMainClick}>
          <BankSourceFilesSection
            files={sourceFiles}
            onExtract={handleExtract}
            extractingId={extractingId}
            onPasswordNeeded={setPasswordNeededFileId}
            passwordNeededFileId={passwordNeededFileId}
            highlightedFileId={highlightedSourceFileId}
          />
          <ExtractionsListSection
            extractions={extractions}
            selectedId={selectedExtractionId}
            onSelect={setSelectedExtractionId}
            onLoad={handleLoad}
            loadingIds={loadingIds}
            showHidden={showHidden}
            onToggleShowHidden={() => setShowHidden(!showHidden)}
            onHide={handleHide}
            onDelete={setDeleteTarget}
          />
        </div>

        {/* Full Width: Artifact Preview */}
        <ArtifactPreviewSection
          extraction={selectedExtraction}
          source={source}
          dataSourcesNewRaw={dataSourcesNewRaw}
        />
      </main>

      {/* Delete Confirmation Dialog */}
      <Dialog.Root open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded-xl p-6 w-full max-w-md z-50 shadow-xl">
            <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
              <Trash2Icon className="h-5 w-5 text-red-500" />
              Delete Extraction
            </Dialog.Title>
            <Dialog.Description className="text-muted-foreground mt-2">
              Are you sure you want to delete <span className="font-mono font-medium text-foreground">{deleteTarget?.name}</span>?
            </Dialog.Description>

            <div className="mt-4 space-y-2 text-sm">
              <p className="font-medium">This will:</p>
              <ul className="space-y-1 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  Permanently delete the extraction record
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  Delete all associated artifacts
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Transactions will remain but lose their link
                </li>
              </ul>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Dialog.Close asChild>
                <button className="px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isDeleting ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2Icon className="h-4 w-4" />
                )}
                Delete
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Footer />
    </div>
  )
}
