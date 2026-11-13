import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { BUSINESS_TYPES } from "@/lib/utils"
import { supabase } from "@/lib/supabase"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
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

import {
  AlertCircle,
  Box,
  Building2,
  Camera,
  ImagePlus,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  Copy,
  FileText,
  LayoutGrid,
  List,
  Loader2,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Store,
  Trash2,
  Upload,
  UserPlus,
  X,
  Receipt,
} from "lucide-react"

import { toast } from "sonner"

/* ==================================================
   CONSTANTS & HELPERS
================================================== */

const OTHER_TYPE = "Other"
const SHOP_LOGO_BUCKET = "avatars"
const SHOP_LOGO_MAX_BYTES = 2 * 1024 * 1024
const SHOP_LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"]

const getShopLogoStoragePath = (logoUrl) => {
  if (!logoUrl) return null

  // Accept either a stored storage path or a Supabase public object URL.
  if (!String(logoUrl).startsWith("http")) {
    return String(logoUrl)
      .replace(/^\/+/, "")
      .replace(/^avatars\//, "")
  }

  const marker = "/storage/v1/object/public/avatars/"
  const index = String(logoUrl).indexOf(marker)

  if (index === -1) return null

  return decodeURIComponent(
    String(logoUrl).slice(index + marker.length).split("?")[0]
  )
}

async function removeShopLogo(logoUrl) {
  const path = getShopLogoStoragePath(logoUrl)
  if (!path) return

  const { error } = await supabase.storage.from(SHOP_LOGO_BUCKET).remove([path])
  if (error) throw error
}

async function uploadShopLogo(shopId, file) {
  if (!file) return null
  if (!SHOP_LOGO_TYPES.includes(file.type)) {
    throw new Error("Use a JPG, PNG or WebP image.")
  }
  if (file.size > SHOP_LOGO_MAX_BYTES) {
    throw new Error("Shop logo must be smaller than 2 MB.")
  }

  const extension = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }[file.type]
  const unique =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  const path = `shoplogo/${shopId}/${Date.now()}-${unique}.${extension}`

  const { data, error } = await supabase.storage.from(SHOP_LOGO_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  })
  if (error) throw error

  const { data: publicData } = supabase.storage.from(SHOP_LOGO_BUCKET).getPublicUrl(data.path)
  if (!publicData?.publicUrl) {
    throw new Error("Logo uploaded, but its public URL could not be created. Check the avatars bucket.")
  }
  return publicData.publicUrl
}

const createEmptyShop = () => ({
  name: "",
  business_type: "General Store",
  business_type_other: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  mobile: "",
  gstin: "",
})

const PROFILE_FIELDS = [
  { key: "mobile", label: "Mobile" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "pincode", label: "Pincode" },
  { key: "gstin", label: "GSTIN" },
]

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
]

const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/
const MOBILE_PATTERN = /^(\+?91)?[6-9]\d{9}$/

// Shared look for every non-destructive action button
const outlineBtn =
  "rounded-xl border-violet-200 bg-white text-slate-700 shadow-sm hover:bg-violet-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"

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

function getCompleteness(shop) {
  const missing = PROFILE_FIELDS.filter((field) => !String(shop[field.key] || "").trim())
  const total = PROFILE_FIELDS.length
  const done = total - missing.length
  return {
    done,
    total,
    pct: Math.round((done / total) * 100),
    missing: missing.map((field) => field.label),
  }
}

function getLocation(shop) {
  return [shop.address, shop.city, shop.state, shop.pincode].filter(Boolean).join(", ")
}

function validateForm(form) {
  const errors = {}

  if (!form.name.trim()) errors.name = "Shop name is required"

  if (form.business_type === OTHER_TYPE && !String(form.business_type_other || "").trim()) {
    errors.business_type_other = "Please specify your business type"
  }

  const mobile = form.mobile.replace(/[\s-]/g, "")
  if (mobile && !MOBILE_PATTERN.test(mobile)) {
    errors.mobile = "Enter a valid 10-digit mobile number"
  }

  const gstin = form.gstin.trim().toUpperCase()
  if (gstin && !GSTIN_PATTERN.test(gstin)) {
    errors.gstin = "GSTIN must be 15 characters, like 22AAAAA0000A1Z5"
  }

  const pincode = form.pincode.trim()
  if (pincode && !/^\d{6}$/.test(pincode)) {
    errors.pincode = "Pincode must be 6 digits"
  }

  return errors
}

/* ==================================================
   SMALL UI PIECES
================================================== */

