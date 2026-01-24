import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import * as Dialog from "@radix-ui/react-dialog"
import { XIcon, PlusIcon, CheckIcon, TrashIcon } from "lucide-react"
import { createStory, updateStory } from "@/lib/api"

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

interface CreateStoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
  story?: { story_id: string; name: string; description: string; icon: string }  // For edit mode
  onDelete?: () => void  // Delete handler for edit mode
  isDeleting?: boolean   // Delete loading state
}

export function CreateStoryModal({ open, onOpenChange, onCreated, story, onDelete, isDeleting }: CreateStoryModalProps) {
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [icon, setIcon] = useState("💰")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const isEditMode = !!story

  // Pre-populate form when editing or reset when creating
  useEffect(() => {
    if (open) {
      if (story) {
        setName(story.name)
        setDescription(story.description)
        setIcon(story.icon)
      } else {
        setName("")
        setDescription("")
        setIcon("💰")
      }
      setError(null)
      setShowDeleteConfirm(false)
    }
  }, [open, story])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError("Name is required")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      if (isEditMode && story) {
        // Edit mode: update existing story
        await updateStory(story.story_id, {
          name: name.trim(),
          description: description.trim(),
          icon,
        })
        onCreated()
        onOpenChange(false)
      } else {
        // Create mode: create new story and navigate
        const newStory = await createStory({
          name: name.trim(),
          description: description.trim(),
          icon,
        })
        // Reset form
        setName("")
        setDescription("")
        setIcon("💰")
        onCreated()
        onOpenChange(false)
        // Navigate to the new story
        navigate(`/stories/${newStory.story_id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : isEditMode ? "Failed to update story" : "Failed to create story")
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card rounded-lg shadow-xl p-6 w-full max-w-md z-50">
          <Dialog.Title className="text-lg font-semibold text-foreground">
            {isEditMode ? "Edit Story" : "Create New Story"}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            {isEditMode ? "Update your story details." : "Group your transactions into a named collection."}
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {/* Icon Picker */}
            <div>
              <label className="block text-sm font-medium mb-2">Icon</label>
              <div className="grid grid-cols-8 gap-2">
                {EMOJI_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setIcon(emoji)}
                    className={`w-9 h-9 flex items-center justify-center text-lg rounded-lg transition-colors ${
                      icon === emoji
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
              <label htmlFor="story-name" className="block text-sm font-medium mb-1">
                Name
              </label>
              <input
                id="story-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Japan Trip 2024"
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="story-description" className="block text-sm font-medium mb-1">
                Description <span className="text-muted-foreground">(optional)</span>
              </label>
              <textarea
                id="story-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this story about?"
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting || isDeleting}
                className="px-4 py-2 text-sm font-medium rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isDeleting || !name.trim()}
                className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    {isEditMode ? "Saving..." : "Creating..."}
                  </>
                ) : (
                  <>
                    {isEditMode ? <CheckIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
                    {isEditMode ? "Save Changes" : "Create Story"}
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Delete section - separated from form */}
          {isEditMode && onDelete && (
            <div className="mt-6 pt-4 border-t border-border">
              {showDeleteConfirm ? (
                <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-3">
                    Are you sure? This will remove all transaction associations.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onDelete}
                      disabled={isDeleting}
                      className="px-3 py-1.5 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {isDeleting ? (
                        <>
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <TrashIcon className="h-3 w-3" />
                          Delete Story
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={isDeleting}
                      className="px-3 py-1.5 text-sm font-medium rounded-md text-muted-foreground hover:bg-accent disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isSubmitting || isDeleting}
                  className="text-sm text-muted-foreground hover:text-red-500 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  Delete this story
                </button>
              )}
            </div>
          )}

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
