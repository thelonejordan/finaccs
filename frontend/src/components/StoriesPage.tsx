import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  BookOpenIcon,
  PlusIcon,
  CalendarIcon,
  HashIcon,
  WalletIcon,
  GitCompareIcon,
} from "lucide-react"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { CreateStoryModal } from "@/components/stories/CreateStoryModal"
import { CompareStoriesModal } from "@/components/stories/CompareStoriesModal"
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
      className="block bg-card rounded-xl border border-border shadow-sm hover:shadow-md hover:border-primary/30 transition-all p-5"
    >
      <div className="flex items-start gap-4">
        <div className="text-4xl flex-shrink-0">{story.icon}</div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg truncate">{story.name}</h3>
          {story.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {story.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <HashIcon className="h-4 w-4" />
              {story.transaction_count} transactions
            </span>
            <span className="flex items-center gap-1.5">
              <WalletIcon className="h-4 w-4" />
              {formatCurrency(story.total_spent)}
            </span>
          </div>
          {(story.min_date || story.max_date) && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
              <CalendarIcon className="h-3.5 w-3.5" />
              {story.min_date === story.max_date
                ? formatDate(story.min_date)
                : `${formatDate(story.min_date)} - ${formatDate(story.max_date)}`}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

export function StoriesPage() {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [compareModalOpen, setCompareModalOpen] = useState(false)

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
    <div className="min-h-screen bg-muted/40">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Page Header */}
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <BookOpenIcon className="h-6 w-6 text-primary" />
              </div>
              Stories
            </h1>
            <p className="text-muted-foreground mt-1">
              Group your transactions into named collections
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stories.map((story) => (
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

      <CompareStoriesModal
        open={compareModalOpen}
        onOpenChange={setCompareModalOpen}
      />

      <Footer />
    </div>
  )
}
