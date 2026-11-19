import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  AlertTriangle, BookOpen, CalendarDays, Camera, CheckCircle2, ChevronLeft, ChevronRight, Command,
  Compass, Copy, CornerDownLeft, CreditCard, Download, ExternalLink, Eye,
  FileText, History, Loader2, MapPin, MessageCircle, Package, Paperclip, Pencil,
  Phone, Plus, Receipt, RefreshCw, ScanLine, Search, SearchX, SlidersHorizontal,
  Trash2, UserRound, Users, Wallet, X,
} from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { moveToTrash } from "@/lib/trash"
import { useShop } from "@/contexts/ShopContext"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn, formatCurrency, formatDate, CUSTOMER_TYPES } from "@/lib/utils"

/* ==================================================
   CONSTANTS
================================================== */

const PAGE_SIZE = 15
const MAX_PHOTO_BYTES = 2 * 1024 * 1024
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"]
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/
const FETCH_BATCH = 1000
const RECENT_KEY = "khaatapro-command-center-recent"

// ONE button style for the whole page (no green buttons anywhere)
const BTN =
  "inline-flex h-10 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-violet-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 hover:text-violet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-violet-500 dark:hover:bg-slate-800 dark:hover:text-white"
const ICON_BTN =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-white text-slate-600 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 hover:text-violet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-violet-500 dark:hover:bg-slate-800 dark:hover:text-white"
const DANGER_BTN =
  "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800 focus-visible:ring-rose-500 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:border-rose-700 dark:hover:bg-rose-900/50 dark:hover:text-rose-200"
const DANGER_ICON_BTN =
  "border-rose-200 bg-rose-50 text-rose-600 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700 focus-visible:ring-rose-500 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:border-rose-700 dark:hover:bg-rose-900/50 dark:hover:text-rose-200"

const CARD =
  "overflow-hidden rounded-[20px] border border-white/80 bg-white shadow-[0_5px_18px_rgba(80,65,130,0.07)] backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/90"
const FIELD =
  "h-10 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
const INPUT =
  "h-11 w-full rounded-xl border border-violet-100 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"

const TYPE_META = {
  customer: { label: "Customer", plural: "Customers", icon: Users, tone: "bg-emerald-100/80 text-emerald-700" },
  invoice: { label: "Invoice", plural: "Invoices", icon: FileText, tone: "bg-violet-100/80 text-violet-700" },
  item: { label: "Bill item", plural: "Bill items", icon: Package, tone: "bg-teal-100 text-teal-700" },
  payment: { label: "Payment", plural: "Payments", icon: CreditCard, tone: "bg-blue-100/80 text-blue-700" },
  advance: { label: "Advance", plural: "Advances", icon: Wallet, tone: "bg-pink-100/80 text-pink-700" },
  khata: { label: "Khata entry", plural: "Khata entries", icon: BookOpen, tone: "bg-amber-100 text-amber-700" },
  attachment: { label: "Attachment", plural: "Attachments", icon: Paperclip, tone: "bg-slate-100 text-slate-600 dark:text-slate-300" },
  page: { label: "Page", plural: "Pages", icon: Compass, tone: "bg-violet-100/80 text-violet-700" },
}
const TYPE_ORDER = ["customer", "invoice", "item", "payment", "advance", "khata", "attachment", "page"]

const KHATA_LABELS = {
  you_gave: "You gave",
  customer_paid: "Customer paid",
  new_due: "New due",
  advance_received: "Advance received",
  advance_returned: "Advance returned",
}

// Every screen of the app, so the Command Center can jump anywhere
const APP_PAGES = [
  { to: "/", label: "Dashboard", hint: "Overview, sales and dues", icon: Compass },
  { to: "/bills/new", label: "Create Bill", hint: "New invoice", icon: Plus },
  { to: "/bills/import", label: "Import Offline Bill", hint: "Scan a paper bill", icon: ScanLine },
  { to: "/bills", label: "All Bills", hint: "Every invoice", icon: Receipt },
  { to: "/dues", label: "Dues", hint: "Unpaid and overdue bills", icon: FileText },
  { to: "/town-collections", label: "Town Collection", hint: "Dues grouped by town", icon: Compass },
  { to: "/payments", label: "Payments", hint: "All received payments", icon: CreditCard },
  { to: "/customers", label: "Customers", hint: "Customer list", icon: Users },
  { to: "/khata", label: "Personal Khata", hint: "Personal ledger", icon: BookOpen },
  { to: "/settings", label: "Shop Settings", hint: "Shops and preferences", icon: Compass },
  { to: "/profile", label: "My Profile", hint: "Your account", icon: UserRound },
]

const DATE_PRESETS = [
  { id: "today", label: "Today", days: 0 },
  { id: "7d", label: "7 days", days: 6 },
  { id: "30d", label: "30 days", days: 29 },
  { id: "month", label: "This month", days: -1 },
]

/* ==================================================
   HELPERS
================================================== */

const clean = (value) => String(value ?? "").trim()
const norm = (value) => clean(value).toLocaleLowerCase("en-IN")
const num = (value) => Number(value) || 0
const cap = (value) => {
  const text = clean(value)
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : ""
}

function localDate(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function toDay(value) {
  if (!value) return ""
  const text = String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? "" : localDate(date)
}

function toTs(value) {
  if (!value) return 0
  const time = Date.parse(value)
  return Number.isNaN(time) ? 0 : time
}

function escapeCsv(value) {
  const text = String(value ?? "")
  const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "")
}

function fileSize(bytes) {
  const size = num(bytes)
  if (!size) return ""
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function getInitials(name) {
  return String(name || "?").split(" ").filter(Boolean).slice(0, 2)
    .map((part) => part[0]).join("").toUpperCase() || "?"
}

function waLink(value) {
  const number = digits(value)
  if (!number) return ""
  return `https://wa.me/${number.length === 10 ? `91${number}` : number}`
}

function getCustomerPhotoStoragePath(photoUrl) {
  if (!photoUrl) return null
  try {
    const url = new URL(photoUrl)
    const marker = "/storage/v1/object/public/avatars/"
    const index = url.pathname.indexOf(marker)
    return index === -1 ? null : decodeURIComponent(url.pathname.slice(index + marker.length))
  } catch {
    return null
  }
}

async function removeCustomerPhoto(photoUrl) {
  const path = getCustomerPhotoStoragePath(photoUrl)
  if (!path) return
  const { error } = await supabase.storage.from("avatars").remove([path])
  if (error) throw error
}

async function uploadCustomerPhoto(shopId, file) {
  if (!(file instanceof File)) throw new Error("Please select a valid photo.")
  if (!PHOTO_TYPES.includes(file.type)) throw new Error("Use a JPG, PNG or WebP image.")
  if (file.size > MAX_PHOTO_BYTES) throw new Error("Photo must be smaller than 2 MB.")

  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type]
  const unique = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID() : Math.random().toString(36).slice(2)
  const path = `customers/${shopId}/${Date.now()}-${unique}.${ext}`
  const { data, error } = await supabase.storage.from("avatars").upload(path, file, {
    cacheControl: "3600", contentType: file.type, upsert: false,
  })
  if (error) throw error
  const { data: publicData } = supabase.storage.from("avatars").getPublicUrl(data.path)
  if (!publicData?.publicUrl) throw new Error("Photo uploaded, but its public URL could not be created.")
  return publicData.publicUrl
}

function resolveCustomerPhoto(value) {
  const photo = clean(value)
  if (!photo) return ""
  if (/^(https?:|data:|blob:)/i.test(photo)) return photo
  const path = photo.replace(/^\/+/, "").replace(/^avatars\//, "")
  return supabase.storage.from("avatars").getPublicUrl(path).data?.publicUrl || ""
}

function statusTone(status) {
  const text = norm(status)
  if (/overdue|unpaid|refund|archived/.test(text)) return "bg-rose-50 text-rose-700"
  if (/partial|due|advance|you gave|returned/.test(text)) return "bg-amber-50 text-amber-700"
  if (/paid|received|active|available/.test(text)) return "bg-emerald-50 text-emerald-700"
  return "bg-slate-100 text-slate-600 dark:text-slate-300"
}

// Reads every page of a table (Supabase returns at most 1000 rows per request)
async function fetchAll(queryFactory) {
  const rows = []
  for (let from = 0; ; from += FETCH_BATCH) {
    const { data, error } = await queryFactory().range(from, from + FETCH_BATCH - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < FETCH_BATCH) break
  }
  return rows
}

function searchableText(row, extra = []) {
  const parts = [...extra]
  Object.entries(row || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || typeof value === "object") return
    if (key === "id" || key.endsWith("_id")) return
    parts.push(String(value))
    if (typeof value === "number") parts.push(value.toLocaleString("en-IN"))
  })
  return norm(parts.join(" "))
}

function readRecent() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]")
    return Array.isArray(saved) ? saved.slice(0, 6) : []
  } catch {
    return []
  }
}

/* ==================================================
   BUILD A SINGLE SEARCHABLE LIST FROM EVERY TABLE
================================================== */

