import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  BookOpenIcon,
  PlusIcon,
  CalendarIcon,
  HashIcon,
  WalletIcon,
  GitCompareIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from "lucide-react"
import { Footer } from "@/components/Footer"
import { SortDropdown, sortItems } from "@/components/SortDropdown"
import { CreateStoryModal } from "@/components/stories/CreateStoryModal"
import { UnifiedCompareModal } from "@/components/shared/UnifiedCompareModal"
import { fetchStories, type Story } from "@/lib/api"

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

function StoryCard({ story }: { story: Story }) {
  return (
    <Link
      to={`/stories/${story.story_id}`}
      className="block bg-card rounded-lg border border-border shadow-sm hover:shadow-md hover:border-primary/30 transition-all p-3"
    >
      <div className="flex items-start gap-2.5">
        <div className="text-2xl flex-shrink-0">{story.icon}</div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm truncate">{story.name}</h3>
          {story.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {story.description}
            </p>
          )}
        </div>
      </div>
      {(story.min_date || story.max_date) && (
        <div className="flex items-center gap-1 mt-3 text-[10px] text-muted-foreground">
          <CalendarIcon className="h-3 w-3" />
          {story.min_date === story.max_date
            ? formatDate(story.min_date)
            : `${formatDate(story.min_date)} - ${formatDate(story.max_date)}`}
        </div>
      )}
      <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <HashIcon className="h-3 w-3" />
          {story.transaction_count}
        </span>
        <span className="flex items-center gap-1">
          <WalletIcon className="h-3 w-3" />
          {formatCurrency(Math.abs(story.total_spent))}
          {story.total_spent !== 0 && (
            story.total_spent < 0
              ? <ArrowUpIcon className="h-3 w-3 text-green-500" />
              : <ArrowDownIcon className="h-3 w-3 text-red-500" />
          )}
        </span>
      </div>
    </Link>
  )
}

export function StoriesPage() {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [compareModalOpen, setCompareModalOpen] = useState(false)
  const [sortBy, setSortBy] = useState("created_at")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

  useEffect(() => {
    document.title = "Stories | FinAccs"
  }, [])

  const loadStories = async () => {
    try {
      const data = await fetchStories()
      setStories(data.stories)
    } catch (error) {
      console.error("Failed to load stories:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStories()
  }, [])

  const handleStoryCreated = () => {
    loadStories()
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
              <span>stories</span>
            </div>
            <h1 className="text-2xl font-bold">Stories</h1>
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
              Create Story
            </button>
          </div>
        </header>

        {/* Stories Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : stories.length === 0 ? (
          <div className="bg-card rounded-xl border border-border shadow-sm p-12 text-center">
            <BookOpenIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">No stories yet</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Create your first story to start organizing transactions.
            </p>
            <button
              onClick={() => setCreateModalOpen(true)}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors inline-flex items-center gap-2"
            >
              <PlusIcon className="h-4 w-4" />
              Create Story
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {sortItems(stories, sortBy, sortDirection).map((story) => (
              <StoryCard key={story.id} story={story} />
            ))}
          </div>
        )}
      </main>

      <CreateStoryModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onCreated={handleStoryCreated}
      />

      <UnifiedCompareModal
        open={compareModalOpen}
        onOpenChange={setCompareModalOpen}
      />

      <Footer />
    </>
  )
}
