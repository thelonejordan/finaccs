import { Link, useLocation } from "react-router-dom"
import {
  HeartIcon,
  LayoutDashboardIcon,
  ListIcon,
  CreditCardIcon,
  SettingsIcon,
  AlertTriangleIcon,
  ScrollTextIcon,
  GithubIcon,
  WalletIcon,
} from "lucide-react"

const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { path: "/transactions", label: "Transactions", icon: ListIcon },
  { path: "/credit-cards", label: "Credit Cards", icon: CreditCardIcon },
  { path: "/settings", label: "Settings", icon: SettingsIcon },
  { path: "/inconsistencies", label: "Inconsistencies", icon: AlertTriangleIcon },
  { path: "/logs", label: "Activity Log", icon: ScrollTextIcon },
]

export function Footer() {
  const location = useLocation()
  const currentYear = new Date().getFullYear()

  return (
    <footer className="mt-16 border-t border-border bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main Footer Content */}
        <div className="py-10 grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr] gap-12 md:gap-8">
          {/* Brand Section */}
          <div className="space-y-4 md:pr-12">
            <div className="flex items-center gap-2 h-5">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <WalletIcon className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-semibold uppercase tracking-wider">FinAccs</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              A personal finance tracking application to manage your bank accounts,
              credit cards, and transactions in one place.
            </p>
            <a
              href="https://github.com/thelonejordan/finaccs"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <GithubIcon className="h-4 w-4" />
              <span>thelonejordan/finaccs</span>
            </a>
          </div>

          {/* Navigation Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground h-5 flex items-center">
              Navigation
            </h3>
            <nav className="flex flex-col gap-2">
              {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
                const isActive = location.pathname === path
                return (
                  <Link
                    key={path}
                    to={path}
                    className={`flex items-center gap-2 text-sm transition-colors ${
                      isActive
                        ? "text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </Link>
                )
              })}
            </nav>
          </div>

          {/* Quick Actions Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground h-5 flex items-center">
              Quick Actions
            </h3>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <Link
                to="/settings"
                className="hover:text-foreground transition-colors"
              >
                Add Bank Account
              </Link>
              <Link
                to="/settings"
                className="hover:text-foreground transition-colors"
              >
                Add Credit Card
              </Link>
              <Link
                to="/transactions"
                className="hover:text-foreground transition-colors"
              >
                View All Transactions
              </Link>
              <Link
                to="/inconsistencies"
                className="hover:text-foreground transition-colors"
              >
                Review Inconsistencies
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="py-6 border-t border-border/50">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              &copy; {currentYear} FinAccs. All rights reserved.
            </p>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span>Made with</span>
              <HeartIcon className="h-4 w-4 text-red-500 fill-red-500 animate-heartbeat" />
              <span>by</span>
              <a
                href="https://github.com/thelonejordan"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground hover:text-primary transition-colors"
              >
                thelonejordan
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