function buildRecords({ customers, bills, items, payments, advances, allocations = [], khata, attachments }) {
  const today = localDate(new Date())
  const customerMap = new Map(customers.map((row) => [String(row.id), row]))
  const billMap = new Map(bills.map((row) => [String(row.id), row]))
  const itemCount = new Map()
  const advanceMap = new Map(advances.map((row) => [String(row.id), row]))
  items.forEach((row) => itemCount.set(String(row.bill_id), (itemCount.get(String(row.bill_id)) || 0) + 1))

  const stats = new Map()
  const customerDueFor = (customer) => {
    if (!customer) return 0
    const stat = stats.get(String(customer.id))
    return Math.max(0, num(customer.opening_balance) + num(stat?.billDue))
  }
  const statFor = (id) => {
    const key = String(id)
    if (!stats.has(key)) stats.set(key, { bills: 0, billed: 0, billDue: 0, overdue: 0, paid: 0 })
    return stats.get(key)
  }
  bills.forEach((bill) => {
    const stat = statFor(bill.customer_id)
    const due = Math.max(0, num(bill.amount_due))
    stat.bills += 1
    stat.billed += num(bill.grand_total)
    stat.billDue += due
    if (due > 0 && bill.due_date && toDay(bill.due_date) < today) stat.overdue += due
  })
  payments.forEach((payment) => {
    if (payment.is_refund || payment.is_advance) return
    statFor(payment.customer_id).paid += num(payment.amount)
  })

  const out = []

  customers.forEach((row) => {
    const stat = stats.get(String(row.id)) || { bills: 0, billed: 0, billDue: 0, overdue: 0, paid: 0 }
    const due = num(row.opening_balance) + stat.billDue
    out.push({
      key: `customer-${row.id}`, type: "customer", id: row.id,
      title: row.name || "Unnamed customer",
      subtitle: [row.mobile, row.city, `${stat.bills} ${stat.bills === 1 ? "bill" : "bills"}`].filter(Boolean).join(" · "),
      amount: stat.billed, due: due > 0 ? due : 0,
      date: row.created_at, status: row.is_active === false ? "Archived" : "Active",
      data: row, customer: row, stat,
      text: searchableText(row, [formatCurrency(stat.billed)]),
    })
  })

  bills.forEach((row) => {
    const customer = customerMap.get(String(row.customer_id))
    const due = Math.max(0, num(row.amount_due))
    let status = cap(row.payment_status) || (due > 0 ? "Unpaid" : "Paid")
    if (due > 0 && row.due_date && toDay(row.due_date) < today) status = "Overdue"
    out.push({
      key: `invoice-${row.id}`, type: "invoice", id: row.id,
      title: row.bill_number || "Invoice",
      subtitle: [customer?.name || "Walk-in customer", customer?.mobile].filter(Boolean).join(" · "),
      amount: num(row.grand_total), due,
      date: row.bill_date || row.created_at, status,
      data: row, customer, itemCount: itemCount.get(String(row.id)) || 0,
      text: searchableText(row, [customer?.name, customer?.mobile, customer?.city, formatDate(row.bill_date)]),
    })
  })

  items.forEach((row) => {
    const bill = billMap.get(String(row.bill_id))
    const customer = customerMap.get(String(bill?.customer_id))
    out.push({
      key: `item-${row.id}`, type: "item", id: row.id,
      title: row.item_name || "Item",
      subtitle: [bill?.bill_number, customer?.name, `${num(row.quantity)} ${row.unit || ""} × ${formatCurrency(row.rate)}`.replace(/\s+/g, " ")].filter(Boolean).join(" · "),
      amount: num(row.total_amount), date: bill?.bill_date || row.created_at,
      status: bill ? cap(bill.payment_status) || "Billed" : "Billed",
      data: row, bill, customer,
      text: searchableText(row, [bill?.bill_number, customer?.name, customer?.mobile]),
    })
  })

  payments.forEach((row) => {
    const customer = customerMap.get(String(row.customer_id))
    const bill = billMap.get(String(row.bill_id))
    out.push({
      key: `payment-${row.id}`, type: "payment", id: row.id,
      title: customer?.name || "Customer",
      subtitle: [row.payment_mode || "Payment", row.reference_number && `Ref ${row.reference_number}`, bill?.bill_number].filter(Boolean).join(" · "),
      amount: num(row.amount), date: row.payment_date || row.created_at,
      status: row.is_refund ? "Refund" : row.is_advance ? "Advance" : "Received",
      data: row, customer, bill,
      text: searchableText(row, [customer?.name, customer?.mobile, bill?.bill_number, formatDate(row.payment_date)]),
    })
  })

  advances.forEach((row) => {
    const customer = customerMap.get(String(row.customer_id))
    out.push({
      key: `advance-${row.id}`, type: "advance", id: row.id,
      title: customer?.name || "Customer advance",
      subtitle: [customer?.mobile, `Original ${formatCurrency(row.amount)}`, row.notes].filter(Boolean).join(" · "),
      amount: num(row.remaining_amount), customerDue: customerDueFor(customer), date: row.created_at,
      status: num(row.remaining_amount) > 0 ? "Available" : "Used up",
      data: row, customer,
      text: searchableText(row, [customer?.name, customer?.mobile]),
    })
  })

  // Every use of a customer advance is a separate ledger event. Keep it
  // searchable even when the advance has already been fully consumed.
  allocations.forEach((row) => {
    const advance = advanceMap.get(String(row.advance_id))
    const bill = billMap.get(String(row.bill_id))
    const customer = customerMap.get(String(advance?.customer_id || bill?.customer_id))
    out.push({
      key: `allocation-${row.id}`, type: "advance", id: row.id,
      title: customer?.name || "Customer",
      subtitle: [`Adjusted against ${bill?.bill_number || "bill"}`, advance ? `Advance ${formatCurrency(advance.amount)}` : "Customer advance"].join(" · "),
      amount: num(row.amount), date: row.created_at,
      status: "Advance adjusted", data: { ...row, is_allocation: true, advance, bill },
      customer, bill,
      text: searchableText(row, [customer?.name, customer?.mobile, bill?.bill_number, "advance adjusted allocation"]),
    })
  })

  // Personal Khata is an independent ledger. Never link its entries to
  // Customers/Bills; the saved balance_after is its own outstanding balance.
  khata.forEach((row) => {
    out.push({
      key: `khata-${row.id}`, type: "khata", id: row.id,
      title: row.customer_name || "Khata person",
      subtitle: [row.mobile, row.city, KHATA_LABELS[row.entry_type] || row.entry_type, row.notes].filter(Boolean).join(" · "),
      amount: num(row.amount),
      due: Math.max(0, num(row.balance_after)),
      date: row.entry_date || row.created_at,
      status: KHATA_LABELS[row.entry_type] || cap(row.entry_type) || "Entry",
      data: row,
      text: searchableText(row, [row.customer_name, row.mobile, KHATA_LABELS[row.entry_type]]),
    })
  })

  attachments.forEach((row) => {
    const customer = customerMap.get(String(row.customer_id))
    out.push({
      key: `attachment-${row.id}`, type: "attachment", id: row.id,
      title: row.file_name || row.bill_number || "Attachment",
      subtitle: [customer?.name, row.bill_number, fileSize(row.file_size)].filter(Boolean).join(" · "),
      amount: num(row.total_amount), due: num(row.amount_due),
      date: row.bill_date || row.created_at,
      status: num(row.amount_due) > 0 ? "Due" : "Filed",
      data: row, customer,
      text: searchableText(row, [customer?.name, customer?.mobile]),
    })
  })

  APP_PAGES.forEach((page) => {
    out.push({
      key: `page-${page.to}`, type: "page", id: page.to,
      title: page.label, subtitle: page.hint, amount: 0, date: null, status: "Page",
      data: page, icon: page.icon,
      text: norm(`${page.label} ${page.hint} ${page.to}`),
    })
  })

  return out
}

/* ==================================================
   WHERE EACH RECORD OPENS
================================================== */

function routeFor(record) {
  const { type, data } = record
  if (type === "customer") return `/customers/${record.id}`
  if (type === "invoice") return `/bills/${record.id}`
  if (type === "item") return data.bill_id ? `/bills/${data.bill_id}` : "/bills"
  if (type === "payment") return data.bill_id ? `/bills/${data.bill_id}` : data.customer_id ? `/customers/${data.customer_id}` : "/payments"
  if (type === "advance" && data.is_allocation) return data.bill_id ? `/bills/${data.bill_id}` : data.advance?.customer_id ? `/customers/${data.advance.customer_id}` : "/payments"
  if (type === "advance") return data.customer_id ? `/customers/${data.customer_id}` : "/customers"
  if (type === "attachment") return data.bill_id ? `/bills/${data.bill_id}` : data.customer_id ? `/customers/${data.customer_id}` : "/bills"
  if (type === "khata") {
    const key = clean(data.mobile) || clean(data.customer_name)
    return key ? `/khata/${encodeURIComponent(key)}` : "/khata"
  }
  return data.to || "/"
}

function contactFor(record) {
  const source = record.customer || record.data || {}
  return {
    mobile: clean(source.mobile),
    whatsapp: clean(source.whatsapp) || clean(source.mobile),
  }
}

/* ==================================================
   RECORD DETAILS (every field, grouped into sections)
================================================== */

function detailSections(record) {
  const { type, data, customer, bill, stat } = record
  const sections = []

  const section = (title, icon, build) => {
    const rows = []
    const add = (label, value, wide = false) => {
      if (value !== null && value !== undefined && clean(value) !== "") rows.push({ label, value, wide })
    }
    build(add)
    if (rows.length) sections.push({ title, icon, rows })
  }
  const money = (value) => formatCurrency(value)
  const moneyIf = (value) => (num(value) ? formatCurrency(value) : "")
  const day = (value) => (value ? formatDate(value) : "")

  if (type === "customer") {
    section("Contact", Phone, (add) => {
      add("Mobile number", data.mobile)
      add("WhatsApp number", data.whatsapp)
    })
    section("Business details", Users, (add) => {
      add("Customer type", data.customer_type)
      add("GSTIN", data.gstin)
    })
    section("Address", MapPin, (add) => {
      add("Full address", [data.address, data.city, data.state, data.pincode].filter(Boolean).join(", "), true)
    })
    section("Account summary", Wallet, (add) => {
      add("Opening balance", money(data.opening_balance))
      add("Total invoices", stat?.bills)
      add("Overdue amount", moneyIf(stat?.overdue))
      add("Account status", record.status)
      add("Customer since", day(data.created_at))
    })
    section("Notes", FileText, (add) => add("Notes", data.notes, true))
  } else if (type === "invoice") {
    section("Bill information", Receipt, (add) => {
      add("Bill number", data.bill_number)
      add("Payment status", record.status)
      add("Bill date", day(data.bill_date))
      add("Due date", day(data.due_date))
      add("Items on bill", record.itemCount)
      add("Supply type", data.is_interstate === undefined ? "" : data.is_interstate ? "Inter-state (IGST)" : "Intra-state (CGST + SGST)")
      add("Tax calculation", data.tax_inclusive === undefined ? "" : data.tax_inclusive ? "Tax inclusive" : "Tax exclusive")
    })
    section("Customer", UserRound, (add) => {
      add("Name", customer?.name || "Walk-in customer")
      add("Mobile", customer?.mobile)
      add("City", customer?.city)
      add("GSTIN", customer?.gstin)
    })
    section("Amount breakdown", Wallet, (add) => {
      add("Subtotal", money(data.subtotal))
      add("Discount", moneyIf(data.discount_amount))
      add("Taxable amount", moneyIf(data.taxable_amount))
      add("CGST", moneyIf(data.cgst_amount))
      add("SGST", moneyIf(data.sgst_amount))
      add("IGST", moneyIf(data.igst_amount))
      add("Total GST", moneyIf(data.total_gst))
      add("Round off", num(data.round_off) ? money(data.round_off) : "")
      add("Grand total", money(data.grand_total))
      add("Advance adjusted", moneyIf(data.advance_adjusted))
      add("Amount paid", money(data.amount_paid))
      add("Balance due", money(data.amount_due))
    })
    section("Notes", FileText, (add) => add("Notes", data.notes, true))
  } else if (type === "item") {
    section("Item", Package, (add) => {
      add("Item name", data.item_name)
      add("Quantity", `${num(data.quantity)} ${data.unit || ""}`.trim())
      add("Rate", money(data.rate))
      add("Discount", moneyIf(data.discount))
      add("GST rate", num(data.gst_percent) ? `${data.gst_percent}%` : "")
      add("Description", data.description, true)
    })
    section("Amounts", Wallet, (add) => {
      add("Taxable amount", moneyIf(data.taxable_amount))
      add("GST amount", moneyIf(data.gst_amount))
      add("Line total", money(data.total_amount))
    })
    section("Bill", Receipt, (add) => {
      add("Bill number", bill?.bill_number)
      add("Bill date", day(bill?.bill_date))
      add("Customer", customer?.name)
      add("Bill status", bill ? cap(bill.payment_status) : "")
    })
  } else if (type === "payment") {
    section("Payment", CreditCard, (add) => {
      add("Amount", money(data.amount))
      add("Type", record.status)
      add("Payment mode", data.payment_mode)
      add("Reference number", data.reference_number)
      add("Payment date", day(data.payment_date))
      add("Recorded on", day(data.created_at))
    })
    section("Customer", UserRound, (add) => {
      add("Name", customer?.name)
      add("Mobile", customer?.mobile)
      add("City", customer?.city)
    })
    section("Linked bill", Receipt, (add) => {
      add("Bill number", bill?.bill_number)
      add("Bill total", bill ? money(bill.grand_total) : "")
      add("Balance due", bill ? money(bill.amount_due) : "")
    })
    section("Notes", FileText, (add) => add("Notes", data.notes, true))
  } else if (type === "advance" && data.is_allocation) {
    section("Advance adjustment", Wallet, (add) => {
      add("Adjusted amount", money(data.amount))
      add("Adjustment date", day(data.created_at))
      add("Record type", "Advance adjusted against bill")
      add("Advance record ID", data.advance_id)
    })
    section("Linked bill", Receipt, (add) => {
      add("Bill number", bill?.bill_number)
      add("Bill date", day(bill?.bill_date))
      add("Bill total", bill ? money(bill.grand_total) : "")
      add("Balance due", bill ? money(bill.amount_due) : "")
    })
    section("Original advance", Wallet, (add) => {
      add("Original amount", money(data.advance?.amount))
      add("Current remaining", money(data.advance?.remaining_amount))
      add("Received on", day(data.advance?.created_at))
      add("Notes", data.advance?.notes, true)
    })
    section("Customer", UserRound, (add) => {
      add("Name", customer?.name)
      add("Mobile", customer?.mobile)
    })
  } else if (type === "advance") {
    section("Advance", Wallet, (add) => {
      add("Original amount", money(data.amount))
      add("Used so far", money(Math.max(0, num(data.amount) - num(data.remaining_amount))))
      add("Remaining balance", money(data.remaining_amount))
      add("Status", record.status)
      add("Received on", day(data.created_at))
    })
    section("Customer", UserRound, (add) => {
      add("Name", customer?.name)
      add("Mobile", customer?.mobile)
      add("City", customer?.city)
    })
    section("Notes", FileText, (add) => add("Notes", data.notes, true))
  } else if (type === "khata") {
    section("Entry", BookOpen, (add) => {
      add("Entry type", KHATA_LABELS[data.entry_type] || data.entry_type)
      add("Amount", money(data.amount))
      add("Khata outstanding", data.balance_after === null || data.balance_after === undefined ? "" : money(data.balance_after))
      add("Entry date", day(data.entry_date))
      add("Due date", day(data.due_date))
    })
    section("Person", UserRound, (add) => {
      add("Name", data.customer_name)
      add("Mobile", data.mobile)
      add("Address", data.address, true)
    })
    section("Notes", FileText, (add) => add("Notes", data.notes, true))
  } else if (type === "attachment") {
    section("File", Paperclip, (add) => {
      add("File name", data.file_name)
      add("File type", data.file_type)
      add("File size", fileSize(data.file_size))
      add("Uploaded on", day(data.created_at))
    })
    section("Bill", Receipt, (add) => {
      add("Bill number", data.bill_number)
      add("Bill date", day(data.bill_date))
      add("Total", money(data.total_amount))
      add("Paid", money(data.amount_paid))
      add("Balance due", money(data.amount_due))
    })
    section("Customer", UserRound, (add) => {
      add("Name", customer?.name)
      add("Mobile", customer?.mobile)
    })
    section("Notes", FileText, (add) => add("Notes", data.notes, true))
  } else {
    section("Page", Compass, (add) => {
      add("Name", data.label)
      add("About", data.hint, true)
      add("Opens", data.to)
    })
  }
  return sections
}

