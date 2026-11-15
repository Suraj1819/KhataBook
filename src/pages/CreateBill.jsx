import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import {
  formatCurrency,
  formatDate,
  calculateItemAmounts,
  generateBillNumber,
  UNITS,
  GST_RATES,
  PAYMENT_MODES,
  CUSTOMER_TYPES,
  roundToTwo,
} from "@/lib/utils"

import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import {
  ArrowDownLeft,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleAlert,
  Clock3,
  Copy,
  CreditCard,
  Eye,
  FileText,
  IndianRupee,
  ImagePlus,
  Loader2,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  UserRound,
  Wallet,
  MessageCircle,
  X,
} from "lucide-react"

import { toast } from "sonner"

/* ==================================================
   CONSTANTS & HELPERS
================================================== */

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

const DUE_SHORTCUTS = [
  { label: "Same day", days: 0 },
  { label: "7 days", days: 7 },
  { label: "15 days", days: 15 },
  { label: "30 days", days: 30 },
]

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-amber-100 text-amber-700 dark:text-amber-300",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
  "bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300",
]

const emptyItem = () => ({
  item_name: "",
  description: "",
  quantity: "1",
  unit: "Piece",
  rate: "",
  discount: "0",
  gst_percent: "0",
  custom_gst_percent: "0",
})

const numberValue = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

// Item discount accepts either a fixed rupee amount (e.g. 150) or a percentage (e.g. 30%).
function getItemDiscountAmount(item) {
  const raw = String(item.discount ?? "").trim()
  if (!raw) return 0

  if (raw.endsWith("%")) {
    const percent = Number(raw.slice(0, -1).trim())
    if (!Number.isFinite(percent)) return 0
    const gross = Math.max(0, numberValue(item.quantity)) * Math.max(0, numberValue(item.rate))
    return roundToTwo(gross * clamp(percent, 0, 100) / 100)
  }

  return Math.max(0, numberValue(raw))
}

