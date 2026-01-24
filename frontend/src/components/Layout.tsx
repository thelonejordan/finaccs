import { Outlet } from "react-router-dom"
import { Sidebar } from "./Sidebar"
import { Header } from "./Header"

/**
 * Main layout wrapper providing consistent structure with header and sidebar navigation.
 * Uses React Router's Outlet for rendering child routes.
 */
export function Layout() {
  return (
    <div className="min-h-screen bg-muted/40">
      {/* Full-width header at top */}
      <Header />
      {/* Sidebar and content below header */}
      <div className="flex">
        <Sidebar />
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