// The three headline numbers at the top of every dialog
function summaryTiles(record, live) {
  const { type, data } = record
  const money = (value) => formatCurrency(value)

  if (type === "customer") {
    return [
      { label: "Total billed", value: money(live.billed) },
      { label: "Total paid", value: money(live.paid) },
      { label: "Outstanding", value: money(live.due), tone: live.due > 0 ? "danger" : "good" },
      { label: "Advance balance", value: money(live.advanceLeft) },
    ]
  }
  if (type === "invoice") {
    return [
      { label: "Grand total", value: money(data.grand_total) },
      { label: "Received", value: money(num(data.amount_paid) + num(data.advance_adjusted)), tone: "good" },
      { label: "Balance due", value: money(data.amount_due), tone: num(data.amount_due) > 0 ? "danger" : "good" },
    ]
  }
  if (type === "item") {
    return [
      { label: "Quantity", value: `${num(data.quantity)} ${data.unit || ""}`.trim() },
      { label: "Rate", value: money(data.rate) },
      { label: "Line total", value: money(data.total_amount) },
    ]
  }
  if (type === "payment") {
    return [
      { label: "Amount", value: money(data.amount), tone: data.is_refund ? "danger" : "good" },
      { label: "Mode", value: data.payment_mode || "—" },
      { label: "Date", value: data.payment_date ? formatDate(data.payment_date) : "—" },
    ]
  }
  if (type === "advance" && data.is_allocation) {
    return [
      { label: "Adjusted", value: money(data.amount) },
      { label: "Original advance", value: money(data.advance?.amount) },
      { label: "Remaining advance", value: money(data.advance?.remaining_amount), tone: "good" },
    ]
  }
  if (type === "advance") {
    return [
      { label: "Original", value: money(data.amount) },
      { label: "Used", value: money(Math.max(0, num(data.amount) - num(data.remaining_amount))) },
      { label: "Remaining", value: money(data.remaining_amount), tone: "good" },
    ]
  }
  if (type === "khata") {
    return [
      { label: "Amount", value: money(data.amount) },
      { label: "Khata outstanding", value: data.balance_after === null || data.balance_after === undefined ? "—" : money(data.balance_after), tone: num(data.balance_after) > 0 ? "danger" : "good" },
      { label: "Entry date", value: data.entry_date ? formatDate(data.entry_date) : "—" },
    ]
  }
  if (type === "attachment") {
    return [
      { label: "Total", value: money(data.total_amount) },
      { label: "Paid", value: money(data.amount_paid), tone: "good" },
      { label: "Due", value: money(data.amount_due), tone: num(data.amount_due) > 0 ? "danger" : "good" },
    ]
  }
  return []
}

/* ==================================================
   BUTTON + SMALL UI PIECES
================================================== */

// Every button on this page goes through here, so they all look the same
function AppButton({ className, ...props }) {
  return <Button variant="outline" className={cn(BTN, className)} {...props} />
}

function SummaryCard({ label, value, detail, icon: Icon, tone, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-[20px] text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
        active && "ring-2 ring-violet-500/70"
      )}
    >
      <Card className="h-full overflow-hidden rounded-[20px] border border-white/80 bg-white shadow-[0_4px_15px_rgba(80,65,130,0.07)] backdrop-blur-sm transition hover:bg-violet-50/40 dark:bg-slate-900/90 dark:hover:bg-slate-800">
        <div className="flex min-w-0 items-center gap-3 p-4">
          <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", tone)}>
            <Icon className="h-6 w-6" strokeWidth={1.9} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-slate-600 dark:text-slate-300">{label}</p>
            <p className="mt-0.5 text-[22px] font-bold leading-tight tracking-tight text-[#151934] dark:text-slate-100 tabular-nums">{value}</p>
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{detail}</p>
          </div>
        </div>
      </Card>
    </button>
  )
}

function TypeIcon({ type, icon, className }) {
  const meta = TYPE_META[type]
  const Icon = icon || meta.icon
  return (
    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", meta.tone, className)}>
      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
    </span>
  )
}

function RecordAvatar({ record, className }) {
  const customer = record?.customer || (record?.type === "customer" ? record?.data : null)
  const khataPhoto = record?.type === "khata" ? resolveCustomerPhoto(record?.data?.customer_photo) : ""
  if (customer || record?.type === "khata") {
    const name = customer?.name || record?.data?.customer_name || record?.title
    const photo = khataPhoto || resolveCustomerPhoto(customer?.photo_url || customer?.avatar_url || customer?.profile_photo)
    return (
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-violet-100 dark:border-slate-700 bg-violet-50 text-sm font-bold text-violet-700", className)}>
        {photo ? <img src={photo} alt={`${name || "Profile"} photo`} loading="lazy" className="h-full w-full object-cover" /> : getInitials(name)}
      </span>
    )
  }
  return <TypeIcon type={record?.type} icon={record?.icon} className={className} />
}

function StatusPill({ status }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold", statusTone(status))}>{status}</span>
  )
}

