import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatDate } from "@/lib/utils"
import { generateBillsStatementPDF } from "@/lib/billsPdf"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import {
  AlertCircle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Eye,
  FileText,
  FileDown,
  FileSpreadsheet,
  IndianRupee,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Wallet,
  X,
  Trash2,
  AlertTriangle,
} from "lucide-react"

import { toast } from "sonner"

/* ==================================================
   CONSTANTS & HELPERS
================================================== */

const PAGE_SIZE = 10
const FETCH_BATCH = 1000 // Supabase returns max 1000 rows per request

const PRESETS = [
  { mode: "today", label: "Today" },
  { mode: "yesterday", label: "Yesterday" },
  { mode: "week", label: "Last 7 days" },
  { mode: "month", label: "This month" },
]

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "paid", label: "Paid" },
  { key: "partial", label: "Partially paid" },
  { key: "unpaid", label: "Unpaid" },
  { key: "overdue", label: "Overdue" },
]

const STATUS_STYLES = {
  paid: {
    label: "Paid",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
    icon: CheckCircle2,
  },
  partial: {
    label: "Partially paid",
    className: "bg-amber-100 text-amber-700 border-amber-200",
    icon: Clock3,
  },
  unpaid: {
    label: "Unpaid",
    className: "bg-rose-100 text-rose-700 border-rose-200",
    icon: CircleAlert,
  },
}

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-amber-100 text-amber-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
  "bg-violet-100 text-violet-700",
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

// Whole days between two YYYY-MM-DD dates (b - a)
function daysBetween(a, b) {
  const [ya, ma, da] = a.split("-").map(Number)
  const [yb, mb, db] = b.split("-").map(Number)
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000)
}

function applyRange(query, column, range) {
  let q = query
  if (range.from) q = q.gte(column, range.from)
  if (range.to) q = q.lte(column, range.to)
  return q
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

/**
 * Supabase silently caps every query at 1000 rows. This pages through ALL
 * rows so totals and counts stay accurate for busy shops.
 */
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

const exportNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const exportMoney = (value) =>
  `Rs. ${exportNumber(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const exportDate = (value) => {
  if (!value) return "—"
  try {
    return formatDate(value)
  } catch {
    return String(value)
  }
}

const csvEscape = (value) => {
  const text = String(value ?? "")
  return `"${text.replace(/"/g, '""')}"`
}

function downloadExport(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

function exportBillsCSV(rows, shopName) {
  const headers = [
    "Bill Number", "Customer", "Mobile", "Bill Date", "Due Date",
    "Payment Status", "Total Amount", "Advance Adjusted", "Amount Paid", "Amount Due",
  ]

  const records = rows.map((bill) => [
    bill.bill_number || "",
    bill.customers?.name || "Walk-in Customer",
    bill.customers?.mobile || "",
    exportDate(bill.bill_date),
    exportDate(bill.due_date),
    bill.overdue ? "Overdue" : bill.status === "partial" ? "Partially paid" : bill.status === "paid" ? "Paid" : "Unpaid",
    exportNumber(bill.total),
    exportNumber(bill.advance_adjusted),
    exportNumber(bill.amount_paid),
    exportNumber(bill.due),
  ])

  const csv = [headers, ...records]
    .map((row) => row.map(csvEscape).join(","))
    .join("\r\n")

  const date = new Date().toISOString().slice(0, 10)
  const fileName = `${String(shopName || "KHAATAPRO").replace(/[^a-z0-9-_]+/gi, "_")}_Bills_${date}.csv`
  downloadExport(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }), fileName)
}

// Use the saved status; if it is missing, work it out from the amounts
function getStatusKey(bill) {
  const saved = String(bill?.payment_status || "").trim().toLowerCase()

  if (saved === "paid") return "paid"
  if (["partial", "partially_paid", "partially paid"].includes(saved)) {
    return "partial"
  }
  if (["unpaid", "pending", "overdue"].includes(saved)) {
    return "unpaid"
  }

  const due = num(bill?.amount_due)
  if (due <= 0) return "paid"

  return num(bill?.amount_paid) > 0 || num(bill?.advance_adjusted) > 0
    ? "partial"
    : "unpaid"
}

