import { useState } from "react"
import { useNavigate } from "react-router-dom"
import * as Dialog from "@radix-ui/react-dialog"
import { XIcon, PlusIcon } from "lucide-react"
import { createStory } from "@/lib/api"

const EMOJI_OPTIONS = [
  "📁", "🗂️", "📂", "📊", "📈", "💰", "💳", "🏦",
  "🛒", "🛍️", "🍔", "☕", "🎬", "🎮", "✈️", "🏠",
  "🚗", "⛽", "💊", "📱", "💻", "🎁", "👕", "👟",
  "🧳", "🏨", "🎉", "🎂", "💐", "🐱", "🐶", "🌴",
]

interface CreateStoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export function CreateStoryModal({ open, onOpenChange, onCreated }: CreateStoryModalProps) {
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [icon, setIcon] = useState("📁")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError("Name is required")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const story = await createStory({
        name: name.trim(),
        description: description.trim(),
        icon,
      })
      // Reset form
      setName("")
      setDescription("")
      setIcon("📁")
      onCreated()
      onOpenChange(false)
      // Navigate to the new story
      navigate(`/stories/${story.story_id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create story")
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
            Create New Story
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            Group your transactions into a named collection.
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
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !name.trim()}
                className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Creating...
                  </>
                ) : (
                  <>
                    <PlusIcon className="h-4 w-4" />
                    Create Story
                  </>
                )}
              </button>
            </div>
          </form>

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
