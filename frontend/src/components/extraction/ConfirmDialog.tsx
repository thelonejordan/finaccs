import * as Dialog from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'danger'
  onConfirm: () => void
  isLoading?: boolean
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = 'default',
  onConfirm,
  isLoading = false,
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm()
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card rounded-lg shadow-xl p-6 w-full max-w-md z-50">
          <Dialog.Title className="text-lg font-semibold text-foreground">
            {title}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            {description}
          </Dialog.Description>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              onClick={handleConfirm}
              disabled={isLoading}
              className={`px-4 py-2 text-sm font-medium rounded-md text-white disabled:opacity-50 ${
                variant === 'danger'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isLoading ? 'Processing...' : confirmLabel}
            </button>
          </div>

          <Dialog.Close asChild>
            <button
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-accent"
              aria-label="Close"
            >
              <XIcon className="h-4 w-4 text-muted-foreground" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
