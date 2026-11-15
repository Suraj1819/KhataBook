import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatDate } from "@/lib/utils"
import { downloadKhataPDF } from "@/lib/khataPdf"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileDown,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react"

import { toast } from "sonner"

/* ==================================================
   CONSTANTS
================================================== */

const PAGE_STEP = 12
const FETCH_BATCH = 1000 // Supabase returns max 1000 rows per request

const PRESETS = [
  { mode: "today", label: "Today" },
  { mode: "yesterday", label: "Yesterday" },
  { mode: "week", label: "Last 7 days" },
  { mode: "month", label: "This month" },
]

const ENTRY_TYPES = [
  { value: "you_gave", label: "You gave (credit)", hint: "You gave goods or money. Customer owes you more.", debit: true },
  { value: "customer_paid", label: "Customer paid", hint: "Customer paid you back. Balance goes down.", debit: false },
  { value: "new_due", label: "New due", hint: "Adds a new amount the customer owes you.", debit: true },
  { value: "advance_received", label: "Advance received", hint: "Customer paid in advance. Balance goes down.", debit: false },
  { value: "advance_returned", label: "Advance returned", hint: "You gave an advance back. Balance goes up.", debit: true },
]

const DEBIT_TYPES = ENTRY_TYPES.filter((type) => type.debit).map((type) => type.value)

const FILTERS = [
  { key: "all", label: "All" },
  { key: "due", label: "With due" },
  { key: "overdue", label: "Overdue" },
  { key: "advance", label: "Advance" },
  { key: "settled", label: "Settled" },
]

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
]

const fieldClass =
  "h-11 rounded-xl border-violet-100 bg-white text-sm shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:border-emerald-500"

const outlineBtn =
  "rounded-xl border-violet-200 bg-white text-slate-700 shadow-sm hover:bg-violet-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"

/* ==================================================
   HELPERS
================================================== */

const num = (value) => Number(value) || 0
const round2 = (value) => Math.round((num(value) + Number.EPSILON) * 100) / 100

const isDebit = (type) => DEBIT_TYPES.includes(type)
const signedAmount = (type, amount) => (isDebit(type) ? num(amount) : -num(amount))

const getEntryLabel = (type) => ENTRY_TYPES.find((entry) => entry.value === type)?.label || type

function getToday() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function getRange(period, today) {
  switch (period.mode) {
    case "today":
      return { from: today, to: today }
    case "yesterday": {
      const y = shiftDate(today, -1)
      return { from: y, to: y }
    }
    case "week":
      return { from: shiftDate(today, -6), to: today }
    case "month":
      return { from: `${today.slice(0, 8)}01`, to: today }
    case "custom":
      return { from: period.from || null, to: period.to || null }
    default:
      return { from: null, to: null }
  }
}

function getPeriodLabel(period, range, today) {
  switch (period.mode) {
    case "overall":
      return "All time"
    case "today":
      return `Today, ${formatDate(today)}`
    case "yesterday":
      return "Yesterday"
    case "week":
      return "Last 7 days"
    case "month":
      return "This month"
    default:
      if (range.from && range.to) {
        return range.from === range.to
          ? formatDate(range.from)
          : `${formatDate(range.from)} – ${formatDate(range.to)}`
      }
      if (range.from) return `From ${formatDate(range.from)}`
      if (range.to) return `Up to ${formatDate(range.to)}`
      return "All time"
  }
}

const inRange = (date, range) => {
  if (!date) return !range.from && !range.to
  return (!range.from || date >= range.from) && (!range.to || date <= range.to)
}

// "+91 98765 43210" -> "9876543210" (last 10 digits)
function normalizeMobile(value) {
  const digits = String(value || "").replace(/\D/g, "")
  return digits.length > 10 ? digits.slice(-10) : digits
}

function getInitials(name) {
  return (
    String(name || "?")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?"
  )
}