const SUMMARY_TONES = {
  green: { icon: "bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", accent: "text-emerald-700 dark:text-emerald-400" },
  blue: { icon: "bg-blue-100/80 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", accent: "text-blue-700 dark:text-blue-400" },
  pink: { icon: "bg-pink-100/80 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400", accent: "text-pink-700 dark:text-pink-400" },
  amber: { icon: "bg-amber-100/80 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", accent: "text-amber-700 dark:text-amber-400" },
  purple: { icon: "bg-violet-100/80 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400", accent: "text-violet-700 dark:text-violet-400" },
}

function SummaryCard({ label, value, detail, icon: Icon, tone = "green" }) {
  const style = SUMMARY_TONES[tone]

  return (
    <Card className="overflow-hidden rounded-[20px] border border-white/80 bg-white/80 shadow-[0_4px_15px_rgba(80,65,130,0.07)] backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/80">
      <CardContent className="flex min-w-0 items-center gap-4 p-4 sm:p-5">
        <div
          className={`flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full ${style.icon}`}
        >
          <Icon className="h-7 w-7" strokeWidth={1.9} aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-slate-600 dark:text-slate-400">{label}</p>
          <h3 className="mt-1.5 truncate text-[23px] font-bold leading-tight tracking-tight text-[#151934] tabular-nums dark:text-slate-100">
            {value}
          </h3>
          <p className={`mt-1.5 truncate text-xs font-semibold ${style.accent}`}>{detail}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function SectionHeader({ icon: Icon, title, description, action }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#eae7f4] px-5 py-4 dark:border-slate-800">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </div>

        <div className="min-w-0">
          <h2 className="text-[16px] font-bold tracking-tight text-[#171a36] dark:text-slate-100">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </div>

      {action}
    </div>
  )
}

function DetailItem({ icon: Icon, children, href }) {
  if (!children) return null

  return (
    <div className="flex min-w-0 items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
      {href ? (
        <a href={href} className="break-words font-medium hover:text-emerald-700 dark:hover:text-emerald-400">
          {children}
        </a>
      ) : (
        <span className="break-words">{children}</span>
      )}
    </div>
  )
}

function CompletenessBar({ shop, showMissing = false }) {
  const { pct, missing } = getCompleteness(shop)

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="font-semibold text-slate-600 dark:text-slate-400">Profile completeness</span>
        <span
          className={`font-bold tabular-nums ${
            pct === 100 ? "text-emerald-700 dark:text-emerald-400" : "text-slate-700 dark:text-slate-300"
          }`}
        >
          {pct}%
        </span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
        role="progressbar"
        aria-label={`${shop.name} profile completeness`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            pct === 100 ? "bg-emerald-600 dark:bg-emerald-500" : pct >= 50 ? "bg-amber-400 dark:bg-amber-500" : "bg-rose-400 dark:bg-rose-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showMissing && missing.length > 0 && (
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">Missing: {missing.join(", ")}</p>
      )}
    </div>
  )
}

function ActivePill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" aria-hidden="true" />
      Active
    </span>
  )
}

function TypePill({ children }) {
  return (
    <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-bold text-violet-700 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-400">
      {children || "General Store"}
    </span>
  )
}

function ShopActions({ shop, isActive, onSelect, onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-2">
      {!isActive && (
        <Button
          type="button"
          variant="outline"
          onClick={() => onSelect(shop)}
          className={`h-9 flex-1 gap-1.5 px-3 text-xs font-semibold sm:flex-none ${outlineBtn}`}
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Select shop
        </Button>
      )}

      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => onEdit(shop)}
        aria-label={`Edit ${shop.name}`}
        title="Edit shop"
        className={`h-9 w-9 ${outlineBtn}`}
      >
        <Pencil className="h-4 w-4" />
      </Button>

      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => onDelete(shop)}
        aria-label={`Delete ${shop.name}`}
        title="Delete shop"
        className="h-9 w-9 rounded-xl border-rose-200 bg-white text-rose-700 shadow-sm hover:bg-rose-50 dark:border-rose-900/50 dark:bg-slate-800 dark:text-rose-400 dark:hover:bg-rose-900/30"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

function ShopLogo({ shop, index = 0, active = false, size = "md" }) {
  const sizeClass = size === "lg" ? "h-16 w-16 text-lg" : size === "sm" ? "h-11 w-11 text-sm" : "h-12 w-12 text-sm"
  return (
    <div className={`relative flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded-full font-bold ${
      active
        ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
        : AVATAR_COLORS[index % AVATAR_COLORS.length]
    }`}>
      {shop.logo_url ? (
        <img src={shop.logo_url} alt={`${shop.name} logo`} className="h-full w-full object-cover" />
      ) : (
        getInitials(shop.name)
      )}
    </div>
  )
}

