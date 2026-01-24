import { createContext, useContext, useEffect, useState } from "react"

export type FontFamily = "default" | "manrope" | "albert-sans"

interface FontContextType {
  font: FontFamily
  setFont: (font: FontFamily) => void
}

const FontContext = createContext<FontContextType | undefined>(undefined)

const FONT_STACKS: Record<FontFamily, string> = {
  default: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
  manrope: '"Manrope", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
  "albert-sans": '"Albert Sans", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
}

export function FontProvider({ children }: { children: React.ReactNode }) {
  const [font, setFontState] = useState<FontFamily>(() => {
    const stored = localStorage.getItem("font-family") as FontFamily | null
    if (stored && ["default", "manrope", "albert-sans"].includes(stored)) return stored
    return "manrope" // Default to Manrope
  })

  useEffect(() => {
    document.documentElement.style.setProperty("--font-sans", FONT_STACKS[font])
  }, [font])

  const setFont = (newFont: FontFamily) => {
    setFontState(newFont)
    localStorage.setItem("font-family", newFont)
  }

  return (
    <FontContext.Provider value={{ font, setFont }}>
      {children}
    </FontContext.Provider>
  )
}

export function useFont() {
  const context = useContext(FontContext)
  if (!context) {
    throw new Error("useFont must be used within a FontProvider")
  }
  return context
}
