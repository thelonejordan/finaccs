import { ChevronDownIcon } from "lucide-react"
import * as Select from "@radix-ui/react-select"
import type { ExtractorInfo } from "@/lib/api"

interface ExtractorSelectorProps {
  value: string
  onChange: (value: string) => void
  extractors: ExtractorInfo[]
  domain?: 'bank_account' | 'credit_card'
  autoDetected?: string | null
  placeholder?: string
}

export function ExtractorSelector({
  value,
  onChange,
  extractors,
  domain,
  autoDetected,
  placeholder = "Select extractor...",
}: ExtractorSelectorProps) {
  const filtered = domain
    ? extractors.filter(e => e.domain === domain)
    : extractors

  return (
    <Select.Root value={value || ''} onValueChange={onChange}>
      <Select.Trigger className="inline-flex items-center justify-between gap-2 px-3 py-1.5 text-sm rounded-md border border-border bg-card text-foreground hover:bg-accent min-w-[180px]">
        <Select.Value placeholder={placeholder}>
          {value ? (
            <span>
              {value}
              {value === autoDetected && (
                <span className="ml-1 text-xs text-muted-foreground">(auto)</span>
              )}
            </span>
          ) : autoDetected ? (
            <span className="text-muted-foreground">
              {autoDetected} (auto)
            </span>
          ) : (
            placeholder
          )}
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
          <Select.Viewport className="p-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">No extractors available</div>
            ) : (
              filtered.map(extractor => (
                <Select.Item
                  key={extractor.name}
                  value={extractor.name}
                  className="flex items-center justify-between px-3 py-2 text-sm rounded cursor-pointer outline-none text-foreground hover:bg-accent data-[highlighted]:bg-accent"
                >
                  <Select.ItemText>
                    <span>{extractor.name}</span>
                    {extractor.name === autoDetected && (
                      <span className="ml-1 text-xs text-muted-foreground">(auto)</span>
                    )}
                  </Select.ItemText>
                  <span className="text-xs text-muted-foreground">
                    {extractor.supported_extensions.join(', ')}
                  </span>
                </Select.Item>
              ))
            )}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}
