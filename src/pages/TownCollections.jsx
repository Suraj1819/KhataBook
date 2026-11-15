import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatDate, CUSTOMER_TYPES } from "@/lib/utils"
import { generateTownDetailsPDF } from "@/lib/townPdf"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  MapPin, Users, IndianRupee, AlertCircle, Clock3, Search, X,
  Download, RefreshCw, ChevronRight, ChevronLeft, ChevronDown,
  LayoutGrid, List, Phone, MessageCircle, FileText,
  ArrowUpRight, CalendarDays, MapPinned, CheckCircle2, ReceiptText,
  UserRound,
} from "lucide-react"
import { toast } from "sonner"

/* =========================================================
   CONFIG
   ========================================================= */
// Supabase Storage bucket jisme customer profile photos rakhi hain.
// Agar aapke bucket ka naam alag hai to sirf yahan badlo.
const AVATAR_BUCKET = "avatars"

const PAGE_SIZE = 10
const FETCH_BATCH = 1000

const PERIOD_PRESETS = [
  { mode: "today", label: "Today" },
  { mode: "yesterday", label: "Yesterday" },
  { mode: "week", label: "Last 7 days" },
  { mode: "month", label: "This month" },
]

/* =========================================================
   HELPERS
   ========================================================= */
function getLocalDateString() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function shiftDate(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

function daysBetween(later, earlier) {
  const toUTC = (s) => {
    const [y, m, d] = s.split("-").map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.max(0, Math.round((toUTC(later) - toUTC(earlier)) / 86400000))
}

const fieldClass =
  "h-11 rounded-xl border-violet-100 bg-white text-sm text-slate-800 shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"

const cardClass =
  "overflow-hidden rounded-[20px] border border-white/80 bg-white/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)] backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-black/20"

const outlineBtn =
  "rounded-xl border-violet-200 bg-white text-slate-700 shadow-sm hover:bg-violet-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"

const iconBtn =
  "h-8 w-8 rounded-lg border-violet-200 bg-white text-slate-700 shadow-sm hover:bg-violet-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"

const num = (value) => Number(value) || 0

// jsPDF default fonts can't render the rupee glyph, so PDF uses "Rs."
const pdfMoney = (value) =>
  `Rs. ${num(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

function paginate(list, page, size = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(list.length / size))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * size
  return {
    items: list.slice(start, start + size),
    totalPages,
    safePage,
    from: list.length ? start + 1 : 0,
    to: Math.min(start + size, list.length),
    total: list.length,
  }
}

function downloadCsv(filename, rows) {
  const escape = (value) => {
    let text = String(value ?? "")
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
    return `"${text.replace(/"/g, '""')}"`
  }
  const csv = "\uFEFF" + rows.map((row) => row.map(escape).join(",")).join("\r\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

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

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-amber-100 text-amber-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
  "bg-violet-100 text-violet-700",
]

function avatarColor(name) {
  let hash = 0
  for (const char of String(name || "")) hash = (hash * 31 + char.charCodeAt(0)) % 997
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function buildReminder(customer, due) {
  const whatsapp = normalizeMobile(customer.whatsapp || customer.mobile)
  if (whatsapp.length !== 10 || due <= 0) return null
  return `https://wa.me/91${whatsapp}?text=${encodeURIComponent(
    `Hello ${customer.name}, your pending amount is ${formatCurrency(
      due
    )}. Please arrange the payment at your earliest convenience. Thank you!`
  )}`
}

/* ---------- Supabase avatar bucket ---------- */
const signedUrlCache = new Map()

// customer record me photo ka path / URL kisi bhi common column me ho sakta hai
function customerPhoto(customer) {
  return (
    customer?.photo_url ||
    customer?.avatar_url ||
    customer?.profile_photo ||
    customer?.profile_image ||
    customer?.photo ||
    customer?.image_url ||
    ""
  )
}

// "avatars/abc.jpg", "abc.jpg" ya poora storage URL -> bucket ke andar ka path
function storagePathOf(value) {
  const raw = String(value || "").trim()
  if (!raw || /^(data:|blob:)/i.test(raw)) return ""

  if (/^https?:\/\//i.test(raw)) {
    const match = raw.match(new RegExp(`/${AVATAR_BUCKET}/([^?#]+)`))
    return match ? decodeURIComponent(match[1]) : ""
  }

  return raw.replace(/^\/+/, "").replace(new RegExp(`^${AVATAR_BUCKET}/`), "")
}

function publicAvatarUrl(value) {
  const raw = String(value || "").trim()
  if (!raw) return ""
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw

  const path = storagePathOf(raw)
  if (!path) return ""

  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data?.publicUrl || ""
}

async function signedAvatarUrl(value) {
  const path = storagePathOf(value)
  if (!path) return ""
  if (signedUrlCache.has(path)) return signedUrlCache.get(path)

  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(path, 3600)
  const url = error ? "" : data?.signedUrl || ""
  signedUrlCache.set(path, url)
  return url
}

function groupByTown(rows) {
  const groups = new Map()

  rows.forEach((row) => {
    const key = row.town.toLocaleLowerCase()
    if (!groups.has(key)) {
      groups.set(key, {
        name: row.town,
        customers: [],
        due: 0,
        overdue: 0,
        opening: 0,
        billDue: 0,
        billCount: 0,
        maxOverdueDays: 0,
      })
    }
    const group = groups.get(key)
    group.customers.push(row)
    group.due += row.due
    group.overdue += row.overdue
    group.opening += row.opening
    group.billDue += row.billDue
    group.billCount += row.billCount
    group.maxOverdueDays = Math.max(group.maxOverdueDays, row.overdueDays)
  })

  return [...groups.values()].map((town) => {
    const customers = town.customers.sort((a, b) => b.due - a.due)
    return { ...town, customers, top: customers[0] }
  })
}

/* =========================================================
   AVATAR (Supabase bucket -> signed URL fallback -> initials)
   ========================================================= */
function Avatar({ name, photo, size = "h-10 w-10", className = "" }) {
  const [src, setSrc] = useState(() => publicAvatarUrl(photo))
  const [triedSigned, setTriedSigned] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setSrc(publicAvatarUrl(photo))
    setTriedSigned(false)
    setFailed(false)
  }, [photo])

  const handleError = async () => {
    // Bucket private ho to signed URL se ek baar aur try karo
    if (!triedSigned) {
      setTriedSigned(true)
      try {
        const signed = await signedAvatarUrl(photo)
        if (signed && signed !== src) {
          setSrc(signed)
          return
        }
      } catch {
        /* fall through to initials */
      }
    }
    setFailed(true)
  }

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={`${name} profile`}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={handleError}
        className={`${size} shrink-0 rounded-full bg-slate-100 object-cover ${className}`}
      />
    )
  }

  return (
    <span
      aria-label={`${name} initials`}
      className={`flex ${size} shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarColor(name)} ${className}`}
    >
      {getInitials(name)}
    </span>
  )
}

