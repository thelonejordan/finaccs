import { useState, useRef, useEffect } from "react"
import type { CategoryData } from "@/lib/api"

const COLORS = [
  "#0088FE",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
  "#8884D8",
  "#82CA9D",
  "#FFC658",
  "#FF6B6B",
  "#A78BFA",
  "#F472B6",
  "#34D399",
  "#F59E0B",
  "#EC4899",
  "#6366F1",
  "#14B8A6",
]

interface WaffleChartProps {
  data: CategoryData[]
  cellSize?: number
  gap?: number
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function FormattedCurrency({ amount, className = "" }: { amount: number; className?: string }) {
  const formatted = formatCurrency(amount)
  const match = formatted.match(/^(.*?)(\.\d{2})$/)
  if (match) {
    return (
      <span className={className}>
        {match[1]}
        <span className="opacity-50">{match[2]}</span>
      </span>
    )
  }
  return <span className={className}>{formatted}</span>
}

export function WaffleChart({ data, cellSize = 12, gap = 2 }: WaffleChartProps) {
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ cols: 20, rows: 10 })

  // Calculate grid dimensions based on container width
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth
        const cols = Math.floor(width / (cellSize + gap))
        // Use a reasonable number of rows to make a nice rectangle
        const rows = Math.max(8, Math.min(12, Math.floor(cols * 0.5)))
        setDimensions({ cols: Math.max(10, cols), rows })
      }
    }

    updateDimensions()
    window.addEventListener("resize", updateDimensions)
    return () => window.removeEventListener("resize", updateDimensions)
  }, [cellSize, gap])

  const totalCells = dimensions.cols * dimensions.rows
  const total = data.reduce((sum, item) => sum + item.amount, 0)

  // Calculate cells per category
  const cellsPerCategory = data.map((item, index) => {
    const percentage = total > 0 ? item.amount / total : 0
    const cells = Math.max(1, Math.round(percentage * totalCells))
    return {
      ...item,
      cells,
      percentage: percentage * 100,
      color: COLORS[index % COLORS.length],
    }
  })

  // Adjust for rounding errors
  let totalAssigned = cellsPerCategory.reduce((sum, item) => sum + item.cells, 0)

  // If we have more cells assigned than available, reduce from largest categories
  while (totalAssigned > totalCells && cellsPerCategory.length > 0) {
    const largestIdx = cellsPerCategory.reduce(
      (maxIdx, item, idx, arr) => (item.cells > arr[maxIdx].cells ? idx : maxIdx),
      0
    )
    if (cellsPerCategory[largestIdx].cells > 1) {
      cellsPerCategory[largestIdx].cells -= 1
      totalAssigned -= 1
    } else {
      break
    }
  }

  // If we have fewer cells, add to largest
  while (totalAssigned < totalCells && cellsPerCategory.length > 0) {
    const largestIdx = cellsPerCategory.reduce(
      (maxIdx, item, idx, arr) => (item.cells > arr[maxIdx].cells ? idx : maxIdx),
      0
    )
    cellsPerCategory[largestIdx].cells += 1
    totalAssigned += 1
  }

  // Build the waffle grid
  const grid: { category: string; color: string; amount: number; percentage: number }[] = []
  cellsPerCategory.forEach((item) => {
    for (let i = 0; i < item.cells; i++) {
      grid.push({
        category: item.category,
        color: item.color,
        amount: item.amount,
        percentage: item.percentage,
      })
    }
  })

  // Fill remaining cells if any
  while (grid.length < totalCells) {
    grid.push({
      category: "Other",
      color: "#e5e7eb",
      amount: 0,
      percentage: 0,
    })
  }

  const hoveredData = hoveredCategory
    ? cellsPerCategory.find((c) => c.category === hoveredCategory)
    : null

  return (
    <div className="space-y-4">
      {/* Waffle Grid with Tooltip Overlay */}
      <div ref={containerRef} className="w-full relative">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${dimensions.cols}, ${cellSize}px)`,
            gap: `${gap}px`,
            justifyContent: "center",
          }}
        >
          {grid.map((cell, idx) => (
            <div
              key={idx}
              className={`rounded-sm transition-all duration-150 cursor-pointer ${
                hoveredCategory && hoveredCategory !== cell.category
                  ? "opacity-20"
                  : "opacity-100"
              } ${
                hoveredCategory === cell.category
                  ? "scale-110"
                  : "hover:scale-105"
              }`}
              style={{
                backgroundColor: cell.color,
                width: cellSize,
                height: cellSize,
              }}
              onMouseEnter={() => cell.category !== "Other" && setHoveredCategory(cell.category)}
              onMouseLeave={() => setHoveredCategory(null)}
            />
          ))}
        </div>

        {/* Hover Info Tooltip - Positioned as overlay */}
        {hoveredData && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center px-4 py-3 rounded-lg bg-card/95 backdrop-blur-sm border border-border shadow-lg pointer-events-none animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-center gap-2 mb-1">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: hoveredData.color }}
              />
              <span className="font-medium">{hoveredData.category}</span>
            </div>
            <FormattedCurrency amount={hoveredData.amount} className="text-lg font-bold" />
            <p className="text-sm text-muted-foreground whitespace-nowrap">
              {hoveredData.percentage.toFixed(1)}% of total spending
            </p>
          </div>
        )}
      </div>

      {/* Legend - Scrollable if too many categories */}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 text-xs max-h-24 overflow-y-auto">
        {cellsPerCategory.map((item) => (
          <div
            key={item.category}
            className={`flex items-center gap-1 cursor-pointer transition-opacity px-1.5 py-0.5 rounded ${
              hoveredCategory && hoveredCategory !== item.category
                ? "opacity-40"
                : "opacity-100"
            } ${hoveredCategory === item.category ? "bg-muted" : ""}`}
            onMouseEnter={() => setHoveredCategory(item.category)}
            onMouseLeave={() => setHoveredCategory(null)}
          >
            <div
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span className="truncate max-w-[80px]">{item.category}</span>
            <span className="text-muted-foreground">
              {item.percentage.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
