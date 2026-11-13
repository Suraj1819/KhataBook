import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatDate, PAYMENT_MODES } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  Eye,
  Loader2,
  MessageCircle,
  Phone,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Store,
  TrendingUp,
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

const PRESETS = [
  { mode: "today", label: "Today" },
  { mode: "yesterday", label: "Yesterday" },
  { mode: "week", label: "Last 7 days" },
  { mode: "month", label: "This month" },
]

const TYPE_FILTERS = [
  { value: "all", label: "All payments" },
  { value: "regular", label: "Regular" },
  { value: "advance", label: "Advance" },
  { value: "refund", label: "Refunds" },
]

const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "amount_high", label: "Amount (high to low)" },
  { value: "amount_low", label: "Amount (low to high)" },
]

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-amber-100 text-amber-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
  "bg-violet-100 text-violet-700",
]

const MODE_BAR_COLORS = [
  "bg-emerald-500",
  "bg-blue-500",
  "bg-violet-500",
  "bg-amber-400",
  "bg-pink-500",
  "bg-teal-500",
]

const num = (value) => Number(value) || 0

function getLocalDateString() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

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

const initialForm = () => ({
  customer_id: "",
  amount: "",
  payment_mode: "Cash",
  payment_date: getLocalDateString(),
  is_advance: false,
  notes: "",
})

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

function CustomerAvatar({ name, photoUrl, className = "" }) {
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [photoUrl])

  if (photoUrl && !imageFailed) {
    return (
      <img
        src={photoUrl}
        alt={`${name || "Customer"} profile`}
        loading="lazy"
        onError={() => setImageFailed(true)}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    )
  }

  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full text-xs font-bold ${AVATAR_COLORS[0]} ${className}`}
    >
      {getInitials(name)}
    </div>
  )
}

function getPaymentType(payment) {
  if (payment.is_refund) {
    return {
      key: "refund",
      label: "Refund",
      className: "bg-rose-100 text-rose-700 border-rose-200",
    }
  }
  if (payment.is_advance) {
    return {
      key: "advance",
      label: "Advance",
      className: "bg-blue-100 text-blue-700 border-blue-200",
    }
  }
  return {
    key: "regular",
    label: "Payment",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
  }
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

// WhatsApp receipt link (India: 10-digit numbers get the 91 prefix)
function getReceiptLink(payment, shopName) {
  if (payment.is_refund) return null

  const digits = String(payment.customers?.mobile || "").replace(/\D/g, "")
  if (digits.length < 10) return null

  const phone = digits.length === 10 ? `91${digits}` : digits
  const name = payment.customers?.name || "Customer"
  const shopText = shopName ? ` ${shopName} ko` : ""
  const kind = payment.is_advance ? "advance payment" : "payment"
  const billText = payment.bills?.bill_number ? ` (bill ${payment.bills.bill_number})` : ""
  const message = `Namaste ${name},${shopText} aapka ${formatCurrency(payment.amount)} ka ${kind}${billText} ${formatDate(payment.payment_date)} ko ${payment.payment_mode || "cash"} se mil gaya hai. Dhanyavaad!`

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

function csvCell(value) {
  const text = String(value ?? "")
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/* ==================================================
   SMALL UI PIECES
================================================== */

function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />
}

function PaymentsSkeleton() {
  return (
    <div
      className="min-h-full w-full space-y-4 rounded-2xl bg-[#f7f5ff] px-3 py-5 sm:px-5 lg:px-6"
      aria-busy="true"
      aria-label="Loading payments"
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
    <Card className="overflow-hidden rounded-[20px] border border-white/80 bg-white/80 shadow-[0_4px_15px_rgba(80,65,130,0.07)] backdrop-blur-sm">
      <CardContent className="flex min-w-0 items-center gap-4 p-4 sm:p-5">
        <div
          className={`flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full ${style.icon}`}
        >
          <Icon className="h-7 w-7" strokeWidth={1.9} aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-slate-600">{label}</p>
          <h3 className="mt-1.5 break-words text-[23px] font-bold leading-tight tracking-tight text-[#151934] tabular-nums">
            {value}
          </h3>
          <p className={`mt-1.5 text-xs font-semibold ${style.accent}`}>{detail}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function SectionHeader({ icon: Icon, title, description, action }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#eae7f4] px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </div>

        <div className="min-w-0">
          <h2 className="text-[16px] font-bold tracking-tight text-[#171a36]">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        </div>
      </div>

      {action}
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

function TypePill({ type }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1.5 text-[10px] font-bold ${type.className}`}
    >
      {type.label}
    </span>
  )
}

function AmountText({ payment, className = "" }) {
  return (
    <span
      className={`font-bold tabular-nums ${
        payment.is_refund ? "text-rose-600" : "text-emerald-700"
      } ${className}`}
    >
      {payment.is_refund ? "−" : "+"}
      {formatCurrency(payment.amount)}
    </span>
  )
}

