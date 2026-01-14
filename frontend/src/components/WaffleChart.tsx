import { useState } from "react"
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
]

interface WaffleChartProps {
  data: CategoryData[]
  totalCells?: number
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount)
}

export function WaffleChart({ data, totalCells = 100 }: WaffleChartProps) {
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null)

  const total = data.reduce((sum, item) => sum + item.amount, 0)

  // Calculate cells per category
  const cellsPerCategory = data.map((item, index) => {
    const percentage = total > 0 ? item.amount / total : 0
    const cells = Math.round(percentage * totalCells)
    return {
      ...item,
      cells,
      percentage: percentage * 100,
      color: COLORS[index % COLORS.length],
    }
  })

  // Adjust for rounding errors
  const totalAssigned = cellsPerCategory.reduce((sum, item) => sum + item.cells, 0)
  if (totalAssigned !== totalCells && cellsPerCategory.length > 0) {
    const diff = totalCells - totalAssigned
    // Add/remove from the largest category
    const largestIdx = cellsPerCategory.reduce(
      (maxIdx, item, idx, arr) => (item.cells > arr[maxIdx].cells ? idx : maxIdx),
      0
    )
    cellsPerCategory[largestIdx].cells += diff
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

  const gridSize = Math.ceil(Math.sqrt(totalCells))
  const hoveredData = hoveredCategory
    ? cellsPerCategory.find((c) => c.category === hoveredCategory)
    : null

  return (
    <div className="space-y-4">
      {/* Waffle Grid */}
      <div className="flex justify-center">
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
            width: "fit-content",
          }}
        >
          {grid.map((cell, idx) => (
            <div
              key={idx}
              className={`w-5 h-5 rounded-sm transition-all duration-150 cursor-pointer ${
                hoveredCategory && hoveredCategory !== cell.category
                  ? "opacity-30"
                  : "opacity-100"
              } ${
                hoveredCategory === cell.category
                  ? "scale-110 shadow-md"
                  : "hover:scale-105"
              }`}
              style={{ backgroundColor: cell.color }}
              onMouseEnter={() => setHoveredCategory(cell.category)}
              onMouseLeave={() => setHoveredCategory(null)}
            />
          ))}
        </div>
      </div>

      {/* Hover Info */}
      {hoveredData && (
        <div className="text-center p-3 rounded-lg bg-muted/50 animate-in fade-in duration-150">
          <div className="flex items-center justify-center gap-2 mb-1">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: hoveredData.color }}
            />
            <span className="font-medium">{hoveredData.category}</span>
          </div>
          <p className="text-lg font-bold">{formatCurrency(hoveredData.amount)}</p>
          <p className="text-sm text-muted-foreground">
            {hoveredData.percentage.toFixed(1)}% of total spending
          </p>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm">
        {cellsPerCategory.map((item) => (
          <div
            key={item.category}
            className={`flex items-center gap-1.5 cursor-pointer transition-opacity ${
              hoveredCategory && hoveredCategory !== item.category
                ? "opacity-40"
                : "opacity-100"
            }`}
            onMouseEnter={() => setHoveredCategory(item.category)}
            onMouseLeave={() => setHoveredCategory(null)}
          >
            <div
              className="w-3 h-3 rounded-sm flex-shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span className="truncate max-w-[100px]">{item.category}</span>
            <span className="text-muted-foreground">
              ({item.percentage.toFixed(0)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
