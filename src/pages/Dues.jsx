import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatDate, PAYMENT_MODES } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  Eye,
  IndianRupee,
  Layers,
  Loader2,
  MessageCircle,
  Phone,
  Receipt,
  RefreshCw,
  Search,
  Store,
  Users,
  Wallet,
  X,
} from "lucide-react"

import { toast } from "sonner"

/* ==================================================
   CONSTANTS & HELPERS
================================================== */

const PAGE_SIZES = [5, 10, 20, 50]
const DEFAULT_PAGE_SIZE = 10
const FETCH_BATCH = 1000 // Supabase returns max 1000 rows per request

const FILTERS = [
  { value: "all", label: "All dues" },
  { value: "overdue", label: "Overdue" },
  { value: "due_today", label: "Due today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Partially paid" },
]

const SORTS = [
  { value: "due_date", label: "Due date (oldest first)" },
  { value: "amount_high", label: "Amount (high to low)" },
  { value: "amount_low", label: "Amount (low to high)" },
  { value: "customer", label: "Customer name (A–Z)" },
]

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-amber-100 text-amber-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
  "bg-violet-100 text-violet-700",
]

const num = (value) => Number(value) || 0

const PRESETS = [
  { mode: "today", label: "Today" },
  { mode: "yesterday", label: "Yesterday" },
  { mode: "week", label: "Last 7 days" },
  { mode: "month", label: "This month" },
]

// Days overdue buckets (days = today minus due date)
const AGING_BUCKETS = [
  { key: "current", label: "Not yet due", min: -Infinity, max: 0, bar: "bg-emerald-500" },
  { key: "d1_30", label: "1–30 days overdue", min: 1, max: 30, bar: "bg-amber-400" },
  { key: "d31_60", label: "31–60 days overdue", min: 31, max: 60, bar: "bg-orange-500" },
  { key: "d61_90", label: "61–90 days overdue", min: 61, max: 90, bar: "bg-rose-500" },
  { key: "d90", label: "Over 90 days overdue", min: 91, max: Infinity, bar: "bg-rose-700" },
]

// Move a YYYY-MM-DD date string by N days (timezone safe)
function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

// Adds from/to date filters to a Supabase query (skipped for "Overall")
function applyRange(query, column, range) {
  let q = query
  if (range.from) q = q.gte(column, range.from)
  if (range.to) q = q.lte(column, range.to)
  return q
}