function Highlight({ text, tokens }) {
  const value = String(text ?? "")
  if (!tokens.length || !value) return value
  const pattern = new RegExp(`(${tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi")
  return value.split(pattern).map((part, index) =>
    index % 2 === 1 ? (
      <mark key={index} className="rounded bg-violet-100 px-0.5 text-violet-900">{part}</mark>
    ) : (
      part
    )
  )
}

function AmountCell({ record }) {
  if (record.type === "page") return <span className="text-slate-400">—</span>
  return (
    <>
      <span className="text-sm font-bold tabular-nums text-[#151934] dark:text-slate-100">{formatCurrency(record.amount)}</span>
      {record.type !== "invoice" && record.due > 0 && (
        <span className="mt-0.5 block text-[11px] font-semibold tabular-nums text-rose-600">
          {record.type === "khata" ? "Khata outstanding" : "Record due"} {formatCurrency(record.due)}
        </span>
      )}
      {["customer", "advance"].includes(record.type) && record.customerDue > 0 && (
        <span className="mt-0.5 block text-[11px] font-semibold tabular-nums text-rose-600">Outstanding {formatCurrency(record.customerDue)}</span>
      )}
    </>
  )
}

function RowAction({ label, icon: Icon, onClick, danger = false }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(ICON_BTN, danger && DANGER_ICON_BTN)}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  )
}

function SidePanel({ icon: Icon, title, action, children }) {
  return (
    <Card className={CARD}>
      <div className="flex items-center justify-between gap-3 border-b border-[#eae7f4] px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100/80 text-violet-700">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <h2 className="text-sm font-bold text-[#171a36] dark:text-slate-100">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </Card>
  )
}

/* ==================================================
   MODAL SHELL (shared by every dialog on this page)
================================================== */

const modalStack = []
let scrollLocks = 0
let savedOverflow = ""

function useModal(ref, onClose, locked) {
  const closeRef = useRef(onClose)
  const lockedRef = useRef(locked)
  closeRef.current = onClose
  lockedRef.current = locked

  useEffect(() => {
    const token = {}
    modalStack.push(token)
    if (scrollLocks++ === 0) {
      savedOverflow = document.body.style.overflow
      document.body.style.overflow = "hidden"
    }

    const previouslyFocused = document.activeElement
    const node = ref.current
    if (node && !node.contains(document.activeElement)) node.focus()

    const onKeyDown = (event) => {
      if (modalStack[modalStack.length - 1] !== token) return // only the top dialog reacts

      if (event.key === "Escape") {
        if (!lockedRef.current) {
          event.stopPropagation()
          closeRef.current()
        }
        return
      }

      if (event.key === "Tab" && ref.current) {
        const focusable = [...ref.current.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )].filter((el) => el.offsetParent !== null)
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      modalStack.splice(modalStack.indexOf(token), 1)
      if (--scrollLocks === 0) document.body.style.overflow = savedOverflow
      if (previouslyFocused && typeof previouslyFocused.focus === "function") previouslyFocused.focus()
    }
  }, [ref])
}

function Modal({ label, onClose, locked = false, layer = 100, size = "max-w-2xl", children }) {
  const ref = useRef(null)
  useModal(ref, onClose, locked)

  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-3 backdrop-blur-sm sm:p-6"
      style={{ zIndex: layer }}
      onMouseDown={(event) => { if (event.target === event.currentTarget && !locked) onClose() }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-[24px] border border-white/80 bg-[#f7f5ff] dark:bg-slate-950 shadow-[0_24px_60px_rgba(60,45,110,0.35)] outline-none",
          size
        )}
      >
        {children}
      </div>
    </div>
  )
}

function ModalHeader({ leading, eyebrow, title, meta, onClose, disabled }) {
  return (
    <div className="flex items-start gap-4 border-b border-[#eae7f4] bg-white dark:bg-slate-900 px-5 py-5 sm:px-6">
      {leading}
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="text-[11px] font-bold uppercase tracking-wider text-violet-600">{eyebrow}</p>}
        <h2 className="mt-0.5 truncate text-xl font-bold tracking-tight text-[#171a36] dark:text-slate-100">{title}</h2>
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      <button
        type="button"
        onClick={onClose}
        disabled={disabled}
        aria-label="Close dialog"
        className={ICON_BTN}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}

function DialogSection({ icon: Icon, title, count, children }) {
  return (
    <section className="rounded-[20px] border border-white bg-white dark:bg-slate-900 p-4 shadow-[0_4px_14px_rgba(80,65,130,0.06)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100/80 text-violet-700">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
          <h3 className="text-sm font-bold text-[#171a36] dark:text-slate-100">{title}</h3>
        </div>
        {count !== undefined && (
          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700">{count}</span>
        )}
      </div>
      {children}
    </section>
  )
}

function FieldGrid({ rows }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className={cn("min-w-0", row.wide && "sm:col-span-2")}>
          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{row.label}</dt>
          <dd className="mt-1 break-words text-sm font-semibold text-slate-800 dark:text-slate-100">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function StatTile({ label, value, tone }) {
  return (
    <div className="rounded-2xl border border-white bg-white dark:bg-slate-900 p-3.5 shadow-[0_4px_14px_rgba(80,65,130,0.06)]">
      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className={cn(
        "mt-1 break-words text-lg font-bold tabular-nums",
        tone === "danger" ? "text-rose-600" : tone === "good" ? "text-emerald-700" : "text-[#171a36] dark:text-slate-100"
      )}>{value}</p>
    </div>
  )
}

function RelatedRow({ to, onNavigate, title, subtitle, amount, note }) {
  const body = (
    <>
      <span className="min-w-0">
        <span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-100">{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-[11px] text-slate-400">{subtitle}</span>}
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-xs font-bold tabular-nums text-slate-800 dark:text-slate-100">{amount}</span>
        {note && <span className="mt-0.5 block text-[11px] text-slate-400">{note}</span>}
      </span>
    </>
  )
  const cls = "flex items-center justify-between gap-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 transition"
  return to ? (
    <Link to={to} onClick={onNavigate} className={cn(cls, "hover:border-violet-200 dark:border-slate-700 hover:bg-violet-50/50")}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/* ==================================================
   RECORD DIALOG (one professional dialog for every record type)
================================================== */

function RecordDialog({ record, records, shopId, onClose, onOpen, onEdit, onDelete, onCopy }) {
  const meta = TYPE_META[record.type]
  const isCustomer = record.type === "customer"

  // Fetch the linked customer profile for every record that belongs to a customer.
  const customerId = isCustomer ? record.id : record.customer?.id
  const hasCustomer = Boolean(customerId)
  const [live, setLive] = useState({
    customer: isCustomer ? record.data : (record.customer || null),
    bills: [], payments: [], advances: [], allocations: [],
  })
  const [loading, setLoading] = useState(hasCustomer)
  const [loadError, setLoadError] = useState("")

  useEffect(() => {
    if (!hasCustomer || !customerId) return
    let active = true

    const load = async () => {
      setLoading(true)
      setLoadError("")
      try {
        const customerPromise = supabase.from("customers").select("*")
          .eq("id", customerId).eq("shop_id", shopId).maybeSingle()
        const relatedPromises = isCustomer ? [
          supabase.from("bills").select("*").eq("shop_id", shopId).eq("customer_id", customerId).order("created_at", { ascending: false }),
          supabase.from("payments").select("*").eq("shop_id", shopId).eq("customer_id", customerId).order("payment_date", { ascending: false }),
          supabase.from("customer_advances").select("*").eq("shop_id", shopId).eq("customer_id", customerId).order("created_at", { ascending: false }),
          supabase.from("advance_allocations").select("*, customer_advances!inner(customer_id, shop_id), bills(bill_number)").eq("customer_advances.shop_id", shopId).eq("customer_advances.customer_id", customerId).order("created_at", { ascending: false }),
        ] : []
        const [customerRes, ...related] = await Promise.all([customerPromise, ...relatedPromises])
        if (customerRes.error) throw customerRes.error
        for (const res of related) if (res.error) throw res.error
        if (!active) return
        if (!customerRes.data) throw new Error("Linked customer profile was not found in this shop.")
        setLive({
          customer: customerRes.data,
          bills: related[0]?.data || [],
          payments: related[1]?.data || [],
          advances: related[2]?.data || [],
          allocations: related[3]?.data || [],
        })
      } catch (error) {
        if (active) setLoadError(error?.message || "Could not fetch the linked customer profile.")
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => { active = false }
  }, [hasCustomer, customerId, isCustomer, shopId])

  // The record as shown (customers use the freshly fetched profile)
  const view = useMemo(() => {
    if (isCustomer) return { ...record, data: live.customer || record.data, customer: live.customer || record.data, title: live.customer?.name || record.title }
    return { ...record, customer: live.customer || record.customer }
  }, [isCustomer, record, live.customer])

  const sections = useMemo(() => detailSections(view), [view])

  const customerTotals = useMemo(() => ({
    billed: live.bills.reduce((sum, bill) => sum + num(bill.grand_total), 0),
    paid: live.payments.filter((p) => !p.is_refund && !p.is_advance).reduce((sum, p) => sum + num(p.amount), 0),
    due: live.bills.reduce((sum, bill) => sum + num(bill.amount_due), 0) + num(live.customer?.opening_balance),
    advanceLeft: live.advances.reduce((sum, item) => sum + num(item.remaining_amount), 0),
  }), [live])

  const tiles = summaryTiles(view, customerTotals)
  const showLinkedCustomerDue = record.type === "advance"
  const linkedCustomerDue = isCustomer
    ? customerTotals.due
    : (showLinkedCustomerDue && view.customer ? num(record.customerDue) : 0)

  // Related data pulled from what is already loaded on the page
  const related = useMemo(() => {
    const sameBill = (row) => String(row.data.bill_id) === String(record.id)
    if (record.type === "invoice") {
      return {
        items: records.filter((row) => row.type === "item" && sameBill(row))
          .sort((a, b) => num(a.data.sort_order) - num(b.data.sort_order)),
        payments: records.filter((row) => row.type === "payment" && sameBill(row))
          .sort((a, b) => toTs(b.date) - toTs(a.date)),
      }
    }
    if (record.type === "khata") {
      const key = clean(record.data.mobile) || norm(record.data.customer_name)
      return {
        entries: records.filter((row) => row.type === "khata" && row.key !== record.key
          && (clean(row.data.mobile) || norm(row.data.customer_name)) === key)
          .sort((a, b) => toTs(b.date) - toTs(a.date)).slice(0, 5),
      }
    }
    return {}
  }, [records, record])

  const { mobile, whatsapp } = contactFor(view)
  const wa = waLink(whatsapp)
  const canDelete = ["customer", "invoice", "khata"].includes(record.type)
  const attachmentUrl = record.type === "invoice" ? record.data.attachment_url
    : record.type === "attachment" ? (record.data.file_url || record.data.url || record.data.attachment_url) : ""

  const leading = (view.customer || record.type === "khata") ? (
    <RecordAvatar record={view} className="h-16 w-16 border-4 border-violet-50 text-xl shadow-sm" />
  ) : (
    <TypeIcon type={record.type} icon={record.icon} className="h-14 w-14 rounded-2xl" />
  )

  return (
    <Modal label={`${meta.label} details`} onClose={onClose} size={isCustomer ? "max-w-3xl" : "max-w-2xl"}>
      <ModalHeader
        leading={leading}
        eyebrow={meta.label}
        title={view.title}
        onClose={onClose}
        meta={
          <>
            <StatusPill status={view.status} />
            {view.date && <span className="text-xs text-slate-500 dark:text-slate-400">{formatDate(view.date)}</span>}
            {isCustomer && live.customer?.customer_type && (
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700">{live.customer.customer_type}</span>
            )}
          </>
        }
      />

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
        {loading && (
          <div className="flex items-center gap-2 rounded-2xl border border-violet-100 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin text-violet-600" aria-hidden="true" />Fetching latest customer profile…
          </div>
        )}
        {loadError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{loadError}</div>}

        {!isCustomer && view.customer && (
          <DialogSection icon={UserRound} title="Linked customer profile">
            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-violet-100 dark:border-slate-700 bg-[#faf9ff] dark:bg-slate-800 p-3">
              <RecordAvatar record={view} className="h-14 w-14 text-base" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[#171a36] dark:text-slate-100">{view.customer.name || "Customer"}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{[view.customer.mobile, view.customer.city, view.customer.customer_type].filter(Boolean).join(" · ") || "Customer details"}</p>
              </div>
              {showLinkedCustomerDue && (
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Outstanding</p>
                  <p className="text-sm font-bold tabular-nums text-rose-600">{formatCurrency(linkedCustomerDue)}</p>
                </div>
              )}
            </div>
            <FieldGrid rows={[
              { label: "Mobile", value: view.customer.mobile || "Not provided" },
              { label: "WhatsApp", value: view.customer.whatsapp || view.customer.mobile || "Not provided" },
              { label: "Customer type", value: view.customer.customer_type || "Individual" },
              { label: "GSTIN", value: view.customer.gstin || "Not provided" },
              { label: "Address", value: [view.customer.address, view.customer.city, view.customer.state, view.customer.pincode].filter(Boolean).join(", ") || "Not provided", wide: true },
              { label: "Opening balance", value: formatCurrency(view.customer.opening_balance) },
              { label: "Notes", value: view.customer.notes || "Not provided", wide: true },
            ]} />
          </DialogSection>
        )}

        {(tiles.length > 0 || (view.customer && showLinkedCustomerDue)) && (
          <div className={cn("grid gap-3", (tiles.length + (!isCustomer && view.customer && showLinkedCustomerDue ? 1 : 0)) >= 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1 min-[420px]:grid-cols-3")}>
            {tiles.map((tile) => <StatTile key={tile.label} {...tile} />)}
            {!isCustomer && view.customer && showLinkedCustomerDue && (
              <StatTile label="Customer outstanding" value={formatCurrency(linkedCustomerDue)} tone={linkedCustomerDue > 0 ? "danger" : "good"} />
            )}
          </div>
        )}

        {sections.map((section) => (
          <DialogSection key={section.title} icon={section.icon} title={section.title}>
            <FieldGrid rows={section.rows} />
          </DialogSection>
        ))}

        {/* Personal Khata profile: sourced only from khata_entries */}
        {record.type === "khata" && (
          <DialogSection icon={UserRound} title="Khata person profile">
            <div className="mb-3 flex items-center gap-3 rounded-2xl border border-violet-100 dark:border-slate-700 bg-violet-50/70 p-3">
              <RecordAvatar record={record} className="h-14 w-14 border-2 border-white text-base shadow-sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[#171a36] dark:text-slate-100">{record.data.customer_name || "Khata person"}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{record.data.mobile || "Mobile not provided"}</p>
              </div>
              <div className="shrink-0 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-right">
                <p className="text-[10px] font-bold uppercase tracking-wide text-rose-600">Khata outstanding</p>
                <p className="text-sm font-bold tabular-nums text-rose-700">{formatCurrency(record.data.balance_after)}</p>
              </div>
            </div>
            <FieldGrid rows={[
              { label: "Name", value: record.data.customer_name || "Not provided" },
              { label: "Mobile", value: record.data.mobile || "Not provided" },
              { label: "Address", value: record.data.address || "Not provided", wide: true },
              { label: "City", value: record.data.city || "Not provided" },
              { label: "Email", value: record.data.email || "Not provided" },
              { label: "PIN code", value: record.data.pin_code || "Not provided" },
              { label: "GSTIN", value: record.data.gstin || "Not provided" },
            ]} />
          </DialogSection>
        )}

        {/* Invoice: items and payments */}
        {record.type === "invoice" && (
          <>
            <DialogSection icon={Package} title="Items on this bill" count={related.items.length}>
              {related.items.length ? (
                <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-700">
                  <table className="w-full min-w-[440px] text-left">
                    <thead>
                      <tr className="bg-[#f5f3fc] dark:bg-slate-800 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2 text-right">Rate</th>
                        <th className="px-3 py-2 text-right">GST</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {related.items.map((item) => (
                        <tr key={item.key} className="border-t border-slate-100 dark:border-slate-700">
                          <td className="px-3 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-100">{item.title}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">{num(item.data.quantity)} {item.data.unit || ""}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">{formatCurrency(item.data.rate)}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">{num(item.data.gst_percent)}%</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-bold tabular-nums text-slate-800 dark:text-slate-100">{formatCurrency(item.data.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-xs text-slate-400">No item details were saved for this invoice.</p>}
            </DialogSection>

            <DialogSection icon={CreditCard} title="Payments received" count={related.payments.length}>
              {related.payments.length ? (
                <div className="space-y-2">
                  {related.payments.map((payment) => (
                    <RelatedRow
                      key={payment.key}
                      title={`${payment.data.payment_mode || "Payment"}${payment.data.is_refund ? " · Refund" : ""}`}
                      subtitle={payment.data.reference_number ? `Ref ${payment.data.reference_number}` : undefined}
                      amount={formatCurrency(payment.data.amount)}
                      note={formatDate(payment.date)}
                    />
                  ))}
                </div>
              ) : <p className="text-xs text-slate-400">No payments recorded against this invoice yet.</p>}
            </DialogSection>
          </>
        )}

        {/* Customer: invoices, payments, advances */}
        {isCustomer && (
          <>
            <DialogSection icon={FileText} title="Recent invoices" count={live.bills.length}>
              {live.bills.length ? (
                <div className="space-y-2">
                  {live.bills.slice(0, 5).map((bill) => (
                    <RelatedRow
                      key={bill.id}
                      to={`/bills/${bill.id}`}
                      onNavigate={onClose}
                      title={bill.bill_number || "Invoice"}
                      subtitle={formatDate(bill.bill_date || bill.created_at)}
                      amount={formatCurrency(bill.grand_total)}
                      note={num(bill.amount_due) > 0 ? `Due ${formatCurrency(bill.amount_due)}` : "Paid"}
                    />
                  ))}
                </div>
              ) : <p className="text-xs text-slate-400">No invoices found for this customer.</p>}
            </DialogSection>

            <DialogSection icon={CreditCard} title="Recent payments" count={live.payments.length}>
              {live.payments.length ? (
                <div className="space-y-2">
                  {live.payments.slice(0, 5).map((payment) => (
                    <RelatedRow
                      key={payment.id}
                      title={`${payment.payment_mode || "Payment"}${payment.is_refund ? " · Refund" : ""}`}
                      subtitle={formatDate(payment.payment_date || payment.created_at)}
                      amount={formatCurrency(payment.amount)}
                    />
                  ))}
                </div>
              ) : <p className="text-xs text-slate-400">No payments found for this customer.</p>}
            </DialogSection>

            <DialogSection icon={Wallet} title="Customer advances" count={live.advances.length}>
              {live.advances.length ? (
                <div className="space-y-2">
                  {live.advances.slice(0, 5).map((advance) => (
                    <RelatedRow
                      key={advance.id}
                      title="Advance received"
                      subtitle={formatDate(advance.created_at)}
                      amount={formatCurrency(advance.amount)}
                      note={`Remaining ${formatCurrency(advance.remaining_amount)}`}
                    />
                  ))}
                </div>
              ) : <p className="text-xs text-slate-400">No advances found for this customer.</p>}
            </DialogSection>
            <DialogSection icon={History} title="Advance adjustment history" count={live.allocations.length}>
              {live.allocations.length ? (
                <div className="space-y-2">
                  {live.allocations.map((allocation) => (
                    <RelatedRow
                      key={allocation.id}
                      title={`Adjusted against ${allocation.bills?.bill_number || "bill"}`}
                      subtitle={formatDate(allocation.created_at)}
                      amount={formatCurrency(allocation.amount)}
                      note="Advance used"
                    />
                  ))}
                </div>
              ) : <p className="text-xs text-slate-400">No advance adjustments found for this customer.</p>}
            </DialogSection>
          </>
        )}

        {/* Khata: other entries of the same person */}
        {record.type === "khata" && (
          <DialogSection icon={History} title="Other entries for this person" count={related.entries.length}>
            {related.entries.length ? (
              <div className="space-y-2">
                {related.entries.map((entry) => (
                  <RelatedRow
                    key={entry.key}
                    title={KHATA_LABELS[entry.data.entry_type] || entry.status}
                    subtitle={formatDate(entry.date)}
                    amount={formatCurrency(entry.amount)}
                  />
                ))}
              </div>
            ) : <p className="text-xs text-slate-400">This is the only entry for this person.</p>}
          </DialogSection>
        )}

        {!canDelete && record.type !== "page" && (
          <p className="px-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            This record type can’t be deleted from here. Open it to manage it, so your payment and ledger history stays correct.
          </p>
        )}
      </div>

      {/* Footer: every button uses the same style */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[#eae7f4] bg-white dark:bg-slate-900 p-3 sm:p-4">
        <AppButton onClick={onOpen}>
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          {record.type === "page" ? "Open page" : isCustomer ? "Full customer page" : "Open full page"}
        </AppButton>
        {isCustomer && (
          <AppButton onClick={() => onEdit({ ...record, title: view.title, data: live.customer })}>
            <Pencil className="h-4 w-4" aria-hidden="true" />Edit customer
          </AppButton>
        )}
        {attachmentUrl && (
          <AppButton asChild>
            <a href={attachmentUrl} target="_blank" rel="noopener noreferrer"><Paperclip className="h-4 w-4" aria-hidden="true" />View file</a>
          </AppButton>
        )}
        {mobile && (
          <>
            <AppButton asChild><a href={`tel:${mobile}`}><Phone className="h-4 w-4" aria-hidden="true" />Call</a></AppButton>
            {wa && <AppButton asChild><a href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" aria-hidden="true" />WhatsApp</a></AppButton>}
            <AppButton onClick={() => onCopy(mobile)}><Copy className="h-4 w-4" aria-hidden="true" />Copy number</AppButton>
          </>
        )}
        {record.type === "invoice" && (
          <AppButton onClick={() => onCopy(record.title)}><Copy className="h-4 w-4" aria-hidden="true" />Copy bill no.</AppButton>
        )}
        {canDelete && (
          <AppButton onClick={onDelete} className={cn(DANGER_BTN, "sm:ml-auto")}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />Move to Trash
          </AppButton>
        )}
      </div>
    </Modal>
  )
}

/* ==================================================
   EDIT CUSTOMER
================================================== */

function EditCustomerDialog({ record, onClose, onSave }) {
  const row = record.data
  const photoInput = useRef(null)
  const [form, setForm] = useState({
    name: row.name || "", mobile: row.mobile || "", whatsapp: row.whatsapp || "",
    address: row.address || "", city: row.city || "", state: row.state || "",
    pincode: row.pincode || "", gstin: row.gstin || "",
    customer_type: row.customer_type || "Individual",
    opening_balance: row.opening_balance != null ? String(row.opening_balance) : "",
    notes: row.notes || "", photo: null, photo_preview: resolveCustomerPhoto(row.photo_url),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [discardOpen, setDiscardOpen] = useState(false)
  const initial = useRef({ ...form })
  const dirty = useMemo(() => (
    form.photo instanceof File ||
    form.photo_preview !== initial.current.photo_preview ||
    Object.keys(initial.current).some((key) => !["photo", "photo_preview"].includes(key) && form[key] !== initial.current[key])
  ), [form])

  const update = (key, value) => {
    setForm((old) => ({ ...old, [key]: value }))
    setError("")
  }
  const requestClose = () => {
    if (saving) return
    if (dirty) setDiscardOpen(true)
    else onClose()
  }
  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    if (!PHOTO_TYPES.includes(file.type)) return toast.error("Use a JPG, PNG or WebP image.")
    if (file.size > MAX_PHOTO_BYTES) return toast.error("Photo must be smaller than 2 MB.")
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") setForm((old) => ({ ...old, photo: file, photo_preview: reader.result }))
    }
    reader.readAsDataURL(file)
  }
  const submit = async (event) => {
    event.preventDefault()
    if (!clean(form.name)) return setError("Customer name is required.")
    setSaving(true)
    setError("")
    try { await onSave(form) }
    catch (err) { setError(err?.message || "Could not save changes."); setSaving(false) }
  }

  const input = (key, label, options = {}) => (
    <label className={cn("block", options.wide && "sm:col-span-2")}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</span>
      <input
        value={form[key]}
        onChange={(event) => update(key, options.upper ? event.target.value.toUpperCase() : options.digits ? event.target.value.replace(/\D/g, "") : event.target.value)}
        className={INPUT}
        {...options.props}
      />
    </label>
  )

  const formSection = (icon, title, hint, body) => (
    <DialogSection icon={icon} title={title}>
      {hint && <p className="-mt-1 mb-3 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
      {body}
    </DialogSection>
  )

  return (
    <>
      <Modal label="Edit customer" onClose={requestClose} locked={saving} layer={110} size="max-w-2xl">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <ModalHeader
            leading={<span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-100/80 text-violet-700"><Pencil className="h-6 w-6" aria-hidden="true" /></span>}
            eyebrow="Customer"
            title="Edit customer"
            onClose={requestClose}
            disabled={saving}
            meta={<span className="text-xs text-slate-500 dark:text-slate-400">Update the details of {row.name || "this customer"}.</span>}
          />

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            <DialogSection icon={Camera} title="Profile photo">
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-violet-50 bg-emerald-50 text-xl font-bold text-emerald-800 shadow-sm">
                  {form.photo_preview ? <img src={form.photo_preview} alt="Customer profile preview" className="h-full w-full object-cover" /> : getInitials(form.name)}
                </div>
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <p className="text-xs text-slate-500 dark:text-slate-400">JPG, PNG or WebP, up to 2 MB.</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                    <AppButton onClick={() => photoInput.current?.click()}><Camera className="h-4 w-4" aria-hidden="true" />{form.photo_preview ? "Change photo" : "Upload photo"}</AppButton>
                    {form.photo_preview && <AppButton onClick={() => { update("photo_preview", ""); update("photo", null) }} className={DANGER_BTN}><X className="h-4 w-4" aria-hidden="true" />Remove photo</AppButton>}
                  </div>
                  <input ref={photoInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handlePhotoChange} />
                </div>
              </div>
            </DialogSection>

            {formSection(UserRound, "Basic information", "Name and contact details.", (
              <div className="grid gap-4 sm:grid-cols-2">
                {input("name", "Customer name *", { wide: true, props: { required: true, autoFocus: true, placeholder: "Enter customer name" } })}
                {input("mobile", "Mobile number", { props: { type: "tel", inputMode: "numeric", placeholder: "10-digit number", maxLength: 15 } })}
                {input("whatsapp", "WhatsApp number", { props: { type: "tel", inputMode: "numeric", placeholder: "10-digit number", maxLength: 15 } })}
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Customer type</span>
                  <select value={form.customer_type} onChange={(e) => update("customer_type", e.target.value)} className={INPUT}>
                    {CUSTOMER_TYPES.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                {input("gstin", "GSTIN", { upper: true, props: { placeholder: "15-character GSTIN", maxLength: 15 } })}
              </div>
            ))}

            {formSection(MapPin, "Address", "Billing or business address.", (
              <div className="grid gap-4 sm:grid-cols-2">
                {input("address", "Street address", { wide: true, props: { placeholder: "House number, street, locality" } })}
                {input("city", "City", { props: { placeholder: "City" } })}
                {input("state", "State", { props: { placeholder: "State" } })}
                {input("pincode", "PIN code", { digits: true, props: { inputMode: "numeric", placeholder: "6-digit PIN code", maxLength: 6 } })}
              </div>
            ))}

            {formSection(Wallet, "Opening balance", "Amount the customer already owed before using this app.", (
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Opening balance</span>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">₹</span>
                  <input type="number" min="0" step="0.01" inputMode="decimal" value={form.opening_balance} onChange={(e) => update("opening_balance", e.target.value)} placeholder="0.00" className={cn(INPUT, "pl-8 font-semibold")} />
                </div>
              </label>
            ))}

            {formSection(FileText, "Notes", "Anything worth remembering about this customer.", (
              <>
                <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Add any additional information…" rows={3} maxLength={500} className={cn(INPUT, "h-auto resize-none py-2.5")} />
                <p className="mt-1 text-right text-[11px] text-slate-400">{form.notes.length}/500</p>
              </>
            ))}

            {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          </div>

          <div className="flex shrink-0 flex-col gap-3 border-t border-[#eae7f4] bg-white dark:bg-slate-900 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">{dirty ? "You have unsaved changes." : "No changes yet."}</p>
            <div className="flex w-full gap-2 sm:w-auto">
              <AppButton onClick={requestClose} disabled={saving} className="flex-1 sm:flex-none">Cancel</AppButton>
              <AppButton type="submit" disabled={saving || !dirty} className="flex-1 sm:flex-none">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Saving…</> : <><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Save changes</>}
              </AppButton>
            </div>
          </div>
        </form>
      </Modal>

      {discardOpen && (
        <Modal label="Discard changes" onClose={() => setDiscardOpen(false)} layer={130} size="max-w-sm">
          <div className="bg-white dark:bg-slate-900 p-6">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><AlertTriangle className="h-5 w-5" aria-hidden="true" /></span>
            <h2 className="mt-4 text-lg font-bold tracking-tight text-[#171a36] dark:text-slate-100">Discard your changes?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">You have unsaved changes. If you close now, they will be lost.</p>
            <div className="mt-6 flex justify-end gap-2">
              <AppButton onClick={() => setDiscardOpen(false)}>Keep editing</AppButton>
              <AppButton onClick={onClose} className={DANGER_BTN}><Trash2 className="h-4 w-4" aria-hidden="true" />Discard changes</AppButton>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

/* ==================================================
   DELETE CONFIRMATION
================================================== */

function DeleteDialog({ record, impact, onClose, onConfirm }) {
  const meta = TYPE_META[record.type]
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")
  const impactList = impact ? Object.entries(impact).filter(([, count]) => count > 0) : []

  const run = async () => {
    setDeleting(true)
    setError("")
    try {
      await onConfirm()
    } catch (err) {
      setError(err?.message || "Could not move this record to Trash. Please try again.")
      setDeleting(false)
    }
  }

  return (
    <Modal label={`Move ${meta.label.toLowerCase()} to Trash`} onClose={onClose} locked={deleting} layer={120} size="max-w-md">
      <div className="bg-white p-6 dark:bg-slate-900">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300"><Trash2 className="h-5 w-5" aria-hidden="true" /></span>
        <h2 className="mt-4 text-lg font-bold tracking-tight text-[#171a36] dark:text-slate-100">Move {meta.label.toLowerCase()} to Trash?</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          <strong className="text-[#171a36] dark:text-slate-100">{record.title}</strong> will be moved to Trash. You can restore it later or permanently delete it from the Trash page.
        </p>

        {impactList.length > 0 && (
          <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50/60 p-3.5">
            <p className="text-xs font-semibold text-rose-800 dark:text-rose-300">Related records affected by this move</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {impactList.map(([key, count]) => (
                <span key={key} className="rounded-full bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-bold text-rose-700 shadow-sm">{count} {key}</span>
              ))}
            </div>
          </div>
        )}

        {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <AppButton onClick={onClose} disabled={deleting}>Cancel</AppButton>
          <AppButton onClick={run} disabled={deleting} className={DANGER_BTN}>
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
            Move to Trash
          </AppButton>
        </div>
      </div>
    </Modal>
  )
}

/* ==================================================
   PAGE
================================================== */

export default function CommandCenter() {
  const { currentShop } = useShop()
  const navigate = useNavigate()
  const inputRef = useRef(null)

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadWarning, setLoadWarning] = useState("")

  const [query, setQuery] = useState("")
  const [type, setType] = useState("all")
  const [status, setStatus] = useState("all")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [minAmount, setMinAmount] = useState("")
  const [maxAmount, setMaxAmount] = useState("")
  const [sort, setSort] = useState("auto")
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [recent, setRecent] = useState(readRecent)

  const [preview, setPreview] = useState(null)
  const [editing, setEditing] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const shopId = currentShop?.id

  /* ---------- LOAD ---------- */

  const loadRecords = useCallback(async (silent = false) => {
    if (!shopId) {
      setRecords([])
      setLoading(false)
      return
    }
    if (silent) setRefreshing(true)
    else setLoading(true)

    const tables = [
      ["customers", () => supabase.from("customers").select("*").eq("shop_id", shopId).order("id")],
      ["bills", () => supabase.from("bills").select("*").eq("shop_id", shopId).order("id")],
      ["bill items", () => supabase.from("bill_items").select("*, bills!inner(shop_id)").eq("bills.shop_id", shopId).order("id")],
      ["payments", () => supabase.from("payments").select("*").eq("shop_id", shopId).order("id")],
      ["advances", () => supabase.from("customer_advances").select("*").eq("shop_id", shopId).order("id")],
      ["advance allocations", () => supabase.from("advance_allocations").select("*, customer_advances!inner(shop_id)").eq("customer_advances.shop_id", shopId).order("created_at")],
      ["khata entries", () => supabase.from("khata_entries").select("*").eq("shop_id", shopId).order("id")],
      ["attachments", () => supabase.from("bill_attachments").select("*").eq("shop_id", shopId).order("id")],
    ]

    // One failing table should never blank the whole page
    const results = await Promise.allSettled(tables.map(([, factory]) => fetchAll(factory)))
    const failed = []
    const rows = results.map((result, index) => {
      if (result.status === "fulfilled") return result.value
      console.error(`Command Center: ${tables[index][0]} failed`, result.reason)
      failed.push(tables[index][0])
      return []
    })

    const [customers, bills, items, payments, advances, allocations, khata, attachments] = rows
    const cleanItems = items.map(({ bills: _bills, ...item }) => item)
    const cleanAllocations = allocations.map(({ customer_advances: _advanceJoin, ...allocation }) => allocation)
    setRecords(buildRecords({ customers, bills, items: cleanItems, payments, advances, allocations: cleanAllocations, khata, attachments }))
    setLoadWarning(failed.length ? `Could not load: ${failed.join(", ")}.` : "")
    if (failed.length === tables.length) toast.error("Could not load records", { description: "Check your connection and try again." })

    setLoading(false)
    setRefreshing(false)
  }, [shopId])

  useEffect(() => { loadRecords() }, [loadRecords])

  /* ---------- SEARCH / FILTER / SORT ---------- */

  const tokens = useMemo(() => norm(query).split(/\s+/).filter(Boolean), [query])

  const counts = useMemo(() => {
    const result = { total: 0, due: 0, received: 0 }
    records.forEach((row) => {
      if (row.type === "page") return
      result.total += 1
      result[row.type] = (result[row.type] || 0) + 1
      if (row.type === "invoice") result.due += row.due
      if (row.type === "payment" && row.status === "Received") result.received += row.amount
    })
    return result
  }, [records])

  const statusOptions = useMemo(() => {
    const set = new Set()
    records.forEach((row) => {
      if (row.type !== "page" && (type === "all" || row.type === type)) set.add(row.status)
    })
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [records, type])

  const filtered = useMemo(() => {
    const min = minAmount === "" ? null : num(minAmount)
    const max = maxAmount === "" ? null : num(maxAmount)

    const rows = records.filter((row) => {
      if (row.type === "page" && type !== "page" && tokens.length === 0) return false
      if (type !== "all" && row.type !== type) return false
      if (status !== "all" && row.status !== status) return false
      if (tokens.length && !tokens.every((token) => row.text.includes(token) || norm(row.title).includes(token))) return false
      if (row.type !== "page") {
        if (min !== null && row.amount < min) return false
        if (max !== null && row.amount > max) return false
        if (fromDate || toDate) {
          const day = toDay(row.date)
          if (!day) return false
          if (fromDate && day < fromDate) return false
          if (toDate && day > toDate) return false
        }
      } else if (fromDate || toDate || min !== null || max !== null) {
        return false
      }
      return true
    })

    const score = (row) => {
      const title = norm(row.title)
      return tokens.reduce((total, token) => {
        if (title === token) return total + 6
        if (title.startsWith(token)) return total + 4
        if (title.includes(token)) return total + 3
        if (norm(row.subtitle).includes(token)) return total + 1
        return total
      }, 0)
    }

    const mode = sort === "auto" ? (tokens.length ? "relevance" : "newest") : sort
    const sorters = {
      relevance: (a, b) => score(b) - score(a) || toTs(b.date) - toTs(a.date),
      newest: (a, b) => toTs(b.date) - toTs(a.date),
      oldest: (a, b) => toTs(a.date) - toTs(b.date),
      "amount-high": (a, b) => b.amount - a.amount,
      "amount-low": (a, b) => a.amount - b.amount,
      name: (a, b) => a.title.localeCompare(b.title, "en-IN"),
    }
    return rows.sort(sorters[mode])
  }, [records, tokens, type, status, fromDate, toDate, minAmount, maxAmount, sort])

  useEffect(() => { setPage(1) }, [query, type, status, fromDate, toDate, minAmount, maxAmount, sort])
  useEffect(() => { if (status !== "all" && !statusOptions.includes(status)) setStatus("all") }, [statusOptions, status])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visible = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page])
  useEffect(() => { setActiveIndex(0) }, [visible])

  const totals = useMemo(() => filtered.reduce((acc, row) => {
    if (row.type === "page") return acc
    acc.amount += row.amount
    acc.due += row.due || 0
    return acc
  }, { amount: 0, due: 0 }), [filtered])

  const hasFilters = Boolean(query || type !== "all" || status !== "all" || fromDate || toDate || minAmount || maxAmount || sort !== "auto")

  const resetFilters = () => {
    setQuery(""); setType("all"); setStatus("all"); setFromDate(""); setToDate("")
    setMinAmount(""); setMaxAmount(""); setSort("auto")
  }

  const applyPreset = (preset) => {
    const now = new Date()
    const start = preset.days === -1 ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(now.getTime() - preset.days * 86400000)
    setFromDate(localDate(start))
    setToDate(localDate(now))
  }

  /* ---------- NAVIGATION ---------- */

  const rememberSearch = useCallback(() => {
    const text = clean(query)
    if (!text) return
    const next = [text, ...recent.filter((item) => item !== text)].slice(0, 6)
    setRecent(next)
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
  }, [query, recent])

  const clearRecent = () => {
    setRecent([])
    try { localStorage.removeItem(RECENT_KEY) } catch { /* storage unavailable */ }
  }

  const openRecord = useCallback((record) => {
    rememberSearch()
    setPreview(null)
    navigate(routeFor(record))
  }, [navigate, rememberSearch])

  /* ---------- KEYBOARD ---------- */

  useEffect(() => {
    const onKeyDown = (event) => {
      if (preview || editing || deleteTarget) return // dialogs own the keyboard while open
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || "")
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      } else if (event.key === "/" && !typing) {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [preview, editing, deleteTarget])

  useEffect(() => {
    const row = visible[activeIndex]
    if (row) document.getElementById(`cc-${row.key}`)?.scrollIntoView({ block: "nearest" })
  }, [activeIndex, visible])

  const onSearchKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((index) => Math.min(visible.length - 1, index + 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((index) => Math.max(0, index - 1))
    } else if (event.key === "Enter" && visible[activeIndex]) {
      event.preventDefault()
      openRecord(visible[activeIndex])
    } else if (event.key === "Escape" && query) {
      setQuery("")
    }
  }

  /* ---------- EXPORT ---------- */

  const exportCsv = () => {
    const rows = [
      ["Type", "Name / Reference", "Details", "Amount", "Due", "Date", "Status"],
      ...filtered.filter((row) => row.type !== "page").map((row) => [
        TYPE_META[row.type].label, row.title, row.subtitle, row.amount, row.due || 0, toDay(row.date), row.status,
      ]),
    ]
    const csv = "\uFEFF" + rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `khaatapro-records-${localDate(new Date())}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${rows.length - 1} records`)
  }

  const copyText = async (value) => {
    try {
      await navigator.clipboard.writeText(String(value))
      toast.success("Copied")
    } catch {
      toast.error("Could not copy")
    }
  }

  /* ---------- EDIT CUSTOMER ---------- */

  const saveCustomer = async (form) => {
    const name = clean(form.name).replace(/\s+/g, " ")
    if (name.length < 2) throw new Error("Enter a customer name with at least 2 characters.")
    const normalizeMobile = (value) => {
      const valueDigits = digits(value)
      return valueDigits.length > 10 ? valueDigits.slice(-10) : valueDigits
    }
    const mobile = normalizeMobile(form.mobile)
    const whatsapp = normalizeMobile(form.whatsapp)
    if (clean(form.mobile) && mobile.length !== 10) throw new Error("Enter a valid 10-digit mobile number.")
    if (clean(form.whatsapp) && whatsapp.length !== 10) throw new Error("Enter a valid 10-digit WhatsApp number.")
    const opening = clean(form.opening_balance) ? Number(form.opening_balance) : 0
    if (!Number.isFinite(opening) || opening < 0) throw new Error("Opening balance must be 0 or more.")
    const gstin = clean(form.gstin).toUpperCase()
    if (gstin && !GSTIN_PATTERN.test(gstin)) throw new Error("Enter a valid 15-character GSTIN.")
    const pincode = clean(form.pincode)
    if (pincode && !/^\d{6}$/.test(pincode)) throw new Error("PIN code must be 6 digits.")

    const previousPhoto = editing?.data?.photo_url || null
    let photoUrl = previousPhoto
    let uploadedUrl = null
    if (form.photo instanceof File) {
      uploadedUrl = await uploadCustomerPhoto(shopId, form.photo)
      photoUrl = uploadedUrl
    } else if (!form.photo_preview) {
      photoUrl = null
    }

    const payload = {
      name, mobile, whatsapp, address: clean(form.address), city: clean(form.city),
      state: clean(form.state), pincode, gstin, customer_type: form.customer_type || "Individual",
      opening_balance: opening, notes: clean(form.notes), photo_url: photoUrl,
    }
    try {
      const { error } = await supabase.from("customers").update(payload)
        .eq("id", editing.id).eq("shop_id", shopId)
      if (error) throw error
    } catch (error) {
      if (uploadedUrl) await removeCustomerPhoto(uploadedUrl).catch(() => {})
      throw error
    }
    if (previousPhoto && previousPhoto !== photoUrl) {
      try { await removeCustomerPhoto(previousPhoto) }
      catch (error) {
        console.error("Old customer photo cleanup error:", error)
        toast.warning("Customer updated, but the previous profile photo could not be removed.")
      }
    }
    toast.success("Customer updated")
    setEditing(null)
    setPreview(null)
    await loadRecords(true)
  }

  /* ---------- MOVE TO CENTRAL TRASH ---------- */

  const deleteRecord = async () => {
    const target = deleteTarget
    if (!target || !shopId) return

    // Command Center uses "invoice" in its searchable model; Trash stores it as "bill".
    const trashType =
      target.type === "invoice" ? "bill" :
      target.type === "customer" ? "customer" :
      target.type === "khata" ? "khata_entry" : null

    if (!trashType) {
      throw new Error("This record type cannot be moved to Trash from here.")
    }

    await moveToTrash({
      shopId,
      type: trashType,
      id: target.id,
    })

    toast.success(`${TYPE_META[target.type].label} moved to Trash`, {
      description: "You can restore it or permanently delete it from the Trash page.",
    })
    setDeleteTarget(null)
    setPreview(null)
    await loadRecords(true)
  }

  const deleteImpact = useMemo(() => {
    if (!deleteTarget) return null
    if (deleteTarget.type === "customer") {
      return {
        invoices: deleteTarget.stat?.bills || 0,
        payments: records.filter((row) => row.type === "payment" && String(row.data.customer_id) === String(deleteTarget.id)).length,
        advances: records.filter((row) => row.type === "advance" && String(row.data.customer_id) === String(deleteTarget.id)).length,
        "khata entries": records.filter((row) => row.type === "khata" && String(row.data.customer_id) === String(deleteTarget.id)).length,
        attachments: records.filter((row) => row.type === "attachment" && String(row.data.customer_id) === String(deleteTarget.id)).length,
      }
    }
    if (deleteTarget.type === "invoice") {
      return {
        items: deleteTarget.itemCount || 0,
        payments: records.filter((row) => row.type === "payment" && String(row.data.bill_id) === String(deleteTarget.id)).length,
        attachments: records.filter((row) => row.type === "attachment" && String(row.data.bill_id) === String(deleteTarget.id)).length,
      }
    }
    return null
  }, [deleteTarget, records])

  /* ---------- RENDER ---------- */

  if (!currentShop) {
    return (
      <div className={cn(CARD, "mx-auto mt-10 max-w-md p-8 text-center")}>
        <h1 className="text-lg font-bold text-[#171a39] dark:text-slate-100">Select a shop first</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">The Command Center searches the records of your active shop.</p>
        <AppButton asChild className="mt-5"><Link to="/settings">Open shop settings</Link></AppButton>
      </div>
    )
  }

  const typeChips = ["all", ...TYPE_ORDER.filter((key) => key !== "page"), ...(tokens.length ? ["page"] : [])]
  const activeChips = [
    type !== "all" && { label: TYPE_META[type].plural, clear: () => setType("all") },
    status !== "all" && { label: `Status: ${status}`, clear: () => setStatus("all") },
    (fromDate || toDate) && { label: `${fromDate ? formatDate(fromDate) : "Start"} → ${toDate ? formatDate(toDate) : "Today"}`, clear: () => { setFromDate(""); setToDate("") } },
    (minAmount || maxAmount) && { label: `Amount ${minAmount ? `≥ ${formatCurrency(minAmount)}` : ""} ${maxAmount ? `≤ ${formatCurrency(maxAmount)}` : ""}`.trim(), clear: () => { setMinAmount(""); setMaxAmount("") } },
  ].filter(Boolean)

  return (
    <div className="space-y-5 pb-8">
      {/* HEADER */}
      <header className="flex min-w-0 flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span className="truncate">{currentShop.name || "Workspace"}</span>
            <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>Command Center</span>
          </nav>
          <h1 className="mt-1 truncate text-[26px] font-bold tracking-tight text-[#171a39] dark:text-slate-100 sm:text-[32px]">Command Center</h1>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
            Find any customer, bill, item, payment, khata entry or page in one search.
          </p>
        </div>

        <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          <AppButton onClick={() => loadRecords(true)} disabled={refreshing || loading}>
            <RefreshCw className={cn("h-4 w-4 shrink-0", refreshing && "animate-spin")} aria-hidden="true" />
            {refreshing ? "Refreshing…" : "Refresh"}
          </AppButton>
          <AppButton onClick={exportCsv} disabled={!filtered.some((row) => row.type !== "page")}>
            <Download className="h-4 w-4" aria-hidden="true" />Export CSV
          </AppButton>
          <AppButton asChild>
            <Link to="/bills"><Receipt className="h-4 w-4" aria-hidden="true" />All bills</Link>
          </AppButton>
          <AppButton asChild>
            <Link to="/bills/new"><Plus className="h-4 w-4" aria-hidden="true" />Create bill</Link>
          </AppButton>
        </div>
      </header>

      {loadWarning && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{loadWarning} Other records are still searchable. Try Refresh.</span>
        </div>
      )}

      {/* OVERVIEW (click a card to filter) */}
      <section aria-label="Record overview" className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="All records" value={loading ? "—" : counts.total.toLocaleString("en-IN")} detail="Across every section" icon={Compass} tone="bg-violet-100/80 text-violet-700" active={type === "all"} onClick={() => setType("all")} />
        <SummaryCard label="Customers" value={loading ? "—" : (counts.customer || 0).toLocaleString("en-IN")} detail="Profiles in this shop" icon={Users} tone="bg-emerald-100/80 text-emerald-700" active={type === "customer"} onClick={() => setType("customer")} />
        <SummaryCard label="Invoices" value={loading ? "—" : (counts.invoice || 0).toLocaleString("en-IN")} detail={loading ? " " : `${formatCurrency(counts.due)} unpaid`} icon={FileText} tone="bg-pink-100/80 text-pink-700" active={type === "invoice"} onClick={() => setType("invoice")} />
        <SummaryCard label="Payments" value={loading ? "—" : (counts.payment || 0).toLocaleString("en-IN")} detail={loading ? " " : `${formatCurrency(counts.received)} received`} icon={CreditCard} tone="bg-blue-100/80 text-blue-700" active={type === "payment"} onClick={() => setType("payment")} />
      </section>

      {/* MAIN: results + side panels */}
      <div className="grid grid-cols-1 items-start gap-5">
        <Card className={cn(CARD, "min-w-0")}>
          {/* Search + filters */}
          <div className="border-b border-violet-100 dark:border-slate-700 p-4 sm:p-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder="Search name, mobile, bill no., item, reference, amount, city, notes…"
                aria-label="Search all records"
                className="h-14 w-full rounded-2xl border border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-12 pr-28 text-sm text-slate-800 dark:text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10"
              />
              <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                {query && (
                  <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus() }} aria-label="Clear search" className={cn(ICON_BTN, "h-8 w-8 rounded-lg border-transparent bg-transparent shadow-none hover:border-violet-200 hover:bg-violet-50 dark:hover:border-slate-700 dark:hover:bg-slate-800")}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
                <kbd className="hidden items-center gap-1 rounded-lg border border-slate-200 bg-white dark:bg-slate-900 px-2 py-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 shadow-sm sm:inline-flex">
                  <Command className="h-3 w-3" aria-hidden="true" />K
                </kbd>
              </div>
            </div>

            {/* Type tabs + filter toggle */}
            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]" role="tablist" aria-label="Record type">
                {typeChips.map((key) => {
                  const active = type === key
                  const count = key === "all" ? counts.total : key === "page" ? APP_PAGES.length : counts[key] || 0
                  return (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setType(key)}
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
                        active ? "border-violet-300 bg-violet-100 text-violet-900" : "border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-violet-50"
                      )}
                    >
                      {key === "all" ? "All records" : TYPE_META[key].plural}
                      <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", active ? "bg-white dark:bg-slate-900 text-violet-700" : "bg-slate-100 text-slate-500 dark:text-slate-400")}>{loading ? "–" : count}</span>
                    </button>
                  )
                })}
              </div>
              <AppButton onClick={() => setShowFilters((open) => !open)} aria-expanded={showFilters} className="w-full shrink-0 lg:w-auto">
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                {showFilters ? "Hide filters" : `Filters${activeChips.length ? ` (${activeChips.length})` : ""}`}
              </AppButton>
            </div>

            {showFilters && (
              <div className="mt-4 space-y-3 rounded-2xl border border-violet-100 dark:border-slate-700 bg-[#faf9ff] dark:bg-slate-800 p-3 sm:p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">Status</span>
                    <select value={status} onChange={(event) => setStatus(event.target.value)} className={FIELD}>
                      <option value="all">All statuses</option>
                      {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">From date</span>
                    <input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} className={FIELD} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">To date</span>
                    <input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} className={FIELD} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">Sort by</span>
                    <select value={sort} onChange={(event) => setSort(event.target.value)} className={FIELD}>
                      <option value="auto">Best match, then newest</option>
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                      <option value="amount-high">Amount: high to low</option>
                      <option value="amount-low">Amount: low to high</option>
                      <option value="name">Name: A to Z</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">Min amount (₹)</span>
                    <input type="number" min="0" inputMode="decimal" value={minAmount} onChange={(event) => setMinAmount(event.target.value)} className={FIELD} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">Max amount (₹)</span>
                    <input type="number" min="0" inputMode="decimal" value={maxAmount} onChange={(event) => setMaxAmount(event.target.value)} className={FIELD} />
                  </label>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end lg:col-span-2">
                    {DATE_PRESETS.map((preset) => (
                      <AppButton key={preset.id} onClick={() => applyPreset(preset)}>
                        <CalendarDays className="h-4 w-4" aria-hidden="true" />{preset.label}
                      </AppButton>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {(activeChips.length > 0 || hasFilters) && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {activeChips.map((chip) => (
                  <span key={chip.label} className="inline-flex items-center gap-1 rounded-full bg-violet-50 py-1 pl-3 pr-1.5 text-xs font-semibold text-violet-800">
                    {chip.label}
                    <button type="button" onClick={chip.clear} aria-label={`Remove filter ${chip.label}`} className={cn(ICON_BTN, "h-6 w-6 rounded-full border-transparent bg-transparent p-0 shadow-none hover:border-violet-200 hover:bg-violet-100 dark:hover:border-slate-700 dark:hover:bg-slate-800")}><X className="h-3 w-3" aria-hidden="true" /></button>
                  </span>
                ))}
                <button type="button" onClick={resetFilters} className="text-xs font-semibold text-violet-700 hover:text-violet-900">Reset all</button>
              </div>
            )}
          </div>

          {/* Result summary */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100" aria-live="polite">
              {loading ? "Loading records…" : (
                <>
                  {filtered.length.toLocaleString("en-IN")} {filtered.length === 1 ? "result" : "results"}
                  {totals.amount > 0 && <span className="ml-2 text-xs font-medium text-slate-500 dark:text-slate-400">Total {formatCurrency(totals.amount)}</span>}
                  {totals.due > 0 && <span className="ml-2 text-xs font-semibold text-rose-600">Due {formatCurrency(totals.due)}</span>}
                </>
              )}
            </p>
          </div>

          {loading ? (
            <div className="space-y-2 p-4 sm:px-5" aria-busy="true">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex animate-pulse items-center gap-3 rounded-xl p-2">
                  <div className="h-10 w-10 rounded-xl bg-slate-100" />
                  <div className="flex-1 space-y-2"><div className="h-3 w-1/3 rounded bg-slate-100" /><div className="h-3 w-1/2 rounded bg-slate-100" /></div>
                  <div className="h-4 w-20 rounded bg-slate-100" />
                </div>
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-5 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600"><SearchX className="h-7 w-7" aria-hidden="true" /></div>
              <h3 className="mt-4 text-base font-bold text-[#171a39] dark:text-slate-100">{records.length ? "Nothing matches your search" : "No records yet"}</h3>
              <p className="mt-1 max-w-sm text-sm text-slate-600 dark:text-slate-300">
                {records.length ? "Check the spelling, try a mobile number or bill number, or loosen your filters." : "Create a bill or add a customer and it will show up here."}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {hasFilters && <AppButton onClick={resetFilters}>Reset filters</AppButton>}
                {!records.length && <AppButton asChild><Link to="/bills/new"><Plus className="h-4 w-4" aria-hidden="true" />Create bill</Link></AppButton>}
              </div>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] border-collapse text-left">
                  <thead>
                    <tr className="border-y border-violet-100 dark:border-slate-700 bg-[#faf9ff] dark:bg-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th scope="col" className="px-5 py-3">Record</th>
                      <th scope="col" className="px-4 py-3">Type</th>
                      <th scope="col" className="px-4 py-3">Date</th>
                      <th scope="col" className="px-4 py-3 text-right">Amount</th>
                      <th scope="col" className="px-4 py-3">Status</th>
                      <th scope="col" className="px-5 py-3 text-right"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((record, index) => (
                      <tr
                        key={record.key}
                        id={`cc-${record.key}`}
                        onClick={() => openRecord(record)}
                        className={cn("cursor-pointer border-b border-slate-100 dark:border-slate-700 transition-colors hover:bg-[#faf9ff] dark:bg-slate-800", index === activeIndex && "bg-[#faf9ff] dark:bg-slate-800 shadow-[inset_3px_0_0_#7c3aed]")}
                      >
                        <td className="max-w-[360px] px-5 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <RecordAvatar record={record} />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[#171a39] dark:text-slate-100"><Highlight text={record.title} tokens={tokens} /></p>
                              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400"><Highlight text={record.subtitle || "No extra details"} tokens={tokens} /></p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3"><span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">{TYPE_META[record.type].label}</span></td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{record.date ? formatDate(record.date) : "—"}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right"><AmountCell record={record} /></td>
                        <td className="px-4 py-3"><StatusPill status={record.status} /></td>
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-1.5" onClick={(event) => event.stopPropagation()}>
                            <RowAction label="View details" icon={Eye} onClick={() => setPreview(record)} />
                            <RowAction label="Open page" icon={ExternalLink} onClick={() => openRecord(record)} />
                            {["customer", "invoice", "khata"].includes(record.type) && (
                              <RowAction label={`Delete ${TYPE_META[record.type].label}`} icon={Trash2} danger onClick={() => setDeleteTarget(record)} />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="space-y-2 p-3 md:hidden">
                {visible.map((record) => (
                  <article key={record.key} className="rounded-2xl border border-violet-100 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                    <button type="button" onClick={() => openRecord(record)} className="flex w-full items-start gap-3 text-left">
                      <RecordAvatar record={record} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-[#171a39] dark:text-slate-100"><Highlight text={record.title} tokens={tokens} /></span>
                          {record.type !== "page" && <span className="shrink-0 text-sm font-bold tabular-nums text-[#151934] dark:text-slate-100">{formatCurrency(record.amount)}</span>}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500 dark:text-slate-400">{record.subtitle}</span>
                        <span className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">{TYPE_META[record.type].label}</span>
                          <StatusPill status={record.status} />
                          {record.date && <span className="text-[11px] text-slate-400">{formatDate(record.date)}</span>}
                          {record.type !== "invoice" && record.due > 0 && <span className="text-[11px] font-semibold text-rose-600">Record due {formatCurrency(record.due)}</span>}
                          {["customer", "advance"].includes(record.type) && record.customerDue > 0 && <span className="text-[11px] font-semibold text-rose-600">Outstanding {formatCurrency(record.customerDue)}</span>}
                        </span>
                      </span>
                    </button>
                    <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-700 pt-2">
                      <AppButton onClick={() => setPreview(record)}><Eye className="h-4 w-4" aria-hidden="true" />View</AppButton>
                      <AppButton onClick={() => openRecord(record)}><ExternalLink className="h-4 w-4" aria-hidden="true" />Open</AppButton>
                      {["customer", "invoice", "khata"].includes(record.type) && (
                        <AppButton onClick={() => setDeleteTarget(record)} className={DANGER_BTN}><Trash2 className="h-4 w-4" aria-hidden="true" />Move to Trash</AppButton>
                      )}
                    </div>
                  </article>
                ))}
              </div>

              {/* Pagination */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-violet-100 dark:border-slate-700 px-4 py-3 sm:px-5">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString("en-IN")} · Page {page} of {pageCount}
                </span>
                <div className="flex items-center gap-2">
                  <AppButton disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" aria-hidden="true" />Previous</AppButton>
                  <AppButton disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Next<ChevronRight className="h-4 w-4" aria-hidden="true" /></AppButton>
                </div>
              </div>
            </>
          )}
        </Card>

      </div>

      {preview && (
        <RecordDialog
          record={preview}
          records={records}
          shopId={shopId}
          onClose={() => setPreview(null)}
          onOpen={() => openRecord(preview)}
          onEdit={(freshRecord) => setEditing(freshRecord || preview)}
          onDelete={() => setDeleteTarget(preview)}
          onCopy={copyText}
        />
      )}

      {editing && <EditCustomerDialog record={editing} onClose={() => setEditing(null)} onSave={saveCustomer} />}

      {deleteTarget && (
        <DeleteDialog record={deleteTarget} impact={deleteImpact} onClose={() => setDeleteTarget(null)} onConfirm={deleteRecord} />
      )}
    </div>
  )
}