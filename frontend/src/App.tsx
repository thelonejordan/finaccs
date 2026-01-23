import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { Dashboard } from "@/components/Dashboard"
import { TransactionsPage } from "@/components/TransactionsPage"
import { ConsolePage } from "@/components/ConsolePage"
import { AnomaliesPage } from "@/components/AnomaliesPage"
import { ActivityLogsPage } from "@/components/ActivityLogsPage"
import { PaymentsPage } from "@/components/PaymentsPage"
import { ExtractionsPage } from "@/components/ExtractionsPage"
import { ExtractionsV2Page } from "@/components/ExtractionsV2Page"
import { ThemeProvider } from "@/lib/theme"
import { InconsistencyCacheProvider } from "@/lib/inconsistency-cache"
import { PaymentsCacheProvider } from "@/lib/payments-cache"

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <InconsistencyCacheProvider>
        <PaymentsCacheProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/extractions" element={<ExtractionsPage />} />
          <Route path="/extractions-v2" element={<ExtractionsV2Page />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/console" element={<ConsolePage />} />
          <Route path="/anomalies" element={<AnomaliesPage />} />
          <Route path="/activity" element={<ActivityLogsPage />} />
        </Routes>
        </PaymentsCacheProvider>
        </InconsistencyCacheProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
