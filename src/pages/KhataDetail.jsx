import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatDate } from "@/lib/utils"
import { downloadKhataDetailsPDF } from "@/lib/khataDetailsPdf"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
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
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  FileText,
  FileDown,
  Loader2,
  MapPin,
  Mail,
  MessageCircle,
  Pencil,
  Receipt,
  Store,
  StickyNote,
  User,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react"

import { toast } from "sonner"

/* ==================================================
   CONSTANTS
================================================== */

const PAGE_SIZE = 10
const FETCH_BATCH = 1000 // Supabase returns max 1000 rows per request
const IN_CHUNK = 100 // keeps .in() requests short enough for the URL

/**
 * Balance = money the customer owes you.
 *  - "You gave" entries INCREASE the balance
 *  - "You received" entries DECREASE the balance
 * Keep this list the same as in Khata.jsx.
 */
const ENTRY_TYPES = [
  {
    value: "you_gave",
    label: "You gave (credit)",
    hint: "You gave goods or money. Customer owes you more.",
    debit: true,
  },
  {
    value: "customer_paid",
    label: "Customer paid",
    hint: "Customer paid you back. Balance goes down.",
    debit: false,
  },
  {
    value: "new_due",
    label: "New due",
    hint: "Adds a new amount the customer owes you.",
    debit: true,
  },
  {
    value: "advance_received",
    label: "Advance received",
    hint: "Customer paid in advance. Balance goes down.",
    debit: false,
  },
  {
    value: "advance_returned",
    label: "Advance returned",
    hint: "You gave an advance back. Balance goes up.",
    debit: true,
  },
]

const DEBIT_TYPES = ENTRY_TYPES.filter((type) => type.debit).map((type) => type.value)

const PRESETS = [
  { mode: "today", label: "Today" },
  { mode: "yesterday", label: "Yesterday" },
  { mode: "week", label: "Last 7 days" },
  { mode: "month", label: "This month" },
]

const TYPE_FILTERS = [
  { key: "all", label: "All" },
  { key: "gave", label: "You gave" },
  { key: "received", label: "You received" },
]

// Shared action-button style used throughout the Customers page.
const outlineBtn =
  "rounded-xl border-violet-200 bg-white text-slate-700 shadow-sm hover:bg-violet-50"

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-amber-100 text-amber-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
  "bg-violet-100 text-violet-700",
]

/* ==================================================
   HELPERS
================================================== */

const num = (value) => Number(value) || 0
const round2 = (value) => Math.round((num(value) + Number.EPSILON) * 100) / 100

const isDebit = (type) => DEBIT_TYPES.includes(type)
const signedAmount = (type, amount) => (isDebit(type) ? num(amount) : -num(amount))
const getEntryLabel = (type) => ENTRY_TYPES.find((t) => t.value === type)?.label || type

function getToday() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function daysBetween(a, b) {
  const [ya, ma, da] = a.split("-").map(Number)
  const [yb, mb, db] = b.split("-").map(Number)
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000)
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

const escapeLike = (value) => value.replace(/[\\%_]/g, "\\$&")

/** Pages through ALL rows so data stays correct beyond Supabase's 1000-row cap. */
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

// Oldest first: date, then time created, then id
const byOldest = (a, b) => {
  const byDate = String(a.entry_date).localeCompare(String(b.entry_date))
  if (byDate !== 0) return byDate
  const byTime = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  if (byTime !== 0) return byTime
  return String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
}

/**
 * The page link holds "mobile or name" (see Khata.jsx).
 * Phone keys match by the 10-digit number, so "98765 43210" and
 * "9876543210" are the same customer.
 */
function isPhoneKey(key) {
  return /^[\d\s+()-]+$/.test(key) && normalizeMobile(key).length === 10
}

function rowMatchesKey(row, key) {
  const wanted = key.trim().toLowerCase()
  if (isPhoneKey(key)) return normalizeMobile(row.mobile) === normalizeMobile(key)

  return (
    (row.customer_name || "").trim().toLowerCase() === wanted ||
    (row.mobile || "").trim().toLowerCase() === wanted
  )
}

// Public URL -> storage path inside the "avatars" bucket
function getStoragePath(url) {
  if (!url) return null
  const marker = "/avatars/"
  const index = url.indexOf(marker)
  if (index === -1) return null

  try {
    return decodeURIComponent(url.slice(index + marker.length).split("?")[0])
  } catch {
    return null
  }
}

async function removeStoredPhoto(url) {
  const path = getStoragePath(url)
  if (!path) return

  const { error } = await supabase.storage.from("avatars").remove([path])
  if (error) console.error("Could not remove photo from storage:", error)
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
      aria-label="Loading customer ledger"
    >
      <Skeleton className="h-16 w-72" />
      <Skeleton className="h-[170px] rounded-[20px]" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-[20px]" />
        ))}
      </div>
      <Skeleton className="h-[380px] rounded-[20px]" />
    </div>
  )
}