function AvatarStack({ customers, max = 4 }) {
  const shown = customers.slice(0, max)
  const extra = customers.length - shown.length

  return (
    <div className="flex items-center -space-x-2" aria-hidden="true">
      {shown.map((row) => (
        <Avatar
          key={row.customer.id}
          name={row.customer.name}
          photo={customerPhoto(row.customer)}
          size="h-7 w-7"
          className="ring-2 ring-white dark:ring-slate-900"
        />
      ))}
      {extra > 0 && (
        <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-violet-100 px-1.5 text-[10px] font-bold text-violet-700 ring-2 ring-white dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-900">
          +{extra}
        </span>
      )}
    </div>
  )
}

/* =========================================================
   SMALL UI PIECES
   ========================================================= */
function SummaryCard({ label, value, detail, icon: Icon, tone = "green", valueClass = "text-[#151934] dark:text-slate-100" }) {
  const tones = {
    green: "bg-emerald-100/80 text-emerald-700",
    blue: "bg-blue-100/80 text-blue-700",
    pink: "bg-pink-100/80 text-pink-700",
    purple: "bg-violet-100/80 text-violet-700",
  }
  const accents = {
    green: "text-emerald-700",
    blue: "text-blue-700",
    pink: "text-pink-700",
    purple: "text-violet-700",
  }

  return (
    <Card className="overflow-hidden rounded-[18px] border border-white/80 bg-white/80 shadow-[0_4px_15px_rgba(80,65,130,0.07)] backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/90 dark:shadow-black/20 sm:rounded-[20px]">
      <CardContent className="flex min-w-0 flex-col items-start gap-2.5 p-3.5 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-[58px] sm:w-[58px] ${tones[tone]}`}>
          <Icon className="h-5 w-5 sm:h-7 sm:w-7" strokeWidth={1.9} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-[11px] font-medium leading-tight text-slate-600 dark:text-slate-300 sm:line-clamp-2 sm:text-[13px]">
            {label}
          </p>
          <h3 className={`mt-1 break-words text-[17px] font-bold leading-tight tracking-tight tabular-nums sm:mt-1.5 sm:text-[23px] ${valueClass}`}>
            {value}
          </h3>
          <p className={`mt-1 line-clamp-2 text-[10px] font-semibold leading-snug sm:text-xs ${accents[tone]}`}>{detail}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function SectionHeader({ icon: Icon, title, description, action }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#eae7f4] px-4 py-3.5 dark:border-slate-800 sm:px-5 sm:py-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 sm:flex">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-bold tracking-tight text-[#171a36] dark:text-slate-100 sm:text-[16px]">{title}</h2>
          {description && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

function SearchBox({ value, onChange, placeholder, label, className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={`${fieldClass} pl-10 pr-10`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

function FilterChip({ active, onClick, children, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
        active
          ? "border-violet-300 bg-violet-100 text-violet-800"
          : "border-violet-200 bg-white text-slate-700 hover:bg-violet-50 dark:text-slate-200 dark:hover:bg-slate-800"
      }`}
    >
      {children}
      {count !== undefined && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
            active ? "bg-white text-violet-800" : "bg-violet-50 text-slate-600"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )
}

function Pagination({ info, onChange }) {
  const { safePage, totalPages, from, to, total } = info

  const items =
    totalPages <= 5
      ? Array.from({ length: totalPages }, (_, i) => i + 1)
      : safePage <= 3
        ? [1, 2, 3, "…", totalPages]
        : safePage >= totalPages - 2
          ? [1, "…", totalPages - 2, totalPages - 1, totalPages]
          : [1, "…", safePage - 1, safePage, safePage + 1, "…", totalPages]

  return (
    <div className="flex flex-col gap-3 border-t border-[#eeecf5] bg-white/60 px-4 py-3.5 dark:border-slate-800 dark:bg-slate-900/60 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <p className="text-center text-xs font-medium text-slate-600 dark:text-slate-400 sm:text-left">
        Showing <strong className="text-slate-800 dark:text-slate-200">{from}–{to}</strong> of{" "}
        <strong className="text-slate-800 dark:text-slate-200">{total.toLocaleString("en-IN")}</strong> towns
      </p>

      {totalPages > 1 && (
        <nav aria-label="Pages" className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Previous page"
            disabled={safePage <= 1}
            onClick={() => onChange(safePage - 1)}
            className="h-9 w-9 rounded-full border-violet-200 bg-white p-0 text-slate-600 shadow-sm hover:bg-violet-50 disabled:opacity-40 sm:h-8 sm:w-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {items.map((item, index) =>
            typeof item === "string" ? (
              <span key={`ellipsis-${index}`} className="px-1 text-xs text-slate-400">…</span>
            ) : (
              <Button
                key={item}
                type="button"
                variant={safePage === item ? "default" : "outline"}
                aria-current={safePage === item ? "page" : undefined}
                onClick={() => onChange(item)}
                className={`h-9 min-w-9 rounded-full px-0 text-xs font-semibold shadow-sm sm:h-8 sm:min-w-8 ${
                  safePage === item
                    ? "border-violet-700 bg-violet-700 text-white hover:bg-violet-800"
                    : "border-violet-200 bg-white text-slate-700 hover:bg-violet-50 dark:text-slate-200 dark:hover:bg-slate-800"
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
            disabled={safePage >= totalPages}
            onClick={() => onChange(safePage + 1)}
            className="h-9 w-9 rounded-full border-violet-200 bg-white p-0 text-slate-600 shadow-sm hover:bg-violet-50 disabled:opacity-40 sm:h-8 sm:w-8"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </nav>
      )}
    </div>
  )
}

function EmptyState({ title, description, onClear, hasFilters }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center px-5 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
        <MapPinned className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">{description}</p>
      {hasFilters && (
        <Button variant="outline" className={`mt-4 gap-2 px-4 ${outlineBtn}`} onClick={onClear}>
          Clear filters
        </Button>
      )}
    </div>
  )
}

function StatusBadge({ row }) {
  if (row.overdue > 0) {
    return (
      <span className="inline-flex items-center rounded-full border border-rose-100 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
        Overdue{row.overdueDays > 0 ? ` · ${row.overdueDays}d` : ""}
      </span>
    )
  }
  if (row.due > 0) {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
        Due
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
      Clear
    </span>
  )
}

// Desktop table ke liye chhote icon buttons
function ContactActions({ customer, due }) {
  const phone = normalizeMobile(customer.mobile)
  const reminder = buildReminder(customer, due)

  return (
    <div className="flex items-center justify-end gap-1.5">
      {phone.length === 10 && (
        <Button asChild variant="outline" size="icon" className={iconBtn} title="Call">
          <a href={`tel:+91${phone}`} aria-label={`Call ${customer.name}`}>
            <Phone className="h-4 w-4" />
          </a>
        </Button>
      )}

      {reminder && (
        <Button asChild variant="outline" size="icon" className={iconBtn} title="WhatsApp reminder">
          <a href={reminder} target="_blank" rel="noopener noreferrer" aria-label={`Remind ${customer.name}`}>
            <MessageCircle className="h-4 w-4" />
          </a>
        </Button>
      )}

      <Button asChild variant="outline" size="sm" className={`h-8 gap-1 px-2.5 text-xs ${outlineBtn}`}>
        <Link to={`/customers/${customer.id}`}>
          Open <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  )
}

// Mobile ke liye bade (thumb-friendly) action buttons
function MobileActions({ customer, due }) {
  const phone = normalizeMobile(customer.mobile)
  const reminder = buildReminder(customer, due)
  const base = `h-10 w-full gap-1.5 px-2 text-xs font-semibold ${outlineBtn}`

  return (
    <div className="grid grid-cols-3 gap-2">
      {phone.length === 10 ? (
        <Button asChild variant="outline" className={base}>
          <a href={`tel:+91${phone}`} aria-label={`Call ${customer.name}`}>
            <Phone className="h-4 w-4" /> Call
          </a>
        </Button>
      ) : (
        <Button variant="outline" disabled className={base}>
          <Phone className="h-4 w-4" /> Call
        </Button>
      )}

      {reminder ? (
        <Button
          asChild
          variant="outline"
          className={`${base} border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/40 dark:text-emerald-300`}
        >
          <a href={reminder} target="_blank" rel="noopener noreferrer" aria-label={`Remind ${customer.name}`}>
            <MessageCircle className="h-4 w-4" /> Remind
          </a>
        </Button>
      ) : (
        <Button variant="outline" disabled className={base}>
          <MessageCircle className="h-4 w-4" /> Remind
        </Button>
      )}

      <Button asChild variant="outline" className={base}>
        <Link to={`/customers/${customer.id}`}>
          <UserRound className="h-4 w-4" /> Profile
        </Link>
      </Button>
    </div>
  )
}

function MiniStat({ label, value, tone = "default" }) {
  const toneClass =
    tone === "danger"
      ? "text-rose-600"
      : tone === "muted"
        ? "text-slate-500"
        : "text-slate-800 dark:text-slate-100"

  return (
    <div className="min-w-0 rounded-xl bg-[#f7f5ff] px-2.5 py-2 dark:bg-slate-800/70 sm:px-3">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className={`mt-0.5 truncate text-[12.5px] font-bold tabular-nums sm:text-[13px] ${toneClass}`}>{value}</p>
    </div>
  )
}

// Customer ke pending bills ki detail list
function PendingBills({ row }) {
  const items = row.pendingBills

  return (
    <div className="rounded-xl border border-violet-100 bg-[#fbfaff] p-2 dark:border-slate-700 dark:bg-slate-950">
      {row.opening > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-2">
          <div>
            <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Opening balance</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Carried forward</p>
          </div>
          <p className="text-xs font-bold tabular-nums text-rose-600">{formatCurrency(row.opening)}</p>
        </div>
      )}

      {items.map((bill) => (
        <div
          key={bill.id}
          className="flex items-start justify-between gap-3 rounded-lg px-2 py-2 odd:bg-white/70 dark:odd:bg-slate-900/60"
        >
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">
              {bill.number ? `Bill ${bill.number}` : "Bill"}
            </p>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              Billed {bill.date ? formatDate(bill.date) : "—"} · Due {bill.dueDate ? formatDate(bill.dueDate) : "not set"}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-xs font-bold tabular-nums text-rose-600">{formatCurrency(bill.due)}</p>
            <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
              of {formatCurrency(bill.total)}
              {bill.overdueDays > 0 && (
                <span className="ml-1 font-semibold text-rose-600">· {bill.overdueDays}d late</span>
              )}
            </p>
          </div>
        </div>
      ))}

      {!items.length && row.opening <= 0 && (
        <p className="px-2 py-3 text-center text-xs text-slate-500 dark:text-slate-400">No pending bills in this period.</p>
      )}
    </div>
  )
}

/* =========================================================
   CUSTOMER LIST INSIDE AN EXPANDED TOWN
   ========================================================= */

// Mobile / tablet card
function CustomerCard({ row }) {
  const { customer } = row
  const [showBills, setShowBills] = useState(false)
  const billsId = `bills-${customer.id}`

  return (
    <article className="overflow-hidden rounded-2xl border border-violet-100/80 bg-white shadow-[0_2px_10px_rgba(80,65,130,0.05)] dark:border-slate-700 dark:bg-slate-900">
      {/* top: avatar + identity + amount */}
      <div className="flex items-start gap-3 p-3.5">
        <Avatar name={customer.name} photo={customerPhoto(customer)} size="h-12 w-12" />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{customer.name}</p>
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                {customer.mobile || "No mobile number"}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p className={`text-[15px] font-extrabold tabular-nums ${row.due > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {formatCurrency(row.due)}
              </p>
            </div>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge row={row} />
            <span className="rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
              {customer.customer_type || "Individual"}
            </span>
          </div>
        </div>
      </div>

      {customer.address && (
        <p className="flex items-start gap-1.5 px-3.5 pb-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="line-clamp-2">{customer.address}</span>
        </p>
      )}

      {/* money breakdown */}
      <div className="grid grid-cols-3 gap-2 px-3.5 pb-3">
        <MiniStat label="Opening" value={formatCurrency(row.opening)} />
        <MiniStat label="Bill due" value={formatCurrency(row.billDue)} />
        <MiniStat label="Overdue" value={formatCurrency(row.overdue)} tone={row.overdue > 0 ? "danger" : "muted"} />
      </div>

      {/* pending bills toggle */}
      <button
        type="button"
        onClick={() => setShowBills((open) => !open)}
        aria-expanded={showBills}
        aria-controls={billsId}
        className="flex w-full items-center justify-between gap-2 border-t border-[#eeecf5] px-3.5 py-2.5 text-left text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-50/60 dark:border-slate-700 dark:text-violet-300 dark:hover:bg-slate-800"
      >
        <span className="flex items-center gap-2">
          <ReceiptText className="h-4 w-4" />
          {row.billCount} pending {row.billCount === 1 ? "bill" : "bills"}
          {row.lastBill && (
            <span className="font-normal text-slate-500 dark:text-slate-400">· Last bill {formatDate(row.lastBill)}</span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${showBills ? "rotate-180" : ""}`} />
      </button>

      {showBills && (
        <div id={billsId} className="border-t border-[#eeecf5] bg-[#fbfaff] p-2.5 dark:border-slate-700 dark:bg-slate-950">
          <PendingBills row={row} />
        </div>
      )}

      <div className="border-t border-[#eeecf5] bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <MobileActions customer={customer} due={row.due} />
      </div>
    </article>
  )
}

// Desktop table
function CustomerTable({ town }) {
  const [openRows, setOpenRows] = useState({})
  const th = "px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"

  const toggleRow = (id) => setOpenRows((previous) => ({ ...previous, [id]: !previous[id] }))

  return (
    <div className="overflow-x-auto rounded-2xl border border-violet-100/80 bg-white dark:border-slate-700 dark:bg-slate-900">
      <table className="w-full min-w-[920px] border-collapse text-left">
        <thead className="bg-[#f7f5ff] dark:bg-slate-800/70">
          <tr>
            <th className={`${th} pl-4`}>Customer</th>
            <th className={th}>Status</th>
            <th className={th}>Last bill</th>
            <th className={`${th} text-right`}>Opening</th>
            <th className={`${th} text-right`}>Bill due</th>
            <th className={`${th} text-right`}>Overdue</th>
            <th className={`${th} text-right`}>Outstanding</th>
            <th className={`${th} pr-4 text-right`}>Actions</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-[#eeecf5] dark:divide-slate-800">
          {town.customers.map((row) => {
            const { customer } = row
            const open = Boolean(openRows[customer.id])

            return (
              <Fragment key={customer.id}>
                <tr className="transition-colors hover:bg-[#fbfaff] dark:hover:bg-slate-800/50">
                  <td className="py-3 pl-4 pr-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={customer.name} photo={customerPhoto(customer)} size="h-10 w-10" />
                      <div className="min-w-0">
                        <Link
                          to={`/customers/${customer.id}`}
                          className="block max-w-[210px] truncate text-sm font-bold text-slate-900 hover:text-violet-700 dark:text-slate-100"
                        >
                          {customer.name}
                        </Link>
                        <p className="mt-0.5 max-w-[210px] truncate text-xs text-slate-500 dark:text-slate-400">
                          {customer.mobile || "No mobile"} · {customer.customer_type || "Individual"}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-3">
                    <StatusBadge row={row} />
                    <button
                      type="button"
                      onClick={() => toggleRow(customer.id)}
                      aria-expanded={open}
                      className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-violet-700 hover:underline dark:text-violet-300"
                    >
                      {row.billCount} pending {row.billCount === 1 ? "bill" : "bills"}
                      <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
                    </button>
                  </td>

                  <td className="px-3 py-3 text-xs text-slate-600 dark:text-slate-300">
                    {row.lastBill ? formatDate(row.lastBill) : "—"}
                  </td>

                  <td className="px-3 py-3 text-right text-sm tabular-nums text-slate-700 dark:text-slate-200">
                    {formatCurrency(row.opening)}
                  </td>

                  <td className="px-3 py-3 text-right text-sm tabular-nums text-slate-700 dark:text-slate-200">
                    {formatCurrency(row.billDue)}
                  </td>

                  <td className={`px-3 py-3 text-right text-sm tabular-nums ${row.overdue > 0 ? "font-semibold text-rose-600" : "text-slate-400"}`}>
                    {row.overdue > 0 ? formatCurrency(row.overdue) : "—"}
                  </td>

                  <td className={`px-3 py-3 text-right text-sm font-bold tabular-nums ${row.due > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {formatCurrency(row.due)}
                  </td>

                  <td className="py-3 pl-3 pr-4">
                    <ContactActions customer={customer} due={row.due} />
                  </td>
                </tr>

                {open && (
                  <tr className="bg-[#fbfaff] dark:bg-slate-950">
                    <td colSpan={8} className="px-4 py-3">
                      <div className="max-w-2xl">
                        <PendingBills row={row} />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>

        <tfoot className="border-t border-violet-100 bg-[#f7f5ff] dark:border-slate-700 dark:bg-slate-800/70">
          <tr>
            <td className="py-3 pl-4 pr-3 text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300" colSpan={3}>
              Town total · {town.customers.length} {town.customers.length === 1 ? "customer" : "customers"}
            </td>
            <td className="px-3 py-3 text-right text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">
              {formatCurrency(town.opening)}
            </td>
            <td className="px-3 py-3 text-right text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">
              {formatCurrency(town.billDue)}
            </td>
            <td className="px-3 py-3 text-right text-sm font-bold tabular-nums text-rose-600">
              {formatCurrency(town.overdue)}
            </td>
            <td className="px-3 py-3 text-right text-sm font-extrabold tabular-nums text-rose-600">
              {formatCurrency(town.due)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/* =========================================================
   TOWN CARD
   ========================================================= */
function TownCard({ town, expanded, onToggle, totalDue, variant }) {
  const share = totalDue > 0 ? Math.min(100, (town.due / totalDue) * 100) : 0
  const overduePct = town.due > 0 ? Math.min(100, (town.overdue / town.due) * 100) : 0
  const panelId = `town-panel-${town.name.replace(/\W+/g, "-")}`
  const isCards = variant === "cards"

  return (
    <section
      className={`overflow-hidden rounded-2xl border bg-white transition-shadow dark:bg-slate-900 ${
        expanded
          ? "border-violet-300 shadow-[0_8px_24px_rgba(80,65,130,0.12)] dark:border-violet-500/40"
          : "border-violet-100/80 shadow-[0_3px_12px_rgba(80,65,130,0.05)] dark:border-slate-700"
      } ${isCards && expanded ? "xl:col-span-2" : ""}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="block w-full p-3.5 text-left transition-colors hover:bg-[#fbfaff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 dark:hover:bg-slate-800/60 sm:p-5"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
            <MapPin className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="max-w-full truncate text-base font-bold text-[#171a39] dark:text-slate-100">{town.name}</h3>
              {town.overdue > 0 && (
                <span className="rounded-full border border-rose-100 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                  Overdue{town.maxOverdueDays > 0 ? ` · ${town.maxOverdueDays}d` : ""}
                </span>
              )}
            </div>

            <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {town.customers.length} {town.customers.length === 1 ? "customer" : "customers"} · {town.billCount} pending{" "}
              {town.billCount === 1 ? "bill" : "bills"}
            </p>

            <div className="mt-2">
              <AvatarStack customers={town.customers} />
            </div>
          </div>

          {/* amount: right side on tablet/desktop */}
          <div className="hidden text-right sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Outstanding
            </p>
            <p className="mt-0.5 text-xl font-extrabold tabular-nums text-rose-600">{formatCurrency(town.due)}</p>
          </div>

          <ChevronDown
            className={`mt-3 h-5 w-5 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>

        {/* amount: own row on mobile */}
        <div className="mt-3 flex items-center justify-between rounded-xl bg-rose-50/70 px-3 py-2.5 dark:bg-rose-500/10 sm:hidden">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Total outstanding
            </p>
            <p className="mt-0.5 text-lg font-extrabold tabular-nums text-rose-600">{formatCurrency(town.due)}</p>
          </div>
          {town.overdue > 0 && (
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Overdue</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-rose-600">{formatCurrency(town.overdue)}</p>
            </div>
          )}
        </div>

        {isCards && (
          <div className="mt-3 space-y-3 sm:mt-4">
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Overdue" value={formatCurrency(town.overdue)} tone={town.overdue > 0 ? "danger" : "muted"} />
              <MiniStat label="Opening bal." value={formatCurrency(town.opening)} />
              <MiniStat label="Highest due" value={town.top ? town.top.customer.name : "—"} />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <span>{share.toFixed(share >= 10 ? 0 : 1)}% of total outstanding</span>
                {town.overdue > 0 && <span className="text-rose-600">{overduePct.toFixed(0)}% overdue</span>}
              </div>

              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-violet-100 dark:bg-slate-700">
                <div className="absolute inset-y-0 left-0 rounded-full bg-violet-500" style={{ width: `${share}%` }} />
              </div>
            </div>
          </div>
        )}
      </button>

      {expanded && (
        <div id={panelId} className="border-t border-[#eeecf5] bg-[#fbfaff] p-2.5 dark:border-slate-700 dark:bg-slate-950 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              <ReceiptText className="h-4 w-4 text-violet-600" />
              Customers in {town.name}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Highest outstanding first</p>
          </div>

          <div className="hidden lg:block">
            <CustomerTable town={town} />
          </div>

          <div className="space-y-3 lg:hidden">
            {town.customers.map((row) => (
              <CustomerCard key={row.customer.id} row={row} />
            ))}

            <div className="flex items-center justify-between rounded-xl border border-violet-100 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Town total
              </span>
              <span className="text-sm font-extrabold tabular-nums text-rose-600">{formatCurrency(town.due)}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/* =========================================================
   PAGE
   ========================================================= */
export default function TownCollections() {
  const { currentShop } = useShop()
  const shopId = currentShop?.id

  const [customers, setCustomers] = useState([])
  const [bills, setBills] = useState([])
  const [search, setSearch] = useState("")
  const [townFilter, setTownFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("due")
  const [sortBy, setSortBy] = useState("due")
  const [viewMode, setViewMode] = useState("cards")
  const [period, setPeriod] = useState({ mode: "overall", from: "", to: "" })
  const [periodOpen, setPeriodOpen] = useState(false)
  const periodRef = useRef(null)
  const [page, setPage] = useState(1)
  const [expandedTowns, setExpandedTowns] = useState({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [lastUpdated, setLastUpdated] = useState(null)

  const today = getLocalDateString()

  const range = useMemo(() => {
    switch (period.mode) {
      case "overall":
        return { from: null, to: null }
      case "yesterday": {
        const yesterday = shiftDate(today, -1)
        return { from: yesterday, to: yesterday }
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

  const periodLabel = useMemo(() => {
    const labels = {
      today: "Today",
      yesterday: "Yesterday",
      week: "Last 7 days",
      month: "This month",
      overall: "Overall",
    }
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
    return labels[period.mode] || "Today"
  }, [period.mode, range.from, range.to])

  const choosePeriod = (mode) => {
    setPeriod({ mode, from: "", to: "" })
    setPage(1)
    setPeriodOpen(false)
  }

  const changeCustomDate = (key, value) => {
    const next = { from: range.from || "", to: range.to || "", [key]: value }
    if (next.from && next.to && next.from > next.to) {
      if (key === "from") next.to = next.from
      else next.from = next.to
    }
    setPeriod({ mode: "custom", ...next })
    setPage(1)
  }

  useEffect(() => {
    if (!periodOpen) return
    const onPointerDown = (event) => {
      if (periodRef.current && !periodRef.current.contains(event.target)) setPeriodOpen(false)
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

  const requestRef = useRef(0)
  const hasLoaded = useRef(false)

  const loadData = useCallback(
    async (refresh = false) => {
      if (!shopId) {
        setCustomers([])
        setBills([])
        setLoading(false)
        return
      }

      const requestId = ++requestRef.current

      if (refresh || hasLoaded.current) setRefreshing(true)
      else setLoading(true)

      setLoadError("")

      try {
        const [customerRows, billRows] = await Promise.all([
          fetchAllRows(() => supabase.from("customers").select("*").eq("shop_id", shopId).order("id")),
          fetchAllRows(() =>
            supabase
              .from("bills")
              .select("id, bill_number, customer_id, grand_total, amount_paid, amount_due, due_date, bill_date")
              .eq("shop_id", shopId)
              .order("id")
          ),
        ])

        if (requestId !== requestRef.current) return

        setCustomers(customerRows)
        setBills(billRows)
        setLastUpdated(new Date())
        hasLoaded.current = true
      } catch (error) {
        if (requestId !== requestRef.current) return
        console.error("Town collection load error:", error)
        setLoadError(error?.message || "Unable to load town collections.")
        toast.error("Could not load town collections", { description: error?.message })
      } finally {
        if (requestId === requestRef.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [shopId]
  )

  useEffect(() => {
    hasLoaded.current = false
    setCustomers([])
    setBills([])
    setPage(1)
    setExpandedTowns({})
    loadData()
  }, [loadData])

  // Bills inside the selected calendar period. Opening balances always stay included.
  const periodBills = useMemo(
    () =>
      bills.filter((bill) => {
        if (!bill.bill_date) return period.mode === "overall"
        if (range.from && bill.bill_date < range.from) return false
        if (range.to && bill.bill_date > range.to) return false
        return true
      }),
    [bills, period.mode, range.from, range.to]
  )

  const rows = useMemo(() => {
    const billStats = {}

    periodBills.forEach((bill) => {
      if (!bill.customer_id) return

      const item = (billStats[bill.customer_id] ||= {
        due: 0,
        overdue: 0,
        count: 0,
        billed: 0,
        lastBill: "",
        oldestOverdue: "",
        bills: [],
      })

      const due = num(bill.amount_due)
      item.due += due
      item.billed += num(bill.grand_total)

      const overdueDays = bill.due_date && bill.due_date < today ? daysBetween(today, bill.due_date) : 0

      if (due > 0) {
        item.count += 1
        item.bills.push({
          id: bill.id,
          number: bill.bill_number,
          date: bill.bill_date,
          dueDate: bill.due_date,
          total: num(bill.grand_total),
          paid: num(bill.amount_paid),
          due,
          overdueDays,
        })
      }

      if (due > 0 && bill.due_date && bill.due_date < today) {
        item.overdue += due
        if (!item.oldestOverdue || bill.due_date < item.oldestOverdue) {
          item.oldestOverdue = bill.due_date
        }
      }

      if (bill.bill_date && bill.bill_date > item.lastBill) item.lastBill = bill.bill_date
    })

    return customers
      .filter((customer) => customer.is_active !== false)
      .map((customer) => {
        const stats = billStats[customer.id] || {}
        const opening = num(customer.opening_balance)
        const billDue = num(stats.due)

        const pendingBills = [...(stats.bills || [])].sort((a, b) =>
          String(a.dueDate || a.date || "").localeCompare(String(b.dueDate || b.date || ""))
        )

        return {
          customer,
          town: String(customer.city || "").trim() || "Town not specified",
          due: opening + billDue,
          billDue,
          opening,
          overdue: num(stats.overdue),
          overdueDays: stats.oldestOverdue ? daysBetween(today, stats.oldestOverdue) : 0,
          billCount: num(stats.count),
          billed: num(stats.billed),
          lastBill: stats.lastBill || "",
          pendingBills,
        }
      })
  }, [customers, periodBills, today])

  const dueRows = useMemo(() => rows.filter((row) => row.due > 0), [rows])
  const townGroups = useMemo(() => groupByTown(dueRows), [dueRows])

  const townNames = useMemo(
    () => [...new Set(rows.map((row) => row.town))].sort((a, b) => a.localeCompare(b)),
    [rows]
  )

  const statusCounts = useMemo(
    () => ({
      all: rows.length,
      due: dueRows.length,
      overdue: dueRows.filter((row) => row.overdue > 0).length,
      clear: rows.filter((row) => row.due <= 0).length,
    }),
    [rows, dueRows]
  )

  const summary = useMemo(
    () => ({
      due: dueRows.reduce((sum, row) => sum + row.due, 0),
      overdue: dueRows.reduce((sum, row) => sum + row.overdue, 0),
      customers: dueRows.length,
      towns: townGroups.length,
    }),
    [dueRows, townGroups]
  )

  const filteredTowns = useMemo(() => {
    const query = search.trim().toLowerCase()
    const digits = query.replace(/\D/g, "")

    const filteredRows = rows.filter((row) => {
      const customer = row.customer

      const matchesTown = townFilter === "all" || row.town === townFilter
      const matchesType = typeFilter === "all" || customer.customer_type === typeFilter
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "due" && row.due > 0) ||
        (statusFilter === "overdue" && row.overdue > 0) ||
        (statusFilter === "clear" && row.due <= 0)

      const matchesSearch =
        !query ||
        row.town.toLowerCase().includes(query) ||
        customer.name?.toLowerCase().includes(query) ||
        customer.city?.toLowerCase().includes(query) ||
        customer.address?.toLowerCase().includes(query) ||
        (digits && normalizeMobile(customer.mobile).includes(digits))

      return matchesTown && matchesType && matchesStatus && matchesSearch
    })

    const result = groupByTown(filteredRows)

    result.sort((a, b) => {
      if (sortBy === "customers") return b.customers.length - a.customers.length || a.name.localeCompare(b.name)
      if (sortBy === "name") return a.name.localeCompare(b.name)
      if (sortBy === "overdue") return b.overdue - a.overdue || b.due - a.due
      return b.due - a.due
    })

    return result
  }, [rows, search, townFilter, typeFilter, statusFilter, sortBy])

  useEffect(() => {
    setPage(1)
  }, [search, townFilter, typeFilter, statusFilter, sortBy])

  const pageInfo = paginate(filteredTowns, page)

  const hasFilters =
    Boolean(search) ||
    townFilter !== "all" ||
    typeFilter !== "all" ||
    statusFilter !== "due" ||
    sortBy !== "due"

  const clearFilters = () => {
    setSearch("")
    setTownFilter("all")
    setTypeFilter("all")
    setStatusFilter("due")
    setSortBy("due")
  }

  /* ---------- exports ---------- */
  const exportCsv = () => {
    const output = [
      [
        "Town / Village", "Customer", "Mobile", "Customer type", "Address",
        "Opening balance", "Bill due", "Overdue", "Total outstanding",
        "Pending bills", "Last bill date", "Days overdue",
      ],
    ]

    filteredTowns.forEach((town) => {
      town.customers.forEach((row) =>
        output.push([
          town.name,
          row.customer.name,
          row.customer.mobile || "",
          row.customer.customer_type || "Individual",
          [row.customer.address, row.customer.city, row.customer.state, row.customer.pincode]
            .filter(Boolean)
            .join(", "),
          row.opening,
          row.billDue,
          row.overdue,
          row.due,
          row.billCount,
          row.lastBill || "",
          row.overdueDays || 0,
        ])
      )
    })

    downloadCsv(`town-collection-${new Date().toISOString().slice(0, 10)}.csv`, output)
    toast.success(`Exported ${filteredTowns.length} ${filteredTowns.length === 1 ? "town" : "towns"}`)
  }

  const exportPdf = () => {
    if (!filteredTowns.length) {
      toast.error("No town details available to export")
      return
    }

    try {
      generateTownDetailsPDF({
        towns: filteredTowns,
        shop: currentShop,
        periodLabel,
      })
      toast.success("Town details PDF exported")
    } catch (error) {
      console.error("Town details PDF export error:", error)
      toast.error("Could not generate town details PDF", {
        description: error?.message || "Please try again.",
      })
    }
  }

  /* ---------- expand / collapse ---------- */
  const toggleTown = (name) => setExpandedTowns((previous) => ({ ...previous, [name]: !previous[name] }))

  const expandAll = () =>
    setExpandedTowns((previous) => ({
      ...previous,
      ...Object.fromEntries(pageInfo.items.map((town) => [town.name, true])),
    }))

  const collapseAll = () => setExpandedTowns({})

  const expandedOnPage = pageInfo.items.filter((town) => expandedTowns[town.name]).length

  /* ---------- states ---------- */
  if (loading) {
    return (
      <div className="min-h-full w-full space-y-4 rounded-2xl bg-[#f7f5ff] px-3 py-5 dark:bg-slate-950 sm:px-5 lg:px-6" aria-busy="true">
        <div className="h-16 w-72 max-w-full animate-pulse rounded-xl bg-slate-200/70" />
        <div className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-[116px] animate-pulse rounded-[20px] bg-slate-200/70" />
          ))}
        </div>
        <div className="h-[420px] animate-pulse rounded-[20px] bg-slate-200/70" />
      </div>
    )
  }

  if (!shopId) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-3xl border border-dashed border-violet-200 bg-white/80 p-8 text-center">
        <div>
          <MapPin className="mx-auto h-10 w-10 text-violet-600" />
          <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">Select a workspace</h2>
          <p className="mt-2 text-sm text-slate-500">Choose a shop to view town-wise collections.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full w-full space-y-3 rounded-2xl bg-[#f7f5ff] px-3 py-4 dark:bg-slate-950 sm:space-y-4 sm:px-5 sm:py-5 lg:px-6">
      <header className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="hidden items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 sm:flex">
            <span>{currentShop?.name || "Workspace"}</span>
            <ChevronRight className="h-3 w-3" />
            <span>Billing</span>
            <ChevronRight className="h-3 w-3" />
            <span>Town Collection</span>
          </nav>

          <h1 className="text-[26px] font-bold tracking-tight text-[#171a39] dark:text-slate-100 sm:mt-1 sm:text-[32px]">
            Town Collection
          </h1>

          <p className="mt-0.5 text-[13px] leading-5 text-slate-600 dark:text-slate-300 sm:text-sm">
            <span className="hidden sm:inline">Plan collection visits with town-wise customer dues and outstanding balances. · </span>
            <span className="font-semibold">{periodLabel}</span>
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <div ref={periodRef} className="relative col-span-3 w-full sm:col-span-1 sm:w-auto">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={periodOpen}
              onClick={() => setPeriodOpen((open) => !open)}
              className="flex h-11 w-full items-center gap-2 rounded-xl border border-violet-100 bg-white/80 px-3.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 sm:w-auto sm:max-w-[270px]"
            >
              <CalendarDays className="h-4 w-4 shrink-0 text-slate-600" />
              <span className="truncate">{periodLabel}</span>
              <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-slate-500 transition-transform sm:ml-0 ${periodOpen ? "rotate-180" : ""}`} />
            </button>

            {periodOpen && (
              <>
                <div className="fixed inset-0 z-40 bg-slate-900/30 sm:hidden" onClick={() => setPeriodOpen(false)} aria-hidden="true" />
                <div
                  role="menu"
                  aria-label="Choose period"
                  className="fixed inset-x-3 bottom-3 z-50 max-h-[85vh] overflow-y-auto rounded-2xl border border-violet-100 bg-white p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_12px_32px_rgba(80,65,130,0.25)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40 sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-[calc(100%+8px)] sm:z-30 sm:max-h-none sm:w-[290px] sm:overflow-visible"
                >
                  {[...PERIOD_PRESETS, { mode: "overall", label: "Overall (all time)" }].map((option) => {
                    const active = period.mode === option.mode
                    return (
                      <button
                        key={option.mode}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        onClick={() => choosePeriod(option.mode)}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:py-2.5 ${
                          active
                            ? "border border-violet-100 bg-white font-semibold text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                            : "text-slate-700 hover:bg-violet-50 dark:text-slate-200 dark:hover:bg-slate-800"
                        }`}
                      >
                        {option.label}
                        {active && <CheckCircle2 className="h-4 w-4" />}
                      </button>
                    )
                  })}

                  <div className="mt-2 border-t border-[#eeecf5] px-1 pb-1 pt-3 dark:border-slate-700">
                    <p className={`mb-2 px-2 text-xs font-semibold ${period.mode === "custom" ? "text-emerald-800 dark:text-emerald-300" : "text-slate-500 dark:text-slate-400"}`}>
                      Pick dates
                    </p>
                    <div className="grid grid-cols-2 gap-2 px-1">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">From</span>
                        <input
                          type="date"
                          value={range.from || ""}
                          max={range.to || today}
                          onChange={(event) => changeCustomDate("from", event.target.value)}
                          className="h-10 w-full rounded-lg border border-violet-200 bg-white px-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:h-9"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">To</span>
                        <input
                          type="date"
                          value={range.to || ""}
                          min={range.from || undefined}
                          max={today}
                          onChange={(event) => changeCustomDate("to", event.target.value)}
                          className="h-10 w-full rounded-lg border border-violet-200 bg-white px-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:h-9"
                        />
                      </label>
                    </div>
                    <p className="mt-3 px-2 text-[11px] leading-4 text-slate-500">
                      Town collections are calculated from bills dated in the selected period. Opening balances remain included.
                    </p>
                    <Button
                      type="button"
                      onClick={() => setPeriodOpen(false)}
                      className="mt-3 h-11 w-full rounded-xl border border-violet-100 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-violet-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
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
            onClick={exportCsv}
            disabled={!filteredTowns.length}
            className={`h-11 w-full gap-1.5 px-2 text-xs sm:w-auto sm:gap-2 sm:px-4 sm:text-sm ${outlineBtn}`}
          >
            <Download className="h-4 w-4" />
            <span className="sm:hidden">CSV</span>
            <span className="hidden sm:inline">Export CSV</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={exportPdf}
            disabled={!filteredTowns.length}
            className={`h-11 w-full gap-1.5 px-2 text-xs sm:w-auto sm:gap-2 sm:px-4 sm:text-sm ${outlineBtn}`}
          >
            <FileText className="h-4 w-4" />
            <span className="sm:hidden">PDF</span>
            <span className="hidden sm:inline">Export PDF</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className={`h-11 w-full gap-1.5 px-2 text-xs font-medium sm:w-auto sm:gap-2 sm:px-4 sm:text-sm ${outlineBtn}`}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            <span className="sm:hidden">Refresh</span>
            <span className="hidden sm:inline">{refreshing ? "Refreshing…" : "Refresh"}</span>
          </Button>
        </div>
      </header>

      {loadError && (
        <div role="alert" className="flex flex-col justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-sm text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Could not load town collections. <span className="text-xs text-rose-500">({loadError})</span>
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={() => loadData(true)} className="border-rose-200 bg-white">
            Try again
          </Button>
        </div>
      )}

      <section aria-label="Town collection overview" className="grid grid-cols-2 gap-2.5 sm:gap-3 2xl:grid-cols-4">
        <SummaryCard
          label="Total outstanding"
          value={formatCurrency(summary.due)}
          detail={`${summary.customers} customers have dues`}
          icon={IndianRupee}
          tone="pink"
        />
        <SummaryCard
          label="Overdue amount"
          value={formatCurrency(summary.overdue)}
          detail={
            summary.due > 0
              ? `${Math.round((summary.overdue / summary.due) * 100)}% of outstanding is overdue`
              : "Past their bill due date"
          }
          icon={Clock3}
          tone="purple"
        />
        <SummaryCard
          label="Towns to visit"
          value={summary.towns.toLocaleString("en-IN")}
          detail="Towns with pending dues"
          icon={MapPin}
          tone="green"
        />
        <SummaryCard
          label="Customers to collect"
          value={summary.customers.toLocaleString("en-IN")}
          detail="Active customers with dues"
          icon={Users}
          tone="blue"
        />
      </section>

      <Card className={cardClass}>
        <SectionHeader
          icon={MapPinned}
          title="Town-wise outstanding"
          description={`Showing ${filteredTowns.length} of ${townGroups.length} towns with pending dues`}
          action={
            <div
              className="flex shrink-0 items-center rounded-xl border border-violet-100 bg-[#f7f5ff] p-1 dark:border-slate-700 dark:bg-slate-950"
              role="group"
              aria-label="View mode"
            >
              {[
                { id: "list", label: "List", icon: List },
                { id: "cards", label: "Cards", icon: LayoutGrid },
              ].map((mode) => {
                const Icon = mode.icon
                const active = viewMode === mode.id
                return (
                  <Button
                    key={mode.id}
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-pressed={active}
                    aria-label={`${mode.label} view`}
                    onClick={() => setViewMode(mode.id)}
                    className={`h-8 gap-1.5 rounded-lg px-2.5 text-xs ${
                      active
                        ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden min-[400px]:inline">{mode.label}</span>
                  </Button>
                )
              })}
            </div>
          }
        />

        <div className="space-y-3 border-b border-[#eeecf5] p-3.5 dark:border-slate-800 sm:p-4 sm:px-5">
          <div className="flex flex-col gap-2 xl:flex-row">
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="Search town, customer, mobile or address"
              label="Search town collections"
              className="flex-1"
            />

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:flex xl:gap-2">
              <Select value={townFilter} onValueChange={setTownFilter}>
                <SelectTrigger className={`${fieldClass} col-span-2 w-full sm:col-span-1 xl:w-52`} aria-label="Filter by town">
                  <SelectValue placeholder="All towns" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All towns</SelectItem>
                  {townNames.map((town) => (
                    <SelectItem key={town} value={town}>{town}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className={`${fieldClass} w-full xl:w-44`} aria-label="Customer type">
                  <SelectValue placeholder="Customer type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {CUSTOMER_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className={`${fieldClass} w-full xl:w-44`} aria-label="Sort towns">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="due">Highest due</SelectItem>
                  <SelectItem value="overdue">Highest overdue</SelectItem>
                  <SelectItem value="customers">Most customers</SelectItem>
                  <SelectItem value="name">Town name (A to Z)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div role="group" aria-label="Filter collection status" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[
                { id: "due", label: "With dues", count: statusCounts.due },
                { id: "overdue", label: "Overdue", count: statusCounts.overdue },
                { id: "clear", label: "All clear", count: statusCounts.clear },
                { id: "all", label: "All customers", count: statusCounts.all },
              ].map((filter) => (
                <FilterChip
                  key={filter.id}
                  active={statusFilter === filter.id}
                  count={filter.count}
                  onClick={() => setStatusFilter(filter.id)}
                >
                  {filter.label}
                </FilterChip>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={expandAll}
                disabled={!pageInfo.items.length || expandedOnPage === pageInfo.items.length}
                className={`h-9 flex-1 px-3 text-xs sm:flex-none ${outlineBtn}`}
              >
                Expand page
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={collapseAll}
                disabled={!Object.values(expandedTowns).some(Boolean)}
                className={`h-9 flex-1 px-3 text-xs sm:flex-none ${outlineBtn}`}
              >
                Collapse all
              </Button>

              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="shrink-0 px-2 text-xs font-semibold text-slate-500 hover:text-rose-600"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        </div>

        {filteredTowns.length === 0 ? (
          <EmptyState
            title={rows.length ? "No matching town collections" : "No outstanding dues"}
            description={
              rows.length
                ? "Try changing your search or filters."
                : "Active customers with outstanding balances will appear here, grouped by town."
            }
            hasFilters={hasFilters}
            onClear={clearFilters}
          />
        ) : (
          <>
            {/* items-start: ek card expand ho to padosi card stretch nahi hota */}
            <div
              className={`${
                viewMode === "cards" ? "grid grid-cols-1 items-start gap-3 sm:gap-4 xl:grid-cols-2" : "space-y-3"
              } p-3 transition-opacity sm:p-5 ${refreshing ? "opacity-60" : "opacity-100"}`}
            >
              {pageInfo.items.map((town) => (
                <TownCard
                  key={town.name}
                  town={town}
                  variant={viewMode}
                  totalDue={summary.due}
                  expanded={Boolean(expandedTowns[town.name])}
                  onToggle={() => toggleTown(town.name)}
                />
              ))}
            </div>

            <Pagination info={pageInfo} onChange={setPage} />
          </>
        )}
      </Card>

      <footer className="flex flex-col justify-between gap-2 rounded-xl border border-white/80 bg-white/65 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-emerald-700" />
          <span>
            Workspace: <strong className="ml-1 text-slate-700 dark:text-slate-200">{currentShop?.name || "—"}</strong>
          </span>
        </div>

        <span>
          {lastUpdated
            ? `Last updated at ${lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
            : "Not updated yet"}
        </span>
      </footer>
    </div>
  )
}