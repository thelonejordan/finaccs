import { ChevronDownIcon, XIcon } from "lucide-react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"

export interface BulkAction {
  label: string
  icon?: React.ReactNode
  action: string
  variant?: 'default' | 'danger'
}

interface BulkActionBarProps {
  selectedCount: number
  actions: BulkAction[]
  onAction: (action: string) => void
  onClearSelection: () => void
}

export function BulkActionBar({ selectedCount, actions, onAction, onClearSelection }: BulkActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 border-y border-blue-200 dark:border-blue-800">
      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
        {selectedCount} selected
      </span>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700">
            Actions
            <ChevronDownIcon className="h-4 w-4" />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="min-w-[160px] bg-card rounded-md shadow-lg border border-border p-1 z-50"
            sideOffset={4}
          >
            {actions.map(action => (
              <DropdownMenu.Item
                key={action.action}
                className={`flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none ${
                  action.variant === 'danger'
                    ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30'
                    : 'text-foreground hover:bg-accent'
                }`}
                onSelect={() => onAction(action.action)}
              >
                {action.icon}
                <span>{action.label}</span>
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <button
        onClick={onClearSelection}
        className="inline-flex items-center gap-1 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <XIcon className="h-4 w-4" />
        Clear
      </button>
    </div>
  )
}
