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
import { SortDropdown, sortItems } from "@/components/SortDropdown"
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
  const [sortBy, setSortBy] = useState("created_at")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

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
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Link to="/dashboard" className="hover:text-foreground transition-colors">home</Link>
              <span>/</span>
              <span>entities</span>
            </div>
            <h1 className="text-2xl font-bold">Entities</h1>
          </div>
          <div className="flex items-center gap-2">
            <SortDropdown
              options={[
                { value: "created_at", label: "Created at" },
                { value: "updated_at", label: "Last updated" },
                { value: "name", label: "Name" },
              ]}
              sortBy={sortBy}
              sortDirection={sortDirection}
              onSortChange={(by, dir) => { setSortBy(by); setSortDirection(dir) }}
            />
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
          <>
            {(() => {
              const sorted = sortItems(entities, sortBy, sortDirection)
              const people = sorted.filter(e => e.entity_type === "person")
              const businesses = sorted.filter(e => e.entity_type === "business")
              const LIMIT = 8
              return (
                <div className="space-y-8">
                  {people.length > 0 && (
                    <section>
                      <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                        <UserIcon className="h-4 w-4 text-blue-500" />
                        People ({people.length})
                      </h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {people.slice(0, LIMIT).map((entity) => (
                          <EntityCard key={entity.id} entity={entity} />
                        ))}
                      </div>
                      {people.length > LIMIT && (
                        <Link
                          to="/entities/people"
                          className="mt-3 inline-block text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                        >
                          Show all ({people.length})
                        </Link>
                      )}
                    </section>
                  )}
                  {businesses.length > 0 && (
                    <section>
                      <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                        <BuildingIcon className="h-4 w-4 text-purple-500" />
                        Businesses ({businesses.length})
                      </h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {businesses.slice(0, LIMIT).map((entity) => (
                          <EntityCard key={entity.id} entity={entity} />
                        ))}
                      </div>
                      {businesses.length > LIMIT && (
                        <Link
                          to="/entities/businesses"
                          className="mt-3 inline-block text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                        >
                          Show all ({businesses.length})
                        </Link>
                      )}
                    </section>
                  )}
                </div>
              )
            })()}
          </>
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

export function EntitiesTypePage({ entityType }: { entityType: "person" | "business" }) {
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [sortBy, setSortBy] = useState("created_at")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

  const label = entityType === "person" ? "People" : "Businesses"
  const Icon = entityType === "person" ? UserIcon : BuildingIcon
  const iconColor = entityType === "person" ? "text-blue-500" : "text-purple-500"

  useEffect(() => {
    document.title = `${label} | Entities | FinAccs`
  }, [label])

  const loadEntities = async () => {
    try {
      const data = await fetchEntities()
      setEntities(data.entities.filter(e => e.entity_type === entityType))
    } catch (error) {
      console.error("Failed to load entities:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEntities()
  }, [entityType])

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 py-8">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Link to="/dashboard" className="hover:text-foreground transition-colors">home</Link>
              <span>/</span>
              <Link to="/entities" className="hover:text-foreground transition-colors">entities</Link>
              <span>/</span>
              <span>{label.toLowerCase()}</span>
            </div>
            <h1 className="text-2xl font-bold">{label}</h1>
          </div>
          <div className="flex items-center gap-2">
            <SortDropdown
              options={[
                { value: "created_at", label: "Created at" },
                { value: "updated_at", label: "Last updated" },
                { value: "name", label: "Name" },
              ]}
              sortBy={sortBy}
              sortDirection={sortDirection}
              onSortChange={(by, dir) => { setSortBy(by); setSortDirection(dir) }}
            />
            <button
              onClick={() => setCreateModalOpen(true)}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
            >
              <PlusIcon className="h-4 w-4" />
              Create Entity
            </button>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : entities.length === 0 ? (
          <div className="bg-card rounded-xl border border-border shadow-sm p-12 text-center">
            <Icon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">No {label.toLowerCase()} yet</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Create your first {entityType} entity to start grouping transactions.
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
            {sortItems(entities, sortBy, sortDirection).map((entity) => (
              <EntityCard key={entity.id} entity={entity} />
            ))}
          </div>
        )}
      </main>

      <CreateEntityModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onCreated={loadEntities}
      />

      <Footer />
    </>
  )
}
