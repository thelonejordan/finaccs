import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { Dashboard } from "@/components/Dashboard"
import { TransactionsModernPage } from "@/components/TransactionsModernPage"
import { CreditCardsPage } from "@/components/CreditCardsPage"
import { SettingsPage } from "@/components/SettingsPage"
import { InconsistenciesPage } from "@/components/InconsistenciesPage"
import { LogsPage } from "@/components/LogsPage"
import { ThemeProvider } from "@/lib/theme"

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/transactions" element={<TransactionsModernPage />} />
          <Route path="/credit-cards" element={<CreditCardsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/inconsistencies" element={<InconsistenciesPage />} />
          <Route path="/logs" element={<LogsPage />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
