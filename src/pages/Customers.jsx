import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import { moveToTrash } from "@/lib/trash"
import { formatCurrency, formatDate, CUSTOMER_TYPES } from "@/lib/utils"
import { generateCustomersPDF, generateCustomerPDF } from "@/lib/customersPdf"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
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
  Archive,
  ArchiveRestore,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  CreditCard,
  Download,
  Eye,
  FileText,
  History,
  IndianRupee,
  Layers,
  LayoutGrid,
  List,
  Loader2,
  MapPin,
  MessageCircle,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Trash2,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react"

import { toast } from "sonner"

/* ==================================================
   CONSTANTS
================================================== */

const LIST_PAGE_SIZE = 10
const DETAIL_PAGE_SIZE = 8
const FETCH_BATCH = 1000 // Supabase returns max 1000 rows per request
const MAX_PHOTO_BYTES = 2 * 1024 * 1024
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"]

const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/

const emptyForm = {
  name: "",
  mobile: "",
  whatsapp: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  gstin: "",
  customer_type: "Individual",
  opening_balance: "",
  notes: "",
  photo: null,
  photo_preview: "",
}

const FORM_TEXT_FIELDS = [
  "name",
  "mobile",
  "whatsapp",
  "address",
  "city",
  "state",
  "pincode",
  "gstin",
  "customer_type",
  "opening_balance",
  "notes",
]

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-amber-100 text-amber-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
  "bg-violet-100 text-violet-700",
]

const LIST_FILTERS = [
  { id: "all", label: "All" },
  { id: "due", label: "With dues" },
  { id: "overdue", label: "Overdue" },
  { id: "clear", label: "All clear" },
  { id: "archived", label: "Archived" },
]

const SORT_OPTIONS = [
  { id: "name", label: "Name (A to Z)" },
  { id: "due", label: "Highest due" },
  { id: "overdue", label: "Most overdue" },
  { id: "lastBill", label: "Latest bill" },
  { id: "recent", label: "Recently added" },
]

const DETAIL_TABS = [
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

const PRESETS = [
  { mode: "today", label: "Today" },
  { mode: "yesterday", label: "Yesterday" },
  { mode: "week", label: "Last 7 days" },
  { mode: "month", label: "This month" },
]

const fieldClass =
  "h-11 rounded-xl border-violet-100 bg-white text-sm shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20"

const cardClass =
  "overflow-hidden rounded-[20px] border border-white/80 bg-white/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)] backdrop-blur-sm"

// Shared look for every non-destructive action button — matches the Export button.
const outlineBtn =
  "rounded-xl border-violet-200 bg-white text-slate-700 shadow-sm hover:bg-violet-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"

const dangerOutlineBtn =
  "rounded-xl border-rose-200 bg-rose-50 text-rose-700 shadow-sm hover:border-rose-300 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-950"

/* ==================================================
   HELPERS
================================================== */

const num = (value) => Number(value) || 0

function getLocalDateString() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function daysBetween(a, b) {
  const [ay, am, ad] = a.split("-").map(Number)
  const [by, bm, bd] = b.split("-").map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

// "+91 98765 43210" -> "9876543210" (last 10 digits)
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

function avatarColor(name) {
  let hash = 0
  for (const char of String(name)) hash = (hash * 31 + char.charCodeAt(0)) % 997
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function getPaymentStatus(bill) {
  if (num(bill.amount_due) <= 0) return "paid"
  if (num(bill.amount_paid) > 0 || num(bill.advance_adjusted) > 0) return "partial"
  return "unpaid"
}

function whatsappLink(phone, text) {
  const digits = normalizeMobile(phone)
  if (digits.length !== 10) return null
  return `https://wa.me/91${digits}?text=${encodeURIComponent(text)}`
}

function reminderText(customerName, shopName, due, overdue) {
  return (
    `Hello ${customerName}, this is a gentle reminder from ${shopName || "our shop"}. ` +
    `Your pending amount is ${formatCurrency(due)}` +
    (overdue > 0 ? ` (${formatCurrency(overdue)} is overdue)` : "") +
    `. Please arrange the payment at your earliest convenience. Thank you!`
  )
}

/** Pages through ALL rows so totals stay correct beyond Supabase's 1000-row cap. */
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

function paginate(list, page, size) {
  const totalPages = Math.max(1, Math.ceil(list.length / size))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * size
  return {
    items: list.slice(start, start + size),
    totalPages,
    safePage,
    from: list.length === 0 ? 0 : start + 1,
    to: Math.min(start + size, list.length),
    total: list.length,
  }
}

function downloadCsv(filename, rows) {
  const escape = (value) => {
    let text = String(value ?? "")
    // Stops spreadsheet apps from running text that starts like a formula
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

/* ---------- date period ---------- */

function getRange(period, today) {
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
}

function getPeriodLabel(period, range, today) {
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
}

const inRange = (date, range) => {
  if (!date) return !range.from && !range.to
  return (!range.from || date >= range.from) && (!range.to || date <= range.to)
}

/* ---------- photos ---------- */

function getCustomerPhotoStoragePath(photoUrl) {
  if (!photoUrl) return null
  try {
    const url = new URL(photoUrl)
    const marker = "/storage/v1/object/public/avatars/"
    const index = url.pathname.indexOf(marker)
    if (index === -1) return null
    return decodeURIComponent(url.pathname.slice(index + marker.length))
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
  const unique =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  const path = `customers/${shopId}/${Date.now()}-${unique}.${ext}`

  const { data, error } = await supabase.storage.from("avatars").upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  })
  if (error) throw error

  const { data: publicData } = supabase.storage.from("avatars").getPublicUrl(data.path)
  if (!publicData?.publicUrl) {
    throw new Error("Photo uploaded, but its public URL could not be created. Check the avatars bucket.")
  }
  return publicData.publicUrl
}

/* ---------- customer form ---------- */

function customerToForm(customer) {
  return {
    name: customer.name || "",
    mobile: customer.mobile || "",
    whatsapp: customer.whatsapp || "",
    address: customer.address || "",
    city: customer.city || "",
    state: customer.state || "",
    pincode: customer.pincode || "",
    gstin: customer.gstin || "",
    customer_type: customer.customer_type || "Individual",
    opening_balance: customer.opening_balance != null ? String(customer.opening_balance) : "",
    notes: customer.notes || "",
    photo: null,
    photo_preview: customer.photo_url || "",
  }
}

// Returns { errors, payload }. Errors are shown under each field.
function validateCustomerForm(form) {
  const errors = {}
  const name = form.name.trim().replace(/\s+/g, " ")

  if (!name) errors.name = "Customer name is required"
  else if (name.length < 2) errors.name = "Enter at least 2 characters"

  const mobile = normalizeMobile(form.mobile)
  if (form.mobile.trim() && mobile.length !== 10) errors.mobile = "Enter a valid 10-digit mobile number"

  const whatsapp = normalizeMobile(form.whatsapp)
  if (form.whatsapp.trim() && whatsapp.length !== 10) {
    errors.whatsapp = "Enter a valid 10-digit WhatsApp number"
  }

  const opening = form.opening_balance.trim() ? Number(form.opening_balance) : 0
  if (!Number.isFinite(opening) || opening < 0) errors.opening_balance = "Enter an amount of 0 or more"

  const gstin = form.gstin.trim().toUpperCase()
  if (gstin && !GSTIN_PATTERN.test(gstin)) errors.gstin = "GSTIN should be 15 characters, like 22AAAAA0000A1Z5"

  const pincode = form.pincode.trim()
  if (pincode && !/^\d{6}$/.test(pincode)) errors.pincode = "PIN code must be 6 digits"

  return {
    errors,
    payload: {
      name,
      mobile: form.mobile.trim() ? mobile : "",
      whatsapp: form.whatsapp.trim() ? whatsapp : "",
      address: form.address.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      pincode,
      gstin,
      customer_type: form.customer_type,
      opening_balance: opening,
      notes: form.notes.trim(),
    },
  }
}

/**
 * One save routine for BOTH the list and the details page, so the profile
 * photo is uploaded, saved and cleaned up the same way everywhere.
 */
async function saveCustomerRecord({ shopId, editing, form, payload }) {
  const previousPhoto = editing?.photo_url || null
  let photoUrl = previousPhoto
  let uploadedUrl = null

  if (form.photo instanceof File) {
    uploadedUrl = await uploadCustomerPhoto(shopId, form.photo)
    photoUrl = uploadedUrl
  } else if (!form.photo_preview) {
    photoUrl = null // photo was removed
  }

  const record = { ...payload, photo_url: photoUrl, shop_id: shopId }

  let saved = null
  try {
    if (editing) {
      const { data, error } = await supabase
        .from("customers")
        .update(record)
        .eq("id", editing.id)
        .eq("shop_id", shopId)
        .select()
        .maybeSingle()
      if (error) throw error
      saved = data
    } else {
      const { data, error } = await supabase.from("customers").insert(record).select().maybeSingle()
      if (error) throw error
      saved = data
    }
  } catch (error) {
    // Don't leave an orphan photo behind when the customer wasn't saved
    if (uploadedUrl) await removeCustomerPhoto(uploadedUrl).catch(() => {})
    throw error
  }

  let warning = ""
  if (previousPhoto && previousPhoto !== photoUrl) {
    try {
      await removeCustomerPhoto(previousPhoto)
    } catch (error) {
      console.error("Old photo cleanup error:", error)
      warning = "The previous photo could not be removed from storage."
    }
  }

  return { saved: saved || { ...(editing || {}), ...record }, warning }
}

function useCustomerForm({ shopId, customers = [], onSaved }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const initial = useRef(emptyForm)

  const openCreate = () => {
    initial.current = { ...emptyForm }
    setEditing(null)
    setForm({ ...emptyForm })
    setErrors({})
    setOpen(true)
  }

  const openEdit = (customer) => {
    const next = customerToForm(customer)
    initial.current = next
    setEditing(customer)
    setForm(next)
    setErrors({})
    setOpen(true)
  }

  const updateField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => (previous[field] ? { ...previous, [field]: undefined } : previous))
  }

  const dirty = useMemo(
    () =>
      form.photo instanceof File ||
      form.photo_preview !== initial.current.photo_preview ||
      FORM_TEXT_FIELDS.some((key) => form[key] !== initial.current[key]),
    [form]
  )

  const requestClose = () => {
    if (saving) return
    if (dirty) setDiscardOpen(true)
    else setOpen(false)
  }

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    if (!PHOTO_TYPES.includes(file.type)) return toast.error("Use a JPG, PNG or WebP image")
    if (file.size > MAX_PHOTO_BYTES) return toast.error("Photo must be smaller than 2 MB")

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setForm((previous) => ({ ...previous, photo: file, photo_preview: reader.result }))
      }
    }
    reader.readAsDataURL(file)
  }

  const removePhoto = () => setForm((previous) => ({ ...previous, photo: null, photo_preview: "" }))

  const duplicate = useMemo(() => {
    const mobile = normalizeMobile(form.mobile)
    if (mobile.length !== 10) return null
    return (
      customers.find((c) => c.id !== editing?.id && normalizeMobile(c.mobile) === mobile) || null
    )
  }, [form.mobile, customers, editing])

  const submit = async (event) => {
    event.preventDefault()
    if (saving) return

    const { errors: found, payload } = validateCustomerForm(form)
    const firstError = Object.keys(found)[0]

    if (firstError) {
      setErrors(found)
      toast.error("Please fix the highlighted fields")
      document.getElementById(`cf-${firstError}`)?.focus()
      return
    }

    setSaving(true)
    try {
      const { saved, warning } = await saveCustomerRecord({ shopId, editing, form, payload })

      toast.success(editing ? "Customer updated" : "Customer added")
      if (warning) toast.warning(warning, { duration: 6000 })

      setOpen(false)
      await onSaved?.(saved, editing)
    } catch (error) {
      console.error("Save customer error:", error)
      toast.error("Could not save customer", { description: error?.message })
    } finally {
      setSaving(false)
    }
  }

  return {
    open,
    setOpen,
    editing,
    form,
    errors,
    saving,
    dirty,
    duplicate,
    discardOpen,
    setDiscardOpen,
    openCreate,
    openEdit,
    updateField,
    requestClose,
    handlePhotoChange,
    removePhoto,
    submit,
  }
}

/* ==================================================
   SMALL UI PIECES
================================================== */

function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />
}

function PageSkeleton({ label }) {
  return (
    <div
      className="min-h-full w-full space-y-4 rounded-2xl bg-[#f7f5ff] px-3 py-5 sm:px-5 lg:px-6"
      aria-busy="true"
      aria-label={label}
    >
      <Skeleton className="h-16 w-72" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-[20px]" />
        ))}
      </div>
      <Skeleton className="h-[420px] rounded-[20px]" />
    </div>
  )
}

const TONES = {
  green: "bg-emerald-100/80 text-emerald-700",
  blue: "bg-blue-100/80 text-blue-700",
  pink: "bg-pink-100/80 text-pink-700",
  purple: "bg-violet-100/80 text-violet-700",
}

const ACCENTS = {
  green: "text-emerald-700",
  blue: "text-blue-700",
  pink: "text-pink-700",
  purple: "text-violet-700",
}

