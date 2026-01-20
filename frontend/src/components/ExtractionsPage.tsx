import { useState, useEffect } from "react"
import {
  FileTextIcon,
  DownloadIcon,
  PlayIcon,
  Loader2Icon,
  CheckCircleIcon,
  XCircleIcon,
  TableIcon,
  CreditCardIcon,
  CalendarIcon,
  HashIcon,
  ChevronRightIcon,
  RefreshCwIcon,
  FileArchiveIcon,
  AlertCircleIcon,
  LockIcon,
  LockKeyholeIcon,
  SettingsIcon,
  EyeOffIcon,
  EyeIcon,
  CheckIcon,
  XIcon,
  WandIcon,
  Trash2Icon,
  SparklesIcon,
} from "lucide-react"
import * as Dialog from "@radix-ui/react-dialog"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import {
  fetchPDFSourceFiles,
  fetchPDFExtractions,
  getArtifactUrl,
  triggerPDFExtraction,
  toggleExtractionHidden,
  updatePDFSourceFilePassword,
  transformPDFExtractions,
  deletePDFExtraction,
  deletePDFSourceFile,
  deleteAllPDFExtractions,
  fetchCSVSourceFiles,
  triggerCSVExtraction,
  syncCCSourceFiles,
  type PDFSourceFile,
  type CreditCardPDFExtraction,
  type CSVSourceFile,
} from "@/lib/api"

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function StatusBadge({ status }: { status: CreditCardPDFExtraction['status'] }) {
  // Don't show badge for loaded status in extractions view
  if (status === 'loaded') return null;

  const styles = {
    extracted: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
    transformed: "bg-purple-500/20 text-purple-600 dark:text-purple-400",
    loading: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
    loaded: "bg-green-500/20 text-green-600 dark:text-green-400",
    error: "bg-red-500/20 text-red-600 dark:text-red-400",
    superseded: "bg-gray-500/20 text-gray-600 dark:text-gray-400",
  }
  const icons = {
    extracted: <CheckCircleIcon className="h-3 w-3" />,
    transformed: <CheckCircleIcon className="h-3 w-3" />,
    loading: <Loader2Icon className="h-3 w-3 animate-spin" />,
    loaded: <CheckCircleIcon className="h-3 w-3" />,
    error: <XCircleIcon className="h-3 w-3" />,
    superseded: <AlertCircleIcon className="h-3 w-3" />,
  }
  const labels = {
    extracted: "Extracted",
    transformed: "Transformed",
    loading: "Loading...",
    loaded: "Loaded",
    error: "Error",
    superseded: "Superseded",
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {icons[status]}
      {labels[status]}
    </span>
  )
}

