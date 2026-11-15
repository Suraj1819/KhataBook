import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatDate } from "@/lib/utils"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

import {
  AlertCircle,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BellRing,
  Box,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  CreditCard,
  Eye,
  FileText,
  Hourglass,
  IndianRupee,
  Layers,
  Minus,
  PieChart,
  Plus,
  Receipt,
  RefreshCw,
  Store,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  Zap,
} from "lucide-react"

import { toast } from "sonner"

/* ==================================================
   CONSTANTS & HELPERS
================================================== */

const RECENT_PAGE_SIZE = 5
const FETCH_BATCH = 1000 // Supabase returns max 1000 rows per request

// Column in the "payments" table that stores the payment date.
// Change this if yours is named differently (e.g. "created_at", "paid_on").
const PAYMENT_DATE_COLUMN = "payment_date"

// ---- Profile settings (change these if your table or columns differ) ----
const PROFILE_TABLE = "profiles"
const PROFILE_ID_COLUMN = "id" // column that holds the auth user id
const AVATAR_BUCKET = "avatars" // storage bucket, used only if avatar is stored as a file path
// Column names are tried in this order, so most schemas work without edits
const PROFILE_NAME_KEYS = ["full_name", "name", "display_name", "username"]
const PROFILE_AVATAR_KEYS = ["avatar_url", "photo_url", "profile_photo", "profile_image", "image_url", "avatar"]
const PROFILE_REFETCH_MS = 30000 // refetch on tab focus if data is older than this

const PRESETS = [
  { mode: "today", label: "Today" },
  { mode: "yesterday", label: "Yesterday" },
  { mode: "week", label: "Last 7 days" },
  { mode: "month", label: "This month" },
]

const EMPTY_STATS = {
  customers: 0,
  bills: 0,
  totalSales: 0,
  totalReceived: 0,
  totalRefunded: 0,
  outstanding: 0,
  advances: 0,
  overdue: 0,
  pendingBillCount: 0,
  overdueBillCount: 0,
  prevSales: null,
  prevReceived: null,
}

const EMPTY_AGING = {
  current: { amount: 0, count: 0 },
  d1: { amount: 0, count: 0 },
  d2: { amount: 0, count: 0 },
  d3: { amount: 0, count: 0 },
}

const AGING_BUCKETS = [
  { key: "current", label: "Not yet due", bar: "bg-slate-400" },
  { key: "d1", label: "1–7 days late", bar: "bg-amber-500" },
  { key: "d2", label: "8–30 days late", bar: "bg-orange-500" },
  { key: "d3", label: "30+ days late", bar: "bg-rose-600" },
]

const MODE_COLORS = [
  "bg-emerald-500",
  "bg-blue-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-pink-500",
  "bg-slate-400",
]

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-amber-100 text-amber-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
  "bg-violet-100 text-violet-700",
]

const cardClass =
  "overflow-hidden rounded-[20px] border border-white/80 bg-white/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)] backdrop-blur-sm"

const num = (value) => Number(value) || 0

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

// Whole days between two YYYY-MM-DD strings (b - a)
function daysBetween(a, b) {
  const [ay, am, ad] = a.split("-").map(Number)
  const [by, bm, bd] = b.split("-").map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

// Adds from/to date filters to a Supabase query (skipped for "Overall")
function applyRange(query, column, range) {
  let q = query
  if (range.from) q = q.gte(column, range.from)
  if (range.to) q = q.lte(column, range.to)
  return q
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
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
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [photoUrl])

  return (
    <div
      aria-label={`${name || "Customer"} profile`}
      role="img"
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-sm font-bold text-violet-700 ${className}`}
    >
      {getInitials(name)}
      {photoUrl && !failed && (
        <img
          src={photoUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full rounded-full object-cover"
        />
      )}
    </div>
  )
}

// 1,20,000 -> ₹1.2L  (Indian short format for chart axes)
function compactINR(value) {
  const v = Math.abs(num(value))
  const sign = value < 0 ? "-" : ""
  const trim = (n) => String(Number(n.toFixed(1)))
  if (v >= 10000000) return `${sign}₹${trim(v / 10000000)}Cr`
  if (v >= 100000) return `${sign}₹${trim(v / 100000)}L`
  if (v >= 1000) return `${sign}₹${trim(v / 1000)}K`
  return `${sign}₹${Math.round(v)}`
}

function niceMax(value) {
  if (value <= 0) return 1000
  const pow = 10 ** Math.floor(Math.log10(value))
  const n = value / pow
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return nice * pow
}

function shortDayLabel(dateStr, totalDays) {
  const [y, m, d] = dateStr.split("-").map(Number)
  if (totalDays <= 7) {
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
      weekday: "short",
      timeZone: "UTC",
    })
  }
  return String(d)
}

/**
 * Supabase silently caps every query at 1000 rows, which makes totals wrong
 * for busy shops. This helper pages through ALL rows so sums stay accurate.
 * `buildQuery` must return a fresh, ordered query every time it is called.
 */
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

function getPaymentStatus(status, amountDue) {
  let value = String(status || "").toLowerCase()

  // If status is missing, derive it from the amount due
  if (!value) value = num(amountDue) > 0 ? "unpaid" : "paid"

  if (value === "paid") {
    return {
      label: "Paid",
      className: "bg-emerald-100 text-emerald-700 border-emerald-200",
      icon: CheckCircle2,
    }
  }

  if (value === "partial") {
    return {
      label: "Partially paid",
      className: "bg-amber-100 text-amber-700 border-amber-200",
      icon: Clock3,
    }
  }

  return {
    label: "Unpaid",
    className: "bg-rose-100 text-rose-700 border-rose-200",
    icon: CircleAlert,
  }
}

// The period right before the selected one, for "vs previous" comparisons
function getPreviousRange(range) {
  if (!range.from || !range.to) return null
  const length = daysBetween(range.from, range.to) + 1
  const to = shiftDate(range.from, -1)
  return { from: shiftDate(to, -(length - 1)), to }
}

// Date range the trend chart should cover for the selected period
function getChartRange(period, range, today) {
  switch (period.mode) {
    case "week":
    case "month":
      return range
    case "custom":
      if (range.from && range.to) {
        const span = daysBetween(range.from, range.to) + 1
        return span > 31 ? { from: shiftDate(range.to, -30), to: range.to } : range
      }
      return { from: shiftDate(today, -6), to: today }
    case "yesterday": {
      const y = shiftDate(today, -1)
      return { from: shiftDate(y, -6), to: y }
    }
    case "overall":
      return { from: shiftDate(today, -29), to: today }
    default:
      return { from: shiftDate(today, -6), to: today }
  }
}

/* ==================================================
   PROFILE (fetched from Supabase, updates live)
================================================== */

function pickFirst(source, keys) {
  if (!source) return ""
  for (const key of keys) {
    const value = source[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

function resolveAvatarUrl(raw, version) {
  if (!raw) return ""
  if (/^(https?:|data:|blob:)/i.test(raw)) {
    // Cache-bust plain public URLs so a new photo shows up straight away
    if (version && !raw.includes("?") && !raw.startsWith("data:") && !raw.startsWith("blob:")) {
      return `${raw}?v=${encodeURIComponent(version)}`
    }
    return raw
  }

  // Stored as a file path inside the storage bucket
  const path = raw.replace(new RegExp(`^/?${AVATAR_BUCKET}/`), "")
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)
  const url = data?.publicUrl || ""
  return url && version ? `${url}?v=${encodeURIComponent(version)}` : url
}

function useProfile() {
  const [profile, setProfile] = useState(null)
  const lastFetch = useRef(0)

  const loadProfile = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const user = sessionData?.session?.user

      if (!user) {
        setProfile(null)
        return
      }

      let row = null
      try {
        const { data, error } = await supabase
          .from(PROFILE_TABLE)
          .select("*")
          .eq(PROFILE_ID_COLUMN, user.id)
          .maybeSingle()
        if (error) throw error
        row = data
      } catch (error) {
        // Table or policy missing: fall back to the auth user's own metadata
        console.warn("Profile fetch skipped:", error?.message || error)
      }

      const meta = user.user_metadata || {}
      const name =
        pickFirst(row, PROFILE_NAME_KEYS) ||
        pickFirst(meta, ["full_name", "name", "display_name"]) ||
        (user.email ? user.email.split("@")[0] : "")

      const rawAvatar =
        pickFirst(row, PROFILE_AVATAR_KEYS) || pickFirst(meta, ["avatar_url", "picture"])

      setProfile({
        id: user.id,
        name,
        email: user.email || "",
        avatarUrl: resolveAvatarUrl(rawAvatar, row?.updated_at),
      })
      lastFetch.current = Date.now()
    } catch (error) {
      console.warn("Profile load failed:", error?.message || error)
    }
  }, [])

  useEffect(() => {
    loadProfile()

    // Sign in / sign out / account updates
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) loadProfile()
    })

    // Another part of the app can call: window.dispatchEvent(new Event("profile-updated"))
    const onProfileUpdated = () => loadProfile()
    window.addEventListener("profile-updated", onProfileUpdated)

    // Pick up changes made in another tab when this one is focused again
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastFetch.current > PROFILE_REFETCH_MS) {
        loadProfile()
      }
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)

    return () => {
      authListener?.subscription?.unsubscribe()
      window.removeEventListener("profile-updated", onProfileUpdated)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
  }, [loadProfile])

  // Realtime: update instantly when the profile row changes (needs Realtime on the table)
  const profileId = profile?.id
  useEffect(() => {
    if (!profileId) return

    const channel = supabase
      .channel(`dashboard-profile-${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: PROFILE_TABLE,
          filter: `${PROFILE_ID_COLUMN}=eq.${profileId}`,
        },
        () => loadProfile()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profileId, loadProfile])

  return profile
}

