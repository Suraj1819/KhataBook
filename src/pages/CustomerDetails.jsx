import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatDate } from "@/lib/utils"
import { generateCustomerDetailsPDF } from "@/lib/customerDetailsPdf"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"

import {
  AlertCircle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  FileDown,
  FileSpreadsheet,
  Clock3,
  CreditCard,
  FileText,
  History,
  IndianRupee,
  Layers,
  MapPin,
  MessageCircle,
  Paperclip,
  Phone,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  TrendingUp,
  UserRound,
  Wallet,
} from "lucide-react"

import { toast } from "sonner"

/* ==================================================
   CONSTANTS & HELPERS
================================================== */

const num = (value) => Number(value) || 0

const TABS = [
  { id: "bills", label: "Bills", icon: FileText },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "advances", label: "Advances", icon: Wallet },
  { id: "statement", label: "Statement", icon: History },
]

const BILL_FILTERS = [
  { id: "all", label: "All" },
  { id: "unpaid", label: "Unpaid" },
  { id: "partial", label: "Partial" },
  { id: "paid", label: "Paid" },
  { id: "overdue", label: "Overdue" },
]

const cardClass =
  "overflow-hidden rounded-[20px] border border-white/80 bg-white/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)] backdrop-blur-sm"

function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

// Whole days between two YYYY-MM-DD strings (b - a)
function daysBetween(a, b) {
  const [ay, am, ad] = a.split("-").map(Number)
  const [by, bm, bd] = b.split("-").map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
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

function getCustomerPhotoUrl(photoValue) {
  const value = String(photoValue || "").trim()
  if (!value) return ""

  if (/^(https?:|data:|blob:)/i.test(value)) return value

  const cleanPath = value
    .replace(/^\/+/, "")
    .replace(/^avatars\//, "")

  const { data } = supabase.storage.from("avatars").getPublicUrl(cleanPath)
  return data?.publicUrl || ""
}

function getPaymentStatus(bill) {
  if (num(bill.amount_due) <= 0) return "paid"
  if (num(bill.amount_paid) > 0 || num(bill.advance_adjusted) > 0) return "partial"
  return "unpaid"
}

// Build a wa.me link. Adds India's 91 code to 10-digit numbers.
function whatsappLink(phone, text) {
  const digits = String(phone || "").replace(/\D/g, "")
  if (!digits) return null
  const full = digits.length === 10 ? `91${digits}` : digits
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`
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
      aria-label="Loading customer"
    >
      <Skeleton className="h-16 w-80" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-[20px]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.65fr_1fr]">
        <Skeleton className="h-[460px] rounded-[20px]" />
        <Skeleton className="h-[460px] rounded-[20px]" />
      </div>
    </div>
  )
}

const TONES = {
  green: "bg-emerald-100/80 text-emerald-700",
  blue: "bg-blue-100/80 text-blue-700",
  pink: "bg-pink-100/80 text-pink-700",
  purple: "bg-violet-100/80 text-violet-700",
  amber: "bg-amber-100/80 text-amber-700",
}

const ACCENTS = {
  green: "text-emerald-700",
  blue: "text-blue-700",
  pink: "text-pink-700",
  purple: "text-violet-700",
  amber: "text-amber-700",
}

function SummaryCard({ label, value, detail, icon: Icon, tone = "green", valueClass = "text-[#151934]" }) {
  return (
    <Card className="overflow-hidden rounded-[20px] border border-white/80 bg-white/80 shadow-[0_4px_15px_rgba(80,65,130,0.07)] backdrop-blur-sm">
      <CardContent className="flex min-w-0 items-center gap-4 p-4 sm:p-5">
        <div
          className={`flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full ${TONES[tone]}`}
        >
          <Icon className="h-7 w-7" strokeWidth={1.9} aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-slate-600">{label}</p>
          <h3
            className={`mt-1.5 break-words text-[23px] font-bold leading-tight tracking-tight tabular-nums ${valueClass}`}
          >
            {value}
          </h3>
          <p className={`mt-1.5 text-xs font-semibold ${ACCENTS[tone]}`}>{detail}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function SectionHeader({ icon: Icon, title, description, action }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#eae7f4] px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700">
          <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </div>

        <div className="min-w-0">
          <h2 className="text-[16px] font-bold tracking-tight text-[#171a36]">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
      </div>

      {action}
    </div>
  )
}

const STATUS_STYLES = {
  paid: { label: "Paid", className: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  partial: { label: "Partially paid", className: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock3 },
  unpaid: { label: "Unpaid", className: "bg-rose-100 text-rose-700 border-rose-200", icon: CircleAlert },
  overdue: { label: "Overdue", className: "bg-rose-600 text-white border-rose-600", icon: AlertCircle },
}

function StatusPill({ status }) {
  const style = STATUS_STYLES[status]
  const Icon = style.icon
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-bold ${style.className}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {style.label}
    </span>
  )
}

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center px-5 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
        <Icon className="h-7 w-7" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-sm font-bold text-slate-900">{title}</h3>
      {description && (
        <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">{description}</p>
      )}
    </div>
  )
}

function DetailRow({ label, value, icon: Icon }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 break-words text-sm font-semibold text-slate-800">
          {value || <span className="font-normal text-slate-400">Not provided</span>}
        </p>
      </div>
    </div>
  )
}

function MiniStat({ label, value, note, tone = "slate" }) {
  const styles = {
    slate: "border-[#ece9f5] bg-white text-slate-900",
    rose: "border-rose-100 bg-rose-50/70 text-rose-700",
    amber: "border-amber-100 bg-amber-50/70 text-amber-700",
    emerald: "border-emerald-100 bg-emerald-50/70 text-emerald-700",
  }
  return (
    <div className={`rounded-2xl border p-3.5 ${styles[tone]}`}>
      <p className="text-[11px] font-semibold opacity-80">{label}</p>
      <p className="mt-1.5 break-words text-lg font-bold tracking-tight tabular-nums">{value}</p>
      {note && <p className="mt-0.5 text-[11px] opacity-80">{note}</p>}
    </div>
  )
}

function KeyValue({ label, value, valueClass = "text-slate-800", strong = false }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className={strong ? "font-semibold text-slate-800" : "text-slate-600"}>{label}</span>
      <span className={`shrink-0 tabular-nums ${strong ? "font-bold" : "font-semibold"} ${valueClass}`}>
        {value}
      </span>
    </div>
  )
}

/* ==================================================
   CUSTOMER DETAILS
================================================== */

export default function CustomerDetails() {
  const { customerId } = useParams()
  const { currentShop } = useShop()

  const [customer, setCustomer] = useState(null)
  const [bills, setBills] = useState([])
  const [payments, setPayments] = useState([])
  const [advances, setAdvances] = useState([])
  const [billItems, setBillItems] = useState([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [lastUpdated, setLastUpdated] = useState(null)

  const [search, setSearch] = useState("")
  const [billFilter, setBillFilter] = useState("all")
  const [billDateFilter, setBillDateFilter] = useState("")
  const [activeTab, setActiveTab] = useState("bills")
  const [expandedBill, setExpandedBill] = useState(null)

  const hasLoaded = useRef(false)
  // Prevents an older (slower) request from overwriting newer data
  const requestRef = useRef(0)

  const today = localDateString()

  // Reset when the customer or shop changes
  useEffect(() => {
    // Invalidate requests belonging to the previous customer/workspace.
    requestRef.current += 1
    hasLoaded.current = false
    setCustomer(null)
    setBills([])
    setPayments([])
    setAdvances([])
    setBillItems([])
    setExpandedBill(null)
    setLoadError("")
    setLoading(true)
  }, [customerId, currentShop?.id])

  const loadCustomerDetails = useCallback(
    async (showRefresh = false) => {
      if (!currentShop?.id || !customerId) {
        setLoading(false)
        setRefreshing(false)
        return
      }

      const requestId = ++requestRef.current

      if (showRefresh || hasLoaded.current) setRefreshing(true)
      else setLoading(true)

      setLoadError("")

      try {
        const [customerRes, billRes, paymentRes, advanceRes] = await Promise.all([
          supabase
            .from("customers")
            .select("*")
            .eq("id", customerId)
            .eq("shop_id", currentShop.id)
            .maybeSingle(),

          supabase
            .from("bills")
            .select("*")
            .eq("shop_id", currentShop.id)
            .eq("customer_id", customerId)
            .order("created_at", { ascending: false }),

          supabase
            .from("payments")
            .select("*")
            .eq("shop_id", currentShop.id)
            .eq("customer_id", customerId)
            .order("payment_date", { ascending: false }),

          supabase
            .from("customer_advances")
            .select("*")
            .eq("customer_id", customerId)
            .order("created_at", { ascending: false }),
        ])

        if (customerRes.error) throw customerRes.error
        if (billRes.error) throw billRes.error
        if (paymentRes.error) throw paymentRes.error
        if (advanceRes.error) throw advanceRes.error

        const safeBills = billRes.data || []
        const billIds = safeBills.map((bill) => bill.id)

        let items = []
        if (billIds.length > 0) {
          const { data, error } = await supabase
            .from("bill_items")
            .select("*")
            .in("bill_id", billIds)
            .order("sort_order")

          if (error) throw error
          items = data || []
        }

        // A newer request has started — ignore this result
        if (requestId !== requestRef.current) return

        setCustomer(customerRes.data || null)
        setBills(safeBills)
        setPayments(paymentRes.data || [])
        setAdvances(advanceRes.data || [])
        setBillItems(items)
        setLastUpdated(new Date())
        hasLoaded.current = true
      } catch (error) {
        if (requestId !== requestRef.current) return
        console.error("Customer details error:", error)
        const message = error?.message || "Unable to load customer details."
        setLoadError(message)
        toast.error("Could not load customer", { description: message })
      } finally {
        if (requestId === requestRef.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [currentShop?.id, customerId]
  )

  useEffect(() => {
    loadCustomerDetails()
  }, [loadCustomerDetails])

  /* --------------------------------------------------
     DERIVED NUMBERS
  -------------------------------------------------- */

  const calc = useMemo(() => {
    const sum = (rows, key) => rows.reduce((total, row) => total + num(row[key]), 0)

    const totalPurchase = sum(bills, "grand_total")
    const totalDue = sum(bills, "amount_due")

    const totalAdvanceReceived = sum(advances, "amount")

    // Regular payments are counted from payments. Advance deposits are counted
    // from customer_advances so mirrored is_advance payment rows are not counted twice.
    const regularPaymentsReceived = sum(
      payments.filter((p) => !p.is_refund && !p.is_advance),
      "amount"
    )
    const totalRefunded = sum(
      payments.filter((p) => p.is_refund),
      "amount"
    )
    const grossReceived = regularPaymentsReceived + totalAdvanceReceived
    const totalReceived = Math.max(0, grossReceived - totalRefunded)

    const availableAdvance = sum(advances, "remaining_amount")
    const advanceAdjusted = Math.max(0, totalAdvanceReceived - availableAdvance)

    const unpaidBills = bills.filter((b) => num(b.amount_due) > 0)
    const overdueBills = unpaidBills.filter((b) => b.due_date && b.due_date < today)
    const dueTodayBills = unpaidBills.filter((b) => b.due_date === today)

    const collected = Math.max(0, totalPurchase - totalDue)
    const collectionRate =
      totalPurchase > 0 ? Math.min(100, Math.max(0, Math.round((collected / totalPurchase) * 100))) : 0

    const oldestOverdue = overdueBills.reduce(
      (oldest, bill) => (!oldest || bill.due_date < oldest ? bill.due_date : oldest),
      ""
    )

    const lastBillDate = bills.reduce(
      (latest, bill) => (bill.bill_date && bill.bill_date > latest ? bill.bill_date : latest),
      ""
    )
    const lastPaymentDate = payments
      .filter((p) => !p.is_refund)
      .reduce(
        (latest, p) => (p.payment_date && p.payment_date > latest ? p.payment_date : latest),
        ""
      )

    return {
      totalBills: bills.length,
      totalPurchase,
      totalDue,
      totalReceived,
      totalRefunded,
      totalAdvanceReceived,
      availableAdvance,
      advanceAdjusted,
      unpaidBills,
      overdueBills,
      overdueAmount: sum(overdueBills, "amount_due"),
      dueTodayBills,
      dueTodayAmount: sum(dueTodayBills, "amount_due"),
      collected,
      collectionRate,
      averageBill: bills.length > 0 ? totalPurchase / bills.length : 0,
      oldestOverdueDays: oldestOverdue ? daysBetween(oldestOverdue, today) : 0,
      lastBillDate,
      lastPaymentDate,
    }
  }, [bills, payments, advances, today])

  const billCounts = useMemo(() => {
    const counts = { all: bills.length, unpaid: 0, partial: 0, paid: 0, overdue: 0 }
    bills.forEach((bill) => {
      counts[getPaymentStatus(bill)] += 1
      if (num(bill.amount_due) > 0 && bill.due_date && bill.due_date < today) counts.overdue += 1
    })
    return counts
  }, [bills, today])

  const filteredBills = useMemo(() => {
    const query = search.trim().toLowerCase()

    return bills.filter((bill) => {
      if (query && !bill.bill_number?.toLowerCase().includes(query)) return false
      if (billDateFilter && bill.bill_date !== billDateFilter) return false

      if (billFilter === "all") return true
      if (billFilter === "overdue") {
        return num(bill.amount_due) > 0 && bill.due_date && bill.due_date < today
      }
      return getPaymentStatus(bill) === billFilter
    })
  }, [bills, search, billFilter, billDateFilter, today])

  // Ledger: debit = customer owes more, credit = customer owes less
  const statement = useMemo(() => {
    const rank = { bill: 0, advance: 1, payment: 2, refund: 3 }

    const transactions = [
      ...bills.map((bill) => ({
        id: `bill-${bill.id}`,
        date: bill.bill_date,
        stamp: bill.created_at || "",
        type: "bill",
        reference: bill.bill_number,
        description: "Bill created",
        debit: num(bill.grand_total),
        credit: 0,
      })),

      // Advance deposits are listed from customer_advances below, so
      // payments flagged as advance are skipped here to avoid double counting.
      ...payments
        .filter((payment) => !payment.is_advance)
        .map((payment) => ({
          id: `payment-${payment.id}`,
          date: payment.payment_date,
          stamp: payment.created_at || "",
          type: payment.is_refund ? "refund" : "payment",
          reference: String(payment.id).slice(0, 8),
          description: payment.is_refund
            ? `Refund paid - ${payment.payment_mode || "Other"}`
            : `Payment received - ${payment.payment_mode || "Other"}`,
          debit: payment.is_refund ? num(payment.amount) : 0,
          credit: payment.is_refund ? 0 : num(payment.amount),
        })),

      ...advances.map((advance) => ({
        id: `advance-${advance.id}`,
        date: advance.created_at?.split("T")[0],
        stamp: advance.created_at || "",
        type: "advance",
        reference: String(advance.id).slice(0, 8),
        description: "Advance received",
        debit: 0,
        credit: num(advance.amount),
      })),
    ].sort(
      (a, b) =>
        (a.date || "").localeCompare(b.date || "") ||
        rank[a.type] - rank[b.type] ||
        a.stamp.localeCompare(b.stamp)
    )

    let running = 0
    const rows = transactions
      .map((transaction) => {
        running += transaction.debit - transaction.credit
        return { ...transaction, balance: running }
      })
      .reverse()

    return {
      rows,
      closing: running,
      totalDebit: transactions.reduce((total, t) => total + t.debit, 0),
      totalCredit: transactions.reduce((total, t) => total + t.credit, 0),
    }
  }, [bills, payments, advances])

  const handleRefresh = () => loadCustomerDetails(true)

  const handleExportCustomerPdf = () => {
    if (!customer) {
      toast.error("Customer details are not available.")
      return
    }

    try {
      generateCustomerDetailsPDF({
        customer,
        bills,
        payments,
        advances,
        billItems,
        calc,
        statement,
        shop: currentShop,
        periodLabel: "All time",
      })
      toast.success("Customer details PDF downloaded.")
    } catch (error) {
      console.error("Customer details PDF error:", error)
      toast.error("Could not generate customer PDF", {
        description: error?.message || "Please try again.",
      })
    }
  }

  const handleExportBillsCsv = () => {
    if (!filteredBills.length) {
      toast.error("No bills to export", { description: "Adjust your search or filters and try again." })
      return
    }

    const columns = [
      ["Bill Number", "bill_number"],
      ["Bill Date", "bill_date"],
      ["Due Date", "due_date"],
      ["Status", "status"],
      ["Subtotal", "subtotal"],
      ["Discount", "discount_amount"],
      ["GST", "total_gst"],
      ["Grand Total", "grand_total"],
      ["Amount Paid", "amount_paid"],
      ["Advance Adjusted", "advance_adjusted"],
      ["Amount Due", "amount_due"],
      ["Notes", "notes"],
    ]

    const escapeCsv = (value) => {
      const text = String(value ?? "")
      return `"${text.replace(/"/g, '""')}"`
    }

    const rows = [
      columns.map(([label]) => escapeCsv(label)).join(","),
      ...filteredBills.map((bill) =>
        columns.map(([, key]) => {
          const value = key === "status"
            ? (num(bill.amount_due) <= 0
                ? "Paid"
                : num(bill.amount_paid) > 0 || num(bill.advance_adjusted) > 0
                  ? "Partial"
                  : "Unpaid")
            : bill[key]
          return escapeCsv(value)
        }).join(",")
      ),
    ]

    const csv = "\uFEFF" + rows.join("\r\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    const dateSuffix = billDateFilter || localDateString()
    link.href = url
    link.download = `bills-${String(customer.name || "customer").trim().replace(/[^a-z0-9-_]+/gi, "-")}-${dateSuffix}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    toast.success(`${filteredBills.length} bills exported to CSV`)
  }

  const handleExportBillsPdf = () => {
    if (!filteredBills.length) {
      toast.error("No bills to export", { description: "Adjust your search or filters and try again." })
      return
    }

    const popup = window.open("", "_blank")
    if (!popup) {
      toast.error("PDF export blocked", {
        description: "Allow pop-ups for this site, then try exporting again.",
      })
      return
    }

    popup.opener = null

    const escapeHtml = (value) =>
      String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character])

    const money = (value) => formatCurrency(num(value))
    const rows = filteredBills.map((bill) => {
      const status = num(bill.amount_due) <= 0
        ? "Paid"
        : num(bill.amount_paid) > 0 || num(bill.advance_adjusted) > 0
          ? "Partial"
          : "Unpaid"
      return `
        <tr>
          <td>${escapeHtml(bill.bill_number)}</td>
          <td>${escapeHtml(bill.bill_date ? formatDate(bill.bill_date) : "—")}</td>
          <td>${escapeHtml(bill.due_date ? formatDate(bill.due_date) : "—")}</td>
          <td>${status}</td>
          <td class="number">${escapeHtml(money(bill.grand_total))}</td>
          <td class="number">${escapeHtml(money(bill.amount_paid))}</td>
          <td class="number">${escapeHtml(money(bill.amount_due))}</td>
        </tr>`
    }).join("")

    const total = filteredBills.reduce((sum, bill) => sum + num(bill.grand_total), 0)
    const paid = filteredBills.reduce((sum, bill) => sum + num(bill.amount_paid) + num(bill.advance_adjusted), 0)
    const due = filteredBills.reduce((sum, bill) => sum + num(bill.amount_due), 0)
    const filterLabel = billDateFilter ? formatDate(billDateFilter) : "All dates"

    popup.document.write(`<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Customer Bills - ${escapeHtml(customer.name)}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; color: #1e293b; padding: 28px; }
            h1 { margin: 0 0 6px; font-size: 22px; }
            .meta { color: #64748b; font-size: 12px; margin-bottom: 22px; }
            .stats { display: flex; gap: 12px; margin-bottom: 20px; }
            .stat { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
            .stat span { display: block; color: #64748b; font-size: 11px; }
            .stat strong { display: block; margin-top: 5px; font-size: 15px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #e2e8f0; padding: 9px 7px; text-align: left; }
            th { background: #f5f3fc; }
            .number { text-align: right; white-space: nowrap; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>Customer Bills</h1>
          <div class="meta">
            Customer: ${escapeHtml(customer.name)} · Date filter: ${escapeHtml(filterLabel)}
            · Generated: ${escapeHtml(formatDate(localDateString()))}
          </div>
          <div class="stats">
            <div class="stat"><span>Total bills</span><strong>${filteredBills.length}</strong></div>
            <div class="stat"><span>Grand total</span><strong>${escapeHtml(money(total))}</strong></div>
            <div class="stat"><span>Paid</span><strong>${escapeHtml(money(paid))}</strong></div>
            <div class="stat"><span>Due</span><strong>${escapeHtml(money(due))}</strong></div>
          </div>
          <table>
            <thead><tr>
              <th>Bill No.</th><th>Bill Date</th><th>Due Date</th><th>Status</th>
              <th class="number">Total</th><th class="number">Paid</th><th class="number">Due</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <script>
            window.onload = () => {
              window.print()
            }
          </script>
        </body>
      </html>`)
    popup.document.close()
  }

  const reminderLink = useMemo(() => {
    if (!customer || calc.totalDue <= 0) return null
    const text =
      `Hello ${customer.name}, this is a gentle reminder from ${currentShop?.name || "our shop"}. ` +
      `Your pending amount is ${formatCurrency(calc.totalDue)}` +
      (calc.overdueAmount > 0 ? ` (${formatCurrency(calc.overdueAmount)} is overdue)` : "") +
      `. Please arrange the payment at your earliest convenience. Thank you!`
    return whatsappLink(customer.whatsapp || customer.mobile, text)
  }, [customer, calc.totalDue, calc.overdueAmount, currentShop?.name])

  /* --------------------------------------------------
     EMPTY / LOADING STATES
  -------------------------------------------------- */

  if (!currentShop) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-3xl border border-dashed border-violet-200 bg-white/80 p-8 text-center">
        <div className="max-w-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
            <UserRound className="h-7 w-7" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">No workspace selected</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Select a workspace to see customer details.
          </p>
        </div>
      </div>
    )
  }

  if (loading) return <PageSkeleton />

  if (!customer) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-3xl border border-dashed border-violet-200 bg-white/80 p-8 text-center">
        <div className="max-w-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
            <UserRound className="h-7 w-7" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">
            {loadError ? "Could not load customer" : "Customer not found"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {loadError ||
              "This customer may have been deleted or does not belong to this workspace."}
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {loadError && (
              <Button
                type="button"
                variant="outline"
                onClick={() => loadCustomerDetails()}
                className="rounded-xl border-violet-200 bg-white hover:bg-violet-50"
              >
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                Try again
              </Button>
            )}
            <Button asChild className="rounded-xl border border-violet-200 bg-white text-slate-700 shadow-sm hover:bg-violet-50 hover:text-violet-800">
              <Link to="/customers">
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Back to customers
              </Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const address = [customer.address, customer.city, customer.state, customer.pincode]
    .filter(Boolean)
    .join(", ")

  const customerSince = customer.created_at ? formatDate(customer.created_at.split("T")[0]) : ""
  const customerPhotoUrl = getCustomerPhotoUrl(customer.photo_url)

  /* --------------------------------------------------
     MAIN UI
  -------------------------------------------------- */

  return (
    <div className="min-h-full w-full space-y-4 rounded-2xl bg-[#f7f5ff] px-3 py-5 sm:px-5 lg:px-6">
      {/* PAGE HEADER */}
      <header className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Customer identity */}
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Button
            asChild
            variant="outline"
            size="icon"
            aria-label="Back to customers"
            className="h-10 w-10 shrink-0 rounded-xl border-violet-200 bg-white/90 shadow-sm hover:bg-violet-50 sm:h-11 sm:w-11"
          >
            <Link to="/customers">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>

          <div
            className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-violet-200 bg-violet-100 text-base font-bold text-violet-700 shadow-sm sm:h-14 sm:w-14 sm:text-lg"
            aria-label={`${customer.name} profile photo`}
          >
            <span aria-hidden="true">{getInitials(customer.name)}</span>
            {customerPhotoUrl && (
              <img
                src={customerPhotoUrl}
                alt={`${customer.name} profile`}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="absolute inset-0 h-full w-full rounded-full object-cover"
                onError={(event) => {
                  event.currentTarget.style.display = "none"
                }}
              />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <nav
              aria-label="Breadcrumb"
              className="mb-1 hidden min-w-0 items-center gap-1.5 overflow-hidden text-xs font-medium text-slate-500 sm:flex"
            >
              <span className="max-w-[120px] truncate">{currentShop.name || "Workspace"}</span>
              <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
              <Link to="/customers" className="shrink-0 transition-colors hover:text-slate-800">
                Customers
              </Link>
              <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{customer.name}</span>
            </nav>

            <h1 className="truncate text-xl font-bold leading-tight tracking-tight text-[#171a39] sm:text-[30px]">
              {customer.name}
            </h1>

            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600 sm:text-sm">
              {calc.totalDue > 0 ? (
                <>
                  Owes{" "}
                  <strong className="font-semibold text-rose-600">
                    {formatCurrency(calc.totalDue)}
                  </strong>{" "}
                  across {calc.unpaidBills.length} {calc.unpaidBills.length === 1 ? "bill" : "bills"}.
                </>
              ) : (
                <>All payments are clear.</>
              )}
              {customerSince && <span className="text-slate-500"> Customer since {customerSince}.</span>}
            </p>
          </div>
        </div>

        {/* Actions: compact grid on mobile, single row on desktop */}
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center lg:w-auto lg:justify-end">
          {customer.mobile && (
            <Button
              asChild
              variant="outline"
              className="h-10 w-full gap-2 rounded-xl border-violet-200 bg-white/90 px-3 text-sm text-slate-700 shadow-sm hover:bg-violet-50 sm:h-11 sm:w-auto sm:px-4"
            >
              <a href={`tel:${customer.mobile}`}>
                <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                Call
              </a>
            </Button>
          )}

          {reminderLink && (
            <Button
              asChild
              variant="outline"
              className="h-10 w-full gap-2 rounded-xl border-violet-200 bg-white px-2.5 text-xs text-slate-700 shadow-sm hover:bg-violet-50 hover:text-violet-800 sm:h-11 sm:w-auto sm:px-4 sm:text-sm"
            >
              <a href={reminderLink} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">Send reminder</span>
              </a>
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={handleExportCustomerPdf}
            className="h-10 w-full gap-2 rounded-xl border-violet-200 bg-white px-3 text-sm text-slate-700 shadow-sm hover:bg-violet-50 hover:text-violet-800 sm:h-11 sm:w-auto sm:px-4"
          >
            <FileDown className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Customer PDF</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label={refreshing ? "Refreshing customer details" : "Refresh customer"}
            title={refreshing ? "Refreshing..." : "Refresh"}
            className="h-10 w-full gap-2 rounded-xl border-violet-100 bg-white px-3 text-sm text-slate-700 shadow-sm hover:bg-violet-50 hover:text-violet-800 disabled:cursor-not-allowed disabled:opacity-70 sm:h-11 sm:w-auto sm:px-4"
          >
            <RefreshCw className={`h-4 w-4 shrink-0 ${refreshing ? "animate-spin" : ""}`} />
            <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
          </Button>

          <Button
            asChild
            className="h-10 w-full gap-2 rounded-xl border border-violet-200 bg-white px-3 text-sm text-slate-700 shadow-sm hover:bg-violet-50 hover:text-violet-800 sm:h-11 sm:w-auto sm:px-5"
          >
            <Link to="/bills/new">
              <Plus className="h-5 w-5 shrink-0" aria-hidden="true" />
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
              Could not load your latest figures. Check your connection and try again.
              <span className="ml-1 text-xs text-rose-500">({loadError})</span>
            </span>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => loadCustomerDetails()}
            className="shrink-0 border-rose-200 bg-white"
          >
            Try again
          </Button>
        </div>
      )}

      {/* FINANCIAL OVERVIEW */}

      <section
        aria-label="Financial overview"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4"
      >
        <SummaryCard
          label="Total purchase"
          value={formatCurrency(calc.totalPurchase)}
          detail={`${calc.totalBills} ${calc.totalBills === 1 ? "bill" : "bills"} created`}
          icon={Wallet}
          tone="green"
        />
        <SummaryCard
          label="Total received"
          value={formatCurrency(calc.totalReceived)}
          detail={
            calc.totalRefunded > 0
              ? `After ${formatCurrency(calc.totalRefunded)} refunds`
              : "Payments recorded"
          }
          icon={ArrowDownLeft}
          tone="blue"
        />
        <SummaryCard
          label="Outstanding dues"
          value={formatCurrency(calc.totalDue)}
          detail={`${calc.unpaidBills.length} ${calc.unpaidBills.length === 1 ? "bill" : "bills"} unpaid`}
          icon={IndianRupee}
          tone="pink"
          valueClass={calc.totalDue > 0 ? "text-rose-600" : "text-[#151934]"}
        />
        <SummaryCard
          label="Advance balance"
          value={formatCurrency(calc.availableAdvance)}
          detail={`${formatCurrency(calc.totalAdvanceReceived)} received in total`}
          icon={Layers}
          tone="purple"
        />
      </section>

      {/* MAIN CONTENT */}

      <section className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.65fr_1fr]">
        {/* LEFT: TABS */}

        <div className="min-w-0 space-y-4">
          <div
            role="tablist"
            aria-label="Customer records"
            className="flex gap-1.5 overflow-x-auto rounded-2xl border border-white/80 bg-white/75 p-1.5 shadow-[0_3px_12px_rgba(80,65,130,0.06)]"
          >
            {TABS.map((tab) => {
              const Icon = tab.icon
              const active = activeTab === tab.id
              const count =
                tab.id === "bills"
                  ? bills.length
                  : tab.id === "payments"
                    ? payments.length
                    : tab.id === "advances"
                      ? advances.length
                      : null

              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                    active
                      ? "bg-violet-100 text-violet-800 shadow-sm ring-1 ring-violet-200"
                      : "text-slate-600 hover:bg-violet-50 hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {tab.label}
                  {count !== null && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        active ? "bg-white text-violet-700" : "bg-violet-100 text-violet-700"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* BILLS TAB */}

          {activeTab === "bills" && (
            <Card className={cardClass}>
              <SectionHeader
                icon={Receipt}
                title="Customer bills"
                description={`Newest first · ${filteredBills.length} of ${bills.length} shown`}
              />

              <div className="space-y-3 border-b border-[#eeecf5] p-4 sm:px-5">
                {/* Search + exports: use the available horizontal space beside search */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative min-w-0 flex-1">
                    <Search
                      className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <Input
                      placeholder="Search bill number…"
                      aria-label="Search bill number"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      className="h-11 w-full rounded-xl border-violet-100 bg-white pl-10 text-sm shadow-none focus-visible:border-violet-400 focus-visible:ring-2 focus-visible:ring-violet-500/20"
                    />
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleExportBillsCsv}
                      disabled={filteredBills.length === 0}
                      className="h-11 flex-1 rounded-xl border-violet-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-violet-50 disabled:opacity-50 sm:flex-none"
                    >
                      <FileSpreadsheet className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      Export CSV
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleExportBillsPdf}
                      disabled={filteredBills.length === 0}
                      className="h-11 flex-1 rounded-xl border-violet-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-violet-50 disabled:opacity-50 sm:flex-none"
                    >
                      <FileDown className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      Export PDF
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {BILL_FILTERS.map((filter) => {
                    const active = billFilter === filter.id
                    return (
                      <button
                        key={filter.id}
                        type="button"
                        onClick={() => setBillFilter(filter.id)}
                        aria-pressed={active}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                          active
                            ? "border-violet-200 bg-violet-50 text-violet-800"
                            : "border-violet-100 bg-white text-slate-600 hover:bg-violet-50"
                        }`}
                      >
                        {filter.label}
                        <span className="ml-1.5 text-slate-400">{billCounts[filter.id]}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="flex flex-col gap-2 border-t border-[#eeecf5] pt-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[180px] flex-1 sm:flex-none">
                      <label htmlFor="customer-bill-date" className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Filter by bill date
                      </label>
                      <Input
                        id="customer-bill-date"
                        type="date"
                        value={billDateFilter}
                        onChange={(event) => setBillDateFilter(event.target.value)}
                        className="h-10 rounded-xl border-violet-100 bg-white text-sm shadow-none focus-visible:border-violet-400 focus-visible:ring-2 focus-visible:ring-violet-500/20"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setBillDateFilter(today)}
                      className="h-10 rounded-xl border-violet-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-violet-50"
                    >
                      <CalendarDays className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      Today
                    </Button>
                    {billDateFilter && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setBillDateFilter("")}
                        className="h-10 rounded-xl px-3 text-xs font-semibold text-slate-600 hover:bg-violet-50"
                      >
                        Clear date
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {filteredBills.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No bills found"
                  description={
                    bills.length === 0
                      ? "No bills have been created for this customer yet."
                      : "No bills match your search or filter."
                  }
                />
              ) : (
                <div className="divide-y divide-[#eeecf5]">
                  {filteredBills.map((bill) => {
                    const status = getPaymentStatus(bill)
                    const isExpanded = expandedBill === bill.id
                    const due = num(bill.amount_due)
                    const overdue = due > 0 && bill.due_date && bill.due_date < today
                    const overdueDays = overdue ? daysBetween(bill.due_date, today) : 0

                    const items = billItems.filter((item) => item.bill_id === bill.id)
                    const billPayments = payments.filter((payment) => payment.bill_id === bill.id)

                    return (
                      <div key={bill.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setExpandedBill(isExpanded ? null : bill.id)}
                          onKeyDown={(event) => {
                            if (event.target.closest("a")) return
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault()
                              setExpandedBill(isExpanded ? null : bill.id)
                            }
                          }}
                          aria-expanded={isExpanded}
                          aria-label={`${isExpanded ? "Collapse" : "Expand"} bill ${bill.bill_number}`}
                          className="block w-full cursor-pointer p-4 text-left transition-colors hover:bg-[#f9f8ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 sm:px-5"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex min-w-0 items-start gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                                <FileText className="h-5 w-5" aria-hidden="true" />
                              </div>

                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Link
                                    to={`/bills/${bill.id}`}
                                    onClick={(event) => event.stopPropagation()}
                                    aria-label={`Open full invoice ${bill.bill_number}`}
                                    className="text-sm font-bold text-slate-900 underline-offset-2 transition-colors hover:text-violet-700 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                                  >
                                    {bill.bill_number}
                                  </Link>
                                  <StatusPill status={status} />
                                  {overdue && <StatusPill status="overdue" />}
                                </div>

                                <p className="mt-1 text-xs text-slate-500">
                                  Billed on {formatDate(bill.bill_date)}
                                </p>

                                <p
                                  className={`mt-0.5 flex items-center gap-1 text-xs ${
                                    overdue ? "font-semibold text-rose-600" : "text-slate-500"
                                  }`}
                                >
                                  <CalendarDays className="h-3 w-3" aria-hidden="true" />
                                  {bill.due_date
                                    ? `Due ${formatDate(bill.due_date)}${
                                        overdue
                                          ? ` · ${overdueDays} ${overdueDays === 1 ? "day" : "days"} late`
                                          : ""
                                      }`
                                    : "No due date"}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-4 lg:justify-end">
                              <div className="grid grid-cols-3 gap-5 text-right">
                                <div>
                                  <p className="text-[11px] font-medium text-slate-500">Total</p>
                                  <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                                    {formatCurrency(bill.grand_total)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[11px] font-medium text-slate-500">Paid</p>
                                  <p className="mt-1 text-sm font-semibold tabular-nums text-emerald-700">
                                    {formatCurrency(num(bill.amount_paid) + num(bill.advance_adjusted))}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[11px] font-medium text-slate-500">Due</p>
                                  <p
                                    className={`mt-1 text-sm font-semibold tabular-nums ${
                                      due > 0 ? "text-rose-600" : "text-slate-400"
                                    }`}
                                  >
                                    {due > 0 ? formatCurrency(due) : "—"}
                                  </p>
                                </div>
                              </div>

                              <ChevronDown
                                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                aria-hidden="true"
                              />
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="space-y-4 border-t border-[#eeecf5] bg-[#faf9ff] p-4 sm:p-5">
                            {/* Items */}
                            <div>
                              <h3 className="mb-2.5 text-sm font-bold text-slate-800">
                                Purchased items
                              </h3>

                              {items.length === 0 ? (
                                <p className="rounded-xl border border-dashed border-violet-200 bg-white px-4 py-4 text-xs text-slate-500">
                                  No item details for this bill
                                  {bill.attachment_url ? ". See the attached offline bill below." : "."}
                                </p>
                              ) : (
                                <div className="overflow-x-auto rounded-xl border border-[#ece9f5] bg-white">
                                  <table className="w-full min-w-[560px] text-left">
                                    <caption className="sr-only">Items in {bill.bill_number}</caption>
                                    <thead>
                                      <tr className="bg-[#f5f3fc] text-[11px] font-semibold text-slate-600">
                                        <th scope="col" className="px-4 py-2.5">Item</th>
                                        <th scope="col" className="px-4 py-2.5">Qty</th>
                                        <th scope="col" className="px-4 py-2.5 text-right">Rate</th>
                                        <th scope="col" className="px-4 py-2.5 text-right">GST</th>
                                        <th scope="col" className="px-4 py-2.5 text-right">Amount</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#eeecf5]">
                                      {items.map((item) => (
                                        <tr key={item.id}>
                                          <td className="px-4 py-3">
                                            <p className="text-xs font-bold text-slate-800">
                                              {item.item_name}
                                            </p>
                                            {item.description && (
                                              <p className="mt-0.5 text-[11px] text-slate-500">
                                                {item.description}
                                              </p>
                                            )}
                                          </td>
                                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                                            {item.quantity} {item.unit}
                                          </td>
                                          <td className="whitespace-nowrap px-4 py-3 text-right text-xs tabular-nums text-slate-600">
                                            {formatCurrency(item.rate)}
                                          </td>
                                          <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-slate-600">
                                            {item.gst_percent}%
                                          </td>
                                          <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-bold tabular-nums text-slate-900">
                                            {formatCurrency(item.total_amount)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>

                            {/* Summary + breakdown */}
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="rounded-2xl border border-[#ece9f5] bg-white p-4">
                                <h3 className="mb-3 text-sm font-bold text-slate-800">Bill summary</h3>
                                <div className="space-y-2.5">
                                  <KeyValue label="Subtotal" value={formatCurrency(bill.subtotal)} />
                                  <KeyValue label="Discount" value={`-${formatCurrency(bill.discount_amount)}`} />
                                  <KeyValue label="GST" value={formatCurrency(bill.total_gst)} />
                                  {num(bill.round_off) !== 0 && (
                                    <KeyValue label="Round off" value={formatCurrency(bill.round_off)} />
                                  )}
                                  <div className="border-t border-[#eeecf5] pt-2.5">
                                    <KeyValue
                                      strong
                                      label="Grand total"
                                      value={formatCurrency(bill.grand_total)}
                                    />
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-2xl border border-[#ece9f5] bg-white p-4">
                                <h3 className="mb-3 text-sm font-bold text-slate-800">
                                  Payment breakdown
                                </h3>
                                <div className="space-y-2.5">
                                  <KeyValue
                                    label="Direct payments"
                                    value={formatCurrency(bill.amount_paid)}
                                    valueClass="text-emerald-700"
                                  />
                                  <KeyValue
                                    label="Advance adjusted"
                                    value={formatCurrency(bill.advance_adjusted)}
                                    valueClass="text-emerald-700"
                                  />
                                  <div className="border-t border-[#eeecf5] pt-2.5">
                                    <KeyValue
                                      strong
                                      label="Remaining due"
                                      value={formatCurrency(bill.amount_due)}
                                      valueClass={due > 0 ? "text-rose-600" : "text-slate-800"}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Payment records */}
                            {billPayments.length > 0 && (
                              <div className="rounded-2xl border border-[#ece9f5] bg-white p-4">
                                <h3 className="mb-3 text-sm font-bold text-slate-800">
                                  Payment records
                                </h3>
                                <ul className="divide-y divide-[#eeecf5]">
                                  {billPayments.map((payment) => (
                                    <li
                                      key={payment.id}
                                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                                    >
                                      <div>
                                        <p className="text-xs font-bold text-slate-800">
                                          {payment.is_refund ? "Refund" : "Payment"} ·{" "}
                                          {payment.payment_mode || "Other"}
                                        </p>
                                        <p className="mt-0.5 text-[11px] text-slate-500">
                                          {formatDate(payment.payment_date)}
                                        </p>
                                      </div>
                                      <p
                                        className={`text-sm font-bold tabular-nums ${
                                          payment.is_refund ? "text-rose-600" : "text-emerald-700"
                                        }`}
                                      >
                                        {payment.is_refund ? "-" : "+"}
                                        {formatCurrency(payment.amount)}
                                      </p>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {bill.notes && (
                              <p className="rounded-xl border border-violet-100 bg-white px-4 py-3 text-xs leading-5 text-slate-600">
                                <span className="font-bold text-slate-800">Note: </span>
                                {bill.notes}
                              </p>
                            )}

                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {bill.attachment_url && (
                                <Button
                                  asChild
                                  variant="outline"
                                  size="sm"
                                  className="h-9 gap-2 rounded-xl border-violet-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-violet-50"
                                >
                                  <a href={bill.attachment_url} target="_blank" rel="noopener noreferrer">
                                    <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                                    Offline bill
                                  </a>
                                </Button>
                              )}
                              <Button
                                asChild
                                variant="outline"
                                size="sm"
                                className="h-9 gap-2 rounded-xl border-violet-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-violet-50"
                              >
                                <Link to={`/bills/${bill.id}`}>
                                  Open full bill
                                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                                </Link>
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          )}

          {/* PAYMENTS TAB */}

          {activeTab === "payments" && (
            <Card className={cardClass}>
              <SectionHeader
                icon={CreditCard}
                title="Payment history"
                description={`${payments.length} ${payments.length === 1 ? "record" : "records"} · net ${formatCurrency(calc.totalReceived)}`}
              />

              {payments.length === 0 ? (
                <EmptyState
                  icon={CreditCard}
                  title="No payments recorded"
                  description="Payments received from this customer will appear here."
                />
              ) : (
                <ul className="divide-y divide-[#eeecf5]">
                  {payments.map((payment) => {
                    const relatedBill = bills.find((bill) => bill.id === payment.bill_id)
                    const refund = Boolean(payment.is_refund)

                    return (
                      <li
                        key={payment.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 transition-colors hover:bg-[#f9f8ff] sm:px-5"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                              refund ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            <ArrowDownLeft
                              className={`h-5 w-5 ${refund ? "rotate-180" : ""}`}
                              aria-hidden="true"
                            />
                          </div>

                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900">
                              {payment.payment_mode || "Payment"}
                              {payment.is_advance && (
                                <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                                  Advance
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {formatDate(payment.payment_date)} ·{" "}
                              {relatedBill ? relatedBill.bill_number : "No bill reference"}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <p
                            className={`text-base font-bold tabular-nums ${
                              refund ? "text-rose-600" : "text-emerald-700"
                            }`}
                          >
                            {refund ? "-" : "+"}
                            {formatCurrency(payment.amount)}
                          </p>
                          <span
                            className={`mt-1 inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                              refund
                                ? "border-rose-200 bg-rose-100 text-rose-700"
                                : "border-emerald-200 bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {refund ? "Refunded" : "Received"}
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          )}

          {/* ADVANCES TAB */}

          {activeTab === "advances" && (
            <Card className={cardClass}>
              <SectionHeader
                icon={Wallet}
                title="Advance history"
                description="Customer deposits and what is left of each."
              />

              {advances.length === 0 ? (
                <EmptyState
                  icon={Wallet}
                  title="No advance records"
                  description="No advance payments have been recorded for this customer."
                />
              ) : (
                <ul className="divide-y divide-[#eeecf5]">
                  {advances.map((advance) => {
                    const original = num(advance.amount)
                    const remaining = num(advance.remaining_amount)
                    const adjusted = Math.max(0, original - remaining)
                    const usedPercent =
                      original > 0 ? Math.min(100, Math.round((adjusted / original) * 100)) : 0

                    return (
                      <li key={advance.id} className="p-4 sm:p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-slate-900">Advance deposit</p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {advance.created_at ? formatDate(advance.created_at.split("T")[0]) : "—"}
                            </p>
                          </div>

                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                              remaining > 0
                                ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                                : "border-slate-200 bg-slate-100 text-slate-600"
                            }`}
                          >
                            {remaining > 0 ? "Available" : "Fully used"}
                          </span>
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-3">
                          <MiniStat label="Received" value={formatCurrency(original)} />
                          <MiniStat label="Adjusted" value={formatCurrency(adjusted)} />
                          <MiniStat label="Remaining" value={formatCurrency(remaining)} tone="emerald" />
                        </div>

                        <div
                          className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-100"
                          role="progressbar"
                          aria-label="Advance used"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={usedPercent}
                        >
                          <div
                            className="h-full rounded-full bg-violet-500 transition-all duration-500"
                            style={{ width: `${usedPercent}%` }}
                          />
                        </div>
                        <p className="mt-1.5 text-[11px] text-slate-500">{usedPercent}% used</p>

                        {advance.notes && (
                          <p className="mt-2 text-xs text-slate-600">{advance.notes}</p>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          )}

          {/* STATEMENT TAB */}

          {activeTab === "statement" && (
            <Card className={cardClass}>
              <SectionHeader
                icon={History}
                title="Account statement"
                description="Bills, payments and advances in date order."
              />

              {statement.rows.length === 0 ? (
                <EmptyState
                  icon={History}
                  title="No account activity"
                  description="Bills and payments will build this statement."
                />
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3 sm:px-5">
                    <MiniStat label="Total billed (debit)" value={formatCurrency(statement.totalDebit)} />
                    <MiniStat
                      label="Total paid (credit)"
                      value={formatCurrency(statement.totalCredit)}
                      tone="emerald"
                    />
                    <MiniStat
                      label={statement.closing >= 0 ? "Closing balance (owes)" : "Closing balance (credit)"}
                      value={formatCurrency(Math.abs(statement.closing))}
                      tone={statement.closing > 0 ? "rose" : "emerald"}
                    />
                  </div>

                  <div className="overflow-x-auto px-3 pb-3 sm:px-4">
                    <table className="w-full min-w-[680px] text-left">
                      <caption className="sr-only">Account statement</caption>
                      <thead>
                        <tr className="bg-[#f5f3fc] text-[11px] font-semibold text-slate-600">
                          <th scope="col" className="rounded-l-xl px-3 py-3">Date</th>
                          <th scope="col" className="px-3 py-3">Description</th>
                          <th scope="col" className="px-3 py-3 text-right">Debit</th>
                          <th scope="col" className="px-3 py-3 text-right">Credit</th>
                          <th scope="col" className="rounded-r-xl px-3 py-3 text-right">Balance</th>
                        </tr>
                      </thead>

                      <tbody>
                        {statement.rows.map((row) => (
                          <tr
                            key={row.id}
                            className="border-b border-[#eeecf5] transition-colors last:border-0 hover:bg-[#f9f8ff]"
                          >
                            <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">
                              {row.date ? formatDate(row.date) : "—"}
                            </td>
                            <td className="px-3 py-3">
                              <p className="text-xs font-bold text-slate-800">{row.description}</p>
                              <p className="mt-0.5 text-[11px] text-slate-500">{row.reference}</p>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold tabular-nums text-rose-600">
                              {row.debit > 0 ? formatCurrency(row.debit) : "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold tabular-nums text-emerald-700">
                              {row.credit > 0 ? formatCurrency(row.credit) : "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-bold tabular-nums text-slate-900">
                              {formatCurrency(Math.abs(row.balance))}
                              <span className="ml-1 text-[10px] font-semibold text-slate-400">
                                {row.balance > 0 ? "Dr" : row.balance < 0 ? "Cr" : ""}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="border-t border-[#eeecf5] px-5 py-3 text-[11px] leading-4 text-slate-500">
                    Dr means the customer owes you. Cr means you owe the customer (advance or refund
                    due).
                  </p>
                </>
              )}
            </Card>
          )}
        </div>

        {/* RIGHT COLUMN */}

        <div className="space-y-4">
          {/* CONTACT */}

          <Card className={cardClass}>
            <SectionHeader icon={UserRound} title="Contact details" description="How to reach this customer." />

            <CardContent className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-1">
              <DetailRow label="Mobile number" value={customer.mobile} icon={Phone} />
              <DetailRow label="WhatsApp" value={customer.whatsapp} icon={MessageCircle} />
              <DetailRow
                label="Customer type"
                value={customer.customer_type || "Individual"}
                icon={Building2}
              />
              <DetailRow label="GSTIN" value={customer.gstin} icon={FileText} />
              <div className="sm:col-span-2 xl:col-span-1">
                <DetailRow label="Address" value={address} icon={MapPin} />
              </div>
            </CardContent>
          </Card>

          {/* DUE OVERVIEW */}

          <Card className={cardClass}>
            <SectionHeader icon={Clock3} title="Due overview" description="Pending payment deadlines." />

            <CardContent className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-3">
                <MiniStat
                  label="Overdue"
                  value={formatCurrency(calc.overdueAmount)}
                  note={
                    calc.overdueBills.length > 0
                      ? `${calc.overdueBills.length} ${calc.overdueBills.length === 1 ? "bill" : "bills"} · oldest ${calc.oldestOverdueDays}d`
                      : "Nothing overdue"
                  }
                  tone={calc.overdueAmount > 0 ? "rose" : "slate"}
                />
                <MiniStat
                  label="Due today"
                  value={formatCurrency(calc.dueTodayAmount)}
                  note={`${calc.dueTodayBills.length} ${calc.dueTodayBills.length === 1 ? "bill" : "bills"}`}
                  tone={calc.dueTodayAmount > 0 ? "amber" : "slate"}
                />
              </div>

              <div className="flex items-center justify-between border-t border-[#eeecf5] pt-3">
                <span className="text-sm text-slate-600">Pending bills</span>
                <span className="text-sm font-bold tabular-nums text-slate-900">
                  {calc.unpaidBills.length}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* PERFORMANCE */}

          <Card className={cardClass}>
            <SectionHeader
              icon={TrendingUp}
              title="Account health"
              description="How much of the billing was collected."
            />

            <CardContent className="space-y-4 p-5">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-emerald-800">Collection rate</p>
                    <p className="mt-2 text-[28px] font-extrabold leading-none tracking-tight text-slate-900 tabular-nums">
                      {calc.collectionRate}%
                    </p>
                    <p className="mt-1.5 text-xs text-slate-600">
                      {formatCurrency(calc.collected)} of {formatCurrency(calc.totalPurchase)}
                    </p>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm">
                    <Wallet className="h-5 w-5" aria-hidden="true" />
                  </div>
                </div>

                <div
                  className="mt-4 h-2.5 overflow-hidden rounded-full bg-rose-100"
                  role="progressbar"
                  aria-label="Collection rate"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={calc.collectionRate}
                >
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all duration-500"
                    style={{ width: `${calc.collectionRate}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2.5">
                <KeyValue label="Average bill value" value={formatCurrency(calc.averageBill)} />
                <KeyValue
                  label="Last bill"
                  value={calc.lastBillDate ? formatDate(calc.lastBillDate) : "—"}
                />
                <KeyValue
                  label="Last payment"
                  value={calc.lastPaymentDate ? formatDate(calc.lastPaymentDate) : "—"}
                />
                <KeyValue label="Advance adjusted" value={formatCurrency(calc.advanceAdjusted)} />
              </div>
            </CardContent>
          </Card>

          {/* NOTES */}

          {customer.notes && (
            <Card className={cardClass}>
              <SectionHeader icon={FileText} title="Customer notes" />
              <CardContent className="p-5">
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{customer.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* FOOTER */}

      <footer className="flex flex-col justify-between gap-2 rounded-xl border border-white/80 bg-white/65 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <UserRound className="h-4 w-4 text-emerald-700" aria-hidden="true" />
          <span>
            Customer:
            <strong className="ml-1 text-slate-700">{customer.name}</strong>
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
    </div>
  )
}