// WhatsApp reminder link (India: 10-digit numbers get the 91 prefix)
function getReminderLink(bill, shopName) {
  const digits = String(bill.customers?.mobile || "").replace(/\D/g, "")
  if (digits.length < 10) return null

  const phone = digits.length === 10 ? `91${digits}` : digits
  const name = bill.customers?.name || "Customer"
  const dueText = bill.due_date ? ` (due date ${formatDate(bill.due_date)})` : ""
  const shopText = shopName ? ` ${shopName} ki taraf se` : ""
  const message = `Namaste ${name},${shopText} yaad dilana hai ki bill ${bill.bill_number || ""} ka ${formatCurrency(bill.amount_due)} baaki hai${dueText}. Kripya jald payment kar dein. Dhanyavaad.`

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

function csvCell(value) {
  const text = String(value ?? "")
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function getLocalDateString() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function getDueState(dueDate, today) {
  if (!dueDate) return "no-date"
  if (dueDate < today) return "overdue"
  if (dueDate === today) return "today"
  return "upcoming"
}

// Whole days between two YYYY-MM-DD strings (timezone safe)
function daysBetween(fromStr, toStr) {
  const [y1, m1, d1] = fromStr.split("-").map(Number)
  const [y2, m2, d2] = toStr.split("-").map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

function getDueNote(dueDate, today) {
  const state = getDueState(dueDate, today)
  if (state === "no-date") return null

  if (state === "overdue") {
    const days = daysBetween(dueDate, today)
    return {
      text: `${days} ${days === 1 ? "day" : "days"} overdue`,
      className: "text-rose-600",
    }
  }

  if (state === "today") return { text: "Due today", className: "text-amber-600" }

  const days = daysBetween(today, dueDate)
  return {
    text: `In ${days} ${days === 1 ? "day" : "days"}`,
    className: "text-slate-500",
  }
}

function getStatusBadge(bill, today) {
  const state = getDueState(bill.due_date, today)

  if (state === "overdue") {
    return {
      label: "Overdue",
      className: "bg-rose-100 text-rose-700 border-rose-200",
      icon: CircleAlert,
    }
  }

  if (state === "today") {
    return {
      label: "Due today",
      className: "bg-amber-100 text-amber-700 border-amber-200",
      icon: CalendarClock,
    }
  }

  if (bill.payment_status === "partial") {
    return {
      label: "Partially paid",
      className: "bg-amber-100 text-amber-700 border-amber-200",
      icon: Clock3,
    }
  }

  return {
    label: "Unpaid",
    className: "bg-slate-100 text-slate-700 border-slate-200",
    icon: CircleAlert,
  }
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

function CustomerAvatar({ name, photo, className = "h-10 w-10", fallbackClassName = "bg-violet-100 text-violet-700" }) {
  const [imageFailed, setImageFailed] = useState(false)
  const showPhoto = Boolean(photo) && !imageFailed

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className} ${showPhoto ? "border border-slate-200 bg-white" : fallbackClassName}`}
      aria-label={`${name || "Customer"} profile`}
    >
      {showPhoto ? (
        <img
          src={photo}
          alt={`${name || "Customer"} profile`}
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="text-xs font-bold">{getInitials(name)}</span>
      )}
    </div>
  )
}

// Supabase silently caps every query at 1000 rows; this pages through all of them.
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

/* ==================================================
   SMALL UI PIECES
================================================== */

function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />
}

function DuesSkeleton() {
  return (
    <div
      className="min-h-full w-full space-y-4 rounded-2xl bg-[#f7f5ff] px-3 py-5 sm:px-5 lg:px-6"
      aria-busy="true"
      aria-label="Loading dues"
    >
      <Skeleton className="h-16 w-72" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-[20px]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[1.65fr_1fr]">
        <Skeleton className="h-[520px] rounded-[20px]" />
        <Skeleton className="h-[520px] rounded-[20px]" />
      </div>
    </div>
  )
}

const SUMMARY_TONES = {
  green: { icon: "bg-emerald-100/80 text-emerald-700", accent: "text-emerald-700" },
  blue: { icon: "bg-blue-100/80 text-blue-700", accent: "text-blue-700" },
  pink: { icon: "bg-pink-100/80 text-pink-700", accent: "text-pink-700" },
  amber: { icon: "bg-amber-100/80 text-amber-700", accent: "text-amber-700" },
  purple: { icon: "bg-violet-100/80 text-violet-700", accent: "text-violet-700" },
}

function SummaryCard({ label, value, detail, icon: Icon, tone = "green" }) {
  const style = SUMMARY_TONES[tone]

  return (
    <Card className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm shadow-slate-900/[0.04]">
      <CardContent className="flex min-w-0 items-center gap-4 p-4 sm:p-5">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${style.icon}`}
        >
          <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-slate-500">{label}</p>
          <h3 className="mt-1 break-words text-[22px] font-bold leading-none tracking-tight text-slate-900 tabular-nums">
            {value}
          </h3>
          <p className={`mt-1.5 text-[11px] font-medium ${style.accent}`}>{detail}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function SectionHeader({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </div>

        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</h2>
          <p className="mt-0.5 break-words text-[12px] text-slate-500">{description}</p>
        </div>
      </div>

      {action && <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">{action}</div>}
    </div>
  )
}

const ROW_TONES = {
  green: { icon: "text-emerald-700", value: "text-emerald-700" },
  pink: { icon: "text-pink-600", value: "text-rose-600" },
  blue: { icon: "text-blue-600", value: "text-slate-900" },
  amber: { icon: "text-amber-600", value: "text-amber-700" },
  purple: { icon: "text-violet-700", value: "text-slate-900" },
}

function SummaryRow({ label, value, icon: Icon, tone = "green" }) {
  const style = ROW_TONES[tone]

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#efedf6] py-3 last:border-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon className={`h-[19px] w-[19px] shrink-0 ${style.icon}`} aria-hidden="true" />
        <span className="truncate text-[13px] font-medium text-slate-700">{label}</span>
      </div>
      <span className={`shrink-0 text-sm font-bold tabular-nums ${style.value}`}>{value}</span>
    </div>
  )
}

function StatusPill({ status }) {
  const StatusIcon = status.icon
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1.5 text-[10px] font-bold ${status.className}`}
    >
      <StatusIcon className="h-3 w-3" aria-hidden="true" />
      {status.label}
    </span>
  )
}

function ReminderButton({ bill, shopName, full = false }) {
  const link = getReminderLink(bill, shopName)
  if (!link) return null

  const name = bill.customers?.name || "customer"

  if (full) {
    return (
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-violet-200 bg-white/90 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
      >
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        Remind
      </a>
    )
  }

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Send WhatsApp reminder to ${name}`}
      title="Send WhatsApp reminder"
      className="flex h-8 w-8 items-center justify-center rounded-xl border border-violet-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
    >
      <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  )
}

/* ==================================================
   DUES PAGE
================================================== */

export default function Dues() {
  const { currentShop } = useShop()
  const shopId = currentShop?.id

  const [dues, setDues] = useState([])
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState("due_date")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  // Dues are shown for all time by default; the person can narrow by bill date.
  const [period, setPeriod] = useState({ mode: "overall", from: "", to: "" })
  const [periodOpen, setPeriodOpen] = useState(false)
  const periodRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [lastUpdated, setLastUpdated] = useState(null)

  const [payBill, setPayBill] = useState(null)
  const [payAmount, setPayAmount] = useState("")
  const [payMode, setPayMode] = useState("Cash")
  const [saving, setSaving] = useState(false)

  const today = getLocalDateString()
  const hasLoaded = useRef(false)

  // Prevents an older (slower) request from overwriting newer data
  const dueRequest = useRef(0)

  const range = useMemo(() => {
    switch (period.mode) {
      case "overall":
        return { from: null, to: null }
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
        return { from: today, to: today }
    }
  }, [period, today])

  // Reset everything when the shop changes
  useEffect(() => {
    hasLoaded.current = false
    setDues([])
    setPage(1)
    setFilter("all")
    setSearch("")
    setLoadError("")
  }, [shopId])

  // Close the period menu on outside click or Escape
  useEffect(() => {
    if (!periodOpen) return

    const onPointerDown = (event) => {
      if (periodRef.current && !periodRef.current.contains(event.target)) {
        setPeriodOpen(false)
      }
    }
    const onKeyDown = (event) => {
      if (event.key === "Escape") setPeriodOpen(false)
    }

    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [periodOpen])

  /* --------------------------------------------------
     LOAD DUES
  -------------------------------------------------- */

  const loadDues = useCallback(
    async (showRefresh = false) => {
      const requestId = ++dueRequest.current

      if (!shopId) {
        setDues([])
        setLoading(false)
        return
      }

      // Full skeleton only on first load; later loads just spin the refresh icon
      if (showRefresh || hasLoaded.current) setRefreshing(true)
      else setLoading(true)

      setLoadError("")

      try {
        const rows = await fetchAllRows(() =>
          applyRange(
            supabase
              .from("bills")
              .select(
                "id, bill_number, bill_date, grand_total, amount_paid, amount_due, advance_adjusted, due_date, payment_status, customer_id, customers(name, mobile, photo_url)"
              )
              .eq("shop_id", shopId)
              .gt("amount_due", 0),
            "bill_date",
            range
          ).order("id")
        )

        // A newer request has started: ignore this result
        if (requestId !== dueRequest.current) return

        setDues(rows)
        setLastUpdated(new Date())
        hasLoaded.current = true
      } catch (error) {
        if (requestId !== dueRequest.current) return
        console.error("Dues error:", error)
        const message = error?.message || "Unable to load dues."
        setLoadError(message)
        toast.error("Could not load dues", { description: message })
      } finally {
        if (requestId === dueRequest.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [shopId, range.from, range.to]
  )

  useEffect(() => {
    loadDues()
  }, [loadDues])

  /* --------------------------------------------------
     DERIVED DATA
  -------------------------------------------------- */

  const stats = useMemo(() => {
    const sumDue = (rows) => rows.reduce((total, bill) => total + num(bill.amount_due), 0)

    const overdueBills = dues.filter((b) => getDueState(b.due_date, today) === "overdue")
    const todayBills = dues.filter((b) => getDueState(b.due_date, today) === "today")
    const upcomingBills = dues.filter((b) => getDueState(b.due_date, today) === "upcoming")
    const noDateBills = dues.filter((b) => getDueState(b.due_date, today) === "no-date")
    const partialBills = dues.filter((b) => b.payment_status === "partial")

    const customerIds = new Set(dues.map((b) => b.customer_id || "walk-in"))

    const aging = AGING_BUCKETS.map((bucket) => {
      const rows = dues.filter((b) => {
        if (!b.due_date) return false
        const days = daysBetween(b.due_date, today)
        return days >= bucket.min && days <= bucket.max
      })
      return { ...bucket, count: rows.length, amount: sumDue(rows) }
    })
    const agingTotal = aging.reduce((total, bucket) => total + bucket.amount, 0)

    return {
      outstanding: sumDue(dues),
      billCount: dues.length,
      overdue: sumDue(overdueBills),
      overdueCount: overdueBills.length,
      today: sumDue(todayBills),
      todayCount: todayBills.length,
      upcoming: sumDue(upcomingBills),
      upcomingCount: upcomingBills.length,
      noDate: sumDue(noDateBills),
      noDateCount: noDateBills.length,
      partialCount: partialBills.length,
      customerCount: customerIds.size,
      alreadyPaid: dues.reduce((total, b) => total + num(b.amount_paid), 0),
      aging,
      agingTotal,
    }
  }, [dues, today])

  const filterCounts = useMemo(() => {
    const counts = { all: dues.length }
    FILTERS.forEach((item) => {
      if (item.value === "all") return
      counts[item.value] = dues.filter((bill) => {
        const state = getDueState(bill.due_date, today)
        if (item.value === "overdue") return state === "overdue"
        if (item.value === "due_today") return state === "today"
        if (item.value === "upcoming") return state === "upcoming"
        return bill.payment_status === item.value
      }).length
    })
    return counts
  }, [dues, today])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()

    const rows = dues.filter((bill) => {
      const state = getDueState(bill.due_date, today)
      const matchesFilter =
        filter === "all" ||
        (filter === "overdue" && state === "overdue") ||
        (filter === "due_today" && state === "today") ||
        (filter === "upcoming" && state === "upcoming") ||
        (filter === "unpaid" && bill.payment_status === "unpaid") ||
        (filter === "partial" && bill.payment_status === "partial")

      const matchesSearch =
        !query ||
        String(bill.customers?.name || "").toLowerCase().includes(query) ||
        String(bill.customers?.mobile || "").toLowerCase().includes(query) ||
        String(bill.bill_number || "").toLowerCase().includes(query)

      return matchesFilter && matchesSearch
    })

    const byName = (bill) => String(bill.customers?.name || "Walk-in customer").toLowerCase()

    return rows.sort((a, b) => {
      if (sort === "amount_high") return num(b.amount_due) - num(a.amount_due)
      if (sort === "amount_low") return num(a.amount_due) - num(b.amount_due)
      if (sort === "customer") return byName(a).localeCompare(byName(b))

      // Default: oldest due date first, bills without a date at the end
      if (!a.due_date && !b.due_date) return 0
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return a.due_date.localeCompare(b.due_date)
    })
  }, [dues, filter, search, sort, today])

  // Top customers by total amount owed (from ALL dues, not just the filtered ones)
  const topCustomers = useMemo(() => {
    const map = new Map()

    dues.forEach((bill) => {
      const key = bill.customer_id || "walk-in"
      const isOverdue = getDueState(bill.due_date, today) === "overdue"
      const existing = map.get(key)

      if (existing) {
        existing.due += num(bill.amount_due)
        existing.billCount += 1
        if (isOverdue) existing.overdue += num(bill.amount_due)
      } else {
        map.set(key, {
          key,
          name: bill.customers?.name || "Walk-in customer",
          photo: bill.customers?.photo_url || null,
          due: num(bill.amount_due),
          overdue: isOverdue ? num(bill.amount_due) : 0,
          billCount: 1,
        })
      }
    })

    return Array.from(map.values())
      .sort((a, b) => b.due - a.due)
      .slice(0, 5)
  }, [dues, today])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)

  const pageRows = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize]
  )

  const paginationItems = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (currentPage <= 3) return [1, 2, 3, "ellipsis-end", totalPages]
    if (currentPage >= totalPages - 2) {
      return [1, "ellipsis-start", totalPages - 2, totalPages - 1, totalPages]
    }
    return [
      1,
      "ellipsis-start",
      currentPage - 1,
      currentPage,
      currentPage + 1,
      "ellipsis-end",
      totalPages,
    ]
  }, [currentPage, totalPages])

  const showingFrom = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const showingTo = Math.min(currentPage * pageSize, filtered.length)

  const collectionBase = stats.alreadyPaid + stats.outstanding
  const recoveredRate =
    collectionBase > 0
      ? Math.min(100, Math.max(0, Math.round((stats.alreadyPaid / collectionBase) * 100)))
      : 0

  const hasActiveFilters = filter !== "all" || search.trim() !== ""

  const shortLabel = {
    today: "Today",
    yesterday: "Yesterday",
    week: "Last 7 days",
    month: "This month",
    overall: "Overall",
    custom: "Selected dates",
  }[period.mode]

  const labelSuffix = period.mode === "overall" ? "" : ` (${shortLabel})`

  const periodLabel = (() => {
    if (period.mode === "overall") return "Overall (all time)"
    if (period.mode === "custom") {
      if (range.from && range.to) {
        return range.from === range.to
          ? formatDate(range.from)
          : `${formatDate(range.from)} – ${formatDate(range.to)}`
      }
      if (range.from) return `From ${formatDate(range.from)}`
      if (range.to) return `Up to ${formatDate(range.to)}`
      return "All dates"
    }
    if (period.mode === "today") return `Today, ${formatDate(today)}`
    return shortLabel
  })()

  const choosePeriod = (mode) => {
    setPeriod({ mode, from: "", to: "" })
    setPage(1)
    setPeriodOpen(false)
  }

  const changeCustomDate = (key, value) => {
    const next = { from: range.from || "", to: range.to || "", [key]: value }

    // Keep "From" on or before "To"
    if (next.from && next.to && next.from > next.to) {
      if (key === "from") next.to = next.from
      else next.from = next.to
    }

    setPeriod({ mode: "custom", ...next })
    setPage(1)
  }

  // Download the currently filtered list as a CSV (opens in Excel / Sheets)
  const exportCsv = () => {
    if (filtered.length === 0) return

    const header = [
      "Customer",
      "Mobile",
      "Bill no.",
      "Bill date",
      "Due date",
      "Status",
      "Bill total",
      "Paid",
      "Amount due",
    ]

    const lines = filtered.map((bill) =>
      [
        bill.customers?.name || "Walk-in customer",
        bill.customers?.mobile || "",
        bill.bill_number || "",
        bill.bill_date ? formatDate(bill.bill_date) : "",
        bill.due_date ? formatDate(bill.due_date) : "",
        getStatusBadge(bill, today).label,
        num(bill.grand_total),
        num(bill.amount_paid),
        num(bill.amount_due),
      ]
        .map(csvCell)
        .join(",")
    )

    const csv = "\uFEFF" + [header.map(csvCell).join(","), ...lines].join("\r\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `dues-${today}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)

    toast.success("Dues exported", {
      description: `${filtered.length} ${filtered.length === 1 ? "bill" : "bills"} saved as CSV`,
    })
  }

  const changeFilter = (value) => {
    setFilter(value)
    setPage(1)
  }

  const clearFilters = () => {
    setFilter("all")
    setSearch("")
    setPage(1)
  }

  /* --------------------------------------------------
     RECORD PAYMENT
  -------------------------------------------------- */

  function openPayment(bill) {
    setPayBill(bill)
    setPayAmount(String(num(bill.amount_due)))
    setPayMode("Cash")
  }

  function closePayment() {
    if (saving) return
    setPayBill(null)
    setPayAmount("")
  }

  async function handlePayment(event) {
    event.preventDefault()

    if (!payBill || !shopId) return

    const amount = Number(payAmount)
    const currentDue = num(payBill.amount_due)

    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid payment amount")
      return
    }

    if (amount > currentDue) {
      toast.error(`Payment cannot exceed the pending amount of ${formatCurrency(currentDue)}`)
      return
    }

    setSaving(true)

    try {
      // Fetch the latest bill values before recording the payment.
      const { data: bill, error: billError } = await supabase
        .from("bills")
        .select("id, customer_id, amount_paid, grand_total, advance_adjusted, amount_due")
        .eq("id", payBill.id)
        .eq("shop_id", shopId)
        .single()

      if (billError) throw billError

      const latestDue = num(bill.amount_due)
      if (amount > latestDue) {
        throw new Error("The pending amount has changed. Refresh the page and try again.")
      }

      const newPaid = num(bill.amount_paid) + amount
      const newDue = Math.max(
        0,
        num(bill.grand_total) - num(bill.advance_adjusted) - newPaid
      )

      const { error: paymentError } = await supabase.from("payments").insert({
        shop_id: shopId,
        customer_id: bill.customer_id,
        bill_id: bill.id,
        amount,
        payment_mode: payMode,
        payment_date: today,
      })

      if (paymentError) throw paymentError

      const { error: updateError } = await supabase
        .from("bills")
        .update({
          amount_paid: newPaid,
          amount_due: newDue,
          payment_status: newDue <= 0 ? "paid" : "partial",
        })
        .eq("id", bill.id)
        .eq("shop_id", shopId)

      if (updateError) {
        throw new Error(
          `Payment was recorded, but the bill balance could not be updated. Please refresh and verify the payment. ${updateError.message}`
        )
      }

      toast.success("Payment recorded", {
        description: `${formatCurrency(amount)} received via ${payMode}`,
      })
      setPayBill(null)
      setPayAmount("")
      await loadDues(true)
    } catch (error) {
      toast.error(error.message || "Could not record payment")
    } finally {
      setSaving(false)
    }
  }

  /* --------------------------------------------------
     EMPTY / LOADING STATES
  -------------------------------------------------- */

  if (!currentShop) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-3xl border border-dashed border-violet-200 bg-white/80 p-8 text-center">
        <div className="max-w-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <Store className="h-7 w-7" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">No workspace selected</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Select or create a workspace to view and manage outstanding payments.
          </p>
          <Button asChild className="mt-5 rounded-xl border border-violet-100 bg-white text-slate-700 shadow-sm transition-colors hover:bg-violet-50">
            <Link to="/settings">Open workspace settings</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (loading) return <DuesSkeleton />

  /* --------------------------------------------------
     MAIN UI
  -------------------------------------------------- */

  return (
    <div className="min-h-full w-full space-y-4 rounded-2xl bg-[#f7f5ff] px-3 py-5 sm:px-5 lg:px-6">
      {/* PAGE HEADER */}

      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-400"
          >
            <span>{currentShop.name || "Workspace"}</span>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            <span className="text-slate-500">Dues</span>
          </nav>

          <h1 className="mt-1.5 text-[28px] font-bold tracking-tight text-slate-900 sm:text-[30px]">
            Outstanding dues
          </h1>

          <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
            <strong className="font-semibold text-slate-800">
              {formatCurrency(stats.outstanding)}
            </strong>{" "}
            pending across {stats.billCount} {stats.billCount === 1 ? "bill" : "bills"} from{" "}
            {stats.customerCount} {stats.customerCount === 1 ? "customer" : "customers"}
            {period.mode !== "overall" && (
              <>
                {" "}
                · Period: <strong className="font-semibold text-slate-700">{periodLabel}</strong>
              </>
            )}
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div ref={periodRef} className="relative w-full sm:w-auto">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={periodOpen}
              onClick={() => setPeriodOpen((open) => !open)}
              className="flex h-11 w-full max-w-full items-center gap-2 rounded-xl border border-violet-100 bg-white/80 px-3.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:w-auto sm:max-w-[270px]"
            >
              <CalendarDays className="h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
              <span className="truncate">{periodLabel}</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${
                  periodOpen ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              />
            </button>

            {periodOpen && (
              <>
                {/* Dim background on mobile; tap it to close */}
                <div
                  className="fixed inset-0 z-40 bg-slate-900/30 sm:hidden"
                  onClick={() => setPeriodOpen(false)}
                  aria-hidden="true"
                />
                <div
                  role="menu"
                  aria-label="Choose period"
                  className="fixed inset-x-3 bottom-3 z-50 max-h-[85vh] overflow-y-auto rounded-2xl border border-violet-100 bg-white p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_12px_32px_rgba(80,65,130,0.25)] sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-[calc(100%+8px)] sm:z-30 sm:max-h-none sm:w-[290px] sm:overflow-visible sm:pb-2"
                >
                  {[...PRESETS, { mode: "overall", label: "Overall (all time)" }].map((option) => {
                    const active = period.mode === option.mode
                    return (
                      <button
                        key={option.mode}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        onClick={() => choosePeriod(option.mode)}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                          active
                            ? "border border-violet-100 bg-white font-semibold text-slate-700 shadow-sm"
                            : "text-slate-700 hover:bg-violet-50"
                        }`}
                      >
                        {option.label}
                        {active && <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    )
                  })}

                  <div className="mt-2 border-t border-[#eeecf5] px-1 pb-1 pt-3">
                    <p
                      className={`mb-2 px-2 text-xs font-semibold ${
                        period.mode === "custom" ? "text-emerald-800" : "text-slate-500"
                      }`}
                    >
                      Pick dates
                    </p>

                    <div className="grid grid-cols-2 gap-2 px-1">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-slate-500">From</span>
                        <input
                          type="date"
                          value={range.from || ""}
                          max={range.to || today}
                          onChange={(e) => changeCustomDate("from", e.target.value)}
                          className="h-9 w-full rounded-lg border border-violet-200 bg-white px-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-slate-500">To</span>
                        <input
                          type="date"
                          value={range.to || ""}
                          min={range.from || undefined}
                          max={today}
                          onChange={(e) => changeCustomDate("to", e.target.value)}
                          className="h-9 w-full rounded-lg border border-violet-200 bg-white px-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                        />
                      </label>
                    </div>

                    <p className="mt-3 px-2 text-[11px] leading-4 text-slate-500">
                      Shows pending bills dated in this period. Overdue and due-today are worked out
                      from each bill's due date.
                    </p>

                    <Button
                      type="button"
                      onClick={() => setPeriodOpen(false)}
                      className="mt-3 h-11 w-full rounded-xl border border-violet-100 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                    >
                      Done
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => loadDues(true)}
            disabled={refreshing}
            aria-label="Refresh dues"
            title="Refresh dues"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-violet-100 bg-white px-4 text-slate-700 shadow-sm transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:pointer-events-none disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 shrink-0 ${refreshing ? "animate-spin" : ""}`} />
            <span className="text-sm font-medium">{refreshing ? "Refreshing..." : "Refresh"}</span>
          </Button>

          <Button
            asChild
            variant="outline"
            className="h-11 gap-2 rounded-xl border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <Link to="/bills">
              <Receipt className="h-4 w-4" aria-hidden="true" />
              All bills
            </Link>
          </Button>
        </div>
      </header>

      {/* ERROR */}

      {loadError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3"
        >
          <div className="flex items-center gap-2 text-sm text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Could not load your latest dues. Check your connection and try again.
              <span className="ml-1 text-xs text-rose-500">({loadError})</span>
            </span>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => loadDues()}
            className="h-9 shrink-0 rounded-xl border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 shadow-sm transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            Try again
          </Button>
        </div>
      )}

      {/* SUMMARY CARDS */}

      <section
        aria-label="Dues overview"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4"
      >
        <SummaryCard
          label={`Total outstanding${labelSuffix}`}
          value={formatCurrency(stats.outstanding)}
          detail={`${stats.billCount} ${stats.billCount === 1 ? "bill" : "bills"} pending`}
          icon={IndianRupee}
          tone="blue"
        />

        <SummaryCard
          label={`Overdue amount${labelSuffix}`}
          value={formatCurrency(stats.overdue)}
          detail={`${stats.overdueCount} ${stats.overdueCount === 1 ? "bill" : "bills"} past due date`}
          icon={CircleAlert}
          tone="pink"
        />

        <SummaryCard
          label={`Due today${labelSuffix}`}
          value={formatCurrency(stats.today)}
          detail={`${stats.todayCount} ${stats.todayCount === 1 ? "bill" : "bills"} due today`}
          icon={CalendarClock}
          tone="amber"
        />

        <SummaryCard
          label={`Upcoming amount${labelSuffix}`}
          value={formatCurrency(stats.upcoming)}
          detail={`${stats.upcomingCount} ${stats.upcomingCount === 1 ? "bill" : "bills"} not yet due`}
          icon={Clock3}
          tone="green"
        />
      </section>

      {/* MAIN CONTENT */}

      <section className="grid grid-cols-1 items-start gap-4 2xl:grid-cols-[1.65fr_1fr]">
        <div className="min-w-0 space-y-4">
          {/* DUES LIST */}

          <Card id="customer-dues-list" className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm shadow-slate-900/[0.04]">
            <SectionHeader
              icon={Receipt}
              title="Customer payments"
              description={
                hasActiveFilters
                  ? `${filtered.length} of ${dues.length} pending bills match`
                  : `${dues.length} pending ${dues.length === 1 ? "bill" : "bills"}`
              }
              action={
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={exportCsv}
                    disabled={filtered.length === 0}
                    className="h-9 gap-1.5 rounded-xl border-violet-200 bg-white/90 px-3 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    Export CSV
                  </Button>
                  {hasActiveFilters && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearFilters}
                    className="h-9 shrink-0 gap-1.5 rounded-xl border-violet-200 bg-white/90 px-3 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    Clear filters
                  </Button>
                  )}
                </div>
              }
            />

            {/* Search, sort and filters */}
            <div className="space-y-3 border-b border-[#eeecf5] px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <div className="relative flex-1">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <Input
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value)
                      setPage(1)
                    }}
                    aria-label="Search dues"
                    placeholder="Search customer, mobile or bill no."
                    className="h-11 rounded-xl border-violet-100 bg-white pl-9 pr-9 shadow-sm focus-visible:ring-emerald-600"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch("")
                        setPage(1)
                      }}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-violet-50 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <Select
                  value={sort}
                  onValueChange={(value) => {
                    setSort(value)
                    setPage(1)
                  }}
                >
                  <SelectTrigger
                    aria-label="Sort dues"
                    className="h-11 w-full rounded-xl border-violet-100 bg-white shadow-sm sm:w-[220px]"
                  >
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    {SORTS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div
                className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
                role="tablist"
                aria-label="Filter dues"
              >
                {FILTERS.map((item) => {
                  const active = filter === item.value
                  return (
                    <button
                      key={item.value}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => changeFilter(item.value)}
                      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                        active
                          ? "border-violet-100 bg-white text-slate-700 shadow-sm"
                          : "border-violet-200 bg-white text-slate-700 hover:bg-violet-50"
                      }`}
                    >
                      {item.label}
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                          active ? "bg-white/20 text-white" : "bg-violet-50 text-violet-700"
                        }`}
                      >
                        {filterCounts[item.value] ?? 0}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* List body */}
            {filtered.length === 0 ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center px-5 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
                  {dues.length === 0 ? (
                    <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
                  ) : (
                    <Search className="h-7 w-7" aria-hidden="true" />
                  )}
                </div>
                <h3 className="mt-4 text-sm font-bold text-slate-900">
                  {dues.length === 0 ? "You're all caught up" : "No matching dues"}
                </h3>
                <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
                  {dues.length === 0
                    ? "No customer owes you anything right now."
                    : "Try another filter or change your search."}
                </p>
                {hasActiveFilters && (
                  <Button
                    type="button"
                    onClick={clearFilters}
                    className="mt-4 h-11 rounded-xl border border-violet-100 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div
                  className={`hidden overflow-x-auto px-3 pt-3 transition-opacity md:block sm:px-4 ${
                    refreshing ? "opacity-60" : "opacity-100"
                  }`}
                >
                  <table className="w-full min-w-[820px] text-left">
                    <caption className="sr-only">Outstanding dues</caption>
                    <thead>
                      <tr className="bg-[#f5f3fc] text-[11px] font-semibold text-slate-600">
                        <th scope="col" className="rounded-l-xl px-3 py-3">Customer</th>
                        <th scope="col" className="px-3 py-3">Bill no.</th>
                        <th scope="col" className="px-3 py-3">Due date</th>
                        <th scope="col" className="px-3 py-3">Status</th>
                        <th scope="col" className="px-3 py-3 text-right">Total</th>
                        <th scope="col" className="px-3 py-3 text-right">Due</th>
                        <th scope="col" className="rounded-r-xl px-3 py-3 text-center">Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {pageRows.map((bill, index) => {
                        const name = bill.customers?.name || "Walk-in customer"
                        const status = getStatusBadge(bill, today)
                        const note = getDueNote(bill.due_date, today)
                        const overdue = getDueState(bill.due_date, today) === "overdue"

                        return (
                          <tr
                            key={bill.id}
                            className="border-b border-[#eeecf5] transition-colors last:border-0 hover:bg-[#f9f8ff]"
                          >
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2.5">
                                <CustomerAvatar
                                  name={name}
                                  photo={bill.customers?.photo_url}
                                  className="h-9 w-9"
                                  fallbackClassName={AVATAR_COLORS[index % AVATAR_COLORS.length]}
                                />
                                <div className="min-w-0">
                                  <Link
                                    to={`/bills/${bill.id}`}
                                    className="block max-w-[170px] truncate text-[12px] font-bold text-slate-800 hover:text-emerald-700"
                                  >
                                    {name}
                                  </Link>
                                  {bill.customers?.mobile && (
                                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                                      <Phone className="h-3 w-3" aria-hidden="true" />
                                      {bill.customers.mobile}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td className="whitespace-nowrap px-3 py-3 text-xs font-medium text-slate-600">
                              {bill.bill_number || "—"}
                            </td>

                            <td className="whitespace-nowrap px-3 py-3">
                              <p className="text-xs font-medium text-slate-700">
                                {bill.due_date ? formatDate(bill.due_date) : "Not set"}
                              </p>
                              {note && (
                                <p className={`mt-0.5 text-[11px] font-semibold ${note.className}`}>
                                  {note.text}
                                </p>
                              )}
                            </td>

                            <td className="px-3 py-3">
                              <StatusPill status={status} />
                            </td>

                            <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-bold tabular-nums text-slate-900">
                              {formatCurrency(bill.grand_total)}
                            </td>

                            <td
                              className={`whitespace-nowrap px-3 py-3 text-right text-xs font-bold tabular-nums ${
                                overdue ? "text-rose-600" : "text-slate-900"
                              }`}
                            >
                              {formatCurrency(bill.amount_due)}
                            </td>

                            <td className="px-3 py-3">
                              <div className="flex items-center justify-center gap-1.5">
                                <Link
                                  to={`/bills/${bill.id}`}
                                  aria-label={`View bill ${bill.bill_number || ""} for ${name}`}
                                  title="View bill"
                                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-violet-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                                >
                                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                                </Link>
                                <ReminderButton bill={bill} shopName={currentShop.name} />
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => openPayment(bill)}
                                  className="h-8 rounded-xl border border-violet-100 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                                >
                                  Record payment
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div
                  className={`divide-y divide-[#eeecf5] transition-opacity md:hidden ${
                    refreshing ? "opacity-60" : "opacity-100"
                  }`}
                >
                  {pageRows.map((bill, index) => {
                    const name = bill.customers?.name || "Walk-in customer"
                    const status = getStatusBadge(bill, today)
                    const note = getDueNote(bill.due_date, today)
                    const overdue = getDueState(bill.due_date, today) === "overdue"

                    return (
                      <div key={bill.id} className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <CustomerAvatar
                              name={name}
                              photo={bill.customers?.photo_url}
                              className="h-10 w-10"
                              fallbackClassName={AVATAR_COLORS[index % AVATAR_COLORS.length]}
                            />
                            <div className="min-w-0">
                              <Link
                                to={`/bills/${bill.id}`}
                                className="block truncate text-sm font-bold text-slate-800 hover:text-emerald-700"
                              >
                                {name}
                              </Link>
                              <p className="mt-0.5 truncate text-xs text-slate-500">
                                {bill.bill_number || "Bill"}
                                {bill.customers?.mobile ? ` · ${bill.customers.mobile}` : ""}
                              </p>
                            </div>
                          </div>
                          <StatusPill status={status} />
                        </div>

                        <div className="grid grid-cols-2 gap-3 rounded-xl bg-[#f9f8ff] p-3">
                          <div>
                            <p className="text-[11px] text-slate-500">Due date</p>
                            <p className="mt-0.5 text-xs font-semibold text-slate-800">
                              {bill.due_date ? formatDate(bill.due_date) : "Not set"}
                            </p>
                            {note && (
                              <p className={`mt-0.5 text-[11px] font-semibold ${note.className}`}>
                                {note.text}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] text-slate-500">
                              Due of {formatCurrency(bill.grand_total)}
                            </p>
                            <p
                              className={`mt-0.5 text-lg font-bold tabular-nums ${
                                overdue ? "text-rose-600" : "text-slate-900"
                              }`}
                            >
                              {formatCurrency(bill.amount_due)}
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            asChild
                            variant="outline"
                            className="h-10 w-10 shrink-0 rounded-xl border-violet-200 bg-white p-0 text-slate-600 shadow-sm transition-colors hover:bg-violet-50 focus-visible:ring-2 focus-visible:ring-emerald-600"
                          >
                            <Link
                              to={`/bills/${bill.id}`}
                              aria-label={`View bill ${bill.bill_number || ""} for ${name}`}
                            >
                              <Eye className="h-4 w-4" aria-hidden="true" />
                            </Link>
                          </Button>
                          <ReminderButton bill={bill} shopName={currentShop.name} full />
                          <Button
                            type="button"
                            onClick={() => openPayment(bill)}
                            className="h-10 flex-1 rounded-xl border border-violet-100 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-violet-50 focus-visible:ring-2 focus-visible:ring-emerald-600"
                          >
                            Record payment
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Pagination */}
                <div className="flex flex-col gap-3 border-t border-[#eeecf5] bg-white/60 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <p className="text-xs font-medium text-slate-600" aria-live="polite">
                    Showing{" "}
                    <span className="font-semibold text-slate-800">
                      {showingFrom}–{showingTo}
                    </span>{" "}
                    of{" "}
                    <span className="font-semibold text-slate-800">
                      {filtered.length.toLocaleString("en-IN")}
                    </span>{" "}
                    bills
                  </p>

                  <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                    Rows per page
                    <select
                      value={pageSize}
                      onChange={(event) => {
                        setPageSize(Number(event.target.value))
                        setPage(1)
                      }}
                      className="h-9 rounded-xl border border-violet-100 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                    >
                      {PAGE_SIZES.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                  </div>

                  {(
                    <nav
                      aria-label="Dues pages"
                      className="flex flex-wrap items-center justify-end gap-1.5"
                    >
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Previous page"
                        disabled={currentPage <= 1}
                        onClick={() => setPage(Math.max(1, currentPage - 1))}
                        className="h-10 w-10 rounded-xl border border-violet-200 bg-white p-0 text-slate-600 shadow-sm transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:pointer-events-none disabled:opacity-40"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>

                      {paginationItems.map((item) =>
                        typeof item === "string" ? (
                          <span
                            key={item}
                            className="px-1 text-xs font-medium text-slate-400"
                            aria-hidden="true"
                          >
                            …
                          </span>
                        ) : (
                          <Button
                            key={item}
                            type="button"
                            variant={currentPage === item ? "default" : "outline"}
                            aria-label={`Page ${item}`}
                            aria-current={currentPage === item ? "page" : undefined}
                            onClick={() => setPage(item)}
                            className={`h-10 min-w-10 rounded-xl border px-3 text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${
                              currentPage === item
                                ? "border-violet-100 bg-white text-slate-700 hover:bg-violet-50"
                                : "border-violet-200 bg-white/90 text-slate-700 hover:bg-violet-50"
                            }`}
                          >
                            {item}
                          </Button>
                        )
                      )}

                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Next page"
                        disabled={currentPage >= totalPages}
                        onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                        className="h-10 w-10 rounded-xl border border-violet-200 bg-white p-0 text-slate-600 shadow-sm transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:pointer-events-none disabled:opacity-40"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </nav>
                  )}
                </div>
              </>
            )}
          </Card>
        </div>

        {/* RIGHT COLUMN */}

        <div className="space-y-4">
          {/* COLLECTION PROGRESS */}

          <Card className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm shadow-slate-900/[0.04]">
            <SectionHeader
              icon={Wallet}
              title="Recovery progress"
              description="Already paid vs still pending on these bills."
            />

            <CardContent className="p-4 sm:p-5">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                <p className="text-xs font-semibold text-emerald-800">Recovered so far</p>
                <p className="mt-2 text-[30px] font-extrabold leading-none tracking-tight text-slate-900 tabular-nums">
                  {recoveredRate}%
                </p>
                <p className="mt-1.5 text-xs text-slate-600">
                  {formatCurrency(stats.alreadyPaid)} paid, {formatCurrency(stats.outstanding)} to go
                </p>

                <div
                  className="mt-4 h-2.5 overflow-hidden rounded-full bg-rose-100"
                  role="progressbar"
                  aria-label="Recovered share of pending bills"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={recoveredRate}
                >
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all duration-500"
                    style={{ width: `${recoveredRate}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AGING ANALYSIS */}

          <Card className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm shadow-slate-900/[0.04]">
            <SectionHeader
              icon={Layers}
              title="Aging analysis"
              description="How long your dues have been pending."
            />

            <CardContent className="space-y-4 p-4 sm:p-5">
              {stats.aging.map((bucket) => {
                const pct =
                  stats.agingTotal > 0 ? Math.round((bucket.amount / stats.agingTotal) * 100) : 0

                return (
                  <div key={bucket.key}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate font-medium text-slate-700">
                        {bucket.label}
                        <span className="ml-1.5 text-slate-400">({bucket.count})</span>
                      </span>
                      <span className="shrink-0 font-bold tabular-nums text-slate-900">
                        {formatCurrency(bucket.amount)}
                      </span>
                    </div>
                    <div
                      className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"
                      role="progressbar"
                      aria-label={bucket.label}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={pct}
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${bucket.bar}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}

              {stats.noDateCount > 0 && (
                <p className="text-[11px] leading-4 text-slate-500">
                  {stats.noDateCount} {stats.noDateCount === 1 ? "bill has" : "bills have"} no due date
                  and {stats.noDateCount === 1 ? "is" : "are"} not included here.
                </p>
              )}
            </CardContent>
          </Card>

          {/* DUES BREAKDOWN */}

          <Card className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm shadow-slate-900/[0.04]">
            <SectionHeader
              icon={CalendarClock}
              title="Dues breakdown"
              description="Where your pending money stands."
            />

            <CardContent className="px-5 py-1">
              <SummaryRow
                label={`Overdue (${stats.overdueCount})`}
                value={formatCurrency(stats.overdue)}
                icon={CircleAlert}
                tone="pink"
              />
              <SummaryRow
                label={`Due today (${stats.todayCount})`}
                value={formatCurrency(stats.today)}
                icon={CalendarClock}
                tone="amber"
              />
              <SummaryRow
                label={`Upcoming (${stats.upcomingCount})`}
                value={formatCurrency(stats.upcoming)}
                icon={Clock3}
                tone="green"
              />
              {stats.noDateCount > 0 && (
                <SummaryRow
                  label={`No due date (${stats.noDateCount})`}
                  value={formatCurrency(stats.noDate)}
                  icon={Receipt}
                  tone="blue"
                />
              )}
              <SummaryRow
                label={`Partially paid bills`}
                value={String(stats.partialCount)}
                icon={ArrowDownLeft}
                tone="purple"
              />
            </CardContent>
          </Card>

          {/* TOP CUSTOMERS */}

          <Card className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm shadow-slate-900/[0.04]">
            <SectionHeader
              icon={Users}
              title="Top customers"
              description="Customers who owe you the most."
            />

            {topCustomers.length === 0 ? (
              <div className="flex items-center gap-3 px-5 py-8">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">All payments are clear</p>
                  <p className="mt-1 text-xs text-slate-500">No customer owes you anything.</p>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-[#eeecf5]">
                {topCustomers.map((customer, index) => (
                  <li key={customer.key} className="flex min-w-0 items-center gap-3 px-4 py-4 transition-colors hover:bg-[#faf9ff] sm:px-5">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <CustomerAvatar
                        name={customer.name}
                        photo={customer.photo}
                        className="h-11 w-11"
                        fallbackClassName="bg-violet-100 text-violet-700"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-bold text-slate-800">
                            {customer.name}
                          </p>
                          {index === 0 && (
                            <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                              Highest due
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {customer.billCount} unpaid {customer.billCount === 1 ? "bill" : "bills"}
                          {customer.overdue > 0 && (
                            <span className="ml-1 font-semibold text-rose-600">
                              · {formatCurrency(customer.overdue)} overdue
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <p className="text-right text-sm font-bold tabular-nums text-rose-600">
                        {formatCurrency(customer.due)}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSearch(customer.key === "walk-in" ? "" : customer.name)
                          setFilter("all")
                          setPage(1)
                          document.getElementById("customer-dues-list")?.scrollIntoView({ behavior: "smooth", block: "start" })
                        }}
                        title={`View dues for ${customer.name}`}
                        className="h-9 shrink-0 rounded-xl border-violet-100 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                      >
                        View dues
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </section>

      {/* FOOTER */}

      <footer className="flex flex-col justify-between gap-2 rounded-xl border border-white/80 bg-white/65 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-emerald-700" aria-hidden="true" />
          <span>
            Workspace:
            <strong className="ml-1 text-slate-700">{currentShop.name}</strong>
          </span>
        </div>

        <span>
          {lastUpdated
            ? `Last updated at ${lastUpdated.toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : "Not updated yet"}
        </span>
      </footer>

      {/* RECORD PAYMENT DIALOG */}

      <Dialog
        open={!!payBill}
        onOpenChange={(open) => {
          if (!open) closePayment()
        }}
      >
        <DialogContent className="max-w-[440px] gap-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-0 shadow-xl shadow-slate-900/10">
          {/* Header */}
          <div className="border-b border-emerald-100 bg-gradient-to-br from-emerald-50/70 via-white to-white px-6 pb-5 pt-6">
            <DialogHeader className="space-y-1.5 text-left">
              <DialogTitle className="text-[19px] font-bold tracking-tight text-slate-900">
                Record payment
              </DialogTitle>
              <DialogDescription className="text-[13px] leading-relaxed text-slate-500">
                Collect payment against this outstanding bill.
              </DialogDescription>
            </DialogHeader>
          </div>

          {payBill && (
            <form onSubmit={handlePayment} className="space-y-5 px-6 py-5">
              {/* Customer + bill summary */}
              <div className="overflow-hidden rounded-xl border border-emerald-100 bg-emerald-50/40">
                <div className="flex items-center gap-3.5 px-4 py-3.5">
                  <CustomerAvatar
                    name={payBill.customers?.name || "Walk-in customer"}
                    photo={payBill.customers?.photo_url}
                    className="h-11 w-11 ring-2 ring-white"
                    fallbackClassName="bg-violet-100 text-violet-700"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-slate-900">
                      {payBill.customers?.name || "Walk-in customer"}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-slate-500">
                      <span className="font-medium text-slate-600">
                        {payBill.bill_number || "—"}
                      </span>
                      {payBill.due_date && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span>Due {formatDate(payBill.due_date)}</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 divide-x divide-emerald-100 border-t border-emerald-100 bg-white">
                  <div className="px-3 py-3 text-center">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      Bill total
                    </p>
                    <p className="mt-1 text-[13px] font-semibold tabular-nums text-slate-800">
                      {formatCurrency(payBill.grand_total)}
                    </p>
                  </div>
                  <div className="px-3 py-3 text-center">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      Paid
                    </p>
                    <p className="mt-1 text-[13px] font-semibold tabular-nums text-slate-800">
                      {formatCurrency(payBill.amount_paid)}
                    </p>
                  </div>
                  <div className="px-3 py-3 text-center">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      Pending
                    </p>
                    <p className="mt-1 text-[13px] font-semibold tabular-nums text-rose-600">
                      {formatCurrency(payBill.amount_due)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Amount */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="payment-amount" className="text-[13px] font-medium text-slate-700">
                    Payment amount
                  </Label>
                  <span className="text-[11px] font-medium text-slate-400">
                    Max {formatCurrency(payBill.amount_due)}
                  </span>
                </div>

                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] font-semibold text-slate-400">
                    ₹
                  </span>
                  <Input
                    id="payment-amount"
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    max={num(payBill.amount_due)}
                    step="0.01"
                    required
                    autoFocus
                    value={payAmount}
                    onChange={(event) => setPayAmount(event.target.value)}
                    className={`h-12 rounded-xl bg-white pl-8 pr-4 text-[16px] font-semibold tabular-nums shadow-sm focus-visible:ring-emerald-500/20 ${Number(payAmount) > num(payBill.amount_due) ? "border-rose-300 focus-visible:border-rose-400" : "border-slate-200 focus-visible:border-emerald-400"}`}
                    placeholder="0.00"
                  />
                </div>

                {Number(payAmount) > num(payBill.amount_due) && (
                  <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-[12px] leading-5 text-rose-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      Amount is higher than the pending balance. Please enter {formatCurrency(payBill.amount_due)} or less.
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {[0.25, 0.5, 1].map((fraction) => {
                    const value = Math.round(num(payBill.amount_due) * fraction * 100) / 100
                    const active = Number(payAmount) === value
                    return (
                      <button
                        key={fraction}
                        type="button"
                        onClick={() => setPayAmount(String(value))}
                        className={`rounded-xl border px-3 py-1.5 text-[12px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                          active
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-emerald-50"
                        }`}
                      >
                        {fraction === 1 ? "Full amount" : `${fraction * 100}%`}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Payment mode */}
              <div className="space-y-2.5">
                <Label className="text-[13px] font-medium text-slate-700">Payment mode</Label>
                <Select value={payMode} onValueChange={setPayMode}>
                  <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm focus:ring-emerald-500/20">
                    <SelectValue placeholder="Select payment mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {mode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Live balance preview */}
              {Number(payAmount) > 0 && Number(payAmount) <= num(payBill.amount_due) && (
                <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                    </div>
                    <span className="text-[12px] font-medium text-emerald-800">
                      Balance after payment
                    </span>
                  </div>
                  <span className="text-[14px] font-bold tabular-nums text-slate-900">
                    {formatCurrency(Math.max(0, num(payBill.amount_due) - Number(payAmount)))}
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closePayment}
                  disabled={saving}
                  className="h-11 flex-1 rounded-xl border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-violet-50 focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving || !payAmount || Number(payAmount) <= 0 || Number(payAmount) > num(payBill.amount_due)}
                  className="h-11 flex-[1.4] rounded-xl border border-violet-100 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-violet-50 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Confirm payment"
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}