function SummaryCard({ label, value, detail, icon: Icon, tone = "green", valueClass = "text-[#151934]" }) {
  return (
    <Card className="overflow-hidden rounded-[20px] border border-white/80 bg-white/80 shadow-[0_4px_15px_rgba(80,65,130,0.07)] backdrop-blur-sm">
      <CardContent className="flex min-w-0 items-center gap-4 p-4 sm:p-5">
        <div className={`flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full ${TONES[tone]}`}>
          <Icon className="h-7 w-7" strokeWidth={1.9} aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-slate-600">{label}</p>
          <h3 className={`mt-1.5 break-words text-[23px] font-bold leading-tight tracking-tight tabular-nums ${valueClass}`}>
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
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-bold ${style.className}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {style.label}
    </span>
  )
}

function TypePill({ children, tone = "violet" }) {
  const styles = {
    violet: "border-violet-100 bg-violet-50 text-violet-700",
    slate: "border-slate-200 bg-slate-100 text-slate-600",
  }
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-bold ${styles[tone]}`}>
      {children}
    </span>
  )
}

function Avatar({ name, photo, className = "" }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [photo])

  if (photo && !failed) {
    return (
      <img
        src={photo}
        alt={`${name} profile`}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`object-cover ${className}`}
      />
    )
  }

  return (
    <span className={`flex items-center justify-center font-bold ${avatarColor(name)} ${className}`}>
      {getInitials(name)}
    </span>
  )
}

function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center px-5 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
        <Icon className="h-7 w-7" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-sm font-bold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">{description}</p>}
      {action}
    </div>
  )
}

function NoShopState({ title, description }) {
  return (
    <div className="flex min-h-[400px] items-center justify-center rounded-3xl border border-dashed border-violet-200 bg-white/80 p-8 text-center">
      <div className="max-w-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
          <Users className="h-7 w-7" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      </div>
    </div>
  )
}

function ErrorBanner({ message, onRetry }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
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
      <span className={`shrink-0 tabular-nums ${strong ? "font-bold" : "font-semibold"} ${valueClass}`}>{value}</span>
    </div>
  )
}

function FilterChip({ active, onClick, children, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 ${
        active
          ? "border-violet-300 bg-violet-100 text-violet-800"
          : "border-violet-200 bg-white text-slate-700 hover:bg-violet-50"
      }`}
    >
      {children}
      {count !== undefined && (
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${active ? "bg-white text-violet-800" : "bg-violet-50 text-slate-600"}`}>
          {count}
        </span>
      )}
    </button>
  )
}

function SearchBox({ value, onChange, placeholder, label, className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
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
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

function Pagination({ info, onChange, noun = "items" }) {
  const { safePage, totalPages, from, to, total } = info

  const items = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (safePage <= 3) return [1, 2, 3, "ellipsis-end", totalPages]
    if (safePage >= totalPages - 2) return [1, "ellipsis-start", totalPages - 2, totalPages - 1, totalPages]
    return [1, "ellipsis-start", safePage - 1, safePage, safePage + 1, "ellipsis-end", totalPages]
  }, [safePage, totalPages])

  return (
    <div className="flex flex-col gap-3 border-t border-[#eeecf5] bg-white/60 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <p className="text-xs font-medium text-slate-600" aria-live="polite">
        Showing <span className="font-semibold text-slate-800">{from}–{to}</span> of{" "}
        <span className="font-semibold text-slate-800">{total.toLocaleString("en-IN")}</span> {noun}
      </p>

      {totalPages > 1 && (
        <nav aria-label="Pages" className="flex flex-wrap items-center justify-end gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Previous page"
            disabled={safePage <= 1}
            onClick={() => onChange(safePage - 1)}
            className="h-8 w-8 rounded-full border-violet-200 bg-white p-0 text-slate-600 shadow-sm hover:bg-violet-50 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {items.map((item) =>
            typeof item === "string" ? (
              <span key={item} className="px-1 text-xs font-medium text-slate-400" aria-hidden="true">…</span>
            ) : (
              <Button
                key={item}
                type="button"
                variant={safePage === item ? "default" : "outline"}
                aria-label={`Page ${item}`}
                aria-current={safePage === item ? "page" : undefined}
                onClick={() => onChange(item)}
                className={`h-8 min-w-8 rounded-full px-0 text-xs font-semibold shadow-sm ${
                  safePage === item
                    ? "border-violet-700 bg-violet-700 text-white hover:bg-violet-800"
                    : "border-violet-200 bg-white text-slate-700 hover:bg-violet-50"
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
            className="h-8 w-8 rounded-full border-violet-200 bg-white p-0 text-slate-600 shadow-sm hover:bg-violet-50 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </nav>
      )}
    </div>
  )
}

function Footer({ icon: Icon, left, lastUpdated }) {
  return (
    <footer className="flex flex-col justify-between gap-2 rounded-xl border border-white/80 bg-white/65 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-emerald-700" aria-hidden="true" />
        <span>{left}</span>
      </div>
      <span>
        {lastUpdated
          ? `Last updated at ${lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
          : "Not updated yet"}
      </span>
    </footer>
  )
}

/* ---------- date period menu (Bills-style, shared) ---------- */

function PeriodMenu({ period, onChange, range, label, today }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false)
    }

    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  const choose = (mode) => {
    onChange({ mode, from: "", to: "" })
    setOpen(false)
  }

  const changeCustom = (key, value) => {
    const next = { from: range.from || "", to: range.to || "", [key]: value }
    if (next.from && next.to && next.from > next.to) {
      if (key === "from") next.to = next.from
      else next.from = next.to
    }
    onChange({ mode: "custom", ...next })
  }

  return (
    <div ref={ref} className="relative w-full sm:w-auto">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-full max-w-full items-center gap-2 rounded-xl border border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 sm:w-auto sm:max-w-[270px]"
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
        <span className="truncate">{label}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/30 sm:hidden" onClick={() => setOpen(false)} aria-hidden="true" />

          <div
            role="menu"
            aria-label="Choose period"
            className="fixed inset-x-3 bottom-3 z-50 max-h-[85vh] overflow-y-auto rounded-2xl border border-violet-100 bg-white p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_12px_32px_rgba(80,65,130,0.25)] sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-[calc(100%+8px)] sm:z-30 sm:max-h-none sm:w-[290px] sm:overflow-visible sm:pb-2"
          >
            {[...PRESETS, { mode: "overall", label: "All time" }].map((option) => {
              const active = period.mode === option.mode
              return (
                <button
                  key={option.mode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => choose(option.mode)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 ${
                    active ? "bg-emerald-50 font-semibold text-emerald-800" : "text-slate-700 hover:bg-violet-50"
                  }`}
                >
                  {option.label}
                  {active && <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                </button>
              )
            })}

            <div className="mt-2 border-t border-[#eeecf5] px-1 pb-1 pt-3">
              <p className={`mb-2 px-2 text-xs font-semibold ${period.mode === "custom" ? "text-emerald-800" : "text-slate-500"}`}>
                Pick dates
              </p>

              <div className="grid grid-cols-2 gap-2 px-1">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-slate-500">From</span>
                  <input
                    type="date"
                    value={range.from || ""}
                    max={range.to || today}
                    onChange={(e) => changeCustom("from", e.target.value)}
                    className="h-9 w-full rounded-lg border border-violet-200 bg-white px-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-slate-500">To</span>
                  <input
                    type="date"
                    value={range.to || ""}
                    min={range.from || undefined}
                    max={today}
                    onChange={(e) => changeCustom("to", e.target.value)}
                    className="h-9 w-full rounded-lg border border-violet-200 bg-white px-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
                  />
                </label>
              </div>

              <p className="mt-3 px-2 text-[11px] leading-4 text-slate-500">
                Customers are filtered by the date they were added. Dues and advances always show current totals.
              </p>

              <Button
                type="button"
                onClick={() => setOpen(false)}
                className={`mt-3 h-11 w-full gap-2 px-4 ${outlineBtn}`}
              >
                Done
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ==================================================
   DIALOGS
================================================== */

const CONFIRM_TONES = {
  rose: { box: "bg-rose-100/80 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300", button: "border-rose-600 bg-rose-600 text-white hover:bg-rose-700 dark:border-rose-500 dark:bg-rose-600 dark:text-white dark:hover:bg-rose-700" },
  amber: { box: "bg-amber-100/80 text-amber-600", button: "border-amber-200 bg-white text-amber-800 hover:bg-amber-50" },
  emerald: { box: "bg-emerald-100/80 text-emerald-700", button: "border-violet-200 bg-white text-slate-700 hover:bg-violet-50" },
}

