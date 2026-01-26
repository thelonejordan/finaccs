import { useState } from "react"
import { useLocation } from "react-router-dom"
import {
  SunIcon,
  MoonIcon,
  MonitorIcon,
  CheckIcon,
  FocusIcon,
  TypeIcon,
} from "lucide-react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import * as Tooltip from "@radix-ui/react-tooltip"
import { useTheme } from "@/lib/theme"
import { useFont, type FontFamily } from "@/lib/font"

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/transactions": "Transactions",
  "/stories": "Stories",
  "/extractions": "Extractions",
  "/extractions-v2": "Extractions v2",
  "/console": "Console",
  "/payments": "Payments",
  "/anomalies": "Anomalies",
  "/activity": "Activity",
}

const FONT_OPTIONS: { value: FontFamily; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "manrope", label: "Manrope" },
  { value: "albert-sans", label: "Albert Sans" },
]

export function Header() {
  const location = useLocation()
  const { mode, setMode } = useTheme()
  const { font, setFont } = useFont()
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(() => {
    const saved = localStorage.getItem('autoScrollToTable')
    return saved !== null ? saved === 'true' : true
  })

  // Get page title, handle story detail pages
  const pageTitle = location.pathname.startsWith("/stories/")
    ? "Story Details"
    : PAGE_TITLES[location.pathname] || "FinAccs"

  // Auto-scroll is only applicable on pages with tables
  const autoScrollApplicable = location.pathname === "/transactions"

  const handleAutoScrollToggle = () => {
    const newValue = !autoScrollEnabled
    setAutoScrollEnabled(newValue)
    localStorage.setItem('autoScrollToTable', String(newValue))
    window.dispatchEvent(new CustomEvent('autoScrollChange', { detail: newValue }))
  }

  return (
    <header className="sticky top-0 z-50 bg-background border-b border-border h-8">
      <div className="px-4 sm:px-6 h-full">
        <div className="flex items-center justify-center h-full relative">
          <h1 className="text-[13px] font-medium">{pageTitle}</h1>

          <div className="flex items-center gap-1 absolute right-0">
            {/* Auto-scroll Toggle */}
            <Tooltip.Provider>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    onClick={autoScrollApplicable ? handleAutoScrollToggle : undefined}
                    disabled={!autoScrollApplicable}
                    className={`p-1.5 rounded-md transition-colors ${
                      !autoScrollApplicable
                        ? 'text-muted-foreground/30 cursor-not-allowed'
                        : autoScrollEnabled
                        ? 'text-primary hover:bg-accent'
                        : 'text-muted-foreground hover:bg-accent'
                    }`}
                    aria-label={autoScrollEnabled ? "Disable auto-scroll to table" : "Enable auto-scroll to table"}
                  >
                    <FocusIcon className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="bg-popover text-popover-foreground px-3 py-1.5 rounded-md shadow-lg border border-border text-sm z-50"
                    sideOffset={5}
                  >
                    {autoScrollApplicable ? "Auto-scroll to table" : "Auto-scroll (not applicable on this page)"}
                    <Tooltip.Arrow className="fill-popover" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>

            {/* Font Toggle */}
            <DropdownMenu.Root>
              <Tooltip.Provider>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <DropdownMenu.Trigger asChild>
                      <button
                        className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                        aria-label="Change font"
                      >
                        <TypeIcon className="h-4 w-4" strokeWidth={2.5} />
                      </button>
                    </DropdownMenu.Trigger>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      className="bg-popover text-popover-foreground px-3 py-1.5 rounded-md shadow-lg border border-border text-sm z-50"
                      sideOffset={5}
                    >
                      Change font
                      <Tooltip.Arrow className="fill-popover" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="bg-popover rounded-lg shadow-lg border border-border p-1 min-w-[140px] z-50"
                  sideOffset={5}
                  align="end"
                >
                  <DropdownMenu.RadioGroup
                    value={font}
                    onValueChange={(value) => setFont(value as FontFamily)}
                  >
                    {FONT_OPTIONS.map(({ value, label }) => (
                      <DropdownMenu.RadioItem
                        key={value}
                        value={value}
                        className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent outline-none"
                      >
                        <span className="flex-1">{label}</span>
                        {font === value && <CheckIcon className="h-4 w-4" />}
                      </DropdownMenu.RadioItem>
                    ))}
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>

            {/* Theme Toggle */}
            <DropdownMenu.Root>
              <Tooltip.Provider>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <DropdownMenu.Trigger asChild>
                      <button
                        className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                        aria-label="Change theme"
                      >
                        {mode === "light" && <SunIcon className="h-4 w-4" strokeWidth={2.5} />}
                        {mode === "dark" && <MoonIcon className="h-4 w-4" strokeWidth={2.5} />}
                        {mode === "system" && <MonitorIcon className="h-4 w-4" strokeWidth={2.5} />}
                      </button>
                    </DropdownMenu.Trigger>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      className="bg-popover text-popover-foreground px-3 py-1.5 rounded-md shadow-lg border border-border text-sm z-50"
                      sideOffset={5}
                    >
                      Change theme
                      <Tooltip.Arrow className="fill-popover" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="bg-popover rounded-lg shadow-lg border border-border p-1 min-w-[140px] z-50"
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
