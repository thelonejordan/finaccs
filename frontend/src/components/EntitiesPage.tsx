import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  UsersIcon,
  PlusIcon,
  CalendarIcon,
  HashIcon,
  WalletIcon,
  GitCompareIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  UserIcon,
  BuildingIcon,
} from "lucide-react"
import { Footer } from "@/components/Footer"
import { CreateEntityModal } from "@/components/entities/CreateEntityModal"
import { UnifiedCompareModal } from "@/components/shared/UnifiedCompareModal"
import { fetchEntities, type Entity } from "@/lib/api"

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-"
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function EntityCard({ entity }: { entity: Entity }) {
  return (
    <Link
      to={`/entities/${entity.entity_id}`}
      className="block bg-card rounded-lg border border-border shadow-sm hover:shadow-md hover:border-primary/30 transition-all p-3"
    >
      <div className="flex items-start gap-2.5">
        <div className="text-2xl flex-shrink-0">{entity.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="font-medium text-sm truncate">{entity.name}</h3>
            {entity.entity_type === "person" ? (
              <UserIcon className="h-3 w-3 text-blue-500 flex-shrink-0" />
            ) : (
              <BuildingIcon className="h-3 w-3 text-purple-500 flex-shrink-0" />
            )}
          </div>
          {entity.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {entity.description}
            </p>
          )}
        </div>
      </div>
      {(entity.min_date || entity.max_date) && (
        <div className="flex items-center gap-1 mt-3 text-[10px] text-muted-foreground">
          <CalendarIcon className="h-3 w-3" />
          {entity.min_date === entity.max_date
            ? formatDate(entity.min_date)
            : `${formatDate(entity.min_date)} - ${formatDate(entity.max_date)}`}
        </div>
      )}
      <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <HashIcon className="h-3 w-3" />
          {entity.transaction_count}
        </span>
        <span className="flex items-center gap-1">
          <WalletIcon className="h-3 w-3" />
          {formatCurrency(Math.abs(entity.total_spent))}
          {entity.total_spent !== 0 && (
            entity.total_spent < 0
              ? <ArrowUpIcon className="h-3 w-3 text-green-500" />
              : <ArrowDownIcon className="h-3 w-3 text-red-500" />
          )}
        </span>
      </div>
    </Link>
  )
}

export function EntitiesPage() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [compareModalOpen, setCompareModalOpen] = useState(false)

  useEffect(() => {
    document.title = "Entities | FinAccs"
  }, [])

  const loadEntities = async () => {
    try {
      const data = await fetchEntities()
      setEntities(data.entities)
    } catch (error) {
      console.error("Failed to load entities:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEntities()
  }, [])

  const handleEntityCreated = () => {
    loadEntities()
  }

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Page Header */}
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <UsersIcon className="h-6 w-6 text-primary" />
              </div>
              Entities
            </h1>
            <p className="text-muted-foreground mt-1">
              Group transactions by people or businesses
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCompareModalOpen(true)}
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors flex items-center gap-2"
            >
              <GitCompareIcon className="h-4 w-4" />
              Compare
            </button>
            <button
              onClick={() => setCreateModalOpen(true)}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
            >
              <PlusIcon className="h-4 w-4" />
              Create Entity
            </button>
          </div>
        </header>

        {/* Entities Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : entities.length === 0 ? (
          <div className="bg-card rounded-xl border border-border shadow-sm p-12 text-center">
            <UsersIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">No entities yet</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Create your first entity to start grouping transactions by people or businesses.
            </p>
            <button
              onClick={() => setCreateModalOpen(true)}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors inline-flex items-center gap-2"
            >
              <PlusIcon className="h-4 w-4" />
              Create Entity
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {entities.map((entity) => (
              <EntityCard key={entity.id} entity={entity} />
            ))}
          </div>
        )}
      </main>

      <CreateEntityModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onCreated={handleEntityCreated}
      />

      <UnifiedCompareModal
        open={compareModalOpen}
        onOpenChange={setCompareModalOpen}
      />

      <Footer />
    </>
  )
}
