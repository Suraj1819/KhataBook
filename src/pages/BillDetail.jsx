import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatDate, PAYMENT_MODES } from "@/lib/utils"
import { generateBillPDF, createBillPDFBlob } from "@/lib/pdf"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
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
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Copy,
  CreditCard,
  Download,
  Eye,
  FileText,
  FileSpreadsheet,
  FileDown,
  Image as ImageIcon,
  IndianRupee,
  Loader2,
  MapPin,
  MessageCircle,
  NotebookText,
  Phone,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  ShoppingBag,
  Store,
  Trash2,
  User,
  Wallet,
  ZoomIn,
  ZoomOut,
} from "lucide-react"

import { toast } from "sonner"

/* ==================================================
   CONSTANTS & HELPERS
================================================== */

const ATTACHMENT_BUCKET = "bill_attachments"

const cardClass =
  "overflow-hidden rounded-[20px] border border-white/80 dark:border-slate-700 bg-white/85 dark:bg-slate-900/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)] backdrop-blur-sm"

const fieldClass =
  "h-11 rounded-xl border-violet-100 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20"

const num = (value) => Number(value) || 0
const round2 = (value) => Math.round(num(value) * 100) / 100

function getLocalDateString() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
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

/** Single source of truth for every money figure on the page. */
function computeTotals(bill) {
  if (!bill) return null

  const grandTotal = round2(bill.grand_total)
  const amountPaid = round2(bill.amount_paid)
  const advanceAdjusted = round2(bill.advance_adjusted)
  const amountDue = round2(
    bill.amount_due ?? Math.max(0, grandTotal - amountPaid - advanceAdjusted)
  )
  const totalReceived = round2(amountPaid + advanceAdjusted)
  const paidPercent = grandTotal > 0 ? Math.min(100, Math.max(0, (totalReceived / grandTotal) * 100)) : 0
  const totalTax = round2(num(bill.cgst_amount) + num(bill.sgst_amount) + num(bill.igst_amount))

  return { grandTotal, amountPaid, advanceAdjusted, amountDue, totalReceived, paidPercent, totalTax }
}

function getBillStatus(totals) {
  if (totals.amountDue <= 0) return "paid"
  if (totals.totalReceived > 0) return "partial"
  return "unpaid"
}

/** Human readable due-date summary. */
function getDueInfo(bill, totals, today) {
  if (totals.amountDue <= 0) return { text: "Settled in full", tone: "emerald" }
  if (!bill.due_date) return { text: "No due date set", tone: "slate" }

  const diff = daysBetween(today, bill.due_date.slice(0, 10))
  if (diff < 0) {
    const days = Math.abs(diff)
    return { text: `Overdue by ${days} ${days === 1 ? "day" : "days"}`, tone: "red", overdueDays: days }
  }
  if (diff === 0) return { text: "Due today", tone: "amber" }
  return { text: `Due in ${diff} ${diff === 1 ? "day" : "days"}`, tone: diff <= 3 ? "amber" : "slate" }
}

function isImageUrl(url = "") {
  return /\.(jpe?g|png|gif|webp)(\?.*)?$/i.test(url)
}

function getStoragePath(url) {
  const parts = url.split(`/${ATTACHMENT_BUCKET}/`)
  if (parts.length < 2) throw new Error("Invalid attachment URL format")
  return decodeURIComponent(parts[1].split("?")[0])
}

function normalizeIndianMobile(mobile = "") {
  let digits = String(mobile ?? "").replace(/\D/g, "")
  if (digits.length === 10) digits = `91${digits}`
  if (digits.startsWith("0091") && digits.length === 14) digits = digits.slice(2)
  return digits.length >= 11 && digits.length <= 15 ? digits : ""
}

/* Amount in words (Indian numbering: thousand, lakh, crore) */
const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
]
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

function belowThousand(n) {
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  const parts = []
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`)
  if (rest) {
    parts.push(
      rest < 20 ? ONES[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? ` ${ONES[rest % 10]}` : ""}`
    )
  }
  return parts.join(" ")
}

function numberToIndianWords(n) {
  if (n === 0) return "Zero"
  const units = [
    [10000000, "Crore"],
    [100000, "Lakh"],
    [1000, "Thousand"],
  ]
  let remaining = n
  const parts = []
  for (const [value, name] of units) {
    const count = Math.floor(remaining / value)
    if (count) {
      parts.push(`${numberToIndianWords(count)} ${name}`)
      remaining %= value
    }
  }
  if (remaining) parts.push(belowThousand(remaining))
  return parts.join(" ")
}

function amountInWords(amount) {
  const value = round2(amount)
  const rupees = Math.floor(value)
  const paise = Math.round((value - rupees) * 100)
  let text = `Rupees ${numberToIndianWords(rupees)}`
  if (paise) text += ` and ${numberToIndianWords(paise)} Paise`
  return `${text} Only`
}

/* ==================================================
   SMALL UI PIECES
================================================== */

function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 dark:bg-slate-800 ${className}`} />
}

function PageSkeleton() {
  return (
    <div
      className="min-h-full w-full space-y-4 rounded-2xl bg-[#f7f5ff] dark:bg-slate-950 px-3 py-5 sm:px-5 lg:px-6"
      aria-busy="true"
      aria-label="Loading bill"
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
  green: "bg-emerald-100/80 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300",
  blue: "bg-blue-100/80 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300",
  pink: "bg-pink-100/80 dark:bg-pink-950/50 text-pink-700 dark:text-pink-300",
  purple: "bg-violet-100/80 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300",
  amber: "bg-amber-100/80 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300",
}

const ACCENTS = {
  green: "text-emerald-700 dark:text-emerald-300",
  blue: "text-blue-700 dark:text-blue-300",
  pink: "text-pink-700 dark:text-pink-300",
  purple: "text-violet-700 dark:text-violet-300",
  amber: "text-amber-700 dark:text-amber-300",
}

function SummaryCard({ label, value, detail, icon: Icon, tone = "green", valueClass = "text-[#151934] dark:text-slate-100", children }) {
  return (
    <Card className="overflow-hidden rounded-[20px] border border-white/80 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 shadow-[0_4px_15px_rgba(80,65,130,0.07)] backdrop-blur-sm">
      <CardContent className="p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-4">
          <div
            className={`flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full ${TONES[tone]}`}
          >
            <Icon className="h-7 w-7" strokeWidth={1.9} aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-slate-600 dark:text-slate-300">{label}</p>
            <h3
              className={`mt-1.5 break-words text-[23px] font-bold leading-tight tracking-tight tabular-nums ${valueClass}`}
            >
              {value}
            </h3>
            <p className={`mt-1.5 text-xs font-semibold ${ACCENTS[tone]}`}>{detail}</p>
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

function SectionHeader({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-stretch gap-3 border-b border-[#eae7f4] dark:border-slate-700 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300">
          <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </div>

        <div className="min-w-0">
          <h2 className="whitespace-nowrap text-[16px] font-bold tracking-tight text-[#171a36] dark:text-slate-100">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
      </div>

      {action}
    </div>
  )
}

function Panel({ icon, title, description, action, children, className = "" }) {
  return (
    <Card className={`${cardClass} ${className}`}>
      <SectionHeader icon={icon} title={title} description={description} action={action} />
      {children}
    </Card>
  )
}

const STATUS_STYLES = {
  paid: { label: "Paid", className: "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800", icon: CheckCircle2 },
  partial: { label: "Partially paid", className: "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/60", icon: Clock3 },
  unpaid: { label: "Unpaid", className: "bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900/60", icon: CircleAlert },
  overdue: { label: "Overdue", className: "bg-rose-600 text-white border-rose-600", icon: AlertCircle },
}

function StatusPill({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.unpaid
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
    <div className="flex min-h-[180px] flex-col items-center justify-center px-5 py-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-300">
        <Icon className="h-7 w-7" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
      {description && <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>}
    </div>
  )
}

function ErrorBanner({ message, onRetry }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 px-4 py-3"
    >
      <div className="flex items-center gap-2 text-sm text-rose-700 dark:text-rose-300">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Could not load your latest figures. Check your connection and try again.
          <span className="ml-1 text-xs text-rose-500">({message})</span>
        </span>
      </div>

      <Button size="sm" variant="outline" onClick={onRetry} className="shrink-0 border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-900 shadow-sm">
        Try again
      </Button>
    </div>
  )
}

function AmountRow({ label, value, valueClass = "text-slate-800 dark:text-slate-200", bold = false }) {
  return (
    <div className="flex items-center justify-between gap-6 py-1.5 text-sm">
      <span className={bold ? "font-bold text-slate-900 dark:text-slate-100" : "text-slate-600 dark:text-slate-300"}>{label}</span>
      <span className={`tabular-nums ${bold ? "font-bold" : "font-semibold"} ${valueClass}`}>{value}</span>
    </div>
  )
}

function InfoRow({ label, children }) {
  if (children === null || children === undefined || children === "") return null
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="text-[13px] text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-right text-[13px] font-semibold text-slate-800 dark:text-slate-200">{children}</dd>
    </div>
  )
}

function ContactLine({ icon: Icon, children, align = "center" }) {
  return (
    <div className={`flex ${align === "start" ? "items-start" : "items-center"} gap-3 text-sm text-slate-600 dark:text-slate-300`}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  )
}

function Avatar({ name, className = "bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300" }) {
  return (
    <div
      aria-hidden="true"
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold ${className}`}
    >
      {getInitials(name)}
    </div>
  )
}

/* ==================================================
   PAGE SECTIONS
================================================== */

function PageHeader({
  bill,
  customer,
  shopName,
  status,
  overdue,
  refreshing,
  isFullyPaid,
  onRefresh,
  onPreview,
  onDownload,
  onShareInvoice,
  sharingInvoice,
  onRecordPayment,
}) {
  async function copyBillNumber() {
    try {
      await navigator.clipboard.writeText(bill.bill_number || "")
      toast.success("Bill number copied")
    } catch {
      toast.error("Could not copy bill number")
    }
  }

  const currentDateLabel = new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date())

  const actionButtonClass =
    "inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm font-medium leading-none text-slate-700 dark:text-slate-300 shadow-sm transition-all duration-200 hover:-translate-y-px hover:border-violet-300 dark:hover:border-slate-500 hover:bg-violet-50 dark:hover:bg-slate-800 hover:text-violet-800 dark:hover:text-violet-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 sm:w-auto sm:px-4"

  return (
    <header className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
        <Button
          asChild
          variant="outline"
          size="icon"
          aria-label="Back to bills"
          className="mt-1 h-11 w-11 shrink-0 rounded-xl border border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm transition-all hover:-translate-y-px hover:border-violet-300 dark:hover:border-slate-500 hover:bg-violet-50 dark:hover:bg-slate-800 hover:shadow-md"
        >
          <Link to="/bills">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>

        <div className="min-w-0 flex-1">
          <nav
            aria-label="Breadcrumb"
            className="mb-1 hidden min-w-0 items-center gap-1.5 overflow-hidden text-xs font-medium text-slate-500 dark:text-slate-400 sm:flex"
          >
            <span className="max-w-[140px] truncate">{shopName || "Workspace"}</span>
            <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
            <Link to="/bills" className="shrink-0 transition-colors hover:text-slate-800 dark:hover:text-slate-100">
              Bills
            </Link>
            <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{bill.bill_number || "Bill details"}</span>
          </nav>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="max-w-full truncate text-xl font-bold leading-tight tracking-tight text-[#171a39] dark:text-slate-100 sm:text-[30px]">
              {bill.bill_number || "Bill details"}
            </h1>
            <StatusPill status={status} />
            {overdue && <StatusPill status="overdue" />}
            {bill.bill_number && (
              <button
                type="button"
                onClick={copyBillNumber}
                className="shrink-0 rounded-lg p-1.5 text-slate-400 dark:text-slate-500 transition-colors hover:bg-white dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                aria-label="Copy bill number"
                title="Copy bill number"
              >
                <Copy className="h-4 w-4" />
              </button>
            )}
          </div>

          <p className="mt-1 break-words text-xs leading-5 text-slate-600 dark:text-slate-300 sm:text-sm">
            {bill.bill_date ? (
              <>
                Issued on{" "}
                <strong className="font-semibold text-slate-800 dark:text-slate-200">{formatDate(bill.bill_date)}</strong>
              </>
            ) : (
              "Bill information, customer details and payment records"
            )}
            {customer.name && (
              <>
                {" "}for <strong className="font-semibold text-slate-800 dark:text-slate-200">{customer.name}</strong>
              </>
            )}
            .
          </p>
        </div>
      </div>

      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center lg:w-auto lg:justify-end">
        <div
          className="col-span-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm font-medium leading-none text-slate-700 dark:text-slate-300 shadow-sm sm:col-span-1 sm:w-auto sm:px-4"
          aria-label={`Today, ${currentDateLabel}`}
          title={`Today, ${currentDateLabel}`}
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span className="whitespace-nowrap">
            <span className="mr-1.5">Today,</span>
            <span>{currentDateLabel}</span>
          </span>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label={refreshing ? "Refreshing bill" : "Refresh bill"}
          title={refreshing ? "Refreshing..." : "Refresh bill"}
          className={actionButtonClass}
        >
          <RefreshCw className={`h-4 w-4 shrink-0 ${refreshing ? "animate-spin" : ""}`} />
          <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={onPreview}
          className={actionButtonClass}
        >
          <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Preview</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={onShareInvoice}
          disabled={sharingInvoice}
          className={`${actionButtonClass} col-span-2 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-800 dark:hover:text-emerald-300 sm:col-span-1`}
        >
          {sharingInvoice ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
          ) : (
            <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>{sharingInvoice ? "Preparing..." : "WhatsApp invoice"}</span>
        </Button>

        {!isFullyPaid && (
          <Button
            type="button"
            onClick={onRecordPayment}
            className={`${actionButtonClass} col-span-2 sm:col-span-1`}
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Record payment</span>
          </Button>
        )}
      </div>
    </header>
  )
}

