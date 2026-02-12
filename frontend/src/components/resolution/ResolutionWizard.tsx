import { useState, useEffect } from "react"
import {
  XIcon,
  CheckIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  Loader2Icon,
  AlertCircleIcon,
  StarIcon,
  LayersIcon,
  RotateCcwIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from "lucide-react"
import * as Dialog from "@radix-ui/react-dialog"
import {
  fetchResolutionSession,
  generateSuggestions,
  fetchSuggestions,
  confirmSuggestion,
  executeResolution,
  type ResolutionSession,
  type ResolutionSuggestion,
} from "@/lib/api"

interface ResolutionWizardProps {
  sessionId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete?: () => void
}

type Step = "generating" | "review" | "executing" | "complete"

export function ResolutionWizard({ sessionId, open, onOpenChange, onComplete }: ResolutionWizardProps) {
  const [step, setStep] = useState<Step>("generating")
  const [session, setSession] = useState<ResolutionSession | null>(null)
  const [suggestions, setSuggestions] = useState<ResolutionSuggestion[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPrimary, setSelectedPrimary] = useState<number | null>(null)
  const [resolvedCount, setResolvedCount] = useState(0)
  const [bulkPrimarySourceIndex, setBulkPrimarySourceIndex] = useState<number | null>(null)

  // Get unique source files from all suggestions
  const getUniqueSources = () => {
    const sourceSet = new Map<string, { file: string; index: number }>()
    suggestions.forEach((s) => {
      (s.transactions || []).forEach((txn, idx) => {
        if (txn.source_file && !sourceSet.has(txn.source_file)) {
          sourceSet.set(txn.source_file, { file: txn.source_file, index: idx })
        }
      })
    })
    return Array.from(sourceSet.values())
  }

  const handleApplyBulkPrimary = async () => {
    if (bulkPrimarySourceIndex === null) return

    setLoading(true)
    try {
      // Apply bulk primary to all suggestions
      const updatedSuggestions = [...suggestions]
      for (let i = 0; i < suggestions.length; i++) {
        const suggestion = suggestions[i]
        const txn = suggestion.transactions?.[bulkPrimarySourceIndex]
        if (txn) {
          await confirmSuggestion(sessionId, suggestion.id, {
            status: "confirmed",
            primary_id: txn.id,
          })
          // Update local state immediately
          updatedSuggestions[i] = {
            ...suggestion,
            status: "confirmed",
            confirmed_primary_id: txn.id,
          }
        }
      }
      // Update state with new values
      setSuggestions(updatedSuggestions)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply bulk primary")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && sessionId) {
      loadSession()
    }
  }, [open, sessionId])

  const loadSession = async () => {
    setLoading(true)
    setError(null)
    try {
      const sessionData = await fetchResolutionSession(sessionId)
      setSession(sessionData)

      if (sessionData.status === "suggesting") {
        setStep("generating")
        await generateAndLoadSuggestions()
      } else if (sessionData.status === "review") {
        setStep("review")
        await loadSuggestions()
      } else if (sessionData.status === "completed") {
        // For completed sessions, load suggestions in review mode to allow editing primaries
        setStep("review")
        await loadSuggestions()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session")
    } finally {
      setLoading(false)
    }
  }

  const generateAndLoadSuggestions = async () => {
    setLoading(true)
    try {
      const data = await generateSuggestions(sessionId)
      setSuggestions(data.suggestions || [])
      setCurrentIndex(0)
      setStep("review")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate suggestions")
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }

  const loadSuggestions = async () => {
    setLoading(true)
    try {
      const data = await fetchSuggestions(sessionId)
      const existingSuggestions = data.suggestions || []
      setSuggestions(existingSuggestions)
      // Find first pending suggestion, or start at 0 if none pending
      const pendingIndex = existingSuggestions.findIndex((s) => s.status === "pending")
      const startIndex = pendingIndex >= 0 ? pendingIndex : 0
      setCurrentIndex(startIndex)
      // Set selected primary from the current suggestion's confirmed_primary_id
      const currentSuggestion = existingSuggestions[startIndex]
      if (currentSuggestion?.confirmed_primary_id) {
        setSelectedPrimary(currentSuggestion.confirmed_primary_id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load suggestions")
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async (status: "confirmed" | "rejected" | "pending") => {
    const current = suggestions[currentIndex]
    if (!current) return

    setLoading(true)
    try {
      await confirmSuggestion(sessionId, current.id, {
        status,
        primary_id: status === "confirmed" ? selectedPrimary || undefined : undefined,
      })

      // Update local state
      setSuggestions((prev) =>
        prev.map((s, i) =>
          i === currentIndex
            ? { ...s, status, confirmed_primary_id: status === "confirmed" ? selectedPrimary : null }
            : s
        )
      )

      // If not reverting, move to next pending
      if (status !== "pending") {
        const nextPending = suggestions.findIndex((s, i) => i > currentIndex && s.status === "pending")
        if (nextPending >= 0) {
          setCurrentIndex(nextPending)
          setSelectedPrimary(null)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update suggestion")
    } finally {
      setLoading(false)
    }
  }

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      const prev = suggestions[currentIndex - 1]
      setSelectedPrimary(prev?.confirmed_primary_id || null)
    }
  }

  const handleNext = () => {
    if (currentIndex < suggestions.length - 1) {
      setCurrentIndex(currentIndex + 1)
      const next = suggestions[currentIndex + 1]
      setSelectedPrimary(next?.confirmed_primary_id || null)
    }
  }

  const handleExecute = async () => {
    setStep("executing")
    setLoading(true)
    try {
      const { resolved_count } = await executeResolution(sessionId)
      setResolvedCount(resolved_count)
      setStep("complete")
      onComplete?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to execute resolution")
      setStep("review")
    } finally {
      setLoading(false)
    }
  }

  const currentSuggestion = suggestions?.[currentIndex]
  const pendingCount = suggestions?.filter((s) => s.status === "pending").length ?? 0
  const confirmedCount = suggestions?.filter((s) => s.status === "confirmed").length ?? 0

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card rounded-xl shadow-lg border border-border w-full max-w-3xl max-h-[90vh] overflow-hidden z-50">
          {/* Header */}
          <div className="p-6 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <Dialog.Title className="text-lg font-semibold">
                  Transaction Resolution
                </Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">
                  Review and confirm matched transactions
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button className="p-1.5 rounded-lg hover:bg-accent transition-colors">
                  <XIcon className="h-5 w-5" />
                </button>
              </Dialog.Close>
            </div>

            {/* Progress Steps */}
            <div className="flex items-center gap-4 mt-4">
              <StepIndicator
                step={1}
                label="Generate"
                active={step === "generating"}
                complete={step !== "generating"}
              />
              <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
              <StepIndicator
                step={2}
                label="Review"
                active={step === "review"}
                complete={step === "executing" || step === "complete"}
              />
              <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
              <StepIndicator
                step={3}
                label="Execute"
                active={step === "executing"}
                complete={step === "complete"}
              />
            </div>
          </div>

          {/* Content */}
          <div className="p-6 max-h-[60vh] overflow-y-auto">
            {error && (
              <div className="flex items-center gap-2 p-4 rounded-lg bg-red-500/10 text-red-500 mb-4">
                <AlertCircleIcon className="h-5 w-5" />
                <span>{error}</span>
              </div>
            )}

            {step === "generating" && (
              <div className="text-center py-12">
                <Loader2Icon className="h-10 w-10 animate-spin mx-auto text-primary" />
                <p className="mt-4 font-medium">Generating match suggestions...</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Analyzing transactions across data sources
                </p>
              </div>
            )}

            {step === "review" && currentSuggestion && (
              <div className="space-y-4">
                {/* Bulk Primary Source Selection */}
                {suggestions.length > 1 && (
                  <div className="p-3 rounded-lg bg-muted/50 border border-border">
                    <p className="text-sm font-medium mb-2">Set primary source for all suggestions:</p>
                    <div className="flex items-center gap-2">
                      <select
                        value={bulkPrimarySourceIndex ?? ""}
                        onChange={(e) => setBulkPrimarySourceIndex(e.target.value ? Number(e.target.value) : null)}
                        className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-background"
                      >
                        <option value="">Select a source...</option>
                        {getUniqueSources().map((src, idx) => (
                          <option key={src.file} value={idx}>
                            Source {idx + 1}: {src.file}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={handleApplyBulkPrimary}
                        disabled={loading || bulkPrimarySourceIndex === null}
                        className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 font-medium"
                      >
                        Apply to All
                      </button>
                    </div>
                  </div>
                )}

                {/* Progress */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Suggestion {currentIndex + 1} of {suggestions.length}
                  </span>
                  <span className="text-muted-foreground">
                    {confirmedCount} confirmed, {pendingCount} remaining
                  </span>
                </div>

                {/* Match Score */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Match Score:</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${currentSuggestion.suggestion_score * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">
                    {Math.round(currentSuggestion.suggestion_score * 100)}%
                  </span>
                </div>

                {/* Match Signals */}
                {currentSuggestion.match_signals && Object.keys(currentSuggestion.match_signals).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(currentSuggestion.match_signals)
                      .filter(([key]) => key !== "reference") // Remove reference from display
                      .map(([key, value]) => (
                        <span
                          key={key}
                          className={`px-2 py-1 rounded-full text-xs ${
                            value
                              ? "bg-green-500/20 text-green-700 dark:text-green-400"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {key}: {value ? "✓" : "✗"}
                        </span>
                      ))}
                  </div>
                )}

                {/* Transaction Cards */}
                <div className="space-y-3">
                  <p className="text-sm font-medium">Select the primary source:</p>
                  {(currentSuggestion.transactions || []).map((txn, idx) => {
                    const isCredit = txn.amount > 0
                    // Check if this is the primary - confirmed takes precedence, then user selection
                    const isPrimary = currentSuggestion.confirmed_primary_id === txn.id ||
                      (currentSuggestion.confirmed_primary_id === null && selectedPrimary === txn.id)
                    return (
                      <button
                        key={`${txn.type}-${txn.id}`}
                        onClick={() => setSelectedPrimary(txn.id)}
                        className={`w-full p-4 rounded-lg border text-left transition-colors ${
                          isPrimary
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-accent"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              {isPrimary && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary">
                                  <StarIcon className="h-3 w-3" />
                                  Primary
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground uppercase">
                                Source {idx + 1}
                              </span>
                              {txn.source_file && (
                                <span className="text-xs text-muted-foreground">
                                  • {txn.source_file}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm text-muted-foreground">{txn.date}</span>
                              <span className="text-sm">•</span>
                              <span className={`inline-flex items-center gap-1 font-medium ${
                                isCredit ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                              }`}>
                                {isCredit ? (
                                  <ArrowUpIcon className="h-3.5 w-3.5" />
                                ) : (
                                  <ArrowDownIcon className="h-3.5 w-3.5" />
                                )}
                                ₹{Math.abs(txn.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <p className="font-medium line-clamp-2">{txn.narration}</p>
                          </div>
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-3 ${
                              isPrimary
                                ? "border-primary bg-primary"
                                : "border-muted-foreground"
                            }`}
                          >
                            {isPrimary && (
                              <CheckIcon className="h-3 w-3 text-primary-foreground" />
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {step === "review" && !currentSuggestion && suggestions.length === 0 && (
              <div className="text-center py-12">
                <LayersIcon className="h-10 w-10 mx-auto text-muted-foreground" />
                <p className="mt-4 font-medium">No suggestions generated</p>
                <p className="text-sm text-muted-foreground mt-1">
                  No overlapping transactions were found between the sources
                </p>
              </div>
            )}

            {step === "executing" && (
              <div className="text-center py-12">
                <Loader2Icon className="h-10 w-10 animate-spin mx-auto text-primary" />
                <p className="mt-4 font-medium">Executing resolution...</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Creating resolved transaction records
                </p>
              </div>
            )}

            {step === "complete" && (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                  <CheckIcon className="h-8 w-8 text-green-500" />
                </div>
                <p className="mt-4 font-medium text-lg">Resolution Complete!</p>
                <p className="text-muted-foreground mt-1">
                  {resolvedCount} transactions have been resolved
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center p-4 border-t border-border bg-muted/30">
            {/* Left side - Navigation */}
            <div className="flex items-center gap-2">
              {step === "review" && suggestions.length > 0 && (
                <>
                  <button
                    onClick={handlePrevious}
                    disabled={loading || currentIndex === 0}
                    className="p-2 rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50"
                    title="Previous suggestion"
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                  </button>
                  <span className="text-sm text-muted-foreground px-2">
                    {currentIndex + 1} / {suggestions.length}
                  </span>
                  <button
                    onClick={handleNext}
                    disabled={loading || currentIndex >= suggestions.length - 1}
                    className="p-2 rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50"
                    title="Next suggestion"
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>

            {/* Right side - Actions */}
            <div className="flex gap-2">
              {step === "review" && currentSuggestion && (
                <>
                  {/* Revert button for non-pending suggestions */}
                  {currentSuggestion.status !== "pending" && (
                    <button
                      onClick={() => handleConfirm("pending")}
                      disabled={loading}
                      className="px-3 py-2 text-sm rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                      title="Revert to pending"
                    >
                      <RotateCcwIcon className="h-4 w-4" />
                      Revert
                    </button>
                  )}
                  {currentSuggestion.status === "pending" && (
                    <>
                      <button
                        onClick={() => handleConfirm("rejected")}
                        disabled={loading}
                        className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50"
                      >
                        Not a Match
                      </button>
                      <button
                        onClick={() => handleConfirm("confirmed")}
                        disabled={loading || !selectedPrimary}
                        className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 font-medium inline-flex items-center gap-2"
                      >
                        {loading && <Loader2Icon className="h-4 w-4 animate-spin" />}
                        Confirm
                      </button>
                    </>
                  )}
                </>
              )}
              {/* Execute button when all reviewed - only for non-completed sessions */}
              {step === "review" && pendingCount === 0 && confirmedCount > 0 && session?.status !== "completed" && (
                <button
                  onClick={handleExecute}
                  disabled={loading}
                  className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 font-medium inline-flex items-center gap-2"
                >
                  {loading && <Loader2Icon className="h-4 w-4 animate-spin" />}
                  Execute ({confirmedCount} matches)
                </button>
              )}
              {/* Done button for completed sessions in review mode */}
              {step === "review" && session?.status === "completed" && (
                <Dialog.Close asChild>
                  <button className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium">
                    Done
                  </button>
                </Dialog.Close>
              )}
              {step === "complete" && (
                <Dialog.Close asChild>
                  <button className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium">
                    Done
                  </button>
                </Dialog.Close>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function StepIndicator({
  step,
  label,
  active,
  complete,
}: {
  step: number
  label: string
  active: boolean
  complete: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
          complete
            ? "bg-green-500 text-white"
            : active
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {complete ? <CheckIcon className="h-3.5 w-3.5" /> : step}
      </div>
      <span className={`text-sm ${active ? "font-medium" : "text-muted-foreground"}`}>
        {label}
      </span>
    </div>
  )
}