function ProfileAvatar({ name, src, className = "h-14 w-14 text-lg" }) {
  const [failed, setFailed] = useState(false)

  // Try the new image again whenever the URL changes
  useEffect(() => {
    setFailed(false)
  }, [src])

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={`${name || "User"} profile photo`}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full object-cover ring-2 ring-white shadow-[0_3px_12px_rgba(80,65,130,0.18)] ${className}`}
      />
    )
  }

  return (
    <div
      aria-label={`${name || "User"} profile`}
      role="img"
      className={`flex shrink-0 items-center justify-center rounded-full bg-violet-100 font-bold text-violet-700 ring-2 ring-white shadow-[0_3px_12px_rgba(80,65,130,0.18)] ${className}`}
    >
      {getInitials(name)}
    </div>
  )
}

/* ==================================================
   SMALL UI PIECES
================================================== */

function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />
}

function DashboardSkeleton() {
  return (
    <div
      className="min-h-full w-full space-y-4 rounded-2xl bg-[#f7f5ff] px-3 py-5 sm:px-5 lg:px-6"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <div className="flex items-center gap-4">
        <Skeleton className="h-14 w-14 rounded-full" />
        <Skeleton className="h-16 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 2xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[124px] rounded-[20px]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 2xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-[18px]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[1.65fr_1fr]">
        <Skeleton className="h-[420px] rounded-[20px]" />
        <Skeleton className="h-[420px] rounded-[20px]" />
      </div>
    </div>
  )
}

const SUMMARY_TONES = {
  green: { icon: "bg-emerald-100/80 text-emerald-700", accent: "text-emerald-700" },
  blue: { icon: "bg-blue-100/80 text-blue-700", accent: "text-blue-700" },
  pink: { icon: "bg-pink-100/80 text-pink-700", accent: "text-pink-700" },
  purple: { icon: "bg-violet-100/80 text-violet-700", accent: "text-violet-700" },
}

function SummaryCard({ label, value, detail, icon: Icon, tone = "green", footer }) {
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
          {footer}
        </div>
      </CardContent>
    </Card>
  )
}

// Small "▲ 12.5% vs yesterday" pill
function DeltaBadge({ current, previous, label }) {
  if (previous === null || previous === undefined) return null

  let tone = "bg-slate-100 text-slate-600"
  let Icon = Minus
  let text = "No change"

  if (previous === 0 && current > 0) {
    tone = "bg-emerald-50 text-emerald-700"
    Icon = ArrowUpRight
    text = "New"
  } else if (previous > 0) {
    const pct = ((current - previous) / previous) * 100
    if (Math.abs(pct) >= 0.05) {
      const up = pct > 0
      tone = up ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"
      Icon = up ? ArrowUpRight : ArrowDownRight
      text = `${up ? "+" : "-"}${Math.abs(pct).toFixed(Math.abs(pct) >= 100 ? 0 : 1)}%`
    }
  }

  return (
    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
      <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-bold ${tone}`}>
        <Icon className="h-3 w-3" aria-hidden="true" />
        {text}
      </span>
      <span className="truncate">vs {label}</span>
    </p>
  )
}

function CompactStat({ label, value, icon: Icon, tone = "purple", detail }) {
  const styles = {
    green: "bg-emerald-100/80 text-emerald-700",
    blue: "bg-blue-100/80 text-blue-700",
    purple: "bg-violet-100/80 text-violet-700",
    pink: "bg-pink-100/80 text-pink-700",
  }

  return (
    <Card className="rounded-[18px] border border-white/80 bg-white/75 shadow-[0_3px_12px_rgba(80,65,130,0.06)]">
      <CardContent className="flex min-w-0 items-center gap-3 p-3.5 sm:p-4">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${styles[tone]}`}
        >
          <Icon className="h-6 w-6" strokeWidth={1.9} aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-slate-600">{label}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <p className="text-xl font-bold tracking-tight text-[#171a36] tabular-nums">{value}</p>
            {detail && <span className="text-[11px] font-semibold text-slate-500">{detail}</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SectionHeader({ icon: Icon, title, description, action }) {
  return (
    <div className="flex min-w-0 flex-col items-stretch gap-3 border-b border-[#eae7f4] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 [&>button]:w-full sm:[&>button]:w-auto">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </div>

        <div className="min-w-0">
          <h2 className="break-words text-[16px] font-bold tracking-tight text-[#171a36]">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        </div>
      </div>

      {action}
    </div>
  )
}

const QUICK_ACTION_TONES = {
  green: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  blue: "bg-blue-50 text-sky-600 hover:bg-blue-100",
  purple: "bg-violet-50 text-violet-700 hover:bg-violet-100",
  amber: "bg-amber-50 text-amber-600 hover:bg-amber-100",
}

function QuickAction({ title, description, icon: Icon, to, tone }) {
  return (
    <Link
      to={to}
      className={`flex min-w-0 items-center gap-3 rounded-xl p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${QUICK_ACTION_TONES[tone]}`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80">
        <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
      </div>

      <div className="min-w-0">
        <p className="truncate text-[13px] font-bold text-slate-800">{title}</p>
        <p className="mt-0.5 truncate text-[11px] text-slate-500">{description}</p>
      </div>
    </Link>
  )
}

const ROW_TONES = {
  green: { icon: "text-emerald-700", value: "text-emerald-700" },
  pink: { icon: "text-pink-600", value: "text-rose-600" },
  blue: { icon: "text-blue-600", value: "text-slate-900" },
  purple: { icon: "text-violet-700", value: "text-slate-900" },
}

function BusinessSummaryRow({ label, value, icon: Icon, tone = "green" }) {
  const style = ROW_TONES[tone]

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#efedf6] py-3 last:border-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon className={`h-[19px] w-[19px] shrink-0 ${style.icon}`} aria-hidden="true" />
        <span className="truncate text-[13px] font-medium text-slate-700">{label}</span>
      </div>
      <span className={`shrink-0 text-sm font-bold tabular-nums ${style.value}`}>{value}</span>
    </div>
  )
}

function MetricTile({ icon: Icon, iconClass, label, value, valueClass = "text-slate-900", note }) {
  return (
    <div className="flex min-h-[132px] flex-col justify-between rounded-2xl border border-[#ece9f5] bg-white p-4">
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconClass}`}>
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </div>
      <div className="mt-4">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className={`mt-1 break-words text-xl font-bold tracking-tight tabular-nums ${valueClass}`}>
          {value}
        </p>
        {note && <p className="mt-0.5 text-[11px] text-slate-500">{note}</p>}
      </div>
    </div>
  )
}

