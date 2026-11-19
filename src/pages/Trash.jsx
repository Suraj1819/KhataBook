import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import { formatCurrency } from "@/lib/utils"
import {
  restoreFromTrash,
  permanentlyDeleteTrashItem,
  emptyTrash,
} from "@/lib/trash"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { toast } from "sonner"

import {
  AlertCircle,
  AlertTriangle,
  ArchiveRestore,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  FileText,
  Info,
  Loader2,
  Package,
  Phone,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldAlert,
  Store,
  Trash2,
  Users,
  Wallet,
  X,
} from "lucide-react"

/* ==================================================
   CONSTANTS & HELPERS
================================================== */

const PAGE_SIZES = [5, 10, 20, 50]
const DEFAULT_PAGE_SIZE = 10
const FETCH_BATCH = 1000 // Supabase returns max 1000 rows per request

const TYPE_META = {
  customer: {
    label: "Customer",
    plural: "Customers",
    icon: Users,
    tone: "bg-blue-100 text-blue-700 border-blue-200",
    iconTone: "bg-blue-50 text-blue-700 border-blue-100",
    bar: "bg-blue-500",
    restoreNote:
      "Also restores this customer's saved ledger, payments, advances and bills.",
  },
  bill: {
    label: "Bill",
    plural: "Bills",
    icon: FileText,
    tone: "bg-amber-100 text-amber-700 border-amber-200",
    iconTone: "bg-amber-50 text-amber-700 border-amber-100",
    bar: "bg-amber-400",
    restoreNote:
      "Also restores this bill's saved items, linked payments and advances.",
  },
  khata_entry: {
    label: "Khata Entry",
    plural: "Khata entries",
    icon: BookOpen,
    tone: "bg-violet-100 text-violet-700 border-violet-200",
    iconTone: "bg-violet-50 text-violet-700 border-violet-100",
    bar: "bg-violet-500",
    restoreNote: "Puts this khata entry back in the customer's ledger.",
  },
  reminder: {
    label: "Reminder",
    plural: "Reminders",
    icon: Bell,
    tone: "bg-pink-100 text-pink-700 border-pink-200",
    iconTone: "bg-pink-50 text-pink-700 border-pink-100",
    bar: "bg-pink-500",
    restoreNote: "Brings this reminder back to your reminders list.",
  },
  notification: {
    label: "Notification",
    plural: "Notifications",
    icon: Bell,
    tone: "bg-teal-100 text-teal-700 border-teal-200",
    iconTone: "bg-teal-50 text-teal-700 border-teal-100",
    bar: "bg-teal-500",
    restoreNote: "Brings this notification back.",
  },
  payment: {
    label: "Payment",
    plural: "Payments",
    icon: Wallet,
    tone: "bg-emerald-100 text-emerald-700 border-emerald-200",
    iconTone: "bg-emerald-50 text-emerald-700 border-emerald-100",
    bar: "bg-emerald-500",
    restoreNote: "Puts this payment record back in your payment history.",
  },
  item: {
    label: "Item",
    plural: "Items",
    icon: Package,
    tone: "bg-orange-100 text-orange-700 border-orange-200",
    iconTone: "bg-orange-50 text-orange-700 border-orange-100",
    bar: "bg-orange-500",
    restoreNote: "Puts this item back in your item list.",
  },
}

const FALLBACK_META = {
  label: "Record",
  plural: "Records",
  icon: ReceiptText,
  tone: "bg-slate-100 text-slate-700 border-slate-200",
  iconTone: "bg-slate-50 text-slate-600 border-slate-100",
  bar: "bg-slate-400",
  restoreNote: "Puts this record back where it was.",
}

function getMeta(type) {
  const meta = TYPE_META[type]
  if (meta) return meta
  return {
    ...FALLBACK_META,
    label: type ? String(type).replace(/_/g, " ") : FALLBACK_META.label,
  }
}

const PRESETS = [
  { mode: "today", label: "Today" },
  { mode: "yesterday", label: "Yesterday" },
  { mode: "week", label: "Last 7 days" },
  { mode: "month", label: "This month" },
]

const SORTS = [
  { value: "newest", label: "Recently deleted" },
  { value: "oldest", label: "Oldest deleted" },
  { value: "name_az", label: "Name (A to Z)" },
  { value: "name_za", label: "Name (Z to A)" },
  { value: "type", label: "Record type" },
]

const DAY_MS = 24 * 60 * 60 * 1000

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

