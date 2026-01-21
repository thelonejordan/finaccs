import { ChevronDownIcon } from "lucide-react"
import * as Select from "@radix-ui/react-select"
import type { BankAccount, CreditCard } from "@/lib/api"

interface DomainEntitySelectorProps {
  type: 'bank_account' | 'credit_card'
  value: number | null
  onChange: (value: number | null) => void
  bankAccounts?: BankAccount[]
  creditCards?: CreditCard[]
  placeholder?: string
  allowClear?: boolean
}

export function DomainEntitySelector({
  type,
  value,
  onChange,
  bankAccounts = [],
  creditCards = [],
  placeholder,
  allowClear = true,
}: DomainEntitySelectorProps) {
  const items = type === 'bank_account' ? bankAccounts : creditCards
  const defaultPlaceholder = type === 'bank_account' ? 'Select bank account...' : 'Select credit card...'

  const currentItem = items.find(item => item.id === value)

  return (
    <Select.Root
      value={value?.toString() || ''}
      onValueChange={(val) => onChange(val === '__clear__' ? null : Number(val))}
    >
      <Select.Trigger className="inline-flex items-center justify-between gap-2 px-3 py-1.5 text-sm rounded-md border border-border bg-card text-foreground hover:bg-accent min-w-[180px]">
        <Select.Value placeholder={placeholder || defaultPlaceholder}>
          {currentItem?.nickname || (placeholder || defaultPlaceholder)}
        </Select.Value>
        <Select.Icon>
          <ChevronDownIcon className="h-4 w-4" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          className="overflow-hidden bg-card rounded-md shadow-lg border border-border z-50"
          position="popper"
          sideOffset={4}
        >
          <Select.Viewport className="p-1 max-h-60 overflow-auto">
            {allowClear && value !== null && (
              <Select.Item
                value="__clear__"
                className="flex items-center px-3 py-2 text-sm rounded cursor-pointer outline-none text-muted-foreground hover:bg-accent data-[highlighted]:bg-accent italic"
              >
                <Select.ItemText>Unassign</Select.ItemText>
              </Select.Item>
            )}
            {items.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                No {type === 'bank_account' ? 'bank accounts' : 'credit cards'} found
              </div>
            ) : (
              items.map(item => (
                <Select.Item
                  key={item.id}
                  value={item.id.toString()}
                  className="flex items-center justify-between px-3 py-2 text-sm rounded cursor-pointer outline-none text-foreground hover:bg-accent data-[highlighted]:bg-accent"
                >
                  <Select.ItemText>{item.nickname}</Select.ItemText>
                  {type === 'credit_card' && 'card_number_mask' in item && (
                    <span className="text-xs text-muted-foreground">{item.card_number_mask}</span>
                  )}
                </Select.Item>
              ))
            )}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}
