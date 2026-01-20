import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { Dashboard } from "@/components/Dashboard"
import { TransactionsModernPage } from "@/components/TransactionsModernPage"
import { CreditCardsPage } from "@/components/CreditCardsPage"
import { SettingsPage } from "@/components/SettingsPage"
import { InconsistenciesPage } from "@/components/InconsistenciesPage"
import { LogsPage } from "@/components/LogsPage"
import { StoryPage } from "@/components/StoryPage"
import { ExtractionsPage } from "@/components/ExtractionsPage"
import { BankExtractionsPage } from "@/components/BankExtractionsPage"
import { ThemeProvider } from "@/lib/theme"
import { InconsistencyCacheProvider } from "@/lib/inconsistency-cache"
import { StoryCacheProvider } from "@/lib/story-cache"

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <InconsistencyCacheProvider>
        <StoryCacheProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/transactions" element={<TransactionsModernPage />} />
          <Route path="/credit-cards" element={<CreditCardsPage />} />
          <Route path="/extractions" element={<ExtractionsPage />} />
          <Route path="/bank-extractions" element={<BankExtractionsPage />} />
          <Route path="/story" element={<StoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/inconsistencies" element={<InconsistenciesPage />} />
          <Route path="/logs" element={<LogsPage />} />
        </Routes>
        </StoryCacheProvider>
        </InconsistencyCacheProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