function ItemsCard({ bill, items, onExportCSV, onExportPDF }) {
  const totalQty = items.reduce((sum, item) => sum + num(item.quantity), 0)
  const itemsTotal = round2(items.reduce((sum, item) => sum + num(item.total_amount), 0))
  const itemsTaxable = round2(items.reduce((sum, item) => sum + num(item.taxable_amount), 0))

  return (
    <Panel
      icon={ShoppingBag}
      title="Bill items"
      description={`${items.length} ${items.length === 1 ? "item" : "items"} · ${totalQty} total quantity`}
      action={
        <div className="flex w-full min-w-0 items-center justify-end gap-2 sm:w-auto sm:shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onExportCSV}
            className="h-9 min-w-0 flex-1 gap-1.5 rounded-xl border border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs font-medium text-slate-700 dark:text-slate-300 shadow-sm transition-all hover:-translate-y-px hover:bg-violet-50 dark:hover:bg-slate-800 hover:text-violet-800 dark:hover:text-violet-300 hover:shadow-md sm:flex-none sm:px-3"
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Export CSV</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onExportPDF}
            className="h-9 min-w-0 flex-1 gap-1.5 rounded-xl border border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs font-medium text-slate-700 dark:text-slate-300 shadow-sm transition-all hover:-translate-y-px hover:bg-violet-50 dark:hover:bg-slate-800 hover:text-violet-800 dark:hover:text-violet-300 hover:shadow-md sm:flex-none sm:px-3"
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Export PDF</span>
          </Button>
        </div>
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No bill items found"
          description={
            bill.attachment_url
              ? "This bill was saved with an offline copy. See the attached bill."
              : "No item details were saved for this bill."
          }
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden overflow-x-auto px-3 pb-3 pt-3 sm:px-4 md:block">
            <table className="w-full min-w-[760px] text-left">
              <caption className="sr-only">Items in {bill.bill_number}</caption>
              <thead>
                <tr className="bg-[#f5f3fc] dark:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  <th scope="col" className="w-12 rounded-l-xl px-3 py-3">#</th>
                  <th scope="col" className="px-3 py-3">Item</th>
                  <th scope="col" className="px-3 py-3 text-right">Qty</th>
                  <th scope="col" className="px-3 py-3 text-right">Rate</th>
                  <th scope="col" className="px-3 py-3 text-right">Discount</th>
                  <th scope="col" className="px-3 py-3 text-right">Taxable</th>
                  <th scope="col" className="px-3 py-3 text-right">GST</th>
                  <th scope="col" className="rounded-r-xl px-3 py-3 text-right">Amount</th>
                </tr>
              </thead>

              <tbody>
                {items.map((item, index) => (
                  <tr
                    key={item.id || index}
                    className="border-b border-[#eeecf5] dark:border-slate-700 transition-colors last:border-0 hover:bg-[#f9f8ff] dark:hover:bg-slate-800"
                  >
                    <td className="px-3 py-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-950/50 text-[11px] font-bold text-violet-700 dark:text-violet-300">
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{item.item_name || "Item"}</p>
                      {item.description && (
                        <p className="mt-0.5 max-w-xs text-[11px] text-slate-500 dark:text-slate-400">{item.description}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">
                      {num(item.quantity)} {item.unit || ""}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">
                      {formatCurrency(item.rate)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">
                      {num(item.discount) > 0 ? `-${formatCurrency(item.discount)}` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">
                      {formatCurrency(item.taxable_amount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">
                      {num(item.gst_percent)}%
                      <span className="mt-0.5 block text-[11px] text-slate-400 dark:text-slate-500">
                        {formatCurrency(item.gst_amount)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-bold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatCurrency(item.total_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="border-t border-[#eae7f4] dark:border-slate-700 bg-[#faf9ff] dark:bg-slate-800/70">
                  <td className="px-3 py-3.5" />
                  <td className="px-3 py-3.5 text-xs font-bold text-slate-700 dark:text-slate-300">Total</td>
                  <td className="px-3 py-3.5 text-right text-xs font-bold tabular-nums text-slate-700 dark:text-slate-300">
                    {totalQty}
                  </td>
                  <td colSpan={2} />
                  <td className="px-3 py-3.5 text-right text-xs font-bold tabular-nums text-slate-700 dark:text-slate-300">
                    {formatCurrency(itemsTaxable)}
                  </td>
                  <td />
                  <td className="px-3 py-3.5 text-right text-sm font-bold tabular-nums text-slate-950 dark:text-slate-50">
                    {formatCurrency(itemsTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile */}
          <div className="divide-y divide-[#eeecf5] dark:divide-slate-800 md:hidden">
            {items.map((item, index) => (
              <div key={item.id || index} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-950/50 text-[11px] font-bold text-violet-700 dark:text-violet-300">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="break-words text-sm font-bold text-slate-900 dark:text-slate-100">
                        {item.item_name || "Item"}
                      </p>
                      {item.description && (
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.description}</p>
                      )}
                    </div>
                  </div>
                  <p className="shrink-0 text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatCurrency(item.total_amount)}
                  </p>
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-[#ece9f5] dark:border-slate-700 bg-[#faf9ff] dark:bg-slate-800/70 p-3">
                  {[
                    ["Quantity", `${num(item.quantity)} ${item.unit || ""}`],
                    ["Rate", formatCurrency(item.rate)],
                    ["Discount", num(item.discount) > 0 ? `-${formatCurrency(item.discount)}` : "—"],
                    ["Taxable", formatCurrency(item.taxable_amount)],
                    ["GST", `${num(item.gst_percent)}% · ${formatCurrency(item.gst_amount)}`],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[11px] text-slate-500 dark:text-slate-400">{label}</dt>
                      <dd className="mt-0.5 text-xs font-semibold text-slate-700 dark:text-slate-300">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}

            <div className="flex items-center justify-between bg-[#faf9ff] dark:bg-slate-800/70 px-4 py-3.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Total ({totalQty} qty)</span>
              <span className="text-sm font-bold tabular-nums text-slate-950 dark:text-slate-50">
                {formatCurrency(itemsTotal)}
              </span>
            </div>
          </div>
        </>
      )}
    </Panel>
  )
}

function AmountBreakdownCard({ bill, totals }) {
  return (
    <Panel icon={IndianRupee} title="Amount breakdown" description="How the final amount is calculated">
      <CardContent className="space-y-4 p-5">
        <div className="divide-y divide-[#eeecf5] dark:divide-slate-800">
          <div className="pb-2">
            <AmountRow label="Subtotal" value={formatCurrency(bill.subtotal)} />
            {num(bill.discount_amount) > 0 && (
              <AmountRow
                label="Discount"
                value={`- ${formatCurrency(bill.discount_amount)}`}
                valueClass="text-emerald-600"
              />
            )}
            <AmountRow label="Taxable amount" value={formatCurrency(bill.taxable_amount)} />
          </div>

          <div className="py-2">
            {num(bill.cgst_amount) > 0 && <AmountRow label="CGST" value={formatCurrency(bill.cgst_amount)} />}
            {num(bill.sgst_amount) > 0 && <AmountRow label="SGST" value={formatCurrency(bill.sgst_amount)} />}
            {num(bill.igst_amount) > 0 && <AmountRow label="IGST" value={formatCurrency(bill.igst_amount)} />}
            <AmountRow label="Total GST" value={formatCurrency(bill.total_gst ?? totals.totalTax)} />
            {num(bill.round_off) !== 0 && (
              <AmountRow label="Round off" value={formatCurrency(bill.round_off)} />
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Grand total</span>
            <span className="text-2xl font-extrabold tracking-tight tabular-nums text-slate-900 dark:text-slate-100">
              {formatCurrency(totals.grandTotal)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-dashed border-violet-200 dark:border-slate-700 bg-[#faf9ff] dark:bg-slate-800/70 px-4 py-3">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Amount in words</p>
          <p className="mt-1 text-sm font-medium leading-5 text-slate-800 dark:text-slate-200">
            {amountInWords(totals.grandTotal)}
          </p>
        </div>
      </CardContent>
    </Panel>
  )
}

function PaymentSummaryCard({ totals, isFullyPaid, dueInfo, onRecordPayment }) {
  const dueText = {
    slate: "text-slate-500 dark:text-slate-400",
    emerald: "text-emerald-700 dark:text-emerald-300",
    amber: "text-amber-700 dark:text-amber-300",
    red: "text-rose-700 dark:text-rose-300",
  }[dueInfo.tone]

  return (
    <Panel icon={Wallet} title="Payment summary" description="Received and remaining amounts">
      <CardContent className="space-y-4 p-5">
        <div>
          <AmountRow label="Grand total" value={formatCurrency(totals.grandTotal)} />
          {totals.advanceAdjusted > 0 && (
            <AmountRow
              label="Advance adjusted"
              value={`- ${formatCurrency(totals.advanceAdjusted)}`}
              valueClass="text-emerald-600"
            />
          )}
          <AmountRow
            label="Payments received"
            value={`- ${formatCurrency(totals.amountPaid)}`}
            valueClass="text-emerald-600"
          />
        </div>

        <div
          className={`rounded-2xl border p-4 ${
            isFullyPaid ? "border-emerald-100 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30" : "border-rose-100 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className={`text-sm font-semibold ${isFullyPaid ? "text-emerald-800 dark:text-emerald-200" : "text-rose-700 dark:text-rose-300"}`}>
              Balance due
            </span>
            <span
              className={`text-2xl font-extrabold tracking-tight tabular-nums ${
                isFullyPaid ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"
              }`}
            >
              {formatCurrency(totals.amountDue)}
            </span>
          </div>
          <p className={`mt-1.5 flex items-center gap-1.5 text-xs font-semibold ${dueText}`}>
            {isFullyPaid ? (
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {dueInfo.text}
          </p>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium text-slate-600 dark:text-slate-300">Collected</span>
            <span className="font-bold tabular-nums text-slate-800 dark:text-slate-200">{Math.round(totals.paidPercent)}%</span>
          </div>
          <div
            className="h-2.5 overflow-hidden rounded-full bg-rose-100 dark:bg-rose-950/50"
            role="progressbar"
            aria-label="Amount collected"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(totals.paidPercent)}
          >
            <div
              className="h-full rounded-full bg-emerald-600 transition-all duration-500"
              style={{ width: `${totals.paidPercent}%` }}
            />
          </div>
        </div>

        {!isFullyPaid && (
          <Button
            type="button"
            onClick={onRecordPayment}
            className="h-11 w-full gap-2 rounded-xl border border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold text-slate-700 dark:text-slate-300 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Record payment
          </Button>
        )}
      </CardContent>
    </Panel>
  )
}

function PaymentHistoryCard({ bill, payments, advanceAllocations = [], totals, isFullyPaid, dueInfo, onAddPayment, shop, customer }) {
  const events = useMemo(() => {
    const allocatedTotal = round2(
      advanceAllocations.reduce((sum, allocation) => sum + num(allocation.amount), 0)
    )
    // Older bills may have an advance_adjusted value without allocation rows.
    // Preserve that legacy amount as one fallback event, without duplicating newer rows.
    const legacyAdvance = round2(Math.max(0, totals.advanceAdjusted - allocatedTotal))

    const transactions = [
      ...advanceAllocations.map((allocation) => ({
        key: `advance-${allocation.id}`,
        type: "advance",
        title: "Advance adjusted",
        date: allocation.created_at?.slice(0, 10) || bill.bill_date,
        stamp: allocation.created_at || "",
        amount: num(allocation.amount),
      })),
      ...payments.map((payment) => ({
        key: `payment-${payment.id}`,
        type: payment.is_refund ? "refund" : "payment",
        title: `${payment.is_refund ? "Refund" : "Payment"} · ${payment.payment_mode || "Other"}`,
        date: payment.payment_date,
        stamp: payment.created_at || "",
        amount: num(payment.allocated_amount ?? payment.amount),
      })),
    ]

    if (legacyAdvance > 0.009) {
      transactions.push({
        key: "advance-legacy",
        type: "advance",
        title: "Advance adjusted",
        date: bill.bill_date,
        stamp: "",
        amount: legacyAdvance,
      })
    }

    transactions.sort((a, b) => {
      const byDate = String(a.date || "").localeCompare(String(b.date || ""))
      if (byDate) return byDate
      const byStamp = String(a.stamp || "").localeCompare(String(b.stamp || ""))
      if (byStamp) return byStamp
      return (a.type === "advance" ? 0 : 1) - (b.type === "advance" ? 0 : 1)
    })

    let balance = round2(totals.grandTotal)
    const list = [
      { key: "issued", type: "issued", title: "Bill issued", date: bill.bill_date, amount: totals.grandTotal },
    ]

    transactions.forEach((transaction) => {
      const isRefund = transaction.type === "refund"
      balance = isRefund
        ? round2(balance + transaction.amount)
        : Math.max(0, round2(balance - transaction.amount))
      list.push({ ...transaction, balance })
    })

    return list
  }, [bill.bill_date, payments, advanceAllocations, totals])

  function exportHistoryCSV() {
    try {
      const safeFileName = (value) =>
        (String(value || "Bill").trim() || "Bill")
          .replace(/[\\/:*?"<>|]+/g, "-")
          .replace(/\s+/g, "_")

      // Keep numeric cells numeric in Excel/Google Sheets, while protecting
      // text cells from CSV formula injection.
      const csvCell = (value) => {
        if (value === null || value === undefined) return '""'
        if (typeof value === "number" && Number.isFinite(value)) return String(value)

        let textValue = String(value)
        if (/^[\s]*[=+\-@\t\r]/.test(textValue)) textValue = `'${textValue}`
        return `"${textValue.replace(/"/g, '""')}"`
      }

      const paymentById = new Map((payments || []).map((payment) => [String(payment.id), payment]))
      const allocationById = new Map((advanceAllocations || []).map((allocation) => [String(allocation.id), allocation]))

      const rows = [
        ["KHAATAPRO - PAYMENT & ADVANCE HISTORY"],
        ["Report Generated", formatDate(getLocalDateString())],
        [],
        ["SHOP DETAILS"],
        ["Shop Name", shop?.name || "Shop"],
        ["Mobile", shop?.mobile || ""],
        ["Email", shop?.email || ""],
        ["Address", [shop?.address, shop?.city, shop?.state, shop?.pincode].filter(Boolean).join(", ")],
        ["GSTIN", shop?.gstin || ""],
        [],
        ["BILL & CUSTOMER DETAILS"],
        ["Bill Number", bill.bill_number || ""],
        ["Bill Date", bill.bill_date ? formatDate(bill.bill_date) : ""],
        ["Due Date", bill.due_date ? formatDate(bill.due_date) : ""],
        ["Customer Name", customer?.name || bill.customers?.name || "Walk-in customer"],
        ["Customer Mobile", customer?.mobile || bill.customers?.mobile || ""],
        ["Customer GSTIN", customer?.gstin || bill.customers?.gstin || ""],
        ["Payment Status", totals.amountDue <= 0 ? "Paid" : "Pending"],
        [],
        ["TRANSACTION LEDGER"],
        [
          "S. No.",
          "Transaction Date",
          "Transaction Type",
          "Description",
          "Payment Mode",
          "Reference / Transaction ID",
          "Notes",
          "Debit / Credit Amount (Rs.)",
          "Running Balance (Rs.)",
          "Record ID",
        ],
      ]

      const transactionRows = events.map((event, index) => {
        const eventKey = String(event.key || "")
        const paymentId = eventKey.startsWith("payment-") ? eventKey.slice("payment-".length) : ""
        const allocationId = eventKey.startsWith("advance-") && eventKey !== "advance-legacy"
          ? eventKey.slice("advance-".length)
          : ""
        const payment = paymentId ? paymentById.get(paymentId) : null
        const allocation = allocationId ? allocationById.get(allocationId) : null

        const transactionType = {
          issued: "Bill Issued",
          advance: "Advance Adjusted",
          payment: "Payment Received",
          refund: "Refund",
        }[event.type] || event.title || "Transaction"

        const signedAmount = event.type === "refund"
          ? -Number(event.amount || 0)
          : event.type === "issued"
            ? Number(event.amount || 0)
            : Number(event.amount || 0)

        return [
          index + 1,
          event.date ? formatDate(event.date) : "",
          transactionType,
          event.title || "",
          payment?.payment_mode || (event.type === "advance" ? "Customer Advance" : ""),
          payment?.reference_number || payment?.transaction_id || allocation?.advance_id || "",
          payment?.notes || allocation?.notes || "",
          Number.isFinite(signedAmount) ? signedAmount : 0,
          event.type === "issued" ? Number(event.amount || 0) : Number(event.balance || 0),
          payment?.id || allocation?.id || "",
        ]
      })

      rows.push(...transactionRows)
      rows.push(
        [],
        ["BILL SUMMARY"],
        ["Particulars", "Amount (Rs.)"],
        ["Subtotal", Number(bill.subtotal || 0)],
        ["Discount", Number(bill.discount_amount || 0)],
        ["Taxable Amount", Number(bill.taxable_amount || 0)],
        ["CGST", Number(bill.cgst_amount || 0)],
        ["SGST", Number(bill.sgst_amount || 0)],
        ["IGST", Number(bill.igst_amount || 0)],
        ["Grand Total", Number(totals.grandTotal || 0)],
        ["Advance Adjusted", Number(totals.advanceAdjusted || 0)],
        ["Payments Received", Number(totals.amountPaid || 0)],
        ["Pending Amount", Number(totals.amountDue || 0)],
        [],
        ["Note", "Amounts are in INR. Positive transaction amounts represent bill value, advance adjustment or payment; refunds are negative."],
      )

      // UTF-8 BOM improves Hindi/Unicode compatibility in Excel. The sep hint
      // tells desktop Excel to use commas as delimiters for this file.
      const csv = "\uFEFFsep=,\r\n" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n")
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `${safeFileName(bill.bill_number)}-payment-advance-history.csv`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1500)
      toast.success("Detailed payment history CSV exported")
    } catch (error) {
      console.error("Payment history CSV export error:", error)
      toast.error(error?.message || "Could not export payment history CSV")
    }
  }

  function exportHistoryPDF() {
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 10
      const contentWidth = pageWidth - margin * 2
      const ink = [17, 24, 39]
      const muted = [95, 102, 112]
      const line = [205, 210, 218]
      const soft = [247, 248, 250]
      const shopName = shop?.name || "Shop"
      const customerName = customer?.name || bill.customers?.name || "Walk-in customer"
      const billNumber = bill.bill_number || "Bill"
      const safeName = String(billNumber).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_")

      const setText = (size = 8, bold = false, color = ink) => {
        doc.setFont("helvetica", bold ? "bold" : "normal")
        doc.setFontSize(size)
        doc.setTextColor(...color)
      }

      const drawFooter = () => {
        const pageCount = doc.getNumberOfPages()
        for (let page = 1; page <= pageCount; page += 1) {
          doc.setPage(page)
          doc.setDrawColor(...line)
          doc.setLineWidth(0.25)
          doc.line(margin, pageHeight - 16, pageWidth - margin, pageHeight - 16)
          setText(7.5, true)
          doc.text("Thank you for your business!", margin, pageHeight - 11.5)
          setText(6.5, false, muted)
          const footerAddress = [shop?.address, shop?.city, shop?.state, shop?.pincode].filter(Boolean).join(", ")
          const footerText = footerAddress ? `${shopName}, ${footerAddress}` : shopName
          doc.text(doc.splitTextToSize(footerText, 125).slice(0, 2), margin, pageHeight - 8)
          setText(7, true)
          doc.text("E. & O.E.", pageWidth - margin - 22, pageHeight - 11.5, { align: "right" })
          setText(7, false, muted)
          doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 11.5, { align: "right" })
          doc.text("Computer-generated report", pageWidth - margin, pageHeight - 8, { align: "right" })
        }
      }

      // ===== INVOICE-STYLE HEADER (matching the supplied monochrome PDF) =====
      setText(15, true)
      doc.text("Payment & Advance History", pageWidth / 2, 14, { align: "center" })

      setText(10.5, true)
      doc.text(`Sold By: ${shopName}`, margin, 24)
      setText(8, false, muted)
      let shopY = 29
      const shopAddress = [shop?.address, shop?.city, shop?.state, shop?.pincode ? `PIN ${shop.pincode}` : ""]
        .filter(Boolean).join(", ")
      if (shopAddress) {
        const addressLines = doc.splitTextToSize(shopAddress, 112)
        doc.text(addressLines, margin, shopY)
        shopY += addressLines.length * 4
      }
      const shopContacts = [
        shop?.mobile ? `Mobile: ${shop.mobile}` : "",
        shop?.email ? `Email: ${shop.email}` : "",
        shop?.gstin ? `GSTIN: ${shop.gstin}` : "",
      ].filter(Boolean).join("  |  ")
      if (shopContacts) {
        const contactLines = doc.splitTextToSize(shopContacts, 112)
        doc.text(contactLines, margin, shopY)
        shopY += contactLines.length * 4
      }

      const boxW = 62
      const boxX = pageWidth - margin - boxW
      doc.setFillColor(...soft)
      doc.setDrawColor(...line)
      doc.setLineWidth(0.25)
      doc.roundedRect(boxX, 19, boxW, 21, 1.8, 1.8, "FD")
      setText(7, true, muted)
      doc.text("BILL NUMBER", boxX + 4, 25)
      setText(10, true)
      doc.text(String(billNumber), boxX + 4, 32)
      setText(7, true, muted)
      doc.text(`STATUS: ${String(bill.payment_status || bill.status || (totals.amountDue <= 0 ? "PAID" : "PENDING")).toUpperCase()}`, boxX + 4, 36)

      let y = Math.max(shopY, 44) + 3
      doc.setDrawColor(...ink)
      doc.setLineWidth(0.35)
      doc.line(margin, y, pageWidth - margin, y)

      // ===== BILL / CUSTOMER / REPORT DETAILS =====
      y += 7
      const colGap = 5
      const colW = (contentWidth - colGap * 2) / 3
      const col1 = margin
      const col2 = margin + colW + colGap
      const col3 = margin + (colW + colGap) * 2
      const topY = y
      const bottomY = topY + 27
      doc.setDrawColor(...line)
      doc.setLineWidth(0.2)
      doc.line(col2 - 2.5, topY - 2, col2 - 2.5, bottomY)
      doc.line(col3 - 2.5, topY - 2, col3 - 2.5, bottomY)

      const drawInfo = (title, pairs, x) => {
        let yy = topY
        setText(8.5, true)
        doc.text(title, x, yy)
        yy += 5
        pairs.forEach(([label, value]) => {
          if (!value) return
          setText(7.5, true)
          doc.text(`${label}:`, x, yy)
          const labelWidth = doc.getTextWidth(`${label}:`) + 1.5
          setText(7.5, false)
          const valueLines = doc.splitTextToSize(String(value), colW - labelWidth)
          doc.text(valueLines, x + labelWidth, yy)
          yy += Math.max(4, valueLines.length * 3.6)
        })
      }

      drawInfo("Bill Details", [
        ["Bill Date", bill.bill_date ? formatDate(bill.bill_date) : "—"],
        ["Due Date", bill.due_date ? formatDate(bill.due_date) : "—"],
        ["Payment Status", totals.amountDue <= 0 ? "Paid" : "Pending"],
      ], col1)
      drawInfo("Bill To", [
        ["Customer", customerName],
        ["Mobile", customer?.mobile || bill.customers?.mobile || ""],
        ["GSTIN", customer?.gstin || bill.customers?.gstin || ""],
      ], col2)
      drawInfo("Report", [
        ["Report Date", formatDate(getLocalDateString())],
        ["Transactions", String(Math.max(0, events.length - 1))],
        ["Currency", "INR (Rs.)"],
      ], col3)

      y = bottomY + 5
      setText(8, false, muted)
      doc.text(`Transaction records: ${Math.max(0, events.length - 1)}`, margin, y)
      y += 3

      // ===== TRANSACTION LEDGER =====
      const historyRows = events.map((event) => [
        event.date ? formatDate(event.date) : "—",
        event.title,
        event.type === "issued"
          ? `Rs. ${Number(event.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : `${event.type === "refund" ? "- " : "+ "}Rs. ${Number(event.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        event.type === "issued"
          ? "—"
          : `Rs. ${Number(event.balance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      ])

      autoTable(doc, {
        startY: y,
        head: [["Date", "Transaction Details", "Amount (Rs.)", "Balance After (Rs.)"]],
        body: historyRows,
        theme: "plain",
        margin: { left: margin, right: margin, top: 16, bottom: 20 },
        styles: {
          font: "helvetica",
          fontSize: 7.5,
          cellPadding: { top: 2.8, bottom: 2.8, left: 2, right: 2 },
          textColor: ink,
          lineWidth: 0,
          overflow: "linebreak",
          valign: "middle",
        },
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: ink,
          fontStyle: "bold",
          fontSize: 7,
          lineColor: line,
          lineWidth: { bottom: 0.45 },
        },
        alternateRowStyles: { fillColor: [250, 250, 251] },
        columnStyles: {
          0: { cellWidth: 27 },
          1: { cellWidth: "auto" },
          2: { cellWidth: 39, halign: "right" },
          3: { cellWidth: 42, halign: "right" },
        },
        didParseCell: (data) => {
          if (data.section === "head" && data.column.index > 1) data.cell.styles.halign = "right"
        },
        didDrawCell: (data) => {
          if (data.section === "body") {
            doc.setDrawColor(...line)
            doc.setLineWidth(0.18)
            doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height)
          }
        },
      })

      // ===== TOTALS SUMMARY =====
      let summaryY = (doc.lastAutoTable?.finalY || y) + 7
      const summaryRows = [
        ["Grand Total", `Rs. ${Number(totals.grandTotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
        ["Advance Adjusted", `Rs. ${Number(totals.advanceAdjusted || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
        ["Payments Received", `Rs. ${Number(totals.amountPaid || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
        ["Balance Due", `Rs. ${Number(totals.amountDue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
      ]

      autoTable(doc, {
        startY: summaryY,
        body: summaryRows,
        theme: "plain",
        margin: { left: pageWidth - margin - 86, right: margin, bottom: 20 },
        styles: { font: "helvetica", fontSize: 8, cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 }, textColor: ink },
        columnStyles: {
          0: { cellWidth: 48, fontStyle: "bold" },
          1: { cellWidth: 38, halign: "right" },
        },
        didParseCell: (data) => {
          if (data.row.index === 3) {
            data.cell.styles.fillColor = soft
            data.cell.styles.fontStyle = "bold"
          }
        },
      })

      drawFooter(doc, shopName)
      doc.save(`${safeName}-payment-history.pdf`)
      toast.success("Payment history PDF exported")
    } catch (error) {
      console.error("Payment history PDF export error:", error)
      toast.error(error?.message || "Could not export payment history PDF")
    }
  }

  const dotStyles = {
    issued: "border-slate-300 bg-white dark:bg-slate-900",
    advance: "border-blue-300 bg-blue-100 dark:bg-blue-950/50",
    payment: "border-emerald-500 bg-emerald-100 dark:bg-emerald-950/50",
    refund: "border-rose-400 bg-rose-100 dark:bg-rose-950/50",
  }

  return (
    <Panel
      icon={CreditCard}
      title="Payment history"
      description={`${payments.length} ${payments.length === 1 ? "payment" : "payments"} recorded`}
      action={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exportHistoryCSV}
            className="h-9 shrink-0 gap-1.5 rounded-xl border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-800"
            title="Export payment history as CSV"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">CSV</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exportHistoryPDF}
            className="h-9 shrink-0 gap-1.5 rounded-xl border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-800"
            title="Export payment history as PDF"
          >
            <FileDown className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">PDF</span>
          </Button>
          {!isFullyPaid && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAddPayment}
              className="h-9 shrink-0 gap-2 rounded-xl border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-slate-800 dark:text-slate-200 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add payment
            </Button>
          )}
        </div>
      }
    >
      <ol className="px-5 py-5">
        {events.map((event, index) => (
          <li key={event.key} className="relative flex gap-4 pb-6">
            {(index < events.length - 1 || !isFullyPaid) && (
              <span className="absolute left-[7px] top-4 h-full w-px bg-[#e4e0f2] dark:bg-slate-700" aria-hidden="true" />
            )}
            <span
              className={`relative mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-2 ${dotStyles[event.type]}`}
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{event.title}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {event.date ? formatDate(event.date) : "Date not available"}
                </p>
              </div>
              <div className="sm:text-right">
                <p
                  className={`text-sm font-bold tabular-nums ${
                    event.type === "issued"
                      ? "text-slate-900 dark:text-slate-100"
                      : event.type === "refund"
                        ? "text-rose-600 dark:text-rose-300"
                        : "text-emerald-700 dark:text-emerald-300"
                  }`}
                >
                  {event.type === "issued" ? "" : event.type === "refund" ? "- " : "+ "}
                  {formatCurrency(event.amount)}
                </p>
                {event.type !== "issued" && (
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Balance after: {formatCurrency(event.balance)}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}

        <li className="relative flex gap-4">
          <span
            className={`relative mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-2 ${
              isFullyPaid ? "border-emerald-600 bg-emerald-600" : "border-dashed border-slate-300 bg-white dark:bg-slate-900"
            }`}
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {isFullyPaid ? "Bill settled" : `Balance pending: ${formatCurrency(totals.amountDue)}`}
            </p>
            {!isFullyPaid && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{dueInfo.text}</p>}
          </div>
        </li>
      </ol>
    </Panel>
  )
}

function CustomerCard({ bill, customer, shop, totals }) {
  const [customerPhoto, setCustomerPhoto] = useState("")
  const [photoFailed, setPhotoFailed] = useState(false)

  useEffect(() => {
    let active = true
    setCustomerPhoto("")
    setPhotoFailed(false)

    const photoValue = String(customer.photo_url || customer.avatar_url || "").trim()
    if (!photoValue) return () => { active = false }

    if (/^https?:\/\//i.test(photoValue)) {
      setCustomerPhoto(photoValue)
      return () => { active = false }
    }

    const cleanPath = photoValue
      .replace(/^\/+/, "")
      .replace(/^avatars\//, "")

    const { data } = supabase.storage.from("avatars").getPublicUrl(cleanPath)
    if (active) setCustomerPhoto(data?.publicUrl || "")

    return () => { active = false }
  }, [customer.id, customer.photo_url, customer.avatar_url])

  const address = [customer.address, customer.city, customer.state, customer.pincode]
    .filter(Boolean)
    .join(", ")

  function sendReminder() {
    const whatsappNumber = normalizeIndianMobile(customer.whatsapp || customer.mobile)
    if (!whatsappNumber) {
      toast.error("No mobile number for this customer")
      return
    }

    const lines = [
      `Hello ${customer.name || ""},`.trim(),
      "",
      `This is a gentle reminder from ${shop.name || "our shop"} regarding bill ${bill.bill_number || ""}.`,
      `Pending amount: ${formatCurrency(totals.amountDue)}`,
      bill.due_date ? `Due date: ${formatDate(bill.due_date)}` : null,
      "",
      "Kindly make the payment at your earliest convenience. Thank you!",
    ].filter((line) => line !== null)

    window.open(
      `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(lines.join("\n"))}`,
      "_blank",
      "noopener,noreferrer"
    )
  }

  return (
    <Panel
      icon={User}
      title="Customer"
      description="Billed to"
      action={
        customer.id && (
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-1.5 rounded-xl border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-slate-800 dark:text-slate-200 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-800"
          >
            <Link to={`/customers/${customer.id}`}>
              Account
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
        )
      }
    >
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-violet-100 dark:border-slate-700 bg-violet-100 dark:bg-violet-950/50 text-sm font-bold text-violet-700 dark:text-violet-300 shadow-sm">
            {getInitials(customer.name)}
            {customerPhoto && !photoFailed && (
              <img
                src={customerPhoto}
                alt={`${customer.name || "Customer"} profile`}
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setPhotoFailed(true)}
                className="absolute inset-0 h-full w-full rounded-full object-cover"
              />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-slate-900 dark:text-slate-100">
              {customer.name || "Walk-in customer"}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {customer.name ? customer.customer_type || "Registered customer" : "No customer linked"}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {customer.mobile && <ContactLine icon={Phone}>{customer.mobile}</ContactLine>}
          {address && (
            <ContactLine icon={MapPin} align="start">
              {address}
            </ContactLine>
          )}
          {customer.gstin && <ContactLine icon={FileText}>GSTIN {customer.gstin}</ContactLine>}
          {!customer.mobile && !address && !customer.gstin && (
            <p className="text-sm text-slate-400 dark:text-slate-500">No additional customer information available.</p>
          )}
        </div>

        {(customer.mobile || customer.whatsapp) && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            {customer.mobile ? (
              <Button
                asChild
                variant="outline"
                className="h-10 gap-2 rounded-xl border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-slate-800 shadow-sm"
              >
                <a href={`tel:${customer.mobile}`}>
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  Call
                </a>
              </Button>
            ) : (
              <span />
            )}
            <Button
              type="button"
              variant="outline"
              onClick={sendReminder}
              disabled={totals.amountDue <= 0}
              title={totals.amountDue <= 0 ? "No pending amount" : "Send payment reminder on WhatsApp"}
              className="h-10 gap-2 rounded-xl border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-slate-800 disabled:opacity-50 shadow-sm"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Remind
            </Button>
          </div>
        )}
      </CardContent>
    </Panel>
  )
}

function ShopCard({ shop }) {
  const [shopPhoto, setShopPhoto] = useState("")
  const [photoFailed, setPhotoFailed] = useState(false)

  useEffect(() => {
    let active = true
    setShopPhoto("")
    setPhotoFailed(false)

    const photoValue = String(
      shop?.logo_url || shop?.photo_url || shop?.profile_pic || shop?.avatar_url || shop?.image_url || ""
    ).trim()

    if (!photoValue) return () => { active = false }

    if (/^https?:\/\//i.test(photoValue)) {
      setShopPhoto(photoValue)
      return () => { active = false }
    }

    const cleanPath = photoValue.replace(/^\/+/, "")
    const buckets = ["shop-logos", "avatars", "shop-assets"]

    for (const bucket of buckets) {
      const { data } = supabase.storage.from(bucket).getPublicUrl(cleanPath)
      if (data?.publicUrl) {
        if (active) setShopPhoto(data.publicUrl)
        break
      }
    }

    return () => { active = false }
  }, [shop?.id, shop?.logo_url, shop?.photo_url, shop?.profile_pic, shop?.avatar_url, shop?.image_url])

  return (
    <Panel icon={Store} title="Shop" description="Bill issued by">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-emerald-100 dark:border-emerald-900/60 bg-emerald-100 dark:bg-emerald-950/50 text-sm font-bold text-emerald-700 dark:text-emerald-300 shadow-sm">
            {getInitials(shop?.name)}
            {shopPhoto && !photoFailed && (
              <img
                src={shopPhoto}
                alt={`${shop?.name || "Shop"} profile`}
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setPhotoFailed(true)}
                className="absolute inset-0 h-full w-full rounded-full object-cover"
              />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-slate-900 dark:text-slate-100">{shop.name || "Shop"}</p>
            {shop.gstin && (
              <span className="mt-1 inline-flex rounded-full border border-violet-100 dark:border-slate-700 bg-violet-50 dark:bg-violet-950/30 px-2.5 py-0.5 text-[10px] font-bold text-violet-700 dark:text-violet-300">
                GSTIN {shop.gstin}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {shop.mobile && <ContactLine icon={Phone}>{shop.mobile}</ContactLine>}
          {shop.address && (
            <ContactLine icon={MapPin} align="start">
              {shop.address}
            </ContactLine>
          )}
          {!shop.mobile && !shop.address && !shop.gstin && (
            <p className="text-sm text-slate-400 dark:text-slate-500">No additional shop information available.</p>
          )}
        </div>
      </CardContent>
    </Panel>
  )
}

function BillInfoCard({ bill, status, overdue, dueInfo }) {
  const dueTone = {
    slate: "border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
    emerald: "border-emerald-200 dark:border-emerald-800 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300",
    amber: "border-amber-200 dark:border-amber-900/60 bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300",
    red: "border-rose-200 dark:border-rose-900/60 bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300",
  }[dueInfo.tone]

  return (
    <Panel icon={Receipt} title="Bill information" description="Dates and tax settings">
      <dl className="divide-y divide-[#eeecf5] dark:divide-slate-800 px-5 py-1">
        <InfoRow label="Bill number">{bill.bill_number || "—"}</InfoRow>
        <InfoRow label="Bill date">{bill.bill_date ? formatDate(bill.bill_date) : "—"}</InfoRow>
        <InfoRow label="Due date">
          <span className="flex flex-col items-end gap-1">
            {bill.due_date ? formatDate(bill.due_date) : "Not set"}
            {bill.due_date && (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${dueTone}`}>
                {dueInfo.text}
              </span>
            )}
          </span>
        </InfoRow>
        <InfoRow label="Payment status">
          <span className="flex flex-wrap justify-end gap-1">
            <StatusPill status={status} />
            {overdue && <StatusPill status="overdue" />}
          </span>
        </InfoRow>
        <InfoRow label="Supply type">
          {bill.is_interstate ? "Interstate (IGST)" : "Intrastate (CGST + SGST)"}
        </InfoRow>
        <InfoRow label="Tax calculation">{bill.tax_inclusive ? "Tax inclusive" : "Tax exclusive"}</InfoRow>
      </dl>
    </Panel>
  )
}

function AttachmentCard({ url, deleting, onDelete, onPreview }) {
  return (
    <Panel
      icon={ImageIcon}
      title="Attached bill"
      description="Offline copy uploaded with this bill"
      action={
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onPreview}
            className="h-9 gap-1.5 rounded-xl border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-slate-800 shadow-sm"
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            Preview
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={deleting}
            aria-label="Delete attachment"
            title="Delete attachment"
            className="h-9 w-9 rounded-xl text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300 shadow-sm"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        </div>
      }
    >
      <CardContent className="p-5">
        <button
          type="button"
          onClick={onPreview}
          aria-label="Preview attached bill"
          className="group relative block w-full overflow-hidden rounded-2xl border border-[#ece9f5] dark:border-slate-700 bg-[#faf9ff] dark:bg-slate-800/70 text-left transition-all hover:border-violet-300 dark:hover:border-slate-500 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
        >
          <div className="flex aspect-[4/3] items-center justify-center overflow-hidden p-2">
            {isImageUrl(url) ? (
              <img src={url} alt="Attached bill" className="h-full w-full object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-500 dark:text-slate-400">
                <FileText className="h-10 w-10 text-violet-400" aria-hidden="true" />
                <span className="text-sm font-semibold">PDF document</span>
              </div>
            )}
          </div>
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 shadow-sm">
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              Preview
            </span>
          </div>
        </button>
      </CardContent>
    </Panel>
  )
}

function NotesCard({ notes }) {
  return (
    <Panel icon={NotebookText} title="Notes" description="Additional information for this bill">
      <CardContent className="p-5">
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{notes}</p>
      </CardContent>
    </Panel>
  )
}

/* ==================================================
   DIALOGS
================================================== */

function DeleteAttachmentDialog({ open, onOpenChange, deleting, onConfirm }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !deleting && onOpenChange(next)}>
      <DialogContent className="max-w-sm rounded-[20px] p-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-300">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </div>
          <DialogTitle className="text-lg font-bold text-[#171a36] dark:text-slate-100">Delete attachment?</DialogTitle>
          <DialogDescription className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            The attached bill file will be permanently removed from storage. This cannot be undone.
          </DialogDescription>
        </div>
        <DialogFooter className="mt-6 flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
            className="h-11 w-full rounded-xl border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-violet-50 dark:hover:bg-slate-800 sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="h-11 w-full rounded-xl bg-rose-600 text-white hover:bg-rose-700 sm:w-auto shadow-sm"
          >
            {deleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Deleting…
              </>
            ) : (
              "Delete attachment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RecordPaymentDialog({ open, onClose, bill, status, customer, totals, today, shopId, saving, onSubmit }) {
  const [amount, setAmount] = useState("")
  const [mode, setMode] = useState("Cash")
  const [paymentDate, setPaymentDate] = useState(today)
  const [advanceRows, setAdvanceRows] = useState([])
  const [advanceLoading, setAdvanceLoading] = useState(false)
  const [advanceAmount, setAdvanceAmount] = useState("0")

  useEffect(() => {
    let active = true
    async function loadAvailableAdvances() {
      if (!open || !shopId || !customer?.id) {
        setAdvanceRows([])
        setAdvanceAmount("0")
        return
      }
      setAdvanceLoading(true)
      try {
        const { data, error } = await supabase
          .from("customer_advances")
          .select("id, amount, remaining_amount, created_at")
          .eq("shop_id", shopId)
          .eq("customer_id", customer.id)
          .gt("remaining_amount", 0)
          .order("created_at", { ascending: true })
        if (error) throw error
        if (active) setAdvanceRows(data || [])
      } catch (error) {
        console.error("Load customer advances error:", error)
        if (active) {
          setAdvanceRows([])
          toast.error("Could not load customer advance", { description: error.message })
        }
      } finally {
        if (active) setAdvanceLoading(false)
      }
    }
    loadAvailableAdvances()
    return () => { active = false }
  }, [open, shopId, customer?.id])

  useEffect(() => {
    if (open) {
      setAmount(String(totals.amountDue || 0))
      setMode("Cash")
      setPaymentDate(today)
      setAdvanceAmount("0")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const numericAmount = Number(amount)
  const numericAdvance = Number(advanceAmount)
  const availableAdvance = round2(advanceRows.reduce((sum, row) => sum + num(row.remaining_amount), 0))
  const advanceValid =
    Number.isFinite(numericAdvance) && numericAdvance >= 0 && numericAdvance <= availableAdvance
  const amountValid =
    Number.isFinite(numericAmount) && numericAmount >= 0 &&
    round2(numericAmount + numericAdvance) <= totals.amountDue &&
    (numericAmount > 0 || numericAdvance > 0)
  const minDate = bill.bill_date ? bill.bill_date.slice(0, 10) : undefined
  const dateValid = Boolean(paymentDate) && paymentDate <= today && (!minDate || paymentDate >= minDate)
  const isValid = amountValid && advanceValid && dateValid
  const remainingAfter = amountValid ? round2(totals.amountDue - numericAmount - numericAdvance) : null

  function handleSubmit(event) {
    event.preventDefault()
    if (!isValid) return
    onSubmit(round2(numericAmount), mode, paymentDate, round2(numericAdvance))
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden rounded-[20px] border-0 p-0 shadow-[0_12px_32px_rgba(80,65,130,0.25)] sm:max-w-md">
        <DialogHeader className="border-b border-[#eae7f4] dark:border-slate-700 bg-[#f7f5ff] dark:bg-slate-950 px-6 pb-5 pt-6 text-left">
          <div className="flex items-start gap-4 pr-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white shadow-sm">
              <ArrowDownLeft className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold tracking-tight text-[#171a36] dark:text-slate-100">
                Record payment
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Add a payment against this bill.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex max-h-[calc(92vh-110px)] flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto bg-white dark:bg-slate-900 px-6 py-6">
            <div className="rounded-2xl border border-[#ece9f5] dark:border-slate-700 bg-[#faf9ff] dark:bg-slate-800/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                    {customer.name || "Walk-in customer"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Bill {bill.bill_number || "—"}</p>
                </div>
                <StatusPill status={status} />
              </div>
              <div className="mt-3 border-t border-[#eae7f4] dark:border-slate-700 pt-3">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Pending amount</p>
                <p className="mt-1 text-2xl font-extrabold tracking-tight text-rose-600 dark:text-rose-300 tabular-nums">
                  {formatCurrency(totals.amountDue)}
                </p>
              </div>
            </div>

            {customer.id && (
              <div className="space-y-3 rounded-2xl border border-blue-100 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-blue-900">Customer advance available</p>
                    <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-300">
                      {advanceLoading ? "Checking advance balance…" : "Use the customer's previously received advance"}
                    </p>
                  </div>
                  <span className="shrink-0 text-base font-extrabold tabular-nums text-blue-800 dark:text-blue-200">
                    {formatCurrency(availableAdvance)}
                  </span>
                </div>
                {!advanceLoading && availableAdvance > 0 ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="advance-adjustment" className="text-[13px] font-medium text-blue-900">
                      Adjust from advance (₹)
                    </Label>
                    <Input
                      id="advance-adjustment"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max={Math.min(availableAdvance, totals.amountDue)}
                      step="0.01"
                      value={advanceAmount}
                      onChange={(event) => {
                        const nextAdvance = event.target.value
                        setAdvanceAmount(nextAdvance)
                        const nextValue = Number(nextAdvance)
                        if (Number.isFinite(nextValue) && nextValue >= 0) {
                          setAmount((current) => {
                            const currentAmount = Number(current)
                            const maxCash = Math.max(0, round2(totals.amountDue - nextValue))
                            return String(Math.min(Number.isFinite(currentAmount) ? currentAmount : 0, maxCash))
                          })
                        }
                      }}
                      className={fieldClass}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setAdvanceAmount("0")} className="rounded-full border border-blue-200 dark:border-blue-900/60 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/40">Don't use</button>
                      <button type="button" onClick={() => setAdvanceAmount(String(round2(Math.min(availableAdvance, totals.amountDue))))} className="rounded-full border border-blue-200 dark:border-blue-900/60 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/40">Use maximum</button>
                    </div>
                  </div>
                ) : !advanceLoading ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">No unused advance is available for this customer.</p>
                ) : null}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="payment-amount" className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                Payment amount (₹)
              </Label>
              <Input
                id="payment-amount"
                type="number"
                inputMode="decimal"
                min="0"
                max={Math.max(0, round2(totals.amountDue - (advanceValid ? numericAdvance : 0)))}
                step="0.01"
                required
                autoFocus
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className={fieldClass}
                placeholder="Enter amount"
              />
              {(!advanceValid || (Number.isFinite(numericAmount) && round2(numericAmount + numericAdvance) > totals.amountDue)) && (
                <p className="text-xs text-rose-600 dark:text-rose-300">
                  Payment plus advance cannot exceed the pending amount of {formatCurrency(totals.amountDue)}.
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {[0.25, 0.5, 1].map((fraction) => (
                  <button
                    key={fraction}
                    type="button"
                    onClick={() => setAmount(String(round2(totals.amountDue * fraction)))}
                    className="rounded-full border border-violet-100 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 transition-colors hover:bg-violet-50 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                  >
                    {fraction === 1 ? "Full amount" : `${fraction * 100}%`}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Payment mode</Label>
                <Select value={mode} onValueChange={setMode}>
                  <SelectTrigger className={fieldClass}>
                    <SelectValue placeholder="Select payment mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_MODES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="payment-date" className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                  Payment date
                </Label>
                <Input
                  id="payment-date"
                  type="date"
                  required
                  value={paymentDate}
                  min={minDate}
                  max={today}
                  onChange={(event) => setPaymentDate(event.target.value)}
                  className={fieldClass}
                />
              </div>
            </div>

            {remainingAfter !== null && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-100 dark:border-emerald-900/60 bg-emerald-50/60 px-4 py-3">
                <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">Balance after payment and advance</span>
                <span
                  className={`text-sm font-bold tabular-nums ${
                    remainingAfter === 0 ? "text-emerald-700 dark:text-emerald-300" : "text-slate-900 dark:text-slate-100"
                  }`}
                >
                  {formatCurrency(remainingAfter)}
                </span>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-[#eae7f4] dark:border-slate-700 bg-[#f7f5ff] dark:bg-slate-950 px-6 py-4 sm:justify-end sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
              className="h-11 rounded-xl border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-slate-800 shadow-sm"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !isValid}
              className="h-11 gap-2 rounded-xl border border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 text-sm font-semibold text-slate-700 dark:text-slate-300 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Confirm payment
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* Bill preview: printable invoice sheet (kept neutral so it prints cleanly) */

function BillPreviewDialog({ open, onOpenChange, bill, items, customer, shop, totals, status, onDownload }) {
  const customerAddress = [customer.address, customer.city, customer.state, customer.pincode]
    .filter(Boolean)
    .join(", ")
  const isPaid = totals.amountDue <= 0
  const totalQty = items.reduce((sum, item) => sum + num(item.quantity), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bill-preview-dialog flex max-h-[94vh] w-[calc(100vw-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-[20px] p-0">
        {/* Print only the invoice sheet, not the page or the popup chrome */}
        <style>{`
          @media print {
            @page { margin: 10mm; }
            body * { visibility: hidden !important; }
            #bill-print-area, #bill-print-area * { visibility: visible !important; }
            .bill-preview-dialog { position: absolute !important; left: 0 !important; top: 0 !important; transform: none !important; width: 100% !important; max-width: none !important; max-height: none !important; overflow: visible !important; border: 0 !important; box-shadow: none !important; }
            .bill-preview-scroll { overflow: visible !important; padding: 0 !important; background: #fff !important; }
            #bill-print-area { box-shadow: none !important; border: 0 !important; max-width: none !important; }
          }
        `}</style>

        <DialogHeader className="border-b border-[#eae7f4] dark:border-slate-700 bg-[#f7f5ff] dark:bg-slate-950 px-5 py-4 text-left">
          <div className="flex items-center gap-3 pr-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300">
              <Eye className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-[#171a36] dark:text-slate-100">Bill preview</DialogTitle>
              <DialogDescription className="text-xs">
                {bill.bill_number || "Bill"} · {customer.name || "Walk-in customer"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="bill-preview-scroll min-h-0 flex-1 overflow-y-auto bg-[#efedf7] dark:bg-slate-800 p-3 sm:p-6">
          <article
            id="bill-print-area"
            className="mx-auto max-w-3xl overflow-hidden rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-[0_2px_12px_rgba(15,23,42,0.10)]"
          >
            {/* Letterhead */}
            <div className="flex flex-col gap-4 px-6 pt-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xl font-bold tracking-tight text-slate-950 dark:text-slate-50">{shop.name || "Shop"}</p>
                <div className="mt-2 space-y-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {shop.address && <p className="max-w-xs">{shop.address}</p>}
                  {shop.mobile && <p>Mobile: {shop.mobile}</p>}
                  {shop.gstin && (
                    <p>
                      GSTIN: <span className="font-medium text-slate-700 dark:text-slate-300">{shop.gstin}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="sm:text-right">
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  {shop.gstin ? "Tax invoice" : "Invoice"}
                </p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
                  {bill.bill_number || "—"}
                </p>
                <div className="mt-2 sm:flex sm:justify-end">
                  <StatusPill status={status} />
                </div>
              </div>
            </div>

            {/* Parties and details */}
            <div className="mt-6 grid grid-cols-1 gap-5 border-y border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/70 px-6 py-5 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Billed to</p>
                <p className="mt-1.5 text-base font-bold text-slate-900 dark:text-slate-100">
                  {customer.name || "Walk-in customer"}
                </p>
                <div className="mt-1 space-y-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {customer.mobile && <p>Mobile: {customer.mobile}</p>}
                  {customerAddress && <p>{customerAddress}</p>}
                  {customer.gstin && <p>GSTIN: {customer.gstin}</p>}
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {[
                  ["Bill date", bill.bill_date ? formatDate(bill.bill_date) : "—"],
                  ["Due date", bill.due_date ? formatDate(bill.due_date) : "Not set"],
                  ["Supply type", bill.is_interstate ? "Interstate (IGST)" : "Intrastate (CGST + SGST)"],
                  ["Tax calculation", bill.tax_inclusive ? "Tax inclusive" : "Tax exclusive"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
                    <dd className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Items */}
            <div className="overflow-x-auto px-6 py-5">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <th className="w-10 py-2.5 pr-2">#</th>
                    <th className="px-2 py-2.5">Item</th>
                    <th className="px-2 py-2.5 text-right">Qty</th>
                    <th className="px-2 py-2.5 text-right">Rate</th>
                    <th className="px-2 py-2.5 text-right">Disc.</th>
                    <th className="px-2 py-2.5 text-right">GST</th>
                    <th className="py-2.5 pl-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 dark:text-slate-400">
                        No bill items found.
                      </td>
                    </tr>
                  ) : (
                    items.map((item, index) => (
                      <tr key={item.id || index}>
                        <td className="py-3 pr-2 text-slate-400 dark:text-slate-500">{index + 1}</td>
                        <td className="px-2 py-3">
                          <p className="font-medium text-slate-900 dark:text-slate-100">{item.item_name || "Item"}</p>
                          {item.description && (
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.description}</p>
                          )}
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums">
                          {num(item.quantity)} {item.unit || ""}
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums">{formatCurrency(item.rate)}</td>
                        <td className="px-2 py-3 text-right tabular-nums">
                          {num(item.discount) > 0 ? formatCurrency(item.discount) : "—"}
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums">{num(item.gst_percent)}%</td>
                        <td className="py-3 pl-2 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {formatCurrency(item.total_amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {items.length > 0 && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {items.length} {items.length === 1 ? "item" : "items"} · total quantity {totalQty}
                </p>
              )}
            </div>

            {/* Totals */}
            <div className="grid grid-cols-1 gap-6 border-t border-slate-200 dark:border-slate-700 px-6 py-5 sm:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Amount in words</p>
                  <p className="mt-1 text-sm font-medium leading-5 text-slate-800 dark:text-slate-200">
                    {amountInWords(totals.grandTotal)}
                  </p>
                </div>
                {bill.notes && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Notes</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-600 dark:text-slate-300">{bill.notes}</p>
                  </div>
                )}
              </div>

              <div className="sm:ml-auto sm:w-full sm:max-w-xs">
                <AmountRow label="Subtotal" value={formatCurrency(bill.subtotal)} />
                {num(bill.discount_amount) > 0 && (
                  <AmountRow
                    label="Discount"
                    value={`- ${formatCurrency(bill.discount_amount)}`}
                    valueClass="text-emerald-600"
                  />
                )}
                {num(bill.cgst_amount) > 0 && <AmountRow label="CGST" value={formatCurrency(bill.cgst_amount)} />}
                {num(bill.sgst_amount) > 0 && <AmountRow label="SGST" value={formatCurrency(bill.sgst_amount)} />}
                {num(bill.igst_amount) > 0 && <AmountRow label="IGST" value={formatCurrency(bill.igst_amount)} />}
                {num(bill.round_off) !== 0 && (
                  <AmountRow label="Round off" value={formatCurrency(bill.round_off)} />
                )}

                <div className="mt-2 flex items-center justify-between gap-4 rounded-lg bg-slate-900 px-4 py-3 text-white">
                  <span className="text-sm font-semibold">Grand total</span>
                  <span className="text-lg font-bold tabular-nums">{formatCurrency(totals.grandTotal)}</span>
                </div>

                <div className="mt-3 border-t border-dashed border-slate-200 dark:border-slate-700 pt-1">
                  {totals.advanceAdjusted > 0 && (
                    <AmountRow
                      label="Advance adjusted"
                      value={`- ${formatCurrency(totals.advanceAdjusted)}`}
                    />
                  )}
                  <AmountRow
                    label="Payments received"
                    value={`- ${formatCurrency(totals.amountPaid)}`}
                    valueClass="text-emerald-600"
                  />
                  <AmountRow
                    label="Balance due"
                    value={formatCurrency(totals.amountDue)}
                    valueClass={isPaid ? "text-emerald-600" : "text-rose-600 dark:text-rose-300"}
                    bold
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-end justify-between gap-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/70 px-6 py-5">
              <p className="max-w-xs text-xs leading-5 text-slate-500 dark:text-slate-400">
                Thank you for your business. This is a computer generated invoice.
              </p>
              <div className="text-center">
                <div className="mb-1.5 h-px w-40 bg-slate-300" />
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Authorised signatory</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{shop.name || ""}</p>
              </div>
            </div>
          </article>
        </div>

        <DialogFooter className="gap-2 border-t border-[#eae7f4] dark:border-slate-700 bg-[#f7f5ff] dark:bg-slate-950 px-5 py-3 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-10 gap-2 rounded-xl border border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-slate-800 shadow-sm"
          >
            Close
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => window.print()}
            className="h-10 gap-2 rounded-xl border border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-slate-800 shadow-sm"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Print
          </Button>
          <Button
            type="button"
            onClick={onDownload}
            className="h-10 gap-2 rounded-xl border border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-slate-800 shadow-sm"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AttachmentPreviewDialog({ open, onOpenChange, url, billNumber }) {
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => {
    if (open) setZoomed(false)
  }, [open])

  if (!url) return null
  const image = isImageUrl(url)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[94vh] w-[calc(100vw-1.5rem)] max-w-5xl flex-col gap-0 overflow-hidden rounded-[20px] p-0">
        <DialogHeader className="border-b border-[#eae7f4] dark:border-slate-700 bg-[#f7f5ff] dark:bg-slate-950 px-5 py-4 text-left">
          <div className="flex items-center gap-3 pr-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300">
              <ImageIcon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-[#171a36] dark:text-slate-100">Attached bill</DialogTitle>
              <DialogDescription className="text-xs">
                Offline copy uploaded with {billNumber || "this bill"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto bg-[#efedf7] dark:bg-slate-800 p-4">
          {image ? (
            <img
              src={url}
              alt="Attached bill"
              onClick={() => setZoomed((value) => !value)}
              className={
                zoomed
                  ? "mx-auto max-w-none cursor-zoom-out rounded-lg bg-white dark:bg-slate-900 shadow"
                  : "mx-auto max-h-[68vh] w-auto max-w-full cursor-zoom-in rounded-lg bg-white dark:bg-slate-900 object-contain shadow"
              }
            />
          ) : (
            <iframe src={url} title="Attached bill document" className="h-[68vh] w-full rounded-lg bg-white dark:bg-slate-900 shadow" />
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-[#eae7f4] dark:border-slate-700 bg-[#f7f5ff] dark:bg-slate-950 px-5 py-3 sm:gap-2">
          {image && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setZoomed((value) => !value)}
              className="h-10 gap-2 rounded-xl border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-violet-50 dark:hover:bg-slate-800"
            >
              {zoomed ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
              {zoomed ? "Fit to screen" : "Actual size"}
            </Button>
          )}
          <Button
            asChild
            variant="outline"
            className="h-10 gap-2 rounded-xl border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-violet-50 dark:hover:bg-slate-800 shadow-sm"
          >
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              Open in new tab
            </a>
          </Button>
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-10 rounded-xl border border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-slate-800"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ==================================================
   PAGE
================================================== */

export default function BillDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { currentShop } = useShop()
  const shopId = currentShop?.id

  const [bill, setBill] = useState(null)
  const [items, setItems] = useState([])
  const [payments, setPayments] = useState([])
  const [advanceAllocations, setAdvanceAllocations] = useState([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [lastUpdated, setLastUpdated] = useState(null)

  const [payOpen, setPayOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [previewOpen, setPreviewOpen] = useState(false)
  const [attachmentOpen, setAttachmentOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingAttachment, setDeletingAttachment] = useState(false)
  const [sharingInvoice, setSharingInvoice] = useState(false)

  const hasLoaded = useRef(false)
  // Prevents an older (slower) request from overwriting newer data
  const requestRef = useRef(0)

  const today = getLocalDateString()

  // Reset when the bill or shop changes
  useEffect(() => {
    hasLoaded.current = false
    setBill(null)
    setItems([])
    setPayments([])
    setAdvanceAllocations([])
    setLoadError("")
    setLoading(true)
  }, [id, shopId])

  /* ------------------------------ Data loading ----------------------------- */

  const loadBill = useCallback(
    async (showRefresh = false) => {
      if (!id || !shopId) return

      const requestId = ++requestRef.current

      if (showRefresh || hasLoaded.current) setRefreshing(true)
      else setLoading(true)

      setLoadError("")

      try {
        const [billRes, itemsRes, directPaymentsRes, allocationsRes, groupedPaymentAllocationsRes] = await Promise.all([
          supabase
            .from("bills")
            .select("*, customers(*), shops(*)")
            .eq("id", id)
            .eq("shop_id", shopId)
            .maybeSingle(),

          supabase
            .from("bill_items")
            .select("*")
            .eq("bill_id", id)
            .order("sort_order", { ascending: true }),

          // Legacy / bill-specific payments are still supported.
          supabase
            .from("payments")
            .select("*")
            .eq("bill_id", id)
            .eq("shop_id", shopId)
            .order("payment_date", { ascending: false }),

          supabase
            .from("advance_allocations")
            .select("id, advance_id, bill_id, amount, created_at")
            .eq("bill_id", id)
            .order("created_at", { ascending: true }),

          // A grouped payment can be allocated to several bills. Its payment
          // row may not have this bill_id, so load this bill's allocation rows.
          supabase
            .from("payment_allocations")
            .select("payment_id, bill_id, amount")
            .eq("shop_id", shopId)
            .eq("bill_id", id)
            .order("created_at", { ascending: true }),
        ])

        if (billRes.error) throw billRes.error
        if (itemsRes.error) throw itemsRes.error
        if (directPaymentsRes.error) throw directPaymentsRes.error
        if (allocationsRes.error) throw allocationsRes.error
        if (groupedPaymentAllocationsRes.error) throw groupedPaymentAllocationsRes.error

        const groupedRows = groupedPaymentAllocationsRes.data || []
        const groupedPaymentIds = [...new Set(
          groupedRows.map((row) => row.payment_id).filter(Boolean)
        )]

        let groupedPayments = []
        if (groupedPaymentIds.length) {
          const { data, error } = await supabase
            .from("payments")
            .select("*")
            .eq("shop_id", shopId)
            .in("id", groupedPaymentIds)

          if (error) throw error
          groupedPayments = data || []
        }

        // Use the allocation amount for this bill, not the full group payment.
        // Merge with direct payments while avoiding duplicate payment entries.
        const groupedPaymentById = new Map(
          groupedPayments.map((payment) => [String(payment.id), payment])
        )
        const groupedHistory = groupedRows
          .map((allocation) => {
            const payment = groupedPaymentById.get(String(allocation.payment_id))
            if (!payment) return null
            return {
              ...payment,
              allocated_amount: num(allocation.amount),
            }
          })
          .filter(Boolean)

        const groupedIds = new Set(groupedHistory.map((payment) => String(payment.id)))
        const directHistory = (directPaymentsRes.data || [])
          .filter((payment) => !groupedIds.has(String(payment.id)))
          .map((payment) => ({ ...payment, allocated_amount: num(payment.amount) }))

        const paymentHistory = [...directHistory, ...groupedHistory].sort(
          (a, b) => String(b.payment_date || "").localeCompare(String(a.payment_date || ""))
        )

        // A newer request has started — ignore this result
        if (requestId !== requestRef.current) return

        setBill(billRes.data || null)
        setItems(itemsRes.data || [])
        setPayments(paymentHistory)
        setAdvanceAllocations(allocationsRes.data || [])
        setLastUpdated(new Date())
        hasLoaded.current = true
      } catch (error) {
        if (requestId !== requestRef.current) return
        console.error("Bill detail error:", error)
        const message = error?.message || "Unable to load bill details."
        setLoadError(message)
        toast.error("Could not load bill", { description: message })
      } finally {
        if (requestId === requestRef.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [id, shopId]
  )

  useEffect(() => {
    loadBill()
  }, [loadBill])

  /* ------------------------------ Derived data ----------------------------- */

  const totals = useMemo(() => computeTotals(bill), [bill])
  const isFullyPaid = totals ? totals.amountDue <= 0 : false
  const status = totals ? getBillStatus(totals) : "unpaid"
  const dueInfo = useMemo(
    () => (bill && totals ? getDueInfo(bill, totals, today) : { text: "", tone: "slate" }),
    [bill, totals, today]
  )
  const overdue = Boolean(dueInfo.overdueDays)

  /* -------------------------------- Actions -------------------------------- */

  async function handleRecordPayment(amount, paymentMode, paymentDate, advanceAmount = 0) {
    if (!bill || !shopId) return

    setSaving(true)
    try {
      // Re-read the bill so two people paying at once cannot overpay it
      const { data: latest, error: latestError } = await supabase
        .from("bills")
        .select("id, customer_id, amount_paid, grand_total, advance_adjusted, amount_due")
        .eq("id", bill.id)
        .eq("shop_id", shopId)
        .single()

      if (latestError) throw latestError

      const latestTotals = computeTotals(latest)
      const advanceToUse = round2(advanceAmount)
      if (amount + advanceToUse > latestTotals.amountDue + 0.009) {
        throw new Error("The pending amount has changed. Refresh and try again.")
      }
      if (amount <= 0 && advanceToUse <= 0) {
        throw new Error("Enter a payment amount or choose an advance amount.")
      }

      let remainingAdvance = advanceToUse
      if (advanceToUse > 0) {
        const { data: advances, error: advanceError } = await supabase
          .from("customer_advances")
          .select("id, remaining_amount")
          .eq("shop_id", shopId)
          .eq("customer_id", latest.customer_id)
          .gt("remaining_amount", 0)
          .order("created_at", { ascending: true })
        if (advanceError) throw advanceError

        const availableNow = round2((advances || []).reduce((sum, row) => sum + num(row.remaining_amount), 0))
        if (advanceToUse > availableNow) {
          throw new Error("Customer advance balance changed. Refresh and try again.")
        }

        for (const advance of advances || []) {
          if (remainingAdvance <= 0) break
          const available = round2(advance.remaining_amount)
          const use = round2(Math.min(available, remainingAdvance))
          if (use <= 0) continue

          const { error: allocationError } = await supabase
            .from("advance_allocations")
            .insert({ advance_id: advance.id, bill_id: latest.id, amount: use })
          if (allocationError) throw allocationError

          const { error: advanceUpdateError } = await supabase
            .from("customer_advances")
            .update({ remaining_amount: round2(available - use) })
            .eq("id", advance.id)
            .eq("shop_id", shopId)
          if (advanceUpdateError) throw advanceUpdateError

          remainingAdvance = round2(remainingAdvance - use)
        }
        if (remainingAdvance > 0.009) {
          throw new Error("Could not allocate the full advance. Please refresh and verify.")
        }
      }

      if (amount > 0) {
        const { error: paymentError } = await supabase.from("payments").insert({
          shop_id: shopId,
          customer_id: latest.customer_id,
          bill_id: latest.id,
          amount,
          payment_mode: paymentMode,
          payment_date: paymentDate,
          is_advance: false,
        })
        if (paymentError) throw paymentError
      }

      const newPaid = round2(latestTotals.amountPaid + amount)
      const newAdvanceAdjusted = round2(latestTotals.advanceAdjusted + advanceToUse)

      // Apply this transaction to the bill's CURRENT outstanding balance.
      // Do not rebuild the due from grand_total here: amount_due may already
      // include earlier credits/adjustments that are not represented in the
      // currently loaded payment rows.
      const newDue = Math.max(
        0,
        round2(latestTotals.amountDue - advanceToUse - amount)
      )

      const { error: updateError } = await supabase
        .from("bills")
        .update({
          amount_paid: newPaid,
          advance_adjusted: newAdvanceAdjusted,
          amount_due: newDue,
          payment_status: newDue <= 0 ? "paid" : "partial",
        })
        .eq("id", latest.id)
        .eq("shop_id", shopId)

      if (updateError) {
        throw new Error(
          `Payment was recorded, but the bill balance could not be updated. Please refresh and verify. ${updateError.message}`
        )
      }

      toast.success(advanceToUse > 0 ? "Advance adjusted successfully" : "Payment recorded successfully")
      setPayOpen(false)
      await loadBill(true)
    } catch (error) {
      console.error("Record payment error:", error)
      toast.error(error.message || "Could not record payment")
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteAttachment() {
    if (!bill?.attachment_url) return

    setDeletingAttachment(true)
    try {
      const filePath = getStoragePath(bill.attachment_url)

      // Detach from the bill first, so a failed file delete never leaves a broken link
      const { error: dbError } = await supabase
        .from("bills")
        .update({ attachment_url: null })
        .eq("id", bill.id)
        .eq("shop_id", shopId)
      if (dbError) throw dbError

      const { error: storageError } = await supabase.storage.from(ATTACHMENT_BUCKET).remove([filePath])
      if (storageError) {
        console.error("Attachment file cleanup failed:", storageError)
        toast.warning("Attachment removed from the bill, but the stored file could not be deleted")
      } else {
        toast.success("Attachment deleted")
      }

      setDeleteOpen(false)
      setAttachmentOpen(false)
      await loadBill(true)
    } catch (error) {
      console.error("Delete attachment error:", error)
      toast.error(error.message || "Failed to delete attachment")
    } finally {
      setDeletingAttachment(false)
    }
  }

  function handleDownloadPDF() {
    if (!bill) return
    try {
      generateBillPDF(bill, items, bill.shops, bill.customers)
      toast.success("Bill PDF generated")
    } catch (error) {
      toast.error(error.message || "Could not generate PDF")
    }
  }

  /**
   * Opens the WhatsApp chat for the number saved on this invoice.
   * Full invoice details are prefilled as formatted text; the PDF downloads
   * and can be attached in the same chat before sending.
   */
  async function handleShareInvoice() {
    if (!bill) return

    const customer = bill.customers || {}
    const rawCustomerNumber = customer.whatsapp || customer.mobile || ""

    if (!rawCustomerNumber) {
      toast.error("Is invoice mein customer ka mobile number saved nahi hai.")
      return
    }

    const whatsappNumber = normalizeIndianMobile(rawCustomerNumber)
    if (!whatsappNumber) {
      toast.error("Invoice customer ka mobile number valid nahi hai. Customer details update karo.")
      return
    }

    setSharingInvoice(true)

    try {
      const shop = bill.shops || currentShop || {}

      const itemLines = items.map((item, index) => {
        const qty = `${num(item.quantity)} ${item.unit || ""}`.trim()
        return `${index + 1}. ${item.item_name || "Item"}\n   Qty: ${qty} | Rate: ${formatCurrency(item.rate)} | Discount: ${formatCurrency(item.discount || 0)} | GST: ${num(item.gst_percent)}% | Amount: ${formatCurrency(item.total_amount)}`
      })

      const paymentLines = payments.map((payment) => {
        const type = payment.is_refund ? "Refund" : "Payment"
        const date = payment.payment_date ? formatDate(payment.payment_date) : "Date N/A"
        return `• ${type}: ${formatCurrency(payment.amount)} | ${payment.payment_mode || "Other"} | ${date}`
      })

      const messageLines = [
        `*${shop.name || "SHOP"}*`,
        shop.address || "",
        shop.mobile ? `Contact: ${shop.mobile}` : "",
        shop.gstin ? `GSTIN: ${shop.gstin}` : "",
        "",
        "━━━━━━━━━━━━━━━━━━",
        "*TAX INVOICE / BILL*",
        "━━━━━━━━━━━━━━━━━━",
        `*Bill No:* ${bill.bill_number || "—"}`,
        `*Bill Date:* ${bill.bill_date ? formatDate(bill.bill_date) : "—"}`,
        `*Due Date:* ${bill.due_date ? formatDate(bill.due_date) : "Not set"}`,
        `*Status:* ${status.toUpperCase()}`,
        "",
        "*BILL TO*",
        `Customer: ${customer.name || "Walk-in customer"}`,
        `Mobile: ${rawCustomerNumber}`,
        customer.address ? `Address: ${customer.address}` : "",
        customer.city ? `City: ${customer.city}` : "",
        customer.gstin ? `GSTIN: ${customer.gstin}` : "",
        "",
        "━━━━━━━━━━━━━━━━━━",
        "*ITEM DETAILS*",
        "━━━━━━━━━━━━━━━━━━",
        ...(itemLines.length ? itemLines : ["No item details available"]),
        "",
        "━━━━━━━━━━━━━━━━━━",
        "*AMOUNT SUMMARY*",
        "━━━━━━━━━━━━━━━━━━",
        `Subtotal: ${formatCurrency(bill.subtotal)}`,
        ...(num(bill.discount_amount) > 0 ? [`Discount: -${formatCurrency(bill.discount_amount)}`] : []),
        ...(num(bill.cgst_amount) > 0 ? [`CGST: ${formatCurrency(bill.cgst_amount)}`] : []),
        ...(num(bill.sgst_amount) > 0 ? [`SGST: ${formatCurrency(bill.sgst_amount)}`] : []),
        ...(num(bill.igst_amount) > 0 ? [`IGST: ${formatCurrency(bill.igst_amount)}`] : []),
        ...(num(bill.round_off) !== 0 ? [`Round Off: ${formatCurrency(bill.round_off)}`] : []),
        `*GRAND TOTAL: ${formatCurrency(totals.grandTotal)}*`,
        `Advance Adjusted: ${formatCurrency(totals.advanceAdjusted)}`,
        `Amount Received: ${formatCurrency(totals.amountPaid)}`,
        `Total Received: ${formatCurrency(totals.totalReceived)}`,
        `*BALANCE DUE: ${formatCurrency(totals.amountDue)}*`,
        "",
        ...(paymentLines.length ? ["*PAYMENT HISTORY*", ...paymentLines, ""] : []),
        bill.notes ? `*Notes:* ${bill.notes}` : "",
        "",
        "Invoice PDF is included separately with these bill details.",
        "Thank you for your business!",
      ].filter((line) => line !== null && line !== undefined && line !== "")

      const message = messageLines.join("\n")
      const blob = createBillPDFBlob(bill, items, shop, customer)
      const fileName = `${String(bill.bill_number || "Invoice").replace(/[^a-z0-9_-]/gi, "_")}.pdf`

      // Browser wa.me links cannot attach local files. Download PDF, then open
      // the exact customer chat with the complete formatted message prefilled.
      const pdfUrl = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = pdfUrl
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 30000)

      const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`
      const opened = window.open(whatsappUrl, "_blank")
      if (!opened) window.location.href = whatsappUrl

      toast.success(`WhatsApp chat opened for ${customer.name || "customer"}`)
      toast.info(`PDF downloaded: ${fileName}. Attach it in the opened chat, then send both together.`)
    } catch (error) {
      console.error("WhatsApp invoice share error:", error)
      toast.error(error?.message || "Could not prepare WhatsApp invoice")
    } finally {
      setSharingInvoice(false)
    }
  }

  function handleExportCSV() {
    if (!bill) return

    // Protect spreadsheet users from CSV formula injection while keeping numbers numeric.
    const escapeCSV = (value) => {
      if (value === null || value === undefined) return '""'
      let textValue = String(value)
      if (/^[\s\t\r]*[=+@]/.test(textValue) || /^[\s\t\r]*-/.test(textValue)) {
        textValue = `'${textValue}`
      }
      return `"${textValue.replace(/"/g, '""')}"`
    }

    // Keep each advance allocation as its own history entry (e.g. two ₹5,000
    // adjustments appear as two separate rows, not one combined ₹10,000 row).
    const historyRows = [
      ...payments.map((payment) => ({
        date: payment.payment_date || payment.created_at || '',
        type: payment.is_refund ? 'Refund' : 'Payment',
        mode: payment.payment_mode || '',
        amount: num(payment.amount) * (payment.is_refund ? -1 : 1),
        reference: payment.reference_number || payment.transaction_id || '',
        notes: payment.notes || '',
        sort: new Date(payment.payment_date || payment.created_at || 0).getTime(),
      })),
      ...advanceAllocations.map((allocation) => ({
        date: allocation.created_at || '',
        type: 'Advance Adjusted',
        mode: 'Customer Advance',
        amount: num(allocation.amount),
        reference: allocation.advance_id || allocation.id || '',
        notes: allocation.notes || 'Adjusted from customer advance',
        sort: new Date(allocation.created_at || 0).getTime(),
      })),
    ].sort((a, b) => a.sort - b.sort)

    const rows = [
      ['BILL SUMMARY'],
      ['Bill Number', bill.bill_number],
      ['Bill Date', bill.bill_date ? formatDate(bill.bill_date) : ''],
      ['Due Date', bill.due_date ? formatDate(bill.due_date) : ''],
      ['Customer', customer?.name || bill.customers?.name || 'Walk-in customer'],
      ['Mobile', customer?.mobile || bill.customers?.mobile || ''],
      ['Payment Status', status],
      ['Subtotal', bill.subtotal],
      ['Discount', bill.discount_amount],
      ['Taxable Amount', bill.taxable_amount],
      ['CGST', bill.cgst_amount],
      ['SGST', bill.sgst_amount],
      ['IGST', bill.igst_amount],
      ['Total GST', bill.total_gst],
      ['Grand Total', totals.grandTotal],
      ['Amount Paid', totals.amountPaid],
      ['Advance Adjusted', totals.advanceAdjusted],
      ['Amount Due', totals.amountDue],
      [],
      ['BILL ITEMS'],
      ['Item', 'Description', 'Quantity', 'Unit', 'Rate', 'Discount', 'Taxable Amount', 'GST %', 'GST Amount', 'Total'],
      ...items.map((item) => [
        item.item_name, item.description, item.quantity, item.unit, item.rate,
        item.discount, item.taxable_amount, item.gst_percent, item.gst_amount, item.total_amount,
      ]),
      [],
      ['PAYMENT & ADVANCE HISTORY'],
      ['Date', 'Transaction Type', 'Payment Mode / Source', 'Amount (₹)', 'Reference / Advance ID', 'Notes'],
      ...historyRows.map((entry) => [
        entry.date ? formatDate(entry.date) : '',
        entry.type,
        entry.mode,
        entry.amount,
        entry.reference,
        entry.notes,
      ]),
      [],
      ['HISTORY TOTALS'],
      ['Advance Adjusted (from allocation records)', advanceAllocations.reduce((sum, row) => sum + num(row.amount), 0)],
      ['Payment / Refund Net', payments.reduce((sum, payment) => sum + num(payment.amount) * (payment.is_refund ? -1 : 1), 0)],
      ['Pending Amount', totals.amountDue],
    ]

    const csv = '\uFEFF' + rows.map((row) => row.map(escapeCSV).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${String(bill.bill_number || 'bill').replace(/[^a-z0-9_-]/gi, '_')}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    toast.success('Bill CSV exported with payment and advance history')
  }
  /* ------------------------------ Render states ---------------------------- */

  if (!currentShop) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-3xl border border-dashed border-violet-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 p-8 text-center">
        <div className="max-w-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300">
            <Receipt className="h-7 w-7" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">No workspace selected</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Select a workspace to view this bill.</p>
        </div>
      </div>
    )
  }

  if (loading) return <PageSkeleton />

  if (!bill) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-3xl border border-dashed border-violet-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 p-8 text-center">
        <div className="max-w-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-300">
            <Receipt className="h-7 w-7" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">
            {loadError ? "Could not load bill" : "Bill not found"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            {loadError || "This bill may have been deleted or does not belong to this workspace."}
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {loadError && (
              <Button
                type="button"
                variant="outline"
                onClick={() => loadBill()}
                className="rounded-xl border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-violet-50 dark:hover:bg-slate-800"
              >
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                Try again
              </Button>
            )}
            <Button
              type="button"
              onClick={() => navigate("/bills")}
              className="rounded-xl border border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Back to bills
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const customer = bill.customers || {}
  const shop = bill.shops || currentShop

  /* ------------------------------ Main UI ---------------------------------- */

  return (
    <div className="min-h-full w-full space-y-4 rounded-2xl bg-[#f7f5ff] dark:bg-slate-950 px-3 py-5 sm:px-5 lg:px-6">
      <PageHeader
        bill={bill}
        customer={customer}
        shopName={currentShop.name}
        status={status}
        overdue={overdue}
        refreshing={refreshing}
        isFullyPaid={isFullyPaid}
        onRefresh={() => loadBill(true)}
        onPreview={() => setPreviewOpen(true)}
        onDownload={handleDownloadPDF}
        onShareInvoice={handleShareInvoice}
        sharingInvoice={sharingInvoice}
        onRecordPayment={() => setPayOpen(true)}
      />

      {loadError && <ErrorBanner message={loadError} onRetry={() => loadBill()} />}

      {/* KEY NUMBERS */}

      <section
        aria-label="Bill overview"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4"
      >
        <SummaryCard
          label="Bill total"
          value={formatCurrency(totals.grandTotal)}
          detail={totals.totalTax > 0 ? `Includes ${formatCurrency(totals.totalTax)} tax` : "Final bill amount"}
          icon={Receipt}
          tone="green"
        />
        <SummaryCard
          label="Amount received"
          value={formatCurrency(totals.totalReceived)}
          detail={
            totals.advanceAdjusted > 0
              ? `Incl. ${formatCurrency(totals.advanceAdjusted)} advance`
              : "Payments received so far"
          }
          icon={ArrowDownLeft}
          tone="blue"
        />
        <SummaryCard
          label="Pending amount"
          value={formatCurrency(totals.amountDue)}
          detail={dueInfo.text}
          icon={IndianRupee}
          tone="pink"
          valueClass={isFullyPaid ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}
        />
        <SummaryCard
          label="Payment progress"
          value={`${Math.round(totals.paidPercent)}%`}
          detail="Of the bill has been received"
          icon={Clock3}
          tone="purple"
        >
          <div
            className="mt-4 h-2 overflow-hidden rounded-full bg-violet-100 dark:bg-violet-950/50"
            role="progressbar"
            aria-label="Payment progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(totals.paidPercent)}
          >
            <div
              className="h-full rounded-full bg-violet-500 transition-all duration-500"
              style={{ width: `${totals.paidPercent}%` }}
            />
          </div>
        </SummaryCard>
      </section>

      {/* MAIN CONTENT */}

      <section className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.65fr_1fr]">
        <div className="min-w-0 space-y-4">
          <ItemsCard bill={bill} items={items} onExportCSV={handleExportCSV} onExportPDF={handleDownloadPDF} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AmountBreakdownCard bill={bill} totals={totals} />
            <PaymentSummaryCard
              totals={totals}
              isFullyPaid={isFullyPaid}
              dueInfo={dueInfo}
              onRecordPayment={() => setPayOpen(true)}
            />
          </div>

          <PaymentHistoryCard
            bill={bill}
            payments={payments}
            advanceAllocations={advanceAllocations}
            totals={totals}
            isFullyPaid={isFullyPaid}
            dueInfo={dueInfo}
            onAddPayment={() => setPayOpen(true)}
            shop={shop}
            customer={customer}
          />
        </div>

        <div className="space-y-4">
          <CustomerCard bill={bill} customer={customer} shop={shop} totals={totals} />
          <BillInfoCard bill={bill} status={status} overdue={overdue} dueInfo={dueInfo} />
          <ShopCard shop={shop} />

          {bill.attachment_url && (
            <AttachmentCard
              url={bill.attachment_url}
              deleting={deletingAttachment}
              onDelete={() => setDeleteOpen(true)}
              onPreview={() => setAttachmentOpen(true)}
            />
          )}

          {bill.notes && <NotesCard notes={bill.notes} />}
        </div>
      </section>

      {/* FOOTER */}

      <footer className="flex flex-col justify-between gap-2 rounded-xl border border-white/80 dark:border-slate-700 bg-white/65 dark:bg-slate-900/65 px-4 py-3 text-xs text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
          <span>
            Bill:
            <strong className="ml-1 text-slate-700 dark:text-slate-300">{bill.bill_number || "—"}</strong>
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

      <BillPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        bill={bill}
        items={items}
        customer={customer}
        shop={shop}
        totals={totals}
        status={status}
        onDownload={handleDownloadPDF}
      />

      <AttachmentPreviewDialog
        open={attachmentOpen}
        onOpenChange={setAttachmentOpen}
        url={bill.attachment_url}
        billNumber={bill.bill_number}
      />

      <RecordPaymentDialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        bill={bill}
        status={status}
        customer={customer}
        totals={totals}
        today={today}
        shopId={shopId}
        saving={saving}
        onSubmit={handleRecordPayment}
      />

      <DeleteAttachmentDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        deleting={deletingAttachment}
        onConfirm={handleDeleteAttachment}
      />

    </div>
  )
}