function avatarColor(name) {
  let hash = 0
  for (const char of String(name)) hash = (hash * 31 + char.charCodeAt(0)) % 997
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

const escapeLike = (value) => value.replace(/[\\%_]/g, "\\$&")

/** Pages through ALL rows so totals stay correct beyond Supabase's 1000-row cap. */
async function fetchAllRows(buildQuery) {
  const rows = []
  let from = 0

  while (true) {
    const { data, error } = await buildQuery().range(from, from + FETCH_BATCH - 1)
    if (error) throw error

    const batch = data || []
    rows.push(...batch)

    if (batch.length < FETCH_BATCH) break
    from += FETCH_BATCH
  }

  return rows
}

const newer = (a, b) => {
  const byDate = String(b.entry_date).localeCompare(String(a.entry_date))
  if (byDate !== 0) return byDate
  return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
}

const initialForm = () => ({
  customer_name: "",
  mobile: "",
  address: "",
  entry_type: "you_gave",
  amount: "",
  due_date: "",
  notes: "",
  entry_date: getToday(),
  customer_photo: null,
  photo_preview: "",
})

/* ==================================================
   SMALL UI PIECES
================================================== */

function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 dark:bg-slate-800/70 ${className}`} />
}

function PageSkeleton() {
  return (
    <div className="min-h-full w-full space-y-4 rounded-2xl bg-[#f7f5ff] px-3 py-5 sm:px-5 lg:px-6 dark:bg-slate-950" aria-busy="true">
      <Skeleton className="h-16 w-72" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-[20px]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[230px] rounded-[20px]" />
        ))}
      </div>
    </div>
  )
}

const SUMMARY_TONES = {
  green: { icon: "bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", accent: "text-emerald-700 dark:text-emerald-400" },
  blue: { icon: "bg-blue-100/80 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", accent: "text-blue-700 dark:text-blue-400" },
  pink: { icon: "bg-pink-100/80 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400", accent: "text-pink-700 dark:text-pink-400" },
  purple: { icon: "bg-violet-100/80 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400", accent: "text-violet-700 dark:text-violet-400" },
}

function SummaryCard({ label, value, detail, icon: Icon, tone = "green" }) {
  const style = SUMMARY_TONES[tone]
  return (
    <Card className="overflow-hidden rounded-[20px] border border-white/80 bg-white/80 shadow-[0_4px_15px_rgba(80,65,130,0.07)] backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/80">
      <CardContent className="flex min-w-0 items-center gap-4 p-4 sm:p-5">
        <div className={`flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full ${style.icon}`}>
          <Icon className="h-7 w-7" strokeWidth={1.9} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-slate-600 dark:text-slate-400">{label}</p>
          <h3 className="mt-1.5 break-words text-[23px] font-bold leading-tight tracking-tight text-[#151934] tabular-nums dark:text-slate-100">
            {value}
          </h3>
          <p className={`mt-1.5 text-xs font-semibold ${style.accent}`}>{detail}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function BalanceBox({ balance }) {
  const tone =
    balance > 0
      ? { label: "You'll get", box: "border-rose-100 bg-rose-50/70 dark:border-rose-900/30 dark:bg-rose-900/20", text: "text-rose-600 dark:text-rose-400" }
      : balance < 0
        ? { label: "Advance", box: "border-emerald-100 bg-emerald-50/70 dark:border-emerald-900/30 dark:bg-emerald-900/20", text: "text-emerald-700 dark:text-emerald-400" }
        : { label: "Settled", box: "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50", text: "text-slate-600 dark:text-slate-300" }

  return (
    <div className={`shrink-0 rounded-xl border px-3 py-2 text-right ${tone.box}`}>
      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{tone.label}</p>
      <p className={`text-lg font-extrabold tabular-nums tracking-tight ${tone.text}`}>
        {formatCurrency(Math.abs(balance))}
      </p>
    </div>
  )
}

function CustomerCard({ customer, shopName, today }) {
  const { balance } = customer
  const recentEntries = customer.entries.slice(0, 2)
  const digits = normalizeMobile(customer.mobile)
  const hasMobile = digits.length === 10
  const ledgerPath = `/khata/${encodeURIComponent(customer.mobile || customer.name)}`

  const amountText = formatCurrency(Math.abs(balance))
  const message =
    balance > 0
      ? `Namaste ${customer.name}, ${shopName} me aapka ${amountText} baaki hai. Kripya jald bhugtan karein. Dhanyavaad.`
      : balance < 0
        ? `Namaste ${customer.name}, ${shopName} me aapka ${amountText} advance jama hai.`
        : `Namaste ${customer.name}, ${shopName} me aapka hisaab barabar hai. Dhanyavaad.`

  const whatsappHref = hasMobile
    ? `https://wa.me/91${digits}?text=${encodeURIComponent(message)}`
    : null

  const actionClass =
    "flex flex-1 items-center justify-center gap-2 py-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"

  return (
    <Card className="group overflow-hidden rounded-[20px] border border-white/80 bg-white/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)] transition-shadow hover:shadow-[0_8px_24px_rgba(80,65,130,0.12)] dark:border-slate-800 dark:bg-slate-900/85">
      <div className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <Link to={ledgerPath} className="flex min-w-0 items-center gap-3.5">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-bold sm:h-14 sm:w-14 ${
              customer.photo ? "bg-slate-100 dark:bg-slate-800" : avatarColor(customer.name)
            }`}
          >
            {customer.photo ? (
              <img src={customer.photo} alt={`${customer.name} photo`} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              getInitials(customer.name)
            )}
          </div>

          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-slate-900 transition-colors group-hover:text-emerald-700 dark:text-slate-100 dark:group-hover:text-emerald-400">
              {customer.name}
            </h3>

            <div className="mt-1 flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
              {customer.mobile ? (
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3 w-3" aria-hidden="true" />
                  {customer.mobile}
                </span>
              ) : (
                <span className="text-slate-400 dark:text-slate-500">No mobile saved</span>
              )}

              {customer.address && (
                <span className="flex max-w-[170px] items-center gap-1.5 truncate">
                  <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{customer.address}</span>
                </span>
              )}
            </div>
          </div>
        </Link>

        <BalanceBox balance={balance} />
      </div>

      {balance > 0 && customer.dueDate && (
        <div className="px-4 pb-3 sm:px-5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
              customer.overdue
                ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/30 dark:text-rose-400"
                : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/30 dark:text-amber-400"
            }`}
          >
            <Clock3 className="h-3 w-3" aria-hidden="true" />
            {customer.overdue ? "Overdue since" : "Due on"} {formatDate(customer.dueDate)}
          </span>
        </div>
      )}

      {recentEntries.length > 0 && (
        <div className="px-4 pb-4 sm:px-5">
          <div className="rounded-xl border border-[#eeecf5] bg-[#faf9ff] p-3 dark:border-slate-800 dark:bg-slate-950/50">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Recent entries</span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">{customer.entries.length} total</span>
            </div>

            <ul className="space-y-2">
              {recentEntries.map((entry) => {
                const debit = isDebit(entry.entry_type)
                return (
                  <li key={entry.id} className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                          debit ? "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        }`}
                      >
                        {debit ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownLeft className="h-3.5 w-3.5" />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {getEntryLabel(entry.entry_type)}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">{formatDate(entry.entry_date)}</p>
                      </div>
                    </div>

                    <span className={`shrink-0 text-xs font-bold tabular-nums ${debit ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                      {debit ? "+" : "−"}
                      {formatCurrency(entry.amount)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}

      <div className="flex border-t border-[#eeecf5] dark:border-slate-800">
        <Link to={ledgerPath} className={`${actionClass} text-slate-600 hover:bg-[#faf9ff] hover:text-emerald-700 dark:text-slate-300 dark:hover:bg-slate-800/50 dark:hover:text-emerald-400`}>
          <BookOpen className="h-4 w-4" /> Ledger
        </Link>

        <span className="w-px bg-[#eeecf5] dark:bg-slate-800" aria-hidden="true" />

        {hasMobile ? (
          <a href={`tel:+91${digits}`} className={`${actionClass} text-slate-600 hover:bg-[#faf9ff] hover:text-emerald-700 dark:text-slate-300 dark:hover:bg-slate-800/50 dark:hover:text-emerald-400`}>
            <Phone className="h-4 w-4" /> Call
          </a>
        ) : (
          <span aria-disabled="true" className={`${actionClass} cursor-not-allowed text-slate-300 dark:text-slate-600`}>
            <Phone className="h-4 w-4" /> Call
          </span>
        )}

        <span className="w-px bg-[#eeecf5] dark:bg-slate-800" aria-hidden="true" />

        {whatsappHref ? (
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" aria-label={`Send WhatsApp reminder to ${customer.name}`} className={`${actionClass} text-slate-600 hover:bg-[#25D366]/10 hover:text-[#128C7E] dark:text-slate-300 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-400`}>
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </a>
        ) : (
          <span aria-disabled="true" className={`${actionClass} cursor-not-allowed text-slate-300 dark:text-slate-600`}>
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </span>
        )}
      </div>
    </Card>
  )
}

/* ==================================================
   PERIOD MENU (Calendar)
================================================== */

function PeriodMenu({ period, onChange, range, label, today }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false)
    }

    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  const choose = (mode) => {
    onChange({ mode, from: "", to: "" })
    setOpen(false)
  }

  const changeCustom = (key, value) => {
    const next = { from: range.from || "", to: range.to || "", [key]: value }
    if (next.from && next.to && next.from > next.to) {
      if (key === "from") next.to = next.from
      else next.from = next.to
    }
    onChange({ mode: "custom", ...next })
  }

  return (
    <div ref={ref} className="relative w-full sm:w-auto">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex h-11 w-full max-w-full items-center gap-2 px-4 text-sm font-medium sm:w-auto sm:max-w-[270px] ${outlineBtn}`}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-400" aria-hidden="true" />
        <span className="truncate">{label}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/30 sm:hidden" onClick={() => setOpen(false)} aria-hidden="true" />

          <div
            role="menu"
            aria-label="Choose period"
            className="fixed inset-x-3 bottom-3 z-50 max-h-[85vh] overflow-y-auto rounded-2xl border border-violet-100 bg-white p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_12px_32px_rgba(80,65,130,0.25)] dark:border-slate-800 dark:bg-slate-900 sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-[calc(100%+8px)] sm:z-30 sm:max-h-none sm:w-[290px] sm:overflow-visible sm:pb-2"
          >
            {[...PRESETS, { mode: "overall", label: "All time" }].map((option) => {
              const active = period.mode === option.mode
              return (
                <button
                  key={option.mode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => choose(option.mode)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                    active
                      ? "bg-emerald-50 font-semibold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : "text-slate-700 hover:bg-violet-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {option.label}
                  {active && <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                </button>
              )
            })}

            <div className="mt-2 border-t border-[#eeecf5] px-1 pb-1 pt-3 dark:border-slate-800">
              <p className={`mb-2 px-2 text-xs font-semibold ${period.mode === "custom" ? "text-emerald-800 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}`}>
                Pick dates
              </p>

              <div className="grid grid-cols-2 gap-2 px-1">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">From</span>
                  <input
                    type="date"
                    value={range.from || ""}
                    max={range.to || today}
                    onChange={(e) => changeCustom("from", e.target.value)}
                    className="h-9 w-full rounded-lg border border-violet-200 bg-white px-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">To</span>
                  <input
                    type="date"
                    value={range.to || ""}
                    min={range.from || undefined}
                    max={today}
                    onChange={(e) => changeCustom("to", e.target.value)}
                    className="h-9 w-full rounded-lg border border-violet-200 bg-white px-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                </label>
              </div>

              <p className="mt-3 px-2 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                Customers are filtered by the date they were added. Dues and advances always show current totals.
              </p>

              <Button
                type="button"
                onClick={() => setOpen(false)}
                className={`mt-3 h-11 w-full gap-2 px-4 ${outlineBtn}`}
              >
                Done
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ==================================================
   KHATA PAGE
================================================== */

export default function Khata() {
  const { currentShop } = useShop()
  const shopId = currentShop?.id
  const today = getToday()

  const fileInputRef = useRef(null)
  const hasLoaded = useRef(false)
  const requestId = useRef(0)

  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState("")

  // Date period state
  const [period, setPeriod] = useState({ mode: "overall", from: "", to: "" })
  const range = useMemo(() => getRange(period, today), [period, today])
  const periodLabel = getPeriodLabel(period, range, today)

  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("all")
  const [sortBy, setSortBy] = useState("name")
  const [visibleCount, setVisibleCount] = useState(PAGE_STEP)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    hasLoaded.current = false
    setEntries([])
    setLoadError("")
  }, [shopId])

  const loadEntries = useCallback(
    async (forceRefresh = false) => {
      const id = ++requestId.current

      if (!shopId) {
        setEntries([])
        setLoading(false)
        return
      }

      if (forceRefresh || hasLoaded.current) setRefreshing(true)
      else setLoading(true)

      setLoadError("")

      try {
        const rows = await fetchAllRows(() =>
          supabase
            .from("khata_entries")
            .select("*")
            .eq("shop_id", shopId)
            .order("entry_date", { ascending: false })
            .order("created_at", { ascending: false })
            .order("id")
        )

        if (id !== requestId.current) return

        setEntries(rows)
        hasLoaded.current = true
      } catch (error) {
        if (id !== requestId.current) return
        console.error("Khata load error:", error)
        const message = error?.message || "Unable to load khata."
        setLoadError(message)
        toast.error("Could not load khata", { description: message })
      } finally {
        if (id === requestId.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [shopId]
  )

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  const customers = useMemo(() => {
    const grouped = new Map()

    entries.forEach((entry) => {
      const name = (entry.customer_name || "").trim()
      const mobile = (entry.mobile || "").trim()
      const key = `${name.toLowerCase()}_${normalizeMobile(mobile)}`

      if (!grouped.has(key)) {
        grouped.set(key, { key, name, mobile: "", address: "", photo: "", entries: [] })
      }

      grouped.get(key).entries.push(entry)
    })

    return Array.from(grouped.values()).map((customer) => {
      const sorted = [...customer.entries].sort(newer)

      const balance = round2(
        sorted.reduce((total, entry) => total + signedAmount(entry.entry_type, entry.amount), 0)
      )

      const dueEntry = sorted.find((entry) => entry.due_date && isDebit(entry.entry_type))
      const dueDate = dueEntry?.due_date || ""

      return {
        ...customer,
        mobile: sorted.find((e) => (e.mobile || "").trim())?.mobile?.trim() || "",
        address: sorted.find((e) => e.address)?.address || "",
        photo: sorted.find((e) => e.customer_photo)?.customer_photo || "",
        entries: sorted,
        balance,
        dueDate,
        overdue: balance > 0 && Boolean(dueDate) && dueDate < today,
        latest: sorted[0]?.entry_date || "",
      }
    })
  }, [entries, today])

  const summary = useMemo(() => {
    const result = { customers: customers.length, due: 0, dueCount: 0, advance: 0, advanceCount: 0, overdue: 0, overdueCount: 0, settledCount: 0 }

    customers.forEach((customer) => {
      if (customer.balance > 0) {
        result.due += customer.balance
        result.dueCount += 1
      } else if (customer.balance < 0) {
        result.advance += -customer.balance
        result.advanceCount += 1
      } else {
        result.settledCount += 1
      }

      if (customer.overdue) {
        result.overdue += customer.balance
        result.overdueCount += 1
      }
    })

    return result
  }, [customers])

  const chipCounts = { all: summary.customers, due: summary.dueCount, overdue: summary.overdueCount, advance: summary.advanceCount, settled: summary.settledCount }

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase()
    const queryDigits = query.replace(/\D/g, "")

    const list = customers.filter((customer) => {
      // Match with Calendar Range
      const addedDate = customer.latest || null
      const matchesPeriod = !addedDate ? !range.from && !range.to : inRange(addedDate, range)

      const matchesSearch =
        !query ||
        customer.name.toLowerCase().includes(query) ||
        customer.address.toLowerCase().includes(query) ||
        (queryDigits && normalizeMobile(customer.mobile).includes(queryDigits))

      let matchesFilter = true
      if (filter === "due") matchesFilter = customer.balance > 0
      else if (filter === "overdue") matchesFilter = customer.overdue
      else if (filter === "advance") matchesFilter = customer.balance < 0
      else if (filter === "settled") matchesFilter = customer.balance === 0

      return matchesPeriod && matchesSearch && matchesFilter
    })

    if (sortBy === "due") list.sort((a, b) => b.balance - a.balance)
    else if (sortBy === "recent") list.sort((a, b) => b.latest.localeCompare(a.latest))
    else list.sort((a, b) => a.name.localeCompare(b.name))

    return list
  }, [customers, search, filter, sortBy, range])

  useEffect(() => {
    setVisibleCount(PAGE_STEP)
  }, [search, filter, sortBy, shopId, range.from, range.to])

  const visibleCustomers = filteredCustomers.slice(0, visibleCount)
  const remaining = filteredCustomers.length - visibleCustomers.length
  const hasActiveFilters = Boolean(search.trim()) || filter !== "all" || period.mode !== "overall"

  const updateForm = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  function openDialog() {
    setForm(initialForm())
    setDialogOpen(true)
  }

  function handleNameChange(value) {
    setForm((prev) => {
      const next = { ...prev, customer_name: value }
      const matches = customers.filter(
        (customer) => customer.name.toLowerCase() === value.trim().toLowerCase()
      )

      if (matches.length === 1) {
        if (!prev.mobile) next.mobile = matches[0].mobile
        if (!prev.address) next.address = matches[0].address
        if (!prev.photo_preview && matches[0].photo) {
          next.photo_preview = matches[0].photo
          next.customer_photo = null
        }
      }
      return next
    })
  }

  function handlePhotoChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file")
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Photo must be smaller than 2 MB")
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setForm((prev) => ({ ...prev, customer_photo: file, photo_preview: reader.result }))
      }
    }
    reader.readAsDataURL(file)
  }

  const selectedType = ENTRY_TYPES.find((type) => type.value === form.entry_type)

  const balancePreview = useMemo(() => {
    const amount = round2(form.amount)
    const name = form.customer_name.trim().toLowerCase()
    if (!name || amount <= 0) return null

    const existing = customers.find(
      (customer) =>
        customer.name.toLowerCase() === name &&
        normalizeMobile(customer.mobile) === normalizeMobile(form.mobile)
    )

    const before = existing?.balance || 0
    return {
      before,
      after: round2(before + signedAmount(form.entry_type, amount)),
      isNew: !existing,
    }
  }, [form.amount, form.customer_name, form.mobile, form.entry_type, customers])

  async function handleSave(event) {
    event.preventDefault()
    if (saving) return

    const customerName = form.customer_name.trim().replace(/\s+/g, " ")
    const amount = round2(form.amount)
    const mobileDigits = normalizeMobile(form.mobile)

    if (!customerName) return toast.error("Please enter the customer name")
    if (!(amount > 0)) return toast.error("Please enter a valid amount")
    if (form.mobile.trim() && mobileDigits.length !== 10) return toast.error("Mobile number must be 10 digits")
    if (form.entry_date > today) return toast.error("Entry date cannot be in the future")
    if (form.due_date && form.due_date < form.entry_date) return toast.error("Due date cannot be before the entry date")

    setSaving(true)
    let uploadedPath = null

    try {
      const fresh = await fetchAllRows(() =>
        supabase
          .from("khata_entries")
          .select("id, customer_name, mobile, address, customer_photo, entry_type, amount")
          .eq("shop_id", shopId)
          .ilike("customer_name", `%${escapeLike(customerName)}%`)
          .order("id")
      )

      const matches = fresh.filter(
        (row) =>
          (row.customer_name || "").trim().toLowerCase() === customerName.toLowerCase() &&
          normalizeMobile(row.mobile) === mobileDigits
      )

      const currentBalance = round2(
        matches.reduce((total, row) => total + signedAmount(row.entry_type, row.amount), 0)
      )
      const newBalance = round2(currentBalance + signedAmount(form.entry_type, amount))

      let photoUrl = null
      if (form.customer_photo) {
        const ext = (form.customer_photo.name.split(".").pop() || "jpg").toLowerCase()
        uploadedPath = `khata/${shopId}/${Date.now()}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(uploadedPath, form.customer_photo, { upsert: true })

        if (uploadError) {
          uploadedPath = null
          throw new Error(`Photo upload failed: ${uploadError.message}`)
        }

        photoUrl = supabase.storage.from("avatars").getPublicUrl(uploadedPath).data.publicUrl
      }

      const profileMobile = form.mobile.trim() || matches.find((row) => row.mobile)?.mobile || null
      const profileAddress = form.address.trim() || matches.find((row) => row.address)?.address || null
      const profilePhoto = photoUrl || matches.find((row) => row.customer_photo)?.customer_photo || null

      // Keep the profile consistent on every historical entry for this
      // independent Khata person. This does not touch Customers or Bills.
      if (matches.length) {
        const ids = matches.map((row) => row.id)
        const { error: profileError } = await supabase
          .from("khata_entries")
          .update({
            customer_name: customerName,
            mobile: profileMobile,
            address: profileAddress,
            customer_photo: profilePhoto,
          })
          .eq("shop_id", shopId)
          .in("id", ids)
        if (profileError) throw profileError
      }

      const { error } = await supabase.from("khata_entries").insert({
        shop_id: shopId,
        customer_name: customerName,
        mobile: profileMobile,
        address: profileAddress,
        customer_photo: profilePhoto,
        entry_type: form.entry_type,
        amount,
        balance_after: newBalance,
        due_date: form.due_date || null,
        notes: form.notes.trim() || null,
        entry_date: form.entry_date,
      })

      if (error) throw error

      toast.success("Entry added", {
        description: `${customerName}'s balance is now ${formatCurrency(Math.abs(newBalance))}${
          newBalance > 0 ? " to receive" : newBalance < 0 ? " in advance" : " (settled)"
        }`,
      })

      setDialogOpen(false)
      setForm(initialForm())
      await loadEntries(true)
    } catch (error) {
      if (uploadedPath) {
        await supabase.storage.from("avatars").remove([uploadedPath]).catch(() => {})
      }
      toast.error("Could not save entry", { description: error?.message })
    } finally {
      setSaving(false)
    }
  }

  if (!currentShop) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-3xl border border-dashed border-violet-200 bg-white/80 p-8 text-center dark:border-slate-800 dark:bg-slate-900/80">
        <div className="max-w-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            <BookOpen className="h-7 w-7" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">No workspace selected</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Select a workspace to open its khata.</p>
          <Button asChild variant="outline" className={`mt-5 gap-2 px-4 ${outlineBtn}`}>
            <Link to="/settings">Open workspace settings</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (loading) return <PageSkeleton />

  return (
    <div className="min-h-full w-full space-y-4 rounded-2xl bg-[#f7f5ff] px-3 py-5 sm:px-5 lg:px-6 dark:bg-slate-950">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Link to="/" className="hover:text-slate-700 dark:hover:text-slate-300">Dashboard</Link>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            <span>Khata</span>
          </nav>

          <h1 className="mt-1 text-[29px] font-bold tracking-tight text-[#171a39] sm:text-[32px] dark:text-slate-100">
            Customer khata
          </h1>

          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            Keep track of credit given, payments received and advances. Showing <strong className="font-semibold text-slate-800 dark:text-slate-200">{periodLabel}</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Bills-style date period calendar */}
          <PeriodMenu period={period} onChange={setPeriod} range={range} label={periodLabel} today={today} />

          {/* Export the currently filtered customer khata */}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              try {
                const exportCustomers = filteredCustomers.map((customer) => ({
                  ...customer,
                  entries: Array.isArray(customer.entries) ? customer.entries : [],
                }))

                // Backfill customer details on older ledger rows so the PDF
                // never prints blank customer names/mobile numbers.
                const exportEntries = exportCustomers.flatMap((customer) =>
                  customer.entries.map((entry) => ({
                    ...entry,
                    customer_name: entry.customer_name || customer.name,
                    mobile: entry.mobile || customer.mobile,
                    address: entry.address || customer.address,
                  }))
                )

                if (!exportEntries.length) {
                  toast.error("No khata entries to export")
                  return
                }

                downloadKhataPDF({
                  customers: exportCustomers,
                  entries: exportEntries,
                  shop: currentShop || {},
                  periodLabel,
                })
                toast.success("Khata PDF downloaded")
              } catch (error) {
                console.error("Khata PDF export error:", error)
                toast.error("Could not export khata PDF", {
                  description: error?.message || "Please try again.",
                })
              }
            }}
            disabled={!filteredCustomers.length || refreshing}
            className={`h-11 gap-2 px-4 font-semibold ${outlineBtn}`}
          >
            <FileDown className="h-4 w-4" aria-hidden="true" />
            Export PDF
          </Button>

          {/* Bills-style refresh */}
          <Button
            type="button"
            variant="outline"
            onClick={() => loadEntries(true)}
            disabled={refreshing}
            aria-label="Refresh khata"
            title="Refresh khata"
            className="h-11 min-w-[112px] gap-2 rounded-xl border border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <RefreshCw className={`h-4 w-4 shrink-0 ${refreshing ? "animate-spin" : ""}`} />
            <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
          </Button>

          {/* New Entry button mapped to outline style */}
          <Button
            type="button"
            variant="outline"
            onClick={openDialog}
            className={`h-11 gap-2 px-5 font-semibold ${outlineBtn}`}
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            New entry
          </Button>
        </div>
      </header>

      {loadError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-900/50 dark:bg-rose-900/20">
          <div className="flex items-center gap-2 text-sm text-rose-700 dark:text-rose-400">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Could not load your khata. Check your connection and try again.
              <span className="ml-1 text-xs text-rose-500 dark:text-rose-500/80">({loadError})</span>
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => loadEntries(true)}
            className={`shrink-0 px-3 ${outlineBtn}`}
          >
            Try again
          </Button>
        </div>
      )}

      <section aria-label="Khata summary" className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <SummaryCard
          label="Customers"
          value={summary.customers.toLocaleString("en-IN")}
          detail={`${entries.length.toLocaleString("en-IN")} entries recorded`}
          icon={Users}
          tone="purple"
        />
        <SummaryCard
          label="You'll get"
          value={formatCurrency(summary.due)}
          detail={`${summary.dueCount} ${summary.dueCount === 1 ? "customer owes" : "customers owe"} you`}
          icon={Wallet}
          tone="pink"
        />
        <SummaryCard
          label="Advance held"
          value={formatCurrency(summary.advance)}
          detail={`${summary.advanceCount} ${summary.advanceCount === 1 ? "customer" : "customers"} paid in advance`}
          icon={TrendingUp}
          tone="green"
        />
        <SummaryCard
          label="Overdue"
          value={formatCurrency(summary.overdue)}
          detail={`${summary.overdueCount} ${summary.overdueCount === 1 ? "customer" : "customers"} past due date`}
          icon={Clock3}
          tone="blue"
        />
      </section>

      <Card className="overflow-hidden rounded-[20px] border border-white/80 bg-white/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)] backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/85">
        <div className="space-y-4 border-b border-[#eae7f4] px-4 py-4 sm:px-5 dark:border-slate-800">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                <BookOpen className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="text-[16px] font-bold tracking-tight text-[#171a36] dark:text-slate-100">All customers</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
                  {filteredCustomers.length === customers.length
                    ? `${customers.length.toLocaleString("en-IN")} customers`
                    : `${filteredCustomers.length.toLocaleString("en-IN")} of ${customers.length.toLocaleString("en-IN")} customers match`}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative w-full sm:w-[300px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, mobile or area"
                  aria-label="Search customers"
                  className={`${fieldClass} pl-9 pr-9`}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger aria-label="Sort customers" className={`${fieldClass} w-full sm:w-[185px]`}>
                  <SlidersHorizontal className="mr-2 h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent className="dark:border-slate-800 dark:bg-slate-900">
                  <SelectItem value="name" className="dark:text-slate-200 dark:focus:bg-slate-800">Name (A to Z)</SelectItem>
                  <SelectItem value="due" className="dark:text-slate-200 dark:focus:bg-slate-800">Highest due</SelectItem>
                  <SelectItem value="recent" className="dark:text-slate-200 dark:focus:bg-slate-800">Recent activity</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div role="group" aria-label="Filter customers" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {FILTERS.map((item) => {
              const active = filter === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(item.key)}
                  className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                    active
                      ? "border-violet-300 bg-violet-100 text-violet-800 shadow-sm dark:border-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                      : "border-violet-200 bg-white text-slate-700 hover:bg-violet-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  {item.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${active ? "bg-white text-violet-800 dark:bg-violet-800/50 dark:text-violet-200" : "bg-violet-50 text-slate-600 dark:bg-slate-900 dark:text-slate-400"}`}>
                    {chipCounts[item.key]}
                  </span>
                </button>
              )
            })}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch("")
                  setFilter("all")
                  setPeriod({ mode: "overall", from: "", to: "" })
                }}
                className="shrink-0 px-2 text-xs font-semibold text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {filteredCustomers.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center px-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
                <BookOpen className="h-7 w-7" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-sm font-bold text-slate-900 dark:text-slate-100">
                {customers.length === 0 ? "No khata entries yet" : "No matching customers"}
              </h3>
              <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500 dark:text-slate-400">
                {customers.length === 0
                  ? "Add your first entry to start keeping your customer khata."
                  : "Try a different search or filter."}
              </p>
              {customers.length === 0 ? (
                <Button type="button" variant="outline" onClick={openDialog} className={`mt-4 gap-2 px-4 font-semibold ${outlineBtn}`}>
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  New entry
                </Button>
              ) : (
                hasActiveFilters && (
                  <Button
                    type="button"
                    variant="outline"
                    className={`mt-4 gap-2 px-4 font-semibold ${outlineBtn}`}
                    onClick={() => {
                      setSearch("")
                      setFilter("all")
                      setPeriod({ mode: "overall", from: "", to: "" })
                    }}
                  >
                    Clear filters
                  </Button>
                )
              )}
            </div>
          ) : (
            <>
              <ul className={`grid grid-cols-1 gap-4 transition-opacity xl:grid-cols-2 ${refreshing ? "opacity-60" : "opacity-100"}`}>
                {visibleCustomers.map((customer) => (
                  <li key={customer.key}>
                    <CustomerCard customer={customer} shopName={currentShop.name || "hamari dukaan"} />
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex flex-col items-center gap-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400" aria-live="polite">
                  Showing {visibleCustomers.length} of {filteredCustomers.length.toLocaleString("en-IN")} customers
                </p>
                {remaining > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setVisibleCount((count) => count + PAGE_STEP)}
                    className={`h-10 px-5 font-semibold ${outlineBtn}`}
                  >
                    Show {Math.min(PAGE_STEP, remaining)} more
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => !saving && setDialogOpen(open)}>
        <DialogContent className="max-h-[94vh] gap-0 overflow-hidden rounded-[20px] border-0 p-0 shadow-[0_12px_32px_rgba(80,65,130,0.25)] sm:max-w-[640px] [&>button]:hidden dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <div className="border-b border-[#eae7f4] bg-gradient-to-br from-violet-50 via-[#f7f5ff] to-white px-5 pb-5 pt-6 sm:px-7 dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-700 text-white shadow-lg shadow-violet-700/25 dark:bg-violet-600">
                <Plus className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1 pr-6">
                <DialogTitle className="text-lg font-bold tracking-tight text-[#171a36] dark:text-slate-100">
                  New entry
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Add a customer and what happened.
                </DialogDescription>
              </div>
            </div>
          </div>

          <form onSubmit={handleSave} noValidate className="flex max-h-[calc(94vh-112px)] flex-col">
            <div className="flex-1 space-y-6 overflow-y-auto bg-white px-5 py-6 sm:px-7 dark:bg-slate-900">
              
              {/* Customer Profile Section */}
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-violet-100 bg-[#faf9ff] p-4 sm:flex-row dark:border-slate-800 dark:bg-slate-950/50">
                <div className="relative shrink-0">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-emerald-50 text-xl font-bold text-emerald-800 shadow-sm dark:border-slate-800 dark:bg-slate-800 dark:text-emerald-400">
                    {form.photo_preview ? (
                      <img src={form.photo_preview} alt="Preview" className="h-full w-full object-cover" />
                    ) : (
                      getInitials(form.customer_name) || <Camera className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                </div>

                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Customer Profile</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">JPG, PNG or WebP, up to 2 MB.</p>
                  
                  <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className={`h-9 gap-2 text-xs ${outlineBtn}`}
                    >
                      <Camera className="h-4 w-4" aria-hidden="true" />
                      {form.photo_preview ? "Change photo" : "Upload photo"}
                    </Button>

                    {form.photo_preview && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setForm((prev) => ({ ...prev, customer_photo: null, photo_preview: "" }))}
                        className="h-9 gap-2 rounded-xl border-rose-200 bg-white px-3 text-xs font-medium text-rose-600 shadow-sm hover:bg-rose-50 dark:border-rose-900/50 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-900/20"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        Remove photo
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="khata-name" className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                  Customer name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="khata-name"
                  list="khata-customers"
                  value={form.customer_name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Type or pick a customer"
                  autoComplete="off"
                  required
                  autoFocus
                  className={fieldClass}
                />
                <datalist id="khata-customers">
                  {customers.map((customer) => (
                    <option key={customer.key} value={customer.name} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="khata-mobile" className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Mobile number</Label>
                  <Input
                    id="khata-mobile"
                    type="tel"
                    inputMode="numeric"
                    value={form.mobile}
                    onChange={(e) => updateForm("mobile", e.target.value)}
                    placeholder="10-digit number"
                    maxLength={15}
                    className={fieldClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="khata-address" className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Address</Label>
                  <Input
                    id="khata-address"
                    value={form.address}
                    onChange={(e) => updateForm("address", e.target.value)}
                    placeholder="City, area"
                    className={fieldClass}
                  />
                </div>
              </div>

              <div className="h-px bg-[#eeecf5] dark:bg-slate-800" />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Entry type</Label>
                  <Select value={form.entry_type} onValueChange={(value) => updateForm("entry_type", value)}>
                    <SelectTrigger className={fieldClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="dark:border-slate-800 dark:bg-slate-900">
                      {ENTRY_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value} className="dark:text-slate-200 dark:focus:bg-slate-800">
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="khata-amount" className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                    Amount <span className="text-rose-500">*</span>
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400 dark:text-slate-500">₹</span>
                    <Input
                      id="khata-amount"
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="0.01"
                      required
                      value={form.amount}
                      onChange={(e) => updateForm("amount", e.target.value)}
                      placeholder="0.00"
                      className={`${fieldClass} pl-8 font-semibold`}
                    />
                  </div>
                </div>
              </div>

              {selectedType && (
                <p className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${selectedType.debit ? "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400" : "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400"}`}>
                  {selectedType.debit ? (
                    <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <ArrowDownLeft className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  )}
                  {selectedType.hint}
                </p>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="khata-date" className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Entry date</Label>
                  <Input
                    id="khata-date"
                    type="date"
                    required
                    max={today}
                    value={form.entry_date}
                    onChange={(e) => updateForm("entry_date", e.target.value)}
                    className={fieldClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="khata-due" className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                    Due date <span className="font-normal text-slate-400 dark:text-slate-500">(optional)</span>
                  </Label>
                  <Input
                    id="khata-due"
                    type="date"
                    min={form.entry_date}
                    value={form.due_date}
                    onChange={(e) => updateForm("due_date", e.target.value)}
                    className={fieldClass}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="khata-notes" className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                  Notes <span className="font-normal text-slate-400 dark:text-slate-500">(optional)</span>
                </Label>
                <Textarea
                  id="khata-notes"
                  rows={2}
                  placeholder="Item names, reference or any detail"
                  value={form.notes}
                  onChange={(e) => updateForm("notes", e.target.value)}
                  className="resize-none rounded-xl border-violet-100 bg-white text-sm shadow-none placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              {balancePreview && (
                <div className="rounded-xl border border-[#eeecf5] bg-[#faf9ff] px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50" aria-live="polite">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {balancePreview.isNew ? "New customer, balance after entry" : "Balance after this entry"}
                  </p>
                  <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
                    {!balancePreview.isNew && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Now {formatCurrency(Math.abs(balancePreview.before))}
                        {balancePreview.before > 0 ? " due" : balancePreview.before < 0 ? " advance" : ""}
                      </span>
                    )}
                    <span className={`text-lg font-extrabold tabular-nums ${balancePreview.after > 0 ? "text-rose-600 dark:text-rose-400" : balancePreview.after < 0 ? "text-emerald-700 dark:text-emerald-400" : "text-slate-600 dark:text-slate-300"}`}>
                      {formatCurrency(Math.abs(balancePreview.after))}
                      <span className="ml-1.5 text-xs font-semibold">
                        {balancePreview.after > 0 ? "you'll get" : balancePreview.after < 0 ? "advance" : "settled"}
                      </span>
                    </span>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="items-center border-t border-[#eae7f4] bg-[#faf9ff] px-5 py-4 sm:justify-end sm:px-7 dark:border-slate-800 dark:bg-slate-900/50">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
                className={`h-11 px-5 text-sm font-medium ${outlineBtn}`}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="outline"
                disabled={saving}
                className={`h-11 gap-2 px-6 text-sm font-semibold ${outlineBtn}`}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Save entry
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}