import {
  CheckCircleIcon,
  XCircleIcon,
  Loader2Icon,
  AlertCircleIcon,
  FileTextIcon,
} from "lucide-react"

type ExtractionStatus = 'pending' | 'completed' | 'error'
type TransformationStatus = 'not_applicable' | 'not_transformed' | 'transformed'
type DataSourceStatus = 'unloaded' | 'loading' | 'loaded' | 'error'
type ExtractionFileStatus = 'not_extracted' | 'extracted'

interface StatusBadgeProps {
  status: ExtractionStatus | TransformationStatus | DataSourceStatus | ExtractionFileStatus
  size?: 'sm' | 'md'
}

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'

  const configs: Record<string, { bg: string; icon: React.ReactNode; label: string }> = {
    // Extraction status
    pending: {
      bg: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
      icon: <Loader2Icon className={`${iconSize} animate-spin`} />,
      label: 'Pending',
    },
    completed: {
      bg: 'bg-green-500/20 text-green-600 dark:text-green-400',
      icon: <CheckCircleIcon className={iconSize} />,
      label: 'Completed',
    },
    error: {
      bg: 'bg-red-500/20 text-red-600 dark:text-red-400',
      icon: <XCircleIcon className={iconSize} />,
      label: 'Error',
    },
    // Transformation status
    not_applicable: {
      bg: 'bg-gray-500/20 text-gray-600 dark:text-gray-400',
      icon: <AlertCircleIcon className={iconSize} />,
      label: 'N/A',
    },
    not_transformed: {
      bg: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
      icon: <FileTextIcon className={iconSize} />,
      label: 'Raw',
    },
    transformed: {
      bg: 'bg-purple-500/20 text-purple-600 dark:text-purple-400',
      icon: <CheckCircleIcon className={iconSize} />,
      label: 'Transformed',
    },
    // Data source status
    unloaded: {
      bg: 'bg-gray-500/20 text-gray-600 dark:text-gray-400',
      icon: <FileTextIcon className={iconSize} />,
      label: 'Unloaded',
    },
    loading: {
      bg: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
      icon: <Loader2Icon className={`${iconSize} animate-spin`} />,
      label: 'Loading',
    },
    loaded: {
      bg: 'bg-green-500/20 text-green-600 dark:text-green-400',
      icon: <CheckCircleIcon className={iconSize} />,
      label: 'Loaded',
    },
    // Extraction file status
    not_extracted: {
      bg: 'bg-gray-500/20 text-gray-600 dark:text-gray-400',
      icon: <FileTextIcon className={iconSize} />,
      label: 'Not Extracted',
    },
    extracted: {
      bg: 'bg-green-500/20 text-green-600 dark:text-green-400',
      icon: <CheckCircleIcon className={iconSize} />,
      label: 'Extracted',
    },
  }

  const config = configs[status] || configs.error

  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClasses} ${config.bg}`}>
      {config.icon}
      {config.label}
    </span>
  )
}
