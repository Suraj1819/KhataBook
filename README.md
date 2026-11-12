# Digital Khata & Billing

A professional, simple, multi-shop Digital Khata and Billing web application for Indian shopkeepers.

## Features

- **Multi-Shop Management** — Manage multiple shops from one account with complete data isolation
- **Customer Management** — Full customer profiles with search, history, and balances
- **Item-wise Billing** — Automatic GST calculation (CGST/SGST/IGST), discounts, tax-inclusive/exclusive
- **Payments & Advances** — Track partial payments, advances, and allocations without double-counting
- **Personal Khata** — Simple notebook-style credit/debit entries independent of formal bills
- **Due Tracking** — Overdue, due today, upcoming filters with direct payment recording
- **Bill PDF** — Professional printable Indian business invoices
- **Offline Bills** — Schema support for attaching offline receipts (UI can be extended)

## Tech Stack

- React + Vite (JavaScript/JSX)
- Tailwind CSS v4
- Supabase (Auth, PostgreSQL, Storage)
- TanStack Query, React Hook Form, Zod, Sonner
- jsPDF for bill generation
- Lucide React icons

## Setup

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free project
2. Open **SQL Editor** and run the entire contents of `supabase/schema.sql`
3. (Optional) Create a storage bucket named `bill-attachments` (private) for offline bill uploads

### 2. Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Find these in Supabase → Project Settings → API.

### 3. Install & Run

```bash
npm install
npm run dev
```

Open http://localhost:5173

### 4. First Use

1. Register an account
2. Create your first shop (Shop Settings)
3. Add customers
4. Create bills

## Project Structure

```
src/
  components/
    layout/       # Sidebar, Header, AppLayout
    ui/           # Button, Input, Card, Dialog, etc.
  contexts/       # AuthContext, ShopContext
  lib/            # supabase client, utils, pdf
  pages/          # All route pages
  App.jsx         # Routes
  main.jsx
  index.css
supabase/
  schema.sql      # Full database schema + RLS policies
```

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard — stats, recent bills, pending dues |
| `/customers` | Customer list + add/edit |
| `/bills/new` | Create item-wise bill with GST |
| `/bills` | All bills |
| `/bills/:id` | Bill detail, record payment, download PDF |
| `/khata` | Personal Khata notebook |
| `/dues` | Outstanding dues with filters |
| `/payments` | Payment history + record advance |
| `/settings` | Multi-shop management |
| `/profile` | Account settings |

## Financial Rules

- All amounts use `NUMERIC(14,2)`
- Advances and bill payments are recorded separately
- Advance allocations reduce `remaining_amount` on advances
- Outstanding = sum of `amount_due` on bills
- Payment status: `paid` | `partial` | `unpaid`

## Security

- Row Level Security on all tables
- Users can only access shops they own
- `user_owns_shop()` helper used in policies
- Never trust client-provided shop_id without ownership check

## License

MIT — Built for Indian shopkeepers.
