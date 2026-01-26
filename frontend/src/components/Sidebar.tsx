import { Link, useLocation } from "react-router-dom"
import { useInconsistencyCache } from "@/lib/inconsistency-cache"
import { usePaymentsCache } from "@/lib/payments-cache"
import {
  LayoutDashboardIcon,
  ArrowLeftRightIcon,
  BookOpenIcon,
  UsersIcon,
  FileTextIcon,
  SettingsIcon,
  CreditCardIcon,
  AlertTriangleIcon,
  ActivityIcon,
  FileIcon,
  WalletIcon,
} from "lucide-react"

/** Maximum badge count to display before showing "99+" */
const MAX_BADGE_DISPLAY = 99

const NAV_SECTIONS = [
  {
    label: "Main",
    items: [
      { path: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
      { path: "/transactions", label: "Transactions", icon: ArrowLeftRightIcon },
      { path: "/stories", label: "Stories", icon: BookOpenIcon },
      { path: "/entities", label: "Entities", icon: UsersIcon },
    ],
  },
  {
    label: "Extractions",
    items: [
      { path: "/extractions", label: "Extractions", icon: FileTextIcon },
      { path: "/extractions-v2", label: "Extractions v2", icon: FileIcon },
      { path: "/console", label: "Console", icon: SettingsIcon },
    ],
  },
  {
    label: "Operations",
    items: [
      { path: "/payments", label: "Payments", icon: CreditCardIcon, badgeKey: "payments" as const },
      { path: "/anomalies", label: "Anomalies", icon: AlertTriangleIcon, badgeKey: "anomalies" as const },
      { path: "/activity", label: "Activity", icon: ActivityIcon },
    ],
  },
]

/**
 * Sidebar navigation component with grouped menu sections.
 * Displays navigation links with active state highlighting and notification badges.
 */
export function Sidebar() {
  const location = useLocation()
  const { cache } = useInconsistencyCache()
  const { cache: paymentsCache } = usePaymentsCache()

  const inconsistencyCount = cache.count ?? cache.previousCount ?? 0
  const paymentsCount = paymentsCache.count ?? paymentsCache.previousCount ?? 0

  const getBadgeCount = (badgeKey?: "payments" | "anomalies") => {
    if (badgeKey === "payments") return paymentsCount
    if (badgeKey === "anomalies") return inconsistencyCount
    return 0
  }

  return (
    <aside className="w-64 h-[calc(100vh-2rem)] bg-card border-r border-border flex flex-col shrink-0 sticky top-8 self-start">
      {/* Logo */}
      <div className="p-4 pb-3">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <WalletIcon className="w-5 h-5 text-primary" />
          </div>
          <span className="text-xl font-bold tracking-tight text-foreground">FinAccs</span>
        </Link>
      </div>

      {/* Divider */}
      <div className="border-b border-border mx-3 mb-2" />

      {/* Navigation */}
      <nav className="flex-1 px-3 py-1 overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-5">
            <h3 className="px-3 mb-2 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">
              {section.label}
            </h3>
            <ul className="space-y-1">
              {section.items.map(({ path, label, icon: Icon, badgeKey }) => {
                const isActive = location.pathname === path ||
                  (path === "/stories" && location.pathname.startsWith("/stories/")) ||
                  (path === "/entities" && location.pathname.startsWith("/entities/"))
                const badgeCount = getBadgeCount(badgeKey)

                return (
                  <li key={path}>
                    <Link
                      to={path}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="flex-1">{label}</span>
                      {badgeCount > 0 && (
                        <span className="bg-red-500 text-white text-[9px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">
                          {badgeCount > MAX_BADGE_DISPLAY ? `${MAX_BADGE_DISPLAY}+` : badgeCount}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}
