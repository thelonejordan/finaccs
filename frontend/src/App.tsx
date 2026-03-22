import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { Dashboard } from "@/components/Dashboard"
import { TransactionsPage } from "@/components/TransactionsPage"
import { TransactionDetailPage } from "@/components/TransactionDetailPage"
import { ResolutionPage } from "@/components/ResolutionPage"
import { ResolvedTransactionsPage } from "@/components/ResolvedTransactionsPage"
import { ConsolePage } from "@/components/ConsolePage"
import { AnomaliesPage } from "@/components/AnomaliesPage"
import { ActivityLogsPage } from "@/components/ActivityLogsPage"
import { PaymentsPage } from "@/components/PaymentsPage"
import { ExtractionsPage } from "@/components/ExtractionsPage"
import { ExtractionsV2Page } from "@/components/ExtractionsV2Page"
import { StoriesPage } from "@/components/StoriesPage"
import { StoryDetailPage } from "@/components/StoryDetailPage"
import { EntitiesPage } from "@/components/EntitiesPage"
import { EntityDetailPage } from "@/components/EntityDetailPage"
import { Layout } from "@/components/Layout"
import { ThemeProvider } from "@/lib/theme"
import { FontProvider } from "@/lib/font"
import { InconsistencyCacheProvider } from "@/lib/inconsistency-cache"
import { PaymentsCacheProvider } from "@/lib/payments-cache"

function App() {
  return (
    <ThemeProvider>
      <FontProvider>
      <BrowserRouter>
        <InconsistencyCacheProvider>
        <PaymentsCacheProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/extractions" element={<ExtractionsPage />} />
            <Route path="/extractions-v2" element={<ExtractionsV2Page />} />
            <Route path="/payments" element={<PaymentsPage />} />
            <Route path="/console" element={<ConsolePage />} />
            <Route path="/anomalies" element={<AnomaliesPage />} />
            <Route path="/activity" element={<ActivityLogsPage />} />
            <Route path="/stories" element={<StoriesPage />} />
            <Route path="/stories/:storyId" element={<StoryDetailPage />} />
            <Route path="/entities" element={<EntitiesPage />} />
            <Route path="/entities/:entityId" element={<EntityDetailPage />} />
            <Route path="/resolution" element={<ResolutionPage />} />
            <Route path="/experimental" element={<ResolvedTransactionsPage />} />
            <Route path="/transactions/resolved" element={<TransactionDetailPage />} />
            <Route path="/transactions/resolved/:uuid" element={<TransactionDetailPage />} />
          </Route>
        </Routes>
        </PaymentsCacheProvider>
        </InconsistencyCacheProvider>
      </BrowserRouter>
      </FontProvider>
    </ThemeProvider>
  )
}

export default App
