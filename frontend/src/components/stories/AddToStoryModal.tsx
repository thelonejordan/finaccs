import { useState, useEffect, useMemo } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { XIcon, PlusIcon, CheckIcon, BookOpenIcon, SearchIcon } from "lucide-react"
import {
  fetchStories,
  addTransactionsToStory,
  createStory,
  type Story,
  type TransactionRef,
} from "@/lib/api"

interface AddToStoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedTransactions: TransactionRef[]
  onAdded: () => void
}

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

export function AddToStoryModal({
  open,
  onOpenChange,
  selectedTransactions,
  onAdded,
}: AddToStoryModalProps) {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [addingToStoryId, setAddingToStoryId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  // Create form state
  const [newName, setNewName] = useState("")
  const [newIcon, setNewIcon] = useState("💰")
  const [isCreating, setIsCreating] = useState(false)

  // Filter stories based on search query
  const filteredStories = useMemo(() => {
    if (!searchQuery.trim()) return stories
    const query = searchQuery.toLowerCase()
    return stories.filter(story => story.name.toLowerCase().includes(query))
  }, [stories, searchQuery])

  useEffect(() => {
    if (open) {
      loadStories()
      setShowCreateForm(false)
      setNewName("")
      setNewIcon("💰")
      setError(null)
      setSearchQuery("")
    }
  }, [open])

  const loadStories = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchStories()
      setStories(data.stories)
    } catch (err) {
      console.error("Failed to load stories:", err)
      setError("Failed to load stories")
    } finally {
      setLoading(false)
    }
  }

  const handleAddToStory = async (storyId: string) => {
    setAddingToStoryId(storyId)
    setError(null)
    try {
      await addTransactionsToStory(storyId, selectedTransactions)
      onAdded()
      onOpenChange(false)
    } catch (err) {
      console.error("Failed to add to story:", err)
      setError(err instanceof Error ? err.message : "Failed to add to story")
    } finally {
      setAddingToStoryId(null)
    }
  }

  const handleCreateAndAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return

    setIsCreating(true)
    setError(null)
    try {
      const story = await createStory({
        name: newName.trim(),
        icon: newIcon,
      })
      // Add transactions to the new story
      await addTransactionsToStory(story.story_id, selectedTransactions)
      onAdded()
      onOpenChange(false)
    } catch (err) {
      console.error("Failed to create story:", err)
      setError(err instanceof Error ? err.message : "Failed to create story")
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card rounded-lg shadow-xl p-6 w-full max-w-md max-h-[80vh] overflow-hidden z-50 flex flex-col">
          <Dialog.Title className="text-lg font-semibold text-foreground">
            Add to Story
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            Add {selectedTransactions.length} transaction{selectedTransactions.length !== 1 ? "s" : ""} to a story.
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
              <form onSubmit={handleCreateAndAdd} className="space-y-4">
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
                        Create & Add
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
                    <p>No stories yet</p>
                    <p className="text-sm mt-1">Create your first story below.</p>
                  </div>
                ) : (
                  <>
                    {/* Search input */}
                    <div className="relative mb-3">
                      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search stories..."
                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    {filteredStories.length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground text-sm">
                        No stories match "{searchQuery}"
                      </div>
                    ) : (
                      filteredStories.map((story) => (
                        <button
                          key={story.id}
                          onClick={() => handleAddToStory(story.story_id)}
                          disabled={addingToStoryId !== null}
                          className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors disabled:opacity-50 text-left"
                        >
                          <span className="text-2xl">{story.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{story.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {story.transaction_count} transactions
                            </p>
                          </div>
                          {addingToStoryId === story.story_id ? (
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          ) : (
                            <CheckIcon className="h-5 w-5 text-muted-foreground" />
                          )}
                        </button>
                      ))
                    )}
                  </>
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