// PDF Source Files Section
function PDFSourceFilesSection({
  files,
  onExtract,
  extractingId,
  onPasswordNeeded,
  passwordNeededFileId,
  onPasswordSaved,
  highlightedFileId,
  onDeleteSourceFile,
  deletingSourceFileId,
}: {
  files: PDFSourceFile[]
  onExtract: (fileId: number, password?: string) => void
  extractingId: number | null
  onPasswordNeeded: (fileId: number | null) => void
  passwordNeededFileId: number | null
  onPasswordSaved: (fileId: number, hasPassword: boolean, newPassword: string) => void
  highlightedFileId: number | null
  onDeleteSourceFile: (file: PDFSourceFile) => void
  deletingSourceFileId: number | null
}) {
  const [passwordFileId, setPasswordFileId] = useState<number | null>(null)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [savingPasswordId, setSavingPasswordId] = useState<number | null>(null)
  const [isUpdateMode, setIsUpdateMode] = useState(false) // true when editing existing password

  // Show password input when extraction fails due to password protection
  useEffect(() => {
    if (passwordNeededFileId !== null) {
      setPasswordFileId(passwordNeededFileId)
      setPassword('')
      setShowPassword(false)
      setIsUpdateMode(false)
      onPasswordNeeded(null)  // Clear the flag
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

  const handlePasswordPrompt = (fileId: number, file: PDFSourceFile) => {
    setPasswordFileId(fileId)
    // Pre-fill with saved password if in update mode
    setPassword(file.has_password ? file.pdf_password : '')
    setShowPassword(false)
    setIsUpdateMode(file.has_password)
  }

  const handleCancelPassword = () => {
    setPasswordFileId(null)
    setPassword('')
    setShowPassword(false)
    setIsUpdateMode(false)
  }

  const handleSavePassword = async (fileId: number) => {
    setSavingPasswordId(fileId)
    try {
      const result = await updatePDFSourceFilePassword(fileId, password)
      if (result.success) {
        onPasswordSaved(fileId, result.has_password, password)
        setPasswordFileId(null)
        setPassword('')
        setShowPassword(false)
        setIsUpdateMode(false)
      } else {
        alert(result.error || "Failed to save password")
      }
    } catch (error) {
      console.error("Failed to save password:", error)
      alert("Failed to save password")
    } finally {
      setSavingPasswordId(null)
    }
  }

  const handleClearPassword = async (fileId: number) => {
    setSavingPasswordId(fileId)
    try {
      const result = await updatePDFSourceFilePassword(fileId, '')
      if (result.success) {
        onPasswordSaved(fileId, false, '')
        setPasswordFileId(null)
        setPassword('')
        setShowPassword(false)
        setIsUpdateMode(false)
      } else {
        alert(result.error || "Failed to clear password")
      }
    } catch (error) {
      console.error("Failed to clear password:", error)
      alert("Failed to clear password")
    } finally {
      setSavingPasswordId(null)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="p-6 pb-3">
        <h3 className="font-semibold flex items-center gap-2 text-lg">
          <div className="p-1.5 rounded-lg bg-muted">
            <FileTextIcon className="h-5 w-5 text-muted-foreground" />
          </div>
          PDF Source Files
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Credit card PDF statements available for extraction
        </p>
      </header>
      <div className="relative">
        <div className="p-6 pt-0 max-h-[400px] overflow-y-auto">
          {files.length === 0 ? (
            <div className="text-center py-8 rounded-xl bg-gradient-to-br from-muted/50 to-transparent border border-border">
              <div className="p-3 rounded-full bg-muted w-fit mx-auto mb-3">
                <FileTextIcon className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium">No PDF files found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Upload PDF statements to extract transactions
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
                      {file.credit_card && (
                        <span className="flex items-center gap-1">
                          <CreditCardIcon className="h-3 w-3" />
                          {file.credit_card.nickname}
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
                    {passwordFileId === file.id ? (
                      <button
                        onClick={handleCancelPassword}
                        className="px-2 py-1.5 text-sm rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                      >
                        Cancel
                      </button>
                    ) : (
                      <button
                        onClick={() => handlePasswordPrompt(file.id, file)}
                        className={`p-1.5 rounded-lg hover:bg-muted transition-colors ${
                          file.has_password ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                        }`}
                        title={file.has_password ? "Password saved - Click to update" : "Set password"}
                      >
                        {file.has_password ? (
                          <LockKeyholeIcon className="h-4 w-4" />
                        ) : (
                          <LockIcon className="h-4 w-4" />
                        )}
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteSourceFile(file)
                      }}
                      disabled={deletingSourceFileId === file.id}
                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                      title="Delete source file"
                    >
                      {deletingSourceFileId === file.id ? (
                        <Loader2Icon className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2Icon className="h-4 w-4" />
                      )}
                    </button>
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
                      {file.has_password ? (
                        <LockKeyholeIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
                      ) : (
                        <LockIcon className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div className="relative flex-1">
                        <input
                          type={showPassword ? "text" : "password"}
                          placeholder={isUpdateMode ? "Enter new password (or leave empty to clear)" : "PDF Password"}
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
                      {/* Save button */}
                      <button
                        onClick={() => handleSavePassword(file.id)}
                        disabled={savingPasswordId === file.id || !password}
                        className="p-1.5 rounded-lg bg-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Save password"
                      >
                        {savingPasswordId === file.id ? (
                          <Loader2Icon className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckIcon className="h-4 w-4" />
                        )}
                      </button>
                      {/* Clear button - only show if password is saved */}
                      {isUpdateMode && (
                        <button
                          onClick={() => handleClearPassword(file.id)}
                          disabled={savingPasswordId === file.id}
                          className="p-1.5 rounded-lg bg-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Clear saved password"
                        >
                          <XIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {isUpdateMode && (
                      <p className="text-xs text-muted-foreground mt-1.5 ml-6">
                        Password is saved for this file. Enter a new password or clear it.
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

// CSV Source Files Section
function CSVSourceFilesSection({
  files,
  onExtract,
  extractingId,
}: {
  files: CSVSourceFile[]
  onExtract: (fileId: number) => void
  extractingId: number | null
}) {
  const getStatusBadge = (file: CSVSourceFile) => {
    if (!file.last_extraction_status) {
      return (
        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
          Not extracted
        </span>
      )
    }
    switch (file.last_extraction_status) {
      case 'transformed':
        return (
          <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-medium flex items-center gap-1">
            <CheckCircleIcon className="h-3 w-3" />
            Transformed
          </span>
        )
      case 'loaded':
        return (
          <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-600 dark:text-green-400 text-xs font-medium flex items-center gap-1">
            <CheckCircleIcon className="h-3 w-3" />
            Loaded
          </span>
        )
      default:
        return (
          <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
            {file.last_extraction_status}
          </span>
        )
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="p-6 pb-3">
        <h3 className="font-semibold flex items-center gap-2 text-lg">
          <div className="p-1.5 rounded-lg bg-muted">
            <FileTextIcon className="h-5 w-5 text-muted-foreground" />
          </div>
          CSV Source Files
        </h3>
        <p className="text-sm text-muted-foreground mt-1 ml-9">
          Extract transactions from credit card CSV files
        </p>
      </header>
      <div className="relative">
        <div className="p-6 pt-0 max-h-[400px] overflow-y-auto">
          {files.length === 0 ? (
            <div className="text-center py-8 rounded-xl bg-gradient-to-br from-muted/50 to-transparent border border-border">
              <div className="p-3 rounded-full bg-muted w-fit mx-auto mb-3">
                <FileTextIcon className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium">No CSV files found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add CSV files to <code className="bg-muted px-1.5 py-0.5 rounded text-xs">credit_cards/data/</code>
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((file) => {
                const isExtracting = extractingId === file.id
                return (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-muted shrink-0">
                        <FileTextIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-mono text-sm truncate font-medium">{file.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {file.extractions_count > 0
                            ? `${file.extractions_count} extraction${file.extractions_count > 1 ? 's' : ''}`
                            : 'No extractions'}
                          {file.credit_card && (
                            <span className="ml-2">
                              • {file.credit_card.nickname}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {getStatusBadge(file)}
                      <button
                        onClick={() => onExtract(file.id)}
                        disabled={isExtracting || !file.has_data}
                        className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        title={file.has_data ? 'Extract transactions' : 'No file data available'}
                      >
                        {isExtracting ? (
                          <>
                            <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                            Extracting...
                          </>
                        ) : (
                          <>
                            <SparklesIcon className="h-3.5 w-3.5" />
                            Extract
                          </>
                        )}
                      </button>
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

// Extractions List Section
function ExtractionsListSection({
  extractions,
  selectedId,
  onSelect,
  onToggleHidden,
  showHidden,
  onToggleShowHidden,
  onTransformPending,
  isTransforming,
  onDeleteExtraction,
  deletingExtractionId,
  onDeleteAll,
  isDeletingAll,
}: {
  extractions: CreditCardPDFExtraction[]
  selectedId: number | null
  onSelect: (id: number) => void
  onToggleHidden: (id: number, hidden: boolean) => void
  showHidden: boolean
  onToggleShowHidden: () => void
  onTransformPending: () => void
  isTransforming: boolean
  onDeleteExtraction: (extraction: CreditCardPDFExtraction) => void
  deletingExtractionId: number | null
  onDeleteAll: () => void
  isDeletingAll: boolean
}) {
  const hiddenCount = extractions.filter(e => e.hidden).length
  const visibleExtractions = showHidden ? extractions : extractions.filter(e => !e.hidden)

  // Count extractions that need transformation (extracted status with transformable artifacts)
  const pendingTransformCount = extractions.filter(
    e => !e.hidden && e.status === 'extracted' && e.transformable_count > 0 && !e.all_transformed
  ).length

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
              Extracted data from PDF statements
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pendingTransformCount > 0 && (
              <button
                onClick={onTransformPending}
                disabled={isTransforming}
                className="px-3 py-1.5 text-xs rounded-lg font-medium transition-colors flex items-center gap-1.5 bg-purple-500/20 text-purple-600 dark:text-purple-400 hover:bg-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTransforming ? (
                  <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <WandIcon className="h-3.5 w-3.5" />
                )}
                Transform {pendingTransformCount}
              </button>
            )}
            {hiddenCount > 0 && (
              <button
                onClick={onToggleShowHidden}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                  showHidden
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {showHidden ? <EyeIcon className="h-3.5 w-3.5" /> : <EyeOffIcon className="h-3.5 w-3.5" />}
                {hiddenCount} hidden
              </button>
            )}
            {extractions.length > 0 && (
              <button
                onClick={onDeleteAll}
                disabled={isDeletingAll}
                className="px-3 py-1.5 text-xs rounded-lg font-medium transition-colors flex items-center gap-1.5 bg-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeletingAll ? (
                  <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2Icon className="h-3.5 w-3.5" />
                )}
                Delete All
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
                Extract a PDF to see results here
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
                    ? "border-border bg-muted/30 opacity-60"
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
                      {ext.transformable_count > 0 && !ext.all_transformed && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-600 dark:text-amber-400">
                          <AlertCircleIcon className="h-3 w-3" />
                          {ext.transformed_count}/{ext.transformable_count} transformed
                        </span>
                      )}
                      {ext.hidden && (
                        <span className="px-1.5 py-0.5 text-xs rounded bg-muted text-muted-foreground">
                          hidden
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <FileTextIcon className="h-3 w-3" />
                        {ext.source_file.filename}
                      </span>
                      {ext.statement_date && (
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="h-3 w-3" />
                          {formatDate(ext.statement_date)}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <HashIcon className="h-3 w-3" />
                        {ext.artifacts?.filter(a => a.is_transformed && a.artifact_type.includes('transactions')).reduce((sum, a) => sum + (a.row_count || 0), 0) ?? 0} txns
                        {(ext.artifacts?.filter(a => a.is_transformed && a.artifact_type.includes('emi')).reduce((sum, a) => sum + (a.row_count || 0), 0) ?? 0) > 0 && `, ${ext.artifacts?.filter(a => a.is_transformed && a.artifact_type.includes('emi')).reduce((sum, a) => sum + (a.row_count || 0), 0)} EMIs`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleHidden(ext.id, !ext.hidden)
                      }}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      title={ext.hidden ? "Unhide" : "Hide"}
                    >
                      {ext.hidden ? <EyeIcon className="h-4 w-4" /> : <EyeOffIcon className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteExtraction(ext)
                      }}
                      disabled={deletingExtractionId === ext.id}
                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                      title="Delete extraction"
                    >
                      {deletingExtractionId === ext.id ? (
                        <Loader2Icon className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2Icon className="h-4 w-4" />
                      )}
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

// Parse CSV string into headers and rows
function parseCSV(csvText: string): { headers: string[]; rows: string[][] } {
  const lines = csvText.trim().split('\n')
  if (lines.length === 0) return { headers: [], rows: [] }

  // Simple CSV parsing (handles quoted fields with commas)
  const parseLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current)
        current = ''
      } else {
        current += char
      }
    }
    result.push(current)
    return result
  }

  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map(parseLine)

  return { headers, rows }
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

// CSV Table component
function CSVTable({
  csvText,
}: {
  csvText: string
}) {
  const { headers, rows } = parseCSV(csvText)
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(headers))

  // Reset visible columns when headers change
  useEffect(() => {
    setVisibleColumns(new Set(headers))
  }, [headers.join(',')])

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

  if (headers.length === 0) {
    return <p className="text-center py-8 text-muted-foreground">No data</p>
  }

  const visibleIndices = headers.map((h, i) => visibleColumns.has(h) ? i : -1).filter((i) => i !== -1)

  return (
    <div>
      <div className="flex justify-end mb-2">
        <ColumnSelector
          columns={headers}
          visibleColumns={visibleColumns}
          onToggle={toggleColumn}
        />
      </div>
      <div className="overflow-auto max-h-[500px] border border-border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              {visibleIndices.map((i) => (
                <th
                  key={headers[i]}
                  className="text-left py-2 px-3 font-medium text-muted-foreground whitespace-nowrap border-b border-border"
                >
                  {headers[i]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-b border-border/50 hover:bg-muted/30">
                {visibleIndices.map((i) => (
                  <td
                    key={i}
                    className="py-2 px-3 font-mono text-xs whitespace-nowrap"
                  >
                    {row[i] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        {rows.length} row{rows.length !== 1 ? 's' : ''}
      </p>
    </div>
  )
}

// JSON syntax highlighter component
function JSONHighlight({ json }: { json: string }) {
  // Tokenize and highlight JSON
  const highlightJSON = (text: string): React.ReactNode[] => {
    const result: React.ReactNode[] = []
    let i = 0
    let key = 0

    while (i < text.length) {
      // Skip whitespace
      if (/\s/.test(text[i])) {
        let ws = ''
        while (i < text.length && /\s/.test(text[i])) {
          ws += text[i]
          i++
        }
        result.push(ws)
        continue
      }

      // String (key or value)
      if (text[i] === '"') {
        let str = '"'
        i++
        while (i < text.length && text[i] !== '"') {
          if (text[i] === '\\' && i + 1 < text.length) {
            str += text[i] + text[i + 1]
            i += 2
          } else {
            str += text[i]
            i++
          }
        }
        str += '"'
        i++

        // Check if this is a key (followed by :)
        let j = i
        while (j < text.length && /\s/.test(text[j])) j++
        const isKey = text[j] === ':'

        result.push(
          <span key={key++} className={isKey ? "text-blue-600 dark:text-blue-400" : "text-green-600 dark:text-green-400"}>
            {str}
          </span>
        )
        continue
      }

      // Numbers
      if (/[-\d]/.test(text[i])) {
        let num = ''
        while (i < text.length && /[\d.eE+-]/.test(text[i])) {
          num += text[i]
          i++
        }
        result.push(
          <span key={key++} className="text-amber-600 dark:text-amber-400">
            {num}
          </span>
        )
        continue
      }

      // Booleans and null
      if (text.slice(i, i + 4) === 'true') {
        result.push(<span key={key++} className="text-purple-600 dark:text-purple-400">true</span>)
        i += 4
        continue
      }
      if (text.slice(i, i + 5) === 'false') {
        result.push(<span key={key++} className="text-purple-600 dark:text-purple-400">false</span>)
        i += 5
        continue
      }
      if (text.slice(i, i + 4) === 'null') {
        result.push(<span key={key++} className="text-gray-500 dark:text-gray-400">null</span>)
        i += 4
        continue
      }

      // Punctuation
      if ('{}[],:'.includes(text[i])) {
        result.push(
          <span key={key++} className="text-foreground/70">
            {text[i]}
          </span>
        )
        i++
        continue
      }

      // Anything else
      result.push(text[i])
      i++
    }

    return result
  }

  return (
    <pre className="p-4 rounded-lg bg-muted/50 border border-border overflow-auto max-h-[600px] text-xs font-mono whitespace-pre">
      {highlightJSON(json)}
    </pre>
  )
}


// Artifact Preview Section
function ArtifactPreviewSection({
  extraction,
}: {
  extraction: CreditCardPDFExtraction | null
}) {
  const [activeTab, setActiveTab] = useState<string>('transactions')
  const [rawContent, setRawContent] = useState<string>('')
  const [loading, setLoading] = useState(false)

  // Get available artifacts (safe for null extraction)
  const artifacts = extraction?.artifacts || []

  // Get current artifact
  const currentArtifact = artifacts.find(a => a.artifact_type === activeTab)

  // Auto-select first available tab if current tab has no artifact
  useEffect(() => {
    if (artifacts.length > 0 && !artifacts.find(a => a.artifact_type === activeTab)) {
      setActiveTab(artifacts[0].artifact_type)
    }
  }, [extraction?.id, artifacts.length])

  // Load artifact content
  useEffect(() => {
    if (!extraction || !currentArtifact) {
      setRawContent('')
      return
    }

    const artifactId = currentArtifact.artifact_id

    async function loadRawArtifact() {
      setLoading(true)
      try {
        const url = getArtifactUrl(artifactId)
        const res = await fetch(url)
        if (res.ok) {
          const text = await res.text()
          setRawContent(text)
        } else {
          setRawContent('')
        }
      } catch (error) {
        console.error("Failed to load artifact:", error)
        setRawContent('')
      } finally {
        setLoading(false)
      }
    }

    loadRawArtifact()
  }, [extraction?.id, activeTab, currentArtifact?.artifact_id])

  // Helper to extract short UUID from artifact_id (e.g., "artifact_abc12345" -> "abc12345")
  const getShortId = (artifactId: string) => artifactId.replace('artifact_', '')

  // Pretty-print JSON
  const jsonContent = activeTab === 'metadata' && rawContent ? (() => {
    try {
      return JSON.stringify(JSON.parse(rawContent), null, 2)
    } catch {
      return rawContent
    }
  })() : ''

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
              Select an extraction above to view artifacts
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

          {/* Download button */}
          {rawContent && currentArtifact && (
            <a
              href={getArtifactUrl(currentArtifact.artifact_id)}
              className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted transition-colors inline-flex items-center gap-1.5 font-medium shrink-0"
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              Download
            </a>
          )}
        </div>

        {/* Artifact Type Tabs */}
        {artifacts.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {artifacts.map((artifact) => (
              <button
                key={artifact.artifact_id}
                onClick={() => setActiveTab(artifact.artifact_type)}
                className={`group relative px-3 py-2 text-sm rounded-lg border transition-all flex items-center gap-2 ${
                  activeTab === artifact.artifact_type
                    ? "bg-primary/10 border-primary/50 text-foreground"
                    : "bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${
                  activeTab === artifact.artifact_type
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground group-hover:text-foreground"
                }`}>
                  {artifact.artifact_type}
                </span>
                <span className={`font-mono text-xs ${
                  activeTab === artifact.artifact_type
                    ? "text-foreground/70"
                    : "text-muted-foreground/70"
                }`}>
                  {getShortId(artifact.artifact_id)}
                </span>
                {artifact.row_count > 0 && (
                  <span className={`text-xs ${
                    activeTab === artifact.artifact_type
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}>
                    ({artifact.row_count})
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="p-6 pt-0">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !rawContent ? (
          <p className="text-center py-8 text-muted-foreground">
            No {activeTab === 'metadata' ? 'metadata' : activeTab === 'emi' ? 'EMI/loan data' : 'transactions'} found
          </p>
        ) : activeTab === 'metadata' ? (
          <JSONHighlight json={jsonContent} />
        ) : (
          <CSVTable csvText={rawContent} />
        )}
      </div>
    </section>
  )
}

// Confirmation dialog type
type DeleteTarget =
  | { type: 'extraction'; item: CreditCardPDFExtraction }
  | { type: 'source_file'; item: PDFSourceFile }

// Main Extractions Page
type SourceType = 'pdf' | 'csv'

export function ExtractionsPage() {
  const [sourceFiles, setSourceFiles] = useState<PDFSourceFile[]>([])
  const [csvSourceFiles, setCsvSourceFiles] = useState<CSVSourceFile[]>([])
  const [sourceType, setSourceType] = useState<SourceType>('pdf')
  const [extractions, setExtractions] = useState<CreditCardPDFExtraction[]>([])
  const [selectedExtractionId, setSelectedExtractionId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [extractingId, setExtractingId] = useState<number | null>(null)
  const [csvExtractingId, setCsvExtractingId] = useState<number | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [passwordNeededFileId, setPasswordNeededFileId] = useState<number | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [isTransforming, setIsTransforming] = useState(false)

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [deletingExtractionId, setDeletingExtractionId] = useState<number | null>(null)
  const [deletingSourceFileId, setDeletingSourceFileId] = useState<number | null>(null)
  const [isDeletingAll, setIsDeletingAll] = useState(false)
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false)

  useEffect(() => {
    document.title = "Extractions | FinAccs"
  }, [])

  const loadData = async () => {
    // Load each data source independently to avoid one failure blocking all
    try {
      const filesRes = await fetchPDFSourceFiles()
      setSourceFiles(filesRes.data)
    } catch (error) {
      console.error("Failed to load PDF source files:", error)
    }

    try {
      const csvFilesRes = await fetchCSVSourceFiles()
      setCsvSourceFiles(csvFilesRes.data)
    } catch (error) {
      console.error("Failed to load CSV source files:", error)
    }

    try {
      const extractionsRes = await fetchPDFExtractions(true) // Always fetch all, filter in UI
      setExtractions(extractionsRes.data)
    } catch (error) {
      console.error("Failed to load extractions:", error)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await syncCCSourceFiles()
    await loadData()
    setIsRefreshing(false)
  }

  const handleExtract = async (fileId: number, password?: string) => {
    setExtractingId(fileId)
    try {
      const result = await triggerPDFExtraction(fileId, password)
      if (result.success && result.extraction) {
        // Update has_password if password was saved
        if (result.password_saved) {
          setSourceFiles((prev) =>
            prev.map((sf) =>
              sf.id === fileId ? { ...sf, has_password: true } : sf
            )
          )
        }
        await loadData()
        setSelectedExtractionId(result.extraction.id)
      } else {
        // Check if it's a password error - show password input instead of alert
        if (result.error?.toLowerCase().includes('password')) {
          setPasswordNeededFileId(fileId)
        } else {
          alert(result.error || "Extraction failed")
        }
      }
    } catch (error) {
      console.error("Extraction failed:", error)
      alert("Extraction failed")
    } finally {
      setExtractingId(null)
    }
  }

  const handleCSVExtract = async (fileId: number) => {
    setCsvExtractingId(fileId)
    try {
      const result = await triggerCSVExtraction(fileId)
      if (result.success && result.extraction) {
        await loadData()
        setSelectedExtractionId(result.extraction.id)
      } else {
        alert(result.error || "CSV extraction failed")
      }
    } catch (error) {
      console.error("CSV extraction failed:", error)
      alert("CSV extraction failed")
    } finally {
      setCsvExtractingId(null)
    }
  }

  const handleToggleHidden = async (extractionId: number, hidden: boolean) => {
    try {
      const result = await toggleExtractionHidden(extractionId, hidden)
      if (result.success) {
        // Update local state immediately
        setExtractions((prev) =>
          prev.map((ext) =>
            ext.id === extractionId ? { ...ext, hidden: result.hidden } : ext
          )
        )
      } else {
        alert(result.error || "Failed to update")
      }
    } catch (error) {
      console.error("Toggle hidden failed:", error)
      alert("Failed to update")
    }
  }

  const handlePasswordSaved = (fileId: number, hasPassword: boolean, newPassword: string) => {
    // Update local state immediately
    setSourceFiles((prev) =>
      prev.map((sf) =>
        sf.id === fileId ? { ...sf, has_password: hasPassword, pdf_password: newPassword } : sf
      )
    )
  }

  const handleTransformPending = async () => {
    // Get IDs of extractions that need transformation
    const pendingIds = extractions
      .filter(e => !e.hidden && e.status === 'extracted' && e.transformable_count > 0 && !e.all_transformed)
      .map(e => e.id)

    if (pendingIds.length === 0) return

    setIsTransforming(true)
    try {
      const result = await transformPDFExtractions(pendingIds)
      const successCount = result.results.filter(r => r.success).length
      const failCount = result.results.filter(r => !r.success).length

      // Reload data to get updated statuses
      await loadData()

      if (failCount > 0) {
        const failures = result.results
          .filter(r => !r.success)
          .map(r => r.message)
          .join('\n')
        alert(`Transformed ${successCount} extraction(s). ${failCount} failed:\n${failures}`)
      }
    } catch (error) {
      console.error("Transform failed:", error)
      alert("Transformation failed")
    } finally {
      setIsTransforming(false)
    }
  }

  const handleDeleteExtraction = (extraction: CreditCardPDFExtraction) => {
    setDeleteTarget({ type: 'extraction', item: extraction })
  }

  const handleDeleteSourceFile = (file: PDFSourceFile) => {
    setDeleteTarget({ type: 'source_file', item: file })
  }

  const handleDeleteAllExtractions = () => {
    setShowDeleteAllConfirm(true)
  }

  const confirmDeleteAll = async () => {
    setIsDeletingAll(true)
    try {
      const result = await deleteAllPDFExtractions()
      if (result.success) {
        setSelectedExtractionId(null)
        await loadData()
      } else {
        alert(result.error || "Failed to delete all extractions")
      }
    } catch (error) {
      console.error("Delete all extractions failed:", error)
      alert("Failed to delete all extractions")
    } finally {
      setIsDeletingAll(false)
      setShowDeleteAllConfirm(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return

    if (deleteTarget.type === 'extraction') {
      const extraction = deleteTarget.item
      setDeletingExtractionId(extraction.id)
      try {
        const result = await deletePDFExtraction(extraction.id)
        if (result.success) {
          // If deleted extraction was selected, clear selection
          if (selectedExtractionId === extraction.id) {
            setSelectedExtractionId(null)
          }
          await loadData()
        } else {
          alert(result.error || "Failed to delete extraction")
        }
      } catch (error) {
        console.error("Delete extraction failed:", error)
        alert("Failed to delete extraction")
      } finally {
        setDeletingExtractionId(null)
      }
    } else if (deleteTarget.type === 'source_file') {
      const file = deleteTarget.item
      setDeletingSourceFileId(file.id)
      try {
        const result = await deletePDFSourceFile(file.id)
        if (result.success) {
          // Clear selection if any extraction from this file was selected
          if (selectedExtractionId) {
            const selectedExtraction = extractions.find(e => e.id === selectedExtractionId)
            if (selectedExtraction?.source_file.id === file.id) {
              setSelectedExtractionId(null)
            }
          }
          await loadData()
        } else {
          alert(result.error || "Failed to delete source file")
        }
      } catch (error) {
        console.error("Delete source file failed:", error)
        alert("Failed to delete source file")
      } finally {
        setDeletingSourceFileId(null)
      }
    }

    setDeleteTarget(null)
  }

  const selectedExtraction = extractions.find((e) => e.id === selectedExtractionId) || null

  // Get the source file ID for the selected extraction to highlight it
  const highlightedSourceFileId = selectedExtraction?.source_file?.id ?? null

  // Find source files with "ready to load" (transformed) extractions
  const pdfFilesWithTransformed = new Set(
    extractions
      .filter(e => e.status === 'transformed')
      .map(e => e.source_file?.id)
      .filter(Boolean)
  )

  // Sort source files: unextracted first, then ready to load, then by last extracted date
  const sortedPdfSourceFiles = [...sourceFiles].sort((a, b) => {
    const aUnextracted = a.extractions_count === 0
    const bUnextracted = b.extractions_count === 0
    // Unextracted files first
    if (aUnextracted && !bUnextracted) return -1
    if (!aUnextracted && bUnextracted) return 1
    // Then ready to load (transformed)
    const aReady = pdfFilesWithTransformed.has(a.id)
    const bReady = pdfFilesWithTransformed.has(b.id)
    if (aReady && !bReady) return -1
    if (!aReady && bReady) return 1
    // Secondary sort by last extracted (most recent first)
    if (a.last_extracted && b.last_extracted) {
      return new Date(b.last_extracted).getTime() - new Date(a.last_extracted).getTime()
    }
    if (a.last_extracted) return -1
    if (b.last_extracted) return 1
    return 0
  })

  // Sort CSV source files: ready to load (transformed) first
  const sortedCsvSourceFiles = [...csvSourceFiles].sort((a, b) => {
    const aReady = a.last_extraction_status === 'transformed'
    const bReady = b.last_extraction_status === 'transformed'
    if (aReady && !bReady) return -1
    if (!aReady && bReady) return 1
    return 0
  })

  // Filter extractions based on source type
  const pdfSourceFileIds = new Set(sourceFiles.map(f => f.id))
  const csvSourceFileIds = new Set(csvSourceFiles.map(f => f.id))
  const filteredExtractions = extractions.filter(e => {
    const sourceId = e.source_file?.id
    if (!sourceId) return false
    if (sourceType === 'pdf') return pdfSourceFileIds.has(sourceId)
    return csvSourceFileIds.has(sourceId)
  })

  // Clear selection when source type changes and selected extraction is not in filtered list
  useEffect(() => {
    if (selectedExtractionId && !filteredExtractions.find(e => e.id === selectedExtractionId)) {
      setSelectedExtractionId(null)
    }
  }, [sourceType])

  // Clear selection when clicking outside the cards
  const handleMainClick = (e: React.MouseEvent) => {
    // Only clear if clicking directly on the main element (not its children)
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
                <FileArchiveIcon className="h-6 w-6 text-primary" />
              </div>
              Extractions
            </h1>
            <p className="text-muted-foreground mt-1">
              Extract transactions and metadata from credit card statements
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Source type toggle */}
            <div className="flex items-center bg-muted rounded-lg p-1">
              <button
                onClick={() => setSourceType('pdf')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  sourceType === 'pdf'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                PDF
              </button>
              <button
                onClick={() => setSourceType('csv')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  sourceType === 'csv'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                CSV
              </button>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCwIcon className={`h-5 w-5 text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        {/* Top Row: Source Files & Extractions List side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6" onClick={handleMainClick}>
          {sourceType === 'pdf' ? (
            <PDFSourceFilesSection
              files={sortedPdfSourceFiles}
              onExtract={handleExtract}
              extractingId={extractingId}
              onPasswordNeeded={setPasswordNeededFileId}
              passwordNeededFileId={passwordNeededFileId}
              onPasswordSaved={handlePasswordSaved}
              highlightedFileId={highlightedSourceFileId}
              onDeleteSourceFile={handleDeleteSourceFile}
              deletingSourceFileId={deletingSourceFileId}
            />
          ) : (
            <CSVSourceFilesSection
              files={sortedCsvSourceFiles}
              onExtract={handleCSVExtract}
              extractingId={csvExtractingId}
            />
          )}
          <ExtractionsListSection
            extractions={filteredExtractions}
            selectedId={selectedExtractionId}
            onSelect={setSelectedExtractionId}
            onToggleHidden={handleToggleHidden}
            showHidden={showHidden}
            onToggleShowHidden={() => setShowHidden(!showHidden)}
            onTransformPending={handleTransformPending}
            isTransforming={isTransforming}
            onDeleteExtraction={handleDeleteExtraction}
            deletingExtractionId={deletingExtractionId}
            onDeleteAll={handleDeleteAllExtractions}
            isDeletingAll={isDeletingAll}
          />
        </div>

        {/* Full Width: Artifact Preview */}
        <ArtifactPreviewSection extraction={selectedExtraction} />
      </main>

      {/* Delete Confirmation Dialog */}
      <Dialog.Root open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 animate-in fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded-xl shadow-lg w-full max-w-md p-6 animate-in fade-in-0 zoom-in-95">
            <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
              <div className="p-2 rounded-lg bg-red-500/20">
                <Trash2Icon className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              {deleteTarget?.type === 'extraction' ? 'Delete Extraction' : 'Delete Source File'}
            </Dialog.Title>
            <Dialog.Description className="mt-3 text-muted-foreground">
              {deleteTarget?.type === 'extraction' ? (
                <>
                  Are you sure you want to delete{' '}
                  <span className="font-mono text-foreground">{deleteTarget.item.name}</span>?
                  <ul className="mt-3 space-y-1.5 text-sm">
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      The extraction record will be permanently deleted
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      All associated artifacts will be deleted
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      Transactions will remain but lose their link
                    </li>
                  </ul>
                </>
              ) : deleteTarget?.type === 'source_file' ? (
                <>
                  Are you sure you want to delete{' '}
                  <span className="font-mono text-foreground">{deleteTarget.item.filename}</span>?
                  <ul className="mt-3 space-y-1.5 text-sm">
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      The source file record will be permanently deleted
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      {deleteTarget.item.extractions_count > 0 ? (
                        <>All {deleteTarget.item.extractions_count} extraction{deleteTarget.item.extractions_count !== 1 ? 's' : ''} will be deleted</>
                      ) : (
                        <>No extractions to delete</>
                      )}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      Transactions will remain but lose their link
                    </li>
                  </ul>
                </>
              ) : null}
            </Dialog.Description>
            <div className="mt-6 flex justify-end gap-3">
              <Dialog.Close asChild>
                <button className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={confirmDelete}
                disabled={deletingExtractionId !== null || deletingSourceFileId !== null}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {(deletingExtractionId !== null || deletingSourceFileId !== null) ? (
                  <>
                    <Loader2Icon className="h-4 w-4 animate-spin" />
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

      {/* Delete All Confirmation Dialog */}
      <Dialog.Root open={showDeleteAllConfirm} onOpenChange={(open) => !open && setShowDeleteAllConfirm(false)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 animate-in fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded-xl shadow-lg w-full max-w-md p-6 animate-in fade-in-0 zoom-in-95">
            <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
              <div className="p-2 rounded-lg bg-red-500/20">
                <Trash2Icon className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              Delete All Extractions
            </Dialog.Title>
            <Dialog.Description className="mt-3 text-muted-foreground">
              Are you sure you want to delete <span className="font-semibold text-foreground">{extractions.length} extractions</span>?
              <ul className="mt-3 space-y-1.5 text-sm">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  All extraction records will be permanently deleted
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  All associated artifacts will be deleted
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Transactions will remain but lose their extraction link
                </li>
              </ul>
            </Dialog.Description>
            <div className="mt-6 flex justify-end gap-3">
              <Dialog.Close asChild>
                <button className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={confirmDeleteAll}
                disabled={isDeletingAll}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {isDeletingAll ? (
                  <>
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2Icon className="h-4 w-4" />
                    Delete All
                  </>
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Footer />
    </div>
  )
}
