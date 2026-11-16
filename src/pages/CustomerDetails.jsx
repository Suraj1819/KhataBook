import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatDate, CUSTOMER_TYPES } from "@/lib/utils"
import { generateCustomerDetailsPDF } from "@/lib/customerDetailsPdf"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import {
  AlertCircle,
  AlertTriangle,
  Camera,
  Pencil,
  Plus,
  Loader2,
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
  Download,
  Filter,
  X,
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
const FETCH_BATCH = 1000

// Supabase returns at most 1,000 rows by default. Page through every matching
// record so customer history and totals never silently stop at the first batch.
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

function formatDateTime(value) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return formatDate(String(value).split("T")[0])
  return `${formatDate(localDateString(date))} · ${date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
}

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
      className="min-h-full w-full min-w-0 space-y-4 overflow-x-hidden rounded-2xl bg-[#f7f5ff] px-2.5 py-4 sm:px-5 sm:py-5 lg:px-6"
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
    <div className="flex flex-col items-stretch gap-3 border-b border-[#eae7f4] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700">
          <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </div>

        <div className="min-w-0">
          <h2 className="text-[16px] font-bold tracking-tight text-[#171a36]">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
      </div>

      {action && <div className="w-full min-w-0 sm:w-auto sm:shrink-0">{action}</div>}
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


const MAX_PHOTO_BYTES = 2 * 1024 * 1024
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"]
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/
const emptyForm = {
  name: "", mobile: "", whatsapp: "", address: "", city: "", state: "",
  pincode: "", gstin: "", customer_type: "Individual", opening_balance: "",
  notes: "", photo: null, photo_preview: "",
}
const FORM_TEXT_FIELDS = ["name", "mobile", "whatsapp", "address", "city", "state", "pincode", "gstin", "customer_type", "opening_balance", "notes"]
const fieldClass = "h-11 rounded-xl border-violet-100 bg-white text-sm shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20"
const outlineBtn = "rounded-xl border-violet-200 bg-white text-slate-700 shadow-sm hover:bg-violet-50"

function normalizeMobile(value) {
  const digits = String(value || "").replace(/\D/g, "")
  return digits.length > 10 ? digits.slice(-10) : digits
}

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


const CONFIRM_TONES = {
  rose: { box: "bg-rose-100/80 text-rose-600", button: "border-rose-200 bg-white text-rose-700 hover:bg-rose-50" },
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
                      <Button type="button" variant="outline" onClick={ctl.removePhoto} className="h-9 gap-2 rounded-xl border-rose-200 bg-white text-xs text-rose-700 shadow-sm hover:bg-rose-50">
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
   CUSTOMER DETAILS
================================================== */

export default function CustomerDetails() {
  const { customerId } = useParams()
  const { currentShop } = useShop()

  const [customer, setCustomer] = useState(null)
  const [bills, setBills] = useState([])
  const [payments, setPayments] = useState([])
  const [advances, setAdvances] = useState([])
  const [advanceAllocations, setAdvanceAllocations] = useState([])
  const [billItems, setBillItems] = useState([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [lastUpdated, setLastUpdated] = useState(null)

  const [search, setSearch] = useState("")
  const [billFilter, setBillFilter] = useState("all")
  const [billDateFilter, setBillDateFilter] = useState("")
  const [billFromDate, setBillFromDate] = useState("")
  const [billToDate, setBillToDate] = useState("")
  const [paymentSearch, setPaymentSearch] = useState("")
  const [paymentModeFilter, setPaymentModeFilter] = useState("all")
  const [paymentTypeFilter, setPaymentTypeFilter] = useState("all")
  const [paymentDateFilter, setPaymentDateFilter] = useState("")
  const [paymentFromDate, setPaymentFromDate] = useState("")
  const [paymentToDate, setPaymentToDate] = useState("")
  const [advanceSearch, setAdvanceSearch] = useState("")
  const [advanceStatusFilter, setAdvanceStatusFilter] = useState("all")
  const [advanceDateFilter, setAdvanceDateFilter] = useState("")
  const [advanceFromDate, setAdvanceFromDate] = useState("")
  const [advanceToDate, setAdvanceToDate] = useState("")
  const [statementSearch, setStatementSearch] = useState("")
  const [statementTypeFilter, setStatementTypeFilter] = useState("all")
  const [statementDateFilter, setStatementDateFilter] = useState("")
  const [statementFromDate, setStatementFromDate] = useState("")
  const [statementToDate, setStatementToDate] = useState("")
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
    setAdvanceAllocations([])
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
        const [customerRes, safeBills, safePayments, safeAdvances] = await Promise.all([
          supabase
            .from("customers")
            .select("*")
            .eq("id", customerId)
            .eq("shop_id", currentShop.id)
            .maybeSingle(),

          fetchAllRows(() =>
            supabase
              .from("bills")
              .select("*")
              .eq("shop_id", currentShop.id)
              .eq("customer_id", customerId)
              .order("bill_date", { ascending: false })
              .order("id", { ascending: false })
          ),

          fetchAllRows(() =>
            supabase
              .from("payments")
              .select("*")
              .eq("shop_id", currentShop.id)
              .eq("customer_id", customerId)
              .order("payment_date", { ascending: false })
              .order("id", { ascending: false })
          ),

          fetchAllRows(() =>
            supabase
              .from("customer_advances")
              .select("*")
              .eq("shop_id", currentShop.id)
              .eq("customer_id", customerId)
              .order("created_at", { ascending: false })
              .order("id", { ascending: false })
          ),
        ])

        if (customerRes.error) throw customerRes.error

        const billIds = safeBills.map((bill) => bill.id).filter(Boolean)
        const advanceIds = safeAdvances.map((advance) => advance.id).filter(Boolean)

        const [items, allocations] = await Promise.all([
          billIds.length
            ? fetchAllRows(() =>
                supabase
                  .from("bill_items")
                  .select("*")
                  .in("bill_id", billIds)
                  .order("sort_order", { ascending: true })
              )
            : Promise.resolve([]),
          advanceIds.length
            ? fetchAllRows(() =>
                supabase
                  .from("advance_allocations")
                  .select("id, advance_id, bill_id, amount, created_at")
                  .in("advance_id", advanceIds)
                  .order("created_at", { ascending: true })
                  .order("id", { ascending: true })
              )
            : Promise.resolve([]),
        ])

        // A newer request has started — ignore this result
        if (requestId !== requestRef.current) return

        setCustomer(customerRes.data || null)
        setBills(safeBills)
        setPayments(safePayments)
        setAdvances(safeAdvances)
        setAdvanceAllocations(allocations)
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

  // Keep this profile current when bills, payments or advances are changed
  // elsewhere in the app. Focus/visibility and a light polling fallback cover
  // deployments where Supabase Realtime is not enabled for every table.
  useEffect(() => {
    if (!currentShop?.id || !customerId) return undefined

    let refreshTimer = null
    const refresh = () => {
      if (document.visibilityState !== "visible") return
      if (refreshTimer) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => loadCustomerDetails(true), 350)
    }

    const channel = supabase
      .channel(`customer-detail-sync-${currentShop.id}-${customerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bills", filter: `customer_id=eq.${customerId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: `customer_id=eq.${customerId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_advances", filter: `customer_id=eq.${customerId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "advance_allocations" }, refresh)
      .subscribe()

    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh()
    }
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", onVisibility)
    const interval = window.setInterval(refresh, 30000)

    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer)
      window.clearInterval(interval)
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", onVisibility)
      supabase.removeChannel(channel)
    }
  }, [currentShop?.id, customerId, loadCustomerDetails])

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
      if (billFromDate && (bill.bill_date || "") < billFromDate) return false
      if (billToDate && (bill.bill_date || "") > billToDate) return false

      if (billFilter === "all") return true
      if (billFilter === "overdue") {
        return num(bill.amount_due) > 0 && bill.due_date && bill.due_date < today
      }
      return getPaymentStatus(bill) === billFilter
    })
  }, [bills, search, billFilter, billDateFilter, billFromDate, billToDate, today])

  // Unified payment history: include regular receipts, refunds and advance deposits.
  // Some installations mirror an advance in `payments`; avoid showing that same
  // deposit twice when it is also present in `customer_advances`.
  const paymentHistoryRows = useMemo(() => {
    const rows = payments.map((payment) => {
      const bill = bills.find((item) => item.id === payment.bill_id)
      const date = payment.payment_date || payment.created_at?.split("T")[0] || ""
      return {
        id: `payment-${payment.id}`,
        originalId: payment.id,
        source: "payment",
        date,
        stamp: payment.created_at || payment.payment_date || date,
        mode: payment.payment_mode || "Other",
        amount: num(payment.amount),
        isRefund: Boolean(payment.is_refund),
        isAdvance: Boolean(payment.is_advance),
        isAdjustment: false,
        billId: payment.bill_id || null,
        billNumber: bill?.bill_number || "",
        notes: payment.notes || payment.remark || "",
        raw: payment,
      }
    })

    advances.forEach((advance) => {
      const advanceDate = advance.created_at?.split("T")[0] || advance.advance_date || ""
      const mirrored = payments.some((payment) => {
        if (!payment.is_advance) return false
        const paymentDate = payment.payment_date || payment.created_at?.split("T")[0] || ""
        return (
          (payment.advance_id && payment.advance_id === advance.id) ||
          (paymentDate === advanceDate && Math.abs(num(payment.amount) - num(advance.amount)) < 0.01)
        )
      })
      if (!mirrored) {
        rows.push({
          id: `advance-${advance.id}`,
          originalId: advance.id,
          source: "advance",
          date: advanceDate,
          stamp: advance.created_at || advance.advance_date || advanceDate,
          mode: advance.payment_mode || "Advance",
          amount: num(advance.amount),
          isRefund: false,
          isAdvance: true,
          isAdjustment: false,
          billId: null,
          billNumber: "",
          notes: advance.notes || "",
          raw: advance,
        })
      }
    })

    // Show every advance allocation as its own dated transaction in Payment History.
    // It is informational only and is not counted as another cash receipt.
    advanceAllocations.forEach((allocation) => {
      const relatedBill = bills.find((item) => item.id === allocation.bill_id)
      const relatedAdvance = advances.find((item) => item.id === allocation.advance_id)
      rows.push({
        id: `adjustment-${allocation.id}`,
        originalId: allocation.id,
        source: "adjustment",
        date: allocation.created_at?.split("T")[0] || "",
        stamp: allocation.created_at || "",
        mode: "Advance adjustment",
        amount: num(allocation.amount),
        isRefund: false,
        isAdvance: false,
        isAdjustment: true,
        billId: allocation.bill_id || null,
        billNumber: relatedBill?.bill_number || "",
        notes: relatedAdvance ? `Adjusted from advance ${String(relatedAdvance.id).slice(0, 8)}` : "Advance allocated to bill",
        raw: allocation,
      })
    })

    return rows.sort((a, b) => {
      const dateOrder = (b.date || "").localeCompare(a.date || "")
      if (dateOrder) return dateOrder
      return new Date(b.stamp || 0).getTime() - new Date(a.stamp || 0).getTime()
    })
  }, [payments, advances, bills, advanceAllocations])

  const filteredPaymentHistory = useMemo(() => {
    const query = paymentSearch.trim().toLowerCase()
    return paymentHistoryRows.filter((row) => {
      if (paymentDateFilter && row.date !== paymentDateFilter) return false
      if (paymentFromDate && row.date < paymentFromDate) return false
      if (paymentToDate && row.date > paymentToDate) return false
      if (paymentModeFilter !== "all" && row.mode.toLowerCase() !== paymentModeFilter) return false
      if (paymentTypeFilter === "refund" && !row.isRefund) return false
      if (paymentTypeFilter === "advance" && !row.isAdvance) return false
      if (paymentTypeFilter === "adjustment" && !row.isAdjustment) return false
      if (paymentTypeFilter === "received" && (row.isRefund || row.isAdvance || row.isAdjustment)) return false
      if (query) {
        const haystack = [row.mode, row.billNumber, row.notes, row.date, row.amount].join(" ").toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
  }, [paymentHistoryRows, paymentSearch, paymentDateFilter, paymentFromDate, paymentToDate, paymentModeFilter, paymentTypeFilter])

  const paymentModeOptions = useMemo(
    () => [...new Set(paymentHistoryRows.map((row) => row.mode).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [paymentHistoryRows]
  )

  const paymentTypeCounts = useMemo(() => ({
    all: paymentHistoryRows.length,
    received: paymentHistoryRows.filter((row) => !row.isRefund && !row.isAdvance && !row.isAdjustment).length,
    advance: paymentHistoryRows.filter((row) => row.isAdvance).length,
    adjustment: paymentHistoryRows.filter((row) => row.isAdjustment).length,
    refund: paymentHistoryRows.filter((row) => row.isRefund).length,
  }), [paymentHistoryRows])

  const filteredAdvances = useMemo(() => {
    const query = advanceSearch.trim().toLowerCase()
    return advances.filter((advance) => {
      const date = advance.created_at?.split("T")[0] || advance.advance_date || ""
      const remaining = num(advance.remaining_amount)
      const haystack = [advance.payment_mode, advance.notes, advance.amount, date, advance.id].join(" ").toLowerCase()
      if (query && !haystack.includes(query)) return false
      if (advanceDateFilter && date !== advanceDateFilter) return false
      if (advanceFromDate && date < advanceFromDate) return false
      if (advanceToDate && date > advanceToDate) return false
      if (advanceStatusFilter === "available" && remaining <= 0) return false
      if (advanceStatusFilter === "used" && remaining > 0) return false
      return true
    }).sort((a, b) => (b.created_at || b.advance_date || "").localeCompare(a.created_at || a.advance_date || ""))
  }, [advances, advanceSearch, advanceDateFilter, advanceFromDate, advanceToDate, advanceStatusFilter])

  const advanceStatusCounts = useMemo(() => ({
    all: advances.length,
    available: advances.filter((advance) => num(advance.remaining_amount) > 0).length,
    used: advances.filter((advance) => num(advance.remaining_amount) <= 0).length,
  }), [advances])

  const downloadRowsCsv = (headings, rows, filename) => {
    if (!rows.length) {
      toast.error("No records to export")
      return
    }
    const cell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`
    const csv = "\uFEFF" + [headings, ...rows].map((row) => row.map(cell).join(",")).join("\r\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  // Export a complete advance ledger for the selected advance deposits.
  // Every receipt and every allocation is a separate dated event; the running
  // balance is recalculated from the exported events so the CSV reconciles.
  const exportAdvanceRows = (selectedAdvances, filename = "customer-advance-history.csv") => {
    if (!selectedAdvances.length) {
      toast.error("No advance records to export")
      return
    }

    const selectedIds = new Set(selectedAdvances.map((advance) => String(advance.id)))
    const events = []

    selectedAdvances.forEach((advance) => {
      const stamp = advance.created_at || advance.advance_date || ""
      events.push({
        advanceId: advance.id,
        stamp,
        date: stamp ? stamp.split("T")[0] : "",
        type: "Advance received",
        mode: advance.payment_mode || "Advance",
        reference: String(advance.id),
        billNumber: "",
        received: num(advance.amount),
        adjusted: 0,
        notes: advance.notes || "",
      })
    })

    advanceAllocations
      .filter((allocation) => selectedIds.has(String(allocation.advance_id)))
      .forEach((allocation) => {
        const stamp = allocation.created_at || ""
        const relatedBill = bills.find((bill) => bill.id === allocation.bill_id)
        const relatedAdvance = selectedAdvances.find((advance) => String(advance.id) === String(allocation.advance_id))
        events.push({
          advanceId: allocation.advance_id,
          stamp,
          date: stamp ? stamp.split("T")[0] : "",
          type: "Advance adjusted",
          mode: relatedAdvance?.payment_mode || "Advance",
          reference: String(allocation.id),
          billNumber: relatedBill?.bill_number || String(allocation.bill_id || ""),
          received: 0,
          adjusted: num(allocation.amount),
          notes: relatedBill ? `Adjusted against ${relatedBill.bill_number}` : "Advance allocated to bill",
        })
      })

    events.sort((a, b) => {
      const timeDiff = new Date(a.stamp || `${a.date}T00:00:00`).getTime() - new Date(b.stamp || `${b.date}T00:00:00`).getTime()
      if (timeDiff) return timeDiff
      return a.type.localeCompare(b.type)
    })

    let runningBalance = 0
    let totalReceived = 0
    let totalAdjusted = 0
    const rows = events.map((event) => {
      runningBalance += event.received - event.adjusted
      totalReceived += event.received
      totalAdjusted += event.adjusted
      const parsed = event.stamp ? new Date(event.stamp) : null
      const validDate = parsed && !Number.isNaN(parsed.getTime())
      return [
        event.date,
        validDate ? parsed.toLocaleDateString("en-IN", { weekday: "long" }) : "",
        validDate && event.stamp.includes("T") ? parsed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : "Time not recorded",
        event.type,
        event.mode,
        event.received,
        event.adjusted,
        runningBalance,
        event.billNumber,
        event.advanceId,
        event.reference,
        event.notes,
      ]
    })
    rows.push([
      "", "", "", "CLOSING SUMMARY", "", totalReceived, totalAdjusted,
      runningBalance, "", "", "", `Total transactions: ${events.length}`,
    ])

    downloadRowsCsv(
      ["Date", "Day", "Time", "Transaction", "Payment mode", "Advance received", "Advance adjusted", "Running available balance", "Bill number", "Advance ID", "Transaction ID", "Notes"],
      rows,
      filename
    )
    toast.success(`Complete advance history exported (${events.length} transactions)`)
  }

  const exportStatementRows = (rows, filename = "customer-account-statement.csv") => {
    downloadRowsCsv(
      ["Date", "Day", "Time", "Type", "Description", "Reference", "Debit", "Credit", "Advance adjusted", "Running balance", "Balance type"],
      rows.map((row) => {
        const parsed = row.stamp ? new Date(row.stamp) : null
        return [row.date, parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleDateString("en-IN", { weekday: "long" }) : "", parsed && !Number.isNaN(parsed.getTime()) && row.stamp?.includes("T") ? parsed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "", row.type, row.description, row.reference, row.debit, row.credit, row.adjustmentAmount || 0, Math.abs(row.balance), row.balance > 0 ? "Dr" : row.balance < 0 ? "Cr" : "Settled"]
      }),
      filename
    )
  }

  const exportPaymentHistory = (rows, filename = "customer-payment-history.csv") => {
    if (!rows.length) {
      toast.error("No payment records to export")
      return
    }
    const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`
    const headings = ["Date", "Day", "Time", "Type", "Payment mode", "Amount", "Bill number", "Notes"]
    const data = rows.map((row) => {
      const dateObj = row.stamp ? new Date(row.stamp) : new Date(`${row.date}T00:00:00`)
      return [
        row.date,
        dateObj.toLocaleDateString("en-IN", { weekday: "long" }),
        row.stamp ? dateObj.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "",
        row.isAdjustment ? "Advance adjusted" : row.isRefund ? "Refund" : row.isAdvance ? "Advance received" : "Payment received",
        row.mode,
        row.isRefund ? -row.amount : row.amount,
        row.billNumber,
        row.notes,
      ]
    })
    const csv = "\uFEFF" + [headings, ...data].map((line) => line.map(csvCell).join(",")).join("\r\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  // Ledger: bills increase the balance due; receipts/advances reduce it.
  // Advance allocations are included as zero-value informational events because
  // the advance was already credited when it was received (no double counting).
  const statement = useMemo(() => {
    const rank = { bill: 0, advance: 1, advance_adjustment: 2, payment: 3, refund: 4 }
    const billById = new Map(bills.map((bill) => [bill.id, bill]))

    const transactions = [
      ...bills.map((bill) => ({
        id: `bill-${bill.id}`,
        date: bill.bill_date || bill.created_at?.split("T")[0] || "",
        stamp: bill.created_at || bill.bill_date || "",
        type: "bill",
        billId: bill.id,
        reference: bill.bill_number || String(bill.id).slice(0, 8),
        description: "Bill created",
        debit: num(bill.grand_total),
        credit: 0,
      })),
      ...payments.filter((payment) => !payment.is_advance).map((payment) => ({
        id: `payment-${payment.id}`,
        date: payment.payment_date || payment.created_at?.split("T")[0] || "",
        stamp: payment.created_at || payment.payment_date || "",
        type: payment.is_refund ? "refund" : "payment",
        billId: payment.bill_id || null,
        reference: bills.find((bill) => bill.id === payment.bill_id)?.bill_number || String(payment.id).slice(0, 8),
        description: payment.is_refund
          ? `Refund paid - ${payment.payment_mode || "Other"}`
          : `Payment received - ${payment.payment_mode || "Other"}`,
        debit: payment.is_refund ? num(payment.amount) : 0,
        credit: payment.is_refund ? 0 : num(payment.amount),
      })),
      ...advances.map((advance) => ({
        id: `advance-${advance.id}`,
        date: advance.created_at?.split("T")[0] || advance.advance_date || "",
        stamp: advance.created_at || advance.advance_date || "",
        type: "advance",
        reference: String(advance.id).slice(0, 8),
        description: `Advance received${advance.payment_mode ? ` - ${advance.payment_mode}` : ""}`,
        debit: 0,
        credit: num(advance.amount),
      })),
      ...advanceAllocations.map((allocation) => {
        const relatedBill = billById.get(allocation.bill_id)
        return {
          id: `advance-adjustment-${allocation.id}`,
          date: allocation.created_at?.split("T")[0] || "",
          stamp: allocation.created_at || "",
          type: "advance_adjustment",
          billId: allocation.bill_id || null,
          adjustmentAmount: num(allocation.amount),
          reference: relatedBill?.bill_number || String(allocation.bill_id || "").slice(0, 8),
          description: `Advance adjusted · ${formatCurrency(num(allocation.amount))}`,
          debit: 0,
          credit: 0,
        }
      }),
    ].sort((a, b) => {
      const dateOrder = (a.date || "").localeCompare(b.date || "")
      if (dateOrder) return dateOrder
      const aTime = a.stamp ? new Date(a.stamp).getTime() : 0
      const bTime = b.stamp ? new Date(b.stamp).getTime() : 0
      if (aTime !== bTime) return aTime - bTime
      return (rank[a.type] ?? 99) - (rank[b.type] ?? 99)
    })

    let running = 0
    const rows = transactions.map((transaction) => {
      running += transaction.debit - transaction.credit
      return { ...transaction, balance: running }
    }).reverse()

    return {
      rows,
      closing: running,
      totalDebit: transactions.reduce((total, transaction) => total + transaction.debit, 0),
      totalCredit: transactions.reduce((total, transaction) => total + transaction.credit, 0),
    }
  }, [bills, payments, advances, advanceAllocations])


  const filteredStatementRows = useMemo(() => {
    const query = statementSearch.trim().toLowerCase()
    return statement.rows.filter((row) => {
      if (statementDateFilter && row.date !== statementDateFilter) return false
      if (statementFromDate && row.date < statementFromDate) return false
      if (statementToDate && row.date > statementToDate) return false
      if (statementTypeFilter !== "all" && row.type !== statementTypeFilter) return false
      if (query && ![row.description, row.reference, row.date, row.type, row.debit, row.credit, row.adjustmentAmount].join(" ").toLowerCase().includes(query)) return false
      return true
    })
  }, [statement.rows, statementSearch, statementDateFilter, statementFromDate, statementToDate, statementTypeFilter])

  const statementTypeCounts = useMemo(() => ({
    all: statement.rows.length,
    bill: statement.rows.filter((row) => row.type === "bill").length,
    payment: statement.rows.filter((row) => row.type === "payment").length,
    refund: statement.rows.filter((row) => row.type === "refund").length,
    advance: statement.rows.filter((row) => row.type === "advance").length,
    advance_adjustment: statement.rows.filter((row) => row.type === "advance_adjustment").length,
  }), [statement.rows])

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

  const handleExportBillsCsv = (rowsToExport = filteredBills, filenameOverride = "") => {
    if (!rowsToExport.length) {
      toast.error("No bills to export", { description: "Adjust your search or filters and try again." })
      return
    }

    const columns = [
      ["Bill Number", "bill_number"],
      ["Bill Date", "bill_date"],
      ["Created Date", "__created_date"],
      ["Created Day", "__created_day"],
      ["Created Time", "__created_time"],
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
      ...rowsToExport.map((bill) =>
        columns.map(([, key]) => {
          const createdStamp = bill.created_at || bill.bill_date || ""
          const createdDate = createdStamp ? new Date(createdStamp) : null
          const validCreatedDate = createdDate && !Number.isNaN(createdDate.getTime())
          const value = key === "status"
            ? (num(bill.amount_due) <= 0
                ? "Paid"
                : num(bill.amount_paid) > 0 || num(bill.advance_adjusted) > 0
                  ? "Partial"
                  : "Unpaid")
            : key === "__created_date"
              ? (validCreatedDate ? createdDate.toLocaleDateString("en-CA") : bill.bill_date || "")
              : key === "__created_day"
                ? (validCreatedDate ? createdDate.toLocaleDateString("en-IN", { weekday: "long" }) : "")
                : key === "__created_time"
                  ? (validCreatedDate && String(createdStamp).includes("T") ? createdDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : "Time not recorded")
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
    link.download = filenameOverride || `bills-${String(customer.name || "customer").trim().replace(/[^a-z0-9-_]+/gi, "-")}-${dateSuffix}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    toast.success(`${rowsToExport.length} bill${rowsToExport.length === 1 ? "" : "s"} exported to CSV`)
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

  const customerForm = useCustomerForm({
    shopId: currentShop?.id,
    customers: customer ? [customer] : [],
    onSaved: async (saved) => {
      setCustomer(saved)
      await loadCustomerDetails(true)
    },
  })

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

            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-xl font-bold leading-tight tracking-tight text-[#171a39] sm:text-[30px]">
                {customer.name}
              </h1>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => customerForm.openEdit(customer)}
                aria-label={`Edit ${customer.name}`}
                title="Edit customer"
                className="h-7 w-7 shrink-0 rounded-lg border-violet-200 bg-white text-slate-600 shadow-sm hover:bg-violet-50 hover:text-violet-700"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>

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

      <section className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
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
                action={
                  <Button type="button" variant="outline" size="sm" onClick={() => handleExportBillsCsv(filteredBills)} disabled={!filteredBills.length} className="h-9 shrink-0 gap-2 rounded-xl border-violet-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-violet-50">
                    <Download className="h-4 w-4" /> Export
                  </Button>
                }
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
                    <div className="min-w-[150px]">
                      <label htmlFor="customer-bill-from" className="mb-1.5 block text-xs font-semibold text-slate-600">From</label>
                      <Input id="customer-bill-from" type="date" value={billFromDate} onChange={(event) => setBillFromDate(event.target.value)} className="h-10 w-full min-w-0 rounded-xl border-violet-100 bg-white text-sm" />
                    </div>
                    <div className="min-w-[150px]">
                      <label htmlFor="customer-bill-to" className="mb-1.5 block text-xs font-semibold text-slate-600">To</label>
                      <Input id="customer-bill-to" type="date" value={billToDate} onChange={(event) => setBillToDate(event.target.value)} className="h-10 w-full min-w-0 rounded-xl border-violet-100 bg-white text-sm" />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => { setBillDateFilter(today); setBillFromDate(""); setBillToDate("") }}
                      className="h-10 rounded-xl border-violet-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-violet-50"
                    >
                      <CalendarDays className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      Today
                    </Button>
                    {(billDateFilter || billFromDate || billToDate) && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => { setBillDateFilter(""); setBillFromDate(""); setBillToDate("") }}
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
                description={`${filteredPaymentHistory.length} of ${paymentHistoryRows.length} records · net ${formatCurrency(calc.totalReceived)}`}
                action={
                  <Button type="button" variant="outline" size="sm" onClick={() => exportPaymentHistory(filteredPaymentHistory, `payments-${customer?.name || "customer"}.csv`)} disabled={!filteredPaymentHistory.length} className="h-9 shrink-0 gap-2 rounded-xl border-violet-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-violet-50">
                    <Download className="h-4 w-4" /> Export
                  </Button>
                }
              />

              {paymentHistoryRows.length === 0 ? (
                <EmptyState icon={CreditCard} title="No payments recorded" description="Payments, refunds and advance deposits from this customer will appear here." />
              ) : (
                <>
                  <div className="border-b border-[#eeecf5] bg-[#fcfbff] p-4 sm:p-5">
                    <div className="relative min-w-0">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input value={paymentSearch} onChange={(event) => setPaymentSearch(event.target.value)} placeholder="Search amount, bill, mode…" aria-label="Search payment history" className="h-11 w-full rounded-xl border-violet-100 bg-white pl-10 text-sm shadow-none focus-visible:border-violet-400 focus-visible:ring-2 focus-visible:ring-violet-500/20" />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {[
                        { id: "all", label: "All" },
                        { id: "received", label: "Payments" },
                        { id: "advance", label: "Advance received" },
                        { id: "adjustment", label: "Advance adjusted" },
                        { id: "refund", label: "Refunds" },
                      ].map((filter) => {
                        const active = paymentTypeFilter === filter.id
                        return (
                          <button key={filter.id} type="button" onClick={() => setPaymentTypeFilter(filter.id)} aria-pressed={active}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${active ? "border-violet-200 bg-violet-50 text-violet-800" : "border-violet-100 bg-white text-slate-600 hover:bg-violet-50"}`}>
                            {filter.label}<span className="ml-1.5 text-slate-400">{paymentTypeCounts[filter.id]}</span>
                          </button>
                        )
                      })}
                    </div>

                    {paymentModeOptions.length > 1 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {[{ id: "all", label: "All modes" }, ...paymentModeOptions.map((mode) => ({ id: mode.toLowerCase(), label: mode }))].map((filter) => {
                          const active = paymentModeFilter === filter.id
                          const count = filter.id === "all" ? paymentHistoryRows.length : paymentHistoryRows.filter((row) => row.mode.toLowerCase() === filter.id).length
                          return (
                            <button key={filter.id} type="button" onClick={() => setPaymentModeFilter(filter.id)} aria-pressed={active}
                              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${active ? "border-violet-200 bg-violet-50 text-violet-800" : "border-violet-100 bg-white text-slate-600 hover:bg-violet-50"}`}>
                              {filter.label}<span className="ml-1.5 text-slate-400">{count}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}

                    <div className="mt-3 border-t border-[#eeecf5] pt-3">
                      <div className="mb-2 text-xs font-semibold text-slate-600">Filter by payment date</div>
                      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="block min-w-0 text-xs font-semibold text-slate-600">Date
                          <Input type="date" value={paymentDateFilter} onChange={(event) => setPaymentDateFilter(event.target.value)} className="mt-1 h-10 w-full min-w-0 rounded-xl border-violet-100 bg-white text-sm" />
                        </label>
                        <label className="block min-w-0 text-xs font-semibold text-slate-600">From
                          <Input type="date" value={paymentFromDate} onChange={(event) => setPaymentFromDate(event.target.value)} className="mt-1 h-10 w-full min-w-0 rounded-xl border-violet-100 bg-white text-sm" />
                        </label>
                        <label className="block min-w-0 text-xs font-semibold text-slate-600">To
                          <Input type="date" value={paymentToDate} onChange={(event) => setPaymentToDate(event.target.value)} className="mt-1 h-10 w-full min-w-0 rounded-xl border-violet-100 bg-white text-sm" />
                        </label>
                        <div className="flex items-end">
                          <Button type="button" variant="outline" onClick={() => { setPaymentDateFilter(today); setPaymentFromDate(""); setPaymentToDate("") }} className="h-10 w-full rounded-xl border-violet-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-violet-50 sm:w-auto">
                            <CalendarDays className="mr-1.5 h-4 w-4" /> Today
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-slate-500"><Filter className="mr-1 inline h-3.5 w-3.5" /> Showing {filteredPaymentHistory.length} of {paymentHistoryRows.length} records</p>
                      {(paymentSearch || paymentModeFilter !== "all" || paymentTypeFilter !== "all" || paymentDateFilter || paymentFromDate || paymentToDate) && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => { setPaymentSearch(""); setPaymentModeFilter("all"); setPaymentTypeFilter("all"); setPaymentDateFilter(""); setPaymentFromDate(""); setPaymentToDate("") }} className="h-8 gap-1.5 rounded-lg px-2 text-xs text-violet-700 hover:bg-violet-50">
                          <X className="h-3.5 w-3.5" /> Clear filters
                        </Button>
                      )}
                    </div>
                  </div>

                  {filteredPaymentHistory.length === 0 ? (
                    <EmptyState icon={Search} title="No matching transactions" description="Try changing the date range or clearing one of the filters." />
                  ) : (
                    <ul className="divide-y divide-[#eeecf5]">
                      {filteredPaymentHistory.map((row) => {
                        const refund = row.isRefund
                        const adjustment = row.isAdjustment
                        const stampDate = row.stamp ? new Date(row.stamp) : (row.date ? new Date(`${row.date}T00:00:00`) : null)
                        const weekday = stampDate && !Number.isNaN(stampDate.getTime()) ? stampDate.toLocaleDateString("en-IN", { weekday: "long" }) : ""
                        const time = row.stamp ? stampDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "Time not recorded"
                        return (
                          <li key={row.id} className="flex min-w-0 flex-col items-stretch gap-3 px-4 py-4 transition-colors hover:bg-[#f9f8ff] sm:flex-row sm:items-center sm:justify-between sm:px-5">
                            <div className="flex min-w-0 w-full flex-1 items-start gap-3 sm:items-center">
                              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${refund ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-700"}`}>
                                <ArrowDownLeft className={`h-5 w-5 ${refund ? "rotate-180" : ""}`} aria-hidden="true" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-900">
                                  {row.mode}
                                  {row.isAdvance && <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">Advance received</span>}
                                  {adjustment && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Adjusted</span>}
                                  {refund && <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">Refund</span>}
                                </p>
                                <p className="mt-0.5 break-words text-xs leading-5 text-slate-500">{row.date ? formatDate(row.date) : "Date not recorded"}{weekday ? ` · ${weekday}` : ""} · {time}{row.billNumber ? ` · ${row.billNumber}` : " · No bill reference"}</p>
                                {row.notes && <p className="mt-1 break-words text-xs text-slate-500">{row.notes}</p>}
                              </div>
                            </div>
                            <div className="flex w-full min-w-0 items-center justify-end gap-3 pl-[52px] sm:w-auto sm:justify-end sm:pl-0">
                              <div className="min-w-0 text-left sm:min-w-[115px] sm:text-right">
                                <p className={`text-base font-bold tabular-nums ${refund ? "text-rose-600" : adjustment ? "text-violet-700" : "text-emerald-700"}`}>{refund ? "−" : adjustment ? "" : "+"}{formatCurrency(row.amount)}</p>
                                <span className={`mt-1 inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${refund ? "border-rose-200 bg-rose-100 text-rose-700" : adjustment ? "border-amber-200 bg-amber-100 text-amber-700" : "border-emerald-200 bg-emerald-100 text-emerald-700"}`}>{refund ? "Refunded" : adjustment ? "Adjusted" : "Received"}</span>
                              </div>

                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </>
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
                action={
                  <Button type="button" variant="outline" size="sm" onClick={() => exportAdvanceRows(filteredAdvances)} disabled={!filteredAdvances.length} className="h-9 shrink-0 gap-2 rounded-xl border-violet-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-violet-50">
                    <Download className="h-4 w-4" /> Export
                  </Button>
                }
              />

              {advances.length === 0 ? (
                <EmptyState
                  icon={Wallet}
                  title="No advance records"
                  description="No advance payments have been recorded for this customer."
                />
              ) : (
                <>
                  <div className="border-b border-[#eeecf5] bg-[#fcfbff] p-4 sm:p-5">
                    <div className="relative min-w-0">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input value={advanceSearch} onChange={(event) => setAdvanceSearch(event.target.value)} placeholder="Search amount, mode or note…" aria-label="Search advances" className="h-11 w-full rounded-xl border-violet-100 bg-white pl-10 text-sm shadow-none focus-visible:border-violet-400 focus-visible:ring-2 focus-visible:ring-violet-500/20" />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {[
                        { id: "all", label: "All" },
                        { id: "available", label: "Available balance" },
                        { id: "used", label: "Fully used" },
                      ].map((filter) => {
                        const active = advanceStatusFilter === filter.id
                        return (
                          <button key={filter.id} type="button" onClick={() => setAdvanceStatusFilter(filter.id)} aria-pressed={active}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${active ? "border-violet-200 bg-violet-50 text-violet-800" : "border-violet-100 bg-white text-slate-600 hover:bg-violet-50"}`}>
                            {filter.label}<span className="ml-1.5 text-slate-400">{advanceStatusCounts[filter.id]}</span>
                          </button>
                        )
                      })}
                    </div>

                    <div className="mt-3 border-t border-[#eeecf5] pt-3">
                      <div className="mb-2 text-xs font-semibold text-slate-600">Filter by advance date</div>
                      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="block min-w-0 text-xs font-semibold text-slate-600">Date
                          <Input type="date" value={advanceDateFilter} onChange={(event) => setAdvanceDateFilter(event.target.value)} className="mt-1 h-10 w-full min-w-0 rounded-xl border-violet-100 bg-white text-sm" />
                        </label>
                        <label className="block min-w-0 text-xs font-semibold text-slate-600">From
                          <Input type="date" value={advanceFromDate} onChange={(event) => setAdvanceFromDate(event.target.value)} className="mt-1 h-10 w-full min-w-0 rounded-xl border-violet-100 bg-white text-sm" />
                        </label>
                        <label className="block min-w-0 text-xs font-semibold text-slate-600">To
                          <Input type="date" value={advanceToDate} onChange={(event) => setAdvanceToDate(event.target.value)} className="mt-1 h-10 w-full min-w-0 rounded-xl border-violet-100 bg-white text-sm" />
                        </label>
                        <div className="flex items-end">
                          <Button type="button" variant="outline" onClick={() => { setAdvanceDateFilter(today); setAdvanceFromDate(""); setAdvanceToDate("") }} className="h-10 w-full rounded-xl border-violet-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-violet-50 sm:w-auto">
                            <CalendarDays className="mr-1.5 h-4 w-4" /> Today
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-slate-500"><Filter className="mr-1 inline h-3.5 w-3.5" /> Showing {filteredAdvances.length} of {advances.length} records</p>
                      {(advanceSearch || advanceStatusFilter !== "all" || advanceDateFilter || advanceFromDate || advanceToDate) && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => { setAdvanceSearch(""); setAdvanceStatusFilter("all"); setAdvanceDateFilter(""); setAdvanceFromDate(""); setAdvanceToDate("") }} className="h-8 gap-1.5 rounded-lg px-2 text-xs text-violet-700 hover:bg-violet-50">
                          <X className="h-3.5 w-3.5" /> Clear filters
                        </Button>
                      )}
                    </div>
                  </div>

                  {filteredAdvances.length === 0 ? (
                    <EmptyState icon={Search} title="No advances match" description="Try changing or clearing the filters." />
                  ) : (
                    <ul className="divide-y divide-[#eeecf5]">
                      {filteredAdvances.map((advance) => {
                        const original = num(advance.amount)
                        const remaining = num(advance.remaining_amount)
                        const adjusted = Math.max(0, original - remaining)
                        const usedPercent = original > 0 ? Math.min(100, Math.round((adjusted / original) * 100)) : 0
                        return (
                          <li key={advance.id} className="p-4 sm:p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-bold text-slate-900">Advance deposit · {advance.payment_mode || "Other"}</p>
                                <p className="mt-0.5 text-xs text-slate-500">{formatDateTime(advance.created_at || advance.advance_date)}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${remaining > 0 ? "border-emerald-200 bg-emerald-100 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"}`}>{remaining > 0 ? "Available" : "Fully used"}</span>
                                
                              </div>
                            </div>
                            <div className="mt-4 grid grid-cols-1 gap-2 min-[420px]:grid-cols-3 sm:gap-3">
                              <MiniStat label="Received" value={formatCurrency(original)} />
                              <MiniStat label="Adjusted" value={formatCurrency(adjusted)} />
                              <MiniStat label="Remaining" value={formatCurrency(remaining)} tone="emerald" />
                            </div>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-100" role="progressbar" aria-label="Advance used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={usedPercent}>
                              <div className="h-full rounded-full bg-violet-500 transition-all duration-500" style={{ width: `${usedPercent}%` }} />
                            </div>
                            <p className="mt-1.5 text-[11px] text-slate-500">{usedPercent}% used</p>
                            {advance.notes && <p className="mt-2 text-xs text-slate-600">{advance.notes}</p>}
                            {advanceAllocations.filter((allocation) => allocation.advance_id === advance.id).length > 0 && (
                              <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/60 p-3">
                                <p className="text-[11px] font-bold uppercase tracking-wide text-violet-800">Adjustment history</p>
                                <ul className="mt-2 space-y-2">
                                  {advanceAllocations.filter((allocation) => allocation.advance_id === advance.id).map((allocation) => {
                                    const relatedBill = bills.find((bill) => bill.id === allocation.bill_id)
                                    return <li key={allocation.id} className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="min-w-0 text-slate-600">{relatedBill?.bill_number || `Bill ${String(allocation.bill_id || "").slice(0, 8)}`}<span className="ml-1 text-slate-400">· {formatDateTime(allocation.created_at)}</span></span><strong className="shrink-0 font-bold tabular-nums text-violet-800">{formatCurrency(allocation.amount)}</strong></li>
                                  })}
                                </ul>
                              </div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </>
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
                action={
                  <Button type="button" variant="outline" size="sm" onClick={() => exportStatementRows(filteredStatementRows)} disabled={!filteredStatementRows.length} className="h-9 shrink-0 gap-2 rounded-xl border-violet-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-violet-50">
                    <Download className="h-4 w-4" /> Export
                  </Button>
                }
              />

              {statement.rows.length === 0 ? (
                <EmptyState
                  icon={History}
                  title="No account activity"
                  description="Bills and payments will build this statement."
                />
              ) : (
                <>
                  <div className="border-b border-[#eeecf5] bg-[#fcfbff] p-4 sm:p-5">
                    <div className="relative min-w-0">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input value={statementSearch} onChange={(event) => setStatementSearch(event.target.value)} placeholder="Search description, bill number or amount…" aria-label="Search account statement" className="h-11 w-full rounded-xl border-violet-100 bg-white pl-10 text-sm shadow-none focus-visible:border-violet-400 focus-visible:ring-2 focus-visible:ring-violet-500/20" />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {[
                        { id: "all", label: "All" },
                        { id: "bill", label: "Bills" },
                        { id: "payment", label: "Payments" },
                        { id: "refund", label: "Refunds" },
                        { id: "advance", label: "Advance received" },
                        { id: "advance_adjustment", label: "Advance adjusted" },
                      ].map((filter) => {
                        const active = statementTypeFilter === filter.id
                        return (
                          <button key={filter.id} type="button" onClick={() => setStatementTypeFilter(filter.id)} aria-pressed={active}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${active ? "border-violet-200 bg-violet-50 text-violet-800" : "border-violet-100 bg-white text-slate-600 hover:bg-violet-50"}`}>
                            {filter.label}<span className="ml-1.5 text-slate-400">{statementTypeCounts[filter.id]}</span>
                          </button>
                        )
                      })}
                    </div>

                    <div className="mt-3 border-t border-[#eeecf5] pt-3">
                      <div className="mb-2 text-xs font-semibold text-slate-600">Filter by statement date</div>
                      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="block min-w-0 text-xs font-semibold text-slate-600">Date
                          <Input type="date" value={statementDateFilter} onChange={(event) => setStatementDateFilter(event.target.value)} className="mt-1 h-10 w-full min-w-0 rounded-xl border-violet-100 bg-white text-sm" />
                        </label>
                        <label className="block min-w-0 text-xs font-semibold text-slate-600">From
                          <Input type="date" value={statementFromDate} onChange={(event) => setStatementFromDate(event.target.value)} className="mt-1 h-10 w-full min-w-0 rounded-xl border-violet-100 bg-white text-sm" />
                        </label>
                        <label className="block min-w-0 text-xs font-semibold text-slate-600">To
                          <Input type="date" value={statementToDate} onChange={(event) => setStatementToDate(event.target.value)} className="mt-1 h-10 w-full min-w-0 rounded-xl border-violet-100 bg-white text-sm" />
                        </label>
                        <div className="flex items-end">
                          <Button type="button" variant="outline" onClick={() => { setStatementDateFilter(today); setStatementFromDate(""); setStatementToDate("") }} className="h-10 w-full rounded-xl border-violet-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-violet-50 sm:w-auto">
                            <CalendarDays className="mr-1.5 h-4 w-4" /> Today
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-slate-500"><Filter className="mr-1 inline h-3.5 w-3.5" /> Showing {filteredStatementRows.length} of {statement.rows.length} records</p>
                      {(statementSearch || statementTypeFilter !== "all" || statementDateFilter || statementFromDate || statementToDate) && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => { setStatementSearch(""); setStatementTypeFilter("all"); setStatementDateFilter(""); setStatementFromDate(""); setStatementToDate("") }} className="h-8 gap-1.5 rounded-lg px-2 text-xs text-violet-700 hover:bg-violet-50">
                          <X className="h-3.5 w-3.5" /> Clear filters
                        </Button>
                      )}
                    </div>
                  </div>
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
                    <table className="w-full min-w-[930px] text-left">
                      <caption className="sr-only">Account statement</caption>
                      <thead>
                        <tr className="bg-[#f5f3fc] text-[11px] font-semibold text-slate-600">
                          <th scope="col" className="rounded-l-xl px-3 py-3">Date</th>
                          <th scope="col" className="px-3 py-3">Time</th>
                          <th scope="col" className="px-3 py-3">Description</th>
                          <th scope="col" className="px-3 py-3 text-right">Debit</th>
                          <th scope="col" className="px-3 py-3 text-right">Credit</th>
                          <th scope="col" className="px-3 py-3 text-right">Advance adjusted</th>
                          <th scope="col" className="px-3 py-3 text-right">Balance</th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredStatementRows.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">No statement entries match these filters.</td></tr> : filteredStatementRows.map((row) => (
                          <tr
                            key={row.id}
                            className="border-b border-[#eeecf5] transition-colors last:border-0 hover:bg-[#f9f8ff]"
                          >
                            <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">
                              {row.date ? formatDate(row.date) : "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">
                              {row.stamp && !Number.isNaN(new Date(row.stamp).getTime())
                                ? new Date(row.stamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                                : "—"}
                            </td>
                            <td className="px-3 py-3">
                              {row.billId ? (
                                <Link
                                  to={`/bills/${row.billId}`}
                                  className="group inline-flex max-w-full flex-col rounded-md text-left outline-none transition-colors hover:text-violet-700 focus-visible:ring-2 focus-visible:ring-violet-500"
                                  title={`Open bill ${row.reference}`}
                                >
                                  <span className="text-xs font-bold text-slate-800 group-hover:text-violet-700 group-hover:underline">
                                    {row.description}
                                  </span>
                                  <span className="mt-0.5 text-[11px] text-slate-500 group-hover:text-violet-600">
                                    {row.reference} · Open bill ↗
                                  </span>
                                </Link>
                              ) : (
                                <>
                                  <p className="text-xs font-bold text-slate-800">{row.description}</p>
                                  <p className="mt-0.5 text-[11px] text-slate-500">{row.reference}</p>
                                </>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold tabular-nums text-rose-600">
                              {row.debit > 0 ? formatCurrency(row.debit) : "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold tabular-nums text-emerald-700">
                              {row.credit > 0 ? formatCurrency(row.credit) : "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold tabular-nums text-violet-700">
                              {row.adjustmentAmount > 0 ? formatCurrency(row.adjustmentAmount) : "—"}
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
                    due). Advance adjusted is shown separately for reference; it is not counted again because the
                    original advance receipt is already included in Credit.
                  </p>
                </>
              )}
            </Card>
          )}
        </div>

        {/* RIGHT COLUMN */}

        <div className="min-w-0 space-y-4">
          {/* CONTACT */}

          <Card className={cardClass}>
            <div className="flex items-center justify-between gap-3 border-b border-[#eae7f4] px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-white bg-violet-100 shadow-sm ring-1 ring-violet-100">
                  {getCustomerPhotoUrl(customer.photo_url) ? (
                    <img
                      src={getCustomerPhotoUrl(customer.photo_url)}
                      alt={`${customer.name} profile`}
                      className="h-full w-full object-cover"
                      onError={(event) => { event.currentTarget.style.display = "none" }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-bold text-violet-700">
                      {getInitials(customer.name)}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-[16px] font-bold tracking-tight text-[#171a36]">Customer details</h2>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{customer.name || "Customer profile"}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => customerForm.openEdit(customer)}
                className="h-9 shrink-0 gap-2 rounded-xl border-violet-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-violet-50 hover:text-violet-800"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Edit
              </Button>
            </div>

            <CardContent className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-1">
              <DetailRow label="Mobile number" value={customer.mobile} icon={Phone} />
              <DetailRow label="WhatsApp" value={customer.whatsapp} icon={MessageCircle} />
              <DetailRow label="Customer type" value={customer.customer_type || "Individual"} icon={Building2} />
              <DetailRow label="GSTIN" value={customer.gstin} icon={FileText} />
              <div className="sm:col-span-2 xl:col-span-1">
                <DetailRow label="Address" value={address} icon={MapPin} />
              </div>
              {customer.notes ? (
                <div className="sm:col-span-2 xl:col-span-1">
                  <DetailRow label="Notes" value={customer.notes} icon={FileText} />
                </div>
              ) : null}
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
      <CustomerFormDialog ctl={customerForm} />
    </div>
  )
}