function ReceiptButton({ payment, shopName, full = false }) {
  const link = getReceiptLink(payment, shopName)
  if (!link) return null

  const name = payment.customers?.name || "customer"

  if (full) {
    return (
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-violet-200 bg-white/90 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
      >
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        Send receipt
      </a>
    )
  }

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Send WhatsApp receipt to ${name}`}
      title="Send WhatsApp receipt"
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-200 bg-white/90 text-slate-700 shadow-sm transition-all hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
    >
      <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  )
}

/* ==================================================
   PAYMENTS PAGE
================================================== */

export default function Payments() {
  const { currentShop } = useShop()
  const shopId = currentShop?.id

  const today = getLocalDateString()

  const [payments, setPayments] = useState([])
  const [customers, setCustomers] = useState([])
  const [customersLoading, setCustomersLoading] = useState(false)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [lastUpdated, setLastUpdated] = useState(null)

  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [modeFilter, setModeFilter] = useState("all")
  const [sort, setSort] = useState("newest")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  // Default view is "This month". The person can switch to Overall or pick dates.
  const [period, setPeriod] = useState({ mode: "month", from: "", to: "" })
  const [periodOpen, setPeriodOpen] = useState(false)
  const periodRef = useRef(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [saving, setSaving] = useState(false)
  const [customerDue, setCustomerDue] = useState(null)

  const hasLoaded = useRef(false)

  // Prevents an older (slower) request from overwriting newer data
  const paymentRequest = useRef(0)

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

  // Reset everything when the shop changes
  useEffect(() => {
    hasLoaded.current = false
    setPayments([])
    setCustomers([])
    setPage(1)
    setSearch("")
    setTypeFilter("all")
    setModeFilter("all")
    setLoadError("")
  }, [shopId])

  /* --------------------------------------------------
     LOAD DATA
  -------------------------------------------------- */

  const loadPayments = useCallback(
    async (showRefresh = false) => {
      const requestId = ++paymentRequest.current

      if (!shopId) {
        setPayments([])
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
              .from("payments")
              .select("*, customers(name, mobile, photo_url), bills(bill_number)")
              .eq("shop_id", shopId),
            "payment_date",
            range
          ).order("id")
        )

        // A newer request has started: ignore this result
        if (requestId !== paymentRequest.current) return

        setPayments(rows)
        setLastUpdated(new Date())
        hasLoaded.current = true
      } catch (error) {
        if (requestId !== paymentRequest.current) return
        console.error("Payments error:", error)
        const message = error?.message || "Unable to load payments."
        setLoadError(message)
        toast.error("Could not load payments", { description: message })
      } finally {
        if (requestId === paymentRequest.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [shopId, range.from, range.to]
  )

  useEffect(() => {
    loadPayments()
  }, [loadPayments])

  const loadCustomers = useCallback(async () => {
    if (!shopId) return

    setCustomersLoading(true)

    try {
      const rows = await fetchAllRows(() =>
        supabase
          .from("customers")
          .select("id, name, mobile, photo_url")
          .eq("shop_id", shopId)
          .eq("is_active", true)
          .order("name")
          .order("id")
      )
      setCustomers(rows)
    } catch (error) {
      toast.error("Could not load customers", { description: error?.message })
    } finally {
      setCustomersLoading(false)
    }
  }, [shopId])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  // Show how much the selected customer still owes while recording a payment
  useEffect(() => {
    if (!dialogOpen || !form.customer_id || !shopId) {
      setCustomerDue(null)
      return
    }

    let ignore = false
    setCustomerDue(null)

    async function loadCustomerDue() {
      try {
        const rows = await fetchAllRows(() =>
          supabase
            .from("bills")
            .select("id, amount_due")
            .eq("shop_id", shopId)
            .eq("customer_id", form.customer_id)
            .gt("amount_due", 0)
            .order("id")
        )
        if (ignore) return
        setCustomerDue({
          amount: rows.reduce((total, bill) => total + num(bill.amount_due), 0),
          count: rows.length,
        })
      } catch {
        if (!ignore) setCustomerDue(null)
      }
    }

    loadCustomerDue()
    return () => {
      ignore = true
    }
  }, [dialogOpen, form.customer_id, shopId])

  /* --------------------------------------------------
     DERIVED DATA
  -------------------------------------------------- */

  const modeOptions = useMemo(() => {
    const set = new Set(PAYMENT_MODES)
    payments.forEach((p) => p.payment_mode && set.add(p.payment_mode))
    return Array.from(set)
  }, [payments])

  const summary = useMemo(() => {
    let gross = 0
    let refunds = 0
    let advances = 0
    let advanceCount = 0
    let refundCount = 0
    let largest = 0

    payments.forEach((payment) => {
      const amount = num(payment.amount)
      if (payment.is_refund) {
        refunds += amount
        refundCount += 1
        return
      }
      gross += amount
      if (amount > largest) largest = amount
      if (payment.is_advance) {
        advances += amount
        advanceCount += 1
      }
    })

    const receivedCount = payments.length - refundCount
    const modeMap = new Map()
    const customerMap = new Map()

    payments.forEach((payment) => {
      if (payment.is_refund) return
      const amount = num(payment.amount)

      const mode = payment.payment_mode || "Other"
      const m = modeMap.get(mode) || { mode, amount: 0, count: 0 }
      m.amount += amount
      m.count += 1
      modeMap.set(mode, m)

      const key = payment.customer_id || "unknown"
      const c = customerMap.get(key) || {
        key,
        name: payment.customers?.name || "Unknown customer",
        photoUrl: payment.customers?.photo_url || null,
        amount: 0,
        count: 0,
      }
      c.amount += amount
      c.count += 1
      customerMap.set(key, c)
    })

    return {
      gross,
      refunds,
      net: Math.max(0, gross - refunds),
      advances,
      advanceCount,
      refundCount,
      receivedCount,
      count: payments.length,
      largest,
      average: receivedCount > 0 ? gross / receivedCount : 0,
      advanceShare: gross > 0 ? Math.round((advances / gross) * 100) : 0,
      modes: Array.from(modeMap.values()).sort((a, b) => b.amount - a.amount),
      topPayers: Array.from(customerMap.values())
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5),
    }
  }, [payments])

  const typeCounts = useMemo(() => {
    const counts = { all: payments.length, regular: 0, advance: 0, refund: 0 }
    payments.forEach((p) => {
      counts[getPaymentType(p).key] += 1
    })
    return counts
  }, [payments])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()

    const rows = payments.filter((payment) => {
      const typeKey = getPaymentType(payment).key

      const typeMatch = typeFilter === "all" || typeFilter === typeKey
      const modeMatch = modeFilter === "all" || payment.payment_mode === modeFilter

      const searchMatch =
        !query ||
        [
          payment.customers?.name,
          payment.customers?.mobile,
          payment.bills?.bill_number,
          payment.payment_mode,
          payment.amount,
          payment.payment_date,
          payment.payment_date ? formatDate(payment.payment_date) : "",
          payment.notes,
          typeKey === "regular" ? "payment" : typeKey,
        ].some((value) => String(value ?? "").toLowerCase().includes(query))

      return typeMatch && modeMatch && searchMatch
    })

    const byDate = (a, b) => {
      const d = String(a.payment_date || "").localeCompare(String(b.payment_date || ""))
      if (d !== 0) return d
      return String(a.created_at || "").localeCompare(String(b.created_at || ""))
    }

    return rows.sort((a, b) => {
      if (sort === "oldest") return byDate(a, b)
      if (sort === "amount_high") return num(b.amount) - num(a.amount)
      if (sort === "amount_low") return num(a.amount) - num(b.amount)
      return byDate(b, a)
    })
  }, [payments, typeFilter, modeFilter, search, sort])

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

  const hasActiveFilters = typeFilter !== "all" || modeFilter !== "all" || search.trim() !== ""

  const shortLabel = {
    today: "Today",
    yesterday: "Yesterday",
    week: "Last 7 days",
    month: "This month",
    overall: "Overall",
    custom: "Selected dates",
  }[period.mode]

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

  const clearFilters = () => {
    setTypeFilter("all")
    setModeFilter("all")
    setSearch("")
    setPage(1)
  }

  // Download the currently filtered list as a CSV (opens in Excel / Sheets)
  const exportCsv = () => {
    if (filtered.length === 0) return

    const header = [
      "Date",
      "Customer",
      "Mobile",
      "Type",
      "Payment mode",
      "Bill no.",
      "Notes",
      "Amount",
    ]

    const lines = filtered.map((payment) =>
      [
        payment.payment_date ? formatDate(payment.payment_date) : "",
        payment.customers?.name || "Unknown customer",
        payment.customers?.mobile || "",
        getPaymentType(payment).label,
        payment.payment_mode || "",
        payment.bills?.bill_number || "",
        payment.notes || "",
        (payment.is_refund ? -1 : 1) * num(payment.amount),
      ]
        .map(csvCell)
        .join(",")
    )

    const csv = "\uFEFF" + [header.map(csvCell).join(","), ...lines].join("\r\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `payments-${today}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)

    toast.success("Payments exported", {
      description: `${filtered.length} ${filtered.length === 1 ? "record" : "records"} saved as CSV`,
    })
  }

  const handleRefresh = () => {
    loadPayments(true)
    loadCustomers()
  }

  /* --------------------------------------------------
     RECORD PAYMENT
  -------------------------------------------------- */

  function updateForm(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function openDialog() {
    if (customers.length === 0 && !customersLoading) loadCustomers()
    setForm(initialForm())
    setDialogOpen(true)
  }

  function closeDialog(open) {
    if (saving) return
    setDialogOpen(open)
    if (!open) setForm(initialForm())
  }

  async function handleSave(event) {
    event.preventDefault()

    if (!shopId) {
      toast.error("Please select a shop first")
      return
    }

    if (!form.customer_id) {
      toast.error("Please select a customer")
      return
    }

    const amount = Number(form.amount)

    if (!form.amount || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Please enter a valid amount")
      return
    }

    if (!form.payment_date) {
      toast.error("Please select a payment date")
      return
    }

    setSaving(true)

    try {
      const { data: payment, error } = await supabase
        .from("payments")
        .insert({
          shop_id: shopId,
          customer_id: form.customer_id,
          amount,
          payment_mode: form.payment_mode,
          payment_date: form.payment_date,
          is_advance: form.is_advance,
          notes: form.notes.trim() || null,
        })
        .select()
        .single()

      if (error) throw error

      if (form.is_advance) {
        const { error: advanceError } = await supabase.from("customer_advances").insert({
          shop_id: shopId,
          customer_id: form.customer_id,
          amount,
          remaining_amount: amount,
          payment_id: payment.id,
        })

        if (advanceError) {
          toast.error("Payment saved, but the advance could not be created", {
            description: advanceError.message,
          })
          setDialogOpen(false)
          setForm(initialForm())
          await loadPayments(true)
          return
        }
      }

      toast.success(form.is_advance ? "Advance recorded" : "Payment recorded", {
        description: `${formatCurrency(amount)} received via ${form.payment_mode}`,
      })

      setDialogOpen(false)
      setForm(initialForm())
      await loadPayments(true)
    } catch (error) {
      toast.error(error?.message || "Failed to record payment")
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
            Select or create a workspace to view and record payments.
          </p>
          <Button asChild className="mt-5 h-11 gap-2 rounded-xl border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-violet-50">
            <Link to="/settings">Open workspace settings</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (loading) return <PaymentsSkeleton />

  const labelSuffix = ` (${shortLabel})`
  const modeTotal = summary.modes.reduce((total, m) => total + m.amount, 0)
  const enteredAmount = Number(form.amount)

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
            className="flex items-center gap-2 text-xs font-medium text-slate-500"
          >
            <span>{currentShop.name || "Workspace"}</span>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            <span>Payments</span>
          </nav>

          <h1 className="mt-1 text-[29px] font-bold tracking-tight text-[#171a39] sm:text-[32px]">
            Payments
          </h1>

          <p className="mt-0.5 text-sm text-slate-600">
            Showing records for{" "}
            <strong className="font-semibold text-slate-800">{periodLabel}</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div ref={periodRef} className="relative w-full sm:w-auto">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={periodOpen}
              onClick={() => setPeriodOpen((open) => !open)}
              className="flex h-11 w-full max-w-full items-center gap-2 rounded-xl border-violet-200 border bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:w-auto sm:max-w-[270px]"
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
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                          active
                            ? "bg-emerald-50 font-semibold text-emerald-800"
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
                      Shows payments and refunds dated in this period.
                    </p>

                    <Button
                      type="button"
                      onClick={() => setPeriodOpen(false)}
                      className="mt-3 w-full h-11 gap-2 rounded-xl border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-violet-50"
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
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Refresh payments"
            title="Refresh payments"
            className="h-11 gap-2 rounded-xl border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-violet-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>

          <Button
            type="button"
            onClick={openDialog}
            disabled={customersLoading}
            className="h-11 gap-2 rounded-xl border border-violet-200 bg-white/90 px-5 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-violet-50 disabled:opacity-50"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            Record payment
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
              Could not load your latest payments. Check your connection and try again.
              <span className="ml-1 text-xs text-rose-500">({loadError})</span>
            </span>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => loadPayments()}
            className="h-9 shrink-0 gap-1.5 rounded-xl border-violet-200 bg-white/90 px-3 text-xs font-medium text-slate-700 shadow-sm hover:bg-violet-50"
          >
            Try again
          </Button>
        </div>
      )}

      {/* SUMMARY CARDS */}

      <section
        aria-label="Payments overview"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4"
      >
        <SummaryCard
          label={`Net received${labelSuffix}`}
          value={formatCurrency(summary.net)}
          detail={
            summary.refunds > 0
              ? `After ${formatCurrency(summary.refunds)} refunds`
              : `${summary.receivedCount} ${summary.receivedCount === 1 ? "payment" : "payments"} recorded`
          }
          icon={CreditCard}
          tone="green"
        />

        <SummaryCard
          label={`Advance payments${labelSuffix}`}
          value={formatCurrency(summary.advances)}
          detail={`${summary.advanceCount} ${summary.advanceCount === 1 ? "advance" : "advances"} received`}
          icon={Wallet}
          tone="blue"
        />

        <SummaryCard
          label={`Refunds${labelSuffix}`}
          value={formatCurrency(summary.refunds)}
          detail={`${summary.refundCount} ${summary.refundCount === 1 ? "refund" : "refunds"} paid back`}
          icon={ArrowDownLeft}
          tone="pink"
        />

        <SummaryCard
          label={`Transactions${labelSuffix}`}
          value={summary.count.toLocaleString("en-IN")}
          detail={
            summary.average > 0
              ? `Average ${formatCurrency(summary.average)} per payment`
              : "No payments in this period"
          }
          icon={CalendarDays}
          tone="amber"
        />
      </section>

      {/* MAIN CONTENT */}

      <section className="grid grid-cols-1 items-start gap-4 2xl:grid-cols-[1.65fr_1fr]">
        <div className="min-w-0 space-y-4">
          {/* PAYMENT HISTORY */}

          <Card className="overflow-hidden rounded-[20px] border border-white/80 bg-white/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)] backdrop-blur-sm">
            <SectionHeader
              icon={Receipt}
              title="Payment history"
              description={
                hasActiveFilters
                  ? `${filtered.length} of ${payments.length} records match`
                  : `${payments.length} ${payments.length === 1 ? "record" : "records"} · ${shortLabel}`
              }
              action={
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={exportCsv}
                    disabled={filtered.length === 0}
                    className="h-9 gap-1.5 rounded-xl border-violet-200 bg-white/90 px-3 text-xs font-medium text-slate-700 shadow-sm hover:bg-violet-50 disabled:opacity-50"
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
                      className="shrink-0 h-9 gap-1.5 rounded-xl border-violet-200 bg-white/90 px-3 text-xs font-medium text-slate-700 shadow-sm hover:bg-violet-50"
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
              <div className="flex flex-col gap-2.5 lg:flex-row">
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
                    aria-label="Search payments"
                    placeholder="Search customer, mobile, bill no. or notes"
                    className="h-11 rounded-xl border-violet-200 bg-white pl-9 pr-9 shadow-sm focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch("")
                        setPage(1)
                      }}
                      aria-label="Clear search"
                      className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5 lg:flex">
                  <Select
                    value={modeFilter}
                    onValueChange={(value) => {
                      setModeFilter(value)
                      setPage(1)
                    }}
                  >
                    <SelectTrigger
                      aria-label="Filter by payment mode"
                      className="h-11 w-full rounded-xl border-violet-200 bg-white shadow-sm focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20 lg:w-[160px]"
                    >
                      <SelectValue placeholder="All modes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All modes</SelectItem>
                      {modeOptions.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {mode}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={sort}
                    onValueChange={(value) => {
                      setSort(value)
                      setPage(1)
                    }}
                  >
                    <SelectTrigger
                      aria-label="Sort payments"
                      className="h-11 w-full rounded-xl border-violet-200 bg-white shadow-sm focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20 lg:w-[190px]"
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
              </div>

              <div
                className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
                role="tablist"
                aria-label="Filter by payment type"
              >
                {TYPE_FILTERS.map((item) => {
                  const active = typeFilter === item.value
                  return (
                    <button
                      key={item.value}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        setTypeFilter(item.value)
                        setPage(1)
                      }}
                      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                        active
                          ? "border-emerald-700 bg-emerald-700 text-white shadow-sm hover:bg-emerald-800"
                          : "border-violet-200 bg-white/90 text-slate-700 hover:border-emerald-200 hover:bg-emerald-50"
                      }`}
                    >
                      {item.label}
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                          active ? "bg-white/20 text-white" : "bg-violet-50 text-violet-700"
                        }`}
                      >
                        {typeCounts[item.value] ?? 0}
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
                  {payments.length === 0 ? (
                    <Receipt className="h-7 w-7" aria-hidden="true" />
                  ) : (
                    <Search className="h-7 w-7" aria-hidden="true" />
                  )}
                </div>
                <h3 className="mt-4 text-sm font-bold text-slate-900">
                  {payments.length === 0 ? "No payments in this period" : "No matching payments"}
                </h3>
                <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
                  {payments.length === 0
                    ? "Try another date range, or record a new payment."
                    : "Try another filter or change your search."}
                </p>
                {payments.length === 0 ? (
                  <Button
                    type="button"
                    onClick={openDialog}
                    className="mt-4 h-11 gap-2 rounded-xl border border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-violet-50"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Record payment
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={clearFilters}
                    className="mt-4 h-11 gap-2 rounded-xl border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-violet-50"
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div
                  className={`hidden overflow-x-auto px-3 pt-3 transition-opacity sm:px-4 md:block ${
                    refreshing ? "opacity-60" : "opacity-100"
                  }`}
                >
                  <table className="w-full min-w-[860px] text-left">
                    <caption className="sr-only">Payment history</caption>
                    <thead>
                      <tr className="bg-[#f5f3fc] text-[11px] font-semibold text-slate-600">
                        <th scope="col" className="rounded-l-xl px-3 py-3">Customer</th>
                        <th scope="col" className="px-3 py-3">Date</th>
                        <th scope="col" className="px-3 py-3">Mode</th>
                        <th scope="col" className="px-3 py-3">Bill no.</th>
                        <th scope="col" className="px-3 py-3">Type</th>
                        <th scope="col" className="px-3 py-3 text-right">Amount</th>
                        <th scope="col" className="rounded-r-xl px-3 py-3 text-center">Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {pageRows.map((payment, index) => {
                        const name = payment.customers?.name || "Unknown customer"
                        const type = getPaymentType(payment)

                        return (
                          <tr
                            key={payment.id}
                            className="border-b border-[#eeecf5] transition-colors last:border-0 hover:bg-[#f9f8ff]"
                          >
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2.5">
                                <CustomerAvatar
                                  name={name}
                                  photoUrl={payment.customers?.photo_url}
                                  className="h-9 w-9"
                                />
                                <div className="min-w-0">
                                  <p className="max-w-[170px] truncate text-[12px] font-bold text-slate-800">
                                    {name}
                                  </p>
                                  {payment.customers?.mobile && (
                                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                                      <Phone className="h-3 w-3" aria-hidden="true" />
                                      {payment.customers.mobile}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">
                              {payment.payment_date ? formatDate(payment.payment_date) : "—"}
                            </td>

                            <td className="whitespace-nowrap px-3 py-3 text-xs font-medium text-slate-700">
                              {payment.payment_mode || "—"}
                            </td>

                            <td className="whitespace-nowrap px-3 py-3 text-xs font-medium text-slate-600">
                              {payment.bill_id && payment.bills?.bill_number ? (
                                <Link
                                  to={`/bills/${payment.bill_id}`}
                                  className="hover:text-emerald-700 hover:underline"
                                >
                                  {payment.bills.bill_number}
                                </Link>
                              ) : (
                                payment.bills?.bill_number || "—"
                              )}
                            </td>

                            <td className="px-3 py-3">
                              <div className="flex flex-col items-start gap-1">
                                <TypePill type={type} />
                                {payment.notes && (
                                  <span
                                    title={payment.notes}
                                    className="max-w-[140px] truncate text-[11px] text-slate-500"
                                  >
                                    {payment.notes}
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="whitespace-nowrap px-3 py-3 text-right text-xs">
                              <AmountText payment={payment} />
                            </td>

                            <td className="px-3 py-3">
                              <div className="flex items-center justify-center gap-1.5">
                                {payment.bill_id && (
                                  <Link
                                    to={`/bills/${payment.bill_id}`}
                                    aria-label={`View bill ${payment.bills?.bill_number || ""}`}
                                    title="View bill"
                                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-200 bg-white/90 text-slate-700 shadow-sm transition-all hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                                  >
                                    <Eye className="h-4 w-4" aria-hidden="true" />
                                  </Link>
                                )}
                                <ReceiptButton payment={payment} shopName={currentShop.name} />
                                {!payment.bill_id && !getReceiptLink(payment, currentShop.name) && (
                                  <span className="text-xs text-slate-300" aria-hidden="true">
                                    —
                                  </span>
                                )}
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
                  {pageRows.map((payment, index) => {
                    const name = payment.customers?.name || "Unknown customer"
                    const type = getPaymentType(payment)
                    const hasReceipt = !!getReceiptLink(payment, currentShop.name)

                    return (
                      <div key={payment.id} className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <CustomerAvatar
                              name={name}
                              photoUrl={payment.customers?.photo_url}
                              className="h-10 w-10"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-slate-800">{name}</p>
                              <p className="mt-0.5 truncate text-xs text-slate-500">
                                {payment.payment_date ? formatDate(payment.payment_date) : "—"}
                                {payment.payment_mode ? ` · ${payment.payment_mode}` : ""}
                              </p>
                            </div>
                          </div>
                          <AmountText payment={payment} className="shrink-0 text-sm" />
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <TypePill type={type} />
                          {payment.bills?.bill_number && (
                            <span className="text-xs font-medium text-slate-600">
                              Bill {payment.bills.bill_number}
                            </span>
                          )}
                          {payment.notes && (
                            <span className="min-w-0 truncate text-xs text-slate-500">
                              {payment.notes}
                            </span>
                          )}
                        </div>

                        {(payment.bill_id || hasReceipt) && (
                          <div className="flex gap-2">
                            {payment.bill_id && (
                              <Button
                                asChild
                                variant="outline"
                                className={`h-10 rounded-xl border-violet-200 bg-white/90 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-violet-50 ${
                                  hasReceipt ? "w-10 shrink-0 p-0" : "flex-1 gap-1.5"
                                }`}
                              >
                                <Link
                                  to={`/bills/${payment.bill_id}`}
                                  aria-label={`View bill ${payment.bills?.bill_number || ""}`}
                                >
                                  <Eye className="h-4 w-4" aria-hidden="true" />
                                  {!hasReceipt && "View bill"}
                                </Link>
                              </Button>
                            )}
                            <ReceiptButton payment={payment} shopName={currentShop.name} full />
                          </div>
                        )}
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
                      records
                    </p>

                    <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                      Rows per page
                      <select
                        value={pageSize}
                        onChange={(event) => {
                          setPageSize(Number(event.target.value))
                          setPage(1)
                        }}
                        className="h-9 rounded-xl border border-violet-200 bg-white/90 px-2 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                      >
                        {PAGE_SIZES.map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <nav
                    aria-label="Payment pages"
                    className="flex flex-wrap items-center justify-end gap-1.5"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Previous page"
                      disabled={currentPage <= 1}
                      onClick={() => setPage(Math.max(1, currentPage - 1))}
                      className="h-9 w-9 rounded-xl border-violet-200 bg-white/90 p-0 text-slate-700 shadow-sm transition-all hover:bg-violet-50 disabled:opacity-40"
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
                          className={`h-9 min-w-9 rounded-xl px-0 text-xs font-medium shadow-sm transition-all ${
                            currentPage === item
                              ? "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
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
                      className="h-9 w-9 rounded-xl border-violet-200 bg-white/90 p-0 text-slate-700 shadow-sm transition-all hover:bg-violet-50 disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </nav>
                </div>
              </>
            )}
          </Card>
        </div>

        {/* RIGHT COLUMN */}

        <div className="space-y-4">
          {/* PAYMENT MODES */}

          <Card className="overflow-hidden rounded-[20px] border border-white/80 bg-white/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)]">
            <SectionHeader
              icon={CreditCard}
              title="Payment modes"
              description={`How customers paid · ${shortLabel}`}
            />

            <CardContent className="space-y-4 p-4 sm:p-5">
              {summary.modes.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-500">
                  No payments received in this period.
                </p>
              ) : (
                summary.modes.map((item, index) => {
                  const pct = modeTotal > 0 ? Math.round((item.amount / modeTotal) * 100) : 0
                  return (
                    <div key={item.mode}>
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="min-w-0 truncate font-medium text-slate-700">
                          {item.mode}
                          <span className="ml-1.5 text-slate-400">({item.count})</span>
                        </span>
                        <span className="shrink-0 font-bold tabular-nums text-slate-900">
                          {formatCurrency(item.amount)}
                          <span className="ml-1.5 font-semibold text-slate-400">{pct}%</span>
                        </span>
                      </div>
                      <div
                        className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"
                        role="progressbar"
                        aria-label={`${item.mode} share of payments`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={pct}
                      >
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            MODE_BAR_COLORS[index % MODE_BAR_COLORS.length]
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>

          {/* INSIGHTS */}

          <Card className="overflow-hidden rounded-[20px] border border-white/80 bg-white/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)]">
            <SectionHeader
              icon={TrendingUp}
              title="Collection insights"
              description={`Quick numbers · ${shortLabel}`}
            />

            <CardContent className="px-5 py-1">
              <SummaryRow
                label="Gross received"
                value={formatCurrency(summary.gross)}
                icon={Wallet}
                tone="green"
              />
              <SummaryRow
                label="Refunded to customers"
                value={formatCurrency(summary.refunds)}
                icon={ArrowDownLeft}
                tone="pink"
              />
              <SummaryRow
                label="Average payment"
                value={formatCurrency(summary.average)}
                icon={Receipt}
                tone="blue"
              />
              <SummaryRow
                label="Largest payment"
                value={formatCurrency(summary.largest)}
                icon={TrendingUp}
                tone="purple"
              />
              <SummaryRow
                label="Advance share of receipts"
                value={`${summary.advanceShare}%`}
                icon={CreditCard}
                tone="amber"
              />
            </CardContent>
          </Card>

          {/* TOP PAYERS */}

          <Card className="overflow-hidden rounded-[20px] border border-white/80 bg-white/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)]">
            <SectionHeader
              icon={Users}
              title="Top payers"
              description="Customers who paid you the most."
            />

            {summary.topPayers.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-slate-500">
                No payments received in this period.
              </div>
            ) : (
              <ul className="divide-y divide-[#eeecf5]">
                {summary.topPayers.map((customer, index) => (
                  <li key={customer.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setSearch(customer.key === "unknown" ? "" : customer.name)
                        setTypeFilter("all")
                        setModeFilter("all")
                        setPage(1)
                      }}
                      title="Show this customer's payments"
                      className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-all hover:border-l-4 hover:border-emerald-500 hover:bg-emerald-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <CustomerAvatar
                          name={customer.name}
                          photoUrl={customer.photoUrl}
                          className="h-11 w-11"
                        />

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-bold text-slate-800">
                              {customer.name}
                            </p>
                            {index === 0 && (
                              <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                Top payer
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {customer.count} {customer.count === 1 ? "payment" : "payments"}
                          </p>
                        </div>
                      </div>

                      <p className="shrink-0 text-right text-sm font-bold tabular-nums text-emerald-700">
                        {formatCurrency(customer.amount)}
                      </p>
                    </button>
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

      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[20px] border-white/80 bg-white p-0 sm:max-w-[480px]">
          <DialogHeader className="space-y-1 border-b border-[#eeecf5] px-6 pb-5 pt-6">
            <DialogTitle className="text-xl font-bold tracking-tight text-[#171a36]">
              Record payment
            </DialogTitle>
            <DialogDescription>Enter the customer payment details below.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-5 px-6 py-5">
            {/* Customer */}
            <div className="space-y-2">
              <Label>
                Customer <span className="text-rose-500">*</span>
              </Label>

              <Select
                value={form.customer_id}
                onValueChange={(value) => updateForm("customer_id", value)}
                disabled={customersLoading || saving}
              >
                <SelectTrigger className="h-11 rounded-xl border-violet-200 bg-white shadow-sm focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20">
                  <SelectValue
                    placeholder={customersLoading ? "Loading customers..." : "Select customer"}
                  />
                </SelectTrigger>

                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      <div className="flex items-center gap-2.5">
                        <CustomerAvatar
                          name={customer.name}
                          photoUrl={customer.photo_url}
                          className="h-8 w-8"
                        />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate">{customer.name}</span>
                          {customer.mobile && (
                            <span className="text-xs text-slate-400">{customer.mobile}</span>
                          )}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {!customersLoading && customers.length === 0 && (
                <p className="text-xs text-rose-600">
                  No active customers found. Add a customer first.
                </p>
              )}

              {customerDue && customerDue.amount > 0 && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50/70 px-3.5 py-2.5">
                  <p className="text-xs text-amber-800">
                    Owes{" "}
                    <span className="font-bold tabular-nums">
                      {formatCurrency(customerDue.amount)}
                    </span>{" "}
                    on {customerDue.count} {customerDue.count === 1 ? "bill" : "bills"}
                  </p>
                  <button
                    type="button"
                    onClick={() => updateForm("amount", String(customerDue.amount))}
                    className="shrink-0 rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800 transition-all hover:border-amber-300 hover:bg-amber-50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                  >
                    Use this amount
                  </button>
                </div>
              )}
            </div>

            {/* Amount and mode */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="payment-amount">
                  Amount <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="payment-amount"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  placeholder="Enter amount"
                  value={form.amount}
                  onChange={(e) => updateForm("amount", e.target.value)}
                  className="h-11 rounded-xl border-violet-200 bg-white shadow-sm focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20"
                  required
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label>Payment mode</Label>
                <Select
                  value={form.payment_mode}
                  onValueChange={(value) => updateForm("payment_mode", value)}
                  disabled={saving}
                >
                  <SelectTrigger className="h-11 rounded-xl border-violet-200 bg-white shadow-sm focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20">
                    <SelectValue />
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
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label htmlFor="payment-date">
                Payment date <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="payment-date"
                type="date"
                value={form.payment_date}
                max={today}
                onChange={(e) => updateForm("payment_date", e.target.value)}
                className="h-11 rounded-xl border-violet-200 bg-white shadow-sm focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20"
                required
                disabled={saving}
              />
            </div>

            {/* Advance */}
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${
                form.is_advance
                  ? "border-emerald-200 bg-emerald-50/60"
                  : "border-violet-100 bg-[#f9f8ff] hover:bg-violet-50"
              }`}
            >
              <input
                type="checkbox"
                checked={form.is_advance}
                onChange={(e) => updateForm("is_advance", e.target.checked)}
                disabled={saving}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-emerald-600"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-800">Advance payment</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  Save this amount as customer advance to adjust in future bills.
                </span>
              </span>
            </label>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="payment-notes">Notes</Label>
              <Textarea
                id="payment-notes"
                value={form.notes}
                onChange={(e) => updateForm("notes", e.target.value)}
                placeholder="Add payment details (optional)"
                rows={3}
                className="resize-none rounded-xl border-violet-200 bg-white shadow-sm focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20"
                disabled={saving}
              />
            </div>

            {/* Amount preview */}
            {Number.isFinite(enteredAmount) && enteredAmount > 0 && (
              <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
                <span className="text-xs font-medium text-emerald-800">
                  {form.is_advance ? "Advance to record" : "Amount to record"}
                </span>
                <span className="text-lg font-bold tabular-nums text-slate-900">
                  {formatCurrency(enteredAmount)}
                </span>
              </div>
            )}

            <DialogFooter className="-mx-6 flex-col-reverse gap-2 border-t border-[#eeecf5] px-6 pb-6 pt-4 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => closeDialog(false)}
                disabled={saving}
                className="h-11 gap-2 rounded-xl border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-violet-50 transition-all"
              >
                Cancel
              </Button>

              <Button
                type="submit"
                disabled={saving || customersLoading || customers.length === 0}
                className="h-11 rounded-xl border border-violet-200 bg-white/90 px-6 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-violet-50 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                    Save payment
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