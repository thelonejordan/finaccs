import React, { useState, useEffect, useCallback, useRef } from "react"
import { logError } from "@/lib/logger"
import {
  FileTextIcon,
  PlayIcon,
  PauseIcon,
  Loader2Icon,
  RefreshCwIcon,
  ChevronRightIcon,
  EyeOffIcon,
  EyeIcon,
  Trash2Icon,
  WandIcon,
  TableIcon,
  FolderIcon,
  KeyIcon,
  SettingsIcon,
  TagIcon,
  DatabaseIcon,
  ToggleLeftIcon,
  ToggleRightIcon,
  CreditCardIcon,
  BuildingIcon,
} from "lucide-react"
import { Footer } from "@/components/Footer"
import {
  StatusBadge,
  VisibilityDropdown,
  BulkActionBar,
  ExtractorSelector,
  ConfirmDialog,
  PasswordInput,
  DomainEntitySelector,
  type VisibilityFilter,
  type BulkAction,
} from "@/components/extraction"
import {
  fetchSourceFiles,
  refreshSourceFiles,
  fetchExtractions,
  fetchExtractors,
  extractSourceFile,
  updateSourceFile,
  validatePassword,
  bulkUpdateSourceFiles,
  bulkUpdateExtractions,
  bulkTransformArtifacts,
  transformArtifact,
  previewArtifact,
  fetchDataSources,
  bulkUpdateDataSources,
  updateDataSource,
  loadDataSource,
  unloadDataSource,
  previewDataSource,
  fetchBankAccounts,
  fetchCreditCards,
  type SourceFile,
  type Extraction,
  type ExtractorInfo,
  type DataSourceArtifact,
  type BankAccount,
  type CreditCard,
} from "@/lib/api"

type ViewMode = 'source_files' | 'extractions' | 'data_sources'
type DomainFilter = 'all' | 'bank_account_transactions' | 'credit_card_transactions'

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function JSONHighlight({ json }: { json: string }) {
  const highlightJSON = (text: string): React.ReactNode[] => {
    const result: React.ReactNode[] = []
    let i = 0
    let key = 0

    while (i < text.length) {
      if (/\s/.test(text[i])) {
        let ws = ''
        while (i < text.length && /\s/.test(text[i])) {
          ws += text[i]
          i++
        }
        result.push(ws)
        continue
      }

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

      if ('{}[],:'.includes(text[i])) {
        result.push(
          <span key={key++} className="text-foreground/70">
            {text[i]}
          </span>
        )
        i++
        continue
      }

      result.push(text[i])
      i++
    }

    return result
  }

  return (
    <pre className="p-4 rounded-lg bg-muted/50 border border-border overflow-auto max-h-[400px] text-xs font-mono whitespace-pre">
      {highlightJSON(json)}
    </pre>
  )
}