function isValidItemDiscount(value) {
  const raw = String(value ?? "").trim()
  if (!raw) return true
  if (raw.endsWith("%")) {
    const percent = Number(raw.slice(0, -1).trim())
    return Number.isFinite(percent) && percent >= 0 && percent <= 100
  }
  const amount = Number(raw)
  return Number.isFinite(amount) && amount >= 0
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

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

function CustomerAvatar({ name, photoUrl, className = "h-10 w-10" }) {
  return (
    <div
      aria-label={`${name || "Customer"} profile`}
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet-100 dark:bg-violet-950/50 text-sm font-bold text-violet-700 dark:text-violet-300 ${className}`}
    >
      <span aria-hidden="true">{getInitials(name)}</span>
      {photoUrl && (
        <img
          src={photoUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(event) => {
            event.currentTarget.style.display = "none"
          }}
          className="absolute inset-0 h-full w-full rounded-full object-cover"
        />
      )}
    </div>
  )
}

const fieldClass =
  "h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-sm text-slate-800 dark:text-slate-200 shadow-sm shadow-slate-900/[0.02] transition-all placeholder:text-slate-400 hover:border-violet-200 dark:hover:border-slate-600 focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/15 disabled:cursor-not-allowed disabled:bg-slate-50 dark:disabled:bg-slate-800"

const labelClass = "text-[13px] font-medium text-slate-700 dark:text-slate-200"

const cardClass =
  "overflow-hidden rounded-[20px] border border-white/80 dark:border-slate-700 bg-white/85 dark:bg-slate-900/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)] backdrop-blur-sm"

/* ==================================================
   SMALL UI PIECES
================================================== */

const STAT_TONES = {
  green: "bg-emerald-100/80 text-emerald-700 dark:text-emerald-300",
  blue: "bg-blue-100/80 text-blue-700",
  purple: "bg-violet-100/80 text-violet-700 dark:text-violet-300",
  pink: "bg-pink-100/80 text-pink-700",
}

function StatCard({ label, value, detail, icon: Icon, tone = "purple", valueClass = "text-[#171a36] dark:text-slate-100" }) {
  return (
    <Card className="rounded-[18px] border border-white/80 dark:border-slate-700 bg-white/75 dark:bg-slate-900/75 shadow-[0_3px_12px_rgba(80,65,130,0.06)]">
      <CardContent className="flex min-w-0 items-center gap-3 p-3.5 sm:p-4">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${STAT_TONES[tone]}`}
        >
          <Icon className="h-6 w-6" strokeWidth={1.9} aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-slate-600 dark:text-slate-300">{label}</p>
          <p className={`mt-0.5 break-words text-xl font-bold tracking-tight tabular-nums ${valueClass}`}>
            {value}
          </p>
          {detail && <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">{detail}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function SectionHeader({ icon: Icon, title, description, action }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#eae7f4] dark:border-slate-700 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
          <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </div>

        <div className="min-w-0">
          <h2 className="text-[16px] font-bold tracking-tight text-[#171a36] dark:text-slate-100">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
      </div>

      {action}
    </div>
  )
}

function Section({ title, description, icon, action, children, className = "" }) {
  return (
    <Card className={`${cardClass} ${className}`}>
      <SectionHeader icon={icon} title={title} description={description} action={action} />
      <CardContent className="p-4 sm:p-5">{children}</CardContent>
    </Card>
  )
}

function FormField({ label, children, className = "", hint }) {
  return (
    <div className={`min-w-0 space-y-1.5 ${className}`}>
      <Label className={labelClass}>{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  )
}

function SummaryRow({ label, value, emphasized = false, tone }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className={emphasized ? "font-semibold text-slate-800 dark:text-slate-200" : "text-slate-600 dark:text-slate-300"}>{label}</span>
      <span
        className={`shrink-0 tabular-nums ${
          emphasized ? "text-base font-bold text-slate-900 dark:text-slate-100" : "font-semibold text-slate-800 dark:text-slate-200"
        } ${tone || ""}`}
      >
        {value}
      </span>
    </div>
  )
}

function ChipButton({ children, onClick, active = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 ${
        active
          ? "border-violet-200 dark:border-slate-700 bg-violet-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
          : "border-violet-100 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-slate-700"
      }`}
    >
      {children}
    </button>
  )
}

function ToggleOption({ checked, onChange, title, description }) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${
        checked
          ? "border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/40"
          : "border-violet-100 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-violet-50/50 dark:hover:bg-slate-700"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 dark:border-slate-600 accent-emerald-600"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</span>
      </span>
    </label>
  )
}

function ChecklistItem({ done, label }) {
  const Icon = done ? CheckCircle2 : Circle
  return (
    <li className="flex items-center gap-2 text-xs">
      <Icon
        className={`h-4 w-4 shrink-0 ${done ? "text-emerald-600" : "text-slate-300"}`}
        aria-hidden="true"
      />
      <span className={done ? "font-medium text-slate-700 dark:text-slate-200" : "text-slate-500 dark:text-slate-400"}>{label}</span>
    </li>
  )
}

const STATUS_STYLES = {
  paid: { label: "Paid", className: "bg-emerald-100 text-emerald-700 dark:text-emerald-300 border-emerald-200", icon: CheckCircle2 },
  partial: { label: "Partially paid", className: "bg-amber-100 text-amber-700 dark:text-amber-300 border-amber-200", icon: Clock3 },
  unpaid: { label: "Unpaid", className: "bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200", icon: CircleAlert },
}

function StatusBadge({ status }) {
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

/* ==================================================
   CREATE BILL
================================================== */

export default function CreateBill() {
  const { currentShop } = useShop()
  const navigate = useNavigate()

  const today = getLocalDateString()

  const [customers, setCustomers] = useState([])
  const [customerId, setCustomerId] = useState("")
  const [customerSearch, setCustomerSearch] = useState("")
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false)
  const customerBoxRef = useRef(null)
  const customerDropdownRef = useRef(null)
  const [customerDropdownPosition, setCustomerDropdownPosition] = useState(null)
  const [addCustomerOpen, setAddCustomerOpen] = useState(false)
  const [customerSaving, setCustomerSaving] = useState(false)
  const [customerPhotoFile, setCustomerPhotoFile] = useState(null)
  const [customerPhotoPreview, setCustomerPhotoPreview] = useState("")
  const [customerPhotoRemoved, setCustomerPhotoRemoved] = useState(false)
  const customerPhotoInputRef = useRef(null)
  const [duplicatePromptOpen, setDuplicatePromptOpen] = useState(false)
  const [duplicateCustomer, setDuplicateCustomer] = useState(null)
  const [editingCustomerId, setEditingCustomerId] = useState(null)
  const [newCustomer, setNewCustomer] = useState({
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
  })

  const [items, setItems] = useState([emptyItem()])
  const itemNameRefs = useRef([])
  const [discountMenuOpen, setDiscountMenuOpen] = useState(null)

  const [isInterstate, setIsInterstate] = useState(false)
  const [taxInclusive, setTaxInclusive] = useState(false)

  const [billDiscount, setBillDiscount] = useState("0")
  const [roundOff, setRoundOff] = useState("0")
  const [notes, setNotes] = useState("")

  // Bill date defaults to today; can be back-dated for older paper bills
  const [billDate, setBillDate] = useState(today)
  const [dueDate, setDueDate] = useState("")

  const [amountPaid, setAmountPaid] = useState("0")
  const [paymentMode, setPaymentMode] = useState("Cash")

  const [advanceAvailable, setAdvanceAvailable] = useState(0)
  const [advanceUsed, setAdvanceUsed] = useState("0")

  // Offline bill upload
  const [offlineBillFile, setOfflineBillFile] = useState(null)
  const [offlineBillPreview, setOfflineBillPreview] = useState("")
  const offlineBillCameraRef = useRef(null)

  const [saving, setSaving] = useState(false)
  const [createdBillShare, setCreatedBillShare] = useState(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (currentShop?.id) {
      loadCustomers()
    } else {
      setCustomers([])
      setCustomerId("")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShop?.id])

  useEffect(() => {
    if (customerId) {
      loadAdvance()
    } else {
      setAdvanceAvailable(0)
      setAdvanceUsed("0")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])

  useEffect(() => {
    function handleClickOutside(event) {
      const clickedInsideSearch = customerBoxRef.current?.contains(event.target)
      const clickedInsideDropdown = customerDropdownRef.current?.contains(event.target)
      if (!clickedInsideSearch && !clickedInsideDropdown) {
        setCustomerDropdownOpen(false)
      }
    }
    function handleEscape(event) {
      if (event.key === "Escape") setCustomerDropdownOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleEscape)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [])

  // Render the customer menu in document.body so parent cards/columns cannot clip it.
  useEffect(() => {
    if (!customerDropdownOpen) {
      setCustomerDropdownPosition(null)
      return
    }

    const updatePosition = () => {
      const anchor = customerBoxRef.current?.querySelector("input")
      if (!anchor) return

      const rect = anchor.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const spaceBelow = viewportHeight - rect.bottom - 12
      const spaceAbove = rect.top - 12
      const openAbove = spaceBelow < 220 && spaceAbove > spaceBelow
      const maxHeight = Math.max(140, Math.min(256, (openAbove ? spaceAbove : spaceBelow) - 8))

      setCustomerDropdownPosition({
        left: rect.left,
        width: rect.width,
        top: openAbove ? Math.max(8, rect.top - maxHeight - 8) : rect.bottom + 8,
        maxHeight,
      })
    }

    updatePosition()
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [customerDropdownOpen, customerSearch, loadingCustomers])

  async function loadCustomers() {
    setLoadingCustomers(true)
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, mobile, whatsapp, address, city, state, pincode, gstin, customer_type, opening_balance, notes, photo_url")
        .eq("shop_id", currentShop.id)
        .eq("is_active", true)
        .order("name")

      if (error) throw error
      setCustomers(data || [])
    } catch (error) {
      console.error(error)
      toast.error("Could not load customers")
    } finally {
      setLoadingCustomers(false)
    }
  }

  async function handleRefresh() {
    if (refreshing || !currentShop?.id) return

    setRefreshing(true)
    try {
      await loadCustomers()
      if (customerId) await loadAdvance()
    } finally {
      setRefreshing(false)
    }
  }

  function openAddCustomerDialog() {
    setCustomerDropdownOpen(false)
    setEditingCustomerId(null)
    setDuplicateCustomer(null)
    setCustomerPhotoFile(null)
    setCustomerPhotoPreview("")
    setCustomerPhotoRemoved(false)
    setNewCustomer({
      name: customerSearch.trim(),
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
    })
    setAddCustomerOpen(true)
  }

  function handleCustomerPhotoChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file")
      event.target.value = ""
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Profile photo must be smaller than 5 MB")
      event.target.value = ""
      return
    }
    setCustomerPhotoFile(file)
    setCustomerPhotoRemoved(false)
    setCustomerPhotoPreview(URL.createObjectURL(file))
  }

  function removeCustomerPhoto() {
    setCustomerPhotoFile(null)
    setCustomerPhotoPreview("")
    setCustomerPhotoRemoved(true)
    if (customerPhotoInputRef.current) customerPhotoInputRef.current.value = ""
  }

  async function handleAddCustomer(event) {
    event.preventDefault()
    if (customerSaving) return

    const name = newCustomer.name.trim().replace(/\s+/g, " ")
    const mobile = newCustomer.mobile.trim()
    const mobileDigits = mobile.replace(/\D/g, "")
    const whatsapp = newCustomer.whatsapp.trim()
    const whatsappDigits = whatsapp.replace(/\D/g, "")
    const pincode = newCustomer.pincode.trim()
    const openingBalance = newCustomer.opening_balance.trim()
      ? Number(newCustomer.opening_balance)
      : 0
    const gstin = newCustomer.gstin.trim().toUpperCase()

    if (!name) {
      toast.error("Customer name is required")
      return
    }
    if (mobile && mobileDigits.length !== 10) {
      toast.error("Enter a valid 10-digit mobile number")
      return
    }
    if (whatsapp && whatsappDigits.length !== 10) {
      toast.error("Enter a valid 10-digit WhatsApp number")
      return
    }
    if (pincode && !/^\d{6}$/.test(pincode)) {
      toast.error("PIN code must be 6 digits")
      return
    }
    if (!Number.isFinite(openingBalance) || openingBalance < 0) {
      toast.error("Enter a valid opening balance")
      return
    }
    if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(gstin)) {
      toast.error("Enter a valid 15-character GSTIN")
      return
    }

    setCustomerSaving(true)
    try {
      let uploadedPhotoUrl = editingCustomerId && !customerPhotoRemoved
        ? (customers.find((customer) => customer.id === editingCustomerId)?.photo_url || null)
        : null

      if (customerPhotoFile) {
        const extension = customerPhotoFile.name.split(".").pop()?.toLowerCase() || "jpg"
        const filePath = `${currentShop.id}/customers/${crypto.randomUUID()}.${extension}`
        const { error: photoUploadError } = await supabase.storage
          .from("avatars")
          .upload(filePath, customerPhotoFile, {
            cacheControl: "3600",
            upsert: false,
            contentType: customerPhotoFile.type,
          })
        if (photoUploadError) throw photoUploadError
        const { data: publicPhoto } = supabase.storage.from("avatars").getPublicUrl(filePath)
        uploadedPhotoUrl = publicPhoto?.publicUrl || null
      }

      const payload = {
        shop_id: currentShop.id,
        photo_url: uploadedPhotoUrl,
        name,
        mobile: mobile || null,
        whatsapp: whatsapp || null,
        address: newCustomer.address.trim() || null,
        city: newCustomer.city.trim() || null,
        state: newCustomer.state.trim() || null,
        pincode: pincode || null,
        gstin: gstin || null,
        customer_type: newCustomer.customer_type || "Individual",
        opening_balance: openingBalance,
        notes: newCustomer.notes.trim() || null,
        is_active: true,
      }

      // Check existing customers in this shop before inserting or updating.
      const { data: shopCustomers, error: duplicateCheckError } = await supabase
        .from("customers")
        .select("id, name, mobile, whatsapp, address, city, state, pincode, gstin, customer_type, opening_balance, notes, photo_url")
        .eq("shop_id", currentShop.id)
        .eq("is_active", true)

      if (duplicateCheckError) throw duplicateCheckError

      const normalizePhone = (value) => String(value || "").replace(/\D/g, "")
      const normalizeName = (value) =>
        String(value || "").trim().replace(/\s+/g, " ").toLowerCase()
      const normalizedMobile = normalizePhone(mobile)
      const normalizedName = normalizeName(name)

      const duplicateCustomer = (shopCustomers || []).find((customer) => {
        // When editing, do not flag the record being edited as a duplicate of itself.
        if (editingCustomerId && customer.id === editingCustomerId) return false

        const existingMobile = normalizePhone(customer.mobile)
        const existingName = normalizeName(customer.name)

        // A matching mobile number identifies the same customer even if the name differs.
        if (normalizedMobile && existingMobile) {
          return normalizedMobile === existingMobile
        }

        // If no mobile number is provided, use an exact normalized name match.
        return !normalizedMobile && !existingMobile && normalizedName === existingName
      })

      if (duplicateCustomer) {
        setDuplicateCustomer(duplicateCustomer)
        setDuplicatePromptOpen(true)
        setAddCustomerOpen(false)
        return
      }

      let data
      if (editingCustomerId) {
        const { data: updatedCustomer, error } = await supabase
          .from("customers")
          .update(payload)
          .eq("id", editingCustomerId)
          .eq("shop_id", currentShop.id)
          .select("id, name, mobile, whatsapp, address, city, state, pincode, gstin, customer_type, opening_balance, notes, photo_url")
          .single()

        if (error) throw error
        data = updatedCustomer
      } else {
        const { data: insertedCustomer, error } = await supabase
          .from("customers")
          .insert(payload)
          .select("id, name, mobile, whatsapp, address, city, state, pincode, gstin, customer_type, opening_balance, notes, photo_url")
          .single()

        if (error) throw error
        data = insertedCustomer
      }

      setCustomers((previous) =>
        [...previous.filter((customer) => customer.id !== data.id), data]
          .sort((a, b) => a.name.localeCompare(b.name))
      )
      const wasEditingCustomer = Boolean(editingCustomerId)
      setCustomerId(data.id)
      setCustomerSearch("")
      setCustomerDropdownOpen(false)
      setAddCustomerOpen(false)
      setEditingCustomerId(null)
      setCustomerPhotoFile(null)
      setCustomerPhotoPreview("")
      setCustomerPhotoRemoved(false)
      setNewCustomer({
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
      })
      toast.success(wasEditingCustomer ? "Customer updated and selected" : "Customer added and selected")
      // Keep the bill form intact; the user can continue adding items and create the bill.
    } catch (error) {
      console.error("Add customer error:", error)
      toast.error("Could not add customer", {
        description: error?.message || "Please try again.",
      })
    } finally {
      setCustomerSaving(false)
    }
  }

  async function loadAdvance() {
    try {
      const { data, error } = await supabase
        .from("customer_advances")
        .select("remaining_amount")
        .eq("customer_id", customerId)
        .gt("remaining_amount", 0)

      if (error) throw error

      const total = (data || []).reduce(
        (sum, advance) => sum + numberValue(advance.remaining_amount),
        0
      )
      setAdvanceAvailable(roundToTwo(total))
    } catch (error) {
      console.error(error)
      setAdvanceAvailable(0)
    }
  }

  /* --------------------------------------------------
     ITEM ACTIONS
  -------------------------------------------------- */

  function updateItem(index, field, value) {
    setItems((previous) =>
      previous.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    )
  }

  function addItem() {
    setItems((previous) => [emptyItem(), ...previous])
    // Focus the new first row after React has committed the updated list.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => itemNameRefs.current[0]?.focus())
    })
  }

  function duplicateItem(index) {
    setItems((previous) => {
      const copy = { ...previous[index] }
      return [...previous.slice(0, index + 1), copy, ...previous.slice(index + 1)]
    })
  }

  function removeItem(index) {
    setItems((previous) => {
      if (previous.length === 1) return previous
      return previous.filter((_, i) => i !== index)
    })
  }

  /* --------------------------------------------------
     DATE ACTIONS
  -------------------------------------------------- */

  function handleBillDateChange(value) {
    if (!value) return
    setBillDate(value)
    // Due date can never be before the bill date
    if (dueDate && dueDate < value) setDueDate(value)
  }

  function setDueIn(days) {
    setDueDate(shiftDate(billDate, days))
  }

  /* --------------------------------------------------
     OFFLINE BILL UPLOAD
  -------------------------------------------------- */

  function handleOfflineBillChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_FILE_SIZE) {
      toast.error("File size must be less than 5 MB")
      e.target.value = ""
      return
    }

    setOfflineBillFile(file)

    // Preview only if it's an image
    if (file.type.startsWith("image/")) {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === "string") setOfflineBillPreview(reader.result)
      }
      reader.readAsDataURL(file)
    } else {
      setOfflineBillPreview("")
    }
  }

  function removeOfflineBill() {
    setOfflineBillFile(null)
    setOfflineBillPreview("")
  }

  /* --------------------------------------------------
     DERIVED DATA
  -------------------------------------------------- */

  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase()
    if (!query) return customers
    return customers.filter(
      (customer) =>
        customer.name?.toLowerCase().includes(query) ||
        customer.mobile?.toLowerCase().includes(query)
    )
  }, [customers, customerSearch])

  function continueWithExistingCustomer() {
    if (!duplicateCustomer) return

    setCustomers((previous) => {
      const alreadyLoaded = previous.some((customer) => customer.id === duplicateCustomer.id)
      return alreadyLoaded
        ? previous
        : [...previous, duplicateCustomer].sort((a, b) => a.name.localeCompare(b.name))
    })
    setCustomerId(duplicateCustomer.id)
    setCustomerSearch("")
    setCustomerDropdownOpen(false)
    setDuplicatePromptOpen(false)
    setAddCustomerOpen(false)
    setDuplicateCustomer(null)
    setNewCustomer({
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
    })
  }

  function editExistingCustomer() {
    if (!duplicateCustomer) return

    setEditingCustomerId(duplicateCustomer.id)
    setCustomerPhotoFile(null)
    setCustomerPhotoPreview(duplicateCustomer.photo_url || "")
    setCustomerPhotoRemoved(false)
    setNewCustomer({
      name: duplicateCustomer.name || "",
      mobile: duplicateCustomer.mobile || "",
      whatsapp: duplicateCustomer.whatsapp || "",
      address: duplicateCustomer.address || "",
      city: duplicateCustomer.city || "",
      state: duplicateCustomer.state || "",
      pincode: duplicateCustomer.pincode || "",
      gstin: duplicateCustomer.gstin || "",
      customer_type: duplicateCustomer.customer_type || "Individual",
      opening_balance: String(duplicateCustomer.opening_balance ?? ""),
      notes: duplicateCustomer.notes || "",
    })
    setDuplicatePromptOpen(false)
    setAddCustomerOpen(true)
  }

  const selectedCustomer = customers.find((customer) => customer.id === customerId)

  const calculated = useMemo(() => {
    const validItems = items.map((item) => {
      const gstPercent =
        item.gst_percent === "custom"
          ? clamp(numberValue(item.custom_gst_percent), 0, 100)
          : clamp(numberValue(item.gst_percent), 0, 100)

      const quantity = Math.max(0, numberValue(item.quantity))
      const rate = Math.max(0, numberValue(item.rate))
      const discount = getItemDiscountAmount(item)

      const calc = calculateItemAmounts({
        quantity: String(quantity),
        rate: String(rate),
        discount: String(discount),
        gstPercent: String(gstPercent),
        taxInclusive,
      })

      return { ...calc, gstPercent, quantity, rate, discount }
    })

    const subtotal = roundToTwo(
      validItems.reduce((sum, item) => sum + numberValue(item.gross), 0)
    )

    const itemDiscount = roundToTwo(
      validItems.reduce((sum, item) => sum + numberValue(item.discount), 0)
    )

    const originalTaxable = validItems.reduce((sum, item) => sum + numberValue(item.taxable), 0)
    const originalTotal = validItems.reduce((sum, item) => sum + numberValue(item.total), 0)

    const discountBase = taxInclusive ? originalTotal : originalTaxable

    const appliedBillDiscount = roundToTwo(
      clamp(numberValue(billDiscount), 0, Math.max(0, discountBase))
    )

    let allocatedDiscount = 0

    const adjustedItems = validItems.map((item, index) => {
      const base = taxInclusive ? numberValue(item.total) : numberValue(item.taxable)
      let allocation = 0

      if (discountBase > 0) {
        allocation =
          index === validItems.length - 1
            ? Math.max(0, appliedBillDiscount - allocatedDiscount)
            : (appliedBillDiscount * base) / discountBase
      }

      allocation = Math.min(allocation, base)
      allocatedDiscount += allocation

      let taxableAmount = numberValue(item.taxable)
      let gstAmount = numberValue(item.gstAmount)
      let totalAmount = numberValue(item.total)

      if (taxInclusive) {
        const adjustedTotal = Math.max(0, totalAmount - allocation)
        const ratio = totalAmount > 0 ? adjustedTotal / totalAmount : 0
        taxableAmount = roundToTwo(taxableAmount * ratio)
        gstAmount = roundToTwo(gstAmount * ratio)
        totalAmount = roundToTwo(taxableAmount + gstAmount)
      } else {
        taxableAmount = roundToTwo(Math.max(0, taxableAmount - allocation))
        gstAmount = roundToTwo(taxableAmount * (item.gstPercent / 100))
        totalAmount = roundToTwo(taxableAmount + gstAmount)
      }

      return {
        ...item,
        taxableAmount,
        gstAmount,
        totalAmount,
        billDiscountShare: roundToTwo(allocation),
      }
    })

    const taxable = roundToTwo(adjustedItems.reduce((sum, item) => sum + item.taxableAmount, 0))
    const totalGst = roundToTwo(adjustedItems.reduce((sum, item) => sum + item.gstAmount, 0))
    const totalDiscount = roundToTwo(itemDiscount + appliedBillDiscount)

    const cgst = isInterstate ? 0 : roundToTwo(totalGst / 2)
    const sgst = isInterstate ? 0 : roundToTwo(totalGst - cgst)
    const igst = isInterstate ? totalGst : 0

    const beforeRound = roundToTwo(taxable + totalGst)
    const rOff = numberValue(roundOff)
    const grandTotal = Math.max(0, roundToTwo(beforeRound + rOff))

    const adv = roundToTwo(
      clamp(numberValue(advanceUsed), 0, Math.min(advanceAvailable, grandTotal))
    )

    const paid = roundToTwo(
      clamp(numberValue(amountPaid), 0, Math.max(0, grandTotal - adv))
    )

    const due = roundToTwo(Math.max(0, grandTotal - adv - paid))

    return {
      itemCalcs: adjustedItems,
      subtotal,
      itemDiscount,
      billDiscount: appliedBillDiscount,
      totalDiscount,
      taxable,
      totalGst,
      cgst,
      sgst,
      igst,
      grandTotal,
      advanceUsed: adv,
      amountPaid: paid,
      amountDue: due,
    }
  }, [
    items,
    billDiscount,
    roundOff,
    taxInclusive,
    isInterstate,
    advanceUsed,
    amountPaid,
    advanceAvailable,
  ])

  const namedItemCount = items.filter((item) => item.item_name.trim()).length
  const settledAmount = roundToTwo(calculated.amountPaid + calculated.advanceUsed)
  const paymentExceedsBill =
    numberValue(amountPaid) + numberValue(advanceUsed) > calculated.grandTotal + 0.009
  const settledPercent =
    calculated.grandTotal > 0
      ? clamp(Math.round((settledAmount / calculated.grandTotal) * 100), 0, 100)
      : 0

  const paymentStatus =
    calculated.amountDue <= 0
      ? "paid"
      : calculated.amountPaid > 0 || calculated.advanceUsed > 0
        ? "partial"
        : "unpaid"

  const isBackDated = billDate < today
  const readyToCreate = Boolean(customerId) && (namedItemCount > 0 || offlineBillFile)

  function payFull() {
    setAmountPaid(String(Math.max(0, roundToTwo(calculated.grandTotal - calculated.advanceUsed))))
  }

  function useFullAdvance() {
    setAdvanceUsed(String(roundToTwo(Math.min(advanceAvailable, calculated.grandTotal))))
  }

  function getWhatsAppNumber(customer) {
    const raw = String(customer?.whatsapp || customer?.mobile || "").trim()
    if (!raw) return ""
    let digits = raw.replace(/\D/g, "")
    if (digits.length === 10) digits = `91${digits}`
    return digits
  }

  function openWhatsAppDraft() {
    if (!createdBillShare?.phone) {
      toast.error("Customer WhatsApp number is not available")
      return
    }
    const url = `https://wa.me/${createdBillShare.phone}?text=${encodeURIComponent(createdBillShare.message)}`
    window.open(url, "_blank", "noopener,noreferrer")
  }

  /* --------------------------------------------------
     SUBMIT
  -------------------------------------------------- */

  async function handleSubmit(event) {
    event?.preventDefault?.()

    if (!customerId) {
      toast.error("Select a customer")
      return
    }

    if (!billDate) {
      toast.error("Select a bill date")
      return
    }

    if (billDate > today) {
      toast.error("Bill date cannot be in the future")
      return
    }

    if (dueDate && dueDate < billDate) {
      toast.error("Due date cannot be before the bill date")
      return
    }

    const validItems = items
      .map((item, index) => ({ ...item, originalIndex: index }))
      .filter((item) => item.item_name.trim())

    // Allow bill creation if there are items OR an offline bill is uploaded
    if (validItems.length === 0 && !offlineBillFile) {
      toast.error("Add at least one item or upload an offline bill")
      return
    }

    const invalidItem = validItems.find(
      (item) =>
        numberValue(item.quantity) <= 0 ||
        numberValue(item.rate) < 0 ||
        !isValidItemDiscount(item.discount) ||
        (item.gst_percent === "custom" &&
          (numberValue(item.custom_gst_percent) < 0 ||
            numberValue(item.custom_gst_percent) > 100))
    )

    if (invalidItem) {
      toast.error("Check item quantity, rate, discount and GST")
      return
    }

    if (numberValue(billDiscount) < 0) {
      toast.error("Bill discount cannot be negative")
      return
    }

    if (numberValue(amountPaid) < 0 || numberValue(advanceUsed) < 0) {
      toast.error("Payment amounts cannot be negative")
      return
    }

    if (paymentExceedsBill) {
      toast.error("Received amount cannot be greater than the bill total")
      return
    }

    if (numberValue(roundOff) + calculated.taxable + calculated.totalGst < 0) {
      toast.error("Invalid round off amount")
      return
    }

    setReviewOpen(true)
  }

  async function confirmCreateBill() {
    if (saving) return

    // Rebuild the valid item list inside this function's scope.
    // handleSubmit has its own local validItems variable, which is not
    // available here after the review dialog is confirmed.
    const validItems = items
      .map((item, index) => ({ ...item, originalIndex: index }))
      .filter((item) => item.item_name.trim())

    setReviewOpen(false)
    setSaving(true)
    let createdBillId = null

    try {
      const billNumber = generateBillNumber()
      let uploadedBillUrl = null

      // 1. Upload offline bill to Supabase Storage (if selected)
      if (offlineBillFile) {
        const fileExt = offlineBillFile.name.split(".").pop()
        const fileName = `${currentShop.id}/${billNumber}-${Date.now()}.${fileExt}`

        const { error: uploadError } = await supabase.storage
          .from("bill_attachments")
          .upload(fileName, offlineBillFile)

        if (uploadError) throw new Error("Failed to upload attachment: " + uploadError.message)

        const { data: urlData } = supabase.storage
          .from("bill_attachments")
          .getPublicUrl(fileName)

        uploadedBillUrl = urlData.publicUrl
      }

      const billPayload = {
        shop_id: currentShop.id,
        customer_id: customerId,
        bill_number: billNumber,
        bill_date: billDate,
        is_interstate: isInterstate,
        tax_inclusive: taxInclusive,
        subtotal: calculated.subtotal,
        discount_amount: calculated.totalDiscount,
        taxable_amount: calculated.taxable,
        cgst_amount: calculated.cgst,
        sgst_amount: calculated.sgst,
        igst_amount: calculated.igst,
        total_gst: calculated.totalGst,
        round_off: numberValue(roundOff),
        grand_total: calculated.grandTotal,
        advance_adjusted: calculated.advanceUsed,
        amount_paid: calculated.amountPaid,
        amount_due: calculated.amountDue,
        due_date: dueDate || null,
        payment_status: paymentStatus,
        notes: notes.trim() || null,
        attachment_url: uploadedBillUrl,
      }

      const { data: bill, error: billError } = await supabase
        .from("bills")
        .insert(billPayload)
        .select()
        .single()

      if (billError) throw billError
      createdBillId = bill.id

      if (validItems.length > 0) {
        const itemRows = validItems.map((item, index) => {
          const calc = calculated.itemCalcs[item.originalIndex]
          const gstPercent =
            item.gst_percent === "custom"
              ? numberValue(item.custom_gst_percent)
              : numberValue(item.gst_percent)

          return {
            bill_id: bill.id,
            item_name: item.item_name.trim(),
            description: item.description.trim() || null,
            quantity: calc.quantity,
            unit: item.unit,
            rate: calc.rate,
            discount: roundToTwo(calc.discount + calc.billDiscountShare),
            gst_percent: gstPercent,
            taxable_amount: calc.taxableAmount,
            gst_amount: calc.gstAmount,
            total_amount: calc.totalAmount,
            sort_order: index,
          }
        })

        const { error: itemsError } = await supabase.from("bill_items").insert(itemRows)
        if (itemsError) throw itemsError
      }

      if (calculated.amountPaid > 0) {
        const { error: paymentError } = await supabase.from("payments").insert({
          shop_id: currentShop.id,
          customer_id: customerId,
          bill_id: bill.id,
          amount: calculated.amountPaid,
          payment_mode: paymentMode,
          // Payment made at billing time is recorded on the bill date
          payment_date: billDate,
          is_advance: false,
        })
        if (paymentError) throw paymentError
      }

      if (calculated.advanceUsed > 0) {
        const { data: advances, error: advanceError } = await supabase
          .from("customer_advances")
          .select("*")
          .eq("customer_id", customerId)
          .gt("remaining_amount", 0)
          .order("created_at", { ascending: true })

        if (advanceError) throw advanceError

        let remaining = calculated.advanceUsed

        for (const advance of advances || []) {
          if (remaining <= 0) break

          const available = numberValue(advance.remaining_amount)
          const use = roundToTwo(Math.min(available, remaining))
          if (use <= 0) continue

          const { error: allocationError } = await supabase
            .from("advance_allocations")
            .insert({ advance_id: advance.id, bill_id: bill.id, amount: use })

          if (allocationError) throw allocationError

          const { error: updateError } = await supabase
            .from("customer_advances")
            .update({ remaining_amount: roundToTwo(available - use) })
            .eq("id", advance.id)

          if (updateError) throw updateError
          remaining = roundToTwo(remaining - use)
        }

        if (remaining > 0.01) {
          throw new Error("Advance balance changed. Please refresh and try again.")
        }
      }

      const customerForMessage = selectedCustomer || customers.find((customer) => customer.id === customerId)
      const whatsappPhone = getWhatsAppNumber(customerForMessage)

      const separator = "━━━━━━━━━━━━━━━━━━"
      const shopAddress = [
        currentShop.address,
        currentShop.city,
        currentShop.state,
        currentShop.pincode ? `PIN - ${currentShop.pincode}` : "",
      ].filter(Boolean).join(", ")
      const customerAddress = [
        customerForMessage?.address,
        customerForMessage?.city,
        customerForMessage?.state,
        customerForMessage?.pincode ? `PIN - ${customerForMessage.pincode}` : "",
      ].filter(Boolean).join(", ")

      const itemLines = validItems.map((item, index) => {
        const calc = calculated.itemCalcs[item.originalIndex]
        const quantity = `${calc.quantity} ${item.unit || ""}`.trim()
        return [
          `${index + 1}. ${item.item_name.trim()}`,
          `   Qty: ${quantity} | Rate: ${formatCurrency(calc.rate)} | Discount: ${formatCurrency(calc.discount)} | GST: ${calc.gstPercent}% | Amount: ${formatCurrency(calc.totalAmount)}`,
        ].join("\\n")
      })

      const paymentLines = calculated.amountPaid > 0
        ? [`• Payment: ${formatCurrency(calculated.amountPaid)} | ${paymentMode} | ${formatDate(billDate)}`]
        : []

      const messageLines = [
        `*${currentShop.name || "Shop"}*`,
        shopAddress,
        currentShop.mobile ? `Contact: ${currentShop.mobile}` : "",
        currentShop.gstin ? `GSTIN: ${currentShop.gstin}` : "",
        separator,
        "*TAX INVOICE / BILL*",
        separator,
        `*Bill No:* ${billNumber}`,
        `*Bill Date:* ${formatDate(billDate)}`,
        `*Due Date:* ${dueDate ? formatDate(dueDate) : "Not set"}`,
        `*Status:* ${paymentStatus.toUpperCase()}`,
        "*BILL TO*",
        `Customer: ${customerForMessage?.name || "Customer"}`,
        customerForMessage?.mobile ? `Mobile: ${customerForMessage.mobile}` : "",
        customerAddress ? `Address: ${customerAddress}` : "",
        separator,
        "*ITEM DETAILS*",
        separator,
        ...(itemLines.length ? itemLines : ["Offline bill attachment uploaded."]),
        separator,
        "*AMOUNT SUMMARY*",
        separator,
        `Subtotal: ${formatCurrency(calculated.subtotal)}`,
        ...(calculated.totalDiscount > 0 ? [`Discount: ${formatCurrency(calculated.totalDiscount)}`] : []),
        ...(calculated.taxable > 0 ? [`Taxable Amount: ${formatCurrency(calculated.taxable)}`] : []),
        ...(calculated.cgst > 0 ? [`CGST: ${formatCurrency(calculated.cgst)}`] : []),
        ...(calculated.sgst > 0 ? [`SGST: ${formatCurrency(calculated.sgst)}`] : []),
        ...(calculated.igst > 0 ? [`IGST: ${formatCurrency(calculated.igst)}`] : []),
        ...(calculated.totalGst > 0 ? [`Total GST: ${formatCurrency(calculated.totalGst)}`] : []),
        ...(numberValue(roundOff) !== 0 ? [`Round Off: ${formatCurrency(numberValue(roundOff))}`] : []),
        `*GRAND TOTAL: ${formatCurrency(calculated.grandTotal)}*`,
        `Advance Adjusted: ${formatCurrency(calculated.advanceUsed)}`,
        `Amount Received: ${formatCurrency(calculated.amountPaid)}`,
        `Total Received: ${formatCurrency(settledAmount)}`,
        `*BALANCE DUE: ${formatCurrency(calculated.amountDue)}*`,
        ...(paymentLines.length ? ["*PAYMENT HISTORY*", ...paymentLines] : []),
        notes.trim() ? `Notes: ${notes.trim()}` : "",
        "Thank you for your business",
      ].filter((line) => line !== null && line !== undefined && line !== "")

      const message = messageLines.join("\n")

      setCreatedBillShare({
        billId: bill.id,
        billNumber,
        phone: whatsappPhone,
        customerName: customerForMessage?.name || "Customer",
        message,
        attachmentUrl: uploadedBillUrl,
      })
      toast.success(`Bill ${billNumber} created`)

    } catch (error) {
      console.error("Create bill error:", error)

      if (createdBillId) {
        toast.error(
          "Bill was created, but a payment or item operation failed. Check the bill before retrying."
        )
      } else {
        toast.error(error.message || "Failed to create bill")
      }
    } finally {
      setSaving(false)
    }
  }

  /* --------------------------------------------------
     EMPTY STATE
  -------------------------------------------------- */

  if (!currentShop) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-3xl border border-dashed border-violet-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 p-8 text-center">
        <div className="max-w-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
            <Receipt className="h-7 w-7" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">No workspace selected</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Select a workspace to create a bill.
          </p>
        </div>
      </div>
    )
  }

  /* --------------------------------------------------
     MAIN UI
  -------------------------------------------------- */

  return (
    <div className="create-bill-page min-h-full w-full space-y-4 rounded-2xl bg-[#f7f5ff] dark:bg-slate-950 px-3 py-5 sm:px-5 lg:px-6">
      {/* PAGE HEADER */}

      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400"
          >
            <span>{currentShop.name || "Workspace"}</span>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            <button
              type="button"
              onClick={() => navigate("/bills")}
              className="transition-colors hover:text-slate-800"
            >
              Bills
            </button>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            <span>Create bill</span>
          </nav>

          <h1 className="mt-1 text-[29px] font-bold tracking-tight text-[#171a39] dark:text-slate-100 sm:text-[32px]">
            Create bill
          </h1>

          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
            Billing for{" "}
            <strong className="font-semibold text-slate-800 dark:text-slate-200">
              {selectedCustomer?.name || "a customer"}
            </strong>{" "}
            on{" "}
            <strong className="font-semibold text-slate-800 dark:text-slate-200">{formatDate(billDate)}</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex h-11 items-center gap-2 rounded-xl border border-violet-100 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-3.5 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm">
            <CalendarDays className="h-4 w-4 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
            <span>Today, {formatDate(today)}</span>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing || loadingCustomers}
            aria-label={refreshing ? "Refreshing create bill data" : "Refresh create bill data"}
            title="Refresh"
            className="gap-2 h-11 rounded-xl border border-violet-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-700"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
            <span className="text-sm font-medium">{refreshing ? "Refreshing..." : "Refresh"}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(-1)}
            className="h-11 gap-2 rounded-xl border-violet-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-4 text-slate-700 dark:text-slate-200 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-700"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </Button>
        </div>
      </header>

      {/* LIVE OVERVIEW */}

      <section
        aria-label="Bill overview"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4"
      >
        <StatCard
          label="Items"
          value={namedItemCount.toLocaleString("en-IN")}
          detail={namedItemCount === 1 ? "item added" : "items added"}
          icon={FileText}
          tone="blue"
        />
        <StatCard
          label="Grand total"
          value={formatCurrency(calculated.grandTotal)}
          detail={`Incl. ${formatCurrency(calculated.totalGst)} GST`}
          icon={Wallet}
          tone="green"
        />
        <StatCard
          label="Received now"
          value={formatCurrency(settledAmount)}
          detail={
            calculated.advanceUsed > 0
              ? `Incl. ${formatCurrency(calculated.advanceUsed)} advance`
              : "Cash / online payment"
          }
          icon={ArrowDownLeft}
          tone="purple"
        />
        <StatCard
          label="Remaining due"
          value={formatCurrency(calculated.amountDue)}
          detail={dueDate ? `Due on ${formatDate(dueDate)}` : "No due date set"}
          icon={IndianRupee}
          tone="pink"
          valueClass={calculated.amountDue > 0 ? "text-rose-600 dark:text-rose-300" : "text-[#171a36] dark:text-slate-100"}
        />
      </section>

      <form
        onSubmit={handleSubmit}
        onKeyDown={(event) => {
          const target = event.target
          if (!(target instanceof HTMLElement)) return

          // Keep multiline editing and open dropdown navigation native.
          if (target.tagName === "TEXTAREA") {
            if (event.key === "Enter") return
            if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return
          }

          const isArrowKey = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
          const isOpenDropdownOption = target.closest(
            '[role="listbox"], [data-radix-popper-content-wrapper]'
          )
          const isOpenCombobox = target.getAttribute("role") === "combobox" &&
            target.getAttribute("aria-expanded") === "true"

          // While a dropdown is open, let Radix move through its options.
          // Once an option is selected and the dropdown closes, arrow keys
          // return to bill-field navigation.
          if (isArrowKey && (isOpenDropdownOption || isOpenCombobox)) return

          const fields = Array.from(
            event.currentTarget.querySelectorAll(
              'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), [role="combobox"]:not([aria-disabled="true"])'
            )
          ).filter((field) => field.getClientRects().length > 0)

          const currentIndex = fields.indexOf(target)
          if (currentIndex < 0) return

          const focusField = (index) => {
            const nextField = fields[index]
            if (!nextField) return
            event.preventDefault()
            nextField.focus()
            if (
              nextField.tagName === "INPUT" &&
              !["number", "date", "file", "checkbox", "radio"].includes(nextField.type)
            ) {
              nextField.select()
            }
          }

          if (event.key === "Enter") {
            // Enter moves to the next field; it never submits the bill.
            if (target.tagName === "INPUT" || target.getAttribute("role") === "combobox") {
              focusField(currentIndex + 1)
            }
            return
          }

          if (event.key === "ArrowDown") {
            focusField(currentIndex + 1)
            return
          }

          if (event.key === "ArrowUp") {
            focusField(currentIndex - 1)
            return
          }

          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            // In text inputs, preserve normal caret movement. Move between fields
            // only when the caret is already at the relevant edge.
            const isTextLike =
              target.tagName === "INPUT" &&
              ["text", "search", "tel", "url", "email"].includes(target.type)

            if (isTextLike && typeof target.selectionStart === "number") {
              const atStart = target.selectionStart === 0 && target.selectionEnd === 0
              const atEnd =
                target.selectionStart === target.value.length &&
                target.selectionEnd === target.value.length

              if (event.key === "ArrowLeft" && !atStart) return
              if (event.key === "ArrowRight" && !atEnd) return
            }

            focusField(event.key === "ArrowLeft" ? currentIndex - 1 : currentIndex + 1)
          }
        }}
      >
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_350px]">
          {/* LEFT COLUMN */}

          <div className="min-w-0 space-y-4">
            {/* CUSTOMER */}

            <Section
              title="Customer details"
              description="Search and select who this bill is for."
              icon={UserRound}
              className="relative z-20 !overflow-visible"
              action={
                <Button
                  type="button"
                  onClick={openAddCustomerDialog}
                  className="shrink-0 gap-2 h-11 rounded-xl border border-violet-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-700"
                >
                  <Plus className="h-4 w-4" />
                  Add customer
                </Button>
              }
            >
              <div ref={customerBoxRef} className="relative z-30">
                {selectedCustomer ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-violet-100 dark:border-slate-700 bg-[#faf9ff] dark:bg-slate-800/80 p-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <CustomerAvatar
                        name={selectedCustomer.name}
                        photoUrl={selectedCustomer.photo_url}
                        className="h-11 w-11"
                      />

                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                          {selectedCustomer.name}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                          {[selectedCustomer.mobile, selectedCustomer.city, selectedCustomer.state]
                            .filter(Boolean)
                            .join(" · ") || "Customer selected"}
                        </p>
                        {(selectedCustomer.gstin || selectedCustomer.address || selectedCustomer.customer_type) && (
                          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                            {[
                              selectedCustomer.customer_type,
                              selectedCustomer.gstin ? `GSTIN: ${selectedCustomer.gstin}` : null,
                              selectedCustomer.address,
                            ].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label="Change customer"
                      className="shrink-0 gap-1.5 h-11 rounded-xl border border-violet-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-700"
                      onClick={() => {
                        setCustomerId("")
                        setCustomerSearch("")
                      }}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      Change
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search
                      className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                      aria-hidden="true"
                    />
                    <Input
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value)
                        setCustomerDropdownOpen(true)
                      }}
                      onFocus={() => setCustomerDropdownOpen(true)}
                      onClick={() => setCustomerDropdownOpen(true)}
                      placeholder="Search by name or mobile number…"
                      aria-label="Search customer"
                      className={`${fieldClass} pl-10`}
                    />
                    {customerSearch && (
                      <button
                        type="button"
                        onClick={() => setCustomerSearch("")}
                        aria-label="Clear search"
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-700"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}

                    {customerDropdownOpen &&
                      customerDropdownPosition &&
                      typeof document !== "undefined" &&
                      createPortal(
                        <div
                          ref={customerDropdownRef}
                          style={{
                            position: "fixed",
                            left: customerDropdownPosition.left,
                            top: customerDropdownPosition.top,
                            width: customerDropdownPosition.width,
                            maxHeight: customerDropdownPosition.maxHeight,
                          }}
                          className="z-[9999] overflow-y-auto rounded-xl border border-violet-100 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-[0_12px_32px_rgba(80,65,130,0.18)]"
                        >
                          {loadingCustomers ? (
                            <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-slate-500 dark:text-slate-400">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading customers…
                            </div>
                          ) : filteredCustomers.length > 0 ? (
                            filteredCustomers.slice(0, 5).map((customer, index) => (
                              <button
                                key={customer.id}
                                type="button"
                                onClick={() => {
                                  setCustomerId(customer.id)
                                  setCustomerSearch("")
                                  setCustomerDropdownOpen(false)
                                }}
                                className="flex w-full items-center justify-between gap-3 border-b border-[#eeecf5] dark:border-slate-700 px-4 py-3 text-left transition-colors last:border-0 hover:bg-[#f9f8ff] dark:hover:bg-slate-700"
                              >
                                <div className="flex min-w-0 items-center gap-3">
                                  <CustomerAvatar
                                    name={customer.name}
                                    photoUrl={customer.photo_url}
                                    className={`h-9 w-9 text-xs ${
                                      AVATAR_COLORS[index % AVATAR_COLORS.length]
                                    }`}
                                  />
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                                      {customer.name}
                                    </p>
                                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                                      {[customer.mobile, customer.city].filter(Boolean).join(" · ") ||
                                        "No contact details"}
                                    </p>
                                  </div>
                                </div>
                                <span className="shrink-0 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                                  Select
                                </span>
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-6 text-center">
                              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                                <UserRound className="h-5 w-5" />
                              </div>
                              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No customer found</p>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                Add a new customer and continue creating this bill.
                              </p>
                              <Button
                                type="button"
                                size="sm"
                                onClick={openAddCustomerDialog}
                                className="mt-3 gap-2 h-11 rounded-xl border border-violet-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-700"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                Add customer
                              </Button>
                            </div>
                          )}
                        </div>,
                        document.body
                      )}
                  </div>
                )}

                {selectedCustomer && advanceAvailable > 0 && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-emerald-100 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/40 px-3.5 py-2.5">
                    <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                      Available customer advance
                    </span>
                    <span className="text-sm font-bold tabular-nums text-emerald-800 dark:text-emerald-300">
                      {formatCurrency(advanceAvailable)}
                    </span>
                  </div>
                )}
              </div>
            </Section>

            {/* BILL DATES & NOTES */}

            <Section
              title="Bill details"
              description="Bill date, payment due date and internal notes."
              icon={CalendarDays}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label="Bill date *"
                  hint={
                    isBackDated
                      ? "Back-dated bill. Sales will be counted on this date."
                      : "Defaults to today. Change it for older paper bills."
                  }
                >
                  <Input
                    type="date"
                    value={billDate}
                    max={today}
                    onChange={(e) => handleBillDateChange(e.target.value)}
                    className={fieldClass}
                  />
                </FormField>

                <FormField label="Payment due date" hint="Leave empty if there is no deadline.">
                  <Input
                    type="date"
                    value={dueDate}
                    min={billDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className={fieldClass}
                  />
                </FormField>

                <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                  <span className="mr-1 text-xs font-medium text-slate-500 dark:text-slate-400">Due in</span>
                  {DUE_SHORTCUTS.map((shortcut) => (
                    <ChipButton
                      key={shortcut.days}
                      active={dueDate === shiftDate(billDate, shortcut.days)}
                      onClick={() => setDueIn(shortcut.days)}
                    >
                      {shortcut.label}
                    </ChipButton>
                  ))}
                  {dueDate && (
                    <button
                      type="button"
                      onClick={() => setDueDate("")}
                      className="ml-1 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-rose-600"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <FormField label="Notes (optional)" className="sm:col-span-2">
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add any additional information…"
                    rows={3}
                    className="resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-3 text-sm text-slate-800 dark:text-slate-200 shadow-sm shadow-slate-900/[0.02] transition-all placeholder:text-slate-400 hover:border-violet-200 dark:hover:border-slate-600 focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/15"
                  />
                </FormField>
              </div>
            </Section>

            {/* ITEMS */}

            <Section
              title="Bill items"
              description={`${namedItemCount} ${namedItemCount === 1 ? "item" : "items"} added`}
              icon={FileText}
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addItem}
                  className="shrink-0 gap-2 h-11 rounded-xl border border-violet-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-700"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add item
                </Button>
              }
            >
              <p className="mb-3 rounded-lg border border-emerald-100 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/40 px-3 py-2 text-[11px] leading-5 text-emerald-800 dark:text-emerald-300">
                New items appear at the top. Enter a fixed ₹ discount or type a percentage like 30%; quick percentage options are below. Use Enter or ↑ / ↓ to move between fields.
              </p>
              <div className="space-y-3">
                {items.map((item, index) => {
                  const calc = calculated.itemCalcs[index]

                  return (
                    <div
                      key={index}
                      className="rounded-2xl border border-[#ece9f5] dark:border-slate-700 bg-white dark:bg-slate-900 transition-colors hover:border-violet-200 dark:hover:border-slate-600"
                    >
                      <div className="flex items-center justify-between gap-3 rounded-t-2xl border-b border-[#eeecf5] dark:border-slate-700 bg-[#f5f3fc] dark:bg-slate-800 px-4 py-2.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div
                            aria-hidden="true"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-950/50 text-xs font-bold text-violet-700 dark:text-violet-300"
                          >
                            {index + 1}
                          </div>
                          <p className="truncate text-[13px] font-bold text-slate-800 dark:text-slate-200">
                            {item.item_name.trim() || `Item ${index + 1}`}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => duplicateItem(index)}
                            className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 transition-colors hover:bg-white hover:text-slate-800"
                            aria-label={`Duplicate item ${index + 1}`}
                            title="Duplicate item"
                          >
                            <Copy className="h-4 w-4" />
                          </button>

                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeItem(index)}
                              className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                              aria-label={`Remove item ${index + 1}`}
                              title="Remove item"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3 p-4">
                        <FormField label="Item name *">
                          <Input
                            ref={(element) => { itemNameRefs.current[index] = element }}
                            value={item.item_name}
                            onChange={(e) => updateItem(index, "item_name", e.target.value)}
                            placeholder="e.g. Cement, Notebook, Shirt"
                            className={fieldClass}
                          />
                        </FormField>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <FormField label="Quantity">
                            <Input
                              type="number"
                              min="0.001"
                              step="0.001"
                              value={item.quantity}
                              onChange={(e) => updateItem(index, "quantity", e.target.value)}
                              className={fieldClass}
                            />
                          </FormField>

                          <FormField label="Unit">
                            <Select
                              value={item.unit}
                              onValueChange={(value) => updateItem(index, "unit", value)}
                            >
                              <SelectTrigger className={fieldClass}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent
                                position="popper"
                                sideOffset={6}
                                className="z-[100] max-h-[min(60vh,360px)] overflow-y-auto overscroll-contain"
                              >
                                {UNITS.map((unit) => (
                                  <SelectItem key={unit} value={unit}>
                                    {unit}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormField>

                          <FormField label="Rate (₹)">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.rate}
                              onChange={(e) => updateItem(index, "rate", e.target.value)}
                              placeholder="0.00"
                              className={fieldClass}
                            />
                          </FormField>

                          <FormField
                            label="Sale / Discount"
                            hint={
                              item.discount.trim().endsWith("%")
                                ? `Percentage discount · ${formatCurrency(getItemDiscountAmount(item))} off`
                                : item.discount.trim()
                                  ? `Fixed discount · ${formatCurrency(getItemDiscountAmount(item))} off`
                                  : "Enter ₹ amount or percentage, e.g. 30%"
                            }
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={item.discount}
                                onChange={(e) => updateItem(index, "discount", e.target.value)}
                                placeholder="₹ amount or 30%"
                                className={`${fieldClass} h-11 min-w-0 flex-1`}
                                aria-label={`Sale or discount for item ${index + 1}`}
                              />
                              <div className="relative shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDiscountMenuOpen((current) => current === index ? null : index)
                                  }
                                  aria-expanded={discountMenuOpen === index}
                                  aria-haspopup="true"
                                  aria-label="Choose discount percentage"
                                  title="Choose discount percentage"
                                  className="inline-flex h-11 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0 text-slate-700 dark:text-slate-200 shadow-sm transition-colors hover:border-violet-200 dark:hover:border-slate-600 hover:bg-violet-50 dark:hover:bg-slate-700"
                                >
                                  <ChevronRight
                                    className={`h-4 w-4 transition-transform ${
                                      discountMenuOpen === index ? "rotate-90" : ""
                                    }`}
                                  />
                                </button>

                                {discountMenuOpen === index && (
                                  <div className="absolute right-0 top-full z-30 mt-2 w-52 rounded-xl border border-violet-100 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 shadow-[0_10px_28px_rgba(80,65,130,0.16)]">
                                  <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                    Select percentage
                                  </p>
                                  <div className="grid grid-cols-4 gap-1.5">
                                    {[5, 10, 15, 20, 25, 30, 40, 50].map((percent) => (
                                      <button
                                        key={percent}
                                        type="button"
                                        onClick={() => {
                                          updateItem(index, "discount", `${percent}%`)
                                          setDiscountMenuOpen(null)
                                        }}
                                        className={`rounded-lg border px-1.5 py-2 text-[11px] font-semibold transition-colors ${
                                          item.discount === `${percent}%`
                                            ? "border-violet-200 dark:border-slate-700 bg-violet-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                                            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-violet-200 dark:hover:border-slate-600 hover:bg-violet-50 dark:hover:bg-slate-700"
                                        }`}
                                      >
                                        {percent}%
                                      </button>
                                    ))}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      updateItem(index, "discount", "0")
                                      setDiscountMenuOpen(null)
                                    }}
                                    className="mt-2 w-full rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50"
                                  >
                                    Clear discount
                                  </button>
                                </div>
                                )}
                              </div>
                            </div>
                          </FormField>

                          <FormField label="GST rate">
                            <Select
                              value={item.gst_percent}
                              onValueChange={(value) => updateItem(index, "gst_percent", value)}
                            >
                              <SelectTrigger className={fieldClass}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {GST_RATES.map((rate) => (
                                  <SelectItem key={rate} value={String(rate)}>
                                    {rate}%
                                  </SelectItem>
                                ))}
                                <SelectItem value="custom">Custom</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormField>

                          {item.gst_percent === "custom" && (
                            <FormField label="Custom GST (%)">
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={item.custom_gst_percent}
                                onChange={(e) =>
                                  updateItem(index, "custom_gst_percent", e.target.value)
                                }
                                className={fieldClass}
                              />
                            </FormField>
                          )}

                          <div className="col-span-2 flex min-h-[44px] items-center justify-between self-end rounded-xl border border-emerald-100 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/40 px-3.5 py-2">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Item total</p>
                              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                                Taxable {formatCurrency(calc?.taxableAmount || 0)} · GST{" "}
                                {formatCurrency(calc?.gstAmount || 0)}
                              </p>
                            </div>
                            <span className="shrink-0 text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
                              {formatCurrency(calc?.totalAmount || 0)}
                            </span>
                          </div>
                        </div>

                        <FormField label="Description (optional)">
                          <Input
                            value={item.description}
                            onChange={(e) => updateItem(index, "description", e.target.value)}
                            placeholder="Item details…"
                            className={fieldClass}
                          />
                        </FormField>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-[#eeecf5] dark:border-slate-700 pt-3">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {namedItemCount} {namedItemCount === 1 ? "item" : "items"}
                </span>
                <div className="text-right">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Subtotal</p>
                  <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatCurrency(calculated.subtotal)}
                  </p>
                </div>
              </div>
            </Section>

            {/* TAX & DISCOUNT */}

            <Section
              title="Tax & discount"
              description="Choose how GST is applied and add bill-level adjustments."
              icon={Receipt}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2.5">
                  <ToggleOption
                    checked={isInterstate}
                    onChange={setIsInterstate}
                    title="Inter-state supply (IGST)"
                    description="Charge IGST instead of splitting into CGST and SGST."
                  />
                  <ToggleOption
                    checked={taxInclusive}
                    onChange={setTaxInclusive}
                    title="Item rates include GST"
                    description="The rate you enter already contains the GST amount."
                  />
                </div>

                <div className="grid grid-cols-2 content-start gap-3">
                  <FormField label="Bill discount (₹)">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={billDiscount}
                      onChange={(e) => setBillDiscount(e.target.value)}
                      className={fieldClass}
                    />
                  </FormField>

                  <FormField label="Round off (₹)">
                    <Input
                      type="number"
                      step="0.01"
                      value={roundOff}
                      onChange={(e) => setRoundOff(e.target.value)}
                      className={fieldClass}
                    />
                  </FormField>

                  <p className="col-span-2 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                    Bill discount is shared across all items. Use a negative round off to reduce
                    the total.
                  </p>
                </div>
              </div>
            </Section>

            {/* OFFLINE BILL */}

            <Section
              title="Offline bill upload"
              description="Attach a photo or PDF of the physical bill (optional)."
              icon={Upload}
            >
              {!offlineBillFile ? (
                <div className="space-y-3">
                  <div className="relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-violet-200 dark:border-slate-700 bg-[#faf9ff] dark:bg-slate-800/80 px-4 py-7 text-center transition-colors hover:border-emerald-400 hover:bg-emerald-50/30">
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleOfflineBillChange}
                      aria-label="Choose offline bill from device"
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                    <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                      <Upload className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Choose bill from device</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">PNG, JPG or PDF · max 5 MB</p>
                  </div>

                  <input
                    ref={offlineBillCameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleOfflineBillChange}
                    aria-label="Take a photo of offline bill"
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (offlineBillCameraRef.current) {
                        offlineBillCameraRef.current.value = ""
                        offlineBillCameraRef.current.click()
                      }
                    }}
                    className="h-11 w-full gap-2 rounded-xl border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-700"
                  >
                    <Camera className="h-4 w-4" aria-hidden="true" />
                    Take photo &amp; upload bill
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-violet-100 dark:border-slate-700 bg-[#faf9ff] dark:bg-slate-800/80 p-3.5">
                  <div className="flex min-w-0 items-center gap-3">
                    {offlineBillPreview ? (
                      <img
                        src={offlineBillPreview}
                        alt="Bill preview"
                        className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-violet-100"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300">
                        <FileText className="h-5 w-5" aria-hidden="true" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {offlineBillFile.name}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {(offlineBillFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <input
                      ref={offlineBillCameraRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleOfflineBillChange}
                      aria-label="Take another photo of offline bill"
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        if (offlineBillCameraRef.current) {
                          offlineBillCameraRef.current.value = ""
                          offlineBillCameraRef.current.click()
                        }
                      }}
                      className="h-9 gap-1.5 rounded-lg border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs text-slate-700 dark:text-slate-200 hover:bg-violet-50 dark:hover:bg-slate-700"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      Photo
                    </Button>
                    <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={removeOfflineBill}
                    aria-label="Remove attachment"
                    className="w-8 shrink-0 h-11 rounded-xl border border-violet-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-700"
                  >
                    <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </Section>
          </div>

          {/* RIGHT COLUMN */}

          <aside className="min-w-0 space-y-4 xl:sticky xl:top-4">
            {/* BILL SUMMARY */}

            <Card className={cardClass}>
              <SectionHeader
                icon={Receipt}
                title="Bill summary"
                description="Live totals as you type."
              />

              <CardContent className="space-y-3 p-5">
                <SummaryRow label="Subtotal" value={formatCurrency(calculated.subtotal)} />
                <SummaryRow
                  label="Item discount"
                  value={`-${formatCurrency(calculated.itemDiscount)}`}
                />
                <SummaryRow
                  label="Bill discount"
                  value={`-${formatCurrency(calculated.billDiscount)}`}
                />

                <div className="border-t border-[#eeecf5] dark:border-slate-700 pt-3">
                  <SummaryRow
                    label="Taxable amount"
                    value={formatCurrency(calculated.taxable)}
                    emphasized
                  />
                </div>

                <div className="space-y-2 border-t border-[#eeecf5] dark:border-slate-700 pt-3">
                  {isInterstate ? (
                    <SummaryRow label="IGST" value={formatCurrency(calculated.igst)} />
                  ) : (
                    <>
                      <SummaryRow label="CGST" value={formatCurrency(calculated.cgst)} />
                      <SummaryRow label="SGST" value={formatCurrency(calculated.sgst)} />
                    </>
                  )}
                  <SummaryRow label="Total GST" value={formatCurrency(calculated.totalGst)} />
                  <SummaryRow label="Round off" value={formatCurrency(numberValue(roundOff))} />
                </div>

                <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Grand total</span>
                    <span className="text-2xl font-extrabold tracking-tight tabular-nums text-slate-900 dark:text-slate-100">
                      {formatCurrency(calculated.grandTotal)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* PAYMENT */}

            <Card className={cardClass}>
              <SectionHeader
                icon={CreditCard}
                title="Payment details"
                description="Record what the customer pays now."
                action={<StatusBadge status={paymentStatus} />}
              />

              <CardContent className="space-y-4 p-5">
                {advanceAvailable > 0 && (
                  <FormField
                    label="Use advance (₹)"
                    hint={`Available: ${formatCurrency(advanceAvailable)}`}
                  >
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min="0"
                        max={advanceAvailable}
                        step="0.01"
                        value={advanceUsed}
                        onChange={(e) => setAdvanceUsed(e.target.value)}
                        className={fieldClass}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={useFullAdvance}
                        className="shrink-0 h-11 rounded-xl border border-violet-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-700"
                      >
                        Use max
                      </Button>
                    </div>
                  </FormField>
                )}

                <FormField label="Amount paid now (₹)">
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="0"
                      max={Math.max(0, calculated.grandTotal - calculated.advanceUsed)}
                      step="0.01"
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                      className={fieldClass}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={payFull}
                      className="shrink-0 h-11 rounded-xl border border-violet-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-700"
                    >
                      Full
                    </Button>
                  </div>
                </FormField>

                <FormField label="Payment mode">
                  <Select value={paymentMode} onValueChange={setPaymentMode}>
                    <SelectTrigger className={fieldClass}>
                      <SelectValue placeholder="Select payment mode" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_MODES.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {mode}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>

                {/* Collection progress */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-600 dark:text-slate-300">Settled</span>
                    <span className="font-bold tabular-nums text-slate-800 dark:text-slate-200">{settledPercent}%</span>
                  </div>
                  <div
                    className="h-2.5 overflow-hidden rounded-full bg-rose-100 dark:bg-rose-950/50"
                    role="progressbar"
                    aria-label="Amount settled"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={settledPercent}
                  >
                    <div
                      className="h-full rounded-full bg-emerald-600 transition-all duration-500"
                      style={{ width: `${settledPercent}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-2.5 border-t border-[#eeecf5] dark:border-slate-700 pt-3">
                  {calculated.advanceUsed > 0 && (
                    <SummaryRow
                      label="Advance adjusted"
                      value={`-${formatCurrency(calculated.advanceUsed)}`}
                    />
                  )}
                  <SummaryRow label="Paid now" value={formatCurrency(calculated.amountPaid)} />

                  <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-100 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/30 px-3.5 py-2.5">
                    <span className="text-sm font-semibold text-rose-700 dark:text-rose-300">Remaining due</span>
                    <span className="text-base font-bold tabular-nums text-rose-700 dark:text-rose-300">
                      {formatCurrency(calculated.amountDue)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ACTIONS */}

            <Card className={cardClass}>
              <CardContent className="space-y-3 p-5">
                <ul className="space-y-2">
                  <ChecklistItem done={Boolean(customerId)} label="Customer selected" />
                  <ChecklistItem
                    done={namedItemCount > 0 || Boolean(offlineBillFile)}
                    label="Items added or offline bill attached"
                  />
                  <ChecklistItem done={Boolean(billDate)} label={`Bill date: ${formatDate(billDate)}`} />
                </ul>

                {paymentExceedsBill && (
                  <p role="alert" className="mb-2 text-xs font-semibold text-red-600 dark:text-red-300">
                    Received amount is greater than the bill total. Please reduce the payment amount to continue.
                  </p>
                )}
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving || !readyToCreate || paymentExceedsBill}
                  className="w-full gap-2 h-11 rounded-xl border border-violet-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-700"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Creating bill…
                    </>
                  ) : (
                    <>
                      <Receipt className="h-4 w-4" aria-hidden="true" />
                      Create bill
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => navigate(-1)}
                  className="w-full gap-2 h-11 rounded-xl border border-violet-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-700"
                >
                  Cancel
                </Button>

                <p className="text-center text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                  Review customer, items and payment details before creating the bill.
                </p>
              </CardContent>
            </Card>
          </aside>
        </div>

        {/* MOBILE ACTION BAR */}

        <div className="sticky bottom-3 z-30 mt-4 flex items-center justify-between gap-3 rounded-2xl border border-violet-100 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 p-3 shadow-[0_12px_32px_rgba(80,65,130,0.25)] backdrop-blur xl:hidden">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Grand total</p>
            <p className="truncate text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {formatCurrency(calculated.grandTotal)}
            </p>
          </div>

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !readyToCreate}
            className="shrink-0 gap-2 h-11 rounded-xl border border-violet-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-700"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Receipt className="h-4 w-4" aria-hidden="true" />
            )}
            {saving ? "Creating…" : "Create bill"}
          </Button>
        </div>
      </form>

      <Dialog open={Boolean(createdBillShare)} onOpenChange={(open) => {
        if (!open && createdBillShare) navigate(`/bills/${createdBillShare.billId}`)
      }}>
        <DialogContent className="w-[calc(100vw-1.25rem)] max-w-lg overflow-hidden rounded-[20px] border border-violet-100 dark:border-slate-700 p-0">
          <DialogHeader className="border-b border-violet-100 dark:border-slate-700 bg-[#f7f5ff] dark:bg-slate-950 px-5 py-4 text-left">
            <div className="flex items-center gap-3 pr-7">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Bill created successfully
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {createdBillShare?.billNumber} is saved. Share the invoice details with the customer.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 bg-white p-5 dark:bg-slate-900">
            <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/70">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {createdBillShare?.customerName}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {createdBillShare?.phone ? `WhatsApp: +${createdBillShare.phone}` : "No WhatsApp/mobile number saved for this customer."}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">WhatsApp message includes</p>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                Invoice details, item-wise quantity and rate, GST breakup, taxable amount, discount, round off, grand total, advance adjustment, received amount, payment history, notes and balance due.
              </p>
              {createdBillShare?.attachmentUrl && (
                <a
                  href={createdBillShare.attachmentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs font-semibold text-violet-700 underline dark:text-violet-300"
                >
                  View uploaded bill attachment
                </a>
              )}
            </div>
            <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400">
              WhatsApp will open with the complete bill details pre-filled. Review the message and tap Send.
            </p>
          </div>

          <DialogFooter className="flex-col gap-2 border-t border-violet-100 bg-[#f7f5ff] px-5 py-4 dark:border-slate-700 dark:bg-slate-950 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(`/bills/${createdBillShare?.billId}`)}
              className="h-11 w-full rounded-xl border-violet-200 bg-white text-slate-700 hover:bg-violet-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 sm:w-auto"
            >
              <Receipt className="mr-2 h-4 w-4" />
              View bill
            </Button>
            <Button
              type="button"
              disabled={!createdBillShare?.phone}
              onClick={openWhatsAppDraft}
              className="h-11 w-full rounded-xl border border-violet-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-5 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-700 sm:flex-1"
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Send on WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewOpen} onOpenChange={(open) => !saving && setReviewOpen(open)}>
        <DialogContent className="flex max-h-[94vh] w-[calc(100vw-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-[20px] border border-violet-100 dark:border-slate-700 p-0 shadow-[0_12px_32px_rgba(80,65,130,0.20)]">
          <DialogHeader className="border-b border-[#eae7f4] dark:border-slate-700 bg-[#f7f5ff] dark:bg-slate-950 px-5 py-4 text-left">
            <div className="flex items-center gap-3 pr-8">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                <Eye className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-bold text-[#171a36] dark:text-slate-100">
                  Bill preview
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Review the invoice details before creating this bill.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[#efedf7] dark:bg-slate-950 p-3 sm:p-6">
            <article className="mx-auto max-w-3xl overflow-hidden rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-[0_2px_12px_rgba(15,23,42,0.10)]">
              {/* Shop letterhead and invoice heading */}
              <div className="flex flex-col gap-4 px-6 pt-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xl font-bold tracking-tight text-slate-950 dark:text-slate-100">
                    {currentShop.name || "Shop"}
                  </p>
                  <div className="mt-2 space-y-0.5 text-sm text-slate-500 dark:text-slate-400">
                    {currentShop.address && <p className="max-w-xs">{currentShop.address}</p>}
                    {currentShop.mobile && <p>Mobile: {currentShop.mobile}</p>}
                    {currentShop.gstin && (
                      <p>
                        GSTIN: <span className="font-medium text-slate-700 dark:text-slate-200">{currentShop.gstin}</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="sm:text-right">
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                    {currentShop.gstin ? "Tax invoice preview" : "Invoice preview"}
                  </p>
                  <p className="mt-1 text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-100">
                    Draft
                  </p>
                  <div className="mt-2 sm:flex sm:justify-end">
                    <StatusBadge status={paymentStatus} />
                  </div>
                </div>
              </div>

              {/* Customer and bill details */}
              <div className="mt-6 grid grid-cols-1 gap-5 border-y border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 px-6 py-5 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Billed to</p>
                  <p className="mt-1.5 text-base font-bold text-slate-900 dark:text-slate-100">
                    {selectedCustomer?.name || "Walk-in customer"}
                  </p>
                  <div className="mt-1 space-y-0.5 text-sm text-slate-500 dark:text-slate-400">
                    {selectedCustomer?.mobile && <p>Mobile: {selectedCustomer.mobile}</p>}
                    {[
                      selectedCustomer?.address,
                      selectedCustomer?.city,
                      selectedCustomer?.state,
                      selectedCustomer?.pincode,
                    ].filter(Boolean).length > 0 && (
                      <p>
                        {[
                          selectedCustomer?.address,
                          selectedCustomer?.city,
                          selectedCustomer?.state,
                          selectedCustomer?.pincode,
                        ].filter(Boolean).join(", ")}
                      </p>
                    )}
                    {selectedCustomer?.gstin && <p>GSTIN: {selectedCustomer.gstin}</p>}
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {[
                    ["Bill date", billDate ? formatDate(billDate) : "—"],
                    ["Due date", dueDate ? formatDate(dueDate) : "Not set"],
                    ["Supply type", isInterstate ? "Interstate (IGST)" : "Intrastate (CGST + SGST)"],
                    ["Tax calculation", taxInclusive ? "Tax inclusive" : "Tax exclusive"],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Invoice item table */}
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
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {items.filter((item) => item.item_name.trim()).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500 dark:text-slate-400">
                          No bill items found. Offline bill attachment only.
                        </td>
                      </tr>
                    ) : (
                      items.map((item, index) => {
                        if (!item.item_name.trim()) return null
                        const calc = calculated.itemCalcs[index]
                        return (
                          <tr key={`${item.item_name}-${index}`}>
                            <td className="py-3 pr-2 text-slate-400 dark:text-slate-500">{index + 1}</td>
                            <td className="px-2 py-3">
                              <p className="font-medium text-slate-900 dark:text-slate-100">{item.item_name}</p>
                              {item.description && (
                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.description}</p>
                              )}
                            </td>
                            <td className="px-2 py-3 text-right tabular-nums">
                              {calc.quantity} {item.unit || ""}
                            </td>
                            <td className="px-2 py-3 text-right tabular-nums">
                              {formatCurrency(calc.rate)}
                            </td>
                            <td className="px-2 py-3 text-right tabular-nums">
                              {calc.discount > 0 ? formatCurrency(calc.discount) : "—"}
                            </td>
                            <td className="px-2 py-3 text-right tabular-nums">
                              {calc.gstPercent}%
                            </td>
                            <td className="py-3 pl-2 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                              {formatCurrency(calc.totalAmount)}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
                {namedItemCount > 0 && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {namedItemCount} {namedItemCount === 1 ? "item" : "items"} · total quantity{" "}
                    {items.reduce((sum, item) =>
                      item.item_name.trim() ? sum + numberValue(item.quantity) : sum, 0
                    )}
                  </p>
                )}
                {offlineBillFile && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Attachment: <span className="font-medium text-slate-700 dark:text-slate-200">{offlineBillFile.name}</span>
                  </p>
                )}
              </div>

              {/* Totals and payment summary */}
              <div className="grid grid-cols-1 gap-6 border-t border-slate-200 dark:border-slate-700 px-6 py-5 sm:grid-cols-2">
                <div className="space-y-4">
                  {notes.trim() && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Notes</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-600 dark:text-slate-300">
                        {notes}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Payment status</p>
                    <div className="mt-2">
                      <StatusBadge status={paymentStatus} />
                    </div>
                  </div>
                </div>

                <div className="sm:ml-auto sm:w-full sm:max-w-xs">
                  <SummaryRow label="Subtotal" value={formatCurrency(calculated.subtotal)} />
                  {calculated.totalDiscount > 0 && (
                    <SummaryRow
                      label="Discount"
                      value={`− ${formatCurrency(calculated.totalDiscount)}`}
                    />
                  )}
                  {calculated.cgst > 0 && (
                    <SummaryRow label="CGST" value={formatCurrency(calculated.cgst)} />
                  )}
                  {calculated.sgst > 0 && (
                    <SummaryRow label="SGST" value={formatCurrency(calculated.sgst)} />
                  )}
                  {calculated.igst > 0 && (
                    <SummaryRow label="IGST" value={formatCurrency(calculated.igst)} />
                  )}
                  {numberValue(roundOff) !== 0 && (
                    <SummaryRow label="Round off" value={formatCurrency(numberValue(roundOff))} />
                  )}

                  <div className="mt-2 flex items-center justify-between gap-4 rounded-lg bg-slate-900 px-4 py-3 text-white">
                    <span className="text-sm font-semibold">Grand total</span>
                    <span className="text-lg font-bold tabular-nums">
                      {formatCurrency(calculated.grandTotal)}
                    </span>
                  </div>

                  <div className="mt-3 border-t border-dashed border-slate-200 dark:border-slate-700 pt-1">
                    {calculated.advanceUsed > 0 && (
                      <SummaryRow
                        label="Advance adjusted"
                        value={`− ${formatCurrency(calculated.advanceUsed)}`}
                      />
                    )}
                    <SummaryRow
                      label="Payments received"
                      value={`− ${formatCurrency(calculated.amountPaid)}`}
                    />
                    <SummaryRow
                      label="Balance due"
                      value={formatCurrency(calculated.amountDue)}
                      tone={calculated.amountDue > 0 ? "text-rose-600 dark:text-rose-300" : "text-emerald-600"}
                      emphasized
                    />
                  </div>
                </div>
              </div>

              {/* Invoice footer */}
              <div className="flex items-end justify-between gap-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 px-6 py-5">
                <p className="max-w-xs text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Please review the details carefully before confirming this bill.
                </p>
                <div className="text-center">
                  <div className="mb-1.5 h-px w-40 bg-slate-300" />
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Authorised signatory</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{currentShop.name || ""}</p>
                </div>
              </div>
            </article>
          </div>

          <DialogFooter className="flex w-full flex-col items-end justify-end gap-3 border-t border-[#eae7f4] dark:border-slate-700 bg-[#f7f5ff] dark:bg-slate-950 px-5 py-3 sm:flex-row sm:items-center sm:justify-end">
            <div className="ml-auto flex w-full justify-end gap-2 sm:w-auto">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setReviewOpen(false)}
              className="h-10 rounded-xl border-violet-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-slate-700 dark:text-slate-200 hover:bg-violet-50 dark:hover:bg-slate-700"
            >
              Cancel / Edit
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={confirmCreateBill}
              className="h-11 gap-2 rounded-xl border border-violet-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-700"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirm & Create
            </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={duplicatePromptOpen} onOpenChange={setDuplicatePromptOpen}>
        <DialogContent className="max-w-[440px] rounded-[20px] border border-violet-100 dark:border-slate-700 p-0 shadow-[0_12px_32px_rgba(80,65,130,0.25)]">
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700 dark:text-amber-300">
                <CircleAlert className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-bold text-[#171a36] dark:text-slate-100">
                  This customer already exists
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {duplicateCustomer?.name || "This customer"} is already saved
                  {duplicateCustomer?.mobile ? ` with mobile number ${duplicateCustomer.mobile}` : ""}.
                  Would you like to edit the saved details or continue with this existing customer?
                </DialogDescription>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-violet-100 dark:border-slate-700 bg-[#f7f5ff] dark:bg-slate-950 p-3">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{duplicateCustomer?.name}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {[duplicateCustomer?.mobile, duplicateCustomer?.city, duplicateCustomer?.state]
                  .filter(Boolean)
                  .join(" • ") || "Existing customer record"}
              </p>
            </div>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 border-t border-violet-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/70 p-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDuplicatePromptOpen(false)
                setAddCustomerOpen(true)
              }}
              className="h-11 rounded-xl border border-violet-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={editExistingCustomer}
              className="h-11 rounded-xl border border-violet-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-700"
            >
              Edit customer
            </Button>
            <Button
              type="button"
              onClick={continueWithExistingCustomer}
              className="h-11 rounded-xl border border-violet-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-700"
            >
              Continue with existing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addCustomerOpen}
        onOpenChange={(open) => {
          setAddCustomerOpen(open)
          if (!open) {
            setCustomerPhotoFile(null)
            setCustomerPhotoPreview("")
            setCustomerPhotoRemoved(false)
          }
        }}
      >
        <DialogContent className="max-h-[92vh] gap-0 overflow-hidden rounded-[20px] border-0 p-0 shadow-[0_12px_32px_rgba(80,65,130,0.25)] sm:max-w-[600px]">
          <div className="border-b border-[#eae7f4] dark:border-slate-700 bg-[#f7f5ff] dark:bg-slate-950 px-6 pb-5 pt-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white shadow-sm">
                <UserRound className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1 pr-6">
                <DialogTitle className="text-lg font-bold tracking-tight text-[#171a36] dark:text-slate-100">
                  {editingCustomerId ? "Edit customer details" : "Add new customer"}
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {editingCustomerId
                    ? "Update the existing customer's details. The customer will remain selected for this bill."
                    : "Add complete customer details. The customer will be selected automatically for this bill."}
                </DialogDescription>
              </div>
            </div>
          </div>

          <form onSubmit={handleAddCustomer} className="flex max-h-[calc(92vh-110px)] flex-col">
            <div className="flex-1 space-y-6 overflow-y-auto bg-white dark:bg-slate-900 px-6 py-6">
              <section className="rounded-2xl border border-violet-100 dark:border-slate-700 bg-[#fbfaff] dark:bg-slate-800/70 p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white dark:border-slate-700 bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 shadow-[0_2px_10px_rgba(80,65,130,0.12)]">
                    {customerPhotoPreview ? (
                      <img src={customerPhotoPreview} alt="Customer profile preview" className="h-full w-full object-cover" />
                    ) : (
                      <UserRound className="h-8 w-8" aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#171a36] dark:text-slate-100">Customer profile photo</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Add a clear photo to identify this customer easily. JPG, PNG or WEBP · up to 5 MB.</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        ref={customerPhotoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleCustomerPhotoChange}
                      />
                      <Button
                        type="button"
                        onClick={() => customerPhotoInputRef.current?.click()}
                        className="h-11 rounded-xl border border-violet-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-700"
                      >
                        <ImagePlus className="mr-2 h-4 w-4" />
                        {customerPhotoPreview ? "Change photo" : "Add profile photo"}
                      </Button>
                      {customerPhotoPreview && (
                        <Button
                          type="button"
                          onClick={removeCustomerPhoto}
                          className="h-11 rounded-xl border border-violet-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-700"
                        >
                          Remove photo
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-[#171a36] dark:text-slate-100">Basic information</h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Customer name and contact details.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Customer name *" className="sm:col-span-2">
                    <Input
                      autoFocus
                      required
                      value={newCustomer.name}
                      onChange={(e) => setNewCustomer((v) => ({ ...v, name: e.target.value }))}
                      placeholder="Enter customer name"
                      className={fieldClass}
                    />
                  </FormField>
                  <FormField label="Mobile number">
                    <Input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      value={newCustomer.mobile}
                      onChange={(e) => setNewCustomer((v) => ({ ...v, mobile: e.target.value.replace(/[^0-9+ ]/g, "") }))}
                      placeholder="10-digit mobile"
                      className={fieldClass}
                    />
                  </FormField>
                  <FormField label="WhatsApp number" hint="Used for payment reminders.">
                    <Input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      value={newCustomer.whatsapp}
                      onChange={(e) => setNewCustomer((v) => ({ ...v, whatsapp: e.target.value.replace(/[^0-9+ ]/g, "") }))}
                      placeholder="Same as mobile if empty"
                      className={fieldClass}
                    />
                  </FormField>
                  <FormField label="Customer type">
                    <Select
                      value={newCustomer.customer_type}
                      onValueChange={(value) => setNewCustomer((v) => ({ ...v, customer_type: value }))}
                    >
                      <SelectTrigger className={fieldClass}>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {CUSTOMER_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="GSTIN">
                    <Input
                      value={newCustomer.gstin}
                      onChange={(e) => setNewCustomer((v) => ({ ...v, gstin: e.target.value.toUpperCase() }))}
                      placeholder="15-character GSTIN"
                      maxLength={15}
                      className={`${fieldClass} uppercase`}
                    />
                  </FormField>
                </div>
              </section>

              <div className="h-px bg-[#eeecf5]" />

              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-[#171a36] dark:text-slate-100">Address details</h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Customer's billing or business address.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Address" className="sm:col-span-2">
                    <Input
                      value={newCustomer.address}
                      onChange={(e) => setNewCustomer((v) => ({ ...v, address: e.target.value }))}
                      placeholder="House number, street, locality"
                      className={fieldClass}
                    />
                  </FormField>
                  <FormField label="City">
                    <Input
                      value={newCustomer.city}
                      onChange={(e) => setNewCustomer((v) => ({ ...v, city: e.target.value }))}
                      placeholder="City"
                      className={fieldClass}
                    />
                  </FormField>
                  <FormField label="State">
                    <Input
                      value={newCustomer.state}
                      onChange={(e) => setNewCustomer((v) => ({ ...v, state: e.target.value }))}
                      placeholder="State"
                      className={fieldClass}
                    />
                  </FormField>
                  <FormField label="PIN code">
                    <Input
                      inputMode="numeric"
                      maxLength={6}
                      value={newCustomer.pincode}
                      onChange={(e) => setNewCustomer((v) => ({ ...v, pincode: e.target.value.replace(/\D/g, "") }))}
                      placeholder="6-digit PIN code"
                      className={fieldClass}
                    />
                  </FormField>
                </div>
              </section>

              <div className="h-px bg-[#eeecf5]" />

              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-[#171a36] dark:text-slate-100">Opening balance</h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Previous pending amount before using this app.</p>
                </div>
                <FormField label="Opening balance (₹)" hint="Kept separately from bills created in this app.">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newCustomer.opening_balance}
                    onChange={(e) => setNewCustomer((v) => ({ ...v, opening_balance: e.target.value }))}
                    placeholder="0.00"
                    className={fieldClass}
                  />
                </FormField>
              </section>

              <div className="h-px bg-[#eeecf5]" />

              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-[#171a36] dark:text-slate-100">Additional notes</h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Anything else worth remembering about this customer.</p>
                </div>
                <Textarea
                  value={newCustomer.notes}
                  onChange={(e) => setNewCustomer((v) => ({ ...v, notes: e.target.value }))}
                  placeholder="Add any additional information…"
                  rows={3}
                  className="resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-3 text-sm text-slate-800 dark:text-slate-200 shadow-sm shadow-slate-900/[0.02] transition-all placeholder:text-slate-400 hover:border-violet-200 dark:hover:border-slate-600 focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/15"
                />
              </section>
            </div>

            <DialogFooter className="border-t border-[#eae7f4] dark:border-slate-700 bg-[#f7f5ff] dark:bg-slate-950 px-6 py-4 sm:justify-end sm:gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={customerSaving}
                onClick={() => setAddCustomerOpen(false)}
                className="h-11 rounded-xl border border-violet-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-700"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={customerSaving || !newCustomer.name.trim()}
                className="gap-2 h-11 rounded-xl border border-violet-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-violet-50 dark:hover:bg-slate-700"
              >
                {customerSaving ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4" /> {editingCustomerId ? "Update customer" : "Save customer"}</>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}