// Local YYYY-MM-DD of a timestamp
function localDateOf(value) {
  const t = new Date(value).getTime()
  if (!Number.isFinite(t)) return ""
  const date = new Date(t)
  return new Date(t - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

// Show a YYYY-MM-DD string as "18 Nov 2026" without timezone shifts
function formatYmd(value) {
  if (!value) return "—"
  const [y, m, d] = String(value).split("-").map(Number)
  if (!y || !m || !d) return "—"
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function toTime(value) {
  const t = new Date(value).getTime()
  return Number.isFinite(t) ? t : 0
}

function formatDeletedAt(value) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatDay(value) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function timeAgo(value) {
  const t = toTime(value)
  if (!t) return ""

  const minutes = Math.floor((Date.now() - t) / 60000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`

  const years = Math.floor(days / 365)
  return `${years} ${years === 1 ? "year" : "years"} ago`
}

function isSameLocalDay(value) {
  const t = toTime(value)
  if (!t) return false
  return new Date(t).toDateString() === new Date().toDateString()
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

function csvCell(value) {
  const text = String(value ?? "")
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// What gets removed for good, per record type (shown in the delete dialog)
const DELETE_NOTES = {
  customer: [
    "Customer profile and photo",
    "Ledger, payments and advances saved with it",
    "Bills and bill items saved with it",
  ],
  bill: ["The bill and its saved items", "Payments and advances linked to this bill"],
  khata_entry: ["This khata entry from the customer's ledger"],
  reminder: ["This reminder"],
  notification: ["This notification"],
  payment: ["This payment record"],
  item: ["This item and its saved details"],
}

// Live tables we can look up when the recovery copy has no details
const TABLE_BY_TYPE = {
  customer: "customers",
  bill: "bills",
  payment: "payments",
  item: "items",
}

/* ---------- Snapshot / profile helpers ---------- */

const SNAPSHOT_KEYS = [
  "payload",
  "snapshot",
  "data",
  "record",
  "entity_data",
  "backup",
  "deleted_data",
  "row_data",
  "original_data",
  "metadata",
  "meta",
]

function toObject(value) {
  if (!value) return null
  if (typeof value === "object" && !Array.isArray(value)) return value
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  return null
}

// Reads the saved recovery copy (if the trash row has one) and finds the main record in it
function parseSnapshot(row) {
  let raw = null
  for (const key of SNAPSHOT_KEYS) {
    const obj = toObject(row?.[key])
    if (obj) {
      raw = obj
      break
    }
  }
  if (!raw) return { record: null, related: [] }

  let record =
    toObject(raw[row.entity_type]) ||
    toObject(raw.record) ||
    toObject(raw.entity) ||
    toObject(raw.row)

  if (!record) {
    if (raw.name || raw.mobile || raw.bill_number || raw.id) record = raw
    else record = Object.values(raw).map(toObject).find(Boolean) || null
  }

  const related = Object.entries(raw)
    .filter(([, value]) => Array.isArray(value) && value.length > 0)
    .map(([key, value]) => ({ key, label: humanize(key), count: value.length }))

  return { record, related }
}

function pickPhoto(record) {
  if (!record) return null
  return record.photo_url || record.photo || record.avatar_url || record.image_url || null
}

function humanize(key) {
  const text = String(key).replace(/_/g, " ").trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const HIDDEN_FIELDS = new Set([
  "id",
  "shop_id",
  "user_id",
  "owner_id",
  "created_by",
  "updated_by",
  "photo_url",
  "photo",
  "avatar_url",
  "image_url",
  "name",
  "title",
  "deleted_at",
  "updated_at",
  "is_deleted",
  "entity_type",
  "entity_id",
  "customer_id",
])

const FIELD_ORDER = [
  "mobile",
  "phone",
  "alternate_mobile",
  "email",
  "address",
  "city",
  "state",
  "pincode",
  "gstin",
  "opening_balance",
  "balance",
  "credit_limit",
  "notes",
  "is_active",
  "created_at",
]

const FIELD_LABELS = {
  mobile: "Mobile",
  phone: "Phone",
  alternate_mobile: "Alternate mobile",
  email: "Email",
  gstin: "GSTIN",
  opening_balance: "Opening balance",
  credit_limit: "Credit limit",
  is_active: "Active",
  created_at: "Added on",
  bill_number: "Bill number",
  bill_date: "Bill date",
  amount_due: "Amount due",
  amount_paid: "Amount paid",
  total_amount: "Total amount",
  grand_total: "Grand total",
  payment_mode: "Payment mode",
  payment_date: "Payment date",
}

const MONEY_FIELD = /(amount|balance|limit|due|total|price|paid)/i

function formatFieldValue(key, value) {
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (/(_at|_date)$/.test(key) || key === "date") return formatDay(value)
  if (MONEY_FIELD.test(key) && Number.isFinite(Number(value))) return formatCurrency(value)
  return String(value)
}

// Turns a record into a tidy list of "label: value" fields
function buildFields(record) {
  if (!record) return []

  const orderOf = (key) => {
    const i = FIELD_ORDER.indexOf(key)
    return i === -1 ? FIELD_ORDER.length : i
  }

  return Object.entries(record)
    .filter(
      ([key, value]) =>
        !HIDDEN_FIELDS.has(key) &&
        value !== null &&
        value !== undefined &&
        value !== "" &&
        typeof value !== "object"
    )
    .sort((a, b) => orderOf(a[0]) - orderOf(b[0]))
    .map(([key, value]) => {
      const text = formatFieldValue(key, value)
      return {
        key,
        label: FIELD_LABELS[key] || humanize(key),
        value: text,
        wide: key === "address" || key === "notes" || text.length > 36,
      }
    })
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

/* ==================================================
   SMALL UI PIECES
================================================== */

function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />
}

function TrashSkeleton() {
  return (
    <div
      className="min-h-full w-full space-y-4 rounded-2xl bg-[#f7f5ff] px-3 py-5 sm:px-5 lg:px-6"
      aria-busy="true"
      aria-label="Loading Trash"
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

function TypePill({ type }) {
  const meta = getMeta(type)

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1.5 text-[10px] font-bold ${meta.tone}`}
    >
      {meta.label}
    </span>
  )
}

function TypeIcon({ type, className = "h-10 w-10" }) {
  const meta = getMeta(type)
  const Icon = meta.icon

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-xl border ${meta.iconTone} ${className}`}
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
    </div>
  )
}

// Customer photo (or initials) for customer records, type icon for everything else
function RecordAvatar({ type, name, photo, className = "h-10 w-10", textClass = "text-xs" }) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [photo])

  if (type !== "customer") return <TypeIcon type={type} className={className} />

  if (photo && !failed) {
    return (
      <img
        src={photo}
        alt={`${name || "Customer"} profile`}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full border border-white object-cover shadow-sm ${className}`}
      />
    )
  }

  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700 ${textClass} ${className}`}
    >
      {getInitials(name)}
    </div>
  )
}

function RowCheckbox({ checked, onChange, label, indeterminate = false }) {
  const ref = useRef(null)

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-emerald-600"
    />
  )
}

const outlineBtn =
  "rounded-xl border-violet-200 bg-white/90 text-slate-700 shadow-sm hover:bg-violet-50 disabled:opacity-50"

/* ==================================================
   TRASH PAGE
================================================== */

export default function Trash() {
  const { currentShop } = useShop()
  const shopId = currentShop?.id

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [lastUpdated, setLastUpdated] = useState(null)

  const [busyId, setBusyId] = useState("") // row id, "bulk" or "all"
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 })

  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  // Default view is "Overall" (all time). The person can pick a preset or custom dates.
  const [period, setPeriod] = useState({ mode: "overall", from: "", to: "" })
  const [periodOpen, setPeriodOpen] = useState(false)
  const periodRef = useRef(null)
  const [sort, setSort] = useState("newest")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [detailRow, setDetailRow] = useState(null)
  const [pendingAction, setPendingAction] = useState(null) // { type: "delete-one" | "delete-selected" | "empty", row? }
  const [emptyConfirmText, setEmptyConfirmText] = useState("")
  const [deleteAck, setDeleteAck] = useState(false)
  const [customerMap, setCustomerMap] = useState({}) // live customer profiles by id
  const [detail, setDetail] = useState(null) // { record, customer, related, loading }

  const hasLoaded = useRef(false)
  const trashRequest = useRef(0) // stops an older, slower request from overwriting newer data
  const customerMapRef = useRef({})
  const triedCustomers = useRef(new Set())
  customerMapRef.current = customerMap

  // Reset everything when the shop changes
  useEffect(() => {
    hasLoaded.current = false
    setRows([])
    setCustomerMap({})
    triedCustomers.current = new Set()
    setSelectedIds(new Set())
    setQuery("")
    setTypeFilter("all")
    setPeriod({ mode: "overall", from: "", to: "" })
    setPeriodOpen(false)
    setPage(1)
    setLoadError("")
  }, [shopId])

  const today = getLocalDateString()

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

  /* --------------------------------------------------
     LOAD DATA
  -------------------------------------------------- */

  const loadTrash = useCallback(
    async (showRefresh = false) => {
      const requestId = ++trashRequest.current

      if (!shopId) {
        setRows([])
        setLoading(false)
        return
      }

      // Full skeleton only on first load; later loads just spin the refresh icon
      if (showRefresh || hasLoaded.current) setRefreshing(true)
      else setLoading(true)

      setLoadError("")

      try {
        const data = await fetchAllRows(() =>
          supabase
            .from("trash_items")
            .select("*")
            .eq("shop_id", shopId)
            .order("deleted_at", { ascending: false })
            .order("id")
        )

        // A newer request has started: ignore this result
        if (requestId !== trashRequest.current) return

        setRows(data)
        setLastUpdated(new Date())
        hasLoaded.current = true
      } catch (error) {
        if (requestId !== trashRequest.current) return
        console.error("Trash load failed:", error)
        const message = error?.message || "Unable to load Trash."
        setLoadError(message)
        toast.error("Could not load Trash", { description: message })
      } finally {
        if (requestId === trashRequest.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [shopId]
  )

  useEffect(() => {
    loadTrash()
  }, [loadTrash])

  // Fetch the live profile (photo, mobile, address...) of every customer in Trash
  useEffect(() => {
    if (!shopId) return

    const ids = Array.from(
      new Set(
        rows
          .filter(
            (row) =>
              row.entity_type === "customer" &&
              row.entity_id &&
              !triedCustomers.current.has(row.entity_id)
          )
          .map((row) => row.entity_id)
      )
    )
    if (ids.length === 0) return

    ids.forEach((id) => triedCustomers.current.add(id))
    let ignore = false

    ;(async () => {
      const found = {}
      try {
        for (let i = 0; i < ids.length; i += 100) {
          const { data } = await supabase
            .from("customers")
            .select("*")
            .eq("shop_id", shopId)
            .in("id", ids.slice(i, i + 100))
          ;(data || []).forEach((customer) => {
            found[customer.id] = customer
          })
        }
      } catch (error) {
        console.error("Customer profiles load failed:", error)
      }

      if (!ignore && Object.keys(found).length) {
        setCustomerMap((current) => ({ ...current, ...found }))
      }
    })()

    return () => {
      ignore = true
    }
  }, [rows, shopId])

  // Load the full profile / record when the Details dialog opens
  useEffect(() => {
    if (!detailRow) {
      setDetail(null)
      return
    }

    let ignore = false
    const { record: snapRecord, related } = parseSnapshot(detailRow)
    setDetail({ record: snapRecord, customer: null, related, loading: true })

    async function fetchOne(table, id) {
      if (!table || !id || !shopId) return null
      try {
        const { data } = await supabase
          .from(table)
          .select("*")
          .eq("id", id)
          .eq("shop_id", shopId)
          .maybeSingle()
        return data || null
      } catch {
        return null
      }
    }

    async function run() {
      let record = snapRecord
      let customer = null

      if (detailRow.entity_type === "customer") {
        const live =
          customerMapRef.current[detailRow.entity_id] ||
          (await fetchOne("customers", detailRow.entity_id))
        record = { ...(live || {}), ...(snapRecord || {}) }
        if (!Object.keys(record).length) record = null
        customer = record
      } else {
        if (!record) record = await fetchOne(TABLE_BY_TYPE[detailRow.entity_type], detailRow.entity_id)
        const customerId = record?.customer_id
        if (customerId) {
          customer =
            customerMapRef.current[customerId] || (await fetchOne("customers", customerId))
        }
      }

      if (!ignore) setDetail({ record, customer, related, loading: false })
    }

    run()

    return () => {
      ignore = true
    }
  }, [detailRow, shopId])

  // Every time a delete dialog opens the acknowledgement starts unchecked
  useEffect(() => {
    setDeleteAck(false)
  }, [pendingAction])

  /* --------------------------------------------------
     DERIVED DATA
  -------------------------------------------------- */

  const stats = useMemo(() => {
    const byType = new Map()
    let today = 0
    let week = 0
    let oldest = 0

    const now = Date.now()

    rows.forEach((row) => {
      byType.set(row.entity_type, (byType.get(row.entity_type) || 0) + 1)

      const t = toTime(row.deleted_at)
      if (isSameLocalDay(row.deleted_at)) today += 1
      if (t && now - t <= 7 * DAY_MS) week += 1
      if (t && (!oldest || t < oldest)) oldest = t
    })

    const types = Array.from(byType.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)

    return {
      total: rows.length,
      today,
      week,
      oldest,
      types,
      customers: byType.get("customer") || 0,
      bills: byType.get("bill") || 0,
      khata: byType.get("khata_entry") || 0,
    }
  }, [rows])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()

    const list = rows.filter((row) => {
      if (typeFilter !== "all" && row.entity_type !== typeFilter) return false

      if (range.from || range.to) {
        const day = localDateOf(row.deleted_at)
        if (!day) return false
        if (range.from && day < range.from) return false
        if (range.to && day > range.to) return false
      }

      if (!term) return true

      const text = [
        row.title,
        row.subtitle,
        getMeta(row.entity_type).label,
        row.entity_type,
        formatDay(row.deleted_at),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return text.includes(term)
    })

    const byName = (a, b) =>
      String(a.title || "").localeCompare(String(b.title || ""), undefined, {
        sensitivity: "base",
      })

    return list.sort((a, b) => {
      if (sort === "oldest") return toTime(a.deleted_at) - toTime(b.deleted_at)
      if (sort === "name_az") return byName(a, b)
      if (sort === "name_za") return byName(b, a)
      if (sort === "type") {
        return (
          getMeta(a.entity_type).label.localeCompare(getMeta(b.entity_type).label) ||
          byName(a, b)
        )
      }
      return toTime(b.deleted_at) - toTime(a.deleted_at)
    })
  }, [rows, query, typeFilter, range.from, range.to, sort])

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

  const hasActiveFilters =
    typeFilter !== "all" || period.mode !== "overall" || query.trim() !== ""

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
          ? formatYmd(range.from)
          : `${formatYmd(range.from)} – ${formatYmd(range.to)}`
      }
      if (range.from) return `From ${formatYmd(range.from)}`
      if (range.to) return `Up to ${formatYmd(range.to)}`
      return "All dates"
    }
    if (period.mode === "today") return `Today, ${formatYmd(today)}`
    return shortLabel
  })()

  // Only rows that are still visible can stay selected
  const selectedRows = useMemo(
    () => filtered.filter((row) => selectedIds.has(row.id)),
    [filtered, selectedIds]
  )
  const selectedCount = selectedRows.length
  const pageSelectedCount = pageRows.filter((row) => selectedIds.has(row.id)).length
  const allPageSelected = pageRows.length > 0 && pageSelectedCount === pageRows.length

  const busy = Boolean(busyId)

  // Customer photo for each customer row (from the saved copy first, then the live profile)
  const rowPhotos = useMemo(() => {
    const map = {}
    rows.forEach((row) => {
      if (row.entity_type !== "customer") return
      map[row.id] =
        pickPhoto(parseSnapshot(row).record) ||
        row.photo_url ||
        pickPhoto(customerMap[row.entity_id]) ||
        null
    })
    return map
  }, [rows, customerMap])

  const typeChips = useMemo(() => {
    const chips = stats.types.map(({ type, count }) => ({
      value: type,
      label: getMeta(type).plural,
      count,
    }))
    return [{ value: "all", label: "All records", count: stats.total }, ...chips]
  }, [stats])

  /* --------------------------------------------------
     SELECTION
  -------------------------------------------------- */

  function toggleRow(id) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function togglePage() {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (allPageSelected) pageRows.forEach((row) => next.delete(row.id))
      else pageRows.forEach((row) => next.add(row.id))
      return next
    })
  }

  function selectAllFiltered() {
    setSelectedIds(new Set(filtered.map((row) => row.id)))
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  function removeFromSelection(ids) {
    setSelectedIds((current) => {
      const next = new Set(current)
      ids.forEach((id) => next.delete(id))
      return next
    })
  }

  /* --------------------------------------------------
     FILTER HELPERS
  -------------------------------------------------- */

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
    setPeriod({ mode: "overall", from: "", to: "" })
    setQuery("")
    setPage(1)
  }

  const handleRefresh = () => loadTrash(true)

  // Download the currently filtered list as a CSV (opens in Excel / Sheets)
  const exportCsv = () => {
    if (filtered.length === 0) return

    const header = ["Type", "Name", "Details", "Deleted on", "Record ID"]

    const lines = filtered.map((row) =>
      [
        getMeta(row.entity_type).label,
        row.title || "",
        row.subtitle || "",
        formatDeletedAt(row.deleted_at),
        row.entity_id || row.id,
      ]
        .map(csvCell)
        .join(",")
    )

    const csv = "\uFEFF" + [header.map(csvCell).join(","), ...lines].join("\r\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `trash-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)

    toast.success("Trash exported", {
      description: `${filtered.length} ${filtered.length === 1 ? "record" : "records"} saved as CSV`,
    })
  }

  /* --------------------------------------------------
     ACTIONS: RESTORE
  -------------------------------------------------- */

  async function handleRestore(row) {
    if (busy) return

    setBusyId(row.id)

    try {
      await restoreFromTrash(row.id)

      setRows((current) => current.filter((item) => item.id !== row.id))
      removeFromSelection([row.id])
      setDetailRow((current) => (current?.id === row.id ? null : current))

      const meta = getMeta(row.entity_type)
      toast.success(`${meta.label} restored`, {
        description: row.title ? `"${row.title}" is back in your workspace.` : undefined,
      })
    } catch (error) {
      toast.error("Could not restore record", { description: error?.message })
    } finally {
      setBusyId("")
    }
  }

  async function runBulk(kind) {
    const targets = selectedRows
    if (!targets.length || busy) return

    setBusyId("bulk")
    setBulkProgress({ done: 0, total: targets.length })

    const doneIds = []
    let failed = 0
    let firstError = ""

    for (const row of targets) {
      try {
        if (kind === "restore") await restoreFromTrash(row.id)
        else await permanentlyDeleteTrashItem(row.id)
        doneIds.push(row.id)
      } catch (error) {
        failed += 1
        if (!firstError) firstError = error?.message || ""
      }
      setBulkProgress((current) => ({ ...current, done: current.done + 1 }))
    }

    if (doneIds.length) {
      const doneSet = new Set(doneIds)
      setRows((current) => current.filter((item) => !doneSet.has(item.id)))
      removeFromSelection(doneIds)
    }

    const verb = kind === "restore" ? "restored" : "permanently deleted"

    if (doneIds.length) {
      toast.success(
        `${doneIds.length} ${doneIds.length === 1 ? "record" : "records"} ${verb}`
      )
    }
    if (failed) {
      toast.error(`${failed} ${failed === 1 ? "record" : "records"} could not be processed`, {
        description: firstError || "Please try again.",
      })
    }

    setPendingAction(null)
    setBulkProgress({ done: 0, total: 0 })
    setBusyId("")
  }

  /* --------------------------------------------------
     ACTIONS: DELETE FOREVER
  -------------------------------------------------- */

  async function confirmDeleteOne() {
    const row = pendingAction?.row
    if (!row || busy) return

    setBusyId(row.id)

    try {
      await permanentlyDeleteTrashItem(row.id)

      setRows((current) => current.filter((item) => item.id !== row.id))
      removeFromSelection([row.id])
      setDetailRow((current) => (current?.id === row.id ? null : current))
      setPendingAction(null)

      toast.success("Permanently deleted", {
        description: row.title ? `"${row.title}" was removed for good.` : undefined,
      })
    } catch (error) {
      toast.error("Could not permanently delete", { description: error?.message })
    } finally {
      setBusyId("")
    }
  }

  async function confirmEmptyTrash() {
    if (!rows.length || busy || emptyConfirmText.trim().toUpperCase() !== "DELETE") return

    setBusyId("all")

    try {
      await emptyTrash(shopId)

      setRows([])
      setSelectedIds(new Set())
      setPendingAction(null)
      setEmptyConfirmText("")
      toast.success("Trash emptied")
    } catch (error) {
      toast.error("Could not empty Trash", { description: error?.message })
    } finally {
      setBusyId("")
    }
  }

  function closePending(open) {
    if (open || busy) return
    setPendingAction(null)
    setEmptyConfirmText("")
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
            Select or create a workspace to view its Trash.
          </p>
        </div>
      </div>
    )
  }

  if (loading) return <TrashSkeleton />

  const pendingRow = pendingAction?.type === "delete-one" ? pendingAction.row : null
  const detailMeta = detailRow ? getMeta(detailRow.entity_type) : null

  const profileOf = (row) => {
    const record = parseSnapshot(row).record
    const live = customerMap[row.entity_id]
    return {
      photo: rowPhotos[row.id] || null,
      mobile: record?.mobile || live?.mobile || "",
    }
  }

  const detailCustomer = detailRow?.entity_type === "customer" ? detail?.record : detail?.customer
  const detailName =
    detailRow?.entity_type === "customer"
      ? detail?.record?.name || detailRow.title
      : detailRow?.title
  const detailFields = buildFields(detail?.record)
  const pendingMeta = pendingRow ? getMeta(pendingRow.entity_type) : null
  const pendingProfile = pendingRow ? profileOf(pendingRow) : null
  const pendingRelated = pendingRow ? parseSnapshot(pendingRow).related : []
  const deleteTargets = pendingAction?.type === "delete-selected" ? selectedRows : []
  const deleteTypeCounts = Array.from(
    deleteTargets.reduce((map, row) => {
      map.set(row.entity_type, (map.get(row.entity_type) || 0) + 1)
      return map
    }, new Map())
  )

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
            <span>Trash</span>
          </nav>

          <h1 className="mt-1 text-[29px] font-bold tracking-tight text-[#171a39] sm:text-[32px]">
            Trash
          </h1>

          <p className="mt-0.5 text-sm text-slate-600">
            Showing records deleted{" "}
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
                      Shows records deleted in this period.
                    </p>

                    <Button
                      type="button"
                      onClick={() => setPeriodOpen(false)}
                      className="mt-3 h-11 w-full gap-2 rounded-xl border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-violet-50"
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
            disabled={refreshing || busy}
            aria-label="Refresh Trash"
            title="Refresh Trash"
            className={`h-11 gap-2 px-4 text-sm font-medium ${outlineBtn}`}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>

          <Button
            type="button"
            onClick={() => {
              setEmptyConfirmText("")
              setPendingAction({ type: "empty" })
            }}
            disabled={rows.length === 0 || busy}
            className="h-11 gap-2 rounded-xl bg-rose-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Empty Trash
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
              Could not load your latest Trash. Check your connection and try again.
              <span className="ml-1 text-xs text-rose-500">({loadError})</span>
            </span>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => loadTrash()}
            className={`h-9 shrink-0 gap-1.5 px-3 text-xs font-medium ${outlineBtn}`}
          >
            Try again
          </Button>
        </div>
      )}

      {/* SUMMARY CARDS */}

      <section
        aria-label="Trash overview"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4"
      >
        <SummaryCard
          label="Total in Trash"
          value={stats.total.toLocaleString("en-IN")}
          detail={
            stats.oldest
              ? `Oldest deleted ${timeAgo(stats.oldest)}`
              : "Nothing waiting here"
          }
          icon={Trash2}
          tone="pink"
        />

        <SummaryCard
          label="Deleted today"
          value={stats.today.toLocaleString("en-IN")}
          detail={`${stats.week} in the last 7 days`}
          icon={Clock3}
          tone="amber"
        />

        <SummaryCard
          label="Customers in Trash"
          value={stats.customers.toLocaleString("en-IN")}
          detail={
            stats.customers > 0
              ? "Restore brings back their records too"
              : "No deleted customers"
          }
          icon={Users}
          tone="blue"
        />

        <SummaryCard
          label="Bills in Trash"
          value={stats.bills.toLocaleString("en-IN")}
          detail={`${stats.khata} khata ${stats.khata === 1 ? "entry" : "entries"} also deleted`}
          icon={FileText}
          tone="green"
        />
      </section>

      {/* MAIN CONTENT */}

      <section className="grid grid-cols-1 items-start gap-4 2xl:grid-cols-[1.65fr_1fr]">
        <div className="min-w-0 space-y-4">
          <Card className="overflow-hidden rounded-[20px] border border-white/80 bg-white/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)] backdrop-blur-sm">
            <SectionHeader
              icon={ArchiveRestore}
              title="Deleted records"
              description={
                hasActiveFilters
                  ? `${filtered.length} of ${rows.length} records match`
                  : `${rows.length} ${rows.length === 1 ? "record" : "records"} in Trash`
              }
              action={
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={exportCsv}
                    disabled={filtered.length === 0}
                    className={`h-9 gap-1.5 px-3 text-xs font-medium ${outlineBtn}`}
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
                      className={`h-9 shrink-0 gap-1.5 px-3 text-xs font-medium ${outlineBtn}`}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      Clear filters
                    </Button>
                  )}
                </div>
              }
            />

            {/* Search, period, sort and type chips */}
            <div className="space-y-3 border-b border-[#eeecf5] px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-2.5 lg:flex-row">
                <div className="relative flex-1">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <Input
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value)
                      setPage(1)
                    }}
                    aria-label="Search deleted records"
                    placeholder="Search by name, number, details or type"
                    className="h-11 rounded-xl border-violet-200 bg-white pl-9 pr-9 shadow-sm focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("")
                        setPage(1)
                      }}
                      aria-label="Clear search"
                      className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="flex">
                  <Select
                    value={sort}
                    onValueChange={(value) => {
                      setSort(value)
                      setPage(1)
                    }}
                  >
                    <SelectTrigger
                      aria-label="Sort deleted records"
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
                aria-label="Filter by record type"
              >
                {typeChips.map((item) => {
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
                        {item.count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Bulk action bar */}
            {selectedCount > 0 && (
              <div className="flex flex-col gap-3 border-b border-emerald-100 bg-emerald-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-emerald-900">
                  <span className="font-bold">
                    {selectedCount} selected
                  </span>
                  {selectedCount < filtered.length && (
                    <button
                      type="button"
                      onClick={selectAllFiltered}
                      className="font-semibold text-emerald-700 underline-offset-2 hover:underline"
                    >
                      Select all {filtered.length}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="font-semibold text-slate-600 underline-offset-2 hover:underline"
                  >
                    Clear selection
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {busyId === "bulk" && (
                    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {bulkProgress.done} of {bulkProgress.total}
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => runBulk("restore")}
                    disabled={busy}
                    className={`h-9 gap-1.5 px-3 text-xs font-semibold ${outlineBtn}`}
                  >
                    <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
                    Restore selected
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setPendingAction({ type: "delete-selected" })}
                    disabled={busy}
                    className="h-9 gap-1.5 rounded-xl bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Delete forever
                  </Button>
                </div>
              </div>
            )}

            {/* List body */}
            {filtered.length === 0 ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center px-5 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
                  {rows.length === 0 ? (
                    <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
                  ) : (
                    <Search className="h-7 w-7" aria-hidden="true" />
                  )}
                </div>
                <h3 className="mt-4 text-sm font-bold text-slate-900">
                  {rows.length === 0 ? "Trash is empty" : "No matching records"}
                </h3>
                <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
                  {rows.length === 0
                    ? "Records you delete from other pages will show up here, so you can restore them later."
                    : "Try another filter or change your search."}
                </p>
                {rows.length > 0 && (
                  <Button
                    type="button"
                    onClick={clearFilters}
                    className={`mt-4 h-11 gap-2 px-4 text-sm font-medium ${outlineBtn}`}
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
                  <table className="w-full min-w-[820px] text-left">
                    <caption className="sr-only">Deleted records</caption>
                    <thead>
                      <tr className="bg-[#f5f3fc] text-[11px] font-semibold text-slate-600">
                        <th scope="col" className="w-10 rounded-l-xl px-3 py-3">
                          <RowCheckbox
                            checked={allPageSelected}
                            indeterminate={pageSelectedCount > 0 && !allPageSelected}
                            onChange={togglePage}
                            label="Select all records on this page"
                          />
                        </th>
                        <th scope="col" className="px-3 py-3">Record</th>
                        <th scope="col" className="px-3 py-3">Type</th>
                        <th scope="col" className="px-3 py-3">Deleted</th>
                        <th scope="col" className="rounded-r-xl px-3 py-3 text-center">Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {pageRows.map((row) => {
                        const rowBusy = busyId === row.id
                        const checked = selectedIds.has(row.id)

                        return (
                          <tr
                            key={row.id}
                            className={`border-b border-[#eeecf5] transition-colors last:border-0 ${
                              checked ? "bg-emerald-50/40" : "hover:bg-[#f9f8ff]"
                            }`}
                          >
                            <td className="px-3 py-3">
                              <RowCheckbox
                                checked={checked}
                                onChange={() => toggleRow(row.id)}
                                label={`Select ${row.title || "record"}`}
                              />
                            </td>

                            <td className="px-3 py-3">
                              <div className="flex min-w-0 items-center gap-3">
                                <RecordAvatar type={row.entity_type} name={row.title} photo={rowPhotos[row.id]} className="h-10 w-10" />
                                <div className="min-w-0">
                                  <p className="max-w-[260px] truncate text-[13px] font-bold text-slate-800">
                                    {row.title || "Untitled record"}
                                  </p>
                                  <p className="mt-0.5 max-w-[260px] truncate text-[11px] text-slate-500">
                                    {row.subtitle || "Deleted record"}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="px-3 py-3">
                              <TypePill type={row.entity_type} />
                            </td>

                            <td className="whitespace-nowrap px-3 py-3">
                              <p className="text-xs font-medium text-slate-700">
                                {formatDay(row.deleted_at)}
                              </p>
                              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                                <Clock3 className="h-3 w-3" aria-hidden="true" />
                                {timeAgo(row.deleted_at) || "—"}
                              </p>
                            </td>

                            <td className="px-3 py-3">
                              <div className="flex items-center justify-center gap-1.5">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  aria-label={`View details of ${row.title || "record"}`}
                                  title="View details"
                                  onClick={() => setDetailRow(row)}
                                  disabled={busy}
                                  className={`h-9 w-9 ${outlineBtn}`}
                                >
                                  <Eye className="h-4 w-4" aria-hidden="true" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => handleRestore(row)}
                                  disabled={busy}
                                  className={`h-9 gap-1.5 px-3 text-xs font-semibold ${outlineBtn}`}
                                >
                                  {rowBusy ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
                                  )}
                                  {rowBusy ? "Working…" : "Restore"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  aria-label={`Delete ${row.title || "record"} forever`}
                                  title="Delete forever"
                                  onClick={() => setPendingAction({ type: "delete-one", row })}
                                  disabled={busy}
                                  className="h-9 w-9 rounded-xl border-rose-200 bg-white text-rose-600 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
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
                  <div className="flex items-center gap-2.5 bg-[#faf9ff] px-4 py-2.5">
                    <RowCheckbox
                      checked={allPageSelected}
                      indeterminate={pageSelectedCount > 0 && !allPageSelected}
                      onChange={togglePage}
                      label="Select all records on this page"
                    />
                    <span className="text-xs font-medium text-slate-600">Select this page</span>
                  </div>

                  {pageRows.map((row) => {
                    const rowBusy = busyId === row.id
                    const checked = selectedIds.has(row.id)

                    return (
                      <div
                        key={row.id}
                        className={`space-y-3 p-4 ${checked ? "bg-emerald-50/40" : ""}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="pt-2.5">
                            <RowCheckbox
                              checked={checked}
                              onChange={() => toggleRow(row.id)}
                              label={`Select ${row.title || "record"}`}
                            />
                          </div>
                          <RecordAvatar type={row.entity_type} name={row.title} photo={rowPhotos[row.id]} className="h-10 w-10" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-800">
                              {row.title || "Untitled record"}
                            </p>
                            <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                              {row.subtitle || "Deleted record"}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <TypePill type={row.entity_type} />
                              <span className="flex items-center gap-1 text-[11px] text-slate-500">
                                <Clock3 className="h-3 w-3" aria-hidden="true" />
                                {timeAgo(row.deleted_at) || formatDay(row.deleted_at)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleRestore(row)}
                            disabled={busy}
                            className={`h-10 flex-1 gap-1.5 text-sm font-medium ${outlineBtn}`}
                          >
                            {rowBusy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                            )}
                            {rowBusy ? "Working…" : "Restore"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`View details of ${row.title || "record"}`}
                            onClick={() => setDetailRow(row)}
                            disabled={busy}
                            className={`h-10 w-10 ${outlineBtn}`}
                          >
                            <Eye className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setPendingAction({ type: "delete-one", row })}
                            disabled={busy}
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
                    aria-label="Trash pages"
                    className="flex flex-wrap items-center justify-end gap-1.5"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Previous page"
                      disabled={currentPage <= 1}
                      onClick={() => setPage(Math.max(1, currentPage - 1))}
                      className={`h-9 w-9 p-0 disabled:opacity-40 ${outlineBtn}`}
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
                      className={`h-9 w-9 p-0 disabled:opacity-40 ${outlineBtn}`}
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
          {/* BY TYPE */}

          <Card className="overflow-hidden rounded-[20px] border border-white/80 bg-white/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)]">
            <SectionHeader
              icon={ReceiptText}
              title="By record type"
              description="What is sitting in Trash"
            />

            <CardContent className="space-y-4 p-4 sm:p-5">
              {stats.types.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-500">Trash is empty.</p>
              ) : (
                stats.types.map(({ type, count }) => {
                  const meta = getMeta(type)
                  const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0
                  const active = typeFilter === type

                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setTypeFilter(active ? "all" : type)
                        setPage(1)
                      }}
                      title={active ? "Show all records" : `Show only ${meta.plural.toLowerCase()}`}
                      className="block w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                    >
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span
                          className={`min-w-0 truncate font-medium ${
                            active ? "text-emerald-800" : "text-slate-700"
                          }`}
                        >
                          {meta.plural}
                        </span>
                        <span className="shrink-0 font-bold tabular-nums text-slate-900">
                          {count}
                          <span className="ml-1.5 font-semibold text-slate-400">{pct}%</span>
                        </span>
                      </div>
                      <div
                        className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"
                        role="progressbar"
                        aria-label={`${meta.plural} share of Trash`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={pct}
                      >
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${meta.bar}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </button>
                  )
                })
              )}
            </CardContent>
          </Card>

          {/* RECENTLY DELETED */}

          <Card className="overflow-hidden rounded-[20px] border border-white/80 bg-white/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)]">
            <SectionHeader
              icon={Clock3}
              title="Recently deleted"
              description="Quick restore for the latest records"
            />

            {rows.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-slate-500">
                Nothing deleted yet.
              </div>
            ) : (
              <ul className="divide-y divide-[#eeecf5]">
                {[...rows]
                  .sort((a, b) => toTime(b.deleted_at) - toTime(a.deleted_at))
                  .slice(0, 5)
                  .map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-3 px-5 py-3.5"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <RecordAvatar type={row.entity_type} name={row.title} photo={rowPhotos[row.id]} className="h-9 w-9" />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-bold text-slate-800">
                            {row.title || "Untitled record"}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {getMeta(row.entity_type).label} · {timeAgo(row.deleted_at)}
                          </p>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleRestore(row)}
                        disabled={busy}
                        className={`h-8 shrink-0 gap-1 px-2.5 text-[11px] font-semibold ${outlineBtn}`}
                      >
                        {busyId === row.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <ArchiveRestore className="h-3 w-3" aria-hidden="true" />
                        )}
                        Restore
                      </Button>
                    </li>
                  ))}
              </ul>
            )}
          </Card>

          {/* HOW TRASH WORKS */}

          <div className="flex items-start gap-2.5 rounded-[20px] border border-amber-200 bg-amber-50/70 p-4 text-xs leading-5 text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-bold">How Trash works</p>
              <p className="mt-1">
                Restoring a customer or bill also restores its saved ledger, payment, advance and
                bill-item records. Deleting forever removes the saved recovery copy and cannot be
                undone.
              </p>
            </div>
          </div>
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

      {/* DETAILS DIALOG */}

      <Dialog open={!!detailRow} onOpenChange={(open) => !open && setDetailRow(null)}>
        <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden rounded-[20px] border-white/80 bg-white p-0 sm:max-w-[680px]">
          {detailRow && detailMeta && (
            <>
              <DialogHeader className="space-y-0 border-b border-[#eeecf5] bg-gradient-to-br from-[#f5f3fc] to-white px-6 pb-5 pt-6 text-left">
                <div className="flex items-center gap-4">
                  <RecordAvatar
                    type={detailRow.entity_type}
                    name={detailName}
                    photo={detailRow.entity_type === "customer" ? pickPhoto(detailCustomer) || rowPhotos[detailRow.id] : null}
                    className="h-20 w-20"
                    textClass="text-2xl"
                  />

                  <div className="min-w-0 flex-1">
                    <DialogTitle className="truncate text-xl font-bold tracking-tight text-[#171a36]">
                      {detailName || "Untitled record"}
                    </DialogTitle>
                    <DialogDescription className="mt-1 text-xs text-slate-500">
                      {detailRow.subtitle || `${detailMeta.label} in Trash`}
                    </DialogDescription>

                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <TypePill type={detailRow.entity_type} />
                      <span className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Clock3 className="h-3 w-3" aria-hidden="true" />
                        Deleted {timeAgo(detailRow.deleted_at)}
                      </span>
                      {detailCustomer?.mobile && detailRow.entity_type === "customer" && (
                        <span className="flex items-center gap-1 text-[11px] font-medium text-slate-600">
                          <Phone className="h-3 w-3" aria-hidden="true" />
                          {detailCustomer.mobile}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
                {/* Profile / record details */}
                <section>
                  <h3 className="mb-2.5 text-sm font-bold text-slate-800">
                    {detailRow.entity_type === "customer" ? "Customer profile" : `${detailMeta.label} details`}
                  </h3>

                  {detail?.loading ? (
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-[58px] rounded-xl" />
                      ))}
                    </div>
                  ) : detailFields.length === 0 ? (
                    <div className="flex items-start gap-2.5 rounded-xl border border-dashed border-violet-200 bg-[#faf9ff] px-4 py-3 text-xs leading-5 text-slate-500">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" aria-hidden="true" />
                      <p>No extra details were saved with this record.</p>
                    </div>
                  ) : (
                    <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {detailFields.map((field) => (
                        <div
                          key={field.key}
                          className={`rounded-xl border border-[#eeecf5] bg-[#faf9ff] px-3.5 py-2.5 ${
                            field.wide ? "sm:col-span-2" : ""
                          }`}
                        >
                          <dt className="text-[11px] font-medium text-slate-500">{field.label}</dt>
                          <dd className="mt-0.5 break-words text-sm font-semibold text-slate-800">
                            {field.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </section>

                {/* Customer card for non-customer records (bills, payments...) */}
                {detailRow.entity_type !== "customer" && detail?.customer && (
                  <section>
                    <h3 className="mb-2.5 text-sm font-bold text-slate-800">Customer</h3>
                    <div className="flex items-center gap-3 rounded-xl border border-[#eeecf5] bg-[#faf9ff] p-3">
                      <RecordAvatar
                        type="customer"
                        name={detail.customer.name}
                        photo={pickPhoto(detail.customer)}
                        className="h-12 w-12"
                        textClass="text-sm"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-800">
                          {detail.customer.name || "Customer"}
                        </p>
                        {detail.customer.mobile && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                            <Phone className="h-3 w-3" aria-hidden="true" />
                            {detail.customer.mobile}
                          </p>
                        )}
                      </div>
                    </div>
                  </section>
                )}

                {/* Saved along with it */}
                {detail?.related?.length > 0 && (
                  <section>
                    <h3 className="mb-2.5 text-sm font-bold text-slate-800">Saved along with it</h3>
                    <div className="flex flex-wrap gap-2">
                      {detail.related.map((item) => (
                        <span
                          key={item.key}
                          className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800"
                        >
                          {item.label}
                          <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] tabular-nums">
                            {item.count}
                          </span>
                        </span>
                      ))}
                    </div>
                  </section>
                )}

                {/* Deletion info */}
                <section>
                  <h3 className="mb-2.5 text-sm font-bold text-slate-800">Deletion info</h3>
                  <dl className="divide-y divide-[#eeecf5] rounded-xl border border-[#eeecf5] text-sm">
                    <div className="flex items-start justify-between gap-4 px-4 py-2.5">
                      <dt className="text-xs font-medium text-slate-500">Deleted on</dt>
                      <dd className="text-right text-xs font-medium text-slate-800">
                        {formatDeletedAt(detailRow.deleted_at)}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-4 px-4 py-2.5">
                      <dt className="text-xs font-medium text-slate-500">Record ID</dt>
                      <dd className="max-w-[300px] break-all text-right font-mono text-[11px] text-slate-600">
                        {detailRow.entity_id || detailRow.id}
                      </dd>
                    </div>
                  </dl>
                </section>

                <div className="flex items-start gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-xs leading-5 text-emerald-900">
                  <ArchiveRestore className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <p>
                    <span className="font-bold">If you restore: </span>
                    {detailMeta.restoreNote}
                  </p>
                </div>
              </div>

              <DialogFooter className="flex-col-reverse gap-2 border-t border-[#eeecf5] bg-white px-6 py-4 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const row = detailRow
                    setDetailRow(null)
                    setPendingAction({ type: "delete-one", row })
                  }}
                  disabled={busy}
                  className="h-11 gap-2 rounded-xl border-rose-200 bg-white px-4 text-sm font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete forever
                </Button>
                <Button
                  type="button"
                  onClick={() => handleRestore(detailRow)}
                  disabled={busy}
                  className="h-11 gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800"
                >
                  {busyId === detailRow.id ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Restoring...
                    </>
                  ) : (
                    <>
                      <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                      Restore
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* DELETE ONE / DELETE SELECTED CONFIRMATION */}

      <Dialog
        open={pendingAction?.type === "delete-one" || pendingAction?.type === "delete-selected"}
        onOpenChange={closePending}
      >
        <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden rounded-[20px] border-rose-100 bg-white p-0 sm:max-w-[560px]">
          <DialogHeader className="space-y-0 border-b border-rose-100 bg-gradient-to-br from-rose-50 to-white px-6 pb-5 pt-6 text-left">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 ring-4 ring-rose-50">
                <ShieldAlert className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-xl font-bold tracking-tight text-[#171a36]">
                  {pendingAction?.type === "delete-selected"
                    ? `Delete ${selectedCount} ${selectedCount === 1 ? "record" : "records"} forever?`
                    : "Delete this record forever?"}
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm leading-6 text-slate-500">
                  This removes the saved recovery copy. You will not be able to restore it
                  after this.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {/* Single record preview */}
            {pendingRow && pendingMeta && (
              <>
                <div className="flex items-center gap-4 rounded-2xl border border-rose-100 bg-rose-50/50 p-4">
                  <RecordAvatar
                    type={pendingRow.entity_type}
                    name={pendingRow.title}
                    photo={pendingProfile?.photo}
                    className="h-16 w-16"
                    textClass="text-lg"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-bold text-slate-900">
                      {pendingRow.title || "Untitled record"}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                      {pendingRow.subtitle || "Deleted record"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <TypePill type={pendingRow.entity_type} />
                      {pendingProfile?.mobile && (
                        <span className="flex items-center gap-1 text-[11px] font-medium text-slate-600">
                          <Phone className="h-3 w-3" aria-hidden="true" />
                          {pendingProfile.mobile}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Clock3 className="h-3 w-3" aria-hidden="true" />
                        Deleted {timeAgo(pendingRow.deleted_at)}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-bold text-slate-700">
                    This will be removed for good
                  </p>
                  <ul className="space-y-1.5">
                    {(DELETE_NOTES[pendingRow.entity_type] || ["This record's saved recovery copy"]).map(
                      (note) => (
                        <li key={note} className="flex items-start gap-2 text-xs text-slate-600">
                          <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" aria-hidden="true" />
                          {note}
                        </li>
                      )
                    )}
                  </ul>

                  {pendingRelated.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {pendingRelated.map((item) => (
                        <span
                          key={item.key}
                          className="inline-flex items-center gap-1 rounded-full border border-rose-100 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700"
                        >
                          {item.label}
                          <span className="tabular-nums">{item.count}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Bulk preview */}
            {pendingAction?.type === "delete-selected" && (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {deleteTypeCounts.map(([type, count]) => (
                    <div
                      key={type}
                      className="rounded-xl border border-rose-100 bg-rose-50/50 px-3 py-2.5"
                    >
                      <p className="text-[11px] font-medium text-slate-500">
                        {getMeta(type).plural}
                      </p>
                      <p className="mt-0.5 text-lg font-bold tabular-nums text-rose-700">{count}</p>
                    </div>
                  ))}
                </div>

                <ul className="divide-y divide-[#eeecf5] rounded-2xl border border-[#eeecf5]">
                  {deleteTargets.slice(0, 5).map((row) => (
                    <li key={row.id} className="flex items-center gap-3 px-4 py-2.5">
                      <RecordAvatar
                        type={row.entity_type}
                        name={row.title}
                        photo={rowPhotos[row.id]}
                        className="h-9 w-9"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-bold text-slate-800">
                          {row.title || "Untitled record"}
                        </p>
                        <p className="truncate text-[11px] text-slate-500">
                          {getMeta(row.entity_type).label} · {timeAgo(row.deleted_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                  {deleteTargets.length > 5 && (
                    <li className="px-4 py-2.5 text-center text-xs font-medium text-slate-500">
                      and {deleteTargets.length - 5} more
                    </li>
                  )}
                </ul>
              </>
            )}

            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs leading-5 text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                If you might need it later, choose <span className="font-bold">Restore</span>{" "}
                instead. Deleting forever cannot be undone.
              </p>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-rose-100 bg-white p-3.5 transition-colors hover:bg-rose-50/40">
              <input
                type="checkbox"
                checked={deleteAck}
                onChange={(event) => setDeleteAck(event.target.checked)}
                disabled={busy}
                className="mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-300 accent-rose-600"
              />
              <span className="text-xs font-medium leading-5 text-slate-700">
                I understand that{" "}
                {pendingAction?.type === "delete-selected" ? "these records" : "this record"} will be
                permanently deleted.
              </span>
            </label>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 border-t border-[#eeecf5] bg-white px-6 py-4 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => closePending(false)}
              disabled={busy}
              className="h-11 rounded-xl border-violet-200 bg-white px-5 text-sm font-medium text-slate-700 hover:bg-violet-50"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() =>
                pendingAction?.type === "delete-selected" ? runBulk("delete") : confirmDeleteOne()
              }
              disabled={busy || !deleteAck}
              className="h-11 gap-2 rounded-xl bg-rose-600 px-6 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {busyId === "bulk"
                    ? `Deleting ${bulkProgress.done}/${bulkProgress.total}`
                    : "Deleting..."}
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Delete forever
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EMPTY TRASH CONFIRMATION */}

      <Dialog open={pendingAction?.type === "empty"} onOpenChange={closePending}>
        <DialogContent className="rounded-[20px] border-rose-100 bg-white p-0 sm:max-w-[440px]">
          <DialogHeader className="space-y-2 border-b border-rose-100 px-6 pb-5 pt-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <DialogTitle className="text-lg font-bold text-[#171a36]">Empty Trash?</DialogTitle>
            <DialogDescription className="text-sm leading-6 text-slate-500">
              All {rows.length} {rows.length === 1 ? "record" : "records"} in this shop's Trash will
              be deleted forever. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 px-6 py-5">
            <Label htmlFor="empty-trash-confirm" className="text-xs text-slate-600">
              Type <span className="font-bold text-rose-700">DELETE</span> to confirm
            </Label>
            <Input
              id="empty-trash-confirm"
              value={emptyConfirmText}
              onChange={(event) => setEmptyConfirmText(event.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              disabled={busy}
              className="h-11 rounded-xl border-rose-200 bg-white shadow-sm focus-visible:border-rose-500 focus-visible:ring-rose-500/20"
            />
          </div>

          <DialogFooter className="flex-col-reverse gap-2 border-t border-[#eeecf5] px-6 py-4 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => closePending(false)}
              disabled={busy}
              className="h-11 rounded-xl border-violet-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-violet-50"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmEmptyTrash}
              disabled={busy || emptyConfirmText.trim().toUpperCase() !== "DELETE"}
              className="h-11 gap-2 rounded-xl bg-rose-600 px-5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {busyId === "all" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Emptying...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Empty Trash
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}