const SUMMARY_TONES = {
  green: { icon: "bg-violet-100/80 text-violet-700", accent: "text-violet-700" },
  blue: { icon: "bg-blue-100/80 text-blue-700", accent: "text-blue-700" },
  pink: { icon: "bg-pink-100/80 text-pink-700", accent: "text-pink-700" },
  purple: { icon: "bg-violet-100/80 text-violet-700", accent: "text-violet-700" },
  slate: { icon: "bg-slate-100 text-slate-600", accent: "text-slate-600" },
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
          <p className="truncate text-[13px] font-medium text-slate-600">{label}</p>
          <h3 className="mt-1.5 break-words text-[23px] font-bold leading-tight tracking-tight text-[#151934] tabular-nums">
            {value}
          </h3>
          <p className={`mt-1.5 text-xs font-semibold ${style.accent}`}>{detail}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function balanceTone(balance) {
  if (balance > 0) {
    return {
      label: "You'll get",
      box: "border-rose-100 bg-rose-50/70",
      text: "text-rose-600",
    }
  }
  if (balance < 0) {
    return {
      label: "Advance held",
      box: "border-violet-100 bg-violet-50/70",
      text: "text-violet-700",
    }
  }
  return { label: "Settled", box: "border-slate-200 bg-slate-50", text: "text-slate-600" }
}

function Avatar({ name, photo, className = "" }) {
  const [failed, setFailed] = useState(false)

  useEffect(() => setFailed(false), [photo])

  if (photo && !failed) {
    return (
      <img
        src={photo}
        alt={`${name} photo`}
        onError={() => setFailed(true)}
        className={`object-cover ${className}`}
      />
    )
  }

  return (
    <span
      className={`flex items-center justify-center font-bold ${avatarColor(name)} ${className}`}
    >
      {getInitials(name)}
    </span>
  )
}

/* ==================================================
   KHATA DETAIL PAGE
================================================== */

export default function KhataDetail() {
  const { customerKey } = useParams() // already decoded by the router
  const navigate = useNavigate()
  const { currentShop } = useShop()
  const shopId = currentShop?.id
  const today = getToday()

  const quickPhotoInput = useRef(null)
  const photoMenuRef = useRef(null)
  const periodRef = useRef(null)
  const hasLoaded = useRef(false)
  const requestId = useRef(0)

  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [lastUpdated, setLastUpdated] = useState(null)

  // Ledger view: all time by default, or pick a period
  const [period, setPeriod] = useState({ mode: "overall", from: "", to: "" })
  const [periodOpen, setPeriodOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  // Photo
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [deletePhotoOpen, setDeletePhotoOpen] = useState(false)
  const [deletingPhoto, setDeletingPhoto] = useState(false)

  // New entry
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const emptyForm = () => ({
    entry_type: "you_gave",
    amount: "",
    due_date: "",
    notes: "",
    entry_date: getToday(),
  })
  const [form, setForm] = useState(emptyForm)

  // Full customer profile dialog
  const [profileOpen, setProfileOpen] = useState(false)

  // Edit customer
  const [editOpen, setEditOpen] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editForm, setEditForm] = useState(() => buildEditForm())
  const [editErrors, setEditErrors] = useState({})

  // Delete entry
  const [deleteEntry, setDeleteEntry] = useState(null)
  const [deleting, setDeleting] = useState(false)

  /* --------------------------------------------------
     LOAD THIS CUSTOMER'S ENTRIES
  -------------------------------------------------- */

  // Always reads straight from the database (used on load AND before saving)
  const fetchCustomerRows = useCallback(async () => {
    const all = await fetchAllRows(() =>
      supabase.from("khata_entries").select("*").eq("shop_id", shopId).order("id")
    )

    let rows = all.filter((row) => rowMatchesKey(row, customerKey))

    // A name link belongs to the customer who has no mobile saved
    if (!isPhoneKey(customerKey)) {
      const noMobile = rows.filter((row) => !(row.mobile || "").trim())
      if (noMobile.length > 0) rows = noMobile
    }

    return rows
  }, [shopId, customerKey])

  useEffect(() => {
    hasLoaded.current = false
    setEntries([])
    setLoadError("")
    setPage(1)
  }, [shopId, customerKey])

  const loadEntries = useCallback(
    async (forceRefresh = false) => {
      const id = ++requestId.current

      if (!shopId || !customerKey) {
        setEntries([])
        setLoading(false)
        return
      }

      if (forceRefresh || hasLoaded.current) setRefreshing(true)
      else setLoading(true)

      setLoadError("")

      try {
        const rows = await fetchCustomerRows()
        if (id !== requestId.current) return

        setEntries(rows)
        setLastUpdated(new Date())
        hasLoaded.current = true
      } catch (error) {
        if (id !== requestId.current) return
        console.error("Khata detail error:", error)
        const message = error?.message || "Unable to load this ledger."
        setLoadError(message)
        toast.error("Could not load ledger", { description: message })
      } finally {
        if (id === requestId.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [shopId, customerKey, fetchCustomerRows]
  )

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  /* --------------------------------------------------
     MENUS: close on outside click / Escape
  -------------------------------------------------- */

  useEffect(() => {
    if (!photoMenuOpen && !periodOpen) return

    const onPointerDown = (event) => {
      if (photoMenuRef.current && !photoMenuRef.current.contains(event.target)) {
        setPhotoMenuOpen(false)
      }
      if (periodRef.current && !periodRef.current.contains(event.target)) {
        setPeriodOpen(false)
      }
    }
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setPhotoMenuOpen(false)
        setPeriodOpen(false)
      }
    }

    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [photoMenuOpen, periodOpen])

  /* --------------------------------------------------
     DATE PERIOD
  -------------------------------------------------- */

  const range = useMemo(() => {
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
  }, [period, today])

  const periodLabel = (() => {
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
  })()

  const choosePeriod = (mode) => {
    setPeriod({ mode, from: "", to: "" })
    setPeriodOpen(false)
  }

  const changeCustomDate = (key, value) => {
    const next = { from: range.from || "", to: range.to || "", [key]: value }

    if (next.from && next.to && next.from > next.to) {
      if (key === "from") next.to = next.from
      else next.from = next.to
    }

    setPeriod({ mode: "custom", ...next })
  }

  /* --------------------------------------------------
     DERIVED DATA
  -------------------------------------------------- */

  const customer = useMemo(() => {
    const newestFirst = [...entries].sort((a, b) => byOldest(b, a))
    const oldestFirst = [...entries].sort(byOldest)
    const first = (field) => newestFirst.find((e) => String(e[field] || "").trim())?.[field] || ""

    const balance = round2(
      entries.reduce((total, e) => total + signedAmount(e.entry_type, e.amount), 0)
    )

    const dueEntry = newestFirst.find((e) => e.due_date && isDebit(e.entry_type))
    const dueDate = dueEntry?.due_date || ""

    return {
      name: String(first("customer_name")).trim() || "Customer",
      mobile: String(first("mobile")).trim(),
      address: String(first("address")).trim(),
      photo: first("customer_photo"),
      email: String(first("email")).trim(),
      pin_code: String(first("pin_code")).trim(),
      gstin: String(first("gstin")).trim(),
      customer_type: String(first("customer_type")).trim(),
      notes: String(first("customer_notes")).trim(),
      since: oldestFirst[0]?.entry_date || "",
      lastEntry: newestFirst[0]?.entry_date || "",
      balance,
      dueDate,
      overdue: balance > 0 && Boolean(dueDate) && dueDate < today,
    }
  }, [entries, today])

  // Running balance after every entry, worked out from ALL entries in date order
  const ledger = useMemo(() => {
    let running = 0
    return [...entries].sort(byOldest).map((entry) => {
      running = round2(running + signedAmount(entry.entry_type, entry.amount))
      return { ...entry, debit: isDebit(entry.entry_type), running }
    })
  }, [entries])

  const inRange = useCallback(
    (entry) =>
      (!range.from || entry.entry_date >= range.from) &&
      (!range.to || entry.entry_date <= range.to),
    [range.from, range.to]
  )

  const periodSummary = useMemo(() => {
    const periodEntries = ledger.filter(inRange)

    const before = range.from ? ledger.filter((e) => e.entry_date < range.from) : []
    const opening = before.length ? before[before.length - 1].running : 0

    const upTo = range.to ? ledger.filter((e) => e.entry_date <= range.to) : ledger
    const closing = upTo.length ? upTo[upTo.length - 1].running : 0

    let gave = 0
    let received = 0
    periodEntries.forEach((e) => {
      if (e.debit) gave += num(e.amount)
      else received += num(e.amount)
    })

    return {
      entries: periodEntries,
      gave: round2(gave),
      received: round2(received),
      opening,
      closing,
      gaveCount: periodEntries.filter((e) => e.debit).length,
      receivedCount: periodEntries.filter((e) => !e.debit).length,
    }
  }, [ledger, inRange, range.from, range.to])

  const visibleEntries = useMemo(() => {
    const query = search.trim().toLowerCase()

    return [...periodSummary.entries]
      .reverse() // newest first
      .filter((entry) => {
        const matchesType =
          typeFilter === "all" || (typeFilter === "gave" ? entry.debit : !entry.debit)
        const matchesSearch =
          !query ||
          (entry.notes || "").toLowerCase().includes(query) ||
          getEntryLabel(entry.entry_type).toLowerCase().includes(query)
        return matchesType && matchesSearch
      })
  }, [periodSummary.entries, typeFilter, search])

  useEffect(() => {
    setPage(1)
  }, [typeFilter, search, range.from, range.to])

  const totalPages = Math.max(1, Math.ceil(visibleEntries.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * PAGE_SIZE
  const pageEntries = visibleEntries.slice(pageStart, pageStart + PAGE_SIZE)
  const showingFrom = visibleEntries.length === 0 ? 0 : pageStart + 1
  const showingTo = Math.min(pageStart + PAGE_SIZE, visibleEntries.length)

  const paginationItems = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (safePage <= 3) return [1, 2, 3, "ellipsis-end", totalPages]
    if (safePage >= totalPages - 2) {
      return [1, "ellipsis-start", totalPages - 2, totalPages - 1, totalPages]
    }
    return [1, "ellipsis-start", safePage - 1, safePage, safePage + 1, "ellipsis-end", totalPages]
  }, [safePage, totalPages])

  const chipCounts = {
    all: periodSummary.entries.length,
    gave: periodSummary.gaveCount,
    received: periodSummary.receivedCount,
  }

  const tone = balanceTone(customer.balance)
  const digits = normalizeMobile(customer.mobile)
  const hasMobile = digits.length === 10
  const shopName = currentShop?.name || "hamari dukaan"

  const reminderText =
    customer.balance > 0
      ? `Namaste ${customer.name}, ${shopName} me aapka ${formatCurrency(customer.balance)} baaki hai. Kripya jald bhugtan karein. Dhanyavaad.`
      : customer.balance < 0
        ? `Namaste ${customer.name}, ${shopName} me aapka ${formatCurrency(Math.abs(customer.balance))} advance jama hai.`
        : `Namaste ${customer.name}, ${shopName} me aapka hisaab barabar hai. Dhanyavaad.`

  const whatsappHref = hasMobile
    ? `https://wa.me/91${digits}?text=${encodeURIComponent(reminderText)}`
    : null

  /* --------------------------------------------------
     DATABASE HELPERS
  -------------------------------------------------- */

  // Updates EVERY entry of this customer (exact ids, never a name search)
  async function updateAllRows(fields) {
    const rows = await fetchCustomerRows()
    const ids = rows.map((row) => row.id)

    for (let i = 0; i < ids.length; i += IN_CHUNK) {
      const { error } = await supabase
        .from("khata_entries")
        .update(fields)
        .eq("shop_id", shopId)
        .in("id", ids.slice(i, i + IN_CHUNK))

      if (error) throw error
    }
  }

  async function uploadPhoto(file) {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase()
    const path = `khata/${shopId}/${Date.now()}.${ext}`

    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true })

    if (error) throw new Error(`Photo upload failed: ${error.message}`)

    return {
      path,
      url: supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl,
    }
  }

  function checkPhotoFile(file) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file")
      return false
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Photo must be smaller than 2 MB")
      return false
    }
    return true
  }

  /* --------------------------------------------------
     PHOTO ACTIONS
  -------------------------------------------------- */

  function handlePhotoOption(action) {
    setPhotoMenuOpen(false)

    if (action === "preview") setPreviewOpen(true)
    else if (action === "replace" || action === "add") quickPhotoInput.current?.click()
    else if (action === "edit") openEditCustomer()
    else if (action === "delete") setDeletePhotoOpen(true)
  }

  async function handleQuickPhotoUpload(event) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !checkPhotoFile(file)) return

    setUploadingPhoto(true)
    let uploaded = null

    try {
      const oldUrl = customer.photo
      uploaded = await uploadPhoto(file)

      await updateAllRows({ customer_photo: uploaded.url })

      // Remove the old file only after the new one is saved
      if (oldUrl) await removeStoredPhoto(oldUrl)

      toast.success("Photo updated")
      await loadEntries(true)
    } catch (error) {
      if (uploaded) await supabase.storage.from("avatars").remove([uploaded.path])
      toast.error("Could not update photo", { description: error?.message })
    } finally {
      setUploadingPhoto(false)
    }
  }

  async function handleDeletePhoto() {
    setDeletingPhoto(true)

    try {
      const oldUrl = customer.photo
      await updateAllRows({ customer_photo: null })
      if (oldUrl) await removeStoredPhoto(oldUrl)

      toast.success("Photo removed")
      setDeletePhotoOpen(false)
      await loadEntries(true)
    } catch (error) {
      toast.error("Could not remove photo", { description: error?.message })
    } finally {
      setDeletingPhoto(false)
    }
  }

  /* --------------------------------------------------
     NEW ENTRY
  -------------------------------------------------- */

  const selectedType = ENTRY_TYPES.find((type) => type.value === form.entry_type)
  const formAmount = round2(form.amount)
  const previewBalance =
    formAmount > 0 ? round2(customer.balance + signedAmount(form.entry_type, formAmount)) : null

  async function handleAddEntry(event) {
    event.preventDefault()
    if (saving) return

    if (!(formAmount > 0)) return toast.error("Please enter a valid amount")
    if (form.entry_date > today) return toast.error("Entry date cannot be in the future")
    if (form.due_date && form.due_date < form.entry_date) {
      return toast.error("Due date cannot be before the entry date")
    }

    setSaving(true)

    try {
      // Read the latest entries first, so the balance is right even if
      // another phone added an entry a moment ago.
      const fresh = await fetchCustomerRows()
      const current = round2(
        fresh.reduce((total, row) => total + signedAmount(row.entry_type, row.amount), 0)
      )
      const newBalance = round2(current + signedAmount(form.entry_type, formAmount))

      const { error } = await supabase.from("khata_entries").insert({
        shop_id: shopId,
        customer_name: customer.name,
        mobile: customer.mobile || null,
        address: customer.address || null,
        customer_photo: customer.photo || null,
        entry_type: form.entry_type,
        amount: formAmount,
        balance_after: newBalance,
        due_date: form.due_date || null,
        notes: form.notes.trim() || null,
        entry_date: form.entry_date,
      })

      if (error) throw error

      toast.success("Entry added", {
        description: `Balance is now ${formatCurrency(Math.abs(newBalance))}${
          newBalance > 0 ? " to receive" : newBalance < 0 ? " in advance" : " (settled)"
        }`,
      })

      setAddOpen(false)
      setForm(emptyForm())
      await loadEntries(true)
    } catch (error) {
      toast.error("Could not add entry", { description: error?.message })
    } finally {
      setSaving(false)
    }
  }

  /* --------------------------------------------------
     DELETE ENTRY
  -------------------------------------------------- */

  async function handleDeleteEntry() {
    if (!deleteEntry) return
    setDeleting(true)

    try {
      const { error } = await supabase
        .from("khata_entries")
        .delete()
        .eq("id", deleteEntry.id)
        .eq("shop_id", shopId)

      if (error) throw error

      toast.success("Entry deleted")
      setDeleteEntry(null)
      await loadEntries(true)
    } catch (error) {
      toast.error("Could not delete entry", { description: error?.message })
    } finally {
      setDeleting(false)
    }
  }

  /* --------------------------------------------------
     EDIT CUSTOMER
  -------------------------------------------------- */

  function openEditCustomer() {
    setEditForm(buildEditForm(customer))
    setEditErrors({})
    setEditOpen(true)
  }

  function handleEditPhotoChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !checkPhotoFile(file)) return

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setEditForm((prev) => ({ ...prev, photo: file, photo_preview: reader.result }))
      }
    }
    reader.readAsDataURL(file)
  }

  async function handleUpdateCustomer(event) {
    event.preventDefault()
    if (editSaving) return

    const errors = validateCustomerForm(editForm)
    setEditErrors(errors)
    if (Object.keys(errors).length > 0) {
      return toast.error("Please fix the highlighted fields")
    }

    const name = editForm.name.trim().replace(/\s+/g, " ")
    const mobile = editForm.mobile.trim()
    const mobileDigits = normalizeMobile(mobile)

    setEditSaving(true)
    let uploaded = null

    try {
      // Don't silently merge two customers into one ledger
      const ownIds = new Set(entries.map((entry) => String(entry.id)))
      const sameName = await fetchAllRows(() =>
        supabase
          .from("khata_entries")
          .select("id, customer_name, mobile")
          .eq("shop_id", shopId)
          .ilike("customer_name", `%${escapeLike(name)}%`)
          .order("id")
      )

      const clash = sameName.some(
        (row) =>
          !ownIds.has(String(row.id)) &&
          (row.customer_name || "").trim().toLowerCase() === name.toLowerCase() &&
          normalizeMobile(row.mobile) === mobileDigits
      )

      if (clash) {
        toast.error("This customer already exists", {
          description: "Another ledger has the same name and mobile number.",
        })
        return
      }

      const oldUrl = customer.photo
      let photoUrl = customer.photo || null

      if (editForm.photo) {
        uploaded = await uploadPhoto(editForm.photo)
        photoUrl = uploaded.url
      }

      await updateAllRows(buildCustomerPayload(editForm, photoUrl))

      if (uploaded && oldUrl) await removeStoredPhoto(oldUrl)

      toast.success("Customer updated")
      setEditOpen(false)

      // The page link is the mobile (or name), so follow it if it changed
      const newKey = mobile || name
      if (newKey !== customerKey) {
        navigate(`/khata/${encodeURIComponent(newKey)}`, { replace: true })
      } else {
        await loadEntries(true)
      }
    } catch (error) {
      if (uploaded) await supabase.storage.from("avatars").remove([uploaded.path])
      toast.error("Could not update customer", {
        description: /column/i.test(error?.message || "")
          ? "Run the SQL step from KhataDetail-changes.md to add the new customer columns, then try again."
          : error?.message,
      })
    } finally {
      setEditSaving(false)
    }
  }

  /* --------------------------------------------------
     EMPTY / LOADING STATES
  -------------------------------------------------- */

  if (!currentShop) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-3xl border border-dashed border-violet-200 bg-white/80 p-8 text-center">
        <div className="max-w-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
            <BookOpen className="h-7 w-7" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">No workspace selected</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Select a workspace to open this ledger.
          </p>
        </div>
      </div>
    )
  }

  if (loading) return <PageSkeleton />

  if (!loadError && entries.length === 0) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-3xl border border-dashed border-violet-200 bg-white/80 p-8 text-center">
        <div className="max-w-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
            <FileText className="h-7 w-7" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">No ledger found</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            This customer has no entries, or the link is out of date.
          </p>
          <Button asChild className={`mt-5 h-11 gap-2 px-5 ${outlineBtn}`}>
            <Link to="/khata">Back to khata</Link>
          </Button>
        </div>
      </div>
    )
  }

  /* --------------------------------------------------
     MAIN UI
  -------------------------------------------------- */

  const actionClass =
    "flex flex-1 items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500"

  const menuItemClass =
    "flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-violet-50 focus-visible:bg-violet-50 focus-visible:outline-none"

  return (
    <div className="min-h-full w-full space-y-4 rounded-2xl bg-[#f7f5ff] px-3 py-5 sm:px-5 lg:px-6">
      {/* Hidden input used by the photo menu */}
      <input
        ref={quickPhotoInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleQuickPhotoUpload}
      />

      {/* HEADER */}

      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => navigate("/khata")}
            aria-label="Back to khata"
            className="h-10 w-10 shrink-0 rounded-full border-violet-100 bg-white shadow-sm hover:bg-violet-50"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          <div className="min-w-0">
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-2 text-xs font-medium text-slate-500"
            >
              <Link to="/" className="hover:text-slate-700">
                Dashboard
              </Link>
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
              <Link to="/khata" className="hover:text-slate-700">
                Khata
              </Link>
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
              <span className="truncate">{customer.name}</span>
            </nav>

            <h1 className="mt-1 truncate text-[27px] font-bold tracking-tight text-[#171a39] sm:text-[30px]">
              {customer.name}
            </h1>
            <p className="mt-0.5 text-sm text-slate-600">
              Ledger for{" "}
              <strong className="font-semibold text-slate-800">{periodLabel}</strong>.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* DATE PERIOD MENU */}
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
                className={`ml-auto h-4 w-4 shrink-0 text-slate-500 transition-transform sm:ml-0 ${
                  periodOpen ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              />
            </button>

            {periodOpen && (
              <>
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
                  {[...PRESETS, { mode: "overall", label: "All time" }].map((option) => {
                    const active = period.mode === option.mode
                    return (
                      <button
                        key={option.mode}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        onClick={() => choosePeriod(option.mode)}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
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
                        <span className="mb-1 block text-[11px] font-medium text-slate-500">
                          From
                        </span>
                        <input
                          type="date"
                          value={range.from || ""}
                          max={range.to || today}
                          onChange={(e) => changeCustomDate("from", e.target.value)}
                          className="h-9 w-full rounded-lg border border-violet-200 bg-white px-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-slate-500">
                          To
                        </span>
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

                    <Button
                      type="button"
                      onClick={() => setPeriodOpen(false)}
                      className={`mt-3 h-11 w-full gap-2 px-4 ${outlineBtn}`}
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
            disabled={periodSummary.entries.length === 0}
            onClick={() => {
              try {
                downloadKhataDetailsPDF({
                  customer,
                  entries: periodSummary.entries,
                  summary: periodSummary,
                  shop: currentShop || {},
                  periodLabel,
                })
                toast.success("Customer statement exported")
              } catch (error) {
                toast.error("Could not export statement", {
                  description: error?.message || "Please try again.",
                })
              }
            }}
            className="h-11 gap-2 rounded-xl border border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileDown className="h-4 w-4 shrink-0" />
            <span>Export PDF</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => loadEntries(true)}
            disabled={refreshing}
            aria-label={refreshing ? "Refreshing ledger" : "Refresh ledger"}
            title={refreshing ? "Refreshing ledger" : "Refresh ledger"}
            className="h-11 min-w-[112px] gap-2 rounded-xl border border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <RefreshCw className={`h-4 w-4 shrink-0 ${refreshing ? "animate-spin" : ""}`} />
            <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
          </Button>

          <Button
            type="button"
            onClick={() => {
              setForm(emptyForm())
              setAddOpen(true)
            }}
            className={`h-11 gap-2 px-5 font-semibold ${outlineBtn}`}
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            New entry
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
              Could not load this ledger. Check your connection and try again.
              <span className="ml-1 text-xs text-rose-500">({loadError})</span>
            </span>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => loadEntries(true)}
            className={`h-9 shrink-0 ${outlineBtn}`}
          >
            Try again
          </Button>
        </div>
      )}

      {/* PROFILE */}

      <Card className="overflow-hidden rounded-[20px] border border-white/80 bg-white/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)] backdrop-blur-sm">
        <div className="flex flex-col justify-between gap-5 p-4 sm:p-6 md:flex-row md:items-center">
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            {/* Avatar with photo menu */}
            <div className="relative shrink-0" ref={photoMenuRef}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={photoMenuOpen}
                aria-label="Photo options"
                onClick={() => setPhotoMenuOpen((open) => !open)}
                className="group relative block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
              >
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-slate-100 shadow-md sm:h-24 sm:w-24">
                  {uploadingPhoto || deletingPhoto ? (
                    <Loader2 className="h-8 w-8 animate-spin text-violet-700" />
                  ) : (
                    <Avatar
                      name={customer.name}
                      photo={customer.photo}
                      className="h-full w-full text-2xl"
                    />
                  )}
                </div>

                <span className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-white shadow-sm transition-transform group-hover:scale-110">
                  <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </button>

              {photoMenuOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-full z-30 mt-2 w-52 overflow-hidden rounded-xl border border-violet-100 bg-white py-1.5 shadow-[0_12px_32px_rgba(80,65,130,0.2)]"
                >
                  {!customer.photo ? (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => handlePhotoOption("add")}
                        className={`${menuItemClass} text-violet-700`}
                      >
                        <Camera className="h-4 w-4" aria-hidden="true" /> Add photo
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => handlePhotoOption("edit")}
                        className={menuItemClass}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" /> Edit details
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => handlePhotoOption("preview")}
                        className={menuItemClass}
                      >
                        <Eye className="h-4 w-4" aria-hidden="true" /> View photo
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => handlePhotoOption("replace")}
                        className={menuItemClass}
                      >
                        <RefreshCw className="h-4 w-4" aria-hidden="true" /> Replace photo
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => handlePhotoOption("edit")}
                        className={menuItemClass}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" /> Edit details
                      </button>
                      <div className="my-1 h-px bg-[#eeecf5]" />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => handlePhotoOption("delete")}
                        className={`${menuItemClass} text-rose-600 hover:bg-rose-50`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete photo
                      </button>
                    </>
                  )}
                </div>
              )}

              <div className="mt-2 flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => quickPhotoInput.current?.click()}
                  disabled={uploadingPhoto || deletingPhoto}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 shadow-sm transition-colors hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                  {customer.photo ? "Change photo" : "Upload photo"}
                </button>
                {customer.photo && (
                  <button
                    type="button"
                    onClick={() => setDeletePhotoOpen(true)}
                    disabled={uploadingPhoto || deletingPhoto}
                    className="inline-flex h-7 items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                    Remove photo
                  </button>
                )}
              </div>
            </div>

            {/* Details */}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="truncate text-xl font-bold text-slate-900 sm:text-2xl">
                  {customer.name}
                </h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={openEditCustomer}
                  aria-label="Edit customer details"
                  className="h-8 w-8 shrink-0 rounded-full text-slate-400 hover:bg-violet-50 hover:text-violet-700"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                {customer.mobile ? (
                  <span className="flex items-center gap-1.5 rounded-lg border border-[#eeecf5] bg-[#faf9ff] px-2.5 py-1.5">
                    <Phone className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    {customer.mobile}
                  </span>
                ) : (
                  <span className="rounded-lg border border-dashed border-slate-200 px-2.5 py-1.5 text-slate-400">
                    No mobile saved
                  </span>
                )}

                {customer.address && (
                  <span className="flex items-center gap-1.5 rounded-lg border border-[#eeecf5] bg-[#faf9ff] px-2.5 py-1.5">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    {customer.address}
                  </span>
                )}

                {customer.balance > 0 && customer.dueDate && (
                  <span
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-semibold ${
                      customer.overdue
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                    {customer.overdue
                      ? `Overdue by ${daysBetween(customer.dueDate, today)} ${
                          daysBetween(customer.dueDate, today) === 1 ? "day" : "days"
                        }`
                      : `Due on ${formatDate(customer.dueDate)}`}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div
            className={`shrink-0 rounded-2xl border px-5 py-4 md:min-w-[210px] md:text-right ${tone.box}`}
          >
            <p className="text-xs font-semibold text-slate-500">Current balance</p>
            <p
              className={`mt-1 text-[30px] font-extrabold leading-none tracking-tight tabular-nums ${tone.text}`}
            >
              {formatCurrency(Math.abs(customer.balance))}
            </p>
            <p className={`mt-1.5 text-xs font-semibold ${tone.text}`}>{tone.label}</p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 overflow-hidden border-t border-[#eeecf5] sm:grid-cols-4">
          {hasMobile ? (
            <a
              href={`tel:+91${digits}`}
              className="flex min-h-[58px] min-w-0 items-center justify-center gap-2 border-b border-r border-[#eeecf5] px-2 py-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-[#faf9ff] hover:text-violet-700 sm:border-b-0 sm:text-sm"
            >
              <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words text-center">Call</span>
            </a>
          ) : (
            <span
              aria-disabled="true"
              className="flex min-h-[58px] min-w-0 items-center justify-center gap-2 border-b border-r border-[#eeecf5] px-2 py-3 text-xs font-semibold text-slate-300 sm:border-b-0 sm:text-sm"
            >
              <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words text-center">Call</span>
            </span>
          )}

          {whatsappHref ? (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[58px] min-w-0 items-center justify-center gap-2 border-b border-[#eeecf5] px-2 py-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-[#25D366]/10 hover:text-[#128C7E] sm:border-b-0 sm:border-r sm:text-sm"
            >
              <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words text-center">Send reminder</span>
            </a>
          ) : (
            <span
              aria-disabled="true"
              className="flex min-h-[58px] min-w-0 items-center justify-center gap-2 border-b border-[#eeecf5] px-2 py-3 text-xs font-semibold text-slate-300 sm:border-b-0 sm:border-r sm:text-sm"
            >
              <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words text-center">Send reminder</span>
            </span>
          )}

          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="flex min-h-[58px] min-w-0 items-center justify-center gap-2 border-r border-[#eeecf5] px-2 py-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-[#faf9ff] hover:text-violet-700 sm:text-sm"
          >
            <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words text-center">View profile</span>
          </button>

          <button
            type="button"
            onClick={openEditCustomer}
            className="flex min-h-[58px] min-w-0 items-center justify-center gap-2 px-2 py-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-[#faf9ff] hover:text-violet-700 sm:text-sm"
          >
            <Pencil className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words text-center">Edit</span>
          </button>
        </div>

      </Card>

      {/* PERIOD SUMMARY */}

      <section
        aria-label="Ledger summary"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4"
      >
        <SummaryCard
          label="You gave"
          value={formatCurrency(periodSummary.gave)}
          detail={`${periodSummary.gaveCount} ${periodSummary.gaveCount === 1 ? "entry" : "entries"}`}
          icon={ArrowUpRight}
          tone="pink"
        />

        <SummaryCard
          label="You received"
          value={formatCurrency(periodSummary.received)}
          detail={`${periodSummary.receivedCount} ${periodSummary.receivedCount === 1 ? "entry" : "entries"}`}
          icon={ArrowDownLeft}
          tone="green"
        />

        <SummaryCard
          label="Opening balance"
          value={formatCurrency(Math.abs(periodSummary.opening))}
          detail={
            periodSummary.opening > 0
              ? "Owed at start of period"
              : periodSummary.opening < 0
                ? "Advance at start of period"
                : "Nothing at start of period"
          }
          icon={Wallet}
          tone="blue"
        />

        <SummaryCard
          label="Closing balance"
          value={formatCurrency(Math.abs(periodSummary.closing))}
          detail={
            periodSummary.closing > 0
              ? "You'll get at end of period"
              : periodSummary.closing < 0
                ? "Advance at end of period"
                : "Settled at end of period"
          }
          icon={TrendingUp}
          tone="purple"
        />
      </section>

      {/* TRANSACTIONS */}

      <Card className="overflow-hidden rounded-[20px] border border-white/80 bg-white/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)] backdrop-blur-sm">
        <div className="space-y-4 border-b border-[#eae7f4] px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700">
                <FileText className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="text-[16px] font-bold tracking-tight text-[#171a36]">
                  Transaction history
                </h2>
                <p className="mt-0.5 text-xs text-slate-500" aria-live="polite">
                  {visibleEntries.length === periodSummary.entries.length
                    ? `${periodSummary.entries.length} ${
                        periodSummary.entries.length === 1 ? "entry" : "entries"
                      }`
                    : `${visibleEntries.length} of ${periodSummary.entries.length} entries match`}
                </p>
              </div>
            </div>

            <div className="relative w-full lg:w-[300px]">
              <Search
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search notes or type"
                aria-label="Search entries"
                className="h-10 rounded-xl border-violet-100 bg-white pl-9 pr-9 text-sm"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div
            role="group"
            aria-label="Filter entries"
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
          >
            {TYPE_FILTERS.map((item) => {
              const active = typeFilter === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTypeFilter(item.key)}
                  className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                    active
                      ? "border-[#171a39] bg-[#171a39] text-white"
                      : "border-violet-200 bg-white text-slate-700 hover:bg-violet-50"
                  }`}
                >
                  {item.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                      active ? "bg-white/20 text-white" : "bg-violet-50 text-slate-600"
                    }`}
                  >
                    {chipCounts[item.key]}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {visibleEntries.length === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center px-5 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
              <Wallet className="h-7 w-7" aria-hidden="true" />
            </div>

            <h3 className="mt-4 text-sm font-bold text-slate-900">
              {periodSummary.entries.length === 0
                ? period.mode === "overall"
                  ? "No entries yet"
                  : "No entries in this period"
                : "No matching entries"}
            </h3>

            <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
              {periodSummary.entries.length === 0
                ? period.mode === "overall"
                  ? `Add the first entry for ${customer.name}.`
                  : "Try another date range."
                : "Try a different search or filter."}
            </p>

            {periodSummary.entries.length > 0 && (
              <Button
                type="button"
                variant="outline"
                className={`mt-4 h-10 gap-2 px-4 ${outlineBtn}`}
                onClick={() => {
                  setSearch("")
                  setTypeFilter("all")
                }}
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
                <caption className="sr-only">Transactions</caption>
                <thead>
                  <tr className="bg-[#f5f3fc] text-[11px] font-semibold text-slate-600">
                    <th scope="col" className="rounded-l-xl px-3 py-3">Date</th>
                    <th scope="col" className="px-3 py-3">Details</th>
                    <th scope="col" className="px-3 py-3">Due date</th>
                    <th scope="col" className="px-3 py-3 text-right">You gave</th>
                    <th scope="col" className="px-3 py-3 text-right">You received</th>
                    <th scope="col" className="px-3 py-3 text-right">Balance</th>
                    <th scope="col" className="rounded-r-xl px-3 py-3 text-center">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {pageEntries.map((entry) => (
                    <tr
                      key={entry.id}
                      className="group border-b border-[#eeecf5] transition-colors last:border-0 hover:bg-[#f9f8ff]"
                    >
                      <td className="whitespace-nowrap px-3 py-3 text-xs font-medium text-slate-700">
                        {formatDate(entry.entry_date)}
                      </td>

                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                            entry.debit
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : "border-emerald-200 bg-violet-100 text-violet-700"
                          }`}
                        >
                          {entry.debit ? (
                            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            <ArrowDownLeft className="h-3 w-3" aria-hidden="true" />
                          )}
                          {getEntryLabel(entry.entry_type)}
                        </span>

                        {entry.notes && (
                          <p
                            className="mt-1 line-clamp-1 max-w-[240px] text-[11px] text-slate-500"
                            title={entry.notes}
                          >
                            {entry.notes}
                          </p>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">
                        {entry.due_date ? formatDate(entry.due_date) : "—"}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-bold tabular-nums text-rose-600">
                        {entry.debit ? formatCurrency(entry.amount) : ""}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-bold tabular-nums text-violet-700">
                        {!entry.debit ? formatCurrency(entry.amount) : ""}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        <p className="text-xs font-semibold tabular-nums text-slate-800">
                          {formatCurrency(Math.abs(entry.running))}
                        </p>
                        <p
                          className={`text-[10px] font-medium ${
                            entry.running > 0
                              ? "text-rose-500"
                              : entry.running < 0
                                ? "text-emerald-600"
                                : "text-slate-400"
                          }`}
                        >
                          {entry.running > 0 ? "due" : entry.running < 0 ? "advance" : "settled"}
                        </p>
                      </td>

                      <td className="px-3 py-3 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteEntry(entry)}
                          aria-label={`Delete ${getEntryLabel(entry.entry_type)} entry`}
                          className="h-8 w-8 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul
              className={`divide-y divide-[#eeecf5] transition-opacity md:hidden ${
                refreshing ? "opacity-60" : "opacity-100"
              }`}
            >
              {pageEntries.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-3 p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                        entry.debit
                          ? "border-rose-100 bg-rose-50 text-rose-600"
                          : "border-violet-100 bg-violet-50 text-violet-700"
                      }`}
                    >
                      {entry.debit ? (
                        <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
                      ) : (
                        <ArrowDownLeft className="h-5 w-5" aria-hidden="true" />
                      )}
                    </span>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800">
                        {getEntryLabel(entry.entry_type)}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                        <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                        {formatDate(entry.entry_date)}
                      </p>
                      {entry.due_date && (
                        <p className="mt-0.5 text-[11px] text-amber-700">
                          Due {formatDate(entry.due_date)}
                        </p>
                      )}
                      {entry.notes && (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">{entry.notes}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-start gap-1">
                    <div className="text-right">
                      <p
                        className={`text-sm font-bold tabular-nums ${
                          entry.debit ? "text-rose-600" : "text-violet-700"
                        }`}
                      >
                        {entry.debit ? "+" : "−"}
                        {formatCurrency(entry.amount)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        Balance {formatCurrency(Math.abs(entry.running))}
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteEntry(entry)}
                      aria-label={`Delete ${getEntryLabel(entry.entry_type)} entry`}
                      className="-mr-2 h-8 w-8 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Pagination */}
            <div className="flex flex-col gap-3 border-t border-[#eeecf5] bg-white/60 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="text-xs font-medium text-slate-600" aria-live="polite">
                Showing{" "}
                <span className="font-semibold text-slate-800">
                  {showingFrom}–{showingTo}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-slate-800">{visibleEntries.length}</span>{" "}
                {visibleEntries.length === 1 ? "entry" : "entries"}
              </p>

              {totalPages > 1 && (
                <nav
                  aria-label="Transaction pages"
                  className="flex flex-wrap items-center justify-end gap-1.5"
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Previous page"
                    disabled={safePage <= 1}
                    onClick={() => setPage(Math.max(1, safePage - 1))}
                    className="h-8 w-8 rounded-full border-violet-200 bg-white p-0 text-slate-600 shadow-sm hover:bg-violet-50 disabled:opacity-40"
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
                        variant={safePage === item ? "default" : "outline"}
                        aria-label={`Page ${item}`}
                        aria-current={safePage === item ? "page" : undefined}
                        onClick={() => setPage(item)}
                        className={`h-8 min-w-8 rounded-full px-0 text-xs font-semibold shadow-sm ${
                          safePage === item
                            ? "border-violet-300 bg-violet-100 text-violet-800 hover:bg-violet-100"
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
                    onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                    className="h-8 w-8 rounded-full border-violet-200 bg-white p-0 text-slate-600 shadow-sm hover:bg-violet-50 disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </nav>
              )}
            </div>
          </>
        )}
      </Card>

      {/* FOOTER */}

      <footer className="flex flex-col justify-between gap-2 rounded-xl border border-white/80 bg-white/65 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center">
        <span>
          Workspace:
          <strong className="ml-1 text-slate-700">{currentShop.name}</strong>
        </span>

        <span>
          {lastUpdated
            ? `Last updated at ${lastUpdated.toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : "Not updated yet"}
        </span>
      </footer>

      {/* ADD ENTRY DIALOG */}
      <Dialog open={addOpen} onOpenChange={(open) => !saving && setAddOpen(open)}>
        <DialogContent className="flex max-h-[min(92dvh,820px)] w-[calc(100%-1rem)] max-w-[560px] flex-col gap-0 overflow-hidden rounded-[22px] border border-violet-100 bg-white p-0 text-slate-900 shadow-[0_24px_80px_rgba(39,31,79,0.22)] sm:w-[calc(100%-2rem)]">
          <DialogHeader className="shrink-0 border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-slate-50 px-4 py-4 pr-14 text-left sm:px-6 sm:py-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#171a39] text-white shadow-sm shadow-slate-900/15 sm:h-11 sm:w-11">
                <Plus className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-bold tracking-tight text-[#171a39] sm:text-lg">
                  New entry
                </DialogTitle>
                <DialogDescription className="mt-1 break-words text-xs leading-5 text-slate-500 sm:text-sm">
                  For <span className="font-semibold text-slate-700">{customer.name}</span>. Add credit given or a payment.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleAddEntry} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:space-y-5 sm:px-6 sm:py-5">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700 sm:text-sm">Entry type <span className="text-rose-500">*</span></Label>
                <Select
                  value={form.entry_type}
                  onValueChange={(value) => setForm((f) => ({ ...f, entry_type: value }))}
                >
                  <SelectTrigger className="h-11 w-full rounded-xl border-violet-100 bg-white text-sm shadow-sm focus:ring-violet-500/20">
                    <SelectValue placeholder="Select entry type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTRY_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedType && (
                  <div
                    className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-xs leading-5 sm:px-3.5 ${
                      selectedType.debit
                        ? "border-rose-100 bg-rose-50/80 text-rose-700"
                        : "border-violet-100 bg-violet-50/80 text-violet-800"
                    }`}
                  >
                    {selectedType.debit ? (
                      <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <ArrowDownLeft className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    )}
                    <span className="min-w-0">{selectedType.hint}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="entry-amount" className="text-xs font-semibold text-slate-700 sm:text-sm">
                    Amount <span className="text-rose-500">*</span>
                  </Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-bold text-violet-700">₹</span>
                    <Input
                      id="entry-amount"
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="0.01"
                      required
                      autoFocus
                      value={form.amount}
                      onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                      placeholder="0.00"
                      className="h-12 w-full rounded-xl border-violet-100 bg-[#fcfbff] pl-8 text-base font-bold shadow-none focus-visible:border-violet-400 focus-visible:ring-2 focus-visible:ring-violet-500/10"
                    />
                  </div>
                </div>

                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="entry-date" className="text-xs font-semibold text-slate-700 sm:text-sm">
                    Entry date <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    id="entry-date"
                    type="date"
                    required
                    max={today}
                    value={form.entry_date}
                    onChange={(e) => setForm((f) => ({ ...f, entry_date: e.target.value }))}
                    className="h-12 w-full min-w-0 rounded-xl border-violet-100 bg-white text-xs shadow-none focus-visible:border-violet-400 sm:text-sm"
                  />
                </div>
              </div>

              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="entry-due" className="text-xs font-semibold text-slate-700 sm:text-sm">
                  Due date <span className="font-normal text-slate-400">(Optional)</span>
                </Label>
                <Input
                  id="entry-due"
                  type="date"
                  min={form.entry_date}
                  value={form.due_date}
                  onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                  className="h-11 w-full min-w-0 rounded-xl border-violet-100 bg-white text-xs shadow-none focus-visible:border-violet-400 sm:text-sm"
                />
              </div>

              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="entry-notes" className="text-xs font-semibold text-slate-700 sm:text-sm">
                  Notes <span className="font-normal text-slate-400">(Optional)</span>
                </Label>
                <Textarea
                  id="entry-notes"
                  rows={3}
                  placeholder="Item names, reference or any additional details..."
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="min-h-[84px] w-full resize-y rounded-xl border-violet-100 bg-white text-sm shadow-none placeholder:text-slate-400 focus-visible:border-violet-400 focus-visible:ring-2 focus-visible:ring-violet-500/10"
                />
              </div>

              {previewBalance !== null && (
                <div className="rounded-xl border border-violet-100 bg-[#faf9ff] p-3.5 sm:p-4" aria-live="polite">
                  <p className="text-xs font-semibold text-slate-600">Balance after this entry</p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <span className="text-xs text-slate-500">
                      Current: {formatCurrency(Math.abs(customer.balance))}
                      {customer.balance > 0 ? " due" : customer.balance < 0 ? " advance" : " settled"}
                    </span>
                    <div className="min-w-0 sm:text-right">
                      <p className={`break-words text-xl font-extrabold tabular-nums sm:text-2xl ${
                        previewBalance > 0 ? "text-rose-600" : previewBalance < 0 ? "text-violet-700" : "text-slate-600"
                      }`}>
                        {formatCurrency(Math.abs(previewBalance))}
                      </p>
                      <p className="text-[11px] font-semibold text-slate-500">
                        {previewBalance > 0 ? "You'll receive" : previewBalance < 0 ? "Customer advance" : "Account settled"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="shrink-0 border-t border-violet-100 bg-white px-4 py-3.5 sm:px-6">
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAddOpen(false)}
                  disabled={saving}
                  className="h-10 w-full rounded-xl border-violet-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-violet-50 sm:w-auto sm:min-w-[110px] sm:px-5 sm:text-sm"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  variant="outline"
                  className="h-10 w-full rounded-xl border-violet-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-violet-50 sm:w-auto sm:min-w-[140px] sm:px-5 sm:text-sm"
                >
                  {saving ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Saving...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-1.5">
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Add entry
                    </span>
                  )}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* FULL CUSTOMER PROFILE DIALOG */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="!flex !h-[92dvh] !max-h-[92dvh] w-[calc(100%-1rem)] max-w-[760px] min-h-0 flex-col gap-0 overflow-hidden rounded-[20px] border border-white/80 bg-white p-0 shadow-[0_24px_80px_rgba(39,31,79,0.22)] sm:!h-[min(88dvh,760px)] sm:!max-h-[min(88dvh,760px)] sm:w-[calc(100%-2rem)] sm:rounded-[26px]">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-[#f7f5ff]" />
            <img
              src="/background/dialog.png"
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-30"
              onError={(event) => { event.currentTarget.style.display = "none" }}
            />
            <div className="absolute inset-0 bg-white/90 backdrop-blur-[2px]" />
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <DialogHeader className="shrink-0 flex-row items-center gap-3 space-y-0 border-b border-violet-100/80 px-4 py-4 pr-14 text-left sm:px-7">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700 ring-1 ring-emerald-100">
                <User className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-bold tracking-tight text-[#171a39] sm:text-lg">
                  Customer Profile
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs leading-5 text-slate-500">
                  Complete information and account details
                </DialogDescription>
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-7">
              {/* Profile overview */}
              <div className="grid grid-cols-1 gap-4 py-5 sm:grid-cols-[88px_minmax(0,1fr)] sm:items-center sm:gap-5 sm:py-6 lg:grid-cols-[96px_minmax(0,1fr)_205px]">
                <div className="mx-auto h-20 w-20 overflow-hidden rounded-full border-4 border-white bg-violet-50 shadow-[0_5px_18px_rgba(80,65,130,0.13)] ring-1 ring-emerald-100 sm:h-[88px] sm:w-[88px] lg:h-24 lg:w-24">
                  <Avatar name={customer.name} photo={customer.photo} className="h-full w-full text-2xl sm:text-3xl" />
                </div>

                <div className="min-w-0 text-center sm:text-left">
                  <h2 className="break-words text-xl font-extrabold leading-tight tracking-tight text-[#171a39] sm:text-2xl">
                    {customer.name}
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    {customer.customer_type && (
                      <span className="max-w-full break-words rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-semibold capitalize text-violet-800 sm:text-xs">
                        {customer.customer_type.replace(/_/g, " ")}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-700 sm:text-xs">
                      <span className={`h-1.5 w-1.5 rounded-full ${daysBetween(customer.lastEntry || today, today) <= 90 ? "bg-violet-500" : "bg-slate-400"}`} />
                      {daysBetween(customer.lastEntry || today, today) <= 90 ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {customer.since && (
                    <p className="mt-2 text-xs text-slate-500">
                      Customer since: <span className="font-semibold text-slate-700">{formatDate(customer.since)}</span>
                    </p>
                  )}
                </div>

                <div className={`flex min-w-0 items-center gap-3 rounded-2xl border px-3.5 py-3 sm:col-span-2 sm:justify-self-stretch lg:col-span-1 ${tone.box}`}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 text-violet-700">
                    <Wallet className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-600">Current balance</p>
                    <p className={`mt-0.5 break-words text-xl font-extrabold leading-tight tabular-nums sm:text-[22px] ${tone.text}`}>
                      {formatCurrency(Math.abs(customer.balance))}
                    </p>
                    <p className={`text-[11px] font-semibold ${tone.text}`}>{tone.label}</p>
                  </div>
                </div>
              </div>

              {/* Contact and address */}
              <div className="grid grid-cols-1 border-t border-violet-100/80 sm:grid-cols-2 sm:divide-x sm:divide-violet-100/80">
                <section className="min-w-0 py-4 sm:pr-5 sm:py-5" aria-label="Contact details">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#171a39]">
                    <Phone className="h-4 w-4 shrink-0 text-slate-600" /> Contact Details
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex min-w-0 items-start gap-3">
                      <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                      <span className={`min-w-0 break-all ${customer.mobile ? "text-slate-800" : "text-slate-400"}`}>
                        {customer.mobile || "No mobile number added"}
                      </span>
                    </div>
                    <div className="flex min-w-0 items-start gap-3">
                      <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                      <span className={`min-w-0 break-all ${customer.email ? "text-slate-800" : "text-slate-400"}`}>
                        {customer.email || "No email added"}
                      </span>
                    </div>
                  </div>
                </section>

                <section className="min-w-0 border-t border-violet-100/80 py-4 sm:border-t-0 sm:py-5 sm:pl-5" aria-label="Address">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#171a39]">
                    <MapPin className="h-4 w-4 shrink-0 text-slate-600" /> Address
                  </h3>
                  <p className={`break-words whitespace-pre-line text-sm leading-6 ${customer.address ? "text-slate-800" : "text-slate-400"}`}>
                    {customer.address || "No address added"}
                  </p>
                  <p className={`mt-1 break-words text-sm ${customer.pin_code ? "text-slate-700" : "text-slate-400"}`}>
                    {customer.pin_code ? `PIN: ${customer.pin_code}` : "PIN code not added"}
                  </p>
                </section>
              </div>

              {/* Business and notes */}
              <div className="grid grid-cols-1 border-t border-violet-100/80 sm:grid-cols-2 sm:divide-x sm:divide-violet-100/80">
                <section className="min-w-0 py-4 sm:py-5 sm:pr-5" aria-label="Business details">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#171a39]">
                    <Receipt className="h-4 w-4 shrink-0 text-slate-600" /> Business Details
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex min-w-0 items-start gap-3">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                      <span className={`min-w-0 break-all ${customer.gstin ? "text-slate-800" : "text-slate-400"}`}>
                        {customer.gstin ? `GSTIN: ${customer.gstin}` : "GSTIN not added"}
                      </span>
                    </div>
                    <div className="flex min-w-0 items-start gap-3">
                      <Store className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                      <span className="min-w-0 break-words text-slate-700">
                        Customer type: <strong className="capitalize text-violet-700">{customer.customer_type ? customer.customer_type.replace(/_/g, " ") : "Not set"}</strong>
                      </span>
                    </div>
                  </div>
                </section>

                <section className="min-w-0 border-t border-violet-100/80 py-4 sm:border-t-0 sm:py-5 sm:pl-5" aria-label="Additional notes">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#171a39]">
                    <StickyNote className="h-4 w-4 shrink-0 text-slate-600" /> Additional Notes
                  </h3>
                  <p className={`break-words whitespace-pre-wrap text-sm leading-6 ${customer.notes ? "text-slate-800" : "text-slate-400"}`}>
                    {customer.notes || "No additional notes"}
                  </p>
                </section>
              </div>

              {/* Account summary */}
              <div className="grid grid-cols-1 gap-2.5 border-t border-violet-100/80 py-4 sm:grid-cols-3">
                <div className="min-w-0 rounded-xl border border-violet-100 bg-white/85 px-3.5 py-3">
                  <p className="text-[11px] font-medium text-slate-500">Total entries</p>
                  <p className="mt-1 text-lg font-bold text-[#171a39] tabular-nums">{entries.length}</p>
                </div>
                <div className="min-w-0 rounded-xl border border-violet-100 bg-white/85 px-3.5 py-3">
                  <p className="text-[11px] font-medium text-slate-500">Last activity</p>
                  <p className="mt-1 break-words text-sm font-bold text-[#171a39]">{customer.lastEntry ? formatDate(customer.lastEntry) : "—"}</p>
                </div>
                <div className="min-w-0 rounded-xl border border-violet-100 bg-white/85 px-3.5 py-3">
                  <p className="text-[11px] font-medium text-slate-500">Account status</p>
                  <p className="mt-1 break-words text-sm font-bold text-violet-700">{customer.balance === 0 ? "Settled" : customer.balance > 0 ? "Payment due" : "Advance balance"}</p>
                </div>
              </div>
            </div>

            <DialogFooter className="shrink-0 border-t border-violet-100/80 bg-white/95 px-4 py-3.5 sm:px-7">
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setProfileOpen(false)}
                  className="h-10 w-full rounded-xl border-violet-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-violet-50 sm:w-auto sm:min-w-[110px] sm:px-5 sm:text-sm"
                >
                  Close
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false)
                    openEditCustomer()
                  }}
                  className={`h-10 w-full gap-2 px-3 text-xs font-semibold sm:w-auto sm:min-w-[155px] sm:px-5 sm:text-sm ${outlineBtn}`}
                >
                  <Pencil className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Edit Customer</span>
                </Button>
              </div>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* EDIT CUSTOMER DIALOG */}

      <EditCustomerDialog
        open={editOpen}
        onOpenChange={(open) => !editSaving && setEditOpen(open)}
        form={editForm}
        setForm={setEditForm}
        errors={editErrors}
        setErrors={setEditErrors}
        customer={customer}
        entryCount={entries.length}
        saving={editSaving}
        onPhotoChange={handleEditPhotoChange}
        onSubmit={handleUpdateCustomer}
      />

      {/* DELETE ENTRY DIALOG */}

      <Dialog open={Boolean(deleteEntry)} onOpenChange={(open) => !deleting && !open && setDeleteEntry(null)}>
        <DialogContent className="max-w-sm gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl">
          <div className="flex flex-col items-center px-6 py-6 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100/80">
              <AlertTriangle className="h-7 w-7 text-rose-600" aria-hidden="true" />
            </div>

            <DialogTitle className="text-lg font-bold text-slate-900">Delete this entry?</DialogTitle>

            {deleteEntry && (
              <div className="mt-3 w-full rounded-xl border border-[#eeecf5] bg-[#faf9ff] px-4 py-3 text-left text-sm">
                <p className="font-semibold text-slate-800">
                  {getEntryLabel(deleteEntry.entry_type)}
                </p>
                <p className="mt-0.5 flex items-center justify-between text-xs text-slate-500">
                  <span>{formatDate(deleteEntry.entry_date)}</span>
                  <span
                    className={`font-bold tabular-nums ${
                      deleteEntry.debit ? "text-rose-600" : "text-violet-700"
                    }`}
                  >
                    {deleteEntry.debit ? "+" : "−"}
                    {formatCurrency(deleteEntry.amount)}
                  </span>
                </p>
              </div>
            )}

            <DialogDescription className="mt-3 text-sm leading-relaxed text-slate-500">
              {entries.length === 1
                ? "This is the only entry. Deleting it removes this customer from your khata."
                : "The customer's balance will be recalculated. This cannot be undone."}
            </DialogDescription>
          </div>

          <DialogFooter className="flex flex-col gap-2 border-t border-[#eeecf5] bg-white p-4 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setDeleteEntry(null)}
              disabled={deleting}
              className="h-10 w-full rounded-xl border-violet-200 px-5 text-sm font-medium hover:bg-violet-50 sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteEntry}
              disabled={deleting}
              className="h-10 w-full rounded-xl bg-rose-600 px-5 text-sm font-medium text-white hover:bg-rose-700 sm:w-auto"
            >
              {deleting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Deleting...
                </span>
              ) : (
                "Delete entry"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE PHOTO DIALOG */}

      <Dialog open={deletePhotoOpen} onOpenChange={(open) => !deletingPhoto && setDeletePhotoOpen(open)}>
        <DialogContent className="max-w-sm gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl">
          <div className="flex flex-col items-center px-6 py-6 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100/80">
              <Trash2 className="h-7 w-7 text-rose-600" aria-hidden="true" />
            </div>
            <DialogTitle className="text-lg font-bold text-slate-900">Delete photo?</DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-relaxed text-slate-500">
              {customer.name}'s profile photo will be removed from the khata and from storage.
            </DialogDescription>
          </div>

          <DialogFooter className="flex flex-col gap-2 border-t border-[#eeecf5] bg-white p-4 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setDeletePhotoOpen(false)}
              disabled={deletingPhoto}
              className="h-10 w-full rounded-xl border-violet-200 px-5 text-sm font-medium hover:bg-violet-50 sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeletePhoto}
              disabled={deletingPhoto}
              className="h-10 w-full rounded-xl bg-rose-600 px-5 text-sm font-medium text-white hover:bg-rose-700 sm:w-auto"
            >
              {deletingPhoto ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Removing...
                </span>
              ) : (
                "Delete photo"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PHOTO PREVIEW */}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-xl overflow-hidden rounded-2xl border-0 p-0 shadow-2xl">
          <DialogTitle className="sr-only">{customer.name} photo</DialogTitle>
          <DialogDescription className="sr-only">Full size profile photo</DialogDescription>
          <div className="flex items-center justify-center bg-slate-950 p-2 sm:p-4">
            {customer.photo && (
              <img
                src={customer.photo}
                alt={`${customer.name} photo`}
                className="max-h-[80vh] w-auto rounded-lg object-contain shadow-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ==================================================
   INLINE EDIT CUSTOMER DIALOG
   Kept in this file to avoid a separate component import.
================================================== */

const EMPTY_FORM = {
  name: "",
  mobile: "",
  address: "",
  email: "",
  pin_code: "",
  gstin: "",
  customer_type: "",
  notes: "",
  photo: null,
  photo_preview: "",
}

function buildEditForm(customer = {}) {
  return {
    ...EMPTY_FORM,
    name: customer.name || "",
    mobile: customer.mobile || "",
    address: customer.address || "",
    email: customer.email || "",
    pin_code: customer.pin_code || "",
    gstin: customer.gstin || "",
    customer_type: customer.customer_type || "",
    notes: customer.notes || "",
    photo: null,
    photo_preview: customer.photo || "",
  }
}

function buildCustomerPayload(form, photoUrl) {
  return {
    customer_name: form.name.trim().replace(/\s+/g, " "),
    mobile: form.mobile.trim() || null,
    address: form.address.trim() || null,
    email: form.email.trim() || null,
    pin_code: form.pin_code.trim() || null,
    gstin: form.gstin.trim().toUpperCase() || null,
    customer_type: form.customer_type || null,
    customer_notes: form.notes.trim() || null,
    customer_photo: photoUrl || null,
  }
}

function validateCustomerForm(form) {
  const errors = {}
  const name = String(form.name || "").trim()
  const mobile = String(form.mobile || "").replace(/\D/g, "")
  const email = String(form.email || "").trim()
  const pin = String(form.pin_code || "").trim()
  const gstin = String(form.gstin || "").trim().toUpperCase()

  if (!name) errors.name = "Customer name is required."
  else if (name.length > 100) errors.name = "Name must be 100 characters or fewer."

  if (mobile && (mobile.length < 10 || mobile.length > 13)) {
    errors.mobile = "Enter a valid mobile number."
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Enter a valid email address."
  }

  if (pin && !/^\d{6}$/.test(pin)) {
    errors.pin_code = "PIN code must contain 6 digits."
  }

  if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) {
    errors.gstin = "GSTIN must contain 15 letters and numbers."
  }

  return errors
}

function FieldError({ children }) {
  if (!children) return null
  return <p className="mt-1 text-xs text-rose-600">{children}</p>
}

function EditCustomerDialog({
  open,
  onOpenChange,
  form,
  setForm,
  errors = {},
  setErrors,
  customer,
  entryCount = 0,
  saving = false,
  onPhotoChange,
  onSubmit,
}) {
  const update = (key, value) => {
    setForm((previous) => ({ ...previous, [key]: value }))
    if (errors[key]) {
      setErrors((previous) => ({ ...previous, [key]: "" }))
    }
  }

  const inputClass =
    "h-10 rounded-xl border-violet-200 bg-white text-sm shadow-none focus-visible:ring-2 focus-visible:ring-violet-500/30"

  const labelClass = "mb-1.5 block text-xs font-semibold text-slate-600"

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="!flex !max-h-[90dvh] w-[calc(100%-1rem)] max-w-[680px] flex-col gap-0 overflow-hidden rounded-[20px] border border-violet-100 bg-white p-0 shadow-[0_24px_80px_rgba(39,31,79,0.20)] sm:rounded-[24px]">
        <DialogHeader className="shrink-0 border-b border-violet-100 px-4 py-4 pr-12 text-left sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-100 bg-violet-50 text-violet-700">
              <User className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-bold tracking-tight text-[#171a39]">
                Edit customer
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs leading-5 text-slate-500">
                Update customer information across this ledger
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
            <div className="flex items-center gap-4 rounded-xl border border-violet-100 bg-[#faf9ff] p-3.5">
              <div className="flex h-[68px] w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-violet-100 bg-white text-violet-700">
                {form.photo_preview ? (
                  <img
                    src={form.photo_preview}
                    alt="Customer preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User className="h-7 w-7" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800">
                  {form.name || customer?.name || "Customer photo"}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  JPG, PNG or other image format · Maximum 2 MB
                </p>
                <label className="mt-2 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-violet-50">
                  <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                  Choose photo
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={onPhotoChange}
                    disabled={saving}
                  />
                </label>
              </div>
            </div>

            <section className="space-y-3">
              <div className="flex items-center gap-2 border-b border-violet-100 pb-2">
                <User className="h-4 w-4 text-slate-500" aria-hidden="true" />
                <h3 className="text-sm font-bold text-[#171a39]">Basic information</h3>
              </div>

              <div>
                <Label htmlFor="edit-customer-name" className={labelClass}>
                  Customer name <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="edit-customer-name"
                  value={form.name}
                  onChange={(event) => update("name", event.target.value)}
                  placeholder="Enter customer name"
                  maxLength={100}
                  className={inputClass}
                  aria-invalid={Boolean(errors.name)}
                  disabled={saving}
                />
                <FieldError>{errors.name}</FieldError>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="edit-customer-mobile" className={labelClass}>
                    Mobile number
                  </Label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="edit-customer-mobile"
                      value={form.mobile}
                      onChange={(event) => update("mobile", event.target.value)}
                      placeholder="Mobile number"
                      inputMode="tel"
                      className={`${inputClass} pl-9`}
                      aria-invalid={Boolean(errors.mobile)}
                      disabled={saving}
                    />
                  </div>
                  <FieldError>{errors.mobile}</FieldError>
                </div>

                <div>
                  <Label htmlFor="edit-customer-email" className={labelClass}>
                    Email address
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="edit-customer-email"
                      type="email"
                      value={form.email}
                      onChange={(event) => update("email", event.target.value)}
                      placeholder="name@example.com"
                      className={`${inputClass} pl-9`}
                      aria-invalid={Boolean(errors.email)}
                      disabled={saving}
                    />
                  </div>
                  <FieldError>{errors.email}</FieldError>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 border-b border-violet-100 pb-2">
                <MapPin className="h-4 w-4 text-slate-500" aria-hidden="true" />
                <h3 className="text-sm font-bold text-[#171a39]">Address details</h3>
              </div>

              <div>
                <Label htmlFor="edit-customer-address" className={labelClass}>
                  Address
                </Label>
                <Textarea
                  id="edit-customer-address"
                  value={form.address}
                  onChange={(event) => update("address", event.target.value)}
                  placeholder="House, street, area, city"
                  rows={3}
                  className="min-h-[84px] resize-y rounded-xl border-violet-200 bg-white text-sm shadow-none focus-visible:ring-2 focus-visible:ring-violet-500/30"
                  disabled={saving}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="edit-customer-pin" className={labelClass}>
                    PIN code
                  </Label>
                  <Input
                    id="edit-customer-pin"
                    value={form.pin_code}
                    onChange={(event) => update("pin_code", event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="6-digit PIN"
                    inputMode="numeric"
                    maxLength={6}
                    className={inputClass}
                    aria-invalid={Boolean(errors.pin_code)}
                    disabled={saving}
                  />
                  <FieldError>{errors.pin_code}</FieldError>
                </div>

                <div>
                  <Label htmlFor="edit-customer-type" className={labelClass}>
                    Customer type
                  </Label>
                  <select
                    id="edit-customer-type"
                    value={form.customer_type}
                    onChange={(event) => update("customer_type", event.target.value)}
                    className={`${inputClass} w-full px-3`}
                    disabled={saving}
                  >
                    <option value="">Select type</option>
                    <option value="individual">Individual</option>
                    <option value="business">Business</option>
                    <option value="wholesale">Wholesale</option>
                    <option value="retail">Retail</option>
                    <option value="regular">Regular</option>
                  </select>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 border-b border-violet-100 pb-2">
                <Receipt className="h-4 w-4 text-slate-500" aria-hidden="true" />
                <h3 className="text-sm font-bold text-[#171a39]">Business and notes</h3>
              </div>

              <div>
                <Label htmlFor="edit-customer-gstin" className={labelClass}>
                  GSTIN
                </Label>
                <Input
                  id="edit-customer-gstin"
                  value={form.gstin}
                  onChange={(event) => update("gstin", event.target.value.toUpperCase().slice(0, 15))}
                  placeholder="15-character GSTIN"
                  maxLength={15}
                  className={inputClass}
                  aria-invalid={Boolean(errors.gstin)}
                  disabled={saving}
                />
                <FieldError>{errors.gstin}</FieldError>
              </div>

              <div>
                <Label htmlFor="edit-customer-notes" className={labelClass}>
                  Additional notes
                </Label>
                <Textarea
                  id="edit-customer-notes"
                  value={form.notes}
                  onChange={(event) => update("notes", event.target.value)}
                  placeholder="Add any useful customer notes"
                  rows={3}
                  className="min-h-[84px] resize-y rounded-xl border-violet-200 bg-white text-sm shadow-none focus-visible:ring-2 focus-visible:ring-violet-500/30"
                  disabled={saving}
                />
              </div>
            </section>

            <div className="rounded-xl border border-violet-100 bg-[#faf9ff] px-3.5 py-3 text-xs leading-5 text-slate-600">
              <div className="flex items-start gap-2">
                <Store className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                <p>
                  These details will be updated for all {entryCount} entries in this customer’s ledger.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-violet-100 bg-white px-4 py-3.5 sm:px-6">
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
                className="h-10 w-full rounded-xl border-violet-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-none hover:bg-violet-50 sm:w-auto sm:min-w-[110px]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="outline"
                disabled={saving}
                className="h-10 w-full rounded-xl border-violet-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-violet-50 sm:w-auto sm:min-w-[145px]"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Saving...
                  </span>
                ) : (
                  "Save changes"
                )}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
