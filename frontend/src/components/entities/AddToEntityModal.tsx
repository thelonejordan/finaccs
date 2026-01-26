import { useState, useEffect } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { XIcon, PlusIcon, CheckIcon, UsersIcon, UserIcon, BuildingIcon } from "lucide-react"
import {
  fetchEntities,
  addTransactionsToEntity,
  createEntity,
  type Entity,
  type TransactionRef,
  type EntityType,
} from "@/lib/api"

interface AddToEntityModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedTransactions: TransactionRef[]
  onAdded: () => void
}

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

export function AddToEntityModal({
  open,
  onOpenChange,
  selectedTransactions,
  onAdded,
}: AddToEntityModalProps) {
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [addingToEntityId, setAddingToEntityId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Create form state
  const [newName, setNewName] = useState("")
  const [newIcon, setNewIcon] = useState("👤")
  const [newEntityType, setNewEntityType] = useState<EntityType>("person")
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    if (open) {
      loadEntities()
      setShowCreateForm(false)
      setNewName("")
      setNewIcon("👤")
      setNewEntityType("person")
      setError(null)
    }
  }, [open])

  // Update default icon when entity type changes
  useEffect(() => {
    setNewIcon(newEntityType === "person" ? "👤" : "🏢")
  }, [newEntityType])

  const loadEntities = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchEntities()
      setEntities(data.entities)
    } catch (err) {
      console.error("Failed to load entities:", err)
      setError("Failed to load entities")
    } finally {
      setLoading(false)
    }
  }

  const handleAddToEntity = async (entityId: string) => {
    setAddingToEntityId(entityId)
    setError(null)
    try {
      await addTransactionsToEntity(entityId, selectedTransactions)
      onAdded()
      onOpenChange(false)
    } catch (err) {
      console.error("Failed to add to entity:", err)
      setError(err instanceof Error ? err.message : "Failed to add to entity")
    } finally {
      setAddingToEntityId(null)
    }
  }

  const handleCreateAndAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return

    setIsCreating(true)
    setError(null)
    try {
      const entity = await createEntity({
        name: newName.trim(),
        icon: newIcon,
        entity_type: newEntityType,
      })
      // Add transactions to the new entity
      await addTransactionsToEntity(entity.entity_id, selectedTransactions)
      onAdded()
      onOpenChange(false)
    } catch (err) {
      console.error("Failed to create entity:", err)
      setError(err instanceof Error ? err.message : "Failed to create entity")
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
            Add to Entity
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            Add {selectedTransactions.length} transaction{selectedTransactions.length !== 1 ? "s" : ""} to an entity.
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
                {/* Entity Type Toggle */}
                <div>
                  <label className="block text-sm font-medium mb-2">Type</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setNewEntityType("person")}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                        newEntityType === "person"
                          ? "border-blue-500 bg-blue-500/10 text-blue-500"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      <UserIcon className="h-4 w-4" />
                      Person
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewEntityType("business")}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                        newEntityType === "business"
                          ? "border-purple-500 bg-purple-500/10 text-purple-500"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      <BuildingIcon className="h-4 w-4" />
                      Business
                    </button>
                  </div>
                </div>

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
                  <label htmlFor="new-entity-name" className="block text-sm font-medium mb-1">
                    Name
                  </label>
                  <input
                    id="new-entity-name"
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={newEntityType === "person" ? "e.g., John Doe" : "e.g., Amazon"}
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
                {entities.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <UsersIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No entities yet</p>
                    <p className="text-sm mt-1">Create your first entity below.</p>
                  </div>
                ) : (
                  entities.map((entity) => (
                    <button
                      key={entity.id}
                      onClick={() => handleAddToEntity(entity.entity_id)}
                      disabled={addingToEntityId !== null}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors disabled:opacity-50 text-left"
                    >
                      <span className="text-2xl">{entity.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate flex items-center gap-1.5">
                          {entity.name}
                          {entity.entity_type === "person" ? (
                            <UserIcon className="h-3.5 w-3.5 text-blue-500" />
                          ) : (
                            <BuildingIcon className="h-3.5 w-3.5 text-purple-500" />
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {entity.transaction_count} transactions
                        </p>
                      </div>
                      {addingToEntityId === entity.entity_id ? (
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      ) : (
                        <CheckIcon className="h-5 w-5 text-muted-foreground" />
                      )}
                    </button>
                  ))
                )}

                {/* Create New Entity Button */}
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-border hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                >
                  <PlusIcon className="h-4 w-4" />
                  Create New Entity
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
