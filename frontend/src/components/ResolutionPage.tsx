import { useState, useEffect } from "react"
import {
  LayersIcon,
  ChevronDownIcon,
} from "lucide-react"
import { fetchDataSources, type DataSourceArtifact } from "@/lib/api"
import { OverlappingGroups, ResolutionWizard } from "@/components/resolution"
import { Footer } from "@/components/Footer"

export function ResolutionPage() {
  const [dataSources, setDataSources] = useState<DataSourceArtifact[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [groupsRefreshKey, setGroupsRefreshKey] = useState(0)
  const [howItWorksOpen, setHowItWorksOpen] = useState(false)

  useEffect(() => {
    document.title = "Resolution | FinAccs"
    loadDataSources()
  }, [])

  const loadDataSources = async () => {
    try {
      const { data } = await fetchDataSources({ status: "loaded" })
      setDataSources(data)
    } catch (err) {
      console.error("Failed to load data sources:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleStartResolution = (sessionId: string) => {
    setActiveSessionId(sessionId)
    setWizardOpen(true)
  }

  const handleResolutionComplete = () => {
    loadDataSources()
    setGroupsRefreshKey((prev) => prev + 1)
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-primary/10">
              <LayersIcon className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Transaction Resolution</h1>
          </div>
          <p className="text-muted-foreground">
            Merge duplicate transactions from multiple data sources while preserving all records.
          </p>
        </div>

        {/* Help Section */}
        <div className="mb-6 rounded-xl bg-muted/30 border border-border">
          <button
            onClick={() => setHowItWorksOpen((prev) => !prev)}
            className="w-full flex items-center justify-between p-6 text-left"
          >
            <h3 className="font-semibold">How it works</h3>
            <ChevronDownIcon className={`h-4 w-4 text-muted-foreground transition-transform ${howItWorksOpen ? "rotate-180" : ""}`} />
          </button>
          {howItWorksOpen && (
            <div className="px-6 pb-6 pt-0">
              <ol className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="font-medium text-foreground">1.</span>
                  <span><strong>Mark sources as overlapping:</strong> Select 2+ data sources from the same account that contain duplicate transactions.</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-medium text-foreground">2.</span>
                  <span><strong>Review suggestions:</strong> The system analyzes transactions and suggests matches. Review each match and select which source to use as primary.</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-medium text-foreground">3.</span>
                  <span><strong>Execute resolution:</strong> Confirmed matches create resolved transactions with unique UUIDs. All source records are preserved.</span>
                </li>
              </ol>
              <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <p className="text-sm text-green-700 dark:text-green-400">
                  <strong>No data is deleted.</strong> All original transactions remain intact. Resolution creates a grouping layer on top.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Overlapping Groups */}
        {loading ? (
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            <p className="mt-4 text-muted-foreground">Loading data sources...</p>
          </div>
        ) : (
          <OverlappingGroups
            dataSources={dataSources}
            onStartResolution={handleStartResolution}
            onRefresh={loadDataSources}
            refreshTrigger={groupsRefreshKey}
          />
        )}
      </div>

      <Footer />

      {/* Resolution Wizard */}
      {activeSessionId && (
        <ResolutionWizard
          sessionId={activeSessionId}
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          onComplete={handleResolutionComplete}
        />
      )}
    </div>
  )
}
