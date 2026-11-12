import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams, Link } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatDate, PAYMENT_MODES } from "@/lib/utils"
import { generateBillPDF } from "@/lib/pdf"
import { Button } from "@/components/ui/button"
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
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
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

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const ATTACHMENT_BUCKET = "bill_attachments"

// Full class strings so Tailwind can detect them
const TONES = {
  slate: { icon: "bg-slate-100 text-slate-700", bar: "bg-slate-400" },
  emerald: { icon: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-500" },
  blue: { icon: "bg-blue-50 text-blue-600", bar: "bg-blue-500" },
  violet: { icon: "bg-violet-50 text-violet-600", bar: "bg-violet-500" },
  amber: { icon: "bg-amber-50 text-amber-700", bar: "bg-amber-500" },
  rose: { icon: "bg-rose-50 text-rose-600", bar: "bg-rose-500" },
  red: { icon: "bg-red-50 text-red-600", bar: "bg-red-500" },
}

const STATUS_STYLES = {
  paid: { label: "Paid", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  partial: { label: "Partially paid", className: "border-amber-200 bg-amber-50 text-amber-700" },
  unpaid: { label: "Unpaid", className: "border-red-200 bg-red-50 text-red-700" },
  overdue: { label: "Overdue", className: "border-red-300 bg-red-100 text-red-800" },
}

const PILL_STYLES = {
  slate: "bg-slate-100 text-slate-600",
  emerald: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100

function getLocalDateString() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function daysBetween(fromStr, toStr) {
  return Math.round((new Date(toStr) - new Date(fromStr)) / 86400000)
}

function getInitials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase()
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
  const paidPercent = grandTotal > 0 ? Math.min(100, (totalReceived / grandTotal) * 100) : 0
  const totalTax = round2(
    Number(bill.cgst_amount || 0) + Number(bill.sgst_amount || 0) + Number(bill.igst_amount || 0)
  )

  return { grandTotal, amountPaid, advanceAdjusted, amountDue, totalReceived, paidPercent, totalTax }
}

function isImageUrl(url = "") {
  return /\.(jpe?g|png|gif|webp)(\?.*)?$/i.test(url)
}

function getStoragePath(url) {
  const parts = url.split(`/${ATTACHMENT_BUCKET}/`)
  if (parts.length < 2) throw new Error("Invalid attachment URL format")
  return decodeURIComponent(parts[1].split("?")[0])
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
  if (rest) parts.push(rest < 20 ? ONES[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? ` ${ONES[rest % 10]}` : ""}`)
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

function normalizeIndianMobile(mobile = "") {
  const digits = String(mobile).replace(/\D/g, "")
  return digits.length === 10 ? `91${digits}` : digits
}

/** Human readable due-date summary. */
function getDueInfo(bill, totals, today) {
  if (!bill.due_date) return { text: "No due date set", tone: "slate" }
  if (totals.amountDue <= 0) return { text: "Settled in full", tone: "emerald" }

  const diff = daysBetween(today, bill.due_date.slice(0, 10))
  if (diff < 0) {
    const days = Math.abs(diff)
    return { text: `Overdue by ${days} ${days === 1 ? "day" : "days"}`, tone: "red", overdueDays: days }
  }
  if (diff === 0) return { text: "Due today", tone: "amber" }
  return { text: `Due in ${diff} ${diff === 1 ? "day" : "days"}`, tone: diff <= 3 ? "amber" : "slate" }
}

/* -------------------------------------------------------------------------- */
/*  Building blocks                                                           */
/* -------------------------------------------------------------------------- */

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.unpaid
  return (
    <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-medium ${style.className}`}>
      {style.label}
    </span>
  )
}

/** Standard card: coloured icon header + body. Every section uses this. */
function Card({ icon: Icon, tone = "emerald", title, description, action, children, className = "" }) {
  return (
    <section
      className={`flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_4px_14px_rgba(15,23,42,0.07)] print:break-inside-avoid print:shadow-none ${className}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONES[tone].icon}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 truncate text-xs text-slate-500">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  )
}

function KpiCard({ title, value, note, noteClassName = "text-slate-500", icon: Icon, tone, valueClassName = "text-slate-950", children }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] print:shadow-none">
      <div className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className={`mt-2 truncate text-[26px] font-semibold leading-none tracking-tight tabular-nums ${valueClassName}`}>
            {value}
          </p>
          <p className={`mt-2.5 text-xs font-medium ${noteClassName}`}>{note}</p>
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TONES[tone].icon}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {children}
    </div>
  )
}

function InfoRow({ label, children }) {
  if (children === null || children === undefined || children === "") return null
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-900">{children}</dd>
    </div>
  )
}

function AmountRow({ label, value, valueClassName = "text-slate-800", bold = false }) {
  return (
    <div className="flex items-center justify-between gap-6 py-2 text-sm">
      <span className={bold ? "font-semibold text-slate-900" : "text-slate-500"}>{label}</span>
      <span className={`tabular-nums ${bold ? "font-semibold" : "font-medium"} ${valueClassName}`}>{value}</span>
    </div>
  )
}

function ContactLine({ icon: Icon, children, align = "center" }) {
  return (
    <div className={`flex ${align === "start" ? "items-start" : "items-center"} gap-3 text-sm text-slate-600`}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  )
}

function Avatar({ name, tone }) {
  return (
    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${TONES[tone].icon}`}>
      {getInitials(name)}
    </div>
  )
}

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex min-h-[150px] flex-col items-center justify-center px-5 py-8 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-medium text-slate-900">{title}</p>
      {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Row 0 — page header                                                       */
/* -------------------------------------------------------------------------- */

function PageHeader({ bill, status, refreshing, isFullyPaid, onRefresh, onPreview, onDownload, onRecordPayment }) {
  async function copyBillNumber() {
    try {
      await navigator.clipboard.writeText(bill.bill_number || "")
      toast.success("Bill number copied")
    } catch {
      toast.error("Could not copy bill number")
    }
  }

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-500 print:hidden" aria-label="Breadcrumb">
          <Link to="/bills" className="transition-colors hover:text-emerald-700">Bills</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700">{bill.bill_number || "Bill details"}</span>
        </nav>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
            {bill.bill_number || "Bill details"}
          </h1>
          <StatusBadge status={status} />
          {bill.bill_number && (
            <button
              type="button"
              onClick={copyBillNumber}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 print:hidden"
              aria-label="Copy bill number"
              title="Copy bill number"
            >
              <Copy className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {bill.bill_date ? `Issued on ${formatDate(bill.bill_date)}` : "Bill information, customer details and payment records."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Button type="button" variant="outline" onClick={onRefresh} disabled={refreshing} className="h-10 gap-2 rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <Button type="button" variant="outline" onClick={onPreview} className="h-10 gap-2 rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
          <Eye className="h-4 w-4" />
          Preview bill
        </Button>
        <Button type="button" variant="outline" onClick={onDownload} className="h-10 gap-2 rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
          <Download className="h-4 w-4" />
          Download PDF
        </Button>
        {!isFullyPaid && (
          <Button type="button" onClick={onRecordPayment} className="h-10 gap-2 rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700">
            <Plus className="h-4 w-4" />
            Record payment
          </Button>
        )}
      </div>
    </header>
  )
}

/* -------------------------------------------------------------------------- */
/*  Row 1 — KPI cards                                                         */
/* -------------------------------------------------------------------------- */

function KpiRow({ totals, isFullyPaid, dueInfo }) {
  const dueNote = { slate: "text-slate-500", emerald: "text-emerald-600", amber: "text-amber-600", red: "text-red-600" }[dueInfo.tone]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        title="Bill total"
        value={formatCurrency(totals.grandTotal)}
        note={totals.totalTax > 0 ? `Includes ${formatCurrency(totals.totalTax)} tax` : "Final bill amount"}
        icon={Receipt}
        tone="slate"
      />
      <KpiCard
        title="Amount received"
        value={formatCurrency(totals.totalReceived)}
        note={totals.advanceAdjusted > 0 ? `Incl. ${formatCurrency(totals.advanceAdjusted)} advance` : "Payments received so far"}
        icon={CheckCircle2}
        tone="emerald"
        valueClassName="text-emerald-600"
      />
      <KpiCard
        title="Pending amount"
        value={formatCurrency(totals.amountDue)}
        note={dueInfo.text}
        noteClassName={dueNote}
        icon={Wallet}
        tone={isFullyPaid ? "emerald" : "red"}
        valueClassName={isFullyPaid ? "text-emerald-600" : "text-red-600"}
      />
      <KpiCard
        title="Payment progress"
        value={`${Math.round(totals.paidPercent)}%`}
        note="Of the bill has been received"
        icon={Clock3}
        tone="blue"
      >
        <div className="mx-5 mb-5 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(totals.paidPercent)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${totals.paidPercent}%` }} />
        </div>
      </KpiCard>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Row 2 — customer / shop / bill information                                */
/* -------------------------------------------------------------------------- */

function CustomerCard({ bill, customer, shop, totals }) {
  const address = [customer.address, customer.city].filter(Boolean).join(", ")
  const whatsappNumber = normalizeIndianMobile(customer.mobile)

  function sendReminder() {
    const lines = [
      `Hello ${customer.name || ""},`.trim(),
      "",
      `This is a gentle reminder from ${shop.name || "our shop"} regarding bill ${bill.bill_number || ""}.`,
      `Pending amount: ${formatCurrency(totals.amountDue)}`,
      bill.due_date ? `Due date: ${formatDate(bill.due_date)}` : null,
      "",
      "Kindly make the payment at your earliest convenience. Thank you!",
    ].filter((line) => line !== null)

    window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank", "noopener,noreferrer")
  }

  return (
    <Card icon={User} tone="blue" title="Customer" description="Billed to">
      <div className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <Avatar name={customer.name} tone="blue" />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-slate-900">{customer.name || "Walk-in customer"}</p>
            <p className="text-xs text-slate-500">{customer.name ? "Registered customer" : "No customer linked"}</p>
          </div>
        </div>

        <div className="space-y-3">
          {customer.mobile && <ContactLine icon={Phone}>{customer.mobile}</ContactLine>}
          {address && <ContactLine icon={MapPin} align="start">{address}</ContactLine>}
          {!customer.mobile && !address && (
            <p className="text-sm text-slate-400">No additional customer information available.</p>
          )}
        </div>

        {customer.mobile && (
          <div className="grid grid-cols-2 gap-2 pt-1 print:hidden">
            <a
              href={`tel:${customer.mobile}`}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Phone className="h-4 w-4" />
              Call
            </a>
            <button
              type="button"
              onClick={sendReminder}
              disabled={totals.amountDue <= 0}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
              title={totals.amountDue <= 0 ? "No pending amount" : "Send payment reminder on WhatsApp"}
            >
              <MessageCircle className="h-4 w-4" />
              Remind
            </button>
          </div>
        )}
      </div>
    </Card>
  )
}

function ShopCard({ shop }) {
  return (
    <Card icon={Store} tone="violet" title="Shop" description="Bill issued by">
      <div className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <Avatar name={shop.name} tone="violet" />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-slate-900">{shop.name || "Shop"}</p>
            {shop.gstin && (
              <span className="mt-1 inline-flex rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
                GSTIN {shop.gstin}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {shop.mobile && <ContactLine icon={Phone}>{shop.mobile}</ContactLine>}
          {shop.address && <ContactLine icon={MapPin} align="start">{shop.address}</ContactLine>}
          {!shop.mobile && !shop.address && !shop.gstin && (
            <p className="text-sm text-slate-400">No additional shop information available.</p>
          )}
        </div>
      </div>
    </Card>
  )
}

function BillInfoCard({ bill, status, dueInfo }) {
  return (
    <Card icon={Receipt} tone="slate" title="Bill information" description="Dates and tax settings">
      <dl className="divide-y divide-slate-100 px-5 py-1">
        <InfoRow label="Bill number">{bill.bill_number || "—"}</InfoRow>
        <InfoRow label="Bill date">{bill.bill_date ? formatDate(bill.bill_date) : "—"}</InfoRow>
        <InfoRow label="Due date">
          <span className="flex flex-col items-end gap-1">
            {bill.due_date ? formatDate(bill.due_date) : "Not set"}
            {bill.due_date && (
              <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${PILL_STYLES[dueInfo.tone]}`}>{dueInfo.text}</span>
            )}
          </span>
        </InfoRow>
        <InfoRow label="Payment status"><StatusBadge status={status} /></InfoRow>
        <InfoRow label="Supply type">{bill.is_interstate ? "Interstate (IGST)" : "Intrastate (CGST + SGST)"}</InfoRow>
        <InfoRow label="Tax calculation">{bill.tax_inclusive ? "Tax inclusive" : "Tax exclusive"}</InfoRow>
      </dl>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/*  Row 3 — items                                                             */
/* -------------------------------------------------------------------------- */

function ItemsCard({ items }) {
  const totalQty = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
  const itemsTotal = round2(items.reduce((sum, item) => sum + Number(item.total_amount || 0), 0))

  return (
    <Card
      icon={ShoppingBag}
      tone="emerald"
      title="Bill items"
      description={`${items.length} ${items.length === 1 ? "item" : "items"} in this bill`}
    >
      {items.length === 0 ? (
        <EmptyState icon={ShoppingBag} title="No bill items found" />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/40 text-xs font-semibold text-slate-500">
                  <th className="w-14 px-5 py-3.5">#</th>
                  <th className="px-4 py-3.5">Item</th>
                  <th className="px-4 py-3.5 text-right">Qty</th>
                  <th className="px-4 py-3.5 text-right">Rate</th>
                  <th className="px-4 py-3.5 text-right">Discount</th>
                  <th className="px-4 py-3.5 text-right">GST</th>
                  <th className="px-5 py-3.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, index) => (
                  <tr key={item.id || index} className="transition-colors hover:bg-slate-50/70">
                    <td className="px-5 py-4">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-xs font-medium text-slate-500">
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-900">{item.item_name || "Item"}</p>
                      {item.description && <p className="mt-1 max-w-xs text-xs text-slate-500">{item.description}</p>}
                    </td>
                    <td className="px-4 py-4 text-right text-sm tabular-nums text-slate-600">{Number(item.quantity || 0)} {item.unit || ""}</td>
                    <td className="px-4 py-4 text-right text-sm tabular-nums text-slate-600">{formatCurrency(item.rate)}</td>
                    <td className="px-4 py-4 text-right text-sm tabular-nums text-slate-600">{Number(item.discount || 0)}%</td>
                    <td className="px-4 py-4 text-right text-sm tabular-nums text-slate-600">{Number(item.gst_percent || 0)}%</td>
                    <td className="px-5 py-4 text-right text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(item.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50/70">
                  <td className="px-5 py-3.5" />
                  <td className="px-4 py-3.5 text-sm font-semibold text-slate-700">Total</td>
                  <td className="px-4 py-3.5 text-right text-sm font-semibold tabular-nums text-slate-700">{totalQty}</td>
                  <td colSpan={3} />
                  <td className="px-5 py-3.5 text-right text-sm font-bold tabular-nums text-slate-950">{formatCurrency(itemsTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile */}
          <div className="divide-y divide-slate-100 md:hidden">
            {items.map((item, index) => (
              <div key={item.id || index} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-slate-900">{index + 1}. {item.item_name || "Item"}</p>
                    {item.description && <p className="mt-1 text-xs text-slate-500">{item.description}</p>}
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-slate-900">{formatCurrency(item.total_amount)}</p>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  {[
                    ["Quantity", `${Number(item.quantity || 0)} ${item.unit || ""}`],
                    ["Rate", formatCurrency(item.rate)],
                    ["Discount", `${Number(item.discount || 0)}%`],
                    ["GST", `${Number(item.gst_percent || 0)}%`],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-slate-500">{label}</dt>
                      <dd className="mt-1 text-sm font-medium text-slate-700">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
            <div className="flex items-center justify-between bg-slate-50/70 px-4 py-3.5">
              <span className="text-sm font-semibold text-slate-700">Total ({totalQty} qty)</span>
              <span className="text-sm font-bold text-slate-950">{formatCurrency(itemsTotal)}</span>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/*  Row 4 — amount breakdown / payment summary                                */
/* -------------------------------------------------------------------------- */

function AmountBreakdownCard({ bill, totals }) {
  return (
    <Card icon={IndianRupee} tone="amber" title="Amount breakdown" description="How the final amount is calculated">
      <div className="px-5 py-3">
        <AmountRow label="Subtotal" value={formatCurrency(bill.subtotal)} />
        {Number(bill.discount_amount || 0) > 0 && (
          <AmountRow label="Discount" value={`− ${formatCurrency(bill.discount_amount)}`} valueClassName="text-emerald-600" />
        )}
        {Number(bill.cgst_amount || 0) > 0 && <AmountRow label="CGST" value={formatCurrency(bill.cgst_amount)} />}
        {Number(bill.sgst_amount || 0) > 0 && <AmountRow label="SGST" value={formatCurrency(bill.sgst_amount)} />}
        {Number(bill.igst_amount || 0) > 0 && <AmountRow label="IGST" value={formatCurrency(bill.igst_amount)} />}
        {Number(bill.round_off || 0) !== 0 && <AmountRow label="Round off" value={formatCurrency(bill.round_off)} />}

        <div className="mt-3 flex items-center justify-between gap-4 rounded-xl bg-slate-900 px-4 py-3.5 text-white">
          <span className="text-sm font-semibold">Grand total</span>
          <span className="text-lg font-bold tabular-nums">{formatCurrency(totals.grandTotal)}</span>
        </div>

        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-3">
          <p className="text-xs font-medium text-slate-500">Amount in words</p>
          <p className="mt-1 text-sm font-medium leading-5 text-slate-800">{amountInWords(totals.grandTotal)}</p>
        </div>
      </div>
    </Card>
  )
}

function PaymentSummaryCard({ totals, isFullyPaid, dueInfo, onRecordPayment }) {
  const dueText = { slate: "text-slate-500", emerald: "text-emerald-700", amber: "text-amber-700", red: "text-red-700" }[dueInfo.tone]

  return (
    <Card icon={Wallet} tone="emerald" title="Payment summary" description="Received and remaining amounts">
      <div className="px-5 py-3">
        <AmountRow label="Grand total" value={formatCurrency(totals.grandTotal)} />
        {totals.advanceAdjusted > 0 && (
          <AmountRow label="Advance adjusted" value={`− ${formatCurrency(totals.advanceAdjusted)}`} />
        )}
        <AmountRow label="Payments received" value={`− ${formatCurrency(totals.amountPaid)}`} valueClassName="text-emerald-600" />

        <div className={`mt-3 rounded-xl px-4 py-3.5 ${isFullyPaid ? "bg-emerald-50" : "bg-red-50"}`}>
          <div className="flex items-center justify-between gap-4">
            <span className={`text-sm font-semibold ${isFullyPaid ? "text-emerald-800" : "text-red-800"}`}>Balance due</span>
            <span className={`text-lg font-bold tabular-nums ${isFullyPaid ? "text-emerald-600" : "text-red-600"}`}>
              {formatCurrency(totals.amountDue)}
            </span>
          </div>
          <p className={`mt-1.5 flex items-center gap-1.5 text-xs font-medium ${dueText}`}>
            {isFullyPaid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CalendarClock className="h-3.5 w-3.5" />}
            {dueInfo.text}
          </p>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Collected</span>
            <span className="font-medium text-slate-700">{Math.round(totals.paidPercent)}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${totals.paidPercent}%` }} />
          </div>
        </div>

        {!isFullyPaid && (
          <Button
            type="button"
            onClick={onRecordPayment}
            className="mt-4 h-10 w-full gap-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 print:hidden"
          >
            <Plus className="h-4 w-4" />
            Record payment
          </Button>
        )}
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/*  Row 5 — payment history / attachment / notes                              */
/* -------------------------------------------------------------------------- */

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
      list.push({ key: "advance", type: "advance", title: "Advance adjusted", date: bill.bill_date, amount: totals.advanceAdjusted, balance })
    }

    sorted.forEach((payment) => {
      balance = Math.max(0, round2(balance - Number(payment.amount || 0)))
      list.push({
        key: payment.id,
        type: "payment",
        title: payment.payment_mode || "Payment",
        date: payment.payment_date,
        amount: Number(payment.amount || 0),
        balance,
      })
    })

    return list
  }, [bill.bill_date, payments, totals])

  const dotStyles = {
    issued: "border-slate-300 bg-white",
    advance: "border-blue-300 bg-blue-100",
    payment: "border-emerald-400 bg-emerald-100",
  }

  return (
    <Card
      icon={CreditCard}
      tone="blue"
      title="Payment history"
      description={`${payments.length} ${payments.length === 1 ? "payment" : "payments"} recorded`}
      action={
        !isFullyPaid && (
          <Button type="button" size="sm" onClick={onAddPayment} className="h-9 gap-2 rounded-lg bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 print:hidden">
            <Plus className="h-4 w-4" />
            Add payment
          </Button>
        )
      }
    >
      <ol className="px-5 py-5">
        {events.map((event, index) => (
          <li key={event.key} className="relative flex gap-4 pb-6">
            {(index < events.length - 1 || !isFullyPaid) && (
              <span className="absolute left-[7px] top-4 h-full w-px bg-slate-200" aria-hidden="true" />
            )}
            <span className={`relative mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-2 ${dotStyles[event.type]}`} />
            <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{event.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{event.date ? formatDate(event.date) : "Date not available"}</p>
              </div>
              <div className="sm:text-right">
                <p className={`text-sm font-semibold tabular-nums ${event.type === "issued" ? "text-slate-900" : "text-emerald-600"}`}>
                  {event.type === "issued" ? "" : "+ "}{formatCurrency(event.amount)}
                </p>
                {event.type !== "issued" && (
                  <p className="mt-0.5 text-xs text-slate-500">Balance after: {formatCurrency(event.balance)}</p>
                )}
              </div>
            </div>
          </li>
        ))}

        <li className="relative flex gap-4">
          <span
            className={`relative mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-2 ${
              isFullyPaid ? "border-emerald-500 bg-emerald-500" : "border-dashed border-slate-300 bg-white"
            }`}
          />
          <div>
            <p className="text-sm font-medium text-slate-900">
              {isFullyPaid ? "Bill settled" : `Balance pending: ${formatCurrency(totals.amountDue)}`}
            </p>
            {!isFullyPaid && <p className="mt-0.5 text-xs text-slate-500">{dueInfo.text}</p>}
          </div>
        </li>
      </ol>
    </Card>
  )
}

function AttachmentCard({ url, deleting, onDelete, onPreview }) {
  return (
    <Card
      icon={ImageIcon}
      tone="rose"
      title="Attached bill"
      description="Scanned copy uploaded with this bill"
      action={
        <div className="flex items-center gap-1.5 print:hidden">
          <button
            type="button"
            onClick={onPreview}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
          >
            <Eye className="h-3.5 w-3.5" />
            Preview
          </button>
          <Button type="button" variant="ghost" size="sm" onClick={onDelete} disabled={deleting} className="h-8 gap-1.5 rounded-lg px-2.5 text-red-600 hover:bg-red-50 hover:text-red-700">
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete
          </Button>
        </div>
      }
    >
      <div className="p-5">
        <button
          type="button"
          onClick={onPreview}
          aria-label="Preview attached bill"
          className="group relative block w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-left transition-all hover:border-emerald-400 hover:shadow-md"
        >
          <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-slate-100 p-2">
            {isImageUrl(url) ? (
              <img src={url} alt="Attached bill" className="h-full w-full object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-500">
                <FileText className="h-10 w-10 text-slate-400" />
                <span className="text-sm font-medium">PDF document</span>
              </div>
            )}
          </div>
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-900 shadow-sm">
              <Eye className="h-3.5 w-3.5" />
              Preview
            </span>
          </div>
        </button>
      </div>
    </Card>
  )
}

function NotesCard({ notes }) {
  return (
    <Card icon={NotebookText} tone="amber" title="Notes" description="Additional information for this bill">
      <p className="whitespace-pre-wrap px-5 py-4 text-sm leading-6 text-slate-600">{notes}</p>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/*  Dialogs                                                                   */
/* -------------------------------------------------------------------------- */

function DeleteAttachmentDialog({ open, onOpenChange, deleting, onConfirm }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !deleting && onOpenChange(next)}>
      <DialogContent className="max-w-sm rounded-2xl p-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>
          <DialogTitle className="text-lg font-semibold text-slate-900">Delete attachment?</DialogTitle>
          <DialogDescription className="mt-2 text-sm text-slate-500">
            The attached bill file will be permanently removed from storage. This cannot be undone.
          </DialogDescription>
        </div>
        <DialogFooter className="mt-6 flex-col gap-2 sm:flex-row sm:justify-center">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={deleting} className="w-full rounded-xl sm:w-auto">
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={deleting} className="w-full rounded-xl bg-red-600 text-white hover:bg-red-700 sm:w-auto">
            {deleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
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

function RecordPaymentDialog({ open, onClose, bill, status, customer, totals, saving, onSubmit }) {
  const [amount, setAmount] = useState("")
  const [mode, setMode] = useState("Cash")

  useEffect(() => {
    if (open) {
      setAmount(String(totals.amountDue || 0))
      setMode("Cash")
    }
  }, [open, totals.amountDue])

  const numericAmount = Number(amount)
  const isValid = Number.isFinite(numericAmount) && numericAmount > 0 && numericAmount <= totals.amountDue
  const remainingAfter = isValid ? round2(totals.amountDue - numericAmount) : null

  function handleSubmit(event) {
    event.preventDefault()
    onSubmit(numericAmount, mode)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-900">Record payment</DialogTitle>
          <DialogDescription>Add a payment against this bill.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{customer.name || "Walk-in customer"}</p>
                <p className="mt-1 text-xs text-slate-500">Bill {bill.bill_number || "—"}</p>
              </div>
              <StatusBadge status={status} />
            </div>
            <div className="mt-4 border-t border-slate-200 pt-3">
              <p className="text-xs text-slate-500">Pending amount</p>
              <p className="mt-1 text-xl font-bold text-red-600">{formatCurrency(totals.amountDue)}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-amount">Payment amount</Label>
            <Input
              id="payment-amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              max={totals.amountDue}
              step="0.01"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="h-11 rounded-xl border-slate-200 focus-visible:ring-emerald-500"
              placeholder="Enter amount"
            />
            {numericAmount > totals.amountDue && (
              <p className="text-xs text-red-600">Amount cannot exceed {formatCurrency(totals.amountDue)}.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {[0.25, 0.5, 1].map((fraction) => (
                <button
                  key={fraction}
                  type="button"
                  onClick={() => setAmount(String(round2(totals.amountDue * fraction)))}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                >
                  {fraction === 1 ? "Full amount" : `${fraction * 100}%`}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Payment mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger className="h-11 rounded-xl border-slate-200 focus:ring-emerald-500">
                <SelectValue placeholder="Select payment mode" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_MODES.map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {remainingAfter !== null && (
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Balance after this payment:{" "}
              <span className={`font-semibold ${remainingAfter === 0 ? "text-emerald-600" : "text-slate-900"}`}>
                {formatCurrency(remainingAfter)}
              </span>
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="rounded-xl">
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !isValid} className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Confirm payment"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  Popups: bill preview + attachment preview (same window, no new tab)        */
/* -------------------------------------------------------------------------- */

function BillPreviewDialog({ open, onOpenChange, bill, items, customer, shop, totals, status, onDownload }) {
  const customerAddress = [customer.address, customer.city].filter(Boolean).join(", ")
  const isPaid = totals.amountDue <= 0
  const totalQty = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bill-preview-dialog flex max-h-[94vh] w-[calc(100vw-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl p-0">
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

        <DialogHeader className="border-b border-slate-100 px-5 py-4 text-left">
          <div className="flex items-center gap-3 pr-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Eye className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-slate-900">Bill preview</DialogTitle>
              <DialogDescription className="text-xs">
                {bill.bill_number || "Bill"} · {customer.name || "Walk-in customer"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="bill-preview-scroll min-h-0 flex-1 overflow-y-auto bg-slate-100 p-3 sm:p-6">
          <article id="bill-print-area" className="mx-auto max-w-3xl overflow-hidden rounded-xl bg-white text-slate-800 shadow-[0_2px_12px_rgba(15,23,42,0.10)]">
            {/* Letterhead */}
            <div className="flex flex-col gap-4 px-6 pt-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xl font-semibold tracking-tight text-slate-950">{shop.name || "Shop"}</p>
                <div className="mt-2 space-y-0.5 text-sm text-slate-500">
                  {shop.address && <p className="max-w-xs">{shop.address}</p>}
                  {shop.mobile && <p>Mobile: {shop.mobile}</p>}
                  {shop.gstin && <p>GSTIN: <span className="font-medium text-slate-700">{shop.gstin}</span></p>}
                </div>
              </div>
              <div className="sm:text-right">
                <p className="text-sm font-medium text-emerald-700">{shop.gstin ? "Tax invoice" : "Invoice"}</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{bill.bill_number || "—"}</p>
                <div className="mt-2 sm:flex sm:justify-end"><StatusBadge status={status} /></div>
              </div>
            </div>

            {/* Parties and details */}
            <div className="mt-6 grid grid-cols-1 gap-5 border-y border-slate-100 bg-slate-50/70 px-6 py-5 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-slate-500">Billed to</p>
                <p className="mt-1.5 text-base font-semibold text-slate-900">{customer.name || "Walk-in customer"}</p>
                <div className="mt-1 space-y-0.5 text-sm text-slate-500">
                  {customer.mobile && <p>Mobile: {customer.mobile}</p>}
                  {customerAddress && <p>{customerAddress}</p>}
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
              <table className="w-full min-w-[560px] text-left text-sm">
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
                    <tr><td colSpan={7} className="py-8 text-center text-slate-500">No bill items found.</td></tr>
                  ) : (
                    items.map((item, index) => (
                      <tr key={item.id || index}>
                        <td className="py-3 pr-2 text-slate-400">{index + 1}</td>
                        <td className="px-2 py-3">
                          <p className="font-medium text-slate-900">{item.item_name || "Item"}</p>
                          {item.description && <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>}
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums">{Number(item.quantity || 0)} {item.unit || ""}</td>
                        <td className="px-2 py-3 text-right tabular-nums">{formatCurrency(item.rate)}</td>
                        <td className="px-2 py-3 text-right tabular-nums">{Number(item.discount || 0)}%</td>
                        <td className="px-2 py-3 text-right tabular-nums">{Number(item.gst_percent || 0)}%</td>
                        <td className="py-3 pl-2 text-right font-semibold tabular-nums text-slate-900">{formatCurrency(item.total_amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {items.length > 0 && (
                <p className="mt-2 text-xs text-slate-500">{items.length} {items.length === 1 ? "item" : "items"} · total quantity {totalQty}</p>
              )}
            </div>

            {/* Totals */}
            <div className="grid grid-cols-1 gap-6 border-t border-slate-200 px-6 py-5 sm:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-slate-500">Amount in words</p>
                  <p className="mt-1 text-sm font-medium leading-5 text-slate-800">{amountInWords(totals.grandTotal)}</p>
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
                {Number(bill.discount_amount || 0) > 0 && (
                  <AmountRow label="Discount" value={`− ${formatCurrency(bill.discount_amount)}`} valueClassName="text-emerald-600" />
                )}
                {Number(bill.cgst_amount || 0) > 0 && <AmountRow label="CGST" value={formatCurrency(bill.cgst_amount)} />}
                {Number(bill.sgst_amount || 0) > 0 && <AmountRow label="SGST" value={formatCurrency(bill.sgst_amount)} />}
                {Number(bill.igst_amount || 0) > 0 && <AmountRow label="IGST" value={formatCurrency(bill.igst_amount)} />}
                {Number(bill.round_off || 0) !== 0 && <AmountRow label="Round off" value={formatCurrency(bill.round_off)} />}

                <div className="mt-2 flex items-center justify-between gap-4 rounded-lg bg-slate-900 px-4 py-3 text-white">
                  <span className="text-sm font-semibold">Grand total</span>
                  <span className="text-lg font-bold tabular-nums">{formatCurrency(totals.grandTotal)}</span>
                </div>

                <div className="mt-3 border-t border-dashed border-slate-200 pt-1">
                  {totals.advanceAdjusted > 0 && (
                    <AmountRow label="Advance adjusted" value={`− ${formatCurrency(totals.advanceAdjusted)}`} />
                  )}
                  <AmountRow label="Payments received" value={`− ${formatCurrency(totals.amountPaid)}`} valueClassName="text-emerald-600" />
                  <AmountRow
                    label="Balance due"
                    value={formatCurrency(totals.amountDue)}
                    valueClassName={isPaid ? "text-emerald-600" : "text-red-600"}
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

        <DialogFooter className="gap-2 border-t border-slate-100 px-5 py-3 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
            Close
          </Button>
          <Button type="button" variant="outline" onClick={() => window.print()} className="gap-2 rounded-xl">
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <Button type="button" onClick={onDownload} className="gap-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">
            <Download className="h-4 w-4" />
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
      <DialogContent className="flex max-h-[94vh] w-[calc(100vw-1.5rem)] max-w-5xl flex-col gap-0 overflow-hidden rounded-2xl p-0">
        <DialogHeader className="border-b border-slate-100 px-5 py-4 text-left">
          <div className="flex items-center gap-3 pr-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <ImageIcon className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-slate-900">Attached bill</DialogTitle>
              <DialogDescription className="text-xs">Scanned copy uploaded with {billNumber || "this bill"}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4">
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

        <DialogFooter className="gap-2 border-t border-slate-100 px-5 py-3 sm:gap-2">
          {image && (
            <Button type="button" variant="outline" onClick={() => setZoomed((value) => !value)} className="gap-2 rounded-xl">
              {zoomed ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
              {zoomed ? "Fit to screen" : "Actual size"}
            </Button>
          )}
          <Button type="button" onClick={() => onOpenChange(false)} className="rounded-xl bg-slate-900 text-white hover:bg-slate-800">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function BillDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { currentShop } = useShop()

  const [bill, setBill] = useState(null)
  const [items, setItems] = useState([])
  const [payments, setPayments] = useState([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState("")

  const [payOpen, setPayOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [deleteOpen, setDeleteOpen] = useState(false)

  // Popups
  const [previewOpen, setPreviewOpen] = useState(false)
  const [attachmentOpen, setAttachmentOpen] = useState(false)
  const [deletingAttachment, setDeletingAttachment] = useState(false)

  const today = getLocalDateString()

  /* ------------------------------ Data loading ----------------------------- */

  const loadBill = useCallback(
    async (showRefresh = false) => {
      if (!id) {
        setLoading(false)
        return
      }

      showRefresh ? setRefreshing(true) : setLoading(true)
      setLoadError("")

      try {
        let billQuery = supabase.from("bills").select("*, customers(*), shops(*)").eq("id", id)
        if (currentShop?.id) billQuery = billQuery.eq("shop_id", currentShop.id)

        const { data: billData, error: billError } = await billQuery.single()
        if (billError) throw billError
        if (!billData) {
          navigate("/bills")
          return
        }

        const [itemsRes, paymentsRes] = await Promise.all([
          supabase.from("bill_items").select("*").eq("bill_id", id).order("sort_order", { ascending: true }),
          supabase.from("payments").select("*").eq("bill_id", id).order("payment_date", { ascending: false }),
        ])

        if (itemsRes.error) throw itemsRes.error
        if (paymentsRes.error) throw paymentsRes.error

        setBill(billData)
        setItems(itemsRes.data || [])
        setPayments(paymentsRes.data || [])
      } catch (error) {
        const message = error.message || "Unable to load bill details."
        setLoadError(message)
        toast.error(message)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [id, currentShop?.id, navigate]
  )

  useEffect(() => {
    loadBill()
  }, [loadBill])

  /* ------------------------------ Derived data ----------------------------- */

  const totals = useMemo(() => computeTotals(bill), [bill])
  const isFullyPaid = totals ? totals.amountDue <= 0 : false
  const dueInfo = useMemo(() => (bill && totals ? getDueInfo(bill, totals, today) : null), [bill, totals, today])
  const displayStatus = dueInfo?.overdueDays ? "overdue" : bill?.payment_status

  /* -------------------------------- Actions -------------------------------- */

  async function handleRecordPayment(amount, paymentMode) {
    if (!bill || !currentShop?.id) return

    setSaving(true)
    try {
      const { data: latest, error: latestError } = await supabase
        .from("bills")
        .select("id, customer_id, amount_paid, grand_total, advance_adjusted, amount_due")
        .eq("id", bill.id)
        .eq("shop_id", currentShop.id)
        .single()

      if (latestError) throw latestError

      const latestTotals = computeTotals(latest)
      if (amount > latestTotals.amountDue) {
        throw new Error("The pending amount has changed. Refresh and try again.")
      }

      const newPaid = round2(latestTotals.amountPaid + amount)
      const newDue = Math.max(0, round2(latestTotals.grandTotal - latestTotals.advanceAdjusted - newPaid))

      const { error: paymentError } = await supabase.from("payments").insert({
        shop_id: currentShop.id,
        customer_id: latest.customer_id,
        bill_id: latest.id,
        amount,
        payment_mode: paymentMode,
        payment_date: today,
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
        .eq("shop_id", currentShop.id)

      if (updateError) {
        throw new Error(
          `Payment was recorded, but the bill balance could not be updated. Please refresh and verify. ${updateError.message}`
        )
      }

      toast.success("Payment recorded successfully")
      setPayOpen(false)
      await loadBill(true)
    } catch (error) {
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

      const { error: storageError } = await supabase.storage.from(ATTACHMENT_BUCKET).remove([filePath])
      if (storageError) throw storageError

      const { error: dbError } = await supabase
        .from("bills")
        .update({ attachment_url: null })
        .eq("id", bill.id)
        .eq("shop_id", currentShop.id)
      if (dbError) throw dbError

      toast.success("Attachment deleted")
      setDeleteOpen(false)
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

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          Loading bill details...
        </div>
      </div>
    )
  }

  if (loadError || !bill) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-center">
        <AlertCircle className="h-9 w-9 text-red-500" />
        <p className="mt-3 font-semibold text-slate-900">Unable to load bill</p>
        <p className="mt-1 max-w-md text-sm text-slate-500">{loadError || "The requested bill could not be found."}</p>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => navigate("/bills")}>
            Back to bills
          </Button>
          <Button className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => loadBill()}>
            Try again
          </Button>
        </div>
      </div>
    )
  }

  const customer = bill.customers || {}
  const shop = bill.shops || {}
  const hasSideCards = Boolean(bill.attachment_url || bill.notes)

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 pb-8">
      <PageHeader
        bill={bill}
        status={displayStatus}
        refreshing={refreshing}
        isFullyPaid={isFullyPaid}
        onRefresh={() => loadBill(true)}
        onPreview={() => setPreviewOpen(true)}
        onDownload={handleDownloadPDF}
        onRecordPayment={() => setPayOpen(true)}
      />

      {/* Row 1: key numbers */}
      <KpiRow totals={totals} isFullyPaid={isFullyPaid} dueInfo={dueInfo} />

      {/* Row 2: who, where, when */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        <CustomerCard bill={bill} customer={customer} shop={shop} totals={totals} />
        <ShopCard shop={shop} />
        <div className="md:col-span-2 xl:col-span-1">
          <BillInfoCard bill={bill} status={displayStatus} dueInfo={dueInfo} />
        </div>
      </div>

      {/* Row 3: line items */}
      <ItemsCard items={items} />

      {/* Row 4: money */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AmountBreakdownCard bill={bill} totals={totals} />
        <PaymentSummaryCard
          totals={totals}
          isFullyPaid={isFullyPaid}
          dueInfo={dueInfo}
          onRecordPayment={() => setPayOpen(true)}
        />
      </div>

      {/* Row 5: history, attachment, notes */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className={hasSideCards ? "lg:col-span-2" : "lg:col-span-3"}>
          <PaymentHistoryCard
            bill={bill}
            payments={payments}
            totals={totals}
            isFullyPaid={isFullyPaid}
            dueInfo={dueInfo}
            onAddPayment={() => setPayOpen(true)}
          />
        </div>

        {hasSideCards && (
          <div className="space-y-6">
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
        )}
      </div>

      <BillPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        bill={bill}
        items={items}
        customer={customer}
        shop={shop}
        totals={totals}
        status={displayStatus}
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
        status={displayStatus}
        customer={customer}
        totals={totals}
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