import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatDate, PAYMENT_MODES } from "@/lib/utils"
import { downloadPaymentsPDF } from "@/lib/paymentsPdf"

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
  Trash2,
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
  payment_mode: "Cash",
  payment_date: getLocalDateString(),
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
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
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
          <p className="line-clamp-2 min-h-[2.25rem] text-[12px] font-medium leading-[1.15rem] text-slate-600 sm:text-[13px]">
            {label}
          </p>
          <h3
            className="mt-1.5 w-full whitespace-nowrap text-[clamp(1rem,1.55vw,1.4rem)] font-bold leading-tight tracking-[-0.035em] text-[#151934] tabular-nums"
            title={String(value)}
          >
            {value}
          </h3>
          <p className={`mt-1.5 text-xs font-semibold leading-snug ${style.accent}`}>{detail}</p>
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
  const [deletingPaymentId, setDeletingPaymentId] = useState(null)
  const [paymentToDelete, setPaymentToDelete] = useState(null)

  // Bill-wise payment allocation
  const [pendingBills, setPendingBills] = useState([])
  const [billsLoading, setBillsLoading] = useState(false)
  const [billLoadError, setBillLoadError] = useState("")
  const [billAllocations, setBillAllocations] = useState({})
  const [advanceAmount, setAdvanceAmount] = useState("")
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [preparedPayment, setPreparedPayment] = useState(null)

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

        // Load bill-wise splits separately. A multi-bill payment has one
        // payments row, while its individual bill amounts live in payment_allocations.
        const paymentIds = rows.map((payment) => payment.id).filter(Boolean)
        let allocationRows = []
        if (paymentIds.length) {
          allocationRows = await fetchAllRows(() =>
            supabase
              .from("payment_allocations")
              .select("payment_id, bill_id, amount")
              .eq("shop_id", shopId)
              .in("payment_id", paymentIds)
          )
        }

        const billIds = [...new Set(allocationRows.map((item) => item.bill_id).filter(Boolean))]
        let allocationBills = []
        if (billIds.length) {
          allocationBills = await fetchAllRows(() =>
            supabase
              .from("bills")
              .select("id, bill_number")
              .eq("shop_id", shopId)
              .in("id", billIds)
          )
        }

        const billMap = new Map(allocationBills.map((bill) => [bill.id, bill]))
        const allocationsByPayment = new Map()
        allocationRows.forEach((allocation) => {
          const list = allocationsByPayment.get(allocation.payment_id) || []
          list.push({
            ...allocation,
            bills: billMap.get(allocation.bill_id) || null,
          })
          allocationsByPayment.set(allocation.payment_id, list)
        })

        const enrichedRows = rows.map((payment) => ({
          ...payment,
          allocations: allocationsByPayment.get(payment.id) || [],
        }))

        // A newer request has started: ignore this result
        if (requestId !== paymentRequest.current) return

        setPayments(enrichedRows)
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

  // Load every pending bill for the selected customer.
  useEffect(() => {
    if (!dialogOpen || !form.customer_id || !shopId) {
      setPendingBills([])
      setBillAllocations({})
      setBillLoadError("")
      setBillsLoading(false)
      return
    }

    let ignore = false
    setBillsLoading(true)
    setBillLoadError("")
    setPendingBills([])
    setBillAllocations({})

    async function loadPendingBills() {
      try {
        const rows = await fetchAllRows(() =>
          supabase
            .from("bills")
            .select(
              "id, bill_number, bill_date, grand_total, amount_paid, amount_due, payment_status, due_date"
            )
            .eq("shop_id", shopId)
            .eq("customer_id", form.customer_id)
            .gt("amount_due", 0)
            .order("bill_date", { ascending: true })
            .order("id", { ascending: true })
        )

        if (ignore) return
        setPendingBills(rows)
        setBillAllocations(
          Object.fromEntries(rows.map((bill) => [bill.id, ""]))
        )
      } catch (error) {
        if (ignore) return
        setBillLoadError(error?.message || "Could not load pending bills.")
      } finally {
        if (!ignore) setBillsLoading(false)
      }
    }

    loadPendingBills()
    return () => {
      ignore = true
    }
  }, [dialogOpen, form.customer_id, shopId])

  /* --------------------------------------------------
     DERIVED DATA
  -------------------------------------------------- */

  const billAllocatedTotal = useMemo(
    () =>
      Number(
        pendingBills
          .reduce(
            (total, bill) =>
              total + Number(num(billAllocations[bill.id]).toFixed(2)),
            0
          )
          .toFixed(2)
      ),
    [pendingBills, billAllocations]
  )

  const advanceValue = num(advanceAmount)
  const enteredAmount = Number((billAllocatedTotal + advanceValue).toFixed(2))
  const selectedAllocations = useMemo(
    () =>
      pendingBills
        .map((bill) => ({
          bill_id: bill.id,
          bill_number: bill.bill_number,
          amount: Number(num(billAllocations[bill.id]).toFixed(2)),
          amount_due: num(bill.amount_due),
        }))
        .filter((item) => item.amount > 0),
    [pendingBills, billAllocations]
  )

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
      net: gross - refunds,
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
          ...(payment.allocations || []).map((allocation) => allocation.bills?.bill_number),
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
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)

    toast.success("Payments exported", {
      description: `${filtered.length} ${filtered.length === 1 ? "record" : "records"} saved as CSV`,
    })
  }

  const handleRefresh = () => {
    loadPayments(true)
    loadCustomers()
  }

  /* --------------------------------------------------
     RECORD PAYMENT WITH BILL-WISE ALLOCATION
  -------------------------------------------------- */

  function updateForm(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function updateBillAllocation(billId, value) {
    setBillAllocations((current) => ({ ...current, [billId]: value }))
  }

  function openDialog() {
    if (customers.length === 0 && !customersLoading) loadCustomers()
    setForm(initialForm())
    setPendingBills([])
    setBillAllocations({})
    setAdvanceAmount("")
    setBillLoadError("")
    setPreparedPayment(null)
    setConfirmationOpen(false)
    setDialogOpen(true)
  }

  function closeDialog(open) {
    if (saving) return
    setDialogOpen(open)
    if (!open) {
      setForm(initialForm())
      setPendingBills([])
      setBillAllocations({})
      setAdvanceAmount("")
      setBillLoadError("")
    }
  }

  function handleSave(event) {
    event.preventDefault()

    if (!shopId) {
      toast.error("Please select a shop first")
      return
    }

    if (!form.customer_id) {
      toast.error("Please select a customer")
      return
    }

    if (billsLoading) {
      toast.error("Please wait while pending bills are loading")
      return
    }

    if (billLoadError) {
      toast.error("Pending bills could not be loaded", {
        description: billLoadError,
      })
      return
    }

    if (!form.payment_date) {
      toast.error("Please select a payment date")
      return
    }

    if (!form.payment_mode) {
      toast.error("Please select a payment mode")
      return
    }

    for (const bill of pendingBills) {
      const value = Number(billAllocations[bill.id] || 0)
      if (!Number.isFinite(value) || value < 0) {
        toast.error(`Enter a valid amount for bill ${bill.bill_number || ""}`)
        return
      }
      if (Math.abs(value * 100 - Math.round(value * 100)) > 0.001) {
        toast.error(`Use a maximum of 2 decimal places for bill ${bill.bill_number}`)
        return
      }
      if (value > num(bill.amount_due) + 0.009) {
        toast.error(`Allocation exceeds pending due for bill ${bill.bill_number}`)
        return
      }
    }

    const advance = Number(advanceAmount || 0)
    if (!Number.isFinite(advance) || advance < 0) {
      toast.error("Enter a valid advance amount")
      return
    }
    if (Math.abs(advance * 100 - Math.round(advance * 100)) > 0.001) {
      toast.error("Use a maximum of 2 decimal places for the advance amount")
      return
    }

    const allocations = selectedAllocations.map(({ bill_id, amount }) => ({
      bill_id,
      amount,
    }))
    const billTotal = Number(
      allocations.reduce((total, item) => total + item.amount, 0).toFixed(2)
    )
    const total = Number((billTotal + advance).toFixed(2))

    if (total <= 0) {
      toast.error("Enter an amount against at least one bill or as an advance")
      return
    }

    setPreparedPayment({
      shop_id: shopId,
      customer_id: form.customer_id,
      customer_name: customers.find((customer) => customer.id === form.customer_id)?.name || "Customer",
      amount: total,
      payment_mode: form.payment_mode,
      payment_date: form.payment_date,
      notes: form.notes.trim() || null,
      allocations,
      allocation_details: selectedAllocations,
      advance_amount: Number(advance.toFixed(2)),
    })
    setConfirmationOpen(true)
  }

  async function handleConfirmPayment() {
    if (!preparedPayment || saving) return

    setSaving(true)
    try {
      const { error } = await supabase.rpc(
        "record_payment_with_allocations",
        {
          p_shop_id: preparedPayment.shop_id,
          p_customer_id: preparedPayment.customer_id,
          p_amount: preparedPayment.amount,
          p_payment_mode: preparedPayment.payment_mode,
          p_payment_date: preparedPayment.payment_date,
          p_notes: preparedPayment.notes,
          p_allocations: preparedPayment.allocations,
          p_advance_amount: preparedPayment.advance_amount,
        }
      )

      if (error) throw error

      toast.success("Payment recorded successfully", {
        description: `${formatCurrency(preparedPayment.amount)} received via ${preparedPayment.payment_mode}`,
      })

      setConfirmationOpen(false)
      setPreparedPayment(null)
      setDialogOpen(false)
      setForm(initialForm())
      setPendingBills([])
      setBillAllocations({})
      setAdvanceAmount("")
      await loadPayments(true)
    } catch (error) {
      console.error("Record payment error:", error)
      toast.error("Could not record payment", {
        description: error?.message || "Please try again.",
      })
    } finally {
      setSaving(false)
    }
  }

  function returnToPaymentForm() {
    if (saving) return
    setConfirmationOpen(false)
    setPreparedPayment(null)
  }

  /* --------------------------------------------------
     DELETE PAYMENT AND RESTORE BILL BALANCES
  -------------------------------------------------- */

  async function handleDeletePayment() {
    if (!paymentToDelete?.id || !shopId || deletingPaymentId) return

    const payment = paymentToDelete
    setDeletingPaymentId(payment.id)

    try {
      if (payment.is_refund) {
        throw new Error(
          "Refund deletion is not supported by this payment reversal function."
        )
      }

      // Prevent deleting an advance that has already been adjusted in bills.
      const { data: advances, error: advanceCheckError } = await supabase
        .from("customer_advances")
        .select("amount, remaining_amount")
        .eq("payment_id", payment.id)
        .eq("shop_id", shopId)

      if (advanceCheckError) throw advanceCheckError

      const consumedAdvance = (advances || []).some(
        (item) =>
          num(item.remaining_amount) + 0.009 < num(item.amount)
      )

      if (consumedAdvance) {
        throw new Error(
          "This payment includes an advance already adjusted in a bill. It cannot be deleted safely until that adjustment is reversed."
        )
      }

      const { data, error } = await supabase.rpc(
        "delete_payment_and_restore_balances",
        { p_payment_id: payment.id }
      )

      if (error) throw error
      if (data === false) throw new Error("Payment could not be deleted.")

      setPaymentToDelete(null)
      toast.success("Payment deleted and bill balances restored", {
        description: `${formatCurrency(payment.amount)} payment record has been deleted.`,
      })
      await loadPayments(true)
    } catch (error) {
      console.error("Delete payment error:", error)
      toast.error("Could not delete payment", {
        description: error?.message || "Please try again.",
      })
    } finally {
      setDeletingPaymentId(null)
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
            className="h-11 gap-2 rounded-xl border border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-violet-50 hover:border-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/30 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-700"
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
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => downloadPaymentsPDF(filtered, currentShop, periodLabel)}
                    disabled={filtered.length === 0}
                    className="h-9 gap-1.5 rounded-xl border-violet-200 bg-white/90 px-3 text-xs font-medium text-slate-700 shadow-sm hover:bg-violet-50 disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    Export PDF
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
                              <Link
                                to={payment.customer_id ? `/customers/${payment.customer_id}` : "#"}
                                onClick={(event) => {
                                  if (!payment.customer_id) event.preventDefault()
                                }}
                                aria-label={`Open ${name}'s customer profile`}
                                title="Open customer profile"
                                className={`group flex min-w-0 items-center gap-2.5 rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                                  payment.customer_id ? "hover:text-emerald-700" : "cursor-default"
                                }`}
                              >
                                <CustomerAvatar
                                  name={name}
                                  photoUrl={payment.customers?.photo_url}
                                  className="h-9 w-9"
                                />
                                <div className="min-w-0">
                                  <p className="max-w-[170px] truncate text-[12px] font-bold text-slate-800 transition-colors group-hover:text-emerald-700">
                                    {name}
                                  </p>
                                  {payment.customers?.mobile && (
                                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                                      <Phone className="h-3 w-3" aria-hidden="true" />
                                      {payment.customers.mobile}
                                    </p>
                                  )}
                                </div>
                              </Link>
                            </td>

                            <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">
                              {payment.payment_date ? formatDate(payment.payment_date) : "—"}
                            </td>

                            <td className="whitespace-nowrap px-3 py-3 text-xs font-medium text-slate-700">
                              {payment.payment_mode || "—"}
                            </td>

                            <td className="px-3 py-3 text-xs font-medium text-slate-600">
                              {payment.allocations?.length ? (
                                <div className="flex flex-col items-start gap-1.5">
                                  {payment.allocations.map((allocation) => (
                                    <Link
                                      key={`${payment.id}-${allocation.bill_id}`}
                                      to={`/bills/${allocation.bill_id}`}
                                      className="whitespace-nowrap rounded-md px-1.5 py-0.5 hover:bg-violet-50 hover:text-violet-700 hover:underline"
                                    >
                                      {allocation.bills?.bill_number || "Bill"}
                                    </Link>
                                  ))}
                                  {payment.is_advance && <span className="text-[10px] text-slate-400">+ Advance</span>}
                                </div>
                              ) : payment.bill_id && payment.bills?.bill_number ? (
                                <Link to={`/bills/${payment.bill_id}`} className="hover:text-violet-700 hover:underline">
                                  {payment.bills.bill_number}
                                </Link>
                              ) : "—"}
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

                            <td className="px-3 py-3 text-right text-xs">
                              {payment.allocations?.length ? (
                                <div className="flex flex-col items-end gap-1.5">
                                  {payment.allocations.map((allocation) => (
                                    <span key={`${payment.id}-amount-${allocation.bill_id}`} className="whitespace-nowrap font-semibold tabular-nums text-emerald-700">
                                      {formatCurrency(allocation.amount)}
                                    </span>
                                  ))}
                                  {payment.is_advance && <span className="text-[10px] font-medium text-slate-500">Advance included</span>}
                                  <span className="border-t border-dashed border-slate-200 pt-1 font-bold text-slate-800">
                                    Total {formatCurrency(payment.amount)}
                                  </span>
                                </div>
                              ) : <AmountText payment={payment} />}
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
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  aria-label={`Delete payment of ${formatCurrency(payment.amount)} for ${name}`}
                                  title="Delete payment"
                                  onClick={() => setPaymentToDelete(payment)}
                                  className="h-9 w-9 rounded-xl border-rose-200 bg-white text-rose-600 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </Button>
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
                          <Link
                            to={payment.customer_id ? `/customers/${payment.customer_id}` : "#"}
                            onClick={(event) => {
                              if (!payment.customer_id) event.preventDefault()
                            }}
                            aria-label={`Open ${name}'s customer profile`}
                            title="Open customer profile"
                            className={`group flex min-w-0 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                              payment.customer_id ? "hover:text-emerald-700" : "cursor-default"
                            }`}
                          >
                            <CustomerAvatar
                              name={name}
                              photoUrl={payment.customers?.photo_url}
                              className="h-10 w-10"
                            />
                            <div className="min-w-0 text-left">
                              <p className="truncate text-sm font-bold text-slate-800 transition-colors group-hover:text-emerald-700">
                                {name}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-slate-500">
                                {payment.payment_date ? formatDate(payment.payment_date) : "—"}
                                {payment.payment_mode ? ` · ${payment.payment_mode}` : ""}
                              </p>
                            </div>
                          </Link>
                          {payment.allocations?.length ? (
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-bold tabular-nums text-slate-800">{formatCurrency(payment.amount)}</p>
                              <p className="text-[10px] text-slate-500">{payment.allocations.length} bill split(s)</p>
                            </div>
                          ) : <AmountText payment={payment} className="shrink-0 text-sm" />}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <TypePill type={type} />
                          {payment.allocations?.length ? (
                            <div className="w-full rounded-xl border border-violet-100 bg-violet-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Bill-wise payment</p>
                              <div className="space-y-2">
                                {payment.allocations.map((allocation) => (
                                  <div key={`${payment.id}-mobile-${allocation.bill_id}`} className="flex items-center justify-between gap-3 text-xs">
                                    <Link to={`/bills/${allocation.bill_id}`} className="font-semibold text-slate-700 hover:text-violet-700 hover:underline dark:text-slate-200">
                                      {allocation.bills?.bill_number || "Bill"}
                                    </Link>
                                    <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(allocation.amount)}</span>
                                  </div>
                                ))}
                              </div>
                              {payment.is_advance && <p className="mt-2 border-t border-violet-100 pt-2 text-[11px] text-slate-500">Includes a customer advance</p>}
                            </div>
                          ) : payment.bills?.bill_number ? (
                            <span className="text-xs font-medium text-slate-600">Bill {payment.bills.bill_number}</span>
                          ) : null}
                          {payment.notes && (
                            <span className="min-w-0 truncate text-xs text-slate-500">
                              {payment.notes}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {(payment.bill_id || hasReceipt) && (
                            <>
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
                            </>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setPaymentToDelete(payment)}
                            className="h-10 gap-2 rounded-xl border-rose-200 bg-white px-3 text-sm font-medium text-rose-600 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Delete
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

      {/* DELETE PAYMENT CONFIRMATION */}

      <Dialog
        open={!!paymentToDelete}
        onOpenChange={(open) => {
          if (!open && !deletingPaymentId) setPaymentToDelete(null)
        }}
      >
        <DialogContent className="rounded-[22px] border border-violet-100 bg-white p-0 shadow-[0_18px_55px_rgba(35,28,75,0.16)] dark:border-slate-700 dark:bg-slate-900 sm:max-w-[420px]">
          <DialogHeader className="space-y-2 border-b border-rose-100 px-6 pb-5 pt-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <Trash2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <DialogTitle className="text-lg font-bold text-[#171a36]">
              Delete this payment?
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-slate-500">
              This will delete the payment, restore its bill allocations, and remove any unused linked advance. Refunds and already-adjusted advances cannot be deleted here.
            </DialogDescription>
          </DialogHeader>

          {paymentToDelete && (
            <div className="mx-6 my-5 rounded-xl border border-rose-100 bg-rose-50/60 px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">
                {paymentToDelete.customers?.name || "Unknown customer"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {paymentToDelete.payment_date ? formatDate(paymentToDelete.payment_date) : "—"}
                {" · "}
                {paymentToDelete.payment_mode || "—"}
              </p>
              <p className="mt-2 text-lg font-bold tabular-nums text-rose-700">
                {paymentToDelete.is_refund ? "−" : "+"}
                {formatCurrency(paymentToDelete.amount)}
              </p>
            </div>
          )}

          <DialogFooter className="flex-col-reverse gap-2 border-t border-violet-100 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:px-7">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPaymentToDelete(null)}
              disabled={!!deletingPaymentId}
              className="h-10 min-w-[112px] rounded-xl border border-violet-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/25 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleDeletePayment}
              disabled={!paymentToDelete || !!deletingPaymentId}
              className="h-10 min-w-[148px] gap-2 rounded-xl border border-violet-200 bg-white px-5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/25 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-700"
            >
              {deletingPaymentId ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Delete payment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RECORD PAYMENT DIALOG */}
      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="max-h-[94dvh] overflow-hidden rounded-[26px] border border-violet-100/80 bg-[#fbfaff] dark:border-slate-700 dark:bg-slate-900 p-0 shadow-[0_24px_80px_rgba(35,28,75,0.22)] sm:max-w-[760px]">
          <div className="flex max-h-[94dvh] flex-col">
            <DialogHeader className="relative shrink-0 overflow-hidden border-b border-violet-100 bg-white dark:border-slate-700 dark:bg-slate-900 px-5 pb-5 pt-5 text-left sm:px-7 sm:pt-6">
              <div className="pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full bg-violet-100/60 dark:bg-violet-900/20 blur-3xl" />
              <div className="relative flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 ring-1 ring-violet-100 dark:bg-slate-800 dark:text-violet-300 dark:ring-slate-700">
                  <Receipt className="h-6 w-6" strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <DialogTitle className="text-xl font-bold tracking-tight text-[#171a36] dark:text-slate-100 sm:text-[22px]">
                      Record payment
                    </DialogTitle>
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-violet-700 dark:border-slate-700 dark:bg-slate-800 dark:text-violet-300">
                      New transaction
                    </span>
                  </div>
                  <DialogDescription className="mt-1 max-w-xl text-xs leading-5 text-slate-500 dark:text-slate-400 dark:text-slate-500 sm:text-sm">
                    Select a customer, allocate the received amount to pending bills, or keep it as an advance.
                  </DialogDescription>
                </div>
              </div>
              <div className="relative mt-5 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-violet-100 bg-[#faf9ff] dark:border-slate-700 dark:bg-slate-800 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Pending bills</p>
                  <p className="mt-1 text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100">{pendingBills.length}</p>
                </div>
                <div className="rounded-xl border border-violet-100 bg-[#faf9ff] dark:border-slate-700 dark:bg-slate-800 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Allocated</p>
                  <p className="mt-1 truncate text-sm font-bold tabular-nums text-violet-700 dark:text-violet-300">{formatCurrency(billAllocatedTotal)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Advance</p>
                  <p className="mt-1 truncate text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">{formatCurrency(advanceValue)}</p>
                </div>
              </div>
            </DialogHeader>

            <form id="payment-record-form" onSubmit={handleSave} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-7">
              {/* CUSTOMER */}
              <section className="rounded-2xl border border-violet-100 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-[0_3px_12px_rgba(80,65,130,0.04)] dark:border-slate-700 dark:bg-slate-900 sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-violet-700 dark:text-violet-300">Step 01</p>
                    <h3 className="mt-1 text-sm font-bold text-[#171a36] dark:text-slate-100">Customer details</h3>
                  </div>
                  <Users className="h-5 w-5 text-violet-400" />
                </div>
                <Label className="mb-2 block text-xs font-semibold text-slate-600">
                  Select customer <span className="text-rose-500">*</span>
                </Label>
                <Select
                  value={form.customer_id}
                  onValueChange={(value) => updateForm("customer_id", value)}
                  disabled={customersLoading || saving}
                >
                  <SelectTrigger className="h-[50px] rounded-xl border border-violet-200 bg-white px-3 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:text-slate-100 shadow-[0_2px_7px_rgba(80,65,130,0.07)] transition-all placeholder:text-slate-400 dark:text-slate-500 hover:border-violet-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15 dark:focus:border-violet-400 dark:focus:ring-violet-400/20">
                    <SelectValue placeholder={customersLoading ? "Loading customers..." : "Choose a customer"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[280px]">
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        <div className="flex items-center gap-2.5 py-0.5">
                          <CustomerAvatar name={customer.name} photoUrl={customer.photo_url} className="h-8 w-8" />
                          <div className="flex min-w-0 flex-col text-left">
                            <span className="truncate text-sm font-semibold">{customer.name}</span>
                            {customer.mobile && <span className="text-[11px] text-slate-400 dark:text-slate-500">{customer.mobile}</span>}
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!customersLoading && customers.length === 0 && (
                  <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">No active customers found. Add a customer first.</p>
                )}
                {form.customer_id && !billsLoading && pendingBills.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-100 bg-amber-50/70 px-3.5 py-3">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                      <span className="text-xs font-medium text-amber-800">Outstanding balance</span>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-amber-800">
                      {formatCurrency(pendingBills.reduce((total, bill) => total + num(bill.amount_due), 0))}
                    </span>
                  </div>
                )}
              </section>

              {/* BILL ALLOCATION */}
              <section className="overflow-hidden rounded-2xl border border-violet-100 bg-white dark:border-slate-700 dark:bg-slate-900 shadow-[0_3px_12px_rgba(80,65,130,0.04)]">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-violet-100 bg-[#faf9ff] dark:border-slate-700 dark:bg-slate-800 px-4 py-4 sm:px-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-slate-800 dark:text-violet-300">
                      <Receipt className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-violet-700">Step 02</p>
                      <h3 className="mt-0.5 text-sm font-bold text-[#171a36] dark:text-slate-100">Bill-wise allocation</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400 dark:text-slate-500">Add full or partial amounts against individual pending bills.</p>
                    </div>
                  </div>
                  <span className="rounded-full border border-violet-200 bg-white px-3 py-1.5 text-[11px] font-bold text-violet-700 dark:border-slate-600 dark:bg-slate-800 dark:text-violet-300">
                    {pendingBills.length} {pendingBills.length === 1 ? "bill" : "bills"}
                  </span>
                </div>

                <div className="space-y-3 p-4 sm:p-5">
                  {billsLoading ? (
                    <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-violet-200 bg-[#fcfbff] dark:border-slate-700 dark:bg-slate-800 px-3 py-8 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin text-violet-600 dark:text-violet-300" /> Loading pending bills...
                    </div>
                  ) : billLoadError ? (
                    <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-700">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {billLoadError}
                    </div>
                  ) : !form.customer_id ? (
                    <div className="rounded-xl border border-dashed border-violet-200 bg-[#fcfbff] dark:border-slate-700 dark:bg-slate-800 px-3 py-8 text-center">
                      <Users className="mx-auto h-6 w-6 text-violet-300" />
                      <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Choose a customer to see their pending bills.</p>
                    </div>
                  ) : pendingBills.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-violet-200 bg-[#fcfbff] dark:border-slate-700 dark:bg-slate-800 px-3 py-7 text-center">
                      <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-500" />
                      <p className="mt-2 text-sm font-semibold text-slate-700">No pending bills</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">You can still record an advance for this customer.</p>
                    </div>
                  ) : (
                    <div className="max-h-[310px] space-y-2.5 overflow-y-auto pr-1">
                      {pendingBills.map((bill, index) => {
                        const due = num(bill.amount_due)
                        const allocated = num(billAllocations[bill.id])
                        const progress = bill.grand_total > 0 ? Math.min(100, Math.round((num(bill.amount_paid) / num(bill.grand_total)) * 100)) : 0
                        return (
                          <div key={bill.id} className={`rounded-xl border p-3.5 transition-colors ${allocated > 0 ? "border-violet-200 bg-violet-50/50 dark:border-violet-900 dark:bg-violet-950/30" : "border-violet-100 bg-white hover:border-violet-200 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"}`}>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-[10px] font-bold text-violet-700 dark:bg-slate-800 dark:text-violet-300">{index + 1}</span>
                                  <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{bill.bill_number || "Bill"}</p>
                                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Pending</span>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
                                  <span>{bill.bill_date ? formatDate(bill.bill_date) : "Date unavailable"}</span>
                                  <span>Total {formatCurrency(bill.grand_total)}</span>
                                  <span>Paid {formatCurrency(bill.amount_paid)}</span>
                                </div>
                                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                                  <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${progress}%` }} />
                                </div>
                                <p className="mt-1.5 text-[11px] font-semibold text-amber-700">Remaining due: {formatCurrency(due)}</p>
                              </div>
                              <div className="w-full shrink-0 sm:w-[156px]">
                                <Label htmlFor={`allocation-${bill.id}`} className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 dark:text-slate-500">Receive amount</Label>
                                <div className="relative">
                                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 dark:text-slate-500">₹</span>
                                  <Input
                                    id={`allocation-${bill.id}`}
                                    type="number"
                                    inputMode="decimal"
                                    min="0"
                                    max={due}
                                    step="0.01"
                                    placeholder="0.00"
                                    value={billAllocations[bill.id] ?? ""}
                                    onChange={(event) => updateBillAllocation(bill.id, event.target.value)}
                                    disabled={saving}
                                    className="h-10 rounded-xl border border-violet-200 bg-white pl-7 text-right text-sm font-semibold tabular-nums shadow-[0_2px_6px_rgba(80,65,130,0.06)] transition-all placeholder:text-slate-400 dark:text-slate-500 focus-visible:border-violet-500 focus-visible:ring-2 focus-visible:ring-violet-500/15 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus-visible:border-violet-400 dark:focus-visible:ring-violet-400/20"
                                  />
                                </div>
                                <div className="mt-1.5 flex items-center justify-between gap-2">
                                  <button type="button" onClick={() => updateBillAllocation(bill.id, String(due))} disabled={saving} className="inline-flex h-7 items-center justify-center rounded-lg border border-violet-200 bg-white dark:border-slate-700 dark:bg-slate-900 px-2.5 text-[10px] font-bold text-violet-700 dark:text-violet-300 shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25 disabled:opacity-50">Pay full</button>
                                  <button type="button" onClick={() => updateBillAllocation(bill.id, "")} disabled={saving || !allocated} className="inline-flex h-7 items-center justify-center rounded-lg border border-violet-100 bg-white dark:border-slate-700 dark:bg-slate-900 px-2.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 shadow-sm transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/20 disabled:opacity-40">Clear</button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 rounded-xl bg-[#f7f5ff] px-3.5 py-3 dark:bg-slate-800">
                    <div>
                      <p className="text-xs font-semibold text-slate-700">Bill allocation total</p>
                      <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">{selectedAllocations.length} bill(s) selected</p>
                    </div>
                    <p className="text-base font-bold tabular-nums text-violet-700 dark:text-violet-300">{formatCurrency(billAllocatedTotal)}</p>
                  </div>
                </div>
              </section>

              {/* ADVANCE */}
              <section className="rounded-2xl border border-violet-100 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-[0_3px_12px_rgba(80,65,130,0.04)] dark:border-slate-700 dark:bg-slate-900 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-slate-700 dark:text-slate-200 ring-1 ring-blue-100">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-700 dark:text-slate-200">Step 03 · Optional</p>
                    <h3 className="mt-0.5 text-sm font-bold text-[#171a36] dark:text-slate-100">Customer advance</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400 dark:text-slate-500">Keep an amount aside for adjustment against future bills.</p>
                  </div>
                </div>
                <div className="mt-3">
                  <Label htmlFor="payment-advance" className="mb-1.5 block text-xs font-semibold text-slate-600">Advance amount</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400 dark:text-slate-500">₹</span>
                    <Input id="payment-advance" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={advanceAmount} onChange={(event) => setAdvanceAmount(event.target.value)} disabled={saving} className="h-11 rounded-xl border border-violet-200 bg-white pl-7 text-sm font-semibold tabular-nums shadow-[0_2px_7px_rgba(80,65,130,0.07)] transition-all placeholder:text-slate-400 dark:text-slate-500 focus-visible:border-violet-500 focus-visible:ring-2 focus-visible:ring-violet-500/15 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus-visible:border-violet-400 dark:focus-visible:ring-violet-400/20" />
                  </div>
                </div>
              </section>

              {/* PAYMENT DETAILS */}
              <section className="rounded-2xl border border-violet-100 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-[0_3px_12px_rgba(80,65,130,0.04)] dark:border-slate-700 dark:bg-slate-900 sm:p-5">
                <div className="mb-3 flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-violet-600" />
                  <h3 className="text-sm font-bold text-[#171a36] dark:text-slate-100">Payment details</h3>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="payment-date" className="text-xs font-semibold text-slate-600">Payment date <span className="text-rose-500">*</span></Label>
                    <Input id="payment-date" type="date" value={form.payment_date} max={today} onChange={(event) => updateForm("payment_date", event.target.value)} required disabled={saving} className="h-11 rounded-xl border border-violet-200 bg-white px-3 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:text-slate-100 shadow-[0_2px_7px_rgba(80,65,130,0.07)] transition-all hover:border-violet-300 focus-visible:border-violet-500 focus-visible:ring-2 focus-visible:ring-violet-500/15 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus-visible:border-violet-400 dark:focus-visible:ring-violet-400/20" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-600">Payment mode <span className="text-rose-500">*</span></Label>
                    <Select value={form.payment_mode} onValueChange={(value) => updateForm("payment_mode", value)} disabled={saving}>
                      <SelectTrigger className="h-11 rounded-xl border border-violet-200 bg-white px-3 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:text-slate-100 shadow-[0_2px_7px_rgba(80,65,130,0.07)] transition-all hover:border-violet-300 focus:ring-2 focus:ring-violet-500/15 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-violet-400/20"><SelectValue placeholder="Choose payment mode" /></SelectTrigger>
                      <SelectContent>{PAYMENT_MODES.map((mode) => <SelectItem key={mode} value={mode}>{mode}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  <Label htmlFor="payment-notes" className="text-xs font-semibold text-slate-600">Notes <span className="font-normal text-slate-400 dark:text-slate-500">(optional)</span></Label>
                  <Textarea id="payment-notes" value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} placeholder="Add reference number, transaction note or other details..." rows={2} disabled={saving} className="min-h-[76px] resize-y rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 shadow-[0_2px_7px_rgba(80,65,130,0.06)] transition-all placeholder:text-slate-400 dark:text-slate-500 hover:border-violet-300 focus-visible:border-violet-500 focus-visible:ring-2 focus-visible:ring-violet-500/15 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus-visible:border-violet-400 dark:focus-visible:ring-violet-400/20" />
                </div>
              </section>

              {/* LIVE TOTAL */}
              <section className="overflow-hidden rounded-2xl border border-violet-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-3 border-b border-violet-100 dark:border-slate-700 px-4 py-3">
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Payment summary</p>
                    <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">Live total based on your allocations</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-violet-700 dark:text-violet-300">Live preview</span>
                </div>
                <div className="space-y-2 px-4 py-3">
                  <div className="flex justify-between gap-3 text-xs"><span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Bill allocation</span><span className="font-semibold tabular-nums text-slate-700">{formatCurrency(billAllocatedTotal)}</span></div>
                  <div className="flex justify-between gap-3 text-xs"><span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Customer advance</span><span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatCurrency(advanceValue)}</span></div>
                </div>
                <div className="flex items-center justify-between gap-3 bg-violet-100 px-4 py-3.5 text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                  <span className="text-sm font-semibold">Total received</span>
                  <span className="text-xl font-bold tabular-nums">{formatCurrency(enteredAmount)}</span>
                </div>
              </section>

              <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2.5">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                <p className="text-[10px] leading-4 text-slate-500 dark:text-slate-400 dark:text-slate-500">Review all bill allocations carefully. The payment will be saved only after the next confirmation step.</p>
              </div>
            </form>

            <div className="shrink-0 border-t border-violet-100 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-900 sm:px-7">
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => closeDialog(false)} disabled={saving} className="h-10 min-w-[104px] rounded-xl border border-violet-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/25 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-700">
                  Cancel
                </Button>
                <Button type="submit" form="payment-record-form" disabled={saving || customersLoading || customers.length === 0 || billsLoading || !!billLoadError} className="h-11 min-w-[176px] gap-2 rounded-xl border border-violet-200 bg-white px-5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/25 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-700">
                  <CheckCircle2 className="h-4 w-4" /> Review payment <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* PAYMENT REVIEW / FINAL CONFIRMATION */}
      <Dialog
        open={confirmationOpen}
        onOpenChange={(open) => {
          if (!open && !saving) returnToPaymentForm()
        }}
      >
        <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-[24px] border border-violet-100 bg-[#fbfaff] p-0 shadow-[0_20px_60px_rgba(35,28,75,0.18)] dark:border-slate-700 dark:bg-slate-900 sm:max-w-[620px]">
          <DialogHeader className="space-y-2 border-b border-violet-100 bg-white px-5 pb-5 pt-5 dark:border-slate-700 dark:bg-slate-900 sm:px-7 sm:pt-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 dark:bg-slate-800 dark:text-violet-300">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight text-[#171a36]">
              Confirm payment
            </DialogTitle>
            <DialogDescription>
              Review the bill-wise allocation and advance amount before saving.
            </DialogDescription>
          </DialogHeader>

          {preparedPayment && (
            <div className="space-y-4 px-5 py-5 sm:px-7">
              <div className="rounded-xl bg-[#f7f5ff] px-4 py-3">
                <p className="text-sm font-bold text-slate-800">{preparedPayment.customer_name}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-medium text-slate-500">Payment date</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-800">
                    {formatDate(preparedPayment.payment_date)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-medium text-slate-500">Payment mode</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-800">
                    {preparedPayment.payment_mode}
                  </p>
                </div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Bill allocation
                </h3>
                {preparedPayment.allocation_details.length > 0 ? (
                  <div className="divide-y divide-[#eeecf5] rounded-xl border border-violet-100">
                    {preparedPayment.allocation_details.map((item) => (
                      <div
                        key={item.bill_id}
                        className="flex items-center justify-between gap-3 px-3.5 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {item.bill_number || "Bill"}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            Pending before payment: {formatCurrency(item.amount_due)}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-bold tabular-nums text-emerald-700">
                          {formatCurrency(item.amount)}
                        </p>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-3 bg-[#faf9ff] px-3.5 py-3 text-xs">
                      <span className="font-semibold text-slate-600">Bill allocation total</span>
                      <span className="font-bold tabular-nums text-slate-900">
                        {formatCurrency(
                          preparedPayment.allocation_details.reduce(
                            (total, item) => total + item.amount,
                            0
                          )
                        )}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-xl border border-violet-100 bg-[#faf9ff] px-3.5 py-3 text-xs text-slate-500">
                    No bill allocation. This payment will be recorded as an advance.
                  </p>
                )}
              </div>

              {preparedPayment.advance_amount > 0 && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Customer advance</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Available for future bill adjustment
                    </p>
                  </div>
                  <p className="text-sm font-bold tabular-nums text-blue-700">
                    {formatCurrency(preparedPayment.advance_amount)}
                  </p>
                </div>
              )}

              {preparedPayment.notes && (
                <div className="rounded-xl border border-violet-100 px-3.5 py-3">
                  <p className="text-[11px] font-semibold text-slate-500">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">
                    {preparedPayment.notes}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                <span className="text-sm font-semibold text-emerald-900">Total received</span>
                <span className="text-xl font-bold tabular-nums text-emerald-800">
                  {formatCurrency(preparedPayment.amount)}
                </span>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col-reverse gap-2 border-t border-violet-100 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:px-7">
            <Button
              type="button"
              variant="outline"
              onClick={returnToPaymentForm}
              disabled={saving}
              className="h-10 min-w-[112px] rounded-xl border border-violet-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/25 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-700"
            >
              Back to edit
            </Button>
            <Button
              type="button"
              onClick={handleConfirmPayment}
              disabled={saving || !preparedPayment}
              className="h-11 min-w-[158px] gap-2 rounded-xl border border-violet-200 bg-white px-5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/25 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-700"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving payment...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Confirm & save
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}