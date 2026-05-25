import { ArrowUpIcon, ArrowDownIcon } from "lucide-react"

export interface SortOption {
  value: string
  label: string
}

interface SortDropdownProps {
  options: SortOption[]
  sortBy: string
  sortDirection: "asc" | "desc"
  onSortChange: (sortBy: string, direction: "asc" | "desc") => void
}

export function SortDropdown({ options, sortBy, sortDirection, onSortChange }: SortDropdownProps) {
  return (
    <div className="flex items-center gap-1">
      <select
        value={sortBy}
        onChange={e => onSortChange(e.target.value, sortDirection)}
        className="px-2 py-1.5 rounded border border-border bg-background text-sm"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <button
        onClick={() => onSortChange(sortBy, sortDirection === "asc" ? "desc" : "asc")}
        className="p-1.5 rounded border border-border hover:bg-muted transition-colors"
        title={sortDirection === "asc" ? "Ascending" : "Descending"}
      >
        {sortDirection === "asc"
          ? <ArrowUpIcon className="h-4 w-4" />
          : <ArrowDownIcon className="h-4 w-4" />
        }
      </button>
    </div>
  )
}

export function sortItems<T>(items: T[], sortBy: string, sortDirection: "asc" | "desc"): T[] {
  return [...items].sort((a, b) => {
    const aVal = (a as Record<string, unknown>)[sortBy]
    const bVal = (b as Record<string, unknown>)[sortBy]

    if (aVal == null && bVal == null) return 0
    if (aVal == null) return 1
    if (bVal == null) return -1

    let cmp: number
    if (typeof aVal === "number" && typeof bVal === "number") {
      cmp = aVal - bVal
    } else {
      cmp = String(aVal).localeCompare(String(bVal))
    }

    return sortDirection === "asc" ? cmp : -cmp
  })
}