function ConfirmDialog({
  open,
  onOpenChange,
  icon: Icon = AlertTriangle,
  tone = "rose",
  title,
  description,
  confirmLabel,
  loadingLabel = "Working…",
  cancelLabel = "Cancel",
  onConfirm,
  loading = false,
  hideConfirm = false,
  confirmDisabled = false,
  children,
}) {
  const style = CONFIRM_TONES[tone]

  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent className="max-w-sm gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-[0_12px_32px_rgba(80,65,130,0.25)] sm:max-w-md">
        <div className="flex flex-col items-center px-6 py-6 text-center">
          <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${style.box}`}>
            <Icon className="h-7 w-7" aria-hidden="true" />
          </div>

          <DialogTitle className="text-lg font-bold text-slate-900">{title}</DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-relaxed text-slate-500">{description}</DialogDescription>
          {children && <div className="mt-4 w-full text-left">{children}</div>}
        </div>

        <DialogFooter className="flex flex-col gap-2 border-t border-[#eeecf5] bg-[#faf9ff] p-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => onOpenChange(false)}
            className={`h-10 w-full gap-2 px-5 text-sm font-medium sm:w-auto ${outlineBtn}`}
          >
            {cancelLabel}
          </Button>

          {!hideConfirm && (
            <Button
              type="button"
              disabled={loading || confirmDisabled}
              onClick={onConfirm}
              className={`h-10 w-full gap-2 rounded-xl border px-5 text-sm font-medium shadow-sm sm:w-auto ${style.button}`}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {loading ? loadingLabel : confirmLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FormSection({ icon: Icon, title, description, children }) {
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-[#171a36]">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function Field({ id, label, required, hint, error, children }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-[13px] font-medium text-slate-700">
        {label} {required && <span className="text-rose-500">*</span>}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="flex items-center gap-1 text-[11px] font-medium text-rose-600">
          <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : (
        hint && <p className="text-[11px] text-slate-500">{hint}</p>
      )}
    </div>
  )
}

function CustomerFormDialog({ ctl }) {
  const { open, editing, form, errors, saving, duplicate, updateField } = ctl
  const photoInput = useRef(null)

  const inputProps = (key, extra = {}) => {
    const { className: extraClass = "", ...rest } = extra
    return {
      id: `cf-${key}`,
      value: form[key],
      onChange: (event) => updateField(key, event.target.value),
      "aria-invalid": Boolean(errors[key]),
      "aria-describedby": errors[key] ? `cf-${key}-error` : undefined,
      className: `${fieldClass} ${errors[key] ? "border-rose-300 focus-visible:border-rose-500 focus-visible:ring-rose-500/20" : ""} ${extraClass}`,
      ...rest,
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && ctl.requestClose()}>
        <DialogContent className="max-h-[94vh] gap-0 overflow-hidden rounded-[20px] border-0 p-0 shadow-[0_12px_32px_rgba(80,65,130,0.25)] sm:max-w-[640px]">
          <div className="border-b border-[#eae7f4] bg-gradient-to-br from-emerald-50 via-[#f7f5ff] to-white px-5 pb-5 pt-6 sm:px-7">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-lg shadow-emerald-700/25">
                {editing ? <Pencil className="h-5 w-5" aria-hidden="true" /> : <UserRound className="h-5 w-5" aria-hidden="true" />}
              </div>

              <div className="min-w-0 flex-1 pr-6">
                <DialogTitle className="text-lg font-bold tracking-tight text-[#171a36]">
                  {editing ? "Edit customer" : "Add new customer"}
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm text-slate-600">
                  {editing
                    ? `Update the details of ${editing.name}.`
                    : "Fields marked with * are required. You can add the rest later."}
                </DialogDescription>
              </div>
            </div>
          </div>

          <form onSubmit={ctl.submit} noValidate className="flex max-h-[calc(94vh-112px)] flex-col">
            <div className="flex-1 space-y-6 overflow-y-auto bg-white px-5 py-6 sm:px-7">
              {/* Photo */}
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-violet-100 bg-[#faf9ff] p-4 sm:flex-row">
                <div className="relative shrink-0">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-emerald-50 text-xl font-bold text-emerald-800 shadow-sm">
                    {form.photo_preview ? (
                      <img src={form.photo_preview} alt="Customer profile preview" className="h-full w-full object-cover" />
                    ) : (
                      getInitials(form.name)
                    )}
                  </div>
                  {form.photo instanceof File && (
                    <span className="absolute -right-1 -top-1 rounded-full border-2 border-white bg-emerald-700 px-1.5 py-0.5 text-[9px] font-bold text-white">
                      NEW
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <p className="text-sm font-semibold text-slate-800">Profile photo</p>
                  <p className="mt-1 text-xs text-slate-500">JPG, PNG or WebP, up to 2 MB.</p>

                  <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                    <Button type="button" variant="outline" onClick={() => photoInput.current?.click()} className={`h-9 gap-2 text-xs ${outlineBtn}`}>
                      <Camera className="h-4 w-4" aria-hidden="true" />
                      {form.photo_preview ? "Change photo" : "Upload photo"}
                    </Button>

                    {form.photo_preview && (
                      <Button type="button" variant="outline" onClick={ctl.removePhoto} className={`h-9 gap-2 text-xs ${dangerOutlineBtn}`}>
                        Remove
                      </Button>
                    )}
                  </div>
                </div>

                <input ref={photoInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={ctl.handlePhotoChange} />
              </div>

              <FormSection icon={UserRound} title="Basic information" description="Name and contact details.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Field id="cf-name" label="Customer name" required error={errors.name}>
                      <Input {...inputProps("name", { placeholder: "Enter customer name", autoFocus: true })} />
                    </Field>
                  </div>

                  <Field id="cf-mobile" label="Mobile number" error={errors.mobile}>
                    <Input {...inputProps("mobile", { type: "tel", inputMode: "numeric", placeholder: "10-digit number", maxLength: 15 })} />
                  </Field>

                  <Field id="cf-whatsapp" label="WhatsApp number" error={errors.whatsapp} hint="Used for payment reminders. Mobile is used if empty.">
                    <Input {...inputProps("whatsapp", { type: "tel", inputMode: "numeric", placeholder: "10-digit number", maxLength: 15 })} />
                  </Field>

                  {duplicate && (
                    <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 sm:col-span-2">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        <strong>{duplicate.name}</strong> already uses this mobile number. You can still save, but check you are not adding the same customer twice.
                      </span>
                    </p>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-medium text-slate-700">Customer type</Label>
                    <Select value={form.customer_type} onValueChange={(value) => updateField("customer_type", value)}>
                      <SelectTrigger className={fieldClass} aria-label="Customer type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {CUSTOMER_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Field id="cf-gstin" label="GSTIN" error={errors.gstin} hint="Optional, for business customers.">
                    <Input
                      {...inputProps("gstin", { placeholder: "15-character GSTIN", maxLength: 15, className: "uppercase" })}
                      onChange={(event) => updateField("gstin", event.target.value.toUpperCase())}
                    />
                  </Field>
                </div>
              </FormSection>

              <div className="h-px bg-[#eeecf5]" />

              <FormSection icon={MapPin} title="Address" description="Billing or business address.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Field id="cf-address" label="Street address">
                      <Input {...inputProps("address", { placeholder: "House number, street, locality" })} />
                    </Field>
                  </div>

                  <Field id="cf-city" label="City">
                    <Input {...inputProps("city", { placeholder: "City" })} />
                  </Field>

                  <Field id="cf-state" label="State">
                    <Input {...inputProps("state", { placeholder: "State" })} />
                  </Field>

                  <Field id="cf-pincode" label="PIN code" error={errors.pincode}>
                    <Input
                      {...inputProps("pincode", { inputMode: "numeric", placeholder: "6-digit PIN code", maxLength: 6 })}
                      onChange={(event) => updateField("pincode", event.target.value.replace(/\D/g, ""))}
                    />
                  </Field>
                </div>
              </FormSection>

              <div className="h-px bg-[#eeecf5]" />

              <FormSection icon={Wallet} title="Opening balance" description="Amount the customer already owed before you started using this app.">
                <Field id="cf-opening_balance" label="Opening balance" error={errors.opening_balance} hint="Kept separate from bills created in this app.">
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">₹</span>
                    <Input
                      {...inputProps("opening_balance", { type: "number", inputMode: "decimal", min: "0", step: "0.01", placeholder: "0.00" })}
                      className={`${fieldClass} pl-8 font-semibold ${errors.opening_balance ? "border-rose-300" : ""}`}
                    />
                  </div>
                </Field>
              </FormSection>

              <div className="h-px bg-[#eeecf5]" />

              <FormSection icon={FileText} title="Notes" description="Anything worth remembering about this customer.">
                <div>
                  <Textarea
                    id="cf-notes"
                    value={form.notes}
                    onChange={(event) => updateField("notes", event.target.value)}
                    placeholder="Add any additional information…"
                    rows={3}
                    maxLength={500}
                    className="resize-none rounded-xl border-violet-100 bg-white text-sm shadow-none placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20"
                  />
                  <p className="mt-1 text-right text-[11px] text-slate-400">{form.notes.length}/500</p>
                </div>
              </FormSection>
            </div>

            <DialogFooter className="items-center border-t border-[#eae7f4] bg-[#faf9ff] px-5 py-4 sm:justify-between sm:px-7">
              <p className="hidden text-xs text-slate-500 sm:block">
                {ctl.dirty ? "You have unsaved changes." : "No changes yet."}
              </p>

              <div className="flex w-full gap-2 sm:w-auto">
                <Button type="button" variant="outline" onClick={ctl.requestClose} disabled={saving} className={`h-11 flex-1 gap-2 px-5 text-sm font-medium sm:flex-none ${outlineBtn}`}>
                  Cancel
                </Button>

                <Button
                  type="submit"
                  disabled={saving || (Boolean(editing) && !ctl.dirty)}
                  className={`h-11 flex-1 gap-2 px-6 text-sm font-semibold sm:flex-none ${outlineBtn} disabled:opacity-50`}
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Saving…
                    </>
                  ) : editing ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      Save changes
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Add customer
                    </>
                  )}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={ctl.discardOpen}
        onOpenChange={ctl.setDiscardOpen}
        tone="amber"
        title="Discard your changes?"
        description="You have unsaved changes. If you close now, they will be lost."
        cancelLabel="Keep editing"
        confirmLabel="Discard changes"
        onConfirm={() => {
          ctl.setDiscardOpen(false)
          ctl.setOpen(false)
        }}
      />
    </>
  )
}

/* ==================================================
   CUSTOMERS LIST
================================================== */

function CustomersList({ currentShop }) {
  const shopId = currentShop.id
  const today = getLocalDateString()

  const [allCustomers, setAllCustomers] = useState([])
  const [customerBills, setCustomerBills] = useState([])
  const [advanceRows, setAdvanceRows] = useState([])

  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [sortBy, setSortBy] = useState("name")
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState("list")

  // Date period — Bills-style calendar in the header
  const [period, setPeriod] = useState({ mode: "overall", from: "", to: "" })

  const [quickView, setQuickView] = useState(null)
  const [archiveTarget, setArchiveTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteStage, setDeleteStage] = useState("summary")
  const [deleteName, setDeleteName] = useState("")
  const [busy, setBusy] = useState(false)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [lastUpdated, setLastUpdated] = useState(null)

  const hasLoaded = useRef(false)
  const requestRef = useRef(0)

  const range = useMemo(() => getRange(period, today), [period, today])
  const periodLabel = getPeriodLabel(period, range, today)

  useEffect(() => {
    hasLoaded.current = false
    setAllCustomers([])
    setCustomerBills([])
    setAdvanceRows([])
    setPage(1)
    setLoadError("")
    setLoading(true)
  }, [shopId])

  const loadCustomers = useCallback(
    async (showRefresh = false) => {
      const requestId = ++requestRef.current

      if (showRefresh || hasLoaded.current) setRefreshing(true)
      else setLoading(true)

      setLoadError("")

      try {
        const [customerRows, billRows, advances] = await Promise.all([
          fetchAllRows(() => supabase.from("customers").select("*").eq("shop_id", shopId).order("id")),
          fetchAllRows(() =>
            supabase
              .from("bills")
              .select("id, customer_id, grand_total, amount_due, due_date, bill_date")
              .eq("shop_id", shopId)
              .order("id")
          ),
          fetchAllRows(() =>
            supabase
              .from("customer_advances")
              .select("id, customer_id, remaining_amount")
              .eq("shop_id", shopId)
              .gt("remaining_amount", 0)
              .order("id")
          ),
        ])

        if (requestId !== requestRef.current) return

        setAllCustomers(customerRows)
        setCustomerBills(billRows)
        setAdvanceRows(advances)
        setLastUpdated(new Date())
        hasLoaded.current = true
      } catch (error) {
        if (requestId !== requestRef.current) return
        console.error("Load customers error:", error)
        const message = error?.message || "Unable to load customers."
        setLoadError(message)
        toast.error("Could not load customers", { description: message })
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
    loadCustomers()
  }, [loadCustomers])

  const customerForm = useCustomerForm({
    shopId,
    customers: allCustomers,
    onSaved: async () => {
      setPage(1)
      await loadCustomers(true)
    },
  })

  /* ---------- derived data ---------- */

  const rows = useMemo(() => {
    const stats = {}
    customerBills.forEach((bill) => {
      if (!bill.customer_id) return
      const item = (stats[bill.customer_id] ||= { count: 0, billed: 0, due: 0, overdue: 0, lastBill: "", oldest: "" })
      const due = num(bill.amount_due)

      item.count += 1
      item.billed += num(bill.grand_total)
      item.due += due
      if (due > 0 && bill.due_date && bill.due_date < today) {
        item.overdue += due
        if (!item.oldest || bill.due_date < item.oldest) item.oldest = bill.due_date
      }
      if (bill.bill_date && bill.bill_date > item.lastBill) item.lastBill = bill.bill_date
    })

    const advances = {}
    advanceRows.forEach((row) => {
      advances[row.customer_id] = (advances[row.customer_id] || 0) + num(row.remaining_amount)
    })

    return allCustomers.map((customer) => {
      const s = stats[customer.id] || {}
      return {
        customer,
        archived: customer.is_active === false,
        bills: s.count || 0,
        billed: num(s.billed),
        due: num(customer.opening_balance) + num(s.due),
        overdue: num(s.overdue),
        overdueDays: s.oldest ? daysBetween(s.oldest, today) : 0,
        lastBill: s.lastBill || "",
        advance: num(advances[customer.id]),
      }
    })
  }, [allCustomers, customerBills, advanceRows, today])

  const activeRows = useMemo(() => rows.filter((r) => !r.archived), [rows])

  const statusCounts = useMemo(
    () => ({
      all: activeRows.length,
      due: activeRows.filter((r) => r.due > 0).length,
      overdue: activeRows.filter((r) => r.overdue > 0).length,
      clear: activeRows.filter((r) => r.due <= 0).length,
      archived: rows.length - activeRows.length,
    }),
    [rows, activeRows]
  )

  const summary = useMemo(
    () => ({
      due: activeRows.reduce((sum, r) => sum + r.due, 0),
      overdue: activeRows.reduce((sum, r) => sum + r.overdue, 0),
      advance: activeRows.reduce((sum, r) => sum + r.advance, 0),
      advanceCount: activeRows.filter((r) => r.advance > 0).length,
      business: activeRows.filter((r) => r.customer.customer_type !== "Individual").length,
    }),
    [activeRows]
  )

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const queryDigits = query.replace(/\D/g, "")
    const source = statusFilter === "archived" ? rows.filter((r) => r.archived) : activeRows

    const list = source.filter(({ customer, due, overdue }) => {
      // Respect the header calendar (customer added date)
      const addedDate = customer.created_at ? customer.created_at.split("T")[0] : null
      const matchesPeriod = !addedDate
        ? !range.from && !range.to
        : inRange(addedDate, range)

      const matchesSearch =
        !query ||
        customer.name?.toLowerCase().includes(query) ||
        customer.gstin?.toLowerCase().includes(query) ||
        customer.city?.toLowerCase().includes(query) ||
        (queryDigits &&
          (normalizeMobile(customer.mobile).includes(queryDigits) ||
            normalizeMobile(customer.whatsapp).includes(queryDigits)))

      const matchesType = typeFilter === "all" || customer.customer_type === typeFilter

      const matchesStatus =
        statusFilter === "all" ||
        statusFilter === "archived" ||
        (statusFilter === "due" && due > 0) ||
        (statusFilter === "overdue" && overdue > 0) ||
        (statusFilter === "clear" && due <= 0)

      return matchesPeriod && matchesSearch && matchesType && matchesStatus
    })

    list.sort((a, b) => {
      if (sortBy === "due") return b.due - a.due
      if (sortBy === "overdue") return b.overdue - a.overdue || b.overdueDays - a.overdueDays
      if (sortBy === "lastBill") return b.lastBill.localeCompare(a.lastBill)
      if (sortBy === "recent") return String(b.customer.created_at || "").localeCompare(String(a.customer.created_at || ""))
      return String(a.customer.name || "").localeCompare(String(b.customer.name || ""))
    })

    return list
  }, [rows, activeRows, search, typeFilter, statusFilter, sortBy, range])

  useEffect(() => {
    setPage(1)
  }, [search, typeFilter, statusFilter, sortBy, range.from, range.to])

  const pageInfo = paginate(filtered, page, LIST_PAGE_SIZE)
  const hasFilters = Boolean(search) || typeFilter !== "all" || statusFilter !== "all" || period.mode !== "overall"

  const clearFilters = () => {
    setSearch("")
    setTypeFilter("all")
    setStatusFilter("all")
    setPeriod({ mode: "overall", from: "", to: "" })
  }

  const reminderFor = (row) => {
    if (row.due <= 0) return null
    return whatsappLink(
      row.customer.whatsapp || row.customer.mobile,
      reminderText(row.customer.name, currentShop.name, row.due, row.overdue)
    )
  }

  /* ---------- actions ---------- */

  async function setArchived(row, archived) {
    setBusy(true)
    try {
      const { error } = await supabase
        .from("customers")
        .update({ is_active: !archived })
        .eq("id", row.customer.id)
        .eq("shop_id", shopId)

      if (error) throw error

      toast.success(archived ? `${row.customer.name} archived` : `${row.customer.name} restored`)
      setArchiveTarget(null)
      setQuickView(null)
      await loadCustomers(true)
    } catch (error) {
      toast.error(archived ? "Could not archive customer" : "Could not restore customer", {
        description: error?.message,
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await moveToTrash({ shopId, type: "customer", id: deleteTarget.customer.id })
      toast.success("Customer moved to Trash", {
        description: "You can restore it or permanently delete it from the Trash page.",
      })
      setDeleteTarget(null)
      setDeleteStage("summary")
      setDeleteName("")
      setQuickView(null)
      await loadCustomers(true)
    } catch (error) {
      console.error("Move customer to Trash error:", error)
      toast.error("Unable to move customer to Trash", {
        description: error?.message || "Please check the Trash setup and database permissions.",
        duration: 7000,
      })
    } finally {
      setBusy(false)
    }
  }

  function exportCsv() {
    const header = ["Name", "Type", "Mobile", "WhatsApp", "GSTIN", "City", "State", "Bills", "Outstanding", "Overdue", "Advance held", "Last bill", "Status"]
    const body = filtered.map((r) => [
      r.customer.name,
      r.customer.customer_type || "Individual",
      r.customer.mobile || "",
      r.customer.whatsapp || "",
      r.customer.gstin || "",
      r.customer.city || "",
      r.customer.state || "",
      r.bills,
      r.due,
      r.overdue,
      r.advance,
      r.lastBill,
      r.archived ? "Archived" : "Active",
    ])

    downloadCsv(`customers-${today}.csv`, [header, ...body])
    toast.success(`Exported ${filtered.length} ${filtered.length === 1 ? "customer" : "customers"}`)
  }

  if (loading) return <PageSkeleton label="Loading customers" />

  /* ---------- shared row pieces ---------- */

  const renderRowActions = (row) => {
    const { customer } = row
    const reminder = reminderFor(row)

    return (
      <div className="flex items-center justify-end gap-1">
        {reminder && (
          <Button asChild variant="outline" size="icon" className="h-8 w-8 rounded-lg border-violet-200 bg-white text-slate-700 shadow-sm hover:bg-violet-50">
            <a href={reminder} target="_blank" rel="noopener noreferrer" aria-label={`Send WhatsApp reminder to ${customer.name}`} title="Send WhatsApp reminder">
              <MessageCircle className="h-4 w-4" />
            </a>
          </Button>
        )}

        <Button type="button" variant="outline" size="icon" onClick={() => setQuickView(row)} aria-label={`Quick view of ${customer.name}`} title="Quick view" className="h-8 w-8 rounded-lg border-violet-200 bg-white text-slate-700 shadow-sm hover:bg-violet-50">
          <Eye className="h-4 w-4" />
        </Button>

        <Button type="button" variant="outline" size="icon" onClick={() => customerForm.openEdit(customer)} aria-label={`Edit ${customer.name}`} title="Edit" className="h-8 w-8 rounded-lg border-violet-200 bg-white text-slate-700 shadow-sm hover:bg-violet-50">
          <Pencil className="h-4 w-4" />
        </Button>

        {row.archived ? (
          <Button type="button" variant="outline" size="icon" onClick={() => setArchived(row, false)} aria-label={`Restore ${customer.name}`} title="Restore" className="h-8 w-8 rounded-lg border-violet-200 bg-white text-slate-700 shadow-sm hover:bg-violet-50">
            <ArchiveRestore className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="button" variant="outline" size="icon" onClick={() => setArchiveTarget(row)} aria-label={`Archive ${customer.name}`} title="Archive" className="h-8 w-8 rounded-lg border-violet-200 bg-white text-slate-700 shadow-sm hover:bg-violet-50">
            <Archive className="h-4 w-4" />
          </Button>
        )}
        <Button type="button" variant="outline" size="icon" onClick={() => { setDeleteName(""); setDeleteStage("summary"); setDeleteTarget(row) }} aria-label={`Move ${customer.name} to Trash`} title="Move to Trash" className={`h-8 w-8 ${dangerOutlineBtn}`}>
          <Trash2 className="h-4 w-4" />
        </Button>

        <Button asChild variant="outline" size="sm" className="ml-1 h-8 gap-1 px-2.5 text-xs font-semibold border-violet-200 bg-white text-slate-700 shadow-sm hover:bg-violet-50">
          <Link to={`/customers/${customer.id}`}>
            Open <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    )
  }

  const renderCard = (row) => {
    const { customer, due, overdue, bills } = row
    const reminder = reminderFor(row)

    return (
      <article key={row.customer.id} className="rounded-2xl border border-violet-100/80 bg-white p-4 shadow-[0_3px_12px_rgba(80,65,130,0.05)] transition-shadow hover:shadow-[0_7px_20px_rgba(80,65,130,0.09)]">
        <div className="flex items-start justify-between gap-3">
          <button type="button" onClick={() => setQuickView(row)} className="flex min-w-0 items-center gap-3 text-left">
            <Avatar name={customer.name} photo={customer.photo_url} className="h-11 w-11 shrink-0 overflow-hidden rounded-full text-sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">{customer.name}</p>
              <p className="mt-0.5 truncate text-xs text-slate-500">{customer.mobile || "No mobile number"}</p>
            </div>
          </button>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <TypePill>{customer.customer_type || "Individual"}</TypePill>
            {row.archived && <TypePill tone="slate">Archived</TypePill>}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <MiniStat label="Bills" value={bills} note={row.lastBill ? `Last ${formatDate(row.lastBill)}` : undefined} />
          <MiniStat label="Outstanding" value={formatCurrency(due)} note={overdue > 0 ? `${formatCurrency(overdue)} overdue` : undefined} tone={due > 0 ? "rose" : "emerald"} />
        </div>

        {(customer.city || customer.state) && (
          <p className="mt-3 flex items-center gap-1.5 truncate text-xs text-slate-500">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {[customer.city, customer.state].filter(Boolean).join(", ")}
          </p>
        )}

        <div className="mt-4 flex items-center gap-1.5 border-t border-[#eeecf5] pt-3">
          <Button asChild className="h-9 flex-1 gap-1 rounded-lg border-violet-200 bg-white text-xs text-slate-700 shadow-sm hover:bg-violet-50">
            <Link to={`/customers/${customer.id}`}>Open <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
          </Button>
          {reminder && (
            <Button asChild variant="outline" size="icon" className="h-9 w-9 rounded-lg border-violet-200 bg-white text-slate-700 shadow-sm hover:bg-violet-50">
              <a href={reminder} target="_blank" rel="noopener noreferrer" aria-label={`Send WhatsApp reminder to ${customer.name}`}><MessageCircle className="h-4 w-4" /></a>
            </Button>
          )}
          <Button type="button" variant="outline" size="icon" onClick={() => customerForm.openEdit(customer)} aria-label={`Edit ${customer.name}`} className="h-9 w-9 rounded-lg border-violet-200 bg-white text-slate-700 shadow-sm hover:bg-violet-50">
            <Pencil className="h-4 w-4" />
          </Button>
          {row.archived ? (
            <Button type="button" variant="outline" size="icon" onClick={() => setArchived(row, false)} aria-label={`Restore ${customer.name}`} className="h-9 w-9 rounded-lg border-violet-200 bg-white text-slate-700 shadow-sm hover:bg-violet-50">
              <ArchiveRestore className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" variant="outline" size="icon" onClick={() => setArchiveTarget(row)} aria-label={`Archive ${customer.name}`} className="h-9 w-9 rounded-lg border-violet-200 bg-white text-slate-700 shadow-sm hover:bg-violet-50">
              <Archive className="h-4 w-4" />
            </Button>
          )}
          <Button type="button" variant="outline" size="icon" onClick={() => { setDeleteName(""); setDeleteStage("summary"); setDeleteTarget(row) }} aria-label={`Move ${customer.name} to Trash`} title="Move to Trash" className={`h-9 w-9 ${dangerOutlineBtn}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </article>
    )
  }

  /* ---------- render ---------- */

  const quickReminder = quickView ? reminderFor(quickView) : null

  return (
    <div className="min-h-full w-full space-y-4 rounded-2xl bg-[#f7f5ff] px-3 py-5 sm:px-5 lg:px-6">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span>{currentShop.name || "Workspace"}</span>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            <span>Customers</span>
          </nav>

          <h1 className="mt-1 text-[29px] font-bold tracking-tight text-[#171a39] sm:text-[32px]">Customers</h1>
          <p className="mt-0.5 text-sm text-slate-600">
            Manage customer accounts, purchases and outstanding balances. Showing{" "}
            <strong className="font-semibold text-slate-800">{periodLabel}</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className={`h-11 gap-2 px-4 ${outlineBtn}`}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              try {
                generateCustomersPDF({
                  customers: filtered,
                  shop: currentShop,
                  periodLabel,
                })
                toast.success(`Customer PDF exported (${filtered.length} records)`)
              } catch (error) {
                toast.error("Could not export customer PDF", { description: error?.message })
              }
            }}
            disabled={filtered.length === 0}
            className={`h-11 gap-2 px-4 ${outlineBtn}`}
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            Export PDF
          </Button>

          {/* Bills-style date period calendar */}
          <PeriodMenu period={period} onChange={setPeriod} range={range} label={periodLabel} today={today} />

          {/* Bills-style refresh (icon + label) */}
          <Button
            type="button"
            variant="outline"
            onClick={() => loadCustomers(true)}
            disabled={refreshing}
            aria-label={refreshing ? "Refreshing customers" : "Refresh customers"}
            title={refreshing ? "Refreshing customers" : "Refresh customers"}
            className="h-11 min-w-[112px] gap-2 rounded-xl border border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <RefreshCw className={`h-4 w-4 shrink-0 ${refreshing ? "animate-spin" : ""}`} />
            <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
          </Button>

          <Button type="button" variant="outline" onClick={customerForm.openCreate} className={`h-11 gap-2 px-5 font-semibold ${outlineBtn}`}>
            <Plus className="h-5 w-5" aria-hidden="true" />
            Add customer
          </Button>
        </div>
      </header>

      {loadError && <ErrorBanner message={loadError} onRetry={() => loadCustomers(true)} />}

      <section aria-label="Customer overview" className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <SummaryCard label="Active customers" value={activeRows.length.toLocaleString("en-IN")} detail={`${summary.business} business ${summary.business === 1 ? "customer" : "customers"}`} icon={Users} tone="green" />
        <SummaryCard label="Total outstanding" value={formatCurrency(summary.due)} detail={`${statusCounts.due} ${statusCounts.due === 1 ? "customer owes" : "customers owe"} you`} icon={IndianRupee} tone="pink" />
        <SummaryCard label="Overdue amount" value={formatCurrency(summary.overdue)} detail={`${statusCounts.overdue} ${statusCounts.overdue === 1 ? "customer" : "customers"} past due date`} icon={Clock3} tone="purple" />
        <SummaryCard label="Advance held" value={formatCurrency(summary.advance)} detail={`${summary.advanceCount} ${summary.advanceCount === 1 ? "customer" : "customers"} paid in advance`} icon={Layers} tone="blue" />
      </section>

      <Card className={cardClass}>
        <SectionHeader
          icon={Users}
          title={statusFilter === "archived" ? "Archived customers" : "All customers"}
          description={`Showing ${filtered.length} of ${statusFilter === "archived" ? statusCounts.archived : activeRows.length} customers`}
          action={
            <div className="hidden shrink-0 items-center rounded-xl border border-violet-100 bg-[#f7f5ff] p-1 md:flex" role="group" aria-label="View mode">
              {[
                { id: "list", label: "List", icon: List },
                { id: "cards", label: "Cards", icon: LayoutGrid },
              ].map((mode) => {
                const Icon = mode.icon
                const active = viewMode === mode.id
                return (
                  <Button key={mode.id} type="button" size="sm" variant="ghost" aria-pressed={active} onClick={() => setViewMode(mode.id)} className={`h-8 gap-1.5 rounded-lg px-2.5 text-xs ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {mode.label}
                  </Button>
                )
              })}
            </div>
          }
        />

        <div className="space-y-3 border-b border-[#eeecf5] p-4 sm:px-5">
          <div className="flex flex-col gap-2 lg:flex-row">
            <SearchBox value={search} onChange={setSearch} placeholder="Search name, mobile, GSTIN or city" label="Search customers" className="flex-1" />

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className={`${fieldClass} w-full lg:w-44`} aria-label="Customer type">
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
              <SelectTrigger className={`${fieldClass} w-full lg:w-44`} aria-label="Sort customers">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div role="group" aria-label="Filter customers" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {LIST_FILTERS.map((filter) => (
              <FilterChip key={filter.id} active={statusFilter === filter.id} count={statusCounts[filter.id]} onClick={() => setStatusFilter(filter.id)}>
                {filter.label}
              </FilterChip>
            ))}

            {hasFilters && (
              <button type="button" onClick={clearFilters} className="shrink-0 px-2 text-xs font-semibold text-slate-500 hover:text-rose-600">
                Clear filters
              </button>
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={statusFilter === "archived" ? Archive : Users}
            title={
              statusFilter === "archived"
                ? "No archived customers"
                : allCustomers.length
                  ? "No matching customers"
                  : "No customers yet"
            }
            description={
              statusFilter === "archived"
                ? "Customers you archive are kept here and can be restored anytime."
                : allCustomers.length
                  ? "Try changing your search, filters or date range."
                  : "Add your first customer to start managing their account."
            }
            action={
              hasFilters ? (
                <Button variant="outline" className={`mt-4 gap-2 px-4 ${outlineBtn}`} onClick={clearFilters}>Clear filters</Button>
              ) : allCustomers.length === 0 ? (
                <Button type="button" variant="outline" onClick={customerForm.openCreate} className={`mt-4 gap-2 px-4 font-semibold ${outlineBtn}`}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> Add customer
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            {/* Table (desktop, list view) */}
            {viewMode === "list" && (
              <div className={`hidden overflow-x-auto px-3 pt-3 transition-opacity sm:px-4 md:block ${refreshing ? "opacity-60" : "opacity-100"}`}>
                <table className="w-full min-w-[900px] text-left">
                  <caption className="sr-only">Customers</caption>
                  <thead>
                    <tr className="bg-[#f5f3fc] text-[11px] font-semibold text-slate-600">
                      <th scope="col" className="rounded-l-xl px-3 py-3">Customer</th>
                      <th scope="col" className="px-3 py-3">Contact</th>
                      <th scope="col" className="px-3 py-3">Type</th>
                      <th scope="col" className="px-3 py-3 text-right">Bills</th>
                      <th scope="col" className="px-3 py-3 text-right">Outstanding</th>
                      <th scope="col" className="rounded-r-xl px-3 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageInfo.items.map((row) => {
                      const { customer, due, overdue, bills } = row
                      return (
                        <tr key={customer.id} className="border-b border-[#eeecf5] transition-colors last:border-0 hover:bg-[#f9f8ff]">
                          <td className="px-3 py-3">
                            <button type="button" onClick={() => setQuickView(row)} className="flex items-center gap-2.5 text-left">
                              <Avatar name={customer.name} photo={customer.photo_url} className="h-9 w-9 shrink-0 overflow-hidden rounded-full text-xs" />
                              <div className="min-w-0">
                                <p className="max-w-[190px] truncate text-[13px] font-bold text-slate-800 hover:text-emerald-700">{customer.name}</p>
                                <p className="mt-0.5 text-[11px] text-slate-500">{customer.gstin || "No GSTIN"}</p>
                              </div>
                            </button>
                          </td>
                          <td className="px-3 py-3">
                            <p className="text-xs font-medium text-slate-700">{customer.mobile || "No mobile"}</p>
                            <p className="mt-0.5 text-[11px] text-slate-500">{customer.city || customer.state || "Address not added"}</p>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1">
                              <TypePill>{customer.customer_type || "Individual"}</TypePill>
                              {row.archived && <TypePill tone="slate">Archived</TypePill>}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right">
                            <p className="text-xs font-medium tabular-nums text-slate-700">{bills}</p>
                            {row.lastBill && <p className="mt-0.5 text-[11px] text-slate-400">Last {formatDate(row.lastBill)}</p>}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <p className={`text-xs font-bold tabular-nums ${due > 0 ? "text-rose-600" : "text-emerald-700"}`}>{formatCurrency(due)}</p>
                            {overdue > 0 && <p className="mt-0.5 text-[11px] font-semibold text-rose-500">{formatCurrency(overdue)} overdue</p>}
                            {row.advance > 0 && <p className="mt-0.5 text-[11px] text-violet-600">{formatCurrency(row.advance)} advance</p>}
                          </td>
                          <td className="px-3 py-3">{renderRowActions(row)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Cards (always on mobile, optional on desktop) */}
            <div className={`grid grid-cols-1 gap-3 p-4 transition-opacity sm:grid-cols-2 xl:grid-cols-3 ${viewMode === "list" ? "md:hidden" : ""} ${refreshing ? "opacity-60" : "opacity-100"}`}>
              {pageInfo.items.map((row) => renderCard(row))}
            </div>

            <Pagination info={pageInfo} onChange={setPage} noun="customers" />
          </>
        )}
      </Card>

      <Footer icon={Users} left={<>Workspace:<strong className="ml-1 text-slate-700">{currentShop.name}</strong></>} lastUpdated={lastUpdated} />

      <CustomerFormDialog ctl={customerForm} />

      {/* QUICK VIEW */}
      <Dialog open={Boolean(quickView)} onOpenChange={(open) => !open && setQuickView(null)}>
        <DialogContent className="max-h-[92vh] gap-0 overflow-hidden rounded-[24px] border border-violet-100 bg-white p-0 shadow-[0_24px_70px_rgba(39,31,79,0.22)] sm:max-w-[680px]">
          {quickView && (
            <>
              <div className="relative overflow-hidden border-b border-violet-100 bg-[#f7f5ff] px-5 py-6 sm:px-7">
                <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full bg-emerald-100/50 blur-2xl" aria-hidden="true" />
                <div className="relative flex flex-col items-center gap-4 sm:flex-row">
                  <Avatar name={quickView.customer.name} photo={quickView.customer.photo_url} className="h-24 w-24 shrink-0 overflow-hidden rounded-full border-4 border-white text-2xl shadow-[0_5px_18px_rgba(80,65,130,0.13)]" />

                  <div className="min-w-0 flex-1 text-center sm:text-left">
                    <DialogTitle className="break-words text-xl font-extrabold tracking-tight text-[#171a39] sm:text-2xl">{quickView.customer.name}</DialogTitle>
                    <DialogDescription className="mt-1 text-sm text-slate-500">
                      {quickView.customer.created_at ? `Customer since ${formatDate(quickView.customer.created_at.split("T")[0])}` : "Customer profile"}
                    </DialogDescription>
                    <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                      <TypePill>{quickView.customer.customer_type || "Individual"}</TypePill>
                      {quickView.archived && <TypePill tone="slate">Archived</TypePill>}
                      {quickView.overdue > 0 && <StatusPill status="overdue" />}
                    </div>
                  </div>
                </div>
              </div>

              <div className="max-h-[48vh] space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MiniStat label="Outstanding" value={formatCurrency(quickView.due)} tone={quickView.due > 0 ? "rose" : "emerald"} />
                  <MiniStat label="Total billed" value={formatCurrency(quickView.billed)} note={`${quickView.bills} ${quickView.bills === 1 ? "bill" : "bills"}`} />
                  <MiniStat label="Advance held" value={formatCurrency(quickView.advance)} />
                  <MiniStat label="Last bill" value={quickView.lastBill ? formatDate(quickView.lastBill) : "—"} />
                </div>

                <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                  <DetailRow label="Mobile number" value={quickView.customer.mobile} icon={Phone} />
                  <DetailRow label="WhatsApp number" value={quickView.customer.whatsapp} icon={MessageCircle} />
                  <DetailRow label="GSTIN" value={quickView.customer.gstin} icon={FileText} />
                  <DetailRow label="Opening balance" value={formatCurrency(num(quickView.customer.opening_balance))} icon={Wallet} />
                  <div className="sm:col-span-2">
                    <DetailRow label="Address" value={[quickView.customer.address, quickView.customer.city, quickView.customer.state, quickView.customer.pincode].filter(Boolean).join(", ")} icon={MapPin} />
                  </div>
                  <div className="sm:col-span-2">
                    <DetailRow label="Notes" value={quickView.customer.notes} icon={FileText} />
                  </div>
                </div>
              </div>

              <DialogFooter className="flex-col gap-2 border-t border-[#eeecf5] bg-[#faf9ff] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:space-x-0 sm:px-7">
                <Button type="button" variant="outline" onClick={() => setQuickView(null)} className={`h-10 gap-2 px-5 ${outlineBtn}`}>Close</Button>

                <div className="flex flex-wrap gap-2">
                  {quickReminder && (
                    <Button asChild variant="outline" className={`h-10 gap-2 px-4 ${outlineBtn}`}>
                      <a href={quickReminder} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" aria-hidden="true" /> Remind</a>
                    </Button>
                  )}
                  <Button type="button" variant="outline" onClick={() => { const customer = quickView.customer; setQuickView(null); customerForm.openEdit(customer) }} className={`h-10 gap-2 px-4 ${outlineBtn}`}>
                    <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
                  </Button>
                  <Button asChild variant="outline" className={`h-10 gap-2 px-4 font-semibold ${outlineBtn}`}>
                    <Link to={`/customers/${quickView.customer.id}`} onClick={() => setQuickView(null)}>Open full profile <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ARCHIVE */}
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        icon={Archive}
        tone="amber"
        title={`Archive ${archiveTarget?.customer.name || "customer"}?`}
        description="They will be hidden from your customer list but nothing is deleted. You can restore them anytime from the Archived filter."
        confirmLabel="Archive customer"
        loadingLabel="Archiving…"
        loading={busy}
        onConfirm={() => setArchived(archiveTarget, true)}
      >
        {archiveTarget?.due > 0 && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">
            This customer still owes <strong>{formatCurrency(archiveTarget.due)}</strong>. Their bills and dues stay in your records.
          </p>
        )}
      </ConfirmDialog>

      {/* TRASH REVIEW - STEP 1 */}
      <ConfirmDialog
        open={Boolean(deleteTarget) && deleteStage === "summary"}
        onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteStage("summary"); setDeleteName("") } }}
        icon={AlertTriangle}
        tone="amber"
        title={`Review ${deleteTarget?.customer.name || "customer"} account`}
        description="Review this customer’s account before moving it to Trash. You can restore it later."
        confirmLabel="Continue"
        loading={busy}
        onConfirm={() => { setDeleteName(""); setDeleteStage("confirm") }}
      >
        <div className="grid grid-cols-2 gap-2 text-left">
          <MiniStat label="Bills" value={deleteTarget?.bills ?? 0} />
          <MiniStat label="Outstanding" value={formatCurrency(deleteTarget?.due || 0)} tone={(deleteTarget?.due || 0) > 0 ? "rose" : "emerald"} />
          <MiniStat label="Advance held" value={formatCurrency(deleteTarget?.advance || 0)} />
          <MiniStat label="Overdue" value={formatCurrency(deleteTarget?.overdue || 0)} tone={(deleteTarget?.overdue || 0) > 0 ? "rose" : "slate"} />
        </div>
        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">The customer and its linked records will be moved to Trash. Nothing is permanently deleted at this step.</p>
      </ConfirmDialog>

      {/* TRASH CONFIRMATION - STEP 2 */}
      <ConfirmDialog
        open={Boolean(deleteTarget) && deleteStage === "confirm"}
        onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteStage("summary"); setDeleteName("") } }}
        icon={Trash2}
        tone="rose"
        title="Move customer to Trash?"
        description="The customer and linked records will be moved to Trash. You can restore them later or permanently delete them from the Trash page."
        confirmLabel="Move to Trash"
        loadingLabel="Moving…"
        loading={busy}
        onConfirm={handleDelete}
      />
    </div>
  )
}

/* ==================================================
   CUSTOMER DETAILS
================================================== */

function CustomerDetails({ currentShop, customerId }) {
  const navigate = useNavigate()
  const shopId = currentShop.id
  const today = getLocalDateString()

  const [customer, setCustomer] = useState(null)
  const [bills, setBills] = useState([])
  const [payments, setPayments] = useState([])
  const [advances, setAdvances] = useState([])
  const [itemsByBill, setItemsByBill] = useState({})
  const [itemsLoading, setItemsLoading] = useState(null)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [lastUpdated, setLastUpdated] = useState(null)

  const [period, setPeriod] = useState({ mode: "overall", from: "", to: "" })
  const [search, setSearch] = useState("")
  const [billFilter, setBillFilter] = useState("all")
  const [activeTab, setActiveTab] = useState("bills")
  const [expandedBill, setExpandedBill] = useState(null)
  const [page, setPage] = useState(1)

  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteStage, setDeleteStage] = useState("summary")
  const [deleteName, setDeleteName] = useState("")
  const [deleting, setDeleting] = useState(false)

  const hasLoaded = useRef(false)
  const requestRef = useRef(0)

  const range = useMemo(() => getRange(period, today), [period, today])
  const periodLabel = getPeriodLabel(period, range, today)
  const shortLabel = period.mode === "overall" ? "All time" : period.mode === "custom" ? "Selected dates" : getPeriodLabel(period, range, today).replace(/^Today,.*/, "Today")

  useEffect(() => {
    hasLoaded.current = false
    setCustomer(null)
    setBills([])
    setPayments([])
    setAdvances([])
    setItemsByBill({})
    setExpandedBill(null)
    setLoadError("")
    setLoading(true)
  }, [customerId, shopId])

  useEffect(() => {
    setPage(1)
  }, [activeTab, search, billFilter, range.from, range.to])

  const loadDetails = useCallback(
    async (showRefresh = false) => {
      const requestId = ++requestRef.current

      if (showRefresh || hasLoaded.current) setRefreshing(true)
      else setLoading(true)

      setLoadError("")

      try {
        const [customerRes, billRows, paymentRows, advanceRows] = await Promise.all([
          supabase.from("customers").select("*").eq("id", customerId).eq("shop_id", shopId).maybeSingle(),
          fetchAllRows(() =>
            supabase.from("bills").select("*").eq("shop_id", shopId).eq("customer_id", customerId).order("bill_date", { ascending: false }).order("id")
          ),
          fetchAllRows(() =>
            supabase.from("payments").select("*").eq("shop_id", shopId).eq("customer_id", customerId).order("payment_date", { ascending: false }).order("id")
          ),
          fetchAllRows(() =>
            supabase.from("customer_advances").select("*").eq("shop_id", shopId).eq("customer_id", customerId).order("created_at", { ascending: false }).order("id")
          ),
        ])

        if (customerRes.error) throw customerRes.error
        if (requestId !== requestRef.current) return

        setCustomer(customerRes.data || null)
        setBills(billRows)
        setPayments(paymentRows)
        setAdvances(advanceRows)
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
    [shopId, customerId]
  )

  useEffect(() => {
    loadDetails()
  }, [loadDetails])

  const customerForm = useCustomerForm({
    shopId,
    customers: [],
    onSaved: async (saved) => {
      if (saved?.id === customerId) setCustomer((previous) => ({ ...previous, ...saved }))
      await loadDetails(true)
    },
  })

  async function toggleBill(billId) {
    if (expandedBill === billId) return setExpandedBill(null)

    setExpandedBill(billId)
    if (itemsByBill[billId]) return

    setItemsLoading(billId)
    try {
      const { data, error } = await supabase
        .from("bill_items")
        .select("*")
        .eq("bill_id", billId)
        .order("sort_order", { ascending: true })

      if (error) throw error
      setItemsByBill((previous) => ({ ...previous, [billId]: data || [] }))
    } catch (error) {
      toast.error("Could not load bill items", { description: error?.message })
    } finally {
      setItemsLoading(null)
    }
  }

  async function setArchived(archived) {
    setArchiving(true)
    try {
      const { error } = await supabase
        .from("customers")
        .update({ is_active: !archived })
        .eq("id", customerId)
        .eq("shop_id", shopId)

      if (error) throw error

      toast.success(archived ? "Customer archived" : "Customer restored")
      setArchiveOpen(false)
      await loadDetails(true)
    } catch (error) {
      toast.error("Could not update customer", { description: error?.message })
    } finally {
      setArchiving(false)
    }
  }

  async function handleDeleteCustomer() {
    if (!customer) return
    setDeleting(true)
    try {
      await moveToTrash({ shopId, type: "customer", id: customer.id })
      toast.success("Customer moved to Trash", {
        description: "You can restore it or permanently delete it from the Trash page.",
      })
      setDeleteOpen(false)
      setDeleteStage("summary")
      setDeleteName("")
      navigate("/customers", { replace: true })
    } catch (error) {
      console.error("Move customer to Trash error:", error)
      toast.error("Unable to move customer to Trash", {
        description: error?.message || "Please check the Trash setup and database permissions.",
        duration: 7000,
      })
    } finally {
      setDeleting(false)
    }
  }

  /* ---------- derived numbers ---------- */

  const calc = useMemo(() => {
    const sum = (rows, key) => rows.reduce((total, row) => total + num(row[key]), 0)

    const periodBills = bills.filter((b) => inRange(b.bill_date, range))
    const periodPayments = payments.filter((p) => inRange(p.payment_date, range))

    const openingBalance = num(customer?.opening_balance)
    const billDue = sum(bills, "amount_due") // current, all time

    const received = (rows) =>
      Math.max(
        0,
        sum(rows.filter((p) => !p.is_advance && !p.is_refund), "amount") - sum(rows.filter((p) => p.is_refund), "amount")
      )

    const totalAdvanceReceived = sum(advances, "amount")
    const availableAdvance = sum(advances, "remaining_amount")

    const unpaidBills = bills.filter((b) => num(b.amount_due) > 0)
    const overdueBills = unpaidBills.filter((b) => b.due_date && b.due_date < today)
    const dueTodayBills = unpaidBills.filter((b) => b.due_date === today)

    const periodBilled = sum(periodBills, "grand_total")
    const periodCollected = Math.max(0, periodBilled - sum(periodBills, "amount_due"))

    const oldestOverdue = overdueBills.reduce((oldest, b) => (!oldest || b.due_date < oldest ? b.due_date : oldest), "")
    const latest = (rows, key) => rows.reduce((l, r) => (r[key] && r[key] > l ? r[key] : l), "")

    return {
      openingBalance,
      periodBills,
      periodPayments,
      periodBilled,
      periodReceived: received(periodPayments),
      periodRefunded: sum(periodPayments.filter((p) => p.is_refund), "amount"),
      periodCollected,
      collectionRate: periodBilled > 0 ? Math.min(100, Math.round((periodCollected / periodBilled) * 100)) : 0,
      averageBill: periodBills.length > 0 ? periodBilled / periodBills.length : 0,
      billDue,
      totalOutstanding: billDue + openingBalance,
      totalAdvanceReceived,
      availableAdvance,
      advanceAdjusted: Math.max(0, totalAdvanceReceived - availableAdvance),
      netPosition: billDue + openingBalance - availableAdvance,
      unpaidBills,
      overdueBills,
      overdueAmount: sum(overdueBills, "amount_due"),
      dueTodayBills,
      dueTodayAmount: sum(dueTodayBills, "amount_due"),
      oldestOverdueDays: oldestOverdue ? daysBetween(oldestOverdue, today) : 0,
      lastBillDate: latest(bills, "bill_date"),
      lastPaymentDate: latest(payments.filter((p) => !p.is_refund), "payment_date"),
    }
  }, [bills, payments, advances, customer, range, today])

  const periodAdvances = useMemo(
    () => advances.filter((a) => inRange(a.created_at?.split("T")[0], range)),
    [advances, range]
  )

  const billCounts = useMemo(() => {
    const counts = { all: calc.periodBills.length, unpaid: 0, partial: 0, paid: 0, overdue: 0 }
    calc.periodBills.forEach((bill) => {
      counts[getPaymentStatus(bill)] += 1
      if (num(bill.amount_due) > 0 && bill.due_date && bill.due_date < today) counts.overdue += 1
    })
    return counts
  }, [calc.periodBills, today])

  const filteredBills = useMemo(() => {
    const query = search.trim().toLowerCase()

    return calc.periodBills.filter((bill) => {
      if (query && !bill.bill_number?.toLowerCase().includes(query)) return false
      if (billFilter === "all") return true
      if (billFilter === "overdue") return num(bill.amount_due) > 0 && bill.due_date && bill.due_date < today
      return getPaymentStatus(bill) === billFilter
    })
  }, [calc.periodBills, search, billFilter, today])

  const statement = useMemo(() => {
    const rank = { opening: -1, bill: 0, advance: 1, payment: 2, refund: 3 }

    const transactions = [
      ...(calc.openingBalance > 0
        ? [{ id: "opening-balance", date: "", stamp: "", type: "opening", reference: "Before this app", description: "Opening balance", debit: calc.openingBalance, credit: 0 }]
        : []),
      ...bills.map((bill) => ({
        id: `bill-${bill.id}`, date: bill.bill_date, stamp: bill.created_at || "", type: "bill",
        reference: bill.bill_number, description: "Bill created", debit: num(bill.grand_total), credit: 0,
      })),
      ...payments.filter((p) => !p.is_advance).map((payment) => ({
        id: `payment-${payment.id}`, date: payment.payment_date, stamp: payment.created_at || "",
        type: payment.is_refund ? "refund" : "payment", reference: String(payment.id).slice(0, 8),
        description: payment.is_refund ? `Refund paid - ${payment.payment_mode || "Other"}` : `Payment received - ${payment.payment_mode || "Other"}`,
        debit: payment.is_refund ? num(payment.amount) : 0, credit: payment.is_refund ? 0 : num(payment.amount),
      })),
      ...advances.map((advance) => ({
        id: `advance-${advance.id}`, date: advance.created_at?.split("T")[0], stamp: advance.created_at || "",
        type: "advance", reference: String(advance.id).slice(0, 8), description: "Advance received",
        debit: 0, credit: num(advance.amount),
      })),
    ].sort(
      (a, b) => (a.date || "").localeCompare(b.date || "") || rank[a.type] - rank[b.type] || a.stamp.localeCompare(b.stamp)
    )

    let running = 0
    const withBalance = transactions.map((t) => {
      running += t.debit - t.credit
      return { ...t, balance: running }
    })

    const before = range.from ? withBalance.filter((t) => !t.date || t.date < range.from) : []
    const broughtForward = before.length ? before[before.length - 1].balance : 0
    const inPeriod = withBalance.filter((t) => (t.date ? inRange(t.date, range) : !range.from))

    const asc = [
      ...(range.from && broughtForward !== 0
        ? [{ id: "brought-forward", date: range.from, type: "bf", reference: `Before ${formatDate(range.from)}`, description: "Balance brought forward", debit: 0, credit: 0, balance: broughtForward }]
        : []),
      ...inPeriod,
    ]

    return {
      asc,
      rows: [...asc].reverse(),
      closing: asc.length ? asc[asc.length - 1].balance : 0,
      totalDebit: inPeriod.reduce((total, t) => total + t.debit, 0),
      totalCredit: inPeriod.reduce((total, t) => total + t.credit, 0),
    }
  }, [bills, payments, advances, calc.openingBalance, range])

  const reminderLink = useMemo(() => {
    if (!customer || calc.totalOutstanding <= 0) return null
    return whatsappLink(
      customer.whatsapp || customer.mobile,
      reminderText(customer.name, currentShop.name, calc.totalOutstanding, calc.overdueAmount)
    )
  }, [customer, calc.totalOutstanding, calc.overdueAmount, currentShop.name])

  async function exportCustomerPdf() {
    if (!customer) return

    try {
      let billItems = {}
      const billIds = bills.map((bill) => bill.id).filter(Boolean)

      if (billIds.length) {
        const { data, error } = await supabase
          .from("bill_items")
          .select("*")
          .in("bill_id", billIds)
          .order("sort_order", { ascending: true })

        if (error) throw error

        billItems = (data || []).reduce((result, item) => {
          if (!result[item.bill_id]) result[item.bill_id] = []
          result[item.bill_id].push(item)
          return result
        }, {})
      }

      generateCustomerPDF({
        customer,
        bills,
        payments,
        advances,
        statement,
        calc,
        shop: currentShop,
        periodLabel,
        itemsByBill: billItems,
      })

      toast.success("Customer account PDF exported")
    } catch (error) {
      console.error("Customer PDF export error:", error)
      toast.error("Could not export customer PDF", {
        description: error?.message || "Please try again.",
      })
    }
  }

  function exportStatement() {
    const header = ["Date", "Description", "Reference", "Debit", "Credit", "Balance"]
    const body = statement.asc.map((row) => [
      row.date || "",
      row.description,
      row.reference || "",
      row.debit || "",
      row.credit || "",
      row.balance,
    ])

    downloadCsv(`statement-${customer.name.replace(/\s+/g, "-").toLowerCase()}-${today}.csv`, [header, ...body])
    toast.success("Statement exported")
  }

  /* ---------- empty / loading ---------- */

  if (loading) return <PageSkeleton label="Loading customer" />

  if (!customer) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-3xl border border-dashed border-violet-200 bg-white/80 p-8 text-center">
        <div className="max-w-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
            <UserRound className="h-7 w-7" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">{loadError ? "Could not load customer" : "Customer not found"}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {loadError || "This customer may have been deleted or does not belong to this workspace."}
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {loadError && (
              <Button type="button" variant="outline" onClick={() => loadDetails()} className={`gap-2 px-4 ${outlineBtn}`}>
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> Try again
              </Button>
            )}
            <Button asChild variant="outline" className={`gap-2 px-4 ${outlineBtn}`}>
              <Link to="/customers"><ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> Back to customers</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const archived = customer.is_active === false
  const address = [customer.address, customer.city, customer.state, customer.pincode].filter(Boolean).join(", ")
  const customerSince = customer.created_at ? formatDate(customer.created_at.split("T")[0]) : ""
  const hasMobile = normalizeMobile(customer.mobile).length === 10

  const billsPage = paginate(filteredBills, page, DETAIL_PAGE_SIZE)
  const paymentsPage = paginate(calc.periodPayments, page, DETAIL_PAGE_SIZE)
  const advancesPage = paginate(periodAdvances, page, DETAIL_PAGE_SIZE)
  const statementPage = paginate(statement.rows, page, 12)

  const tabCount = { bills: calc.periodBills.length, payments: calc.periodPayments.length, advances: periodAdvances.length }

  /* ---------- render ---------- */

  return (
    <div className="min-h-full w-full space-y-4 rounded-2xl bg-[#f7f5ff] px-3 py-5 sm:px-5 lg:px-6">
      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div className="flex min-w-0 items-center gap-4">
          <Button asChild variant="outline" size="icon" aria-label="Back to customers" className="h-11 w-11 shrink-0 rounded-xl border-violet-200 bg-white/90 shadow-sm hover:bg-violet-50">
            <Link to="/customers"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>

          <Avatar name={customer.name} photo={customer.photo_url} className="h-16 w-16 shrink-0 overflow-hidden rounded-full border-4 border-white text-lg shadow-md" />

          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <span>{currentShop.name || "Workspace"}</span>
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
              <Link to="/customers" className="transition-colors hover:text-slate-800">Customers</Link>
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
              <span className="truncate">{customer.name}</span>
            </nav>

            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[26px] font-bold tracking-tight text-[#171a39] sm:text-[30px]">{customer.name}</h1>
              <TypePill>{customer.customer_type || "Individual"}</TypePill>
              {archived && <TypePill tone="slate">Archived</TypePill>}
            </div>

            <p className="mt-0.5 text-sm text-slate-600">
              {calc.totalOutstanding > 0 ? (
                <>
                  Owes <strong className="font-semibold text-rose-600">{formatCurrency(calc.totalOutstanding)}</strong>
                  {calc.unpaidBills.length > 0 && ` across ${calc.unpaidBills.length} ${calc.unpaidBills.length === 1 ? "bill" : "bills"}`}
                  {calc.openingBalance > 0 && " plus opening balance"}.
                </>
              ) : (
                "All payments are clear."
              )}
              {customerSince && <span className="text-slate-500"> Customer since {customerSince}.</span>}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PeriodMenu period={period} onChange={setPeriod} range={range} label={periodLabel} today={today} />

          <Button
            type="button"
            variant="outline"
            onClick={exportCustomerPdf}
            className={`h-11 gap-2 px-4 ${outlineBtn}`}
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            Customer PDF
          </Button>

          {hasMobile && (
            <Button asChild variant="outline" className={`h-11 gap-2 px-4 ${outlineBtn}`}>
              <a href={`tel:+91${normalizeMobile(customer.mobile)}`}><Phone className="h-4 w-4" aria-hidden="true" /> Call</a>
            </Button>
          )}

          {reminderLink && (
            <Button asChild variant="outline" className={`h-11 gap-2 px-4 ${outlineBtn}`}>
              <a href={reminderLink} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" aria-hidden="true" /> Remind</a>
            </Button>
          )}

          <Button type="button" variant="outline" onClick={() => customerForm.openEdit(customer)} className={`h-11 gap-2 px-4 ${outlineBtn}`}>
            <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
          </Button>

          <Button type="button" variant="outline" onClick={() => loadDetails(true)} disabled={refreshing} aria-label="Refresh customer" title="Refresh" className={`h-11 px-3 ${outlineBtn}`}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>

          <Button asChild variant="outline" className={`h-11 gap-2 px-5 font-semibold ${outlineBtn}`}>
            <Link to="/bills/new"><Plus className="h-5 w-5" aria-hidden="true" /> Create bill</Link>
          </Button>
        </div>
      </header>

      {loadError && <ErrorBanner message={loadError} onRetry={() => loadDetails(true)} />}

      <section aria-label="Financial overview" className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <SummaryCard label={`Billed (${shortLabel})`} value={formatCurrency(calc.periodBilled)} detail={`${calc.periodBills.length} ${calc.periodBills.length === 1 ? "bill" : "bills"} created`} icon={Wallet} tone="green" />
        <SummaryCard label={`Received (${shortLabel})`} value={formatCurrency(calc.periodReceived)} detail={calc.periodRefunded > 0 ? `After ${formatCurrency(calc.periodRefunded)} refunds` : "Recorded against bills"} icon={ArrowDownLeft} tone="blue" />
        <SummaryCard label="Outstanding dues" value={formatCurrency(calc.totalOutstanding)} detail={calc.openingBalance > 0 ? `Incl. ${formatCurrency(calc.openingBalance)} opening balance` : `${calc.unpaidBills.length} ${calc.unpaidBills.length === 1 ? "bill" : "bills"} unpaid`} icon={IndianRupee} tone="pink" valueClass={calc.totalOutstanding > 0 ? "text-rose-600" : "text-[#151934]"} />
        <SummaryCard label="Advance balance" value={formatCurrency(calc.availableAdvance)} detail={`${formatCurrency(calc.totalAdvanceReceived)} received in total`} icon={Layers} tone="purple" />
      </section>

      <section className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.65fr_1fr]">
        <div className="min-w-0 space-y-4">
          <div role="tablist" aria-label="Customer records" className="flex gap-1.5 overflow-x-auto rounded-2xl border border-white/80 bg-white/75 p-1.5 shadow-[0_3px_12px_rgba(80,65,130,0.06)]">
            {DETAIL_TABS.map((tab) => {
              const Icon = tab.icon
              const active = activeTab === tab.id
              const count = tabCount[tab.id]

              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 ${
                    active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-violet-50 hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {tab.label}
                  {count !== undefined && (
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">{count}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* BILLS */}
          {activeTab === "bills" && (
            <Card className={cardClass}>
              <SectionHeader
                icon={Receipt}
                title="Bills and purchases"
                description={`${periodLabel} · ${filteredBills.length} of ${calc.periodBills.length} shown`}
                action={
                  <Button asChild variant="outline" size="sm" className={`h-9 shrink-0 gap-2 px-3 text-xs font-semibold ${outlineBtn}`}>
                    <Link to="/bills/new"><Plus className="h-4 w-4" aria-hidden="true" /> New bill</Link>
                  </Button>
                }
              />

              <div className="space-y-3 border-b border-[#eeecf5] p-4 sm:px-5">
                <SearchBox value={search} onChange={setSearch} placeholder="Search bill number" label="Search bill number" />
                <div role="group" aria-label="Filter bills" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {BILL_FILTERS.map((filter) => (
                    <FilterChip key={filter.id} active={billFilter === filter.id} count={billCounts[filter.id]} onClick={() => setBillFilter(filter.id)}>
                      {filter.label}
                    </FilterChip>
                  ))}
                </div>
              </div>

              {filteredBills.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title={bills.length === 0 ? "No bills yet" : "No bills found"}
                  description={bills.length === 0 ? "Bills created for this customer will appear here." : "No bills match your dates, search or filter."}
                  action={bills.length === 0 ? (
                    <Button asChild variant="outline" className={`mt-4 gap-2 px-4 font-semibold ${outlineBtn}`}>
                      <Link to="/bills/new"><Plus className="h-4 w-4" aria-hidden="true" /> Create first bill</Link>
                    </Button>
                  ) : null}
                />
              ) : (
                <>
                  <div className="divide-y divide-[#eeecf5]">
                    {billsPage.items.map((bill) => {
                      const status = getPaymentStatus(bill)
                      const isExpanded = expandedBill === bill.id
                      const due = num(bill.amount_due)
                      const overdue = due > 0 && bill.due_date && bill.due_date < today
                      const overdueDays = overdue ? daysBetween(bill.due_date, today) : 0
                      const items = itemsByBill[bill.id] || []
                      const billPayments = payments.filter((p) => p.bill_id === bill.id)

                      return (
                        <div key={bill.id}>
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            onClick={() => toggleBill(bill.id)}
                            className="w-full p-4 text-left transition-colors hover:bg-[#f9f8ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 sm:px-5"
                          >
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                              <div className="flex min-w-0 items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                                  <FileText className="h-5 w-5" aria-hidden="true" />
                                </div>

                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-bold text-slate-900">{bill.bill_number || "Bill"}</p>
                                    <StatusPill status={status} />
                                    {overdue && <StatusPill status="overdue" />}
                                  </div>
                                  <p className="mt-1 text-xs text-slate-500">Billed on {bill.bill_date ? formatDate(bill.bill_date) : "—"}</p>
                                  <p className={`mt-0.5 flex items-center gap-1 text-xs ${overdue ? "font-semibold text-rose-600" : "text-slate-500"}`}>
                                    <CalendarDays className="h-3 w-3" aria-hidden="true" />
                                    {bill.due_date ? `Due ${formatDate(bill.due_date)}${overdue ? ` · ${overdueDays} ${overdueDays === 1 ? "day" : "days"} late` : ""}` : "No due date"}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-4 lg:justify-end">
                                <div className="grid grid-cols-3 gap-5 text-right">
                                  <div>
                                    <p className="text-[11px] font-medium text-slate-500">Total</p>
                                    <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">{formatCurrency(bill.grand_total)}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium text-slate-500">Paid</p>
                                    <p className="mt-1 text-sm font-semibold tabular-nums text-emerald-700">{formatCurrency(num(bill.amount_paid) + num(bill.advance_adjusted))}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium text-slate-500">Due</p>
                                    <p className={`mt-1 text-sm font-semibold tabular-nums ${due > 0 ? "text-rose-600" : "text-slate-400"}`}>{due > 0 ? formatCurrency(due) : "—"}</p>
                                  </div>
                                </div>
                                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
                              </div>
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="space-y-4 border-t border-[#eeecf5] bg-[#faf9ff] p-4 sm:p-5">
                              <div>
                                <h3 className="mb-2.5 text-sm font-bold text-slate-800">Purchased items</h3>

                                {itemsLoading === bill.id ? (
                                  <div className="space-y-2" aria-busy="true">
                                    <Skeleton className="h-10 w-full" />
                                    <Skeleton className="h-10 w-full" />
                                  </div>
                                ) : items.length === 0 ? (
                                  <p className="rounded-xl border border-dashed border-violet-200 bg-white px-4 py-4 text-xs text-slate-500">
                                    No item details for this bill{bill.attachment_url ? ". See the attached offline bill below." : "."}
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
                                              <p className="text-xs font-bold text-slate-800">{item.item_name}</p>
                                              {item.description && <p className="mt-0.5 text-[11px] text-slate-500">{item.description}</p>}
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{item.quantity} {item.unit}</td>
                                            <td className="whitespace-nowrap px-4 py-3 text-right text-xs tabular-nums text-slate-600">{formatCurrency(item.rate)}</td>
                                            <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-slate-600">{num(item.gst_percent)}%</td>
                                            <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-bold tabular-nums text-slate-900">{formatCurrency(item.total_amount)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>

                              <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-2xl border border-[#ece9f5] bg-white p-4">
                                  <h3 className="mb-3 text-sm font-bold text-slate-800">Bill summary</h3>
                                  <div className="space-y-2.5">
                                    <KeyValue label="Subtotal" value={formatCurrency(bill.subtotal)} />
                                    <KeyValue label="Discount" value={`-${formatCurrency(bill.discount_amount)}`} />
                                    <KeyValue label="GST" value={formatCurrency(bill.total_gst)} />
                                    {num(bill.round_off) !== 0 && <KeyValue label="Round off" value={formatCurrency(bill.round_off)} />}
                                    <div className="border-t border-[#eeecf5] pt-2.5">
                                      <KeyValue strong label="Grand total" value={formatCurrency(bill.grand_total)} />
                                    </div>
                                  </div>
                                </div>

                                <div className="rounded-2xl border border-[#ece9f5] bg-white p-4">
                                  <h3 className="mb-3 text-sm font-bold text-slate-800">Payment breakdown</h3>
                                  <div className="space-y-2.5">
                                    <KeyValue label="Direct payments" value={formatCurrency(bill.amount_paid)} valueClass="text-emerald-700" />
                                    <KeyValue label="Advance adjusted" value={formatCurrency(bill.advance_adjusted)} valueClass="text-emerald-700" />
                                    <div className="border-t border-[#eeecf5] pt-2.5">
                                      <KeyValue strong label="Remaining due" value={formatCurrency(bill.amount_due)} valueClass={due > 0 ? "text-rose-600" : "text-slate-800"} />
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {billPayments.length > 0 && (
                                <div className="rounded-2xl border border-[#ece9f5] bg-white p-4">
                                  <h3 className="mb-3 text-sm font-bold text-slate-800">Payment records</h3>
                                  <ul className="divide-y divide-[#eeecf5]">
                                    {billPayments.map((payment) => (
                                      <li key={payment.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                                        <div>
                                          <p className="text-xs font-bold text-slate-800">{payment.is_refund ? "Refund" : "Payment"} · {payment.payment_mode || "Other"}</p>
                                          <p className="mt-0.5 text-[11px] text-slate-500">{payment.payment_date ? formatDate(payment.payment_date) : "—"}</p>
                                        </div>
                                        <p className={`text-sm font-bold tabular-nums ${payment.is_refund ? "text-rose-600" : "text-emerald-700"}`}>
                                          {payment.is_refund ? "-" : "+"}{formatCurrency(payment.amount)}
                                        </p>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {bill.notes && (
                                <p className="rounded-xl border border-violet-100 bg-white px-4 py-3 text-xs leading-5 text-slate-600">
                                  <span className="font-bold text-slate-800">Note: </span>{bill.notes}
                                </p>
                              )}

                              <div className="flex flex-wrap items-center justify-end gap-2">
                                {bill.attachment_url && (
                                  <Button asChild variant="outline" size="sm" className={`h-9 gap-2 px-3 text-xs font-semibold ${outlineBtn}`}>
                                    <a href={bill.attachment_url} target="_blank" rel="noopener noreferrer"><Paperclip className="h-3.5 w-3.5" aria-hidden="true" /> Offline bill</a>
                                  </Button>
                                )}
                                <Button asChild variant="outline" size="sm" className={`h-9 gap-2 px-3 text-xs font-semibold ${outlineBtn}`}>
                                  <Link to={`/bills/${bill.id}`}>Open full bill <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <Pagination info={billsPage} onChange={setPage} noun="bills" />
                </>
              )}
            </Card>
          )}

          {/* PAYMENTS */}
          {activeTab === "payments" && (
            <Card className={cardClass}>
              <SectionHeader icon={CreditCard} title="Payment history" description={`${periodLabel} · ${calc.periodPayments.length} ${calc.periodPayments.length === 1 ? "entry" : "entries"}, net ${formatCurrency(calc.periodReceived)} against bills`} />

              {calc.periodPayments.length === 0 ? (
                <EmptyState icon={CreditCard} title="No payments in this period" description="Payments will appear here after they are recorded." />
              ) : (
                <>
                  <ul className="divide-y divide-[#eeecf5]">
                    {paymentsPage.items.map((payment) => {
                      const relatedBill = bills.find((bill) => bill.id === payment.bill_id)
                      const refund = Boolean(payment.is_refund)

                      return (
                        <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 transition-colors hover:bg-[#f9f8ff] sm:px-5">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${refund ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-700"}`}>
                              <ArrowDownLeft className={`h-5 w-5 ${refund ? "rotate-180" : ""}`} aria-hidden="true" />
                            </div>
                            <div className="min-w-0">
                              <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900">
                                {payment.payment_mode || "Payment"}
                                {payment.is_advance && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">Advance</span>}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {payment.payment_date ? formatDate(payment.payment_date) : "—"} ·{" "}
                                {relatedBill ? <Link to={`/bills/${relatedBill.id}`} className="font-semibold text-emerald-700 hover:underline">{relatedBill.bill_number}</Link> : "No bill reference"}
                              </p>
                            </div>
                          </div>

                          <div className="text-right">
                            <p className={`text-base font-bold tabular-nums ${refund ? "text-rose-600" : "text-emerald-700"}`}>{refund ? "-" : "+"}{formatCurrency(payment.amount)}</p>
                            <span className={`mt-1 inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${refund ? "border-rose-200 bg-rose-100 text-rose-700" : "border-emerald-200 bg-emerald-100 text-emerald-700"}`}>
                              {refund ? "Refunded" : payment.is_advance ? "Advance" : "Received"}
                            </span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                  <Pagination info={paymentsPage} onChange={setPage} noun="payments" />
                </>
              )}
            </Card>
          )}

          {/* ADVANCES */}
          {activeTab === "advances" && (
            <Card className={cardClass}>
              <SectionHeader icon={Wallet} title="Advance history" description={`${periodLabel} · deposits and what is left of each`} />

              {periodAdvances.length === 0 ? (
                <EmptyState icon={Wallet} title="No advance records" description="No advance payments were recorded in this period." />
              ) : (
                <>
                  <ul className="divide-y divide-[#eeecf5]">
                    {advancesPage.items.map((advance) => {
                      const original = num(advance.amount)
                      const remaining = num(advance.remaining_amount)
                      const adjusted = Math.max(0, original - remaining)
                      const usedPercent = original > 0 ? Math.min(100, Math.round((adjusted / original) * 100)) : 0

                      return (
                        <li key={advance.id} className="p-4 sm:p-5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-slate-900">Advance deposit</p>
                              <p className="mt-0.5 text-xs text-slate-500">{advance.created_at ? formatDate(advance.created_at.split("T")[0]) : "—"}</p>
                            </div>
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${remaining > 0 ? "border-emerald-200 bg-emerald-100 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"}`}>
                              {remaining > 0 ? "Available" : "Fully used"}
                            </span>
                          </div>

                          <div className="mt-4 grid grid-cols-3 gap-3">
                            <MiniStat label="Received" value={formatCurrency(original)} />
                            <MiniStat label="Adjusted" value={formatCurrency(adjusted)} />
                            <MiniStat label="Remaining" value={formatCurrency(remaining)} tone="emerald" />
                          </div>

                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-100" role="progressbar" aria-label="Advance used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={usedPercent}>
                            <div className="h-full rounded-full bg-violet-500 transition-all duration-500" style={{ width: `${usedPercent}%` }} />
                          </div>
                          <p className="mt-1.5 text-[11px] text-slate-500">{usedPercent}% used</p>

                          {advance.notes && <p className="mt-2 text-xs text-slate-600">{advance.notes}</p>}
                        </li>
                      )
                    })}
                  </ul>
                  <Pagination info={advancesPage} onChange={setPage} noun="advances" />
                </>
              )}
            </Card>
          )}

          {/* STATEMENT */}
          {activeTab === "statement" && (
            <Card className={cardClass}>
              <SectionHeader
                icon={History}
                title="Account statement"
                description={`${periodLabel} · bills, payments and advances in date order`}
                action={
                  <Button type="button" variant="outline" size="sm" onClick={exportStatement} disabled={statement.asc.length === 0} className={`h-9 shrink-0 gap-2 px-3 text-xs font-semibold ${outlineBtn}`}>
                    <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export
                  </Button>
                }
              />

              {statement.rows.length === 0 ? (
                <EmptyState icon={History} title="No account activity" description="Nothing was recorded in this period." />
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3 sm:px-5">
                    <MiniStat label="Total debit" value={formatCurrency(statement.totalDebit)} />
                    <MiniStat label="Total credit" value={formatCurrency(statement.totalCredit)} tone="emerald" />
                    <MiniStat label={statement.closing >= 0 ? "Closing balance (owes)" : "Closing balance (credit)"} value={formatCurrency(Math.abs(statement.closing))} tone={statement.closing > 0 ? "rose" : "emerald"} />
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
                        {statementPage.items.map((row) => (
                          <tr key={row.id} className={`border-b border-[#eeecf5] transition-colors last:border-0 hover:bg-[#f9f8ff] ${row.type === "bf" ? "bg-violet-50/50" : ""}`}>
                            <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">{row.date ? formatDate(row.date) : "—"}</td>
                            <td className="px-3 py-3">
                              <p className="text-xs font-bold text-slate-800">{row.description}</p>
                              <p className="mt-0.5 text-[11px] text-slate-500">{row.reference}</p>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold tabular-nums text-rose-600">{row.debit > 0 ? formatCurrency(row.debit) : "—"}</td>
                            <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold tabular-nums text-emerald-700">{row.credit > 0 ? formatCurrency(row.credit) : "—"}</td>
                            <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-bold tabular-nums text-slate-900">
                              {formatCurrency(Math.abs(row.balance))}
                              <span className="ml-1 text-[10px] font-semibold text-slate-400">{row.balance > 0 ? "Dr" : row.balance < 0 ? "Cr" : ""}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <Pagination info={statementPage} onChange={setPage} noun="rows" />

                  <p className="border-t border-[#eeecf5] px-5 py-3 text-[11px] leading-4 text-slate-500">
                    Dr means the customer owes you. Cr means you owe the customer (advance or refund due).
                  </p>
                </>
              )}
            </Card>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4">
          <Card className={cardClass}>
            <SectionHeader
              icon={UserRound}
              title="Customer information"
              description="Saved contact and business details."
              action={
                <Button type="button" variant="outline" size="sm" onClick={() => customerForm.openEdit(customer)} className={`h-9 shrink-0 gap-2 px-3 text-xs font-semibold ${outlineBtn}`}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                </Button>
              }
            />
            <CardContent className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-1">
              <DetailRow label="Mobile number" value={customer.mobile} icon={Phone} />
              <DetailRow label="WhatsApp" value={customer.whatsapp} icon={MessageCircle} />
              <DetailRow label="Customer type" value={customer.customer_type || "Individual"} icon={Building2} />
              <DetailRow label="GSTIN" value={customer.gstin} icon={FileText} />
              <div className="sm:col-span-2 xl:col-span-1"><DetailRow label="Address" value={address} icon={MapPin} /></div>
            </CardContent>
          </Card>

          <Card className={cardClass}>
            <SectionHeader icon={Clock3} title="Due overview" description="Pending payment deadlines. Always current." />
            <CardContent className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label="Overdue" value={formatCurrency(calc.overdueAmount)} note={calc.overdueBills.length > 0 ? `${calc.overdueBills.length} ${calc.overdueBills.length === 1 ? "bill" : "bills"} · oldest ${calc.oldestOverdueDays}d` : "Nothing overdue"} tone={calc.overdueAmount > 0 ? "rose" : "slate"} />
                <MiniStat label="Due today" value={formatCurrency(calc.dueTodayAmount)} note={`${calc.dueTodayBills.length} ${calc.dueTodayBills.length === 1 ? "bill" : "bills"}`} tone={calc.dueTodayAmount > 0 ? "amber" : "slate"} />
              </div>

              <div className="space-y-2.5 border-t border-[#eeecf5] pt-3">
                <KeyValue label="Pending bills" value={calc.unpaidBills.length} valueClass="text-slate-900" />
                <KeyValue label="Pending on bills" value={formatCurrency(calc.billDue)} />
                <KeyValue label="Opening balance" value={formatCurrency(calc.openingBalance)} />
                <KeyValue label="Total outstanding" value={formatCurrency(calc.totalOutstanding)} valueClass={calc.totalOutstanding > 0 ? "text-rose-600" : "text-slate-800"} />
                <KeyValue label="Less: advance held" value={`-${formatCurrency(calc.availableAdvance)}`} valueClass="text-violet-700" />
                <div className="border-t border-[#eeecf5] pt-2.5">
                  <KeyValue strong label={calc.netPosition >= 0 ? "Net receivable" : "Net payable"} value={formatCurrency(Math.abs(calc.netPosition))} valueClass={calc.netPosition > 0 ? "text-rose-600" : "text-emerald-700"} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={cardClass}>
            <SectionHeader icon={TrendingUp} title="Account health" description={`Collection for ${periodLabel.toLowerCase()}.`} />
            <CardContent className="space-y-4 p-5">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-emerald-800">Collection rate</p>
                    <p className="mt-2 text-[28px] font-extrabold leading-none tracking-tight text-slate-900 tabular-nums">{calc.collectionRate}%</p>
                    <p className="mt-1.5 text-xs text-slate-600">{formatCurrency(calc.periodCollected)} of {formatCurrency(calc.periodBilled)}</p>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm"><Wallet className="h-5 w-5" aria-hidden="true" /></div>
                </div>

                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-rose-100" role="progressbar" aria-label="Collection rate" aria-valuemin={0} aria-valuemax={100} aria-valuenow={calc.collectionRate}>
                  <div className="h-full rounded-full bg-emerald-600 transition-all duration-500" style={{ width: `${calc.collectionRate}%` }} />
                </div>
              </div>

              <div className="space-y-2.5">
                <KeyValue label="Average bill value" value={formatCurrency(calc.averageBill)} />
                <KeyValue label="Last bill" value={calc.lastBillDate ? formatDate(calc.lastBillDate) : "—"} />
                <KeyValue label="Last payment" value={calc.lastPaymentDate ? formatDate(calc.lastPaymentDate) : "—"} />
                <KeyValue label="Advance adjusted" value={formatCurrency(calc.advanceAdjusted)} />
              </div>
            </CardContent>
          </Card>

          <Card className={cardClass}>
            <SectionHeader icon={FileText} title="Notes and account" />
            <CardContent className="space-y-4 p-5">
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{customer.notes || "No additional notes."}</p>

              <div className="border-t border-[#eeecf5] pt-4">
                {archived ? (
                  <Button type="button" variant="outline" onClick={() => setArchived(false)} disabled={archiving} className={`h-10 w-full gap-2 px-4 ${outlineBtn}`}>
                    {archiving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArchiveRestore className="h-4 w-4" aria-hidden="true" />}
                    Restore customer
                  </Button>
                ) : (
                  <Button type="button" variant="outline" onClick={() => setArchiveOpen(true)} className={`h-10 w-full gap-2 px-4 ${outlineBtn}`}>
                    <Archive className="h-4 w-4" aria-hidden="true" /> Archive customer
                  </Button>
                )}

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setDeleteName(""); setDeleteStage("summary"); setDeleteOpen(true) }}
                  disabled={deleting}
                  className={`mt-2 h-10 w-full gap-2 ${dangerOutlineBtn}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Move to Trash
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <Footer icon={UserRound} left={<>Customer:<strong className="ml-1 text-slate-700">{customer.name}</strong></>} lastUpdated={lastUpdated} />

      <CustomerFormDialog ctl={customerForm} />

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        icon={Archive}
        tone="amber"
        title={`Archive ${customer.name}?`}
        description="They will be hidden from your customer list but nothing is deleted. You can restore them anytime."
        confirmLabel="Archive customer"
        loadingLabel="Archiving…"
        loading={archiving}
        onConfirm={() => setArchived(true)}
      >
        {calc.totalOutstanding > 0 && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">
            This customer still owes <strong>{formatCurrency(calc.totalOutstanding)}</strong>. Their bills and dues stay in your records.
          </p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={deleteOpen && deleteStage === "summary"}
        onOpenChange={(open) => { if (!open) { setDeleteOpen(false); setDeleteStage("summary"); setDeleteName("") } }}
        icon={AlertTriangle}
        tone="amber"
        title={`Review ${customer.name} account`}
        description="Review the records linked to this customer before moving the account to Trash."
        confirmLabel="Continue"
        onConfirm={() => { setDeleteName(""); setDeleteStage("confirm") }}
      >
        <div className="grid grid-cols-2 gap-2 text-left">
          <MiniStat label="Bills" value={bills.length} />
          <MiniStat label="Payments" value={payments.length} />
          <MiniStat label="Advances" value={advances.length} />
          <MiniStat label="Advance amount" value={formatCurrency(advances.reduce((sum, row) => sum + num(row.amount), 0))} />
          <MiniStat label="Outstanding" value={formatCurrency(calc.totalOutstanding)} tone={calc.totalOutstanding > 0 ? "rose" : "emerald"} />
          <MiniStat label="Opening balance" value={formatCurrency(calc.openingBalance)} />
        </div>
        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">The customer and its linked records will be moved to Trash. Nothing is permanently deleted at this step.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={deleteOpen && deleteStage === "confirm"}
        onOpenChange={(open) => { if (!open) { setDeleteOpen(false); setDeleteStage("summary"); setDeleteName("") } }}
        icon={Trash2}
        tone="rose"
        title="Move customer to Trash?"
        description="The customer and linked records will be moved to Trash. You can restore them later or permanently delete them from the Trash page."
        confirmLabel="Move to Trash"
        loadingLabel="Moving…"
        loading={deleting}
        onConfirm={handleDeleteCustomer}
      />
    </div>
  )
}

/* ==================================================
   ROUTE ENTRY
================================================== */

export default function Customers() {
  const { currentShop } = useShop()
  const { customerId } = useParams()

  if (!currentShop) {
    return <NoShopState title="No workspace selected" description="Select a workspace to manage its customers." />
  }

  if (customerId) {
    return <CustomerDetails key={customerId} currentShop={currentShop} customerId={customerId} />
  }

  return <CustomersList currentShop={currentShop} />
}