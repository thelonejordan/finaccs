import { BrowserRouter, Routes, Route } from "react-router-dom"
import { Dashboard } from "@/components/Dashboard"
import { TransactionsPage } from "@/components/TransactionsPage"
import { ThemeProvider } from "@/lib/theme"

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<TransactionsPage />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
