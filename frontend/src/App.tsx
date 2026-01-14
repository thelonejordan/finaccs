import { Dashboard } from "@/components/Dashboard"
import { ThemeProvider } from "@/lib/theme"

function App() {
  return (
    <ThemeProvider>
      <Dashboard />
    </ThemeProvider>
  )
}

export default App
