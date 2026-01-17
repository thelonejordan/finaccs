# UI Design System

This document outlines the UI decisions and design system used in the finaccs frontend.

## Architecture

### Component Library: Radix UI Primitives

We use [Radix UI](https://www.radix-ui.com/) primitives directly with Tailwind CSS styling, avoiding abstraction layers like shadcn/ui. This approach provides:

- **Full control** over styling without fighting component abstractions
- **Accessibility** built-in (keyboard navigation, ARIA attributes, focus management)
- **Flexibility** to customize behavior and appearance

#### Radix Packages Used

```
@radix-ui/react-dropdown-menu  - Menu dropdowns (theme toggle, link account)
@radix-ui/react-select         - Form select inputs (category/type filters)
@radix-ui/react-tooltip        - Hover tooltips (transaction details)
@radix-ui/react-dialog         - Modal dialogs (future use)
@radix-ui/react-separator      - Visual separators
```

### Styling: Tailwind CSS v4

All styling is done with Tailwind utility classes. No CSS-in-JS or component-level stylesheets.

---

## Color System

### Radix Color Scales

We use [Radix Colors](https://www.radix-ui.com/colors) for consistent, accessible color scales:

- **Gray scale** - Neutral colors for backgrounds, borders, and text
- **Blue scale** - Primary accent color

Each scale has 12 steps designed for specific use cases:
- Steps 1-2: App backgrounds
- Steps 3-5: Component backgrounds
- Steps 6-8: Borders and separators
- Steps 9-10: Solid backgrounds
- Steps 11-12: Text

### Theme Colors (CSS Variables)

Defined in `src/index.css`:

```css
/* Light mode */
:root {
  --color-page-background: #fff;
  --gray-1 through --gray-12: Radix light gray scale
  --blue-1 through --blue-12: Radix light blue scale
}

/* Dark mode */
.dark {
  --color-page-background: #111;
  --gray-1 through --gray-12: Radix dark gray scale
  --blue-1 through --blue-12: Radix dark blue scale
}
```

### Semantic Color Mapping

```css
@theme {
  --color-background: var(--color-page-background);
  --color-foreground: var(--gray-12);
  --color-card: var(--gray-1);
  --color-card-foreground: var(--gray-12);
  --color-primary: var(--blue-9);
  --color-primary-foreground: white;
  --color-secondary: var(--gray-3);
  --color-muted: var(--gray-3);
  --color-accent: var(--gray-4);
  --color-border: var(--gray-6);
  --color-input: var(--gray-6);
  --color-ring: var(--blue-8);
}
```

---

## Light/Dark Mode Color Strategy

### Problem

Colors optimized for dark mode (e.g., `-400` variants) can appear washed out on white backgrounds, reducing legibility.

### Solution

Use different color intensities based on color type:

**Semantic colors (green/red for debit/credit):**
| Purpose | Light Mode | Dark Mode |
|---------|------------|-----------|
| Text colors | `-800` (high contrast) | `-400` (lighter) |

**Accent colors (decorative, section icons):**
| Purpose | Light Mode | Dark Mode |
|---------|------------|-----------|
| Text colors | `-600` (standard) | `-400` (lighter) |

**Both:**
| Purpose | Light Mode | Dark Mode |
|---------|------------|-----------|
| Background tints | `-500/10` | `-500/10` |
| Borders | `-500/20` | `-500/20` |
| Solid buttons | `-600` | `-600` |

### Implementation Pattern

```tsx
// Semantic colors (debit/credit) - high contrast for legibility
<span className="text-green-800 dark:text-green-400">
  +{formatCurrency(credit)}
</span>
<span className="text-red-800 dark:text-red-400">
  -{formatCurrency(debit)}
</span>

// Accent colors (decorative) - standard contrast
<WalletIcon className="text-blue-600 dark:text-blue-400" />
<ActivityIcon className="text-purple-600 dark:text-purple-400" />

// Backgrounds (same for both modes - opacity handles contrast)
<div className="bg-green-500/10 border-green-500/20">
```

### Color Usage by Context

**Semantic Colors (High Contrast)**
| Context | Light Mode | Dark Mode | Example |
|---------|------------|-----------|---------|
| Credit/Income | `text-green-800` | `text-green-400` | Balance amounts, deposits |
| Debit/Expense | `text-red-800` | `text-red-400` | Expense amounts, withdrawals |

**Accent Colors (Decorative)**
| Context | Light Mode | Dark Mode | Example |
|---------|------------|-----------|---------|
| Primary | `text-blue-600` | `text-blue-400` | Current balance card icon |
| Secondary | `text-purple-600` | `text-purple-400` | Transaction count icon |
| Charts | `text-indigo-600` | `text-indigo-400` | Monthly overview |
| Categories | `text-pink-600` | `text-pink-400` | Spending breakdown |
| Recent | `text-teal-600` | `text-teal-400` | Recent transactions |
| Top expenses | `text-orange-600` | `text-orange-400` | Top expenses |
| Data sources | `text-cyan-600` | `text-cyan-400` | Source files |
| Pending | `text-violet-600` | `text-violet-400` | Pending files |
| Warning | `text-amber-600` | `text-amber-400` | Unlinked state |

---

## Component Patterns

### Cards (Sections)

No abstraction - use semantic HTML with Tailwind:

```tsx
<section className="rounded-xl border border-border bg-card shadow-sm">
  <header className="p-6 pb-2">
    <h3 className="font-semibold">Title</h3>
  </header>
  <div className="p-6 pt-0">
    {/* Content */}
  </div>
</section>
```

### Gradient Cards

For visual hierarchy, cards can have subtle gradient backgrounds:

```tsx
<section className="rounded-xl border border-green-500/20 bg-gradient-to-br from-green-500/10 via-card to-card">
```

### Badges

Inline spans with consistent styling:

```tsx
<span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
  Category Name
</span>
```

### Dropdown Menu

```tsx
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"

<DropdownMenu.Root>
  <DropdownMenu.Trigger asChild>
    <button className="p-2 rounded-lg hover:bg-accent">
      <MenuIcon />
    </button>
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      className="w-56 bg-card rounded-lg shadow-lg border border-border p-2"
      sideOffset={8}
      align="end"
    >
      <DropdownMenu.Item className="px-4 py-3 rounded-md hover:bg-accent cursor-pointer outline-none">
        Menu Item
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
```

### Select

```tsx
import * as Select from "@radix-ui/react-select"

<Select.Root value={value} onValueChange={setValue}>
  <Select.Trigger className="px-3 py-2 rounded-lg border border-input bg-background">
    <Select.Value placeholder="Select..." />
    <Select.Icon>
      <ChevronDownIcon />
    </Select.Icon>
  </Select.Trigger>
  <Select.Portal>
    <Select.Content className="bg-card rounded-lg shadow-lg border border-border">
      <Select.Viewport className="p-1">
        <Select.Item value="option" className="px-3 py-2 rounded-md hover:bg-accent cursor-pointer outline-none">
          <Select.ItemText>Option</Select.ItemText>
          <Select.ItemIndicator>
            <CheckIcon />
          </Select.ItemIndicator>
        </Select.Item>
      </Select.Viewport>
    </Select.Content>
  </Select.Portal>
</Select.Root>
```

### Tooltip

```tsx
import * as Tooltip from "@radix-ui/react-tooltip"

<Tooltip.Provider delayDuration={300}>
  <Tooltip.Root>
    <Tooltip.Trigger asChild>
      {children}
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content
        side="right"
        sideOffset={8}
        className="rounded-lg border border-border bg-card shadow-lg"
      >
        {/* Tooltip content */}
        <Tooltip.Arrow className="fill-card" />
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
</Tooltip.Provider>
```

---

## Icon System

Using [Lucide React](https://lucide.dev/) for consistent iconography:

```tsx
import { ArrowUpIcon, WalletIcon } from "lucide-react"

<ArrowUpIcon className="h-4 w-4 text-green-700 dark:text-green-400" />
```

Standard sizes:
- `h-3 w-3` - Inline with small text
- `h-4 w-4` - Standard UI elements
- `h-5 w-5` - Section headers
- `h-6 w-6` - Large/empty states

---

## Animation

Using Tailwind's animation utilities and custom keyframes:

```tsx
// Dropdown/tooltip entrance
className="animate-in fade-in-0 zoom-in-95"

// Hover transitions
className="transition-colors hover:bg-accent"
className="transition-all hover:shadow-md"
```

---

## Responsive Design

Mobile-first approach with Tailwind breakpoints:

```tsx
// Stack on mobile, grid on desktop
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

// Responsive padding
<div className="px-4 py-6 md:px-6 md:py-8">
```

---

## File Structure

```
src/
├── components/
│   ├── Dashboard.tsx          # Main dashboard view
│   ├── TransactionsPage.tsx   # All transactions view
│   ├── InconsistenciesPage.tsx # Balance inconsistencies view
│   ├── AccountsSection.tsx    # Bank accounts management
│   ├── DataSources.tsx        # Source file management
│   ├── TransactionTooltip.tsx # Transaction detail tooltip
│   └── WaffleChart.tsx        # Category breakdown chart
├── lib/
│   ├── api.ts                 # API client
│   ├── inconsistency-cache.tsx # Inconsistency count cache (for header badge)
│   ├── theme.ts               # Theme context (light/dark)
│   └── utils.ts               # Utility functions
├── index.css                  # Global styles & CSS variables
├── App.tsx                    # Router setup
└── main.tsx                   # Entry point
```
