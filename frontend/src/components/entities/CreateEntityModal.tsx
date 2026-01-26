import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import * as Dialog from "@radix-ui/react-dialog"
import { XIcon, PlusIcon, CheckIcon, TrashIcon, UserIcon, BuildingIcon } from "lucide-react"
import { createEntity, updateEntity, type EntityType } from "@/lib/api"

const EMOJI_OPTIONS = [
  // Row 1 - People
  "👤", "👨", "👩", "👴", "👵", "👶", "🧑", "🧔",
  // Row 2 - Business & Work
  "🏢", "🏪", "🏬", "🏭", "🏥", "🏦", "🏨", "🏛️",
  // Row 3 - Shopping & Services
  "🛒", "🛍️", "🍔", "☕", "🍕", "💊", "✈️", "🚗",
  // Row 4 - Tech & Entertainment
  "📱", "💻", "🎬", "🎮", "📚", "🎵", "📺", "🎁",
  // Row 5 - Finance & Misc
  "💰", "💳", "📈", "💼", "🏠", "⚡", "💡", "🔧",
  // Row 6 - More options
  "⭐", "❤️", "🔖", "📌", "🏷️", "📋", "🗂️", "📁",
]

interface CreateEntityModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
  entity?: { entity_id: string; name: string; description: string; icon: string; entity_type: EntityType }  // For edit mode
  onDelete?: () => void  // Delete handler for edit mode
  isDeleting?: boolean   // Delete loading state
}

export function CreateEntityModal({ open, onOpenChange, onCreated, entity, onDelete, isDeleting }: CreateEntityModalProps) {
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [icon, setIcon] = useState("👤")
  const [entityType, setEntityType] = useState<EntityType>("person")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const isEditMode = !!entity

  // Pre-populate form when editing or reset when creating
  useEffect(() => {
    if (open) {
      if (entity) {
        setName(entity.name)
        setDescription(entity.description)
        setIcon(entity.icon)
        setEntityType(entity.entity_type)
      } else {
        setName("")
        setDescription("")
        setIcon("👤")
        setEntityType("person")
      }
      setError(null)
      setShowDeleteConfirm(false)
    }
  }, [open, entity])

  // Update default icon when entity type changes (only in create mode)
  useEffect(() => {
    if (!isEditMode) {
      setIcon(entityType === "person" ? "👤" : "🏢")
    }
  }, [entityType, isEditMode])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError("Name is required")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      if (isEditMode && entity) {
        // Edit mode: update existing entity
        await updateEntity(entity.entity_id, {
          name: name.trim(),
          description: description.trim(),
          icon,
          entity_type: entityType,
        })
        onCreated()
        onOpenChange(false)
      } else {
        // Create mode: create new entity and navigate
        const newEntity = await createEntity({
          name: name.trim(),
          description: description.trim(),
          icon,
          entity_type: entityType,
        })
        // Reset form
        setName("")
        setDescription("")
        setIcon("👤")
        setEntityType("person")
        onCreated()
        onOpenChange(false)
        // Navigate to the new entity
        navigate(`/entities/${newEntity.entity_id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : isEditMode ? "Failed to update entity" : "Failed to create entity")
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
            {isEditMode ? "Edit Entity" : "Create New Entity"}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            {isEditMode ? "Update your entity details." : "Group transactions by a person or business."}
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {/* Entity Type Toggle */}
            <div>
              <label className="block text-sm font-medium mb-2">Type</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEntityType("person")}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                    entityType === "person"
                      ? "border-blue-500 bg-blue-500/10 text-blue-500"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <UserIcon className="h-4 w-4" />
                  Person
                </button>
                <button
                  type="button"
                  onClick={() => setEntityType("business")}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                    entityType === "business"
                      ? "border-purple-500 bg-purple-500/10 text-purple-500"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <BuildingIcon className="h-4 w-4" />
                  Business
                </button>
              </div>
            </div>

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
              <label htmlFor="entity-name" className="block text-sm font-medium mb-1">
                Name
              </label>
              <input
                id="entity-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={entityType === "person" ? "e.g., John Doe" : "e.g., Amazon"}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="entity-description" className="block text-sm font-medium mb-1">
                Description <span className="text-muted-foreground">(optional)</span>
              </label>
              <textarea
                id="entity-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={entityType === "person" ? "Who is this person?" : "What kind of business?"}
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
                    {isEditMode ? "Save Changes" : "Create Entity"}
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
                          Delete Entity
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
                  Delete this entity
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