// Source Files Section
function SourceFilesSection({
  files,
  extractors,
  selectedIds,
  onSelectionChange,
  onExtract,
  extractingId,
  onRefresh,
  isRefreshing,
  visibility,
  onVisibilityChange,
  onBulkAction,
  onDataChange,
}: {
  files: SourceFile[]
  extractors: ExtractorInfo[]
  selectedIds: Set<number>
  onSelectionChange: (ids: Set<number>) => void
  onExtract: (file: SourceFile, password?: string, extractor?: string) => void
  extractingId: number | null
  onRefresh: () => void
  isRefreshing: boolean
  visibility: VisibilityFilter
  onVisibilityChange: (v: VisibilityFilter) => void
  onBulkAction: (action: string) => void
  onDataChange: () => void
}) {
  const [passwordInputId, setPasswordInputId] = useState<number | null>(null)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [editingExtractorId, setEditingExtractorId] = useState<number | null>(null)
  const lastSelectedIndexRef = useRef<number | null>(null)

  const handleSelectAll = () => {
    if (selectedIds.size === files.length) {
      onSelectionChange(new Set())
    } else {
      onSelectionChange(new Set(files.map(f => f.id)))
    }
    lastSelectedIndexRef.current = null
  }

  const handleSelect = (id: number, event: React.MouseEvent) => {
    const currentIndex = files.findIndex(f => f.id === id)

    if (event.shiftKey && lastSelectedIndexRef.current !== null) {
      // Shift-click: select range
      const start = Math.min(lastSelectedIndexRef.current, currentIndex)
      const end = Math.max(lastSelectedIndexRef.current, currentIndex)
      const newSet = new Set(selectedIds)
      for (let i = start; i <= end; i++) {
        newSet.add(files[i].id)
      }
      onSelectionChange(newSet)
    } else {
      // Normal click: toggle single item
      const newSet = new Set(selectedIds)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      onSelectionChange(newSet)
      lastSelectedIndexRef.current = currentIndex
    }
  }

  const handleExtract = (file: SourceFile) => {
    if (passwordInputId === file.id && password) {
      onExtract(file, password)
      setPasswordInputId(null)
      setPassword('')
    } else {
      onExtract(file)
    }
  }

  const handleSavePassword = async (file: SourceFile) => {
    setPasswordError(null)

    // If clearing password, just save
    if (!password) {
      await updateSourceFile(file.source_file_id, { password: '' })
      setPasswordInputId(null)
      setPassword('')
      onDataChange()
      return
    }

    // Validate password first
    setIsValidating(true)
    try {
      const result = await validatePassword(file.source_file_id, password)
      if (result.valid) {
        // Password is correct, save it
        await updateSourceFile(file.source_file_id, { password })
        setPasswordInputId(null)
        setPassword('')
        setPasswordError(null)
        onDataChange()
      } else {
        // Password is invalid
        setPasswordError(result.error || 'Invalid password')
      }
    } catch (error) {
      setPasswordError('Failed to validate password')
    } finally {
      setIsValidating(false)
    }
  }

  const bulkActions: BulkAction[] = [
    { label: 'Extract', icon: <PlayIcon className="h-4 w-4" />, action: 'extract' },
    { label: 'Set Password', icon: <KeyIcon className="h-4 w-4" />, action: 'set_password' },
    { label: 'Set Extractor', icon: <SettingsIcon className="h-4 w-4" />, action: 'set_extractor' },
    { label: 'Set Domain', icon: <TagIcon className="h-4 w-4" />, action: 'set_domain' },
    { label: 'Hide', icon: <EyeOffIcon className="h-4 w-4" />, action: 'hide' },
    { label: 'Unhide', icon: <EyeIcon className="h-4 w-4" />, action: 'unhide' },
  ]

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-4 min-h-[52px]">
        <div className="flex items-center gap-4">
          <VisibilityDropdown value={visibility} onChange={onVisibilityChange} />
        </div>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCwIcon className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <BulkActionBar
        selectedCount={selectedIds.size}
        actions={bulkActions}
        onAction={onBulkAction}
        onClearSelection={() => onSelectionChange(new Set())}
      />

      <div className="overflow-auto max-h-[600px]">
        {files.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No source files found. Click Refresh to scan directories.
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr className="text-xs font-medium text-muted-foreground uppercase">
                <th className="px-4 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === files.length && files.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-border"
                  />
                </th>
                <th className="px-4 py-3 text-left">Filename</th>
                <th className="px-4 py-3 text-left w-20">Domain</th>
                <th className="px-4 py-3 text-left w-36">Extractor</th>
                <th className="px-4 py-3 text-left w-28">Status</th>
                <th className="px-4 py-3 text-right w-20">Size</th>
                <th className="px-4 py-3 text-center w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {files.map(file => (
                <tr
                  key={file.id}
                  className={`hover:bg-accent ${
                    file.hidden ? 'opacity-50' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(file.id)}
                      onClick={(e) => handleSelect(file.id, e)}
                      onChange={() => {}}
                      className="rounded border-border"
                    />
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileTextIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium text-foreground truncate max-w-md" title={file.filename}>
                        {file.filename}
                      </span>
                      {file.hidden && (
                        <EyeOffIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      )}
                    </div>
                    {passwordInputId === file.id && (
                      <div className="mt-2 max-w-sm">
                        <PasswordInput
                          value={password}
                          onChange={(v) => {
                            setPassword(v)
                            setPasswordError(null)
                          }}
                          onSave={() => handleSavePassword(file)}
                          onCancel={() => {
                            setPasswordInputId(null)
                            setPassword('')
                            setPasswordError(null)
                          }}
                          showSaveButtons
                          isLoading={isValidating}
                        />
                        {isValidating && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-blue-600">
                            <Loader2Icon className="h-3 w-3 animate-spin" />
                            Validating password...
                          </div>
                        )}
                        {passwordError && (
                          <div className="mt-1 text-xs text-red-600 dark:text-red-400">
                            {passwordError}
                          </div>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${
                      file.domain === 'bank_account'
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                        : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                    }`}>
                      {file.domain === 'bank_account' ? 'Bank' : 'Credit Card'}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <div className="relative">
                      {editingExtractorId === file.id ? (
                        <ExtractorSelector
                          value={file.extractor}
                          onChange={async (v) => {
                            await updateSourceFile(file.source_file_id, { extractor: v })
                            setEditingExtractorId(null)
                          }}
                          extractors={extractors}
                          domain={file.domain}
                          autoDetected={file.auto_detected_extractor}
                        />
                      ) : (
                        <button
                          onClick={() => setEditingExtractorId(file.id)}
                          className="text-xs text-muted-foreground hover:text-foreground truncate block max-w-full"
                          title={file.extractor || file.auto_detected_extractor || 'Click to select'}
                        >
                          {file.extractor || file.auto_detected_extractor || 'Select...'}
                        </button>
                      )}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <StatusBadge status={file.extraction_status} />
                  </td>

                  <td className="px-4 py-3 text-right">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatFileSize(file.file_size)}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {file.filename.toLowerCase().endsWith('.pdf') ? (
                        <button
                          onClick={() => {
                            setPasswordInputId(file.id)
                            setPassword(file.password || '')
                          }}
                          className={`p-1.5 rounded hover:bg-accent ${
                            file.password
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                          title={file.password ? 'Password set (click to update)' : 'Set password'}
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <circle cx="12" cy="16" r="1" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        </button>
                      ) : (
                        <span
                          className="p-1.5 text-muted-foreground/30 cursor-not-allowed"
                          title="Password not applicable for this file type"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <circle cx="12" cy="16" r="1" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        </span>
                      )}
                      <button
                        onClick={() => handleExtract(file)}
                        disabled={extractingId === file.id}
                        className="p-1.5 rounded text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-50"
                        title="Extract"
                      >
                        {extractingId === file.id ? (
                          <Loader2Icon className="h-4 w-4 animate-spin" />
                        ) : (
                          <PlayIcon className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// Extractions Section
function ExtractionsSection({
  extractions,
  selectedIds,
  onSelectionChange,
  visibility,
  onVisibilityChange,
  onBulkAction,
  onTransformAll,
  isTransforming,
  onDataChange,
}: {
  extractions: Extraction[]
  selectedIds: Set<number>
  onSelectionChange: (ids: Set<number>) => void
  visibility: VisibilityFilter
  onVisibilityChange: (v: VisibilityFilter) => void
  onBulkAction: (action: string) => void
  onTransformAll: (artifactIds: string[]) => void
  isTransforming: boolean
  onDataChange: () => void
}) {
  // Expandable row state
  const [expandedExtractionId, setExpandedExtractionId] = useState<number | null>(null)
  const [transformingArtifactId, setTransformingArtifactId] = useState<string | null>(null)

  // Preview state for expanded row
  const [previewArtifactId, setPreviewArtifactId] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<{
    data: Record<string, unknown>[]
    columns: string[]
    total: number
  } | null>(null)
  const [previewJson, setPreviewJson] = useState<string | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const lastSelectedIndexRef = useRef<number | null>(null)

  const handleSelectAll = () => {
    if (selectedIds.size === extractions.length) {
      onSelectionChange(new Set())
    } else {
      onSelectionChange(new Set(extractions.map(e => e.id)))
    }
    lastSelectedIndexRef.current = null
  }

  const handleSelect = (id: number, event: React.MouseEvent) => {
    const currentIndex = extractions.findIndex(e => e.id === id)

    if (event.shiftKey && lastSelectedIndexRef.current !== null) {
      // Shift-click: select range
      const start = Math.min(lastSelectedIndexRef.current, currentIndex)
      const end = Math.max(lastSelectedIndexRef.current, currentIndex)
      const newSet = new Set(selectedIds)
      for (let i = start; i <= end; i++) {
        newSet.add(extractions[i].id)
      }
      onSelectionChange(newSet)
    } else {
      // Normal click: toggle single item
      const newSet = new Set(selectedIds)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      onSelectionChange(newSet)
      lastSelectedIndexRef.current = currentIndex
    }
  }

  const handleRowClick = (extraction: Extraction, e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('input')) {
      return
    }

    if (expandedExtractionId === extraction.id) {
      setExpandedExtractionId(null)
      setPreviewArtifactId(null)
      setPreviewData(null)
      setPreviewJson(null)
    } else {
      setExpandedExtractionId(extraction.id)
      setPreviewArtifactId(null)
      setPreviewData(null)
      setPreviewJson(null)
    }
  }

  const handleTransformArtifact = async (artifactId: string) => {
    setTransformingArtifactId(artifactId)
    try {
      await transformArtifact(artifactId)
      onDataChange()
    } catch (error) {
      logError("Failed to transform artifact", error)
      alert('Failed to transform artifact')
    } finally {
      setTransformingArtifactId(null)
    }
  }

  const handleTransformAllForExtraction = async (extraction: Extraction) => {
    if (!extraction.artifacts) return

    const artifactIds = extraction.artifacts
      .filter(a => a.transformation_status === 'not_transformed' && a.transformer)
      .map(a => a.artifact_id)

    if (artifactIds.length === 0) {
      alert('No artifacts to transform')
      return
    }

    setTransformingArtifactId('all')
    try {
      await bulkTransformArtifacts(artifactIds)
      onDataChange()
    } catch (error) {
      logError("Failed to transform artifacts", error)
      alert('Failed to transform artifacts')
    } finally {
      setTransformingArtifactId(null)
    }
  }

  const handlePreviewArtifact = async (artifactId: string) => {
    if (previewArtifactId === artifactId) {
      setPreviewArtifactId(null)
      setPreviewData(null)
      setPreviewJson(null)
      return
    }

    setPreviewArtifactId(artifactId)
    setIsLoadingPreview(true)
    setPreviewData(null)
    setPreviewJson(null)
    try {
      const result = await previewArtifact(artifactId, 10)
      if (result.format === 'csv' && Array.isArray(result.data)) {
        setPreviewData({
          data: result.data as Record<string, unknown>[],
          columns: result.columns || [],
          total: result.total || 0,
        })
      } else if (result.format === 'json') {
        setPreviewJson(JSON.stringify(result.data, null, 2))
      } else if (typeof result.data === 'string') {
        setPreviewJson(result.data)
      } else {
        setPreviewJson(JSON.stringify(result.data, null, 2))
      }
    } catch (error) {
      logError("Failed to load preview", error)
    } finally {
      setIsLoadingPreview(false)
    }
  }

  const bulkActions: BulkAction[] = [
    { label: 'Transform All', icon: <WandIcon className="h-4 w-4" />, action: 'transform_all' },
    { label: 'Hide', icon: <EyeOffIcon className="h-4 w-4" />, action: 'hide' },
    { label: 'Unhide', icon: <EyeIcon className="h-4 w-4" />, action: 'unhide' },
    { label: 'Delete', icon: <Trash2Icon className="h-4 w-4" />, action: 'delete', variant: 'danger' },
  ]

  // Get all transformable artifacts from selected extractions
  const getTransformableArtifacts = () => {
    const artifactIds: string[] = []
    extractions.forEach(e => {
      if (selectedIds.has(e.id) && e.artifacts) {
        e.artifacts.forEach(a => {
          if (a.transformation_status === 'not_transformed' && a.transformer) {
            artifactIds.push(a.artifact_id)
          }
        })
      }
    })
    return artifactIds
  }

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-4 min-h-[52px]">
        <div className="flex items-center gap-4">
          <VisibilityDropdown value={visibility} onChange={onVisibilityChange} />
        </div>
        <button
          onClick={() => onTransformAll(getTransformableArtifacts())}
          disabled={isTransforming || getTransformableArtifacts().length === 0}
          className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 ${selectedIds.size === 0 ? 'invisible' : ''}`}
        >
          <WandIcon className={`h-4 w-4 ${isTransforming ? 'animate-pulse' : ''}`} />
          Transform All ({getTransformableArtifacts().length})
        </button>
      </div>

      <BulkActionBar
        selectedCount={selectedIds.size}
        actions={bulkActions}
        onAction={onBulkAction}
        onClearSelection={() => onSelectionChange(new Set())}
      />

      <div className="overflow-auto max-h-[600px]">
        {extractions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No extractions found. Extract a source file to get started.
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr className="text-xs font-medium text-muted-foreground uppercase">
                <th className="px-4 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === extractions.length && extractions.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-border"
                  />
                </th>
                <th className="px-4 py-3 text-left">Source File</th>
                <th className="px-4 py-3 text-left w-32">Extractor</th>
                <th className="px-4 py-3 text-left w-24">Status</th>
                <th className="px-4 py-3 text-center w-20">Artifacts</th>
                <th className="px-4 py-3 text-left w-32">Extracted</th>
                <th className="px-4 py-3 text-center w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {extractions.map(extraction => (
                <React.Fragment key={extraction.id}>
                  <tr
                    onClick={(e) => handleRowClick(extraction, e)}
                    className={`hover:bg-accent cursor-pointer ${
                      extraction.hidden ? 'opacity-50' : ''
                    } ${expandedExtractionId === extraction.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(extraction.id)}
                        onClick={(e) => handleSelect(extraction.id, e)}
                        onChange={() => {}}
                        className="rounded border-border"
                      />
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {extraction.extraction_id}
                        </span>
                        {extraction.hidden && (
                          <EyeOffIcon className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{extraction.source_filename}</span>
                    </td>

                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground">
                        {extraction.extractor_name}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <StatusBadge status={extraction.status} />
                    </td>

                    <td className="px-4 py-3 text-center">
                      <span className="text-sm text-muted-foreground">
                        {extraction.artifacts?.length || 0}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(extraction.extracted_at)}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-center">
                      <ChevronRightIcon className={`h-4 w-4 text-muted-foreground transition-transform ${
                        expandedExtractionId === extraction.id ? 'rotate-90' : ''
                      }`} />
                    </td>
                  </tr>

                  {/* Expanded Row - Artifacts */}
                  {expandedExtractionId === extraction.id && (
                    <tr className="bg-muted">
                      <td colSpan={7} className="px-4 py-4">
                        {extraction.artifacts && extraction.artifacts.length > 0 ? (
                          <div className="space-y-4">
                            {/* Header with Transform All */}
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-medium text-foreground">
                                Artifacts
                              </h4>
                              <button
                                onClick={() => handleTransformAllForExtraction(extraction)}
                                disabled={transformingArtifactId === 'all'}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                              >
                                {transformingArtifactId === 'all' ? (
                                  <Loader2Icon className="h-3 w-3 animate-spin" />
                                ) : (
                                  <WandIcon className="h-3 w-3" />
                                )}
                                Transform All
                              </button>
                            </div>

                            {/* Artifacts Table */}
                            <div className="border border-border rounded-lg overflow-hidden">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-muted text-muted-foreground">
                                    <th className="px-3 py-2 text-left">Artifact ID</th>
                                    <th className="px-3 py-2 text-left">Type</th>
                                    <th className="px-3 py-2 text-left">Format</th>
                                    <th className="px-3 py-2 text-right">Rows</th>
                                    <th className="px-3 py-2 text-left">Status</th>
                                    <th className="px-3 py-2 text-center">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                  {extraction.artifacts.map(artifact => (
                                    <React.Fragment key={artifact.artifact_id}>
                                      <tr className={`bg-card/50 ${previewArtifactId === artifact.artifact_id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                                        <td className="px-3 py-2 font-mono text-muted-foreground">
                                          {artifact.artifact_id}
                                        </td>
                                        <td className="px-3 py-2 text-foreground">
                                          {artifact.artifact_type}
                                          {artifact.artifact_key && (
                                            <span className="ml-1 text-muted-foreground">({artifact.artifact_key})</span>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-muted-foreground">{artifact.content_format}</td>
                                        <td className="px-3 py-2 text-right text-muted-foreground">{artifact.row_count}</td>
                                        <td className="px-3 py-2">
                                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs ${
                                            artifact.transformation_status === 'transformed'
                                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                              : artifact.transformation_status === 'not_transformed'
                                              ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                                              : 'bg-muted text-muted-foreground'
                                          }`}>
                                            {artifact.transformation_status === 'not_applicable' ? 'N/A' : artifact.transformation_status}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                          <div className="flex items-center justify-center gap-1">
                                            <button
                                              onClick={() => handlePreviewArtifact(artifact.artifact_id)}
                                              className={`p-1 rounded hover:bg-accent ${
                                                previewArtifactId === artifact.artifact_id
                                                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
                                                  : 'text-muted-foreground hover:text-foreground'
                                              }`}
                                              title="Preview"
                                            >
                                              <TableIcon className="h-3.5 w-3.5" />
                                            </button>
                                            {artifact.transformer && artifact.transformation_status === 'not_transformed' && (
                                              <button
                                                onClick={() => handleTransformArtifact(artifact.artifact_id)}
                                                disabled={transformingArtifactId === artifact.artifact_id}
                                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 disabled:opacity-50"
                                                title={`Transform with ${artifact.transformer}`}
                                              >
                                                {transformingArtifactId === artifact.artifact_id ? (
                                                  <Loader2Icon className="h-3 w-3 animate-spin" />
                                                ) : (
                                                  <WandIcon className="h-3 w-3" />
                                                )}
                                                Transform
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                      </tr>

                                      {/* Preview Row */}
                                      {previewArtifactId === artifact.artifact_id && (
                                        <tr className="bg-muted/50">
                                          <td colSpan={6} className="px-3 py-3">
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
                                                      <tr key={i} className="hover:bg-accent">
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
                                            ) : previewJson ? (
                                              <div className="overflow-auto border border-border rounded max-h-[400px]">
                                                <JSONHighlight json={previewJson} />
                                              </div>
                                            ) : (
                                              <div className="text-center py-4 text-muted-foreground">
                                                Preview not available for this format
                                              </div>
                                            )}
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-4 text-muted-foreground">
                            No artifacts in this extraction
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// Data Sources Section
function DataSourcesSection({
  dataSources,
  bankAccounts,
  creditCards,
  selectedIds,
  onSelectionChange,
  visibility,
  onVisibilityChange,
  domainFilter,
  onDomainFilterChange,
  onBulkAction,
  onLoad,
  onUnload,
  onToggleEnabled,
  onEntityChange,
  loadingId,
  onRefresh,
  isRefreshing,
}: {
  dataSources: DataSourceArtifact[]
  bankAccounts: BankAccount[]
  creditCards: CreditCard[]
  selectedIds: Set<number>
  onSelectionChange: (ids: Set<number>) => void
  visibility: VisibilityFilter
  onVisibilityChange: (v: VisibilityFilter) => void
  domainFilter: DomainFilter
  onDomainFilterChange: (v: DomainFilter) => void
  onBulkAction: (action: string) => void
  onLoad: (ds: DataSourceArtifact) => void
  onUnload: (ds: DataSourceArtifact) => void
  onToggleEnabled: (ds: DataSourceArtifact) => void
  onEntityChange: (ds: DataSourceArtifact, entityId: number | null) => void
  loadingId: number | null
  onRefresh: () => void
  isRefreshing: boolean
}) {
  // Preview state
  const [previewArtifactId, setPreviewArtifactId] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<{
    data: Record<string, unknown>[]
    columns: string[]
    total: number
  } | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const lastSelectedIndexRef = useRef<number | null>(null)

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

  const handleSelectAll = () => {
    if (selectedIds.size === dataSources.length) {
      onSelectionChange(new Set())
    } else {
      onSelectionChange(new Set(dataSources.map(ds => ds.id)))
    }
    lastSelectedIndexRef.current = null
  }

  const handleSelect = (id: number, event: React.MouseEvent) => {
    const currentIndex = dataSources.findIndex(ds => ds.id === id)

    if (event.shiftKey && lastSelectedIndexRef.current !== null) {
      // Shift-click: select range
      const start = Math.min(lastSelectedIndexRef.current, currentIndex)
      const end = Math.max(lastSelectedIndexRef.current, currentIndex)
      const newSet = new Set(selectedIds)
      for (let i = start; i <= end; i++) {
        newSet.add(dataSources[i].id)
      }
      onSelectionChange(newSet)
    } else {
      // Normal click: toggle single item
      const newSet = new Set(selectedIds)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      onSelectionChange(newSet)
      lastSelectedIndexRef.current = currentIndex
    }
  }

  const handlePreviewArtifact = async (artifactId: string) => {
    if (previewArtifactId === artifactId) {
      setPreviewArtifactId(null)
      setPreviewData(null)
      return
    }

    setPreviewArtifactId(artifactId)
    setIsLoadingPreview(true)
    try {
      const result = await previewDataSource(artifactId, 10)
      setPreviewData({
        data: result.data,
        columns: result.columns,
        total: result.total,
      })
    } catch (error) {
      logError("Failed to load preview", error)
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

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-4 min-h-[52px]">
        <div className="flex items-center gap-4">
          <VisibilityDropdown value={visibility} onChange={onVisibilityChange} />
        </div>

        {/* Domain tabs */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-muted rounded-lg p-1">
            <button
              onClick={() => onDomainFilterChange('all')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                domainFilter === 'all'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All
            </button>
            <button
              onClick={() => onDomainFilterChange('bank_account_transactions')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                domainFilter === 'bank_account_transactions'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Bank Account
            </button>
            <button
              onClick={() => onDomainFilterChange('credit_card_transactions')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                domainFilter === 'credit_card_transactions'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Credit Card
            </button>
          </div>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCwIcon className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <BulkActionBar
        selectedCount={selectedIds.size}
        actions={bulkActions}
        onAction={onBulkAction}
        onClearSelection={() => onSelectionChange(new Set())}
      />

      <div ref={listRef} className="overflow-auto max-h-[600px]">
        {dataSources.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No data source artifacts found. Transform extraction artifacts to create data sources.
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr className="text-xs font-medium text-muted-foreground uppercase align-middle">
                <th className="px-4 py-3 text-left w-10 align-middle">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === dataSources.length && dataSources.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-border"
                  />
                </th>
                <th className="px-4 py-3 text-left align-middle">Artifact</th>
                <th className="px-4 py-3 text-left w-20 align-middle">Type</th>
                <th className="px-4 py-3 text-left w-36 align-middle">Entity</th>
                <th className="px-4 py-3 text-right w-16 align-middle">Rows</th>
                <th className="px-4 py-3 text-left w-20 align-middle">Status</th>
                <th className="px-4 py-3 text-center w-16 align-middle">Enabled</th>
                <th className="px-4 py-3 text-center w-16 align-middle">Actions</th>
                <th className="px-4 py-3 text-left w-24 align-middle">Loaded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {dataSources.map(ds => (
                <React.Fragment key={ds.id}>
                  <tr
                    onClick={() => handlePreviewArtifact(ds.artifact_id)}
                    className={`hover:bg-accent cursor-pointer ${
                      ds.hidden ? 'opacity-50' : ''
                    } ${!ds.enabled ? 'bg-background/30' : ''} ${
                      previewArtifactId === ds.artifact_id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(ds.id)}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSelect(ds.id, e)
                        }}
                        onChange={() => {}}
                        className="rounded border-border"
                      />
                    </td>

                    <td className="px-4 py-3">
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
                    </td>

                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded ${
                        ds.data_source_target === 'bank_account_transactions'
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                          : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                      }`}>
                        {ds.data_source_target === 'bank_account_transactions' ? 'Bank' : 'CC'}
                      </span>
                    </td>

                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <DomainEntitySelector
                        type={ds.data_source_target === 'bank_account_transactions' ? 'bank_account' : 'credit_card'}
                        value={ds.bank_account_id || ds.credit_card_id}
                        onChange={(value) => onEntityChange(ds, value)}
                        bankAccounts={bankAccounts}
                        creditCards={creditCards}
                        placeholder="Unassigned"
                      />
                    </td>

                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-muted-foreground">
                        {ds.row_count}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <StatusBadge status={ds.status} />
                    </td>

                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onToggleEnabled(ds)}
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
                    </td>

                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      {ds.status === 'loaded' ? (
                        <button
                          onClick={() => onUnload(ds)}
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
                          onClick={() => onLoad(ds)}
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
                    </td>

                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground" title={ds.loaded_at ? `Loaded: ${ds.loaded_at}` : ''}>
                        {ds.loaded_at ? formatDate(ds.loaded_at) : '-'}
                      </span>
                    </td>
                  </tr>

                  {/* Preview Row */}
                  {previewArtifactId === ds.artifact_id && (
                    <tr className="bg-muted">
                      <td colSpan={9} className="px-4 py-4">
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
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// Main Page Component
export function ExtractionsV2Page() {
  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('source_files')

  // Data state
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([])
  const [extractions, setExtractions] = useState<Extraction[]>([])
  const [extractors, setExtractors] = useState<ExtractorInfo[]>([])
  const [dataSources, setDataSources] = useState<DataSourceArtifact[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [creditCards, setCreditCards] = useState<CreditCard[]>([])

  // Loading states
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isDsRefreshing, setIsDsRefreshing] = useState(false)
  const [extractingId, setExtractingId] = useState<number | null>(null)
  const [isTransforming, setIsTransforming] = useState(false)
  const [dsLoadingId, setDsLoadingId] = useState<number | null>(null)

  // Visibility filters
  const [sourceFilesVisibility, setSourceFilesVisibility] = useState<VisibilityFilter>('visible')
  const [extractionsVisibility, setExtractionsVisibility] = useState<VisibilityFilter>('visible')
  const [dataSourcesVisibility, setDataSourcesVisibility] = useState<VisibilityFilter>('visible')
  const [domainFilter, setDomainFilter] = useState<DomainFilter>('all')

  // Selection state
  const [selectedSourceFiles, setSelectedSourceFiles] = useState<Set<number>>(new Set())
  const [selectedExtractions, setSelectedExtractions] = useState<Set<number>>(new Set())
  const [selectedDataSources, setSelectedDataSources] = useState<Set<number>>(new Set())

  // Confirm dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    action: () => void
    variant?: 'default' | 'danger'
  }>({ open: false, title: '', description: '', action: () => {} })

  // Bulk action dialogs
  const [bulkPasswordDialog, setBulkPasswordDialog] = useState<{ open: boolean; password: string; isLoading: boolean }>({ open: false, password: '', isLoading: false })
  const [bulkExtractorDialog, setBulkExtractorDialog] = useState<{ open: boolean; extractor: string }>({ open: false, extractor: '' })
  const [bulkDomainDialog, setBulkDomainDialog] = useState<{ open: boolean; domain: 'bank_account' | 'credit_card' }>({ open: false, domain: 'bank_account' })
  const [isBulkExtracting, setIsBulkExtracting] = useState(false)

  // Entity assignment dialog (for data sources)
  const [assignDialog, setAssignDialog] = useState<{
    open: boolean
    type: 'bank_account' | 'credit_card'
    ids: number[]
  } | null>(null)
  const [assignValue, setAssignValue] = useState<number | null>(null)

  const loadData = useCallback(async () => {
    setLoadError(null)
    try {
      const [filesRes, extractionsRes, extractorsRes, dsRes, accountsRes, cardsRes] = await Promise.all([
        fetchSourceFiles({ visibility: sourceFilesVisibility }),
        fetchExtractions({ visibility: extractionsVisibility }),
        fetchExtractors(),
        fetchDataSources({
          visibility: dataSourcesVisibility,
          domain: domainFilter === 'all' ? undefined : domainFilter,
        }),
        fetchBankAccounts(),
        fetchCreditCards(),
      ])
      setSourceFiles(filesRes.data || [])
      setExtractions(extractionsRes.data || [])
      setExtractors(extractorsRes.data || [])
      setDataSources(dsRes.data || [])
      setBankAccounts(accountsRes.accounts || [])
      setCreditCards(cardsRes.cards || [])
    } catch (error) {
      logError("Failed to load data", error)
      setLoadError(error instanceof Error ? error.message : 'Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }, [sourceFilesVisibility, extractionsVisibility, dataSourcesVisibility, domainFilter])

  useEffect(() => {
    document.title = "Extractions v2 | FinAccs"
    loadData()
  }, [loadData])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      const result = await refreshSourceFiles()
      await loadData()
      if (result.errors.length > 0) {
        alert(`Refresh completed with errors:\nCreated: ${result.created}\nSkipped: ${result.skipped}\nErrors: ${result.errors.length}`)
      } else if (result.created > 0) {
        alert(`Added ${result.created} new file(s)`)
      }
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleDsRefresh = async () => {
    setIsDsRefreshing(true)
    try {
      await loadData()
    } finally {
      setIsDsRefreshing(false)
    }
  }

  const handleExtract = async (file: SourceFile, password?: string, extractor?: string) => {
    setExtractingId(file.id)
    try {
      const result = await extractSourceFile(file.source_file_id, { password, extractor })
      if (result.success) {
        await loadData()
      } else if (result.needs_password) {
        alert('Password required for this file')
      } else {
        alert(result.error || 'Extraction failed')
      }
    } catch (error) {
      logError("Extraction failed", error)
      alert('Extraction failed')
    } finally {
      setExtractingId(null)
    }
  }

  const handleSourceFilesBulkAction = async (action: string) => {
    const ids = Array.from(selectedSourceFiles)
    if (ids.length === 0) return

    if (action === 'hide' || action === 'unhide') {
      await bulkUpdateSourceFiles(ids, action)
      await loadData()
      setSelectedSourceFiles(new Set())
    } else if (action === 'set_password') {
      setBulkPasswordDialog({ open: true, password: '', isLoading: false })
    } else if (action === 'set_extractor') {
      setBulkExtractorDialog({ open: true, extractor: '' })
    } else if (action === 'set_domain') {
      setBulkDomainDialog({ open: true, domain: 'bank_account' })
    } else if (action === 'extract') {
      setIsBulkExtracting(true)
      const selectedFiles = sourceFiles.filter(f => selectedSourceFiles.has(f.id))
      let successCount = 0
      let errorCount = 0
      for (const file of selectedFiles) {
        try {
          const result = await extractSourceFile(file.source_file_id)
          if (result.success) {
            successCount++
          } else {
            errorCount++
          }
        } catch {
          errorCount++
        }
      }
      setIsBulkExtracting(false)
      await loadData()
      setSelectedSourceFiles(new Set())
      alert(`Extraction complete: ${successCount} succeeded, ${errorCount} failed`)
    }
  }

  const handleBulkPasswordSubmit = async () => {
    const ids = Array.from(selectedSourceFiles)
    const selectedFiles = sourceFiles.filter(f => selectedSourceFiles.has(f.id))
    const password = bulkPasswordDialog.password

    // If clearing password, just update all
    if (!password) {
      await bulkUpdateSourceFiles(ids, 'set_password', '')
      await loadData()
      setSelectedSourceFiles(new Set())
      setBulkPasswordDialog({ open: false, password: '', isLoading: false })
      return
    }

    setBulkPasswordDialog(prev => ({ ...prev, isLoading: true }))

    // Validate password for each file before saving
    let successCount = 0
    let skipCount = 0
    let failCount = 0

    for (const file of selectedFiles) {
      try {
        const result = await validatePassword(file.source_file_id, password)
        if (result.valid) {
          await updateSourceFile(file.source_file_id, { password })
          successCount++
        } else if (result.error?.includes('not password protected') || result.error?.includes('not encrypted')) {
          // File doesn't need a password
          skipCount++
        } else {
          // Wrong password
          failCount++
        }
      } catch {
        failCount++
      }
    }

    await loadData()
    setSelectedSourceFiles(new Set())
    setBulkPasswordDialog({ open: false, password: '', isLoading: false })

    // Show summary
    const messages = []
    if (successCount > 0) messages.push(`${successCount} file(s) updated`)
    if (skipCount > 0) messages.push(`${skipCount} file(s) skipped (not password protected)`)
    if (failCount > 0) messages.push(`${failCount} file(s) failed (wrong password)`)
    if (messages.length > 0) {
      alert(messages.join('\n'))
    }
  }

  const handleBulkExtractorSubmit = async () => {
    const ids = Array.from(selectedSourceFiles)
    await bulkUpdateSourceFiles(ids, 'set_extractor', bulkExtractorDialog.extractor)
    await loadData()
    setSelectedSourceFiles(new Set())
    setBulkExtractorDialog({ open: false, extractor: '' })
  }

  const handleBulkDomainSubmit = async () => {
    const ids = Array.from(selectedSourceFiles)
    await bulkUpdateSourceFiles(ids, 'set_domain', bulkDomainDialog.domain)
    await loadData()
    setSelectedSourceFiles(new Set())
    setBulkDomainDialog({ open: false, domain: 'bank_account' })
  }

  const handleExtractionsBulkAction = async (action: string) => {
    const ids = Array.from(selectedExtractions)
    if (action === 'delete') {
      setConfirmDialog({
        open: true,
        title: 'Delete Extractions',
        description: `Are you sure you want to delete ${ids.length} extraction(s)? This action cannot be undone.`,
        variant: 'danger',
        action: async () => {
          await bulkUpdateExtractions(ids, 'delete')
          await loadData()
          setSelectedExtractions(new Set())
          setConfirmDialog(prev => ({ ...prev, open: false }))
        },
      })
    } else if (action === 'hide' || action === 'unhide') {
      await bulkUpdateExtractions(ids, action)
      await loadData()
      setSelectedExtractions(new Set())
    } else if (action === 'transform_all') {
      const artifactIds: string[] = []
      extractions.forEach(e => {
        if (selectedExtractions.has(e.id) && e.artifacts) {
          e.artifacts.forEach(a => {
            if (a.transformation_status === 'not_transformed' && a.transformer) {
              artifactIds.push(a.artifact_id)
            }
          })
        }
      })
      if (artifactIds.length > 0) {
        await handleTransformAll(artifactIds)
        setSelectedExtractions(new Set())
      }
    }
  }

  const handleTransformAll = async (artifactIds: string[]) => {
    if (artifactIds.length === 0) return
    setIsTransforming(true)
    try {
      await bulkTransformArtifacts(artifactIds)
      await loadData()
    } finally {
      setIsTransforming(false)
    }
  }

  // Data Source handlers
  const handleDsLoad = async (ds: DataSourceArtifact) => {
    setDsLoadingId(ds.id)
    try {
      const result = await loadDataSource(ds.artifact_id)
      if (!result.success) {
        alert(result.error || 'Load failed')
      }
      await loadData()
    } finally {
      setDsLoadingId(null)
    }
  }

  const handleDsUnload = async (ds: DataSourceArtifact) => {
    setConfirmDialog({
      open: true,
      title: 'Unload Data Source',
      description: `This will delete all ${ds.row_count} transactions loaded from this data source. The artifact will be preserved for reloading. Continue?`,
      variant: 'danger',
      action: async () => {
        setDsLoadingId(ds.id)
        setConfirmDialog(prev => ({ ...prev, open: false }))
        try {
          const result = await unloadDataSource(ds.artifact_id)
          if (!result.success) {
            alert(result.error || 'Unload failed')
          }
          await loadData()
        } finally {
          setDsLoadingId(null)
        }
      },
    })
  }

  const handleDsToggleEnabled = async (ds: DataSourceArtifact) => {
    await updateDataSource(ds.artifact_id, { enabled: !ds.enabled })
    await loadData()
  }

  const handleDsEntityChange = async (ds: DataSourceArtifact, entityId: number | null) => {
    if (ds.data_source_target === 'bank_account_transactions') {
      await updateDataSource(ds.artifact_id, { bank_account_id: entityId })
    } else {
      await updateDataSource(ds.artifact_id, { credit_card_id: entityId })
    }
    await loadData()
  }

  const handleDataSourcesBulkAction = async (action: string) => {
    const ids = Array.from(selectedDataSources)

    if (action === 'delete') {
      setConfirmDialog({
        open: true,
        title: 'Delete Data Sources',
        description: `Are you sure you want to delete ${ids.length} data source(s)? This will also delete all associated transactions. This action cannot be undone.`,
        variant: 'danger',
        action: async () => {
          await bulkUpdateDataSources(ids, 'delete')
          await loadData()
          setSelectedDataSources(new Set())
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
            await bulkUpdateDataSources(ids, action)
            await loadData()
            setSelectedDataSources(new Set())
            setConfirmDialog(prev => ({ ...prev, open: false }))
          },
        })
      } else {
        await bulkUpdateDataSources(ids, action)
        await loadData()
        setSelectedDataSources(new Set())
      }
    } else if (action === 'assign_bank_account') {
      setAssignDialog({ open: true, type: 'bank_account', ids })
      setAssignValue(null)
    } else if (action === 'assign_credit_card') {
      setAssignDialog({ open: true, type: 'credit_card', ids })
      setAssignValue(null)
    } else {
      await bulkUpdateDataSources(ids, action as 'hide' | 'unhide' | 'enable' | 'disable')
      await loadData()
      setSelectedDataSources(new Set())
    }
  }

  const handleAssignConfirm = async () => {
    if (!assignDialog) return
    const action = assignDialog.type === 'bank_account' ? 'set_bank_account' : 'set_credit_card'
    await bulkUpdateDataSources(assignDialog.ids, action, assignValue ?? undefined)
    await loadData()
    setSelectedDataSources(new Set())
    setAssignDialog(null)
  }

  if (isLoading) {
    return (
      <>
        <main className="max-w-7xl mx-auto px-4 py-6 flex justify-center items-center h-96">
          <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
        </main>
        <Footer />
      </>
    )
  }

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <DatabaseIcon className="h-6 w-6 text-primary" />
              </div>
              Extractions v2
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage source files, extractions, and data sources
            </p>
          </div>

          {/* View Toggle */}
          <div className="flex items-center bg-muted rounded-lg p-1">
            <button
              onClick={() => setViewMode('source_files')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-2 ${
                viewMode === 'source_files'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <FolderIcon className="h-4 w-4" />
              Source Files
            </button>
            <button
              onClick={() => setViewMode('extractions')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-2 ${
                viewMode === 'extractions'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <TableIcon className="h-4 w-4" />
              Extractions
            </button>
            <button
              onClick={() => setViewMode('data_sources')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-2 ${
                viewMode === 'data_sources'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <DatabaseIcon className="h-4 w-4" />
              Data Sources
            </button>
          </div>
        </header>

        {loadError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
            <strong>Error loading data:</strong> {loadError}
          </div>
        )}

        {/* Conditional rendering based on view mode */}
        {viewMode === 'source_files' && (
          <SourceFilesSection
            files={sourceFiles}
            extractors={extractors}
            selectedIds={selectedSourceFiles}
            onSelectionChange={setSelectedSourceFiles}
            onExtract={handleExtract}
            extractingId={extractingId}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            visibility={sourceFilesVisibility}
            onVisibilityChange={setSourceFilesVisibility}
            onBulkAction={handleSourceFilesBulkAction}
            onDataChange={loadData}
          />
        )}

        {viewMode === 'extractions' && (
          <ExtractionsSection
            extractions={extractions}
            selectedIds={selectedExtractions}
            onSelectionChange={setSelectedExtractions}
            visibility={extractionsVisibility}
            onVisibilityChange={setExtractionsVisibility}
            onBulkAction={handleExtractionsBulkAction}
            onTransformAll={handleTransformAll}
            isTransforming={isTransforming}
            onDataChange={loadData}
          />
        )}

        {viewMode === 'data_sources' && (
          <DataSourcesSection
            dataSources={dataSources}
            bankAccounts={bankAccounts}
            creditCards={creditCards}
            selectedIds={selectedDataSources}
            onSelectionChange={setSelectedDataSources}
            visibility={dataSourcesVisibility}
            onVisibilityChange={setDataSourcesVisibility}
            domainFilter={domainFilter}
            onDomainFilterChange={setDomainFilter}
            onBulkAction={handleDataSourcesBulkAction}
            onLoad={handleDsLoad}
            onUnload={handleDsUnload}
            onToggleEnabled={handleDsToggleEnabled}
            onEntityChange={handleDsEntityChange}
            loadingId={dsLoadingId}
            onRefresh={handleDsRefresh}
            isRefreshing={isDsRefreshing}
          />
        )}
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

      {/* Bulk Password Dialog */}
      {bulkPasswordDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => !bulkPasswordDialog.isLoading && setBulkPasswordDialog({ open: false, password: '', isLoading: false })} />
          <div className="relative bg-card rounded-xl border border-border shadow-sm-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Set Password for {selectedSourceFiles.size} File(s)
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-1">
                Password
              </label>
              <input
                type="password"
                value={bulkPasswordDialog.password}
                onChange={(e) => setBulkPasswordDialog(prev => ({ ...prev, password: e.target.value }))}
                disabled={bulkPasswordDialog.isLoading}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                placeholder="Enter password for selected files"
                autoFocus
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {bulkPasswordDialog.isLoading
                  ? 'Validating password for each file...'
                  : 'Leave empty to clear password. Only files that need the password will be updated.'}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setBulkPasswordDialog({ open: false, password: '', isLoading: false })}
                disabled={bulkPasswordDialog.isLoading}
                className="px-4 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkPasswordSubmit}
                disabled={bulkPasswordDialog.isLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50 inline-flex items-center gap-2"
              >
                {bulkPasswordDialog.isLoading && <Loader2Icon className="h-4 w-4 animate-spin" />}
                {bulkPasswordDialog.isLoading ? 'Validating...' : `Apply to ${selectedSourceFiles.size} File(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Extractor Dialog */}
      {bulkExtractorDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setBulkExtractorDialog({ open: false, extractor: '' })} />
          <div className="relative bg-card rounded-xl border border-border shadow-sm-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Set Extractor for {selectedSourceFiles.size} File(s)
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-1">
                Extractor
              </label>
              <select
                value={bulkExtractorDialog.extractor}
                onChange={(e) => setBulkExtractorDialog(prev => ({ ...prev, extractor: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Auto-detect</option>
                {extractors.map(e => (
                  <option key={e.name} value={e.name}>
                    {e.name} ({e.supported_extensions.join(', ')})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setBulkExtractorDialog({ open: false, extractor: '' })}
                className="px-4 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkExtractorSubmit}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
              >
                Apply to {selectedSourceFiles.size} File(s)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Domain Dialog */}
      {bulkDomainDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setBulkDomainDialog({ open: false, domain: 'bank_account' })} />
          <div className="relative bg-card rounded-xl border border-border shadow-sm-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Set Domain for {selectedSourceFiles.size} File(s)
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-1">
                Domain
              </label>
              <select
                value={bulkDomainDialog.domain}
                onChange={(e) => setBulkDomainDialog(prev => ({ ...prev, domain: e.target.value as 'bank_account' | 'credit_card' }))}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-blue-500"
              >
                <option value="bank_account">Bank Account</option>
                <option value="credit_card">Credit Card</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setBulkDomainDialog({ open: false, domain: 'bank_account' })}
                className="px-4 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDomainSubmit}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
              >
                Apply to {selectedSourceFiles.size} File(s)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Entity Dialog (for data sources) */}
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

      {/* Bulk Extracting Overlay */}
      {isBulkExtracting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-xl border border-border shadow-sm-xl p-6 flex items-center gap-4">
            <Loader2Icon className="h-6 w-6 animate-spin text-blue-600" />
            <span className="text-foreground">Extracting files...</span>
          </div>
        </div>
      )}
    </>
  )
}
