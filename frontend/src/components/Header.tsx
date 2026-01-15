import { Link, useLocation } from "react-router-dom"
import {
  SunIcon,
  MoonIcon,
  MonitorIcon,
  CheckIcon,
  LayoutDashboardIcon,
  ListIcon,
  AlertTriangleIcon,
  ScrollTextIcon,
} from "lucide-react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { useTheme } from "@/lib/theme"

const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { path: "/transactions", label: "Transactions", icon: ListIcon },
  { path: "/inconsistencies", label: "Inconsistencies", icon: AlertTriangleIcon },
  { path: "/logs", label: "Activity Log", icon: ScrollTextIcon },
]

export function Header() {
  const location = useLocation()
  const { mode, setMode } = useTheme()

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
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
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
