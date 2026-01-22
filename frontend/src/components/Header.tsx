import { useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { useInconsistencyCache } from "@/lib/inconsistency-cache"
import { useStoryCache } from "@/lib/story-cache"
import {
  SunIcon,
  MoonIcon,
  MonitorIcon,
  CheckIcon,
  LayoutDashboardIcon,
  ListIcon,
  SettingsIcon,
  AlertTriangleIcon,
  ScrollTextIcon,
  FocusIcon,
  BookOpenIcon,
  FileArchiveIcon,
  SparklesIcon,
} from "lucide-react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import * as Tooltip from "@radix-ui/react-tooltip"
import { useTheme } from "@/lib/theme"

const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { path: "/transactions", label: "Transactions", icon: ListIcon },
  { path: "/extractions", label: "Extractions", icon: FileArchiveIcon },
  { path: "/extractions-v2", label: "Extractions v2", icon: SparklesIcon },
  { path: "/console", label: "Console", icon: SettingsIcon },
  { path: "/story", label: "Payments", icon: BookOpenIcon },
  { path: "/inconsistencies", label: "Inconsistencies", icon: AlertTriangleIcon },
  { path: "/logs", label: "Activity Log", icon: ScrollTextIcon },
]

export function Header() {
  const location = useLocation()
  const { mode, setMode } = useTheme()
  const { cache } = useInconsistencyCache()
  const { cache: storyCache } = useStoryCache()
  // Use count if available, fall back to previousCount during loading, then 0
  const inconsistencyCount = cache.count ?? cache.previousCount ?? 0
  const storyCount = storyCache.count ?? storyCache.previousCount ?? 0
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(() => {
    const saved = localStorage.getItem('autoScrollToTable')
    return saved !== null ? saved === 'true' : true
  })

  const showAutoScrollToggle = location.pathname === '/transactions' || location.pathname === '/credit-cards'

  const handleAutoScrollToggle = () => {
    const newValue = !autoScrollEnabled
    setAutoScrollEnabled(newValue)
    localStorage.setItem('autoScrollToTable', String(newValue))
    window.dispatchEvent(new CustomEvent('autoScrollChange', { detail: newValue }))
  }

  return (
    <header className="sticky top-0 z-50 bg-card border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <nav className="flex items-center gap-1 overflow-x-auto scrollbar-hide flex-1 min-w-0 py-1">
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
              const isActive = location.pathname === path || (path === "/transactions" && location.pathname === "/credit-cards")
              return (
                <Link
                  key={path}
                  to={path}
                  className={`relative flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                  {path === "/inconsistencies" && inconsistencyCount > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1 ml-1">
                      {inconsistencyCount > 99 ? "99+" : inconsistencyCount}
                    </span>
                  )}
                  {path === "/story" && storyCount > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1 ml-1">
                      {storyCount > 99 ? "99+" : storyCount}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Auto-scroll Toggle */}
            {showAutoScrollToggle && (
              <Tooltip.Provider>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={handleAutoScrollToggle}
                      className={`p-2 rounded-lg transition-colors hover:bg-accent ${
                        autoScrollEnabled ? 'text-primary' : 'text-muted-foreground'
                      }`}
                      aria-label="Toggle auto-scroll"
                    >
                      <FocusIcon className="h-5 w-5" />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      className="bg-card text-card-foreground px-3 py-1.5 rounded-md shadow-lg border border-border text-sm"
                      sideOffset={5}
                    >
                      Scroll table into view
                      <Tooltip.Arrow className="fill-card" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>
            )}

            {/* Theme Toggle */}
            <DropdownMenu.Root>
              <Tooltip.Provider>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <DropdownMenu.Trigger asChild>
                      <button
                        className="p-2 rounded-lg hover:bg-accent transition-colors"
                        aria-label="Change theme"
                      >
                        {mode === "light" && <SunIcon className="h-5 w-5" />}
                        {mode === "dark" && <MoonIcon className="h-5 w-5" />}
                        {mode === "system" && <MonitorIcon className="h-5 w-5" />}
                      </button>
                    </DropdownMenu.Trigger>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      className="bg-card text-card-foreground px-3 py-1.5 rounded-md shadow-lg border border-border text-sm"
                      sideOffset={5}
                    >
                      Change theme
                      <Tooltip.Arrow className="fill-card" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>
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
      </div>
    </header>
  )
}
