import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatDate, PAYMENT_MODES } from "@/lib/utils"
import { generateBillPDF } from "@/lib/pdf"

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
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Copy,
  CreditCard,
  Download,
  Eye,
  FileText,
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
  "overflow-hidden rounded-[20px] border border-white/80 bg-white/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)] backdrop-blur-sm"

const fieldClass =
  "h-11 rounded-xl border-violet-100 bg-white text-sm shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20"

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
  const digits = String(mobile).replace(/\D/g, "")
  return digits.length === 10 ? `91${digits}` : digits
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
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />
}

function PageSkeleton() {
  return (
    <div
      className="min-h-full w-full space-y-4 rounded-2xl bg-[#f7f5ff] px-3 py-5 sm:px-5 lg:px-6"
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

function SummaryCard({ label, value, detail, icon: Icon, tone = "green", valueClass = "text-[#151934]", children }) {
  return (
    <Card className="overflow-hidden rounded-[20px] border border-white/80 bg-white/80 shadow-[0_4px_15px_rgba(80,65,130,0.07)] backdrop-blur-sm">
      <CardContent className="p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-4">
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
        </div>
        {children}
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
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
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
  paid: { label: "Paid", className: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  partial: { label: "Partially paid", className: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock3 },
  unpaid: { label: "Unpaid", className: "bg-rose-100 text-rose-700 border-rose-200", icon: CircleAlert },
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
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
        <Icon className="h-7 w-7" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-sm font-bold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">{description}</p>}
    </div>
  )
}

function ErrorBanner({ message, onRetry }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3"
    >
      <div className="flex items-center gap-2 text-sm text-rose-700">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Could not load your latest figures. Check your connection and try again.
          <span className="ml-1 text-xs text-rose-500">({message})</span>
        </span>
      </div>

      <Button size="sm" variant="outline" onClick={onRetry} className="shrink-0 border-rose-200 bg-white">
        Try again
      </Button>
    </div>
  )
}

function AmountRow({ label, value, valueClass = "text-slate-800", bold = false }) {
  return (
    <div className="flex items-center justify-between gap-6 py-1.5 text-sm">
      <span className={bold ? "font-bold text-slate-900" : "text-slate-600"}>{label}</span>
      <span className={`tabular-nums ${bold ? "font-bold" : "font-semibold"} ${valueClass}`}>{value}</span>
    </div>
  )
}

function InfoRow({ label, children }) {
  if (children === null || children === undefined || children === "") return null
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="text-[13px] text-slate-500">{label}</dt>
      <dd className="text-right text-[13px] font-semibold text-slate-800">{children}</dd>
    </div>
  )
}

function ContactLine({ icon: Icon, children, align = "center" }) {
  return (
    <div className={`flex ${align === "start" ? "items-start" : "items-center"} gap-3 text-sm text-slate-600`}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  )
}

function Avatar({ name, className = "bg-violet-100 text-violet-700" }) {
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

  return (
    <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
      <div className="flex min-w-0 items-center gap-4">
        <Button
          asChild
          variant="outline"
          size="icon"
          aria-label="Back to bills"
          className="h-11 w-11 shrink-0 rounded-xl border-violet-200 bg-white/90 shadow-sm hover:bg-violet-50"
        >
          <Link to="/bills">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>

        <div className="min-w-0">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-2 text-xs font-medium text-slate-500"
          >
            <span>{shopName || "Workspace"}</span>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            <Link to="/bills" className="transition-colors hover:text-slate-800">
              Bills
            </Link>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            <span className="truncate">{bill.bill_number || "Bill details"}</span>
          </nav>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="truncate text-[26px] font-bold tracking-tight text-[#171a39] sm:text-[30px]">
              {bill.bill_number || "Bill details"}
            </h1>
            <StatusPill status={status} />
            {overdue && <StatusPill status="overdue" />}
            {bill.bill_number && (
              <button
                type="button"
                onClick={copyBillNumber}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                aria-label="Copy bill number"
                title="Copy bill number"
              >
                <Copy className="h-4 w-4" />
              </button>
            )}
          </div>

          <p className="mt-0.5 text-sm text-slate-600">
            {bill.bill_date ? (
              <>
                Issued on{" "}
                <strong className="font-semibold text-slate-800">{formatDate(bill.bill_date)}</strong>
              </>
            ) : (
              "Bill information, customer details and payment records"
            )}
            {customer.name && (
              <>
                {" "}for <strong className="font-semibold text-slate-800">{customer.name}</strong>
              </>
            )}
            .
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh bill"
          title="Refresh bill"
          className="h-11 rounded-xl border-violet-100 bg-white px-3 shadow-sm hover:bg-violet-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={onPreview}
          className="h-11 gap-2 rounded-xl border-violet-200 bg-white/90 px-4 text-slate-700 shadow-sm hover:bg-violet-50"
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          Preview
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={onDownload}
          className="h-11 gap-2 rounded-xl border-violet-200 bg-white/90 px-4 text-slate-700 shadow-sm hover:bg-violet-50"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Download PDF
        </Button>

        {!isFullyPaid && (
          <Button
            type="button"
            onClick={onRecordPayment}
            className="h-11 gap-2 rounded-xl border border-violet-200 bg-white px-5 text-sm font-medium text-slate-700 shadow-sm hover:bg-violet-50"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            Record payment
          </Button>
        )}
      </div>
    </header>
  )
}

function ItemsCard({ bill, items }) {
  const totalQty = items.reduce((sum, item) => sum + num(item.quantity), 0)
  const itemsTotal = round2(items.reduce((sum, item) => sum + num(item.total_amount), 0))
  const itemsTaxable = round2(items.reduce((sum, item) => sum + num(item.taxable_amount), 0))

  return (
    <Panel
      icon={ShoppingBag}
      title="Bill items"
      description={`${items.length} ${items.length === 1 ? "item" : "items"} · ${totalQty} total quantity`}
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
                <tr className="bg-[#f5f3fc] text-[11px] font-semibold text-slate-600">
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
                    className="border-b border-[#eeecf5] transition-colors last:border-0 hover:bg-[#f9f8ff]"
                  >
                    <td className="px-3 py-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-700">
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-xs font-bold text-slate-800">{item.item_name || "Item"}</p>
                      {item.description && (
                        <p className="mt-0.5 max-w-xs text-[11px] text-slate-500">{item.description}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-xs tabular-nums text-slate-600">
                      {num(item.quantity)} {item.unit || ""}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-xs tabular-nums text-slate-600">
                      {formatCurrency(item.rate)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-xs tabular-nums text-slate-600">
                      {num(item.discount) > 0 ? `-${formatCurrency(item.discount)}` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-xs tabular-nums text-slate-600">
                      {formatCurrency(item.taxable_amount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-xs tabular-nums text-slate-600">
                      {num(item.gst_percent)}%
                      <span className="mt-0.5 block text-[11px] text-slate-400">
                        {formatCurrency(item.gst_amount)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-bold tabular-nums text-slate-900">
                      {formatCurrency(item.total_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="border-t border-[#eae7f4] bg-[#faf9ff]">
                  <td className="px-3 py-3.5" />
                  <td className="px-3 py-3.5 text-xs font-bold text-slate-700">Total</td>
                  <td className="px-3 py-3.5 text-right text-xs font-bold tabular-nums text-slate-700">
                    {totalQty}
                  </td>
                  <td colSpan={2} />
                  <td className="px-3 py-3.5 text-right text-xs font-bold tabular-nums text-slate-700">
                    {formatCurrency(itemsTaxable)}
                  </td>
                  <td />
                  <td className="px-3 py-3.5 text-right text-sm font-bold tabular-nums text-slate-950">
                    {formatCurrency(itemsTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile */}
          <div className="divide-y divide-[#eeecf5] md:hidden">
            {items.map((item, index) => (
              <div key={item.id || index} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-700">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="break-words text-sm font-bold text-slate-900">
                        {item.item_name || "Item"}
                      </p>
                      {item.description && (
                        <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>
                      )}
                    </div>
                  </div>
                  <p className="shrink-0 text-sm font-bold tabular-nums text-slate-900">
                    {formatCurrency(item.total_amount)}
                  </p>
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-[#ece9f5] bg-[#faf9ff] p-3">
                  {[
                    ["Quantity", `${num(item.quantity)} ${item.unit || ""}`],
                    ["Rate", formatCurrency(item.rate)],
                    ["Discount", num(item.discount) > 0 ? `-${formatCurrency(item.discount)}` : "—"],
                    ["Taxable", formatCurrency(item.taxable_amount)],
                    ["GST", `${num(item.gst_percent)}% · ${formatCurrency(item.gst_amount)}`],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[11px] text-slate-500">{label}</dt>
                      <dd className="mt-0.5 text-xs font-semibold text-slate-700">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}

            <div className="flex items-center justify-between bg-[#faf9ff] px-4 py-3.5">
              <span className="text-xs font-bold text-slate-700">Total ({totalQty} qty)</span>
              <span className="text-sm font-bold tabular-nums text-slate-950">
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
        <div className="divide-y divide-[#eeecf5]">
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

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-emerald-800">Grand total</span>
            <span className="text-2xl font-extrabold tracking-tight tabular-nums text-slate-900">
              {formatCurrency(totals.grandTotal)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-dashed border-violet-200 bg-[#faf9ff] px-4 py-3">
          <p className="text-[11px] font-semibold text-slate-500">Amount in words</p>
          <p className="mt-1 text-sm font-medium leading-5 text-slate-800">
            {amountInWords(totals.grandTotal)}
          </p>
        </div>
      </CardContent>
    </Panel>
  )
}

function PaymentSummaryCard({ totals, isFullyPaid, dueInfo, onRecordPayment }) {
  const dueText = {
    slate: "text-slate-500",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    red: "text-rose-700",
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
            isFullyPaid ? "border-emerald-100 bg-emerald-50/70" : "border-rose-100 bg-rose-50/70"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className={`text-sm font-semibold ${isFullyPaid ? "text-emerald-800" : "text-rose-700"}`}>
              Balance due
            </span>
            <span
              className={`text-2xl font-extrabold tracking-tight tabular-nums ${
                isFullyPaid ? "text-emerald-700" : "text-rose-600"
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
            <span className="font-medium text-slate-600">Collected</span>
            <span className="font-bold tabular-nums text-slate-800">{Math.round(totals.paidPercent)}%</span>
          </div>
          <div
            className="h-2.5 overflow-hidden rounded-full bg-rose-100"
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
            className="h-11 w-full gap-2 rounded-xl border border-violet-200 bg-white font-semibold text-slate-700 shadow-sm hover:bg-violet-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Record payment
          </Button>
        )}
      </CardContent>
    </Panel>
  )
}

function PaymentHistoryCard({ bill, payments, totals, isFullyPaid, dueInfo, onAddPayment }) {
  const events = useMemo(() => {
    const sorted = [...payments].sort((a, b) => {
      const byDate = String(a.payment_date || "").localeCompare(String(b.payment_date || ""))
      return byDate !== 0 ? byDate : String(a.created_at || "").localeCompare(String(b.created_at || ""))
    })

    let balance = round2(totals.grandTotal - totals.advanceAdjusted)
    const list = [
      { key: "issued", type: "issued", title: "Bill issued", date: bill.bill_date, amount: totals.grandTotal },
    ]

    if (totals.advanceAdjusted > 0) {
      list.push({
        key: "advance",
        type: "advance",
        title: "Advance adjusted",
        date: bill.bill_date,
        amount: totals.advanceAdjusted,
        balance,
      })
    }

    sorted.forEach((payment) => {
      const amount = num(payment.amount)
      const refund = Boolean(payment.is_refund)
      balance = refund ? round2(balance + amount) : Math.max(0, round2(balance - amount))

      list.push({
        key: payment.id,
        type: refund ? "refund" : "payment",
        title: `${refund ? "Refund" : "Payment"} · ${payment.payment_mode || "Other"}`,
        date: payment.payment_date,
        amount,
        balance,
      })
    })

    return list
  }, [bill.bill_date, payments, totals])

  const dotStyles = {
    issued: "border-slate-300 bg-white",
    advance: "border-blue-300 bg-blue-100",
    payment: "border-emerald-500 bg-emerald-100",
    refund: "border-rose-400 bg-rose-100",
  }

  return (
    <Panel
      icon={CreditCard}
      title="Payment history"
      description={`${payments.length} ${payments.length === 1 ? "payment" : "payments"} recorded`}
      action={
        !isFullyPaid && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddPayment}
            className="h-9 shrink-0 gap-2 rounded-xl border-violet-200 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm hover:bg-violet-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add payment
          </Button>
        )
      }
    >
      <ol className="px-5 py-5">
        {events.map((event, index) => (
          <li key={event.key} className="relative flex gap-4 pb-6">
            {(index < events.length - 1 || !isFullyPaid) && (
              <span className="absolute left-[7px] top-4 h-full w-px bg-[#e4e0f2]" aria-hidden="true" />
            )}
            <span
              className={`relative mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-2 ${dotStyles[event.type]}`}
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">{event.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {event.date ? formatDate(event.date) : "Date not available"}
                </p>
              </div>
              <div className="sm:text-right">
                <p
                  className={`text-sm font-bold tabular-nums ${
                    event.type === "issued"
                      ? "text-slate-900"
                      : event.type === "refund"
                        ? "text-rose-600"
                        : "text-emerald-700"
                  }`}
                >
                  {event.type === "issued" ? "" : event.type === "refund" ? "- " : "+ "}
                  {formatCurrency(event.amount)}
                </p>
                {event.type !== "issued" && (
                  <p className="mt-0.5 text-xs text-slate-500">
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
              isFullyPaid ? "border-emerald-600 bg-emerald-600" : "border-dashed border-slate-300 bg-white"
            }`}
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-bold text-slate-900">
              {isFullyPaid ? "Bill settled" : `Balance pending: ${formatCurrency(totals.amountDue)}`}
            </p>
            {!isFullyPaid && <p className="mt-0.5 text-xs text-slate-500">{dueInfo.text}</p>}
          </div>
        </li>
      </ol>
    </Panel>
  )
}

function CustomerCard({ bill, customer, shop, totals }) {
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
            className="h-9 shrink-0 gap-1.5 rounded-xl border-violet-200 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm hover:bg-violet-50"
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
          <Avatar name={customer.name} className="bg-blue-100 text-blue-700" />
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-slate-900">
              {customer.name || "Walk-in customer"}
            </p>
            <p className="text-xs text-slate-500">
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
            <p className="text-sm text-slate-400">No additional customer information available.</p>
          )}
        </div>

        {(customer.mobile || customer.whatsapp) && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            {customer.mobile ? (
              <Button
                asChild
                variant="outline"
                className="h-10 gap-2 rounded-xl border-violet-200 bg-white text-sm font-semibold text-slate-700 hover:bg-violet-50"
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
              className="h-10 gap-2 rounded-xl border-violet-200 bg-white text-sm font-semibold text-slate-700 hover:bg-violet-50 disabled:opacity-50"
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
  return (
    <Panel icon={Store} title="Shop" description="Bill issued by">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <Avatar name={shop.name} className="bg-emerald-100 text-emerald-700" />
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-slate-900">{shop.name || "Shop"}</p>
            {shop.gstin && (
              <span className="mt-1 inline-flex rounded-full border border-violet-100 bg-violet-50 px-2.5 py-0.5 text-[10px] font-bold text-violet-700">
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
            <p className="text-sm text-slate-400">No additional shop information available.</p>
          )}
        </div>
      </CardContent>
    </Panel>
  )
}

function BillInfoCard({ bill, status, overdue, dueInfo }) {
  const dueTone = {
    slate: "border-slate-200 bg-slate-100 text-slate-600",
    emerald: "border-emerald-200 bg-emerald-100 text-emerald-700",
    amber: "border-amber-200 bg-amber-100 text-amber-700",
    red: "border-rose-200 bg-rose-100 text-rose-700",
  }[dueInfo.tone]

  return (
    <Panel icon={Receipt} title="Bill information" description="Dates and tax settings">
      <dl className="divide-y divide-[#eeecf5] px-5 py-1">
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
            className="h-9 gap-1.5 rounded-xl border-violet-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-violet-50"
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
            className="h-9 w-9 rounded-xl text-rose-600 hover:bg-rose-50 hover:text-rose-700"
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
          className="group relative block w-full overflow-hidden rounded-2xl border border-[#ece9f5] bg-[#faf9ff] text-left transition-all hover:border-violet-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
        >
          <div className="flex aspect-[4/3] items-center justify-center overflow-hidden p-2">
            {isImageUrl(url) ? (
              <img src={url} alt="Attached bill" className="h-full w-full object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-500">
                <FileText className="h-10 w-10 text-violet-400" aria-hidden="true" />
                <span className="text-sm font-semibold">PDF document</span>
              </div>
            )}
          </div>
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm">
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
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{notes}</p>
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
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </div>
          <DialogTitle className="text-lg font-bold text-[#171a36]">Delete attachment?</DialogTitle>
          <DialogDescription className="mt-2 text-sm text-slate-500">
            The attached bill file will be permanently removed from storage. This cannot be undone.
          </DialogDescription>
        </div>
        <DialogFooter className="mt-6 flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
            className="h-11 w-full rounded-xl border-violet-200 bg-white hover:bg-violet-50 sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="h-11 w-full rounded-xl bg-rose-600 text-white hover:bg-rose-700 sm:w-auto"
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

function RecordPaymentDialog({ open, onClose, bill, status, customer, totals, today, saving, onSubmit }) {
  const [amount, setAmount] = useState("")
  const [mode, setMode] = useState("Cash")
  const [paymentDate, setPaymentDate] = useState(today)

  useEffect(() => {
    if (open) {
      setAmount(String(totals.amountDue || 0))
      setMode("Cash")
      setPaymentDate(today)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const numericAmount = Number(amount)
  const amountValid =
    Number.isFinite(numericAmount) && numericAmount > 0 && numericAmount <= totals.amountDue
  const minDate = bill.bill_date ? bill.bill_date.slice(0, 10) : undefined
  const dateValid = Boolean(paymentDate) && paymentDate <= today && (!minDate || paymentDate >= minDate)
  const isValid = amountValid && dateValid
  const remainingAfter = amountValid ? round2(totals.amountDue - numericAmount) : null

  function handleSubmit(event) {
    event.preventDefault()
    if (!isValid) return
    onSubmit(round2(numericAmount), mode, paymentDate)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden rounded-[20px] border-0 p-0 shadow-[0_12px_32px_rgba(80,65,130,0.25)] sm:max-w-md">
        <DialogHeader className="border-b border-[#eae7f4] bg-[#f7f5ff] px-6 pb-5 pt-6 text-left">
          <div className="flex items-start gap-4 pr-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white shadow-sm">
              <ArrowDownLeft className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold tracking-tight text-[#171a36]">
                Record payment
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-slate-600">
                Add a payment against this bill.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex max-h-[calc(92vh-110px)] flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto bg-white px-6 py-6">
            <div className="rounded-2xl border border-[#ece9f5] bg-[#faf9ff] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {customer.name || "Walk-in customer"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">Bill {bill.bill_number || "—"}</p>
                </div>
                <StatusPill status={status} />
              </div>
              <div className="mt-3 border-t border-[#eae7f4] pt-3">
                <p className="text-[11px] font-semibold text-slate-500">Pending amount</p>
                <p className="mt-1 text-2xl font-extrabold tracking-tight text-rose-600 tabular-nums">
                  {formatCurrency(totals.amountDue)}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payment-amount" className="text-[13px] font-medium text-slate-700">
                Payment amount (₹)
              </Label>
              <Input
                id="payment-amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                max={totals.amountDue}
                step="0.01"
                required
                autoFocus
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className={fieldClass}
                placeholder="Enter amount"
              />
              {numericAmount > totals.amountDue && (
                <p className="text-xs text-rose-600">
                  Amount cannot exceed {formatCurrency(totals.amountDue)}.
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {[0.25, 0.5, 1].map((fraction) => (
                  <button
                    key={fraction}
                    type="button"
                    onClick={() => setAmount(String(round2(totals.amountDue * fraction)))}
                    className="rounded-full border border-violet-100 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                  >
                    {fraction === 1 ? "Full amount" : `${fraction * 100}%`}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-[13px] font-medium text-slate-700">Payment mode</Label>
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
                <Label htmlFor="payment-date" className="text-[13px] font-medium text-slate-700">
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
              <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
                <span className="text-xs font-semibold text-emerald-800">Balance after this payment</span>
                <span
                  className={`text-sm font-bold tabular-nums ${
                    remainingAfter === 0 ? "text-emerald-700" : "text-slate-900"
                  }`}
                >
                  {formatCurrency(remainingAfter)}
                </span>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-[#eae7f4] bg-[#f7f5ff] px-6 py-4 sm:justify-end sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
              className="h-11 rounded-xl border-violet-200 bg-white px-5 text-sm font-medium text-slate-700 hover:bg-violet-50"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !isValid}
              className="h-11 gap-2 rounded-xl border border-violet-200 bg-white px-6 text-sm font-semibold text-slate-700 shadow-sm hover:bg-violet-50 disabled:opacity-50"
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

        <DialogHeader className="border-b border-[#eae7f4] bg-[#f7f5ff] px-5 py-4 text-left">
          <div className="flex items-center gap-3 pr-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <Eye className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-[#171a36]">Bill preview</DialogTitle>
              <DialogDescription className="text-xs">
                {bill.bill_number || "Bill"} · {customer.name || "Walk-in customer"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="bill-preview-scroll min-h-0 flex-1 overflow-y-auto bg-[#efedf7] p-3 sm:p-6">
          <article
            id="bill-print-area"
            className="mx-auto max-w-3xl overflow-hidden rounded-xl bg-white text-slate-800 shadow-[0_2px_12px_rgba(15,23,42,0.10)]"
          >
            {/* Letterhead */}
            <div className="flex flex-col gap-4 px-6 pt-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xl font-bold tracking-tight text-slate-950">{shop.name || "Shop"}</p>
                <div className="mt-2 space-y-0.5 text-sm text-slate-500">
                  {shop.address && <p className="max-w-xs">{shop.address}</p>}
                  {shop.mobile && <p>Mobile: {shop.mobile}</p>}
                  {shop.gstin && (
                    <p>
                      GSTIN: <span className="font-medium text-slate-700">{shop.gstin}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="sm:text-right">
                <p className="text-sm font-semibold text-emerald-700">
                  {shop.gstin ? "Tax invoice" : "Invoice"}
                </p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
                  {bill.bill_number || "—"}
                </p>
                <div className="mt-2 sm:flex sm:justify-end">
                  <StatusPill status={status} />
                </div>
              </div>
            </div>

            {/* Parties and details */}
            <div className="mt-6 grid grid-cols-1 gap-5 border-y border-slate-100 bg-slate-50/70 px-6 py-5 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-slate-500">Billed to</p>
                <p className="mt-1.5 text-base font-bold text-slate-900">
                  {customer.name || "Walk-in customer"}
                </p>
                <div className="mt-1 space-y-0.5 text-sm text-slate-500">
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
                    <dt className="text-xs font-medium text-slate-500">{label}</dt>
                    <dd className="mt-0.5 font-semibold text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Items */}
            <div className="overflow-x-auto px-6 py-5">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="w-10 py-2.5 pr-2">#</th>
                    <th className="px-2 py-2.5">Item</th>
                    <th className="px-2 py-2.5 text-right">Qty</th>
                    <th className="px-2 py-2.5 text-right">Rate</th>
                    <th className="px-2 py-2.5 text-right">Disc.</th>
                    <th className="px-2 py-2.5 text-right">GST</th>
                    <th className="py-2.5 pl-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        No bill items found.
                      </td>
                    </tr>
                  ) : (
                    items.map((item, index) => (
                      <tr key={item.id || index}>
                        <td className="py-3 pr-2 text-slate-400">{index + 1}</td>
                        <td className="px-2 py-3">
                          <p className="font-medium text-slate-900">{item.item_name || "Item"}</p>
                          {item.description && (
                            <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>
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
                        <td className="py-3 pl-2 text-right font-semibold tabular-nums text-slate-900">
                          {formatCurrency(item.total_amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {items.length > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  {items.length} {items.length === 1 ? "item" : "items"} · total quantity {totalQty}
                </p>
              )}
            </div>

            {/* Totals */}
            <div className="grid grid-cols-1 gap-6 border-t border-slate-200 px-6 py-5 sm:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-slate-500">Amount in words</p>
                  <p className="mt-1 text-sm font-medium leading-5 text-slate-800">
                    {amountInWords(totals.grandTotal)}
                  </p>
                </div>
                {bill.notes && (
                  <div>
                    <p className="text-xs font-medium text-slate-500">Notes</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-600">{bill.notes}</p>
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

                <div className="mt-3 border-t border-dashed border-slate-200 pt-1">
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
                    valueClass={isPaid ? "text-emerald-600" : "text-rose-600"}
                    bold
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-end justify-between gap-6 border-t border-slate-100 bg-slate-50/70 px-6 py-5">
              <p className="max-w-xs text-xs leading-5 text-slate-500">
                Thank you for your business. This is a computer generated invoice.
              </p>
              <div className="text-center">
                <div className="mb-1.5 h-px w-40 bg-slate-300" />
                <p className="text-xs font-medium text-slate-600">Authorised signatory</p>
                <p className="text-xs text-slate-400">{shop.name || ""}</p>
              </div>
            </div>
          </article>
        </div>

        <DialogFooter className="gap-2 border-t border-[#eae7f4] bg-[#f7f5ff] px-5 py-3 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-10 rounded-xl border-violet-200 bg-white hover:bg-violet-50"
          >
            Close
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => window.print()}
            className="h-10 gap-2 rounded-xl border-violet-200 bg-white hover:bg-violet-50"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Print
          </Button>
          <Button
            type="button"
            onClick={onDownload}
            className="h-10 gap-2 rounded-xl border border-violet-200 bg-white text-slate-700 hover:bg-violet-50"
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
        <DialogHeader className="border-b border-[#eae7f4] bg-[#f7f5ff] px-5 py-4 text-left">
          <div className="flex items-center gap-3 pr-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <ImageIcon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-[#171a36]">Attached bill</DialogTitle>
              <DialogDescription className="text-xs">
                Offline copy uploaded with {billNumber || "this bill"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto bg-[#efedf7] p-4">
          {image ? (
            <img
              src={url}
              alt="Attached bill"
              onClick={() => setZoomed((value) => !value)}
              className={
                zoomed
                  ? "mx-auto max-w-none cursor-zoom-out rounded-lg bg-white shadow"
                  : "mx-auto max-h-[68vh] w-auto max-w-full cursor-zoom-in rounded-lg bg-white object-contain shadow"
              }
            />
          ) : (
            <iframe src={url} title="Attached bill document" className="h-[68vh] w-full rounded-lg bg-white shadow" />
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-[#eae7f4] bg-[#f7f5ff] px-5 py-3 sm:gap-2">
          {image && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setZoomed((value) => !value)}
              className="h-10 gap-2 rounded-xl border-violet-200 bg-white hover:bg-violet-50"
            >
              {zoomed ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
              {zoomed ? "Fit to screen" : "Actual size"}
            </Button>
          )}
          <Button
            asChild
            variant="outline"
            className="h-10 gap-2 rounded-xl border-violet-200 bg-white hover:bg-violet-50"
          >
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              Open in new tab
            </a>
          </Button>
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-10 rounded-xl border border-violet-200 bg-white text-slate-700 hover:bg-violet-50"
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
        const [billRes, itemsRes, paymentsRes] = await Promise.all([
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

          supabase
            .from("payments")
            .select("*")
            .eq("bill_id", id)
            .eq("shop_id", shopId)
            .order("payment_date", { ascending: false }),
        ])

        if (billRes.error) throw billRes.error
        if (itemsRes.error) throw itemsRes.error
        if (paymentsRes.error) throw paymentsRes.error

        // A newer request has started — ignore this result
        if (requestId !== requestRef.current) return

        setBill(billRes.data || null)
        setItems(itemsRes.data || [])
        setPayments(paymentsRes.data || [])
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

  async function handleRecordPayment(amount, paymentMode, paymentDate) {
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
      if (amount > latestTotals.amountDue) {
        throw new Error("The pending amount has changed. Refresh and try again.")
      }

      const newPaid = round2(latestTotals.amountPaid + amount)
      const newDue = Math.max(0, round2(latestTotals.grandTotal - latestTotals.advanceAdjusted - newPaid))

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

      const { error: updateError } = await supabase
        .from("bills")
        .update({
          amount_paid: newPaid,
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

      toast.success("Payment recorded successfully")
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

  /* ------------------------------ Render states ---------------------------- */

  if (!currentShop) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-3xl border border-dashed border-violet-200 bg-white/80 p-8 text-center">
        <div className="max-w-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <Receipt className="h-7 w-7" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">No workspace selected</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Select a workspace to view this bill.</p>
        </div>
      </div>
    )
  }

  if (loading) return <PageSkeleton />

  if (!bill) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-3xl border border-dashed border-violet-200 bg-white/80 p-8 text-center">
        <div className="max-w-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
            <Receipt className="h-7 w-7" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">
            {loadError ? "Could not load bill" : "Bill not found"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {loadError || "This bill may have been deleted or does not belong to this workspace."}
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {loadError && (
              <Button
                type="button"
                variant="outline"
                onClick={() => loadBill()}
                className="rounded-xl border-violet-200 bg-white hover:bg-violet-50"
              >
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                Try again
              </Button>
            )}
            <Button
              type="button"
              onClick={() => navigate("/bills")}
              className="rounded-xl border border-violet-200 bg-white text-slate-700 hover:bg-violet-50"
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
    <div className="min-h-full w-full space-y-4 rounded-2xl bg-[#f7f5ff] px-3 py-5 sm:px-5 lg:px-6">
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
          valueClass={isFullyPaid ? "text-emerald-700" : "text-rose-600"}
        />
        <SummaryCard
          label="Payment progress"
          value={`${Math.round(totals.paidPercent)}%`}
          detail="Of the bill has been received"
          icon={Clock3}
          tone="purple"
        >
          <div
            className="mt-4 h-2 overflow-hidden rounded-full bg-violet-100"
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
          <ItemsCard bill={bill} items={items} />

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
            totals={totals}
            isFullyPaid={isFullyPaid}
            dueInfo={dueInfo}
            onAddPayment={() => setPayOpen(true)}
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

      <footer className="flex flex-col justify-between gap-2 rounded-xl border border-white/80 bg-white/65 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-emerald-700" aria-hidden="true" />
          <span>
            Bill:
            <strong className="ml-1 text-slate-700">{bill.bill_number || "—"}</strong>
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