# Stories

## DEVELOPER NOTES (DONOT EDIT THIS SECTION WITH CLAUDE/CURSOR OR ANY LLM)

```
Stories is a new page in this web application.

In stories page, users would be able to group together transactions from both bank accounts and credit cards.

Groups can be assigned a name.

Its almost like an photo album, except for transactions.

```

## Main Section

### Data Model

**Story**
```
- id: unique identifier
- name: string (user-assigned name, e.g., "Trip to Goa", "Home Renovation")
- description: optional text
- created_at: timestamp
- updated_at: timestamp
```

**StoryTransaction** (join table)
```
- story_id: references Story
- transaction_type: "bank" | "credit_card"
- transaction_id: references either BankTransaction or CreditCardTransaction
- added_at: timestamp
```

### Page Layout

**Route**: `/stories`

**Main View** (Story List)
- Header with "Stories" title + "Create Story" button
- Grid of story cards (similar to dashboard cards)
- Each card shows: name, description preview, transaction count, date range, total amount
- Click card to open story detail view

**Story Detail View** (could be `/stories/:id` or modal)
- Story name (editable) + description
- "Add Transactions" button
- List of grouped transactions (mixed bank + credit card)
- Summary: total debits, total credits, net amount
- Option to remove transactions from story

**Add Transactions Modal**
- Search/filter interface (reuse existing transaction filter patterns)
- Tabs or toggle: Bank Transactions | Credit Card Transactions
- Checkbox selection for adding to story
- "Add Selected" button

### API Endpoints

```
GET    /stories                    - List all stories
POST   /stories                    - Create new story
GET    /stories/:id                - Get story with transactions
PUT    /stories/:id                - Update story name/description
DELETE /stories/:id                - Delete story

POST   /stories/:id/transactions   - Add transactions to story
DELETE /stories/:id/transactions   - Remove transactions from story
```

### Open Questions

1. Should transactions be allowed in multiple stories, or exclusive to one?
2. Should we show story tags/badges on regular transaction list views?
3. Any sorting/filtering needs for the story list itself?

---

## UI Wireframes

