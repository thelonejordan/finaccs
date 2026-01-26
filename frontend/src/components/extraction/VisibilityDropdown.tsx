import { ChevronDownIcon, EyeIcon, EyeOffIcon, ListIcon } from "lucide-react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"

export type VisibilityFilter = 'visible' | 'hidden' | 'all'

interface VisibilityDropdownProps {
  value: VisibilityFilter
  onChange: (value: VisibilityFilter) => void
}

export function VisibilityDropdown({ value, onChange }: VisibilityDropdownProps) {
  const options = [
    { value: 'visible' as const, label: 'Visible', icon: <EyeIcon className="h-4 w-4" /> },
    { value: 'hidden' as const, label: 'Hidden', icon: <EyeOffIcon className="h-4 w-4" /> },
    { value: 'all' as const, label: 'All', icon: <ListIcon className="h-4 w-4" /> },
  ]

  const current = options.find(o => o.value === value) || options[0]

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="inline-flex items-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg border border-border bg-card text-foreground hover:bg-accent">
          {current.icon}
          <span>{current.label}</span>
          <ChevronDownIcon className="h-4 w-4" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="min-w-[120px] bg-card rounded-md shadow-lg border border-border p-1 z-50"
          sideOffset={4}
        >
          {options.map(option => (
            <DropdownMenu.Item
              key={option.value}
              className={`flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none ${
                option.value === value
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'text-foreground hover:bg-accent'
              }`}
              onSelect={() => onChange(option.value)}
            >
              {option.icon}
              <span>{option.label}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