function EmptyNote({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <p className="mt-3 text-sm font-bold text-slate-900">{title}</p>
      {description && <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">{description}</p>}
    </div>
  )
}

/* ==================================================
   SALES TREND CHART (inline SVG, no extra library)
================================================== */

function TrendChart({ data }) {
  const W = 720
  const H = 250
  const padLeft = 52
  const padRight = 12
  const padTop = 14
  const padBottom = 30
  const plotW = W - padLeft - padRight
  const plotH = H - padTop - padBottom

  const peak = Math.max(0, ...data.flatMap((d) => [d.sales, d.received]))
  const max = niceMax(peak)
  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i)

  const groupW = plotW / data.length
  const barW = Math.max(3, Math.min(16, groupW * 0.34))
  const labelStep = data.length > 14 ? Math.ceil(data.length / 8) : 1
  const y = (value) => padTop + plotH - (value / max) * plotH

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Sales and received amounts for the last ${data.length} days`}
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={padLeft}
            x2={W - padRight}
            y1={y(tick)}
            y2={y(tick)}
            className="stroke-[#eeecf5]"
            strokeDasharray={tick === 0 ? undefined : "3 4"}
          />
          <text
            x={padLeft - 8}
            y={y(tick) + 3.5}
            textAnchor="end"
            className="fill-slate-400 text-[10px] font-medium"
          >
            {compactINR(tick)}
          </text>
        </g>
      ))}

      {data.map((d, i) => {
        const cx = padLeft + groupW * (i + 0.5)
        const salesH = (d.sales / max) * plotH
        const receivedH = (d.received / max) * plotH
        const showLabel = i % labelStep === 0 || i === data.length - 1

        return (
          <g key={d.date} className="group">
            <rect
              x={cx - groupW / 2}
              y={padTop}
              width={groupW}
              height={plotH}
              className="fill-transparent group-hover:fill-violet-50/70"
            />
            {salesH > 0 && (
              <rect
                x={cx - barW - 1}
                y={y(d.sales)}
                width={barW}
                height={salesH}
                rx={Math.min(3, barW / 2)}
                className="fill-emerald-600"
              />
            )}
            {receivedH > 0 && (
              <rect
                x={cx + 1}
                y={y(d.received)}
                width={barW}
                height={receivedH}
                rx={Math.min(3, barW / 2)}
                className="fill-blue-400"
              />
            )}
            {showLabel && (
              <text
                x={cx}
                y={H - 10}
                textAnchor="middle"
                className="fill-slate-500 text-[10px] font-medium"
              >
                {shortDayLabel(d.date, data.length)}
              </text>
            )}
            <title>
              {`${formatDate(d.date)}\nSales: ${formatCurrency(d.sales)}\nReceived: ${formatCurrency(d.received)}`}
            </title>
          </g>
        )
      })}
    </svg>
  )
}

/* ==================================================
   DASHBOARD
================================================== */

export default function Dashboard() {
  const { currentShop } = useShop()
  const shopId = currentShop?.id
  const profile = useProfile()

  const today = getLocalDateString()

  const [stats, setStats] = useState(EMPTY_STATS)
  const [pendingCustomers, setPendingCustomers] = useState([])
  const [aging, setAging] = useState(EMPTY_AGING)
  const [paymentModes, setPaymentModes] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [lastUpdated, setLastUpdated] = useState(null)

  // Default view is "today". The person can switch to Overall or pick dates.
  const [period, setPeriod] = useState({ mode: "today", from: "", to: "" })
  const hasLoaded = useRef(false)
  const [periodOpen, setPeriodOpen] = useState(false)
  const periodRef = useRef(null)

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

  const [recentBills, setRecentBills] = useState([])
  const [recentCount, setRecentCount] = useState(0)
  const [recentPage, setRecentPage] = useState(1)
  const [recentLoading, setRecentLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // Trend chart + recent payments (loaded separately, never block the page)
  const [trend, setTrend] = useState([])
  const [recentPayments, setRecentPayments] = useState([])
  const [extrasLoading, setExtrasLoading] = useState(false)

  // Prevents an older (slower) request from overwriting newer data
  const dashboardRequest = useRef(0)

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

  const previousRange = useMemo(() => getPreviousRange(range), [range])
  const chartRange = useMemo(() => getChartRange(period, range, today), [period, range, today])

  const totalRecentPages = Math.max(1, Math.ceil(recentCount / RECENT_PAGE_SIZE))

  const paginationItems = useMemo(() => {
    if (totalRecentPages <= 5) {
      return Array.from({ length: totalRecentPages }, (_, i) => i + 1)
    }
    if (recentPage <= 3) return [1, 2, 3, "ellipsis-end", totalRecentPages]
    if (recentPage >= totalRecentPages - 2) {
      return [1, "ellipsis-start", totalRecentPages - 2, totalRecentPages - 1, totalRecentPages]
    }
    return [
      1,
      "ellipsis-start",
      recentPage - 1,
      recentPage,
      recentPage + 1,
      "ellipsis-end",
      totalRecentPages,
    ]
  }, [recentPage, totalRecentPages])

  // Go back to page 1 and clear old data when the shop changes
  useEffect(() => {
    hasLoaded.current = false
    setRecentPage(1)
    setStats(EMPTY_STATS)
    setPendingCustomers([])
    setAging(EMPTY_AGING)
    setPaymentModes([])
    setRecentBills([])
    setRecentCount(0)
    setTrend([])
    setRecentPayments([])
    setLoadError("")
  }, [shopId])

  /* --------------------------------------------------
     LOAD SUMMARY DATA
  -------------------------------------------------- */

  const loadDashboard = useCallback(
    async (showRefresh = false) => {
      const requestId = ++dashboardRequest.current

      if (!shopId) {
        setStats(EMPTY_STATS)
        setPendingCustomers([])
        setLoading(false)
        return
      }

      // Full skeleton only on first load; later changes just show "Updating…"
      if (showRefresh || hasLoaded.current) setRefreshing(true)
      else setLoading(true)

      setLoadError("")

      try {
        const [custRes, periodBills, payments, dueBills, advances, prevBills, prevPayments] =
          await Promise.all([
            supabase
              .from("customers")
              .select("id", { count: "exact", head: true })
              .eq("shop_id", shopId)
              .eq("is_active", true),

            // Bills created in the selected period
            fetchAllRows(() =>
              applyRange(
                supabase.from("bills").select("id, grand_total").eq("shop_id", shopId),
                "bill_date",
                range
              ).order("id")
            ),

            // Payments and refunds together, so received is a NET figure
            fetchAllRows(() =>
              applyRange(
                supabase
                  .from("payments")
                  .select("id, amount, is_refund, payment_mode")
                  .eq("shop_id", shopId),
                PAYMENT_DATE_COLUMN,
                range
              ).order("id")
            ),

            fetchAllRows(() =>
              applyRange(
                supabase
                  .from("bills")
                  .select("id, amount_due, due_date, customer_id, customers(name, photo_url)")
                  .eq("shop_id", shopId)
                  .gt("amount_due", 0),
                "bill_date",
                range
              ).order("id")
            ),

            fetchAllRows(() =>
              supabase
                .from("customer_advances")
                .select("id, remaining_amount")
                .eq("shop_id", shopId)
                .gt("remaining_amount", 0)
                .order("id")
            ),

            // Previous period, only used for the "vs previous" badges.
            // A failure here must never break the dashboard.
            previousRange
              ? fetchAllRows(() =>
                  applyRange(
                    supabase.from("bills").select("id, grand_total").eq("shop_id", shopId),
                    "bill_date",
                    previousRange
                  ).order("id")
                ).catch(() => null)
              : Promise.resolve(null),

            previousRange
              ? fetchAllRows(() =>
                  applyRange(
                    supabase
                      .from("payments")
                      .select("id, amount, is_refund")
                      .eq("shop_id", shopId),
                    PAYMENT_DATE_COLUMN,
                    previousRange
                  ).order("id")
                ).catch(() => null)
              : Promise.resolve(null),
          ])

        if (custRes.error) throw custRes.error

        // A newer request has started — ignore this result
        if (requestId !== dashboardRequest.current) return

        const sum = (rows, key) => rows.reduce((total, row) => total + num(row[key]), 0)
        const netReceived = (rows) =>
          Math.max(
            0,
            sum(
              rows.filter((p) => !p.is_refund),
              "amount"
            ) -
              sum(
                rows.filter((p) => p.is_refund),
                "amount"
              )
          )

        const grossReceived = sum(
          payments.filter((p) => !p.is_refund),
          "amount"
        )
        const totalRefunded = sum(
          payments.filter((p) => p.is_refund),
          "amount"
        )

        const overdueBills = dueBills.filter((b) => b.due_date && b.due_date < today)

        // Group dues by customer, and sort them into aging buckets
        const customerMap = new Map()
        const nextAging = {
          current: { amount: 0, count: 0 },
          d1: { amount: 0, count: 0 },
          d2: { amount: 0, count: 0 },
          d3: { amount: 0, count: 0 },
        }

        dueBills.forEach((bill) => {
          const key = bill.customer_id || "walk-in"
          const isOverdue = bill.due_date && bill.due_date < today
          const existing = customerMap.get(key)

          if (existing) {
            existing.due += num(bill.amount_due)
            existing.billCount += 1
            if (isOverdue) existing.overdue += num(bill.amount_due)
          } else {
            customerMap.set(key, {
              key,
              name: bill.customers?.name || "Walk-in Customer",
              photoUrl: bill.customers?.photo_url || null,
              due: num(bill.amount_due),
              overdue: isOverdue ? num(bill.amount_due) : 0,
              billCount: 1,
            })
          }

          const late = isOverdue ? daysBetween(bill.due_date, today) : 0
          const bucket = late <= 0 ? "current" : late <= 7 ? "d1" : late <= 30 ? "d2" : "d3"
          nextAging[bucket].amount += num(bill.amount_due)
          nextAging[bucket].count += 1
        })

        // Payment modes (money received, by how it was paid)
        const modeMap = new Map()
        payments
          .filter((p) => !p.is_refund)
          .forEach((p) => {
            const mode = String(p.payment_mode || "Other").trim() || "Other"
            modeMap.set(mode, (modeMap.get(mode) || 0) + num(p.amount))
          })
        const sortedModes = Array.from(modeMap, ([mode, amount]) => ({ mode, amount })).sort(
          (a, b) => b.amount - a.amount
        )
        const topModes = sortedModes.slice(0, 5)
        const otherAmount = sortedModes.slice(5).reduce((total, m) => total + m.amount, 0)
        if (otherAmount > 0) topModes.push({ mode: "Other modes", amount: otherAmount })

        setStats({
          customers: custRes.count || 0,
          bills: periodBills.length,
          totalSales: sum(periodBills, "grand_total"),
          totalReceived: Math.max(0, grossReceived - totalRefunded),
          totalRefunded,
          outstanding: sum(dueBills, "amount_due"),
          advances: sum(advances, "remaining_amount"),
          overdue: sum(overdueBills, "amount_due"),
          pendingBillCount: dueBills.length,
          overdueBillCount: overdueBills.length,
          prevSales: prevBills ? sum(prevBills, "grand_total") : null,
          prevReceived: prevPayments ? netReceived(prevPayments) : null,
        })

        setAging(nextAging)
        setPaymentModes(topModes)

        setPendingCustomers(
          Array.from(customerMap.values())
            .sort((a, b) => b.due - a.due)
            .slice(0, 5)
        )

        setLastUpdated(new Date())
        hasLoaded.current = true
      } catch (error) {
        if (requestId !== dashboardRequest.current) return
        console.error("Dashboard error:", error)
        const message = error?.message || "Unable to load dashboard."
        setLoadError(message)
        toast.error("Could not load dashboard", { description: message })
      } finally {
        if (requestId === dashboardRequest.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shopId, today, range.from, range.to, previousRange?.from, previousRange?.to]
  )

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  /* --------------------------------------------------
     LOAD RECENT BILLS (paginated)
  -------------------------------------------------- */

  useEffect(() => {
    if (!shopId) return

    let ignore = false

    async function loadRecentBills() {
      setRecentLoading(true)

      try {
        const from = (recentPage - 1) * RECENT_PAGE_SIZE
        const to = from + RECENT_PAGE_SIZE - 1

        let query = supabase
          .from("bills")
          .select(
            "id, bill_number, bill_date, grand_total, amount_due, payment_status, customers(name, photo_url)",
            { count: "exact" }
          )
          .eq("shop_id", shopId)

        query = applyRange(query, "bill_date", range)

        const { data, count, error } = await query
          .order("created_at", { ascending: false })
          .range(from, to)

        if (error) throw error
        if (ignore) return

        setRecentBills(data || [])
        setRecentCount(count || 0)

        const pages = Math.max(1, Math.ceil((count || 0) / RECENT_PAGE_SIZE))
        if (recentPage > pages) setRecentPage(pages)
      } catch (error) {
        if (ignore) return
        console.error("Recent bills error:", error)
        toast.error("Could not load recent bills", { description: error?.message })
      } finally {
        if (!ignore) setRecentLoading(false)
      }
    }

    loadRecentBills()

    return () => {
      ignore = true
    }
  }, [shopId, recentPage, refreshKey, range.from, range.to])

  /* --------------------------------------------------
     LOAD TREND CHART + RECENT PAYMENTS
  -------------------------------------------------- */

  useEffect(() => {
    if (!shopId) return

    let ignore = false

    async function loadExtras() {
      setExtrasLoading(true)

      const [billsResult, paymentsResult, recentResult] = await Promise.allSettled([
        fetchAllRows(() =>
          applyRange(
            supabase.from("bills").select("id, bill_date, grand_total").eq("shop_id", shopId),
            "bill_date",
            chartRange
          ).order("id")
        ),
        fetchAllRows(() =>
          applyRange(
            supabase
              .from("payments")
              .select(`id, ${PAYMENT_DATE_COLUMN}, amount, is_refund`)
              .eq("shop_id", shopId),
            PAYMENT_DATE_COLUMN,
            chartRange
          ).order("id")
        ),
        supabase
          .from("payments")
          .select(`id, amount, payment_mode, ${PAYMENT_DATE_COLUMN}, is_refund, bill_id, customers(name, photo_url)`)
          .eq("shop_id", shopId)
          .order("created_at", { ascending: false })
          .limit(5),
      ])

      if (ignore) return

      // Daily series: every day in the range gets a bar, even with no activity
      if (billsResult.status === "fulfilled" && paymentsResult.status === "fulfilled") {
        const days = []
        for (let d = chartRange.from; d <= chartRange.to; d = shiftDate(d, 1)) days.push(d)

        const byDay = new Map(days.map((d) => [d, { date: d, sales: 0, received: 0 }]))

        billsResult.value.forEach((bill) => {
          const row = byDay.get(String(bill.bill_date || "").slice(0, 10))
          if (row) row.sales += num(bill.grand_total)
        })

        paymentsResult.value.forEach((payment) => {
          const row = byDay.get(String(payment[PAYMENT_DATE_COLUMN] || "").slice(0, 10))
          if (row) row.received += payment.is_refund ? -num(payment.amount) : num(payment.amount)
        })

        setTrend(Array.from(byDay.values()).map((d) => ({ ...d, received: Math.max(0, d.received) })))
      } else {
        console.warn("Trend chart unavailable:", billsResult.reason || paymentsResult.reason)
        setTrend([])
      }

      if (recentResult.status === "fulfilled" && !recentResult.value.error) {
        setRecentPayments(recentResult.value.data || [])
      } else {
        // Usually a missing customers relationship on payments; the card just stays empty
        console.warn("Recent payments unavailable:", recentResult.reason || recentResult.value?.error)
        setRecentPayments([])
      }

      setExtrasLoading(false)
    }

    loadExtras()

    return () => {
      ignore = true
    }
  }, [shopId, chartRange.from, chartRange.to, refreshKey])

  const handleRefresh = () => {
    setRefreshKey((key) => key + 1)
    loadDashboard(true)
  }

  /* --------------------------------------------------
     DERIVED NUMBERS
  -------------------------------------------------- */

  // Share of billed amount that has actually been collected
  const collectedAmount = Math.max(0, stats.totalSales - stats.outstanding)
  const collectionRate =
    stats.totalSales > 0
      ? Math.min(100, Math.max(0, Math.round((collectedAmount / stats.totalSales) * 100)))
      : 0

  const averageBillValue = stats.bills > 0 ? stats.totalSales / stats.bills : 0

  // Labels for the selected period
  const shortLabel = {
    today: "Today",
    yesterday: "Yesterday",
    week: "Last 7 days",
    month: "This month",
    overall: "Overall",
    custom: "Selected dates",
  }[period.mode]

  const previousLabel = {
    today: "yesterday",
    yesterday: "the day before",
  }[period.mode] || "previous period"

  const periodLabel = (() => {
    if (period.mode === "overall") return "Overall (all time)"
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
    if (period.mode === "today") return `Today, ${formatDate(today)}`
    return shortLabel
  })()

  const chartLabel = (() => {
    if (!chartRange.from || !chartRange.to) return ""
    return `${formatDate(chartRange.from)} – ${formatDate(chartRange.to)}`
  })()

  // Summary figures for the trend chart
  const trendSummary = useMemo(() => {
    const totalSales = trend.reduce((total, d) => total + d.sales, 0)
    const totalReceived = trend.reduce((total, d) => total + d.received, 0)
    const best = trend.reduce((top, d) => (d.sales > (top?.sales ?? -1) ? d : top), null)
    return {
      totalSales,
      totalReceived,
      average: trend.length > 0 ? totalSales / trend.length : 0,
      best: best && best.sales > 0 ? best : null,
    }
  }, [trend])

  const modesTotal = paymentModes.reduce((total, m) => total + m.amount, 0)
  const agingTotal = Object.values(aging).reduce((total, b) => total + b.amount, 0)

  const choosePeriod = (mode) => {
    setPeriod({ mode, from: "", to: "" })
    setRecentPage(1)
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
    setRecentPage(1)
  }

  const showingFrom = recentCount === 0 ? 0 : (recentPage - 1) * RECENT_PAGE_SIZE + 1
  const showingTo = Math.min(recentPage * RECENT_PAGE_SIZE, recentCount)

  const firstName = profile?.name ? profile.name.split(" ")[0] : ""

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
            Select or create a workspace to see your business dashboard.
          </p>
          <Button asChild className="mt-5 h-11 rounded-xl border border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-violet-50">
            <Link to="/settings">Open workspace settings</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (loading) return <DashboardSkeleton />

  /* --------------------------------------------------
     MAIN UI
  -------------------------------------------------- */

  return (
    <div className="min-h-full w-full min-w-0 space-y-4 overflow-x-hidden rounded-2xl bg-[#f7f5ff] px-3 py-4 sm:px-5 sm:py-5 xl:px-6">
      {/* PAGE HEADER */}

      <header className="flex min-w-0 flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            to="/settings"
            aria-label="Open profile settings"
            title={profile?.email || "Profile settings"}
            className="rounded-full transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <ProfileAvatar
              name={profile?.name}
              src={profile?.avatarUrl}
              className="h-14 w-14 text-lg sm:h-16 sm:w-16 sm:text-xl"
            />
          </Link>

          <div className="min-w-0">
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-2 text-xs font-medium text-slate-500"
            >
              <span className="truncate">{currentShop.name || "Workspace"}</span>
              <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>Dashboard</span>
            </nav>

            <h1 className="mt-1 truncate text-[26px] font-bold tracking-tight text-[#171a39] sm:text-[32px]">
              {getGreeting()}
              {firstName && <span className="text-emerald-700">, {firstName}</span>}
            </h1>

            <p className="mt-0.5 text-sm text-slate-600">
              Showing figures for{" "}
              <strong className="font-semibold text-slate-800">{periodLabel}</strong>.
            </p>
          </div>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          <div ref={periodRef} className="relative col-span-2 w-full sm:col-span-1 sm:w-auto">
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
                  className="fixed inset-0 z-40 bg-slate-900/35 lg:hidden"
                  onClick={() => setPeriodOpen(false)}
                  aria-hidden="true"
                />
                <div
                  role="menu"
                  aria-label="Choose period"
                  className="fixed inset-x-3 bottom-3 z-50 mx-auto max-h-[min(82dvh,620px)] w-auto max-w-[520px] overflow-y-auto overscroll-contain rounded-2xl border border-violet-100 bg-white p-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_16px_40px_rgba(80,65,130,0.28)] lg:absolute lg:inset-x-auto lg:bottom-auto lg:right-0 lg:top-[calc(100%+8px)] lg:z-30 lg:max-h-[min(80vh,620px)] lg:w-[320px] lg:max-w-[calc(100vw-2rem)] lg:overflow-y-auto lg:pb-2"
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
                      Dues and overdue are for bills dated in this period. Customers and advances
                      always show current totals.
                    </p>

                    <Button
                      type="button"
                      onClick={() => setPeriodOpen(false)}
                      className="mt-3 h-11 w-full rounded-xl border border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-violet-50"
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
            disabled={refreshing}
            aria-label={refreshing ? "Refreshing dashboard" : "Refresh dashboard"}
            title={refreshing ? "Refreshing dashboard" : "Refresh dashboard"}
            className="h-11 w-full justify-center gap-2 rounded-xl border border-violet-200 bg-white/90 px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-violet-50 sm:w-auto sm:px-4"
          >
            <RefreshCw
              className={`h-4 w-4 shrink-0 ${refreshing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
          </Button>

          <Button
            asChild
            variant="outline"
            className="h-11 w-full justify-center gap-2 rounded-xl border border-violet-200 bg-white/90 px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-violet-50 sm:w-auto sm:px-4"
          >
            <Link to="/bills">
              <Receipt className="h-4 w-4" aria-hidden="true" />
              All bills
            </Link>
          </Button>

          <Button
            asChild
            className="h-11 w-full justify-center gap-2 rounded-xl border border-violet-200 bg-white/90 px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-violet-50 sm:w-auto sm:px-4"
          >
            <Link to="/bills/new">
              <Plus className="h-5 w-5" aria-hidden="true" />
              Create bill
            </Link>
          </Button>
        </div>
      </header>

      {/* ERROR */}

      {loadError && (
        <div
          role="alert"
          className="flex flex-col items-stretch justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 sm:flex-row sm:items-center"
        >
          <div className="flex min-w-0 items-start gap-2 text-sm text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Could not load your latest figures. Check your connection and try again.
              <span className="ml-1 text-xs text-rose-500">({loadError})</span>
            </span>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => loadDashboard()}
            className="h-11 w-full shrink-0 rounded-xl border border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-violet-50 sm:w-auto"
          >
            Try again
          </Button>
        </div>
      )}

      {/* ATTENTION BANNER */}

      {!loadError && stats.overdueBillCount > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 text-sm text-amber-900">
            <BellRing className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <strong className="font-bold">{formatCurrency(stats.overdue)}</strong> is overdue
              across {stats.overdueBillCount} {stats.overdueBillCount === 1 ? "bill" : "bills"}.
              Send a reminder to get paid sooner.
            </span>
          </div>

          <Button
            asChild
            size="sm"
            className="shrink-0 gap-2 h-11 rounded-xl border border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-violet-50"
          >
            <Link to="/reminders">
              Send reminders
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      )}

      {/* FINANCIAL OVERVIEW */}

      <section
        aria-label="Financial overview"
        className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 2xl:grid-cols-4"
      >
        <SummaryCard
          label={`Sales (${shortLabel})`}
          value={formatCurrency(stats.totalSales)}
          detail={`${stats.bills} ${stats.bills === 1 ? "bill" : "bills"} created`}
          icon={Wallet}
          tone="green"
          footer={
            <DeltaBadge current={stats.totalSales} previous={stats.prevSales} label={previousLabel} />
          }
        />

        <SummaryCard
          label={`Received (${shortLabel})`}
          value={formatCurrency(stats.totalReceived)}
          detail={
            stats.totalRefunded > 0
              ? `After ${formatCurrency(stats.totalRefunded)} refunds`
              : "Payments recorded"
          }
          icon={ArrowDownLeft}
          tone="blue"
          footer={
            <DeltaBadge
              current={stats.totalReceived}
              previous={stats.prevReceived}
              label={previousLabel}
            />
          }
        />

        <SummaryCard
          label={`Outstanding dues (${shortLabel})`}
          value={formatCurrency(stats.outstanding)}
          detail={`${stats.pendingBillCount} ${stats.pendingBillCount === 1 ? "bill" : "bills"} unpaid`}
          icon={IndianRupee}
          tone="pink"
        />

        <SummaryCard
          label={`Overdue (${shortLabel})`}
          value={formatCurrency(stats.overdue)}
          detail={`${stats.overdueBillCount} ${stats.overdueBillCount === 1 ? "bill" : "bills"} past due date`}
          icon={Clock3}
          tone="purple"
        />
      </section>

      {/* BUSINESS STATISTICS */}

      <section
        aria-label="Business statistics"
        className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 2xl:grid-cols-4"
      >
        <CompactStat
          label="Active customers"
          value={stats.customers.toLocaleString("en-IN")}
          icon={Users}
          tone="purple"
        />

        <CompactStat
          label={`Bills (${shortLabel})`}
          value={stats.bills.toLocaleString("en-IN")}
          icon={FileText}
          tone="blue"
        />

        <CompactStat
          label="Customer advances"
          value={formatCurrency(stats.advances)}
          detail="Current balance"
          icon={Layers}
          tone="purple"
        />

        <CompactStat
          label={`Refunds (${shortLabel})`}
          value={formatCurrency(stats.totalRefunded)}
          detail="Paid back to customers"
          icon={CircleAlert}
          tone="pink"
        />
      </section>

      {/* MAIN CONTENT */}

      <section className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)] 2xl:gap-5">
        <div className="min-w-0 space-y-4">
          {/* SALES TREND */}

          <Card className={cardClass}>
            <SectionHeader
              icon={BarChart3}
              title="Sales trend"
              description={chartLabel ? `Sales vs received · ${chartLabel}` : "Sales vs received"}
              action={
                <div className="hidden shrink-0 items-center gap-3 text-[11px] font-semibold text-slate-600 sm:flex">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" aria-hidden="true" />
                    Sales
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-blue-400" aria-hidden="true" />
                    Received
                  </span>
                </div>
              }
            />

            {trend.length === 0 && extrasLoading ? (
              <div className="p-5" aria-busy="true">
                <Skeleton className="h-[250px] w-full rounded-2xl" />
              </div>
            ) : trend.length === 0 ? (
              <EmptyNote
                icon={BarChart3}
                title="Trend is not available"
                description="The chart could not be loaded. Try refreshing the dashboard."
              />
            ) : trendSummary.totalSales === 0 && trendSummary.totalReceived === 0 ? (
              <EmptyNote
                icon={BarChart3}
                title="No activity in this range"
                description="Create a bill or record a payment to see your trend here."
              />
            ) : (
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="grid min-w-0 grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
                    <p className="text-[11px] font-semibold text-emerald-800">Total sales</p>
                    <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                      {formatCurrency(trendSummary.totalSales)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3">
                    <p className="text-[11px] font-semibold text-blue-800">Total received</p>
                    <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                      {formatCurrency(trendSummary.totalReceived)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3">
                    <p className="text-[11px] font-semibold text-violet-800">Best day</p>
                    <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                      {trendSummary.best ? formatCurrency(trendSummary.best.sales) : "—"}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {trendSummary.best
                        ? `${formatDate(trendSummary.best.date)} · avg ${formatCurrency(trendSummary.average)}/day`
                        : "No sales yet"}
                    </p>
                  </div>
                </div>

                <TrendChart data={trend} />
              </CardContent>
            )}
          </Card>

          {/* RECENT BILLS */}

          <Card className={cardClass}>
            <SectionHeader
              icon={Receipt}
              title="Recent bills"
              description={`Newest first · ${shortLabel}`}
              action={
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-2 h-11 rounded-xl border border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-violet-50"
                >
                  <Link to="/bills">
                    View all
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              }
            />

            {recentBills.length === 0 && recentLoading ? (
              <div className="space-y-3 p-5" aria-busy="true">
                {Array.from({ length: RECENT_PAGE_SIZE }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : recentBills.length === 0 ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center px-5 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
                  <Receipt className="h-7 w-7" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-sm font-bold text-slate-900">No bills in this period</h3>
                <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
                  Try another date range, or create a new bill.
                </p>
                <Button asChild className="mt-4 h-11 rounded-xl border border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-violet-50">
                  <Link to="/bills/new">
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                    Create bill
                  </Link>
                </Button>
              </div>
            ) : (
              <>
                <div
                  className={`overflow-x-auto px-3 pt-3 transition-opacity sm:px-4 ${
                    recentLoading ? "opacity-60" : "opacity-100"
                  }`}
                >
                  <table className="w-full min-w-[760px] text-left">
                    <caption className="sr-only">Recent bills</caption>
                    <thead>
                      <tr className="bg-[#f5f3fc] text-[11px] font-semibold text-slate-600">
                        <th scope="col" className="rounded-l-xl px-3 py-3">Customer</th>
                        <th scope="col" className="px-3 py-3">Bill no.</th>
                        <th scope="col" className="px-3 py-3">Date</th>
                        <th scope="col" className="px-3 py-3 text-right">Total</th>
                        <th scope="col" className="px-3 py-3 text-right">Due</th>
                        <th scope="col" className="px-3 py-3">Status</th>
                        <th scope="col" className="rounded-r-xl px-3 py-3 text-center">Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {recentBills.map((bill, index) => {
                        const status = getPaymentStatus(bill.payment_status, bill.amount_due)
                        const StatusIcon = status.icon
                        const name = bill.customers?.name || "Walk-in Customer"
                        const due = num(bill.amount_due)

                        return (
                          <tr
                            key={bill.id}
                            className="border-b border-[#eeecf5] transition-colors last:border-0 hover:bg-[#f9f8ff]"
                          >
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2.5">
                                <CustomerAvatar
                                  name={name}
                                  photoUrl={bill.customers?.photo_url}
                                  className={`h-9 w-9 text-xs ${
                                    AVATAR_COLORS[index % AVATAR_COLORS.length]
                                  }`}
                                />
                                <span className="max-w-[150px] truncate text-[12px] font-bold text-slate-800">
                                  {name}
                                </span>
                              </div>
                            </td>

                            <td className="whitespace-nowrap px-3 py-3 text-xs font-medium text-slate-600">
                              {bill.bill_number || "—"}
                            </td>

                            <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">
                              {bill.bill_date ? formatDate(bill.bill_date) : "—"}
                            </td>

                            <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-bold tabular-nums text-slate-900">
                              {formatCurrency(bill.grand_total)}
                            </td>

                            <td
                              className={`whitespace-nowrap px-3 py-3 text-right text-xs font-semibold tabular-nums ${
                                due > 0 ? "text-rose-600" : "text-slate-400"
                              }`}
                            >
                              {due > 0 ? formatCurrency(due) : "—"}
                            </td>

                            <td className="px-3 py-3">
                              <span
                                className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1.5 text-[10px] font-bold ${status.className}`}
                              >
                                <StatusIcon className="h-3 w-3" aria-hidden="true" />
                                {status.label}
                              </span>
                            </td>

                            <td className="px-3 py-3">
                              <Link
                                to={`/bills/${bill.id}`}
                                aria-label={`View bill ${bill.bill_number || ""} for ${name}`}
                                className="mx-auto flex h-8 w-[68px] items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-white text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                              >
                                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                                View
                              </Link>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col gap-3 border-t border-[#eeecf5] bg-white/60 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <p className="text-xs font-medium text-slate-600" aria-live="polite">
                    Showing{" "}
                    <span className="font-semibold text-slate-800">
                      {showingFrom}–{showingTo}
                    </span>{" "}
                    of{" "}
                    <span className="font-semibold text-slate-800">
                      {recentCount.toLocaleString("en-IN")}
                    </span>{" "}
                    bills
                  </p>

                  <nav
                    aria-label="Recent bills pages"
                    className="flex flex-wrap items-center justify-end gap-1.5"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Previous page"
                      disabled={recentPage <= 1 || recentLoading}
                      onClick={() => setRecentPage((page) => Math.max(1, page - 1))}
                      className="h-9 w-9 rounded-full border border-violet-200 bg-white p-0 text-slate-700 shadow-sm hover:bg-violet-50 disabled:opacity-40"
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
                          variant={recentPage === item ? "default" : "outline"}
                          aria-label={`Page ${item}`}
                          aria-current={recentPage === item ? "page" : undefined}
                          disabled={recentLoading}
                          onClick={() => setRecentPage(item)}
                          className={`h-9 min-w-9 rounded-full px-0 text-xs font-semibold shadow-sm transition-colors ${
                            recentPage === item
                              ? "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
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
                      disabled={recentPage >= totalRecentPages || recentLoading}
                      onClick={() => setRecentPage((page) => Math.min(totalRecentPages, page + 1))}
                      className="h-9 w-9 rounded-full border border-violet-200 bg-white p-0 text-slate-700 shadow-sm hover:bg-violet-50 disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </nav>
                </div>
              </>
            )}
          </Card>

          {/* BUSINESS PERFORMANCE */}

          <section
            aria-label="Business performance"
            className="overflow-hidden rounded-[22px] border border-white/90 bg-white/90 shadow-[0_6px_22px_rgba(80,65,130,0.07)] backdrop-blur-sm"
          >
            <SectionHeader
              icon={TrendingUp}
              title="Business performance"
              description="How much of your billing has been collected."
              action={
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-2 h-11 rounded-xl border border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-violet-50"
                >
                  <Link to="/bills">
                    Review bills
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              }
            />

            <div className="grid min-w-0 grid-cols-1 gap-4 p-3 sm:p-5">
              {/* COLLECTION RATE */}
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-emerald-800">Collection rate</p>
                    <p className="mt-2 text-[30px] font-extrabold leading-none tracking-tight text-slate-900 tabular-nums">
                      {collectionRate}%
                    </p>
                    <p className="mt-1.5 text-xs text-slate-600">
                      {formatCurrency(collectedAmount)} collected out of{" "}
                      {formatCurrency(stats.totalSales)} billed
                    </p>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm">
                    <Wallet className="h-5 w-5" aria-hidden="true" />
                  </div>
                </div>

                <div
                  className="mt-5 h-2.5 overflow-hidden rounded-full bg-rose-100"
                  role="progressbar"
                  aria-label="Collection rate"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={collectionRate}
                >
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all duration-500"
                    style={{ width: `${collectionRate}%` }}
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-600" aria-hidden="true" />
                    <span className="text-slate-600">Collected</span>
                    <span className="font-bold tabular-nums text-slate-900">
                      {formatCurrency(collectedAmount)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" />
                    <span className="text-slate-600">Still to collect</span>
                    <span className="font-bold tabular-nums text-rose-600">
                      {formatCurrency(stats.outstanding)}
                    </span>
                  </div>
                </div>
              </div>

              {/* METRICS */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <MetricTile
                  icon={Receipt}
                  iconClass="bg-blue-50 text-blue-700"
                  label="Average bill value"
                  value={formatCurrency(averageBillValue)}
                  note={`Across ${stats.bills.toLocaleString("en-IN")} bills`}
                />

                <MetricTile
                  icon={FileText}
                  iconClass="bg-amber-50 text-amber-700"
                  label="Bills with dues"
                  value={stats.pendingBillCount.toLocaleString("en-IN")}
                  note="Not fully paid yet"
                />

                <MetricTile
                  icon={Clock3}
                  iconClass="bg-rose-50 text-rose-700"
                  label="Overdue bills"
                  value={stats.overdueBillCount.toLocaleString("en-IN")}
                  valueClass="text-rose-600"
                  note={`${formatCurrency(stats.overdue)} past due date`}
                />

                <MetricTile
                  icon={Users}
                  iconClass="bg-violet-50 text-violet-700"
                  label="Customers with dues"
                  value={pendingCustomers.length >= 5 ? "5+" : pendingCustomers.length}
                  note="Top customers by amount owed"
                />
              </div>
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN */}

        <div className="space-y-4">
          {/* QUICK ACTIONS */}

          <Card className={cardClass}>
            <SectionHeader icon={Zap} title="Quick actions" description="Jump straight to common tasks." />

            <CardContent className="grid grid-cols-1 gap-2.5 p-3 sm:grid-cols-2 sm:p-4">
              <QuickAction
                title="Create bill"
                description="Make a new bill"
                icon={Plus}
                to="/bills/new"
                tone="green"
              />
              <QuickAction
                title="Customers"
                description="View or add customers"
                icon={UserPlus}
                to="/customers"
                tone="blue"
              />
              <QuickAction
                title="Items"
                description="Manage your items"
                icon={Box}
                to="/items"
                tone="purple"
              />
              <QuickAction
                title="Reminders"
                description="Send payment reminders"
                icon={Bell}
                to="/reminders"
                tone="amber"
              />
            </CardContent>
          </Card>

          {/* BUSINESS SUMMARY */}

          <Card className={cardClass}>
            <SectionHeader
              icon={TrendingUp}
              title="Business summary"
              description="Your khata at a glance."
            />

            <CardContent className="px-5 py-1">
              <BusinessSummaryRow
                label={`Sales (${shortLabel})`}
                value={formatCurrency(stats.totalSales)}
                icon={Receipt}
                tone="blue"
              />
              <BusinessSummaryRow
                label={`Received, net of refunds (${shortLabel})`}
                value={formatCurrency(stats.totalReceived)}
                icon={Wallet}
                tone="green"
              />
              <BusinessSummaryRow
                label={`Outstanding (${shortLabel})`}
                value={formatCurrency(stats.outstanding)}
                icon={CircleAlert}
                tone="pink"
              />
              <BusinessSummaryRow
                label="Customer advances"
                value={formatCurrency(stats.advances)}
                icon={ArrowDownLeft}
                tone="purple"
              />
            </CardContent>
          </Card>

          {/* PAYMENT MODES */}

          <Card className={cardClass}>
            <SectionHeader
              icon={PieChart}
              title="Payment modes"
              description={`How money came in · ${shortLabel}`}
            />

            {paymentModes.length === 0 ? (
              <EmptyNote
                icon={CreditCard}
                title="No payments in this period"
                description="Payments will be grouped by cash, UPI, card and more."
              />
            ) : (
              <CardContent className="space-y-4 p-5">
                <div
                  className="flex h-3 overflow-hidden rounded-full bg-slate-100"
                  role="img"
                  aria-label="Share of each payment mode"
                >
                  {paymentModes.map((item, index) => (
                    <div
                      key={item.mode}
                      className={MODE_COLORS[index % MODE_COLORS.length]}
                      style={{ width: `${modesTotal > 0 ? (item.amount / modesTotal) * 100 : 0}%` }}
                    />
                  ))}
                </div>

                <ul className="space-y-3">
                  {paymentModes.map((item, index) => {
                    const percent = modesTotal > 0 ? (item.amount / modesTotal) * 100 : 0
                    return (
                      <li key={item.mode} className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${MODE_COLORS[index % MODE_COLORS.length]}`}
                            aria-hidden="true"
                          />
                          <span className="truncate text-[13px] font-medium text-slate-700">
                            {item.mode}
                          </span>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[13px] font-bold tabular-nums text-slate-900">
                            {formatCurrency(item.amount)}
                          </p>
                          <p className="text-[11px] text-slate-500">{percent.toFixed(0)}%</p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            )}
          </Card>

          {/* DUES AGING */}

          <Card className={cardClass}>
            <SectionHeader
              icon={Hourglass}
              title="Dues aging"
              description={`How late unpaid bills are · ${shortLabel}`}
            />

            {agingTotal === 0 ? (
              <EmptyNote
                icon={CheckCircle2}
                title="Nothing pending"
                description="No unpaid bills for this period."
              />
            ) : (
              <CardContent className="space-y-4 p-5">
                {AGING_BUCKETS.map((bucket) => {
                  const item = aging[bucket.key]
                  const percent = agingTotal > 0 ? (item.amount / agingTotal) * 100 : 0
                  return (
                    <div key={bucket.key}>
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-slate-700">{bucket.label}</p>
                          <p className="text-[11px] text-slate-500">
                            {item.count} {item.count === 1 ? "bill" : "bills"}
                          </p>
                        </div>
                        <p className="shrink-0 text-[13px] font-bold tabular-nums text-slate-900">
                          {formatCurrency(item.amount)}
                        </p>
                      </div>
                      <div
                        className="h-2 overflow-hidden rounded-full bg-slate-100"
                        role="progressbar"
                        aria-label={bucket.label}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(percent)}
                      >
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${bucket.bar}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            )}
          </Card>

          {/* PENDING PAYMENTS */}

          <Card className={cardClass}>
            <SectionHeader
              icon={Clock3}
              title="Pending payments"
              description="Customers who owe you the most."
              action={
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-2 h-11 rounded-xl border border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-violet-50"
                >
                  <Link to="/dues">
                    View all
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              }
            />

            {pendingCustomers.length === 0 ? (
              <div className="flex items-center gap-3 px-5 py-8">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">All payments are clear</p>
                  <p className="mt-1 text-xs text-slate-500">No customer owes you anything.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="mx-4 mt-4 rounded-xl border border-rose-100 bg-rose-50/70 px-4 py-3">
                  <p className="text-xs font-semibold text-rose-600">Total pending amount</p>
                  <p className="mt-1 text-xl font-bold tracking-tight tabular-nums text-rose-700">
                    {formatCurrency(stats.outstanding)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-rose-600/80">
                    Top {pendingCustomers.length} customers shown below
                  </p>
                </div>

                <ul className="divide-y divide-[#eeecf5]">
                  {pendingCustomers.map((customer, index) => (
                    <li
                      key={customer.key}
                      className="flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-[#faf9ff]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <CustomerAvatar
                          name={customer.name}
                          photoUrl={customer.photoUrl}
                          className="h-11 w-11"
                        />

                        <div className="min-w-0">
                          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                            <p className="truncate text-sm font-bold text-slate-800">{customer.name}</p>
                            {index === 0 && (
                              <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                                Highest due
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {customer.billCount} unpaid {customer.billCount === 1 ? "bill" : "bills"}
                            {customer.overdue > 0 && (
                              <span className="ml-1 font-semibold text-rose-600">
                                · {formatCurrency(customer.overdue)} overdue
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      <p className="shrink-0 text-right text-sm font-bold tabular-nums text-rose-600">
                        {formatCurrency(customer.due)}
                      </p>
                    </li>
                  ))}
                </ul>

                <div className="border-t border-[#eeecf5] px-5 py-3">
                  <Button
                    asChild
                    variant="outline"
                    className="h-11 w-full gap-2 rounded-xl border border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-violet-50"
                  >
                    <Link to="/dues">
                      Review all pending payments
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              </>
            )}
          </Card>

          {/* RECENT PAYMENTS */}

          <Card className={cardClass}>
            <SectionHeader
              icon={CreditCard}
              title="Recent payments"
              description="Latest money in and out."
            />

            {recentPayments.length === 0 ? (
              <EmptyNote
                icon={CreditCard}
                title={extrasLoading ? "Loading payments…" : "No payments yet"}
                description={extrasLoading ? undefined : "Recorded payments will show up here."}
              />
            ) : (
              <ul className="divide-y divide-[#eeecf5]">
                {recentPayments.map((payment) => {
                  const refund = Boolean(payment.is_refund)
                  const name = payment.customers?.name || "Walk-in Customer"
                  const date = payment[PAYMENT_DATE_COLUMN]
                  const row = (
                    <>
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="relative shrink-0">
                          <CustomerAvatar
                            name={name}
                            photoUrl={payment.customers?.photo_url}
                            className="h-10 w-10"
                          />
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-white ${
                              refund ? "bg-rose-500 text-white" : "bg-emerald-600 text-white"
                            }`}
                            aria-label={refund ? "Refund" : "Payment received"}
                          >
                            <ArrowDownLeft
                              className={`h-2.5 w-2.5 ${refund ? "rotate-180" : ""}`}
                              aria-hidden="true"
                            />
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-bold text-slate-800">{name}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {payment.payment_mode || "Payment"}
                            {date ? ` · ${formatDate(String(date).slice(0, 10))}` : ""}
                          </p>
                        </div>
                      </div>
                      <p
                        className={`shrink-0 text-sm font-bold tabular-nums ${
                          refund ? "text-rose-600" : "text-emerald-700"
                        }`}
                      >
                        {refund ? "-" : "+"}
                        {formatCurrency(payment.amount)}
                      </p>
                    </>
                  )

                  const rowClass =
                    "flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-[#faf9ff]"

                  return (
                    <li key={payment.id}>
                      {payment.bill_id ? (
                        <Link to={`/bills/${payment.bill_id}`} className={rowClass}>
                          {row}
                        </Link>
                      ) : (
                        <div className={rowClass}>{row}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
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
    </div>
  )
}