/* ==================================================
   SMALL UI PIECES
================================================== */

function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />
}

function PageSkeleton() {
  return (
    <div
      className="min-h-full w-full space-y-4 rounded-2xl bg-[#f7f5ff] px-3 py-5 sm:px-5 lg:px-6"
      aria-busy="true"
      aria-label="Loading bills"
    >
      <Skeleton className="h-16 w-72" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-[20px]" />
        ))}
      </div>
      <Skeleton className="h-[460px] rounded-[20px]" />
    </div>
  )
}

const SUMMARY_TONES = {
  green: { icon: "bg-emerald-100/80 text-emerald-700", accent: "text-emerald-700" },
  blue: { icon: "bg-blue-100/80 text-blue-700", accent: "text-blue-700" },
  pink: { icon: "bg-pink-100/80 text-pink-700", accent: "text-pink-700" },
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

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.unpaid
  const Icon = style.icon

  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1.5 text-[10px] font-bold ${style.className}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {style.label}
    </span>
  )
}

// Convert a Supabase Storage URL or stored object path into a bucket-relative path.
function safeDecodePath(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function getBillAttachmentPath(value) {
  if (!value) return null

  const raw = String(value).trim()
  if (!raw) return null

  try {
    const parsed = new URL(raw)
    const marker = "/storage/v1/object/"
    const markerIndex = parsed.pathname.indexOf(marker)

    if (markerIndex >= 0) {
      const storagePart = parsed.pathname.slice(markerIndex + marker.length)
      const prefixes = [
        "public/bill_attachments/",
        "sign/bill_attachments/",
        "authenticated/bill_attachments/",
      ]

      const prefix = prefixes.find((item) => storagePart.startsWith(item))

      if (prefix) {
        return safeDecodePath(storagePart.slice(prefix.length))
      }
    }
  } catch {
    // The value may already be a bucket-relative object path.
  }

  const relativePath = raw
    .replace(/^\/+/, "")
    .replace(/^bill_attachments\//, "")

  return safeDecodePath(relativePath)
}

/* ==================================================
   BILLS PAGE
================================================== */

function Bills() {
  const { currentShop } = useShop()
  const shopId = currentShop?.id
  const today = getLocalDateString()

  const [bills, setBills] = useState([])
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [lastUpdated, setLastUpdated] = useState(null)

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [sortBy, setSortBy] = useState("newest")
  const [page, setPage] = useState(1)

  // Bills page starts with all bills; pick a period from the date menu
  const [period, setPeriod] = useState({ mode: "overall", from: "", to: "" })
  const [periodOpen, setPeriodOpen] = useState(false)
  const periodRef = useRef(null)

  const hasLoaded = useRef(false)
  const requestId = useRef(0)

  /* --------------------------------------------------
     DATE PERIOD
  -------------------------------------------------- */

  const range = useMemo(() => {
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
  }, [period, today])

  const periodLabel = (() => {
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
  })()

  const choosePeriod = (mode) => {
    setPeriod({ mode, from: "", to: "" })
    setPeriodOpen(false)
  }

  const changeCustomDate = (key, value) => {
    const next = { from: range.from || "", to: range.to || "", [key]: value }

    if (next.from && next.to && next.from > next.to) {
      if (key === "from") next.to = next.from
      else next.from = next.to
    }

    setPeriod({ mode: "custom", ...next })
  }

  // Close the date menu on outside click or Escape
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
     LOAD BILLS
  -------------------------------------------------- */

  useEffect(() => {
    hasLoaded.current = false
    setBills([])
    setLoadError("")
  }, [shopId])

  const loadBills = useCallback(
    async (forceRefresh = false) => {
      const id = ++requestId.current

      if (!shopId) {
        setBills([])
        setLoading(false)
        return
      }

      // Full skeleton only on the first load
      if (forceRefresh || hasLoaded.current) setRefreshing(true)
      else setLoading(true)

      setLoadError("")

      try {
        const rows = await fetchAllRows(() =>
          applyRange(
            supabase
              .from("bills")
              .select(
                `id, bill_number, bill_date, due_date, grand_total, amount_paid,
                 amount_due, advance_adjusted, payment_status, created_at, attachment_url,
                 customers ( id, name, mobile, photo_url )`
              )
              .eq("shop_id", shopId),
            "bill_date",
            range
          )
            .order("created_at", { ascending: false })
            .order("id")
        )

        // A newer request has started — ignore this result
        if (id !== requestId.current) return

        setBills(rows)
        setLastUpdated(new Date())
        hasLoaded.current = true
      } catch (error) {
        if (id !== requestId.current) return
        console.error("Load bills error:", error)
        const message = error?.message || "Unable to load bills."
        setLoadError(message)
        toast.error("Could not load bills", { description: message })
      } finally {
        if (id === requestId.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [shopId, range.from, range.to]
  )

  useEffect(() => {
    loadBills()
  }, [loadBills])

  const handleDeleteBill = async () => {
    if (!deleteTarget?.id || !shopId || deleting) return

    setDeleting(true)
    try {
      const { data: billRecord, error: fetchError } = await supabase
        .from("bills")
        .select("id, shop_id, attachment_url")
        .eq("id", deleteTarget.id)
        .eq("shop_id", shopId)
        .single()

      if (fetchError) throw fetchError
      if (!billRecord) throw new Error("Bill not found in this workspace.")

      const { error: paymentsError } = await supabase
        .from("payments")
        .delete()
        .eq("bill_id", billRecord.id)
        .eq("shop_id", shopId)
      if (paymentsError) throw paymentsError

      const { error: itemsError } = await supabase
        .from("bill_items")
        .delete()
        .eq("bill_id", billRecord.id)
      if (itemsError) throw itemsError

      const { error: billError } = await supabase
        .from("bills")
        .delete()
        .eq("id", billRecord.id)
        .eq("shop_id", shopId)
      if (billError) throw billError

      const attachmentPath = getBillAttachmentPath(billRecord.attachment_url)
      let storageWarning = ""
      if (attachmentPath) {
        const { error: storageError } = await supabase.storage
          .from("bill_attachments")
          .remove([attachmentPath])
        if (storageError) {
          console.error("Bill attachment storage deletion failed:", storageError)
          storageWarning = " The bill was deleted, but its attachment could not be removed from Storage."
        }
      }

      setBills((current) => current.filter((bill) => bill.id !== billRecord.id))
      setDeleteTarget(null)
      toast.success(
        storageWarning
          ? "Bill deleted." + storageWarning
          : "Bill and its attachment deleted successfully."
      )
      await loadBills(true)
    } catch (error) {
      console.error("Delete bill error:", error)
      toast.error("Could not delete bill", {
        description: error?.message || "Please try again.",
      })
    } finally {
      setDeleting(false)
    }
  }

  /* --------------------------------------------------
     DERIVED DATA
  -------------------------------------------------- */

  const enriched = useMemo(
    () =>
      bills.map((bill) => {
        const due = num(bill.amount_due)
        return {
          ...bill,
          total: num(bill.grand_total),
          due,
          status: getStatusKey(bill),
          overdue: due > 0 && Boolean(bill.due_date) && bill.due_date < today,
        }
      }),
    [bills, today]
  )

  // Summary and chip counts follow the selected period (not the search box)
  const summary = useMemo(() => {
    const result = {
      count: enriched.length,
      billed: 0,
      due: 0,
      dueCount: 0,
      overdueAmount: 0,
      overdueCount: 0,
      paid: 0,
      partial: 0,
      unpaid: 0,
    }

    enriched.forEach((bill) => {
      result.billed += bill.total
      result.due += bill.due
      result[bill.status] += 1
      if (bill.due > 0) result.dueCount += 1
      if (bill.overdue) {
        result.overdueAmount += bill.due
        result.overdueCount += 1
      }
    })

    result.collected = Math.max(0, result.billed - result.due)
    return result
  }, [enriched])

  const chipCounts = {
    all: summary.count,
    paid: summary.paid,
    partial: summary.partial,
    unpaid: summary.unpaid,
    overdue: summary.overdueCount,
  }

  const filteredBills = useMemo(() => {
    const query = search.trim().toLowerCase()

    const list = enriched.filter((bill) => {
      const matchesSearch =
        !query ||
        bill.bill_number?.toLowerCase().includes(query) ||
        bill.customers?.name?.toLowerCase().includes(query) ||
        bill.customers?.mobile?.toLowerCase().includes(query)

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "overdue" ? bill.overdue : bill.status === statusFilter)

      return matchesSearch && matchesStatus
    })

    // "newest" keeps the order from the database (latest created first)
    if (sortBy === "oldest") list.reverse()
    if (sortBy === "amount") list.sort((a, b) => b.total - a.total)
    if (sortBy === "due") list.sort((a, b) => b.due - a.due)

    return list
  }, [enriched, search, statusFilter, sortBy])

  // Back to page 1 whenever the list changes
  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, sortBy, range.from, range.to, shopId])

  const totalPages = Math.max(1, Math.ceil(filteredBills.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * PAGE_SIZE
  const pageBills = filteredBills.slice(pageStart, pageStart + PAGE_SIZE)

  const showingFrom = filteredBills.length === 0 ? 0 : pageStart + 1
  const showingTo = Math.min(pageStart + PAGE_SIZE, filteredBills.length)

  const paginationItems = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (safePage <= 3) return [1, 2, 3, "ellipsis-end", totalPages]
    if (safePage >= totalPages - 2) {
      return [1, "ellipsis-start", totalPages - 2, totalPages - 1, totalPages]
    }
    return [1, "ellipsis-start", safePage - 1, safePage, safePage + 1, "ellipsis-end", totalPages]
  }, [safePage, totalPages])

  const hasActiveFilters = Boolean(search.trim()) || statusFilter !== "all"

  const clearFilters = () => {
    setSearch("")
    setStatusFilter("all")
  }

  /* --------------------------------------------------
     EMPTY / LOADING STATES
  -------------------------------------------------- */

  if (!currentShop) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-3xl border border-dashed border-violet-200 bg-white/80 p-8 text-center">
        <div className="max-w-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <FileText className="h-7 w-7" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">No workspace selected</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Select a workspace to view and manage its bills.
          </p>
          <Button asChild className="mt-5 rounded-xl border border-violet-200 bg-white/90 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50">
            <Link to="/settings">Open workspace settings</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (loading) return <PageSkeleton />

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
            <Link to="/" className="hover:text-slate-700">
              Dashboard
            </Link>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            <span>Bills</span>
          </nav>

          <h1 className="mt-1 text-[29px] font-bold tracking-tight text-[#171a39] sm:text-[32px]">
            Bills
          </h1>

          <p className="mt-0.5 text-sm text-slate-600">
            Track invoices, payments and pending balances. Showing{" "}
            <strong className="font-semibold text-slate-800">{periodLabel}</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* DATE PERIOD MENU */}
          <div ref={periodRef} className="relative w-full sm:w-auto">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={periodOpen}
              onClick={() => setPeriodOpen((open) => !open)}
              className="flex h-11 w-full max-w-full items-center gap-2 rounded-xl border border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:w-auto sm:max-w-[270px]"
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
                      Dues and overdue are for bills dated in this period. Customers and advances
                      always show current totals.
                    </p>

                    <Button
                      type="button"
                      onClick={() => setPeriodOpen(false)}
                      className="mt-3 w-full h-11 rounded-xl border border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-violet-50"
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
            onClick={() => loadBills(true)}
            disabled={refreshing}
            aria-label={refreshing ? "Refreshing bills" : "Refresh bills"}
            title={refreshing ? "Refreshing bills" : "Refresh bills"}
            className="h-11 min-w-[112px] gap-2 rounded-xl border border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <RefreshCw className={`h-4 w-4 shrink-0 ${refreshing ? "animate-spin" : ""}`} />
            <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
          </Button>

          <Button
            asChild
            className="h-11 gap-2 px-5 rounded-xl border border-violet-200 bg-white/90 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Link to="/bills/new">
              <Plus className="h-5 w-5" aria-hidden="true" />
              Create bill
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
              Could not load your bills. Check your connection and try again.
              <span className="ml-1 text-xs text-rose-500">({loadError})</span>
            </span>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => loadBills(true)}
            className="shrink-0 rounded-xl border border-violet-200 bg-white/90 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Try again
          </Button>
        </div>
      )}

      {/* SUMMARY */}

      <section
        aria-label="Bills summary"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4"
      >
        <SummaryCard
          label="Total bills"
          value={summary.count.toLocaleString("en-IN")}
          detail={`${summary.paid} paid, ${summary.partial} partial, ${summary.unpaid} unpaid`}
          icon={FileText}
          tone="purple"
        />

        <SummaryCard
          label="Total billed"
          value={formatCurrency(summary.billed)}
          detail={`${formatCurrency(summary.collected)} collected`}
          icon={Receipt}
          tone="blue"
        />

        <SummaryCard
          label="Outstanding"
          value={formatCurrency(summary.due)}
          detail={`${summary.dueCount} ${summary.dueCount === 1 ? "bill" : "bills"} with dues`}
          icon={IndianRupee}
          tone="pink"
        />

        <SummaryCard
          label="Overdue"
          value={formatCurrency(summary.overdueAmount)}
          detail={`${summary.overdueCount} ${summary.overdueCount === 1 ? "bill" : "bills"} past due date`}
          icon={Wallet}
          tone="green"
        />
      </section>

      {/* BILLS LIST */}

      <Card className="overflow-hidden rounded-[20px] border border-white/80 bg-white/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)] backdrop-blur-sm">
        {/* Header, search and sort */}
        <div className="space-y-4 border-b border-[#eae7f4] px-4 py-4 sm:px-5">
          <div className="space-y-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                    <Receipt className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-[16px] font-bold tracking-tight text-[#171a36]">All bills</h2>
                    <p className="mt-0.5 text-xs text-slate-500" aria-live="polite">
                      {filteredBills.length === enriched.length
                        ? `${enriched.length.toLocaleString("en-IN")} bills`
                        : `${filteredBills.length.toLocaleString("en-IN")} of ${enriched.length.toLocaleString("en-IN")} bills match`}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 xl:hidden">
                  <Button type="button" variant="outline" onClick={() => generateBillsStatementPDF(filteredBills, currentShop, periodLabel)} disabled={!filteredBills.length} className="h-9 gap-1.5 rounded-xl border-violet-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-violet-50">
                    <FileDown className="h-4 w-4" /> PDF
                  </Button>
                  <Button type="button" variant="outline" onClick={() => exportBillsCSV(filteredBills, currentShop?.name)} disabled={!filteredBills.length} className="h-9 gap-1.5 rounded-xl border-violet-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-violet-50">
                    <FileSpreadsheet className="h-4 w-4" /> CSV
                  </Button>
                </div>
              </div>

              <div className="hidden shrink-0 items-center gap-2 xl:flex">
                <Button type="button" variant="outline" onClick={() => generateBillsStatementPDF(filteredBills, currentShop, periodLabel)} disabled={!filteredBills.length} className="h-10 gap-2 rounded-xl border-violet-200 bg-white px-3.5 text-sm font-semibold text-slate-700 shadow-sm hover:border-violet-300 hover:bg-violet-50">
                  <FileDown className="h-4 w-4" /> Export PDF
                </Button>
                <Button type="button" variant="outline" onClick={() => exportBillsCSV(filteredBills, currentShop?.name)} disabled={!filteredBills.length} className="h-10 gap-2 rounded-xl border-violet-200 bg-white px-3.5 text-sm font-semibold text-slate-700 shadow-sm hover:border-violet-300 hover:bg-violet-50">
                  <FileSpreadsheet className="h-4 w-4" /> Export CSV
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_190px]">
              <div className="relative w-full">
                <Search
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />

                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search customer, mobile or bill no."
                  aria-label="Search bills"
                  className="h-10 rounded-xl border-violet-200 bg-white/90 pl-9 pr-9 text-sm"
                />

                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger aria-label="Sort bills" className="h-10 w-full rounded-xl border-violet-200 bg-white/90">
                  <SlidersHorizontal className="mr-2 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="amount">Highest amount</SelectItem>
                  <SelectItem value="due">Highest due</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Status filter chips (scroll sideways on small screens) */}
          <div
            role="group"
            aria-label="Filter by payment status"
            className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {STATUS_FILTERS.map((filter) => {
              const active = statusFilter === filter.key
              return (
                <button
                  key={filter.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStatusFilter(filter.key)}
                  className={`inline-flex h-10 shrink-0 items-center justify-center gap-2.5 rounded-xl border px-4 text-[13px] font-semibold leading-none whitespace-nowrap shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 ${
                    active
                      ? "border-violet-300 bg-violet-100 text-slate-900 shadow-[0_2px_8px_rgba(124,58,237,0.10)]"
                      : "border-violet-200 bg-white/95 text-slate-700 hover:border-violet-300 hover:bg-violet-50"
                  }`}
                >
                  {filter.label}
                  <span
                    className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums ${
                      active ? "bg-white text-violet-800" : "bg-violet-100 text-violet-700"
                    }`}
                  >
                    {chipCounts[filter.key]}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Empty states */}
        {filteredBills.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center px-5 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
              <FileText className="h-7 w-7" aria-hidden="true" />
            </div>

            <h3 className="mt-4 text-sm font-bold text-slate-900">
              {enriched.length === 0
                ? period.mode === "overall"
                  ? "No bills yet"
                  : "No bills in this period"
                : "No matching bills"}
            </h3>

            <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
              {enriched.length === 0
                ? period.mode === "overall"
                  ? "Create your first bill and it will show up here."
                  : "Try another date range, or create a new bill."
                : "Try a different search or status filter."}
            </p>

            {hasActiveFilters && enriched.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                className="mt-4 rounded-xl border border-violet-200 bg-white/90 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={clearFilters}
              >
                Clear filters
              </Button>
            ) : (
              <Button asChild className="mt-4 rounded-xl border border-violet-200 bg-white/90 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50">
                <Link to="/bills/new">
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Create bill
                </Link>
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
                <caption className="sr-only">Bills</caption>
                <thead>
                  <tr className="bg-[#f5f3fc] text-[11px] font-semibold text-slate-600">
                    <th scope="col" className="rounded-l-xl px-3 py-3">Customer</th>
                    <th scope="col" className="px-3 py-3">Bill no.</th>
                    <th scope="col" className="px-3 py-3">Bill date</th>
                    <th scope="col" className="px-3 py-3">Due date</th>
                    <th scope="col" className="px-3 py-3">Status</th>
                    <th scope="col" className="px-3 py-3 text-right">Total</th>
                    <th scope="col" className="px-3 py-3 text-right">Due</th>
                    <th scope="col" className="rounded-r-xl px-3 py-3 text-center">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {pageBills.map((bill, index) => {
                    const name = bill.customers?.name || "Walk-in Customer"
                    const overdueDays = bill.overdue ? daysBetween(bill.due_date, today) : 0

                    return (
                      <tr
                        key={bill.id}
                        className="border-b border-[#eeecf5] transition-colors last:border-0 hover:bg-[#f9f8ff]"
                      >
                        <td className="px-3 py-3">
                          <Link to={`/bills/${bill.id}`} className="flex items-center gap-2.5">
                            <div
                              aria-hidden="true"
                              className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold ${
                                AVATAR_COLORS[index % AVATAR_COLORS.length]
                              }`}
                            >
                              {bill.customers?.photo_url ? (
                                <img
                                  src={bill.customers.photo_url}
                                  alt=""
                                  loading="lazy"
                                  className="h-full w-full object-cover"
                                  onError={(event) => {
                                    event.currentTarget.style.display = "none"
                                    event.currentTarget.nextElementSibling?.classList.remove("hidden")
                                  }}
                                />
                              ) : null}
                              <span className={bill.customers?.photo_url ? "hidden" : ""}>
                                {getInitials(name)}
                              </span>
                            </div>

                            <div className="min-w-0">
                              <p className="max-w-[170px] truncate text-[12px] font-bold text-slate-800">
                                {name}
                              </p>
                              {bill.customers?.mobile && (
                                <p className="mt-0.5 text-[11px] text-slate-400">
                                  {bill.customers.mobile}
                                </p>
                              )}
                            </div>
                          </Link>
                        </td>

                        <td className="whitespace-nowrap px-3 py-3 text-xs font-medium">
                          <Link
                            to={`/bills/${bill.id}`}
                            aria-label={`Open invoice ${bill.bill_number || ""}`}
                            className="inline-flex items-center rounded-lg px-1.5 py-1 font-semibold text-violet-700 transition-colors hover:bg-violet-50 hover:text-violet-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                          >
                            {bill.bill_number || "View invoice"}
                          </Link>
                        </td>

                        <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">
                          {bill.bill_date ? formatDate(bill.bill_date) : "—"}
                        </td>

                        <td className="whitespace-nowrap px-3 py-3">
                          <p
                            className={`text-xs ${
                              bill.overdue ? "font-semibold text-rose-600" : "text-slate-600"
                            }`}
                          >
                            {bill.due_date ? formatDate(bill.due_date) : "Not set"}
                          </p>
                          {bill.overdue && (
                            <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-rose-500">
                              <Clock3 className="h-3 w-3" aria-hidden="true" />
                              {overdueDays} {overdueDays === 1 ? "day" : "days"} overdue
                            </p>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <StatusBadge status={bill.status} />
                        </td>

                        <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-bold tabular-nums text-slate-900">
                          {formatCurrency(bill.total)}
                        </td>

                        <td
                          className={`whitespace-nowrap px-3 py-3 text-right text-xs font-semibold tabular-nums ${
                            bill.due > 0 ? "text-rose-600" : "text-emerald-700"
                          }`}
                        >
                          {bill.due > 0 ? formatCurrency(bill.due) : "Nil"}
                        </td>

                        <td className="px-3 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <Link
                              to={`/bills/${bill.id}`}
                              aria-label={`View bill ${bill.bill_number || ""} for ${name}`}
                              className="flex h-8 w-[68px] items-center justify-center gap-1.5 rounded-xl border border-violet-200 bg-white/90 text-xs font-medium text-slate-700 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
                            >
                              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                              View
                            </Link>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(bill)}
                              aria-label={`Delete bill ${bill.bill_number || ""}`}
                              title="Delete bill"
                              className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-200 bg-white text-rose-600 shadow-sm transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul
              className={`divide-y divide-[#eeecf5] transition-opacity md:hidden ${
                refreshing ? "opacity-60" : "opacity-100"
              }`}
            >
              {pageBills.map((bill, index) => {
                const name = bill.customers?.name || "Walk-in Customer"
                const overdueDays = bill.overdue ? daysBetween(bill.due_date, today) : 0

                return (
                  <li key={bill.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        to={`/bills/${bill.id}`}
                        className="flex min-w-0 items-center gap-3"
                      >
                        <div
                          aria-hidden="true"
                          className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-bold ${
                            AVATAR_COLORS[index % AVATAR_COLORS.length]
                          }`}
                        >
                          {bill.customers?.photo_url ? (
                            <img
                              src={bill.customers.photo_url}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover"
                              onError={(event) => {
                                event.currentTarget.style.display = "none"
                                event.currentTarget.nextElementSibling?.classList.remove("hidden")
                              }}
                            />
                          ) : null}
                          <span className={bill.customers?.photo_url ? "hidden" : ""}>
                            {getInitials(name)}
                          </span>
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-800">{name}</p>
                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            {bill.bill_number || "Bill"}
                            {bill.customers?.mobile ? `, ${bill.customers.mobile}` : ""}
                          </p>
                        </div>
                      </Link>

                      <StatusBadge status={bill.status} />
                    </div>

                    <div className="grid grid-cols-2 gap-3 rounded-xl border border-[#eeecf5] bg-[#faf9ff] p-3">
                      <div>
                        <p className="text-[11px] text-slate-500">Total</p>
                        <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                          {formatCurrency(bill.total)}
                        </p>
                      </div>

                      <div>
                        <p className="text-[11px] text-slate-500">Due</p>
                        <p
                          className={`mt-1 text-sm font-bold tabular-nums ${
                            bill.due > 0 ? "text-rose-600" : "text-emerald-700"
                          }`}
                        >
                          {bill.due > 0 ? formatCurrency(bill.due) : "Nil"}
                        </p>
                      </div>

                      <div>
                        <p className="text-[11px] text-slate-500">Bill date</p>
                        <p className="mt-1 text-xs text-slate-700">
                          {bill.bill_date ? formatDate(bill.bill_date) : "—"}
                        </p>
                      </div>

                      <div>
                        <p className="text-[11px] text-slate-500">Due date</p>
                        <p
                          className={`mt-1 text-xs ${
                            bill.overdue ? "font-semibold text-rose-600" : "text-slate-700"
                          }`}
                        >
                          {bill.due_date ? formatDate(bill.due_date) : "Not set"}
                        </p>
                        {bill.overdue && (
                          <p className="mt-0.5 text-[10px] font-semibold text-rose-500">
                            {overdueDays} {overdueDays === 1 ? "day" : "days"} overdue
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-9 flex-1 gap-1.5 rounded-xl border border-violet-200 bg-white/90 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50"
                      >
                        <Link to={`/bills/${bill.id}`}>
                          View bill
                          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                      </Button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(bill)}
                        className="flex h-9 w-11 shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-white text-rose-600 transition-colors hover:bg-rose-50"
                        aria-label={`Delete bill ${bill.bill_number || ""}`}
                        title="Delete bill"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>

            {/* Pagination */}
            <div className="flex flex-col gap-3 border-t border-[#eeecf5] bg-white/60 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="text-xs font-medium text-slate-600" aria-live="polite">
                Showing{" "}
                <span className="font-semibold text-slate-800">
                  {showingFrom}–{showingTo}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-slate-800">
                  {filteredBills.length.toLocaleString("en-IN")}
                </span>{" "}
                bills
              </p>

              {totalPages > 1 && (
                <nav
                  aria-label="Bills pages"
                  className="flex flex-wrap items-center justify-end gap-1.5"
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Previous page"
                    disabled={safePage <= 1}
                    onClick={() => setPage(Math.max(1, safePage - 1))}
                    className="h-8 w-8 p-0 rounded-xl border border-violet-200 bg-white/90 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50"
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
                        variant={safePage === item ? "default" : "outline"}
                        aria-label={`Page ${item}`}
                        aria-current={safePage === item ? "page" : undefined}
                        onClick={() => setPage(item)}
                        className={`h-8 min-w-8 rounded-full border px-0 text-xs font-semibold shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50 ${
                          safePage === item
                            ? "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
                            : "border-violet-200 bg-white/90 text-slate-700 hover:border-violet-300 hover:bg-violet-50"
                        }`} >
                        {item}
                      </Button>
                    )
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Next page"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                    className="h-8 w-8 p-0 rounded-xl border border-violet-200 bg-white/90 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </nav>
              )}
            </div>
          </>
        )}
      </Card>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-3 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleting) setDeleteTarget(null)
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-bill-title"
            aria-describedby="delete-bill-description"
            className="w-full max-w-md rounded-2xl border border-violet-100 bg-white p-5 shadow-[0_20px_60px_rgba(30,25,60,0.22)] sm:p-6"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 id="delete-bill-title" className="text-base font-bold text-slate-900">Delete this bill?</h2>
                <p id="delete-bill-description" className="mt-1 text-sm leading-5 text-slate-600">
                  Bill <strong>{deleteTarget.bill_number || "without a bill number"}</strong> will be permanently deleted, along with its items, linked payment records and offline attachment from the bill_attachments storage bucket. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="h-10 rounded-xl border border-violet-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-violet-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteBill}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? "Deleting…" : "Delete bill"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* FOOTER */}

      <footer className="flex flex-col justify-between gap-2 rounded-xl border border-white/80 bg-white/65 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center">
        <span>
          Workspace:
          <strong className="ml-1 text-slate-700">{currentShop?.name || "Workspace"}</strong>
        </span>

        <span>
          {lastUpdated
            ? `Last updated at ${lastUpdated.toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : "Not updated yet"}
        </span>
      </footer>
    </div>
  )
}

export default Bills
