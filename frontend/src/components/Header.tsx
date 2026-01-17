import { useState, useEffect } from "react"
import { Link, useLocation } from "react-router-dom"
import { fetchInconsistencies, fetchCreditCardInconsistencies } from "@/lib/api"
import {
  SunIcon,
  MoonIcon,
  MonitorIcon,
  CheckIcon,
  LayoutDashboardIcon,
  ListIcon,
  CreditCardIcon,
  SettingsIcon,
  AlertTriangleIcon,
  ScrollTextIcon,
} from "lucide-react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { useTheme } from "@/lib/theme"

const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { path: "/transactions", label: "Transactions", icon: ListIcon },
  { path: "/credit-cards", label: "Credit Cards", icon: CreditCardIcon },
  { path: "/settings", label: "Settings", icon: SettingsIcon },
  { path: "/inconsistencies", label: "Inconsistencies", icon: AlertTriangleIcon },
  { path: "/logs", label: "Activity Log", icon: ScrollTextIcon },
]

export function Header() {
  const location = useLocation()
  const { mode, setMode } = useTheme()
  const [inconsistencyCount, setInconsistencyCount] = useState(0)

  useEffect(() => {
    async function loadCounts() {
      try {
        const [bankResult, creditResult] = await Promise.all([
          fetchInconsistencies({ limit: 1 }),
          fetchCreditCardInconsistencies(),
        ])
        setInconsistencyCount(bankResult.total + creditResult.total)
      } catch (error) {
        console.error("Failed to load inconsistency counts:", error)
      }
    }
    loadCounts()
  }, [])

  return (
    <header className="sticky top-0 z-50 bg-card border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
              const isActive = location.pathname === path
              return (
                <Link
                  key={path}
                  to={path}
                  className={`relative flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                  {path === "/inconsistencies" && inconsistencyCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">
                      {inconsistencyCount > 99 ? "99+" : inconsistencyCount}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>

          {/* Theme Toggle */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                className="p-2 rounded-lg hover:bg-accent transition-colors"
                aria-label="Theme"
              >
                {mode === "light" && <SunIcon className="h-5 w-5" />}
                {mode === "dark" && <MoonIcon className="h-5 w-5" />}
                {mode === "system" && <MonitorIcon className="h-5 w-5" />}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="bg-card rounded-lg shadow-lg border border-border p-1 min-w-[140px] z-50"
                sideOffset={5}
                align="end"
              >
                <DropdownMenu.RadioGroup
                  value={mode}
                  onValueChange={(value) =>
                    setMode(value as "light" | "dark" | "system")
                  }
                >
                  {[
                    { value: "light", icon: SunIcon, label: "Light" },
                    { value: "dark", icon: MoonIcon, label: "Dark" },
                    { value: "system", icon: MonitorIcon, label: "System" },
                  ].map(({ value, icon: Icon, label }) => (
                    <DropdownMenu.RadioItem
                      key={value}
                      value={value}
                      className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent outline-none"
                    >
                      <Icon className="h-4 w-4" />
                      <span className="flex-1">{label}</span>
                      {mode === value && <CheckIcon className="h-4 w-4" />}
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </header>
  )
}
