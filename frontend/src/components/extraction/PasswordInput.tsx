import { useState } from "react"
import { EyeIcon, EyeOffIcon, LockIcon, SaveIcon, XIcon } from "lucide-react"

interface PasswordInputProps {
  value: string
  onChange: (value: string) => void
  onSave?: () => void
  onCancel?: () => void
  placeholder?: string
  showSaveButtons?: boolean
  isLoading?: boolean
}

export function PasswordInput({
  value,
  onChange,
  onSave,
  onCancel,
  placeholder = "Enter password...",
  showSaveButtons = false,
  isLoading = false,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <LockIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type={showPassword ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={isLoading}
          className="w-full pl-9 pr-10 py-1.5 text-sm rounded-md border border-border bg-card text-foreground placeholder-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
        >
          {showPassword ? (
            <EyeOffIcon className="h-4 w-4" />
          ) : (
            <EyeIcon className="h-4 w-4" />
          )}
        </button>
      </div>

      {showSaveButtons && (
        <>
          <button
            onClick={onSave}
            disabled={isLoading}
            className="p-1.5 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            title="Save password"
          >
            <SaveIcon className="h-4 w-4" />
          </button>
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="p-1.5 rounded-md border border-border text-gray-600 dark:text-muted-foreground hover:bg-accent disabled:opacity-50"
            title="Cancel"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  )
}
