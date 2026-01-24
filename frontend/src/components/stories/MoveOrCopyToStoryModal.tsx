import { useState, useEffect } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { XIcon, PlusIcon, MoveIcon, CopyIcon, BookOpenIcon } from "lucide-react"
import {
  fetchStories,
  addTransactionsToStory,
  removeTransactionsFromStory,
  createStory,
  type Story,
  type TransactionRef,
} from "@/lib/api"

interface MoveOrCopyToStoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "move" | "copy"
  currentStoryId: string
  selectedTransactions: TransactionRef[]
  onComplete: () => void
}

const EMOJI_OPTIONS = [
  "📁", "🗂️", "📂", "📊", "📈", "💰", "💳", "🏦",
  "🛒", "🛍️", "🍔", "☕", "🎬", "🎮", "✈️", "🏠",
]

export function MoveOrCopyToStoryModal({
  open,
  onOpenChange,
  mode,
  currentStoryId,
  selectedTransactions,
  onComplete,
}: MoveOrCopyToStoryModalProps) {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [processingStoryId, setProcessingStoryId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Create form state
  const [newName, setNewName] = useState("")
  const [newIcon, setNewIcon] = useState("📁")
  const [isCreating, setIsCreating] = useState(false)

  const isMove = mode === "move"
  const actionLabel = isMove ? "Move" : "Copy"
  const ActionIcon = isMove ? MoveIcon : CopyIcon

  useEffect(() => {
    if (open) {
      loadStories()
      setShowCreateForm(false)
      setNewName("")
      setNewIcon("📁")
      setError(null)
    }
  }, [open])

  const loadStories = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchStories()
      // Exclude current story from the list
      setStories(data.stories.filter(s => s.story_id !== currentStoryId))
    } catch (err) {
      console.error("Failed to load stories:", err)
      setError("Failed to load stories")
    } finally {
      setLoading(false)
    }
  }

  const handleMoveOrCopy = async (targetStoryId: string) => {
    setProcessingStoryId(targetStoryId)
    setError(null)
    try {
      // Add to target story
      await addTransactionsToStory(targetStoryId, selectedTransactions)

      // If move, also remove from current story
      if (isMove) {
        await removeTransactionsFromStory(currentStoryId, selectedTransactions)
      }

      onComplete()
      onOpenChange(false)
    } catch (err) {
      console.error(`Failed to ${mode} transactions:`, err)
      setError(err instanceof Error ? err.message : `Failed to ${mode} transactions`)
    } finally {
      setProcessingStoryId(null)
    }
  }

  const handleCreateAndMoveOrCopy = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return

    setIsCreating(true)
    setError(null)
    try {
      // Create new story
      const story = await createStory({
        name: newName.trim(),
        icon: newIcon,
      })

      // Add transactions to the new story
      await addTransactionsToStory(story.story_id, selectedTransactions)

      // If move, also remove from current story
      if (isMove) {
        await removeTransactionsFromStory(currentStoryId, selectedTransactions)
      }

      onComplete()
      onOpenChange(false)
    } catch (err) {
      console.error(`Failed to create story and ${mode} transactions:`, err)
      setError(err instanceof Error ? err.message : `Failed to create story`)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card rounded-lg shadow-xl p-6 w-full max-w-md max-h-[80vh] overflow-hidden z-50 flex flex-col">
          <Dialog.Title className="text-lg font-semibold text-foreground flex items-center gap-2">
            <ActionIcon className="h-5 w-5" />
            {actionLabel} to Story
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            {actionLabel} {selectedTransactions.length} transaction{selectedTransactions.length !== 1 ? "s" : ""} to {isMove ? "another" : "a"} story.
            {isMove && " They will be removed from the current story."}
          </Dialog.Description>

          {error && (
            <div className="mt-3 p-2 rounded-md bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
              {error}
            </div>
          )}

          <div className="mt-4 flex-1 overflow-y-auto min-h-0">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : showCreateForm ? (
              <form onSubmit={handleCreateAndMoveOrCopy} className="space-y-4">
                {/* Icon Picker (compact) */}
                <div>
                  <label className="block text-sm font-medium mb-2">Icon</label>
                  <div className="grid grid-cols-8 gap-1.5">
                    {EMOJI_OPTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setNewIcon(emoji)}
                        className={`w-8 h-8 flex items-center justify-center text-base rounded transition-colors ${
                          newIcon === emoji
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted hover:bg-accent"
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label htmlFor="new-story-name" className="block text-sm font-medium mb-1">
                    Name
                  </label>
                  <input
                    id="new-story-name"
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., Japan Trip 2024"
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    autoFocus
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    disabled={isCreating}
                    className="px-4 py-2 text-sm font-medium rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating || !newName.trim()}
                    className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isCreating ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <PlusIcon className="h-4 w-4" />
                        Create & {actionLabel}
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-2">
                {stories.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <BookOpenIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No other stories</p>
                    <p className="text-sm mt-1">Create a new story to {mode} transactions.</p>
                  </div>
                ) : (
                  stories.map((story) => (
                    <button
                      key={story.id}
                      onClick={() => handleMoveOrCopy(story.story_id)}
                      disabled={processingStoryId !== null}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors disabled:opacity-50 text-left"
                    >
                      <span className="text-2xl">{story.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{story.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {story.transaction_count} transactions
                        </p>
                      </div>
                      {processingStoryId === story.story_id ? (
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      ) : (
                        <ActionIcon className="h-5 w-5 text-muted-foreground" />
                      )}
                    </button>
                  ))
                )}

                {/* Create New Story Button */}
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-border hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                >
                  <PlusIcon className="h-4 w-4" />
                  Create New Story
                </button>
              </div>
            )}
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
  )
}