### 1. Stories List Page (`/stories`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [Logo]    Dashboard    Bank    Credit Cards    Stories       [Theme]   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Stories                                        [ + Create Story ]     │
│                                                                         │
│   ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────┐ │
│   │ 🏖  Trip to Goa     │  │ 🏠 Home Renovation  │  │ 🎂 Birthday     │ │
│   │                     │  │                     │  │    Party        │ │
│   │ 12 transactions     │  │ 8 transactions      │  │                 │ │
│   │ Dec 15 - Dec 22     │  │ Jan 5 - Jan 18      │  │ 3 transactions  │ │
│   │                     │  │                     │  │ Jan 20          │ │
│   │ Total: ₹45,230      │  │ Total: ₹1,24,500    │  │                 │ │
│   │                     │  │                     │  │ Total: ₹8,450   │ │
│   └─────────────────────┘  └─────────────────────┘  └─────────────────┘ │
│                                                                         │
│   ┌─────────────────────┐  ┌─────────────────────┐                      │
│   │ 🚗 Car Service      │  │ + New Story         │                      │
│   │                     │  │                     │                      │
│   │ 5 transactions      │  │   Click to create   │                      │
│   │ Jan 10 - Jan 12     │  │                     │                      │
│   │                     │  │                     │                      │
│   │ Total: ₹15,800      │  │                     │                      │
│   └─────────────────────┘  └─────────────────────┘                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2. Story Detail View (`/stories/:id`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [Logo]    Dashboard    Bank    Credit Cards    Stories       [Theme]   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ← Back to Stories                                                     │
│                                                                         │
│   🏖  Trip to Goa                                    [ Edit ] [ Delete ]│
│   ─────────────────────────────────────────────────────────────────     │
│   Family vacation, Dec 2024                                             │
│                                                                         │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│   │ 12           │  │ ₹45,230      │  │ Dec 15 - 22  │                  │
│   │ transactions │  │ total spent  │  │ 8 days       │                  │
│   └──────────────┘  └──────────────┘  └──────────────┘                  │
│                                                                         │
│   Transactions                                  [ + Add Transactions ]  │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │ Source │ Date       │ Description              │ Amount │   ⋮   │   │
│   ├────────┼────────────┼──────────────────────────┼────────┼───────┤   │
│   │ 🏦 HDFC│ Dec 15     │ MakeMyTrip Flight        │ 12,400 │ [ ✕ ] │   │
│   │ 💳 ICICI│ Dec 15    │ Taj Hotel Booking        │ 18,500 │ [ ✕ ] │   │
│   │ 💳 ICICI│ Dec 16    │ Fisherman's Wharf        │  2,340 │ [ ✕ ] │   │
│   │ 🏦 HDFC│ Dec 17     │ Uber Goa                 │    450 │ [ ✕ ] │   │
│   │ 💳 ICICI│ Dec 18    │ Calangute Beach Shack    │  1,200 │ [ ✕ ] │   │
│   │ ...    │ ...        │ ...                      │    ... │       │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│   🏦 = Bank Transaction    💳 = Credit Card    [ ✕ ] = Remove from story│
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3. Transaction Selection Flow (on Bank/Credit Card pages)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [Logo]    Dashboard    Bank    Credit Cards    Stories       [Theme]   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Bank Transactions                                                     │
│                                                                         │
│   [Search...] [Category ▾] [Account ▾] [Date Range ▾]                   │
│                                                                         │
│   ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   │
│   │  3 selected                            [ Add to Story ▾ ]      │   │
│   └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   │
│        ↑ Action bar appears when items selected                         │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │ [ ] │ Date       │ Description              │ Category │ Amount │   │
│   ├─────┼────────────┼──────────────────────────┼──────────┼────────┤   │
│   │ [✓] │ Dec 15     │ MakeMyTrip Flight        │ Travel   │ 12,400 │   │
│   │ [ ] │ Dec 15     │ Swiggy                   │ Food     │    340 │   │
│   │ [✓] │ Dec 17     │ Uber Goa                 │ Transport│    450 │   │
│   │ [✓] │ Dec 18     │ ATM Withdrawal Goa       │ Cash     │  5,000 │   │
│   │ [ ] │ Dec 19     │ Netflix                  │ Entertain│    649 │   │
│   │ [ ] │ Dec 20     │ Amazon                   │ Shopping │  2,100 │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│   Already in a story:  [Trip to Goa]  ← clickable badge                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

"Add to Story" Dropdown:
┌─────────────────────────┐
│ 🏖  Trip to Goa         │
│ 🏠 Home Renovation      │
│ 🎂 Birthday Party       │
│ ───────────────────     │
│ + Create New Story...   │
└─────────────────────────┘
```

### 4. Create/Edit Story Modal

```
┌───────────────────────────────────────────┐
│                                     [ ✕ ] │
│   Create New Story                        │
│   ─────────────────────────────────────   │
│                                           │
│   Name                                    │
│   ┌─────────────────────────────────────┐ │
│   │ Trip to Goa                         │ │
│   └─────────────────────────────────────┘ │
│                                           │
│   Description (optional)                  │
│   ┌─────────────────────────────────────┐ │
│   │ Family vacation, Dec 2024           │ │
│   │                                     │ │
│   └─────────────────────────────────────┘ │
│                                           │
│   Icon                                    │
│   [🏖 ] [🏠] [🎂] [🚗] [✈️ ] [🎁] [💼] [📦]  │
│                                           │
│              [ Cancel ]  [ Create ]       │
│                                           │
└───────────────────────────────────────────┘
```

---

## Discussion

### Categories vs Stories

**Categories** = automatic, single-dimension (one per transaction, e.g., "Food", "Travel")
**Stories** = intentional, curated collections spanning multiple categories

Example: "Trip to Goa" story contains:
- Flight booking (Travel)
- Hotel payment (Travel)
- Restaurant bills (Food)
- Souvenir shopping (Shopping)
- Uber rides (Transport)

Categories answer "what type?" — Stories answer "what for?" or "what occasion?"

### Adding Transactions to Stories - UX Flow

**Primary flow: From Transactions List**
1. User browses transactions (bank or credit card page)
2. Selects multiple transactions via checkboxes
3. Clicks "Add to Story" action button
4. Modal: Choose existing story OR create new story
5. Done - transactions added

This mirrors photo albums - you browse, then group.

**Secondary flow: From Story Detail**
- "Add more transactions" button
- Opens filtered transaction browser
- For when you realize you missed some

### UI Changes Needed

**Transactions pages** (both bank & credit card):
- Add checkbox column for multi-select
- Add "Add to Story" action (appears when items selected)
- Show story badge/indicator on transactions already in a story?

**Questions to resolve**:
- Bulk selection UX: individual checkboxes? "Select all on page"?
- Should the story indicator on transactions be clickable (quick navigate to story)?

---