function ShopCard({ shop, index, isActive, onSelect, onEdit, onDelete }) {
  const location = getLocation(shop)

  return (
    <Card
      className={`flex h-full flex-col overflow-hidden rounded-[20px] border bg-white/90 shadow-[0_4px_15px_rgba(80,65,130,0.07)] transition-shadow hover:shadow-[0_8px_24px_rgba(80,65,130,0.12)] dark:bg-slate-900 ${
        isActive ? "border-violet-300 ring-1 ring-violet-200 dark:border-violet-700 dark:ring-violet-900/50" : "border-white/80 dark:border-slate-800"
      }`}
    >
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <ShopLogo shop={shop} index={index} active={isActive} />

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-bold tracking-tight text-[#171a36] dark:text-slate-100">
              {shop.name}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <TypePill>{shop.business_type}</TypePill>
              {isActive && <ActivePill />}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <DetailItem icon={Phone} href={shop.mobile ? `tel:${shop.mobile}` : undefined}>
            {shop.mobile}
          </DetailItem>
          <DetailItem icon={MapPin}>{location}</DetailItem>
          <DetailItem icon={FileText}>{shop.gstin ? `GSTIN: ${shop.gstin}` : null}</DetailItem>
          {!shop.mobile && !location && !shop.gstin && (
            <p className="text-xs text-slate-400 dark:text-slate-500">No contact or address details added yet.</p>
          )}
        </div>

        <div className="mt-auto space-y-4">
          <CompletenessBar shop={shop} />
          <div className="border-t border-[#eeecf5] pt-4 dark:border-slate-800">
            <ShopActions
              shop={shop}
              isActive={isActive}
              onSelect={onSelect}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ShopRow({ shop, index, isActive, onSelect, onEdit, onDelete }) {
  const location = getLocation(shop)

  return (
    <div className="flex flex-col gap-4 p-4 transition-colors hover:bg-[#f9f8ff] sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:hover:bg-slate-800/50">
      <div className="flex min-w-0 items-center gap-3">
        <ShopLogo shop={shop} index={index} active={isActive} size="sm" />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{shop.name}</h3>
            <TypePill>{shop.business_type}</TypePill>
            {isActive && <ActivePill />}
          </div>
          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
            {[shop.mobile, location].filter(Boolean).join(" · ") || "No contact details added yet"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 sm:shrink-0">
        <div className="hidden w-36 lg:block">
          <CompletenessBar shop={shop} />
        </div>
        <ShopActions
          shop={shop}
          isActive={isActive}
          onSelect={onSelect}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
    </div>
  )
}

function FieldInput({ id, label, required, error, className = "", ...props }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="dark:text-slate-300">
        {label} {required && <span className="text-rose-500">*</span>}
      </Label>

      <Input
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
        className={`h-11 rounded-xl border-slate-200 bg-white focus-visible:ring-emerald-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:ring-emerald-500 ${
          error ? "border-rose-300 dark:border-rose-800" : ""
        } ${className}`}
      />

      {error && (
        <p id={`${id}-error`} className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  )
}

function FormSection({ icon: Icon, title, children }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </div>
        <h3 className="text-sm font-bold text-[#171a36] dark:text-slate-100">{title}</h3>
      </div>
      {children}
    </div>
  )
}

/* ==================================================
   SETTINGS PAGE
================================================== */

export default function Settings() {
  const { shops, currentShop, createShop, updateShop, deleteShop, selectShop } = useShop()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(createEmptyShop)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState("")
  const [logoRemoved, setLogoRemoved] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState("")
  const [deleting, setDeleting] = useState(false)

  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [view, setView] = useState("grid")

  const shopList = shops || []
  const activeShop = shopList.find((shop) => shop.id === currentShop?.id) || null

  const isOtherType = form.business_type === OTHER_TYPE

  const businessTypeOptions = useMemo(() => {
    if (BUSINESS_TYPES.includes(OTHER_TYPE)) return BUSINESS_TYPES
    return [...BUSINESS_TYPES, OTHER_TYPE]
  }, [])

  /* --------------------------------------------------
     DERIVED DATA
  -------------------------------------------------- */

  const stats = useMemo(() => {
    const types = new Set(shopList.map((shop) => shop.business_type).filter(Boolean))
    const withGstin = shopList.filter((shop) => String(shop.gstin || "").trim()).length
    const completeness = shopList.map((shop) => getCompleteness(shop).pct)
    const average =
      completeness.length > 0
        ? Math.round(completeness.reduce((total, value) => total + value, 0) / completeness.length)
        : 0

    return {
      total: shopList.length,
      typeCount: types.size,
      withGstin,
      average,
      fullyComplete: completeness.filter((value) => value === 100).length,
    }
  }, [shopList])

  const typeCounts = useMemo(() => {
    const map = new Map()
    shopList.forEach((shop) => {
      const type = shop.business_type || "General Store"
      map.set(type, (map.get(type) || 0) + 1)
    })
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [shopList])

  const filteredShops = useMemo(() => {
    const query = search.trim().toLowerCase()

    const rows = shopList.filter((shop) => {
      const searchMatch =
        !query ||
        [shop.name, shop.business_type, shop.mobile, shop.city, shop.state, shop.gstin].some(
          (value) => String(value || "").toLowerCase().includes(query)
        )

      const typeMatch =
        typeFilter === "all" || (shop.business_type || "General Store") === typeFilter

      return searchMatch && typeMatch
    })

    return rows.sort((a, b) => {
      if (a.id === currentShop?.id) return -1
      if (b.id === currentShop?.id) return 1
      return String(a.name || "").localeCompare(String(b.name || ""))
    })
  }, [shopList, search, typeFilter, currentShop?.id])

  const hasActiveFilters = typeFilter !== "all" || search.trim() !== ""

  const clearFilters = () => {
    setSearch("")
    setTypeFilter("all")
  }

  /* --------------------------------------------------
     FORM HANDLERS
  -------------------------------------------------- */

  function updateForm(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }))
    setErrors((previous) => (previous[key] ? { ...previous, [key]: undefined } : previous))
  }

  function handleBusinessTypeChange(value) {
    setForm((previous) => ({
      ...previous,
      business_type: value,
      business_type_other: value === OTHER_TYPE ? previous.business_type_other : "",
    }))
    setErrors((previous) => {
      if (!previous.business_type_other) return previous
      return { ...previous, business_type_other: undefined }
    })
  }

  function openCreate() {
    setEditing(null)
    setForm(createEmptyShop())
    setLogoFile(null)
    setLogoPreview("")
    setLogoRemoved(false)
    setErrors({})
    setDialogOpen(true)
  }

  function openEdit(shop) {
    const isKnownType = BUSINESS_TYPES.includes(shop.business_type)
    setEditing(shop)
    setForm({
      name: shop.name || "",
      business_type: isKnownType ? shop.business_type : shop.business_type ? OTHER_TYPE : "General Store",
      business_type_other: isKnownType ? "" : shop.business_type || "",
      address: shop.address || "",
      city: shop.city || "",
      state: shop.state || "",
      pincode: shop.pincode || "",
      mobile: shop.mobile || "",
      gstin: shop.gstin || "",
    })
    setLogoFile(null)
    setLogoPreview(shop.logo_url || "")
    setLogoRemoved(false)
    setErrors({})
    setDialogOpen(true)
  }

  function handleDialogChange(open) {
    if (saving) return

    setDialogOpen(open)

    if (!open) {
      setEditing(null)
      setForm(createEmptyShop())
      setLogoFile(null)
      setLogoPreview("")
      setLogoRemoved(false)
      setErrors({})
    }
  }

  function handleLogoChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!SHOP_LOGO_TYPES.includes(file.type)) {
      toast.error("Use a JPG, PNG or WebP image.")
      event.target.value = ""
      return
    }
    if (file.size > SHOP_LOGO_MAX_BYTES) {
      toast.error("Shop logo must be smaller than 2 MB.")
      event.target.value = ""
      return
    }
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
    setLogoRemoved(false)
  }

  function removeLogo() {
    setLogoFile(null)
    setLogoPreview("")
    setLogoRemoved(true)
    const input = document.getElementById("shop-logo")
    if (input) input.value = ""
  }

  async function handleSave(event) {
    event.preventDefault()

    const nextErrors = validateForm(form)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      toast.error("Please fix the highlighted fields")
      return
    }

    setSaving(true)

    try {
      const resolvedType =
        form.business_type === OTHER_TYPE
          ? form.business_type_other.trim()
          : form.business_type

      const shopData = {
        ...form,
        business_type: resolvedType,
        name: form.name.trim(),
        mobile: form.mobile.trim() || null,
        gstin: form.gstin.trim().toUpperCase() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        pincode: form.pincode.trim() || null,
      }

      delete shopData.business_type_other

      let savedShop

      if (editing) {
        savedShop = await updateShop(editing.id, {
          ...shopData,
          ...(logoRemoved ? { logo_url: null } : {}),
        })
      } else {
        savedShop = await createShop(shopData)
      }

      if (logoFile) {
        const logoUrl = await uploadShopLogo(savedShop.id, logoFile)
        savedShop = await updateShop(savedShop.id, { logo_url: logoUrl })
      }

      if (!editing) {
        toast.success("Shop created", { description: shopData.name })
        selectShop(savedShop)
      } else {
        toast.success("Shop updated", { description: shopData.name })
      }

      setDialogOpen(false)
      setEditing(null)
      setForm(createEmptyShop())
      setLogoFile(null)
      setLogoPreview("")
      setLogoRemoved(false)
      setErrors({})
    } catch (error) {
      toast.error(error?.message || "Failed to save shop")
    } finally {
      setSaving(false)
    }
  }

  function handleSelect(shop) {
    selectShop(shop)
    toast.success(`${shop.name} selected`)
  }

  function askDelete(shop) {
    setDeleteTarget(shop)
    setDeleteConfirm("")
  }

  function closeDelete(open) {
    if (deleting) return
    if (!open) {
      setDeleteTarget(null)
      setDeleteConfirm("")
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return

    setDeleting(true)

    try {
      // Shops are soft-deleted in the database. Clean up the related Storage object
      // only after the shop update succeeds, so a failed deletion keeps its logo.
      await deleteShop(deleteTarget.id)

      let logoCleanupFailed = false
      if (deleteTarget.logo_url) {
        try {
          await removeShopLogo(deleteTarget.logo_url)
        } catch (storageError) {
          logoCleanupFailed = true
          console.error("Shop logo cleanup error:", storageError)
        }
      }

      toast.success("Shop deleted", { description: deleteTarget.name })
      if (logoCleanupFailed) {
        toast.warning("Shop deleted, but its logo could not be removed from avatars/shoplogo.")
      }
      setDeleteTarget(null)
      setDeleteConfirm("")
    } catch (error) {
      toast.error("Could not delete shop", { description: error?.message })
    } finally {
      setDeleting(false)
    }
  }

  async function copyGstin(gstin) {
    try {
      await navigator.clipboard.writeText(gstin)
      toast.success("GSTIN copied")
    } catch {
      toast.error("Could not copy GSTIN")
    }
  }

  const deleteNameMatches =
    !!deleteTarget && deleteConfirm.trim() === String(deleteTarget.name || "").trim()

  /* --------------------------------------------------
     MAIN UI
  -------------------------------------------------- */

  return (
    <div className="min-h-full w-full space-y-4 rounded-2xl bg-[#f7f5ff] px-3 py-5 sm:px-5 lg:px-6 dark:bg-slate-950">
      {/* PAGE HEADER */}

      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400"
          >
            <span>{currentShop?.name || "Workspace"}</span>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            <span>Settings</span>
          </nav>

          <h1 className="mt-1 text-[29px] font-bold tracking-tight text-[#171a39] sm:text-[32px] dark:text-slate-100">
            Shop settings
          </h1>

          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            Manage your shops and business details. You have{" "}
            <strong className="font-semibold text-slate-800 dark:text-slate-200">
              {stats.total} {stats.total === 1 ? "shop" : "shops"}
            </strong>
            .
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={openCreate}
          className={`h-11 gap-2 self-start px-5 font-semibold lg:self-auto ${outlineBtn}`}
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
          Add shop
        </Button>
      </header>

      {/* SUMMARY CARDS */}

      <section
        aria-label="Shops overview"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4"
      >
        <SummaryCard
          label="Total shops"
          value={stats.total.toLocaleString("en-IN")}
          detail={`${stats.typeCount} business ${stats.typeCount === 1 ? "type" : "types"}`}
          icon={Store}
          tone="green"
        />

        <SummaryCard
          label="Active shop"
          value={activeShop?.name || "None"}
          detail={activeShop ? activeShop.business_type || "General Store" : "Select a shop below"}
          icon={Check}
          tone="blue"
        />

        <SummaryCard
          label="GST registered"
          value={`${stats.withGstin} of ${stats.total}`}
          detail={stats.withGstin === stats.total && stats.total > 0 ? "All shops have GSTIN" : "Shops with a GSTIN"}
          icon={ShieldCheck}
          tone="purple"
        />

        <SummaryCard
          label="Profile completeness"
          value={`${stats.average}%`}
          detail={`${stats.fullyComplete} ${stats.fullyComplete === 1 ? "shop" : "shops"} fully complete`}
          icon={BriefcaseBusiness}
          tone="amber"
        />
      </section>

      {/* ACTIVE SHOP */}

      <Card className="overflow-hidden rounded-[20px] border border-violet-200/70 bg-gradient-to-br from-violet-50/60 via-white to-white shadow-[0_5px_18px_rgba(80,65,130,0.07)] dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900">
        {activeShop ? (
          <CardContent className="grid gap-5 p-5 sm:p-6 xl:grid-cols-[1.4fr_1fr]">
            <div className="flex min-w-0 gap-4">
              <ShopLogo shop={activeShop} active size="lg" />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-xl font-bold tracking-tight text-[#171a36] dark:text-slate-100">
                    {activeShop.name}
                  </h2>
                  <ActivePill />
                  <TypePill>{activeShop.business_type}</TypePill>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <DetailItem
                    icon={Phone}
                    href={activeShop.mobile ? `tel:${activeShop.mobile}` : undefined}
                  >
                    {activeShop.mobile}
                  </DetailItem>
                  <DetailItem icon={MapPin}>{getLocation(activeShop)}</DetailItem>
                  {activeShop.gstin && (
                    <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                      <span>GSTIN: {activeShop.gstin}</span>
                      <button
                        type="button"
                        onClick={() => copyGstin(activeShop.gstin)}
                        aria-label="Copy GSTIN"
                        title="Copy GSTIN"
                        className="rounded p-1 text-slate-400 hover:bg-violet-50 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-4 max-w-sm">
                  <CompletenessBar shop={activeShop} showMissing />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openEdit(activeShop)}
                  className={`mt-4 h-9 gap-1.5 px-3 text-xs font-semibold ${outlineBtn}`}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  Edit details
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-[#eae7f4] bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Quick links for this shop</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { to: "/bills/new", label: "Create bill", icon: Plus },
                  { to: "/bills", label: "All bills", icon: Receipt },
                  { to: "/customers", label: "Customers", icon: UserPlus },
                  { to: "/items", label: "Items", icon: Box },
                ].map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={`flex items-center gap-2.5 rounded-xl border p-3 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${outlineBtn}`}
                  >
                    <link.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{link.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          </CardContent>
        ) : (
          <CardContent className="flex items-center gap-4 p-5 sm:p-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              <AlertCircle className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">No shop selected</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Choose a shop from the list below, or add a new one, to see its customers, bills and
                payments.
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ALL SHOPS */}

      <Card className="overflow-hidden rounded-[20px] border border-white/80 bg-white/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)] backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/85">
        <SectionHeader
          icon={Store}
          title="All shops"
          description={
            hasActiveFilters
              ? `${filteredShops.length} of ${stats.total} shops match`
              : `${stats.total} ${stats.total === 1 ? "shop" : "shops"} registered`
          }
          action={
            <div className="flex shrink-0 items-center gap-2">
              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearFilters}
                  className={`h-9 gap-1.5 px-3 text-xs font-semibold ${outlineBtn}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Clear filters
                </Button>
              )}

              <div
                role="group"
                aria-label="Change layout"
                className="inline-flex rounded-xl border border-violet-200 bg-white p-0.5 shadow-sm dark:border-slate-700 dark:bg-slate-800"
              >
                {[
                  { value: "grid", label: "Grid view", icon: LayoutGrid },
                  { value: "list", label: "List view", icon: List },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={view === option.value}
                    aria-label={option.label}
                    title={option.label}
                    onClick={() => setView(option.value)}
                    className={`flex h-8 w-8 items-center justify-center rounded-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                      view === option.value
                        ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                        : "text-slate-500 hover:bg-violet-50 dark:text-slate-400 dark:hover:bg-slate-700"
                    }`}
                  >
                    <option.icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
          }
        />

        {/* Search and type chips */}
        <div className="space-y-3 border-b border-[#eeecf5] px-4 py-4 sm:px-5 dark:border-slate-800">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search shops"
              placeholder="Search shop, mobile, city or GSTIN"
              className="h-11 rounded-xl border-violet-100 bg-white pl-9 pr-9 shadow-sm focus-visible:ring-emerald-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:ring-emerald-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-slate-500 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {typeCounts.length > 1 && (
            <div
              className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
              role="tablist"
              aria-label="Filter by business type"
            >
              {[["all", stats.total], ...typeCounts].map(([type, count]) => {
                const active = typeFilter === type
                return (
                  <button
                    key={type}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTypeFilter(type)}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                      active
                        ? "border-violet-300 bg-violet-100 text-violet-800 shadow-sm dark:border-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                        : "border-violet-200 bg-white text-slate-700 hover:bg-violet-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`}
                  >
                    {type === "all" ? "All types" : type}
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                        active ? "bg-white text-violet-800 dark:bg-violet-800/50 dark:text-violet-200" : "bg-violet-50 text-violet-700 dark:bg-slate-900 dark:text-slate-400"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Body */}
        {filteredShops.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center px-5 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
              {stats.total === 0 ? (
                <Store className="h-7 w-7" aria-hidden="true" />
              ) : (
                <Search className="h-7 w-7" aria-hidden="true" />
              )}
            </div>
            <h3 className="mt-4 text-sm font-bold text-slate-900 dark:text-slate-100">
              {stats.total === 0 ? "No shops created yet" : "No matching shops"}
            </h3>
            <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500 dark:text-slate-400">
              {stats.total === 0
                ? "Create your first shop to start managing its customers, bills and payments."
                : "Try changing your search or business type."}
            </p>
            {stats.total === 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={openCreate}
                className={`mt-4 gap-2 px-4 font-semibold ${outlineBtn}`}
              >
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Create shop
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={clearFilters}
                className={`mt-4 gap-2 px-4 font-semibold ${outlineBtn}`}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 md:grid-cols-2 2xl:grid-cols-3">
            {filteredShops.map((shop, index) => (
              <ShopCard
                key={shop.id}
                shop={shop}
                index={index}
                isActive={currentShop?.id === shop.id}
                onSelect={handleSelect}
                onEdit={openEdit}
                onDelete={askDelete}
              />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-[#eeecf5] dark:divide-slate-800">
            {filteredShops.map((shop, index) => (
              <ShopRow
                key={shop.id}
                shop={shop}
                index={index}
                isActive={currentShop?.id === shop.id}
                onSelect={handleSelect}
                onEdit={openEdit}
                onDelete={askDelete}
              />
            ))}
          </div>
        )}
      </Card>

      {/* ADD / EDIT SHOP DIALOG */}

      <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="max-h-[92vh] gap-0 overflow-hidden rounded-[20px] border-white/80 bg-white p-0 sm:max-w-[560px] dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader className="border-b border-[#eeecf5] bg-gradient-to-br from-violet-50 via-white to-white px-6 pb-5 pt-6 text-left dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-violet-700 text-white shadow-sm dark:bg-violet-600">
                {editing ? (
                  <Pencil className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Store className="h-5 w-5" aria-hidden="true" />
                )}
              </div>

              <div className="min-w-0 flex-1 pr-6">
                <DialogTitle className="text-xl font-bold tracking-tight text-[#171a36] dark:text-slate-100">
                  {editing ? "Edit shop details" : "Create new shop"}
                </DialogTitle>
                <DialogDescription className="mt-1 dark:text-slate-400">
                  {editing
                    ? "Update your shop and business information."
                    : "Enter your business details to create a new shop."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleSave} noValidate className="flex max-h-[calc(92vh-130px)] flex-col">
            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
              <FormSection icon={Camera} title="Shop logo">
                <div className="flex flex-col gap-4 rounded-2xl border border-violet-100 bg-violet-50/50 p-4 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-950/50">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-violet-200 bg-white text-violet-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-violet-300">
                    {logoPreview ? (
                      <img src={logoPreview} alt="Shop logo preview" className="h-full w-full rounded-full object-cover" />
                    ) : (
                      <ImagePlus className="h-8 w-8" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Upload your shop logo</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">JPG, PNG or WebP · Maximum 2 MB</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" variant="outline" disabled={saving} onClick={() => document.getElementById("shop-logo")?.click()} className={`h-9 gap-2 px-3 text-xs font-semibold ${outlineBtn}`}>
                        <Upload className="h-3.5 w-3.5" />
                        {logoPreview ? "Change logo" : "Choose image"}
                      </Button>
                      {logoPreview && (
                        <Button type="button" variant="outline" disabled={saving} onClick={removeLogo} className="h-9 gap-2 rounded-xl border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900/50 dark:bg-slate-800 dark:text-rose-400">
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </Button>
                      )}
                    </div>
                    <input id="shop-logo" type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleLogoChange} disabled={saving} />
                  </div>
                </div>
              </FormSection>

              <div className="h-px bg-[#eeecf5] dark:bg-slate-800" />

              <FormSection icon={Building2} title="Basic information">
                <FieldInput
                  id="shop-name"
                  label="Shop name"
                  required
                  error={errors.name}
                  value={form.name}
                  onChange={(e) => updateForm("name", e.target.value)}
                  placeholder="Enter shop name"
                  autoFocus
                  disabled={saving}
                />

                <div className="space-y-2">
                  <Label className="dark:text-slate-300">Business type</Label>
                  <Select
                    value={form.business_type}
                    onValueChange={handleBusinessTypeChange}
                    disabled={saving}
                  >
                    <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
                      <SelectValue placeholder="Select business type" />
                    </SelectTrigger>
                    <SelectContent className="dark:border-slate-800 dark:bg-slate-900">
                      {businessTypeOptions.map((type) => (
                        <SelectItem key={type} value={type} className="dark:text-slate-200 dark:focus:bg-slate-800">
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isOtherType && (
                  <FieldInput
                    id="shop-business-type-other"
                    label="Specify business type"
                    required
                    error={errors.business_type_other}
                    value={form.business_type_other}
                    onChange={(e) => updateForm("business_type_other", e.target.value)}
                    placeholder="e.g. Bakery, Salon, Gym..."
                    maxLength={50}
                    autoFocus
                    disabled={saving}
                  />
                )}
              </FormSection>

              <div className="h-px bg-[#eeecf5] dark:bg-slate-800" />

              <FormSection icon={Phone} title="Contact and tax details">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FieldInput
                    id="shop-mobile"
                    label="Mobile number"
                    type="tel"
                    inputMode="tel"
                    error={errors.mobile}
                    value={form.mobile}
                    onChange={(e) => updateForm("mobile", e.target.value)}
                    placeholder="10-digit mobile number"
                    disabled={saving}
                  />

                  <FieldInput
                    id="shop-gstin"
                    label="GSTIN"
                    error={errors.gstin}
                    value={form.gstin}
                    onChange={(e) => updateForm("gstin", e.target.value.toUpperCase())}
                    placeholder="22AAAAA0000A1Z5"
                    maxLength={15}
                    className="uppercase"
                    disabled={saving}
                  />
                </div>
              </FormSection>

              <div className="h-px bg-[#eeecf5] dark:bg-slate-800" />

              <FormSection icon={MapPin} title="Business address">
                <FieldInput
                  id="shop-address"
                  label="Address"
                  value={form.address}
                  onChange={(e) => updateForm("address", e.target.value)}
                  placeholder="Street, area, landmark..."
                  disabled={saving}
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <FieldInput
                    id="shop-city"
                    label="City"
                    value={form.city}
                    onChange={(e) => updateForm("city", e.target.value)}
                    placeholder="City"
                    disabled={saving}
                  />

                  <FieldInput
                    id="shop-state"
                    label="State"
                    value={form.state}
                    onChange={(e) => updateForm("state", e.target.value)}
                    placeholder="State"
                    disabled={saving}
                  />

                  <FieldInput
                    id="shop-pincode"
                    label="Pincode"
                    inputMode="numeric"
                    error={errors.pincode}
                    value={form.pincode}
                    onChange={(e) => updateForm("pincode", e.target.value.replace(/\D/g, ""))}
                    placeholder="6 digits"
                    maxLength={6}
                    disabled={saving}
                  />
                </div>
              </FormSection>
            </div>

            <DialogFooter className="flex-col-reverse gap-2 border-t border-[#eeecf5] bg-[#faf9ff] px-6 py-4 sm:flex-row sm:justify-end dark:border-slate-800 dark:bg-slate-900/50">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDialogChange(false)}
                disabled={saving}
                className={`h-11 gap-2 px-5 font-medium ${outlineBtn}`}
              >
                Cancel
              </Button>

              <Button
                type="submit"
                variant="outline"
                disabled={saving}
                className={`h-11 gap-2 px-6 font-semibold ${outlineBtn}`}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : editing ? (
                  "Update shop"
                ) : (
                  "Create shop"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION */}

      <Dialog open={!!deleteTarget} onOpenChange={closeDelete}>
        <DialogContent className="max-w-[440px] gap-0 overflow-hidden rounded-[20px] border border-white/80 bg-white p-0 shadow-[0_12px_32px_rgba(80,65,130,0.25)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <div className="flex flex-col items-center px-6 py-6 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100/80 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
              <Trash2 className="h-7 w-7" aria-hidden="true" />
            </div>

            <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Delete this shop?
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              <strong className="font-semibold text-slate-800 dark:text-slate-200">{deleteTarget?.name}</strong> will be
              removed. This action cannot be undone.
            </DialogDescription>

            <div className="mt-5 w-full text-left">
              <Label htmlFor="delete-confirm" className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Type <span className="font-bold text-slate-900 dark:text-slate-100">{deleteTarget?.name}</span> to confirm
              </Label>
              <Input
                id="delete-confirm"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="Shop name"
                autoComplete="off"
                disabled={deleting}
                className="mt-1.5 h-11 rounded-xl border-rose-200 focus-visible:ring-rose-500 dark:border-rose-900/50 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:ring-rose-500/50"
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col gap-2 border-t border-[#eeecf5] bg-[#faf9ff] p-4 sm:flex-row sm:justify-end dark:border-slate-800 dark:bg-slate-900/50">
            <Button
              type="button"
              variant="outline"
              onClick={() => closeDelete(false)}
              disabled={deleting}
              className={`h-10 w-full gap-2 px-5 text-sm font-medium sm:w-auto ${outlineBtn}`}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={confirmDelete}
              disabled={!deleteNameMatches || deleting}
              className="h-10 w-full gap-2 rounded-xl border-rose-200 bg-white px-5 text-sm font-medium text-rose-700 shadow-sm hover:bg-rose-50 disabled:opacity-50 sm:w-auto dark:border-rose-900/50 dark:bg-slate-800 dark:text-rose-400 dark:hover:bg-rose-900/30"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete shop"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}