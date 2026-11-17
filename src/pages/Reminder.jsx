import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import { cn, formatCurrency, formatDate } from "@/lib/utils"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

import {
  AlertCircle,
  Bell,
  BellRing,
  CalendarClock,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Copy,
  CreditCard,
  Download,
  Eye,
  Filter,
  History,
  IndianRupee,
  Loader2,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Store,
  Wallet,
  X,
  FileText,
  MapPin,
  User,
  Receipt,
  ExternalLink,
  Mail,
  Building2,
  Fingerprint,
  Landmark,
  Globe2,
  UserRound,
  Plus,
  Check,
  Trash2,
} from "lucide-react"

import { toast } from "sonner"

/* ==================================================
   CONFIG
================================================== */

const PAGE_SIZE = 10
const FETCH_BATCH = 1000
const AUTO_REFRESH_MS = 120000
const REMINDER_TABLE = "reminders"

// ✅ Aapki schema ke hisaab se mapping
const CUSTOMER_MOBILE_COLUMN = "mobile"
const CUSTOMER_WHATSAPP_COLUMN = "whatsapp"

const DATE_PRESETS = [
  { mode: "today", label: "Today" },
  { mode: "yesterday", label: "Yesterday" },
  { mode: "week", label: "Last 7 days" },
  { mode: "month", label: "This month" },
]

function shiftDate(dateStr, days) {
  const [year, month, day] = dateStr.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

const EMPTY_STATS = {
  totalDue: 0,
  overdueDue: 0,
  overdueCount: 0,
  upcomingDue: 0,
  upcomingCount: 0,
  customersWithDue: 0,
  remindersSent: 0,
  remindersToday: 0,
}

const cardClass =
  "overflow-hidden rounded-[20px] border border-white/80 bg-white/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)] backdrop-blur-sm"

const BTN =
  "inline-flex h-11 min-w-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm transition-all hover:-translate-y-px hover:border-violet-300 hover:bg-violet-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
const BTN_SM = "h-10 px-3 text-xs font-semibold"
const ICON_BTN =
  "inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-violet-200 bg-white p-0 text-slate-700 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-amber-100 text-amber-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
  "bg-violet-100 text-violet-700",
]

const TEMPLATES = [
  {
    id: "friendly",
    name: "Friendly nudge",
    build: (name, amount) =>
      `Hi ${name}, just a gentle reminder about your pending balance of ${amount} with us. Whenever you get a moment, it would be great to clear it. Thank you so much!`,
  },
  {
    id: "firm",
    name: "Firm follow-up",
    build: (name, amount) =>
      `Hello ${name}, this is a follow-up regarding your outstanding balance of ${amount}. We would appreciate it if this could be settled at the earliest. Please reach out if you need any clarification.`,
  },
  {
    id: "overdue",
    name: "Overdue notice",
    build: (name, amount) =>
      `Dear ${name}, your payment of ${amount} is now overdue. Kindly make the payment at your earliest convenience. Thank you for your prompt attention.`,
  },
  {
    id: "final",
    name: "Final reminder",
    build: (name, amount) =>
      `Dear ${name}, this is a final reminder for your outstanding amount of ${amount}. Please settle the balance immediately. Feel free to contact us if you have any concerns.`,
  },
]

/** Rich default message with bill-level detail (used when user leaves message empty) */
function buildDetailedDefaultMessage(customer, shopName = "") {
  const firstName = String(customer?.name || "Customer").split(" ")[0] || "Customer"
  const amount = formatCurrency(customer?.due || 0)
  const shopText = shopName ? ` from ${shopName}` : ""
  const bills = Array.isArray(customer?.bills) ? customer.bills : []

  let billBlock = ""
  if (bills.length > 0) {
    const lines = bills.slice(0, 8).map((b) => {
      const due = b.due_date ? ` · due ${formatDate(b.due_date)}` : ""
      return `• ${b.bill_number || "Bill"}: ${formatCurrency(b.amount_due)}${due}`
    })
    if (bills.length > 8) lines.push(`• …and ${bills.length - 8} more`)
    billBlock = "\n\nPending bills:\n" + lines.join("\n")
  }

  const overdueNote =
    customer?.overdue > 0
      ? `\n\nOf this, ${formatCurrency(customer.overdue)} is already overdue. Kindly prioritise settlement.`
      : ""

  return (
    `Namaste ${firstName},${shopText}\n\n` +
    `This is a friendly reminder that your pending balance of *${amount}* is still outstanding.` +
    billBlock +
    overdueNote +
    `\n\nPlease clear the dues at your earliest convenience. If you have already paid, kindly share the payment details so we can update our records.\n\nThank you for your business!`
  )
}

/* ==================================================
   HELPERS
================================================== */

const num = (value) => Number(value) || 0

function getLocalDateString() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

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

function timeAgo(date, now) {
  if (!date) return ""
  const seconds = Math.max(0, Math.round((now - date.getTime()) / 1000))
  if (seconds < 45) return "just now"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} d ago`
  return `${Math.round(days / 30)} mo ago`
}

function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
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

// ✅ Best phone number pick karo — whatsapp first, phir mobile
function pickPhone(customer) {
  if (!customer) return ""
  const wa = customer[CUSTOMER_WHATSAPP_COLUMN]
  if (typeof wa === "string" && wa.trim()) return wa.trim()
  const mob = customer[CUSTOMER_MOBILE_COLUMN]
  if (typeof mob === "string" && mob.trim()) return mob.trim()
  return ""
}

/* ==================================================
   DashButton — TOP pe, sabse pehle
================================================== */

function DashButton({ className, small = false, ...props }) {
  return <Button variant="outline" className={cn(BTN, small && BTN_SM, className)} {...props} />
}

/* ==================================================
   AVATAR
================================================== */

function CustomerAvatar({ name, photoUrl, className = "h-10 w-10", index = 0 }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [photoUrl])

  return (
    <div
      aria-label={`${name || "Customer"} profile`}
      role="img"
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-bold ${AVATAR_COLORS[index % AVATAR_COLORS.length]} ${className}`}
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

/* ==================================================
   UI PRIMITIVES
================================================== */

function SelectCheckbox({ checked, onChange, label }) {
  return (
    <label className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-violet-50 focus-within:ring-2 focus-within:ring-violet-500" aria-label={label}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
        aria-label={label}
      />
      <span className={cn(
        "flex h-[18px] w-[18px] items-center justify-center rounded-md border transition-all",
        checked
          ? "border-violet-600 bg-violet-600 text-white shadow-sm"
          : "border-slate-300 bg-white text-transparent peer-hover:border-violet-400"
      )}>
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    </label>
  )
}

function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />
}

function SummaryCard({ label, value, detail, icon: Icon, tone = "green", badge }) {
  const tones = {
    green: { icon: "bg-emerald-100/80 text-emerald-700", accent: "text-emerald-700" },
    blue: { icon: "bg-blue-100/80 text-blue-700", accent: "text-blue-700" },
    pink: { icon: "bg-pink-100/80 text-pink-700", accent: "text-pink-700" },
    purple: { icon: "bg-violet-100/80 text-violet-700", accent: "text-violet-700" },
    amber: { icon: "bg-amber-100/80 text-amber-700", accent: "text-amber-700" },
  }
  const style = tones[tone]

  return (
    <Card className="overflow-hidden rounded-[20px] border border-white/80 bg-white/80 shadow-[0_4px_15px_rgba(80,65,130,0.07)] backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_10px_26px_rgba(80,65,130,0.12)]">
      <CardContent className="flex min-w-0 items-center gap-4 p-4 sm:p-5">
        <div className={`flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full ${style.icon}`}>
          <Icon className="h-7 w-7" strokeWidth={1.9} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-slate-600">{label}</p>
          <h3 className="mt-1.5 break-words text-[23px] font-bold leading-tight tracking-tight text-[#151934] tabular-nums">
            {value}
          </h3>
          <p className={`mt-1.5 flex items-center gap-1.5 text-xs font-semibold ${style.accent}`}>
            {badge && <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px]">{badge}</span>}
            {detail}
          </p>
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

function EmptyNote({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
        <Icon className="h-7 w-7" aria-hidden="true" />
      </div>
      <p className="mt-3 text-sm font-bold text-slate-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

function DueStatusBadge({ dueDate, today }) {
  if (!dueDate) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-600">
        <Clock3 className="h-3 w-3" aria-hidden="true" />
        No due date
      </span>
    )
  }
  const diff = daysBetween(today, dueDate)
  if (diff < 0) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-rose-200 bg-rose-100 px-2.5 py-1.5 text-[10px] font-bold text-rose-700">
        <CircleAlert className="h-3 w-3" aria-hidden="true" />
        {Math.abs(diff)}d overdue
      </span>
    )
  }
  if (diff === 0) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1.5 text-[10px] font-bold text-amber-700">
        <Clock3 className="h-3 w-3" aria-hidden="true" />
        Due today
      </span>
    )
  }
  if (diff <= 7) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-blue-200 bg-blue-100 px-2.5 py-1.5 text-[10px] font-bold text-blue-700">
        <CalendarClock className="h-3 w-3" aria-hidden="true" />
        In {diff}d
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1.5 text-[10px] font-bold text-emerald-700">
      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
      {formatDate(dueDate)}
    </span>
  )
}

/* ==================================================
   SINGLE REMINDER MODAL
================================================== */

function ReminderModal({ customer, onClose, onSent, shopName = "" }) {
  const [channel, setChannel] = useState("whatsapp")
  const [message, setMessage] = useState("")
  const [templateId, setTemplateId] = useState("detailed")
  const [sending, setSending] = useState(false)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!customer) return
    // Pre-fill with detailed default so user sees what will go out
    setMessage(buildDetailedDefaultMessage(customer, shopName))
    setTemplateId("detailed")
    setChannel(customer.phone ? "whatsapp" : "sms")
    setTouched(false)
  }, [customer, shopName])

  if (!customer) return null

  const hasPhone = Boolean(customer.phone)
  const firstName = String(customer.name || "").split(" ")[0] || "Customer"

  const applyTemplate = (id) => {
    if (id === "detailed") {
      setTemplateId("detailed")
      setMessage(buildDetailedDefaultMessage(customer, shopName))
      setTouched(false)
      return
    }
    const tpl = TEMPLATES.find((t) => t.id === id)
    if (!tpl) return
    setTemplateId(id)
    setMessage(tpl.build(firstName, formatCurrency(customer.due)))
    setTouched(true)
  }

  const handleCopy = async () => {
    const finalMsg = message.trim() || buildDetailedDefaultMessage(customer, shopName)
    try {
      await navigator.clipboard.writeText(finalMsg)
      toast.success("Message copied")
    } catch {
      toast.error("Could not copy message")
    }
  }

  const handleSend = async () => {
    // Empty / whitespace-only → detailed default
    const finalMessage =
      message.trim().length > 0
        ? message.trim()
        : buildDetailedDefaultMessage(customer, shopName)

    setSending(true)
    try {
      try {
        await supabase.from(REMINDER_TABLE).insert({
          shop_id: customer.shopId,
          customer_id: customer.customerId,
          amount: customer.due,
          channel,
          message: finalMessage,
          status: "sent",
        })
      } catch (logErr) {
        console.warn("Reminder log skipped:", logErr?.message)
      }

      if (channel === "whatsapp" && customer.phone) {
        const digits = String(customer.phone).replace(/\D/g, "")
        const phone = digits.length === 10 ? `91${digits}` : digits
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(finalMessage)}`
        window.open(url, "_blank")
      } else if (channel === "sms" && customer.phone) {
        window.open(`sms:${customer.phone}?body=${encodeURIComponent(finalMessage)}`, "_blank")
      }

      toast.success("Reminder ready", {
        description: `${customer.name} · ${channel}${!message.trim() ? " (default detailed message)" : ""}`,
      })
      onSent?.()
      onClose()
    } catch (error) {
      console.error("Reminder send failed:", error)
      toast.error("Could not send reminder", { description: error?.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reminder-modal-title"
        className="relative z-10 flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-[0_20px_60px_rgba(80,65,130,0.3)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#eae7f4] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <BellRing className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 id="reminder-modal-title" className="truncate text-sm font-bold text-slate-900">
                Send reminder
              </h3>
              <p className="truncate text-xs text-slate-500">
                {customer.name} ·{" "}
                <span className="font-semibold text-rose-600">{formatCurrency(customer.due)}</span> pending
                {customer.billCount > 0 && (
                  <span className="text-slate-400"> · {customer.billCount} bill{customer.billCount === 1 ? "" : "s"}</span>
                )}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className={ICON_BTN} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {/* Customer mini summary */}
          <div className="flex items-start gap-3 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
            <CustomerAvatar name={customer.name} photoUrl={customer.photoUrl} className="h-11 w-11" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-800">{customer.name}</p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                {customer.phone ? (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {customer.phone}
                  </span>
                ) : (
                  <span className="text-amber-600">No phone on file</span>
                )}
                {customer.oldestDue && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" />
                    Oldest due {formatDate(customer.oldestDue)}
                  </span>
                )}
              </div>
              {customer.overdue > 0 && (
                <p className="mt-1 text-[11px] font-semibold text-rose-600">
                  {formatCurrency(customer.overdue)} overdue
                </p>
              )}
            </div>
            <DueStatusBadge dueDate={customer.oldestDue} today={getLocalDateString()} />
          </div>

          {/* Channel */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              Channel
              {!hasPhone && (
                <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                  No phone number
                </span>
              )}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, disabled: !hasPhone },
                { key: "sms", label: "SMS", icon: Phone, disabled: !hasPhone },
              ].map((option) => {
                const Icon = option.icon
                const active = channel === option.key
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => !option.disabled && setChannel(option.key)}
                    disabled={option.disabled}
                    className={cn(
                      "flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all",
                      option.disabled && "cursor-not-allowed opacity-40",
                      active
                        ? "border-violet-300 bg-violet-50 text-violet-800"
                        : "border-violet-200 bg-white text-slate-600 hover:bg-violet-50"
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Templates */}
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-600">Message templates</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => applyTemplate("detailed")}
                className={cn(
                  "cursor-pointer rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all",
                  templateId === "detailed"
                    ? "border-violet-300 bg-violet-50 text-violet-900"
                    : "border-violet-100 bg-white text-slate-600 hover:border-violet-200 hover:bg-violet-50/50"
                )}
              >
                Detailed (default)
              </button>
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl.id)}
                  className={cn(
                    "cursor-pointer rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all",
                    templateId === tpl.id
                      ? "border-violet-300 bg-violet-50 text-violet-900"
                      : "border-violet-100 bg-white text-slate-600 hover:border-violet-200 hover:bg-violet-50/50"
                  )}
                >
                  {tpl.name}
                </button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-600">
                Message
                <span className="ml-1.5 font-normal text-slate-400">
                  (leave empty → detailed default is sent)
                </span>
              </p>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-violet-700 hover:text-violet-900"
              >
                <Copy className="h-3 w-3" />
                Copy
              </button>
            </div>
            <textarea
              value={message}
              onChange={(e) => {
                setMessage(e.target.value)
                setTouched(true)
                setTemplateId("custom")
              }}
              rows={7}
              placeholder="Type your reminder message… or leave blank for the detailed default."
              className="w-full resize-none rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm leading-6 text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            />
            <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
              <span>
                {message.trim().length === 0
                  ? "Will send detailed default message"
                  : "Custom message will be used"}
              </span>
              <span>{message.length} characters</span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[#eae7f4] bg-white/60 px-5 py-4">
          <DashButton type="button" onClick={onClose} disabled={sending}>
            Cancel
          </DashButton>
          <DashButton
            type="button"
            onClick={handleSend}
            disabled={sending || !hasPhone}
            className="border-violet-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Sending…" : "Send reminder"}
          </DashButton>
        </div>
      </div>
    </div>
  )
}

/* ==================================================
   CUSTOMER DETAIL DIALOG (View)
================================================== */

function CustomerDetailModal({ customer, onClose, onRemind, shopName = "" }) {
  if (!customer) return null

  const bills = Array.isArray(customer.bills)
    ? [...customer.bills].sort((a, b) => {
        const da = a.due_date || "9999"
        const db = b.due_date || "9999"
        return da.localeCompare(db)
      })
    : []
  const today = getLocalDateString()
  const paidPart = bills.reduce((t, b) => t + Math.max(0, num(b.grand_total) - num(b.amount_due)), 0)
  const totalBilled = bills.reduce((t, b) => t + num(b.grand_total), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-detail-title"
        className="relative z-10 flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-[0_20px_60px_rgba(80,65,130,0.3)]"
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#eae7f4] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <CustomerAvatar name={customer.name} photoUrl={customer.photoUrl} className="h-12 w-12 text-sm" />
            <div className="min-w-0">
              <h3 id="customer-detail-title" className="truncate text-base font-bold text-slate-900">
                {customer.name}
              </h3>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                {customer.phone ? (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {customer.phone}
                  </span>
                ) : (
                  <span className="text-amber-600">No phone on file</span>
                )}
                <DueStatusBadge dueDate={customer.oldestDue} today={today} />
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className={ICON_BTN} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {/* Amount summary */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Pending", value: formatCurrency(customer.due), tone: "text-rose-600" },
              { label: "Overdue", value: formatCurrency(customer.overdue || 0), tone: "text-amber-700" },
              { label: "Unpaid bills", value: String(customer.billCount || bills.length), tone: "text-slate-800" },
              {
                label: "Oldest due",
                value: customer.oldestDue ? formatDate(customer.oldestDue) : "—",
                tone: "text-slate-800",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-violet-100 bg-violet-50/30 px-3 py-2.5"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {item.label}
                </p>
                <p className={cn("mt-1 text-sm font-bold tabular-nums", item.tone)}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* Contact & meta */}
          <div className="rounded-xl border border-[#ece9f5] bg-white p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Contact & activity</p>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[11px] text-slate-400">Mobile</dt>
                <dd className="mt-0.5 font-medium text-slate-800">{customer.mobile || customer.phone || "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-400">WhatsApp</dt>
                <dd className="mt-0.5 font-medium text-slate-800">{customer.whatsapp || customer.phone || "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-400">Last reminder</dt>
                <dd className="mt-0.5 font-medium text-slate-800">
                  {customer.lastReminder
                    ? new Date(customer.lastReminder).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Never sent"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-400">Latest bill date</dt>
                <dd className="mt-0.5 font-medium text-slate-800">
                  {customer.newestBillDate ? formatDate(customer.newestBillDate) : "—"}
                </dd>
              </div>
              {totalBilled > 0 && (
                <div>
                  <dt className="text-[11px] text-slate-400">Billed (these bills)</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">{formatCurrency(totalBilled)}</dd>
                </div>
              )}
              {paidPart > 0 && (
                <div>
                  <dt className="text-[11px] text-slate-400">Already paid (partial)</dt>
                  <dd className="mt-0.5 font-medium text-emerald-700">{formatCurrency(paidPart)}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Full customer profile fields fetched from the customers table */}
          {customer.profileLoading && (
            <div className="flex items-center gap-2 rounded-xl border border-violet-100 bg-violet-50/40 p-3 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading complete customer profile…
            </div>
          )}
          {(() => {
            const p = customer.profile || customer
            const fields = [
              ["Email", p.email, Mail],
              ["Address", p.address || p.billing_address, MapPin],
              ["City", p.city, Building2],
              ["State", p.state, Globe2],
              ["PIN code", p.pincode || p.postal_code || p.zip_code, MapPin],
              ["GSTIN", p.gstin || p.gst_number, Fingerprint],
              ["Company", p.company_name || p.business_name, Building2],
              ["Customer type", p.customer_type || p.type, UserRound],
              ["PAN", p.pan_number || p.pan, Fingerprint],
              ["Website", p.website, Globe2],
              ["Notes", p.notes || p.description, Receipt],
            ].filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
            return fields.length ? (
              <div className="rounded-xl border border-[#ece9f5] bg-white p-4">
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Customer profile</p>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {fields.map(([label, value, Icon]) => (
                    <div key={label} className="flex min-w-0 items-start gap-2">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700"><Icon className="h-3.5 w-3.5" /></span>
                      <div className="min-w-0">
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</dt>
                        <dd className="mt-0.5 break-words text-sm font-medium text-slate-800">{String(value)}</dd>
                      </div>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null
          })()}

          {/* Bills list */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Unpaid bills ({bills.length})
              </p>
              {customer.customerId && (
                <Link
                  to={`/customers/${customer.customerId}`}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 hover:underline"
                  onClick={onClose}
                >
                  Full profile
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>

            {bills.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-500">
                No bill details loaded for this customer.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-[#ece9f5]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#f5f3fc] text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">Bill</th>
                      <th className="px-3 py-2">Dates</th>
                      <th className="px-3 py-2 text-right">Due</th>
                      <th className="px-3 py-2 text-center">Status</th>
                      <th className="px-3 py-2 text-center">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.map((b) => (
                      <tr key={b.id} className="border-t border-[#eeecf5] hover:bg-[#f9f8ff]">
                        <td className="px-3 py-2.5">
                          <p className="font-semibold text-slate-800">{b.bill_number || "—"}</p>
                          <p className="text-[10px] text-slate-400">{b.payment_status || "unpaid"}</p>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">
                          <p>Bill {formatDate(b.bill_date)}</p>
                          <p className="text-[10px] text-slate-400">
                            Due {b.due_date ? formatDate(b.due_date) : "—"}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold tabular-nums text-rose-600">
                          {formatCurrency(b.amount_due)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <DueStatusBadge dueDate={b.due_date} today={today} />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <Link
                            to={`/bills/${b.id}`}
                            className={cn(ICON_BTN, "inline-flex")}
                            title="Open bill"
                            onClick={onClose}
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#eae7f4] bg-white/60 px-5 py-4">
          <div className="flex flex-wrap gap-2">
            {customer.customerId && (
              <DashButton asChild small>
                <Link to={`/customers/${customer.customerId}`} onClick={onClose}>
                  <User className="h-4 w-4" />
                  Customer page
                </Link>
              </DashButton>
            )}
            <DashButton asChild small>
              <Link to="/dues" onClick={onClose}>
                <Wallet className="h-4 w-4" />
                All dues
              </Link>
            </DashButton>
          </div>
          <div className="flex gap-2">
            <DashButton type="button" onClick={onClose} small>
              Close
            </DashButton>
            <DashButton
              type="button"
              small
              disabled={!customer.phone}
              onClick={() => {
                onClose()
                onRemind?.(customer)
              }}
              className="border-violet-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50"
            >
              <Send className="h-4 w-4" />
              Send reminder
            </DashButton>
          </div>
        </div>
      </div>
    </div>
  )
}

function AddReminderModal({ customers, onClose, onChoose }) {
  const [query, setQuery] = useState("")
  const filtered = customers.filter((customer) =>
    `${customer.name} ${customer.phone || ""}`.toLowerCase().includes(query.trim().toLowerCase())
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:p-5">
      <div role="dialog" aria-modal="true" aria-labelledby="add-reminder-title"
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-violet-100 px-5 py-4 dark:border-slate-700">
          <div>
            <h2 id="add-reminder-title" className="text-base font-bold text-slate-900 dark:text-slate-100">Create payment reminder</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Choose a customer to prepare a new reminder</p>
          </div>
          <button type="button" onClick={onClose} className={ICON_BTN} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 overflow-y-auto p-4 sm:p-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="Search customer name or phone"
              className="h-11 w-full rounded-xl border border-violet-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-violet-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
          </div>
          <div className="max-h-[55dvh] space-y-2 overflow-y-auto">
            {filtered.map((customer, index) => (
              <button key={customer.key} type="button" onClick={() => onChoose(customer)}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-violet-300 hover:bg-violet-50/70 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700">
                <CustomerAvatar name={customer.name} photoUrl={customer.photoUrl} className="h-10 w-10" index={index} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{customer.name}</span>
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{customer.phone || "No phone number"} · {customer.billCount} unpaid bill(s)</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold text-rose-600">{formatCurrency(customer.due)}</span>
                  <span className="text-[10px] text-slate-500">Pending</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            ))}
            {filtered.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No matching customers found.</p>}
          </div>
        </div>
        <div className="flex justify-end border-t border-violet-100 px-5 py-4 dark:border-slate-700">
          <DashButton type="button" onClick={onClose}>Close</DashButton>
        </div>
      </div>
    </div>
  )
}

function BulkReminderModal({ customers, onClose, onSent }) {
  const [templateId, setTemplateId] = useState("friendly")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState(0)

  const total = customers.reduce((t, c) => t + c.due, 0)
  const withPhone = customers.filter((c) => c.phone)
  const withoutPhone = customers.filter((c) => !c.phone)

  useEffect(() => {
    const tpl = TEMPLATES.find((t) => t.id === "friendly")
    setMessage(tpl.build("{name}", "{amount}"))
  }, [])

  const applyTemplate = (id) => {
    const tpl = TEMPLATES.find((t) => t.id === id)
    if (!tpl) return
    setTemplateId(id)
    setMessage(tpl.build("{name}", "{amount}"))
  }

  const buildFor = (customer) => {
    const firstName = String(customer.name || "").split(" ")[0] || "Customer"
    return message
      .replace(/\{name\}/g, firstName)
      .replace(/\{amount\}/g, formatCurrency(customer.due))
  }

  const handleSend = async () => {
    setSending(true)
    setProgress(0)

    try {
      const records = customers.map((c) => ({
        shop_id: c.shopId,
        customer_id: c.customerId,
        amount: c.due,
        channel: "whatsapp",
        message: buildFor(c),
        status: c.phone ? "sent" : "skipped",
      }))

      try {
        await supabase.from(REMINDER_TABLE).insert(records)
      } catch (logErr) {
        console.warn("Bulk reminder log skipped:", logErr?.message)
      }

      withPhone.forEach((c, i) => {
        const text = buildFor(c)
        const url = `https://wa.me/${String(c.phone).replace(/\D/g, "")}?text=${encodeURIComponent(text)}`
        setTimeout(() => window.open(url, "_blank"), i * 250)
        setProgress(Math.round(((i + 1) / Math.max(1, withPhone.length)) * 100))
      })

      toast.success(`${withPhone.length} reminders opened`, {
        description:
          withoutPhone.length > 0
            ? `${withoutPhone.length} skipped (no phone).`
            : "WhatsApp tabs opened in your browser.",
      })
      onSent?.()
      onClose()
    } catch (error) {
      console.error("Bulk reminder failed:", error)
      toast.error("Could not send bulk reminders", { description: error?.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-[0_20px_60px_rgba(80,65,130,0.3)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#eae7f4] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700">
              <Send className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold text-slate-900">Send bulk reminders</h3>
              <p className="truncate text-xs text-slate-500">
                {customers.length} customers · {formatCurrency(total)} total
              </p>
            </div>
          </div>
          <button onClick={onClose} className={ICON_BTN} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-600">Sending to</p>
            <div className="max-h-40 overflow-y-auto rounded-xl border border-violet-100 bg-slate-50/50 p-2">
              {customers.slice(0, 20).map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs">
                  <div className="flex min-w-0 items-center gap-2">
                    <CustomerAvatar name={c.name} photoUrl={c.photoUrl} className="h-6 w-6 text-[10px]" />
                    <span className="truncate font-medium text-slate-700">{c.name}</span>
                    {!c.phone && (
                      <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-700">
                        no phone
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums text-rose-600">
                    {formatCurrency(c.due)}
                  </span>
                </div>
              ))}
              {customers.length > 20 && (
                <p className="px-2 py-1 text-center text-[11px] text-slate-500">
                  +{customers.length - 20} more
                </p>
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-slate-600">Template</p>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl.id)}
                  className={cn(
                    "cursor-pointer rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all",
                    templateId === tpl.id
                      ? "border-violet-300 bg-violet-50 text-violet-900"
                      : "border-violet-100 bg-white text-slate-600 hover:border-violet-200 hover:bg-violet-50/50"
                  )}
                >
                  {tpl.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-slate-600">
              Message{" "}
              <span className="font-normal text-slate-400">
                — use <code className="rounded bg-slate-100 px-1">{"{name}"}</code> and{" "}
                <code className="rounded bg-slate-100 px-1">{"{amount}"}</code>
              </span>
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            />
          </div>

          {customers[0] && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
              <p className="mb-1 text-[11px] font-semibold text-slate-700">
                Preview · {customers[0].name}
              </p>
              <p className="text-xs leading-5 text-slate-700">{buildFor(customers[0])}</p>
            </div>
          )}

          {sending && (
            <div>
              <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Sending…</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[#eae7f4] bg-white/60 px-5 py-4">
          <DashButton type="button" onClick={onClose} disabled={sending}>
            Cancel
          </DashButton>
          <DashButton
            type="button"
            onClick={handleSend}
            disabled={sending || !message.trim() || withPhone.length === 0}
            className="border-violet-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? `Sending ${progress}%` : `Send ${withPhone.length} reminder${withPhone.length === 1 ? "" : "s"}`}
          </DashButton>
        </div>
      </div>
    </div>
  )
}

/* ==================================================
   IMPORTANT BUSINESS NOTIFICATIONS
================================================== */

function notificationTone(eventType = "") {
  if (String(eventType).includes("overdue") || String(eventType).includes("deleted")) {
    return "border-rose-200 bg-rose-50/70 text-rose-700"
  }
  if (String(eventType).includes("due")) {
    return "border-amber-200 bg-amber-50/70 text-amber-700"
  }
  return "border-violet-200 bg-violet-50/70 text-violet-700"
}

function getNotificationEntityLabel(item) {
  const type = String(item?.entity_type || "").toLowerCase()
  const metadata = (() => {
    const value = item?.metadata
    if (!value) return {}
    if (typeof value === "object") return value
    if (typeof value === "string") {
      try { return JSON.parse(value) } catch { return {} }
    }
    return {}
  })()

  const candidates = [
    item?.entity_label,
    metadata.entity_label,
    metadata.entity_name,
    metadata.name,
    metadata.customer_name,
    metadata.bill_number,
    metadata.product_name,
    metadata.supplier_name,
    metadata.category_name,
    metadata.record?.name,
    metadata.record?.bill_number,
    metadata.old_record?.name,
    metadata.old_record?.bill_number,
  ]
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const actualName = candidates.find((value) => {
    if (typeof value !== "string") return false
    const clean = value.trim()
    return clean && !uuidPattern.test(clean) && !/^[0-9a-f-]{24,}$/i.test(clean)
  })
  if (actualName) return String(actualName).trim()

  const labels = {
    customer: "Customer record",
    bill: "Bill record",
    product: "Product record",
    item: "Item record",
    supplier: "Supplier record",
    category: "Category record",
    shop: "Shop record",
    payment: "Payment record",
    expense: "Expense record",
    reminder: "Reminder record",
  }
  return labels[type] || (type ? `${type.replaceAll("_", " ")} record` : "Business record")
}

function cleanNotificationText(value) {
  if (!value) return ""
  return String(value).replace(
    /\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\b/gi,
    "record"
  )
}

function notificationTime(value) {
  if (!value) return "Recently"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Recently"
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/* ==================================================
   MAIN PAGE
================================================== */

export default function Reminders() {
  const { currentShop } = useShop()
  const shopId = currentShop?.id
  const now = useNow()
  const rootRef = useRef(null)
  const searchRef = useRef(null)
  const today = getLocalDateString()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [lastUpdated, setLastUpdated] = useState(null)

  const [stats, setStats] = useState(EMPTY_STATS)
  const [rows, setRows] = useState([])
  const [dismissedCustomerKeys, setDismissedCustomerKeys] = useState([])
  const [notifications, setNotifications] = useState([])
  const [notificationFilter, setNotificationFilter] = useState("all")
  const [notificationBusy, setNotificationBusy] = useState(false)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selected, setSelected] = useState([])
  const [reminderTarget, setReminderTarget] = useState(null)
  const [viewTarget, setViewTarget] = useState(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [addReminderOpen, setAddReminderOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [customerToHide, setCustomerToHide] = useState(null)

  // Dashboard-style date selector; Overall is the default to preserve the full reminders list.
  const [period, setPeriod] = useState({ mode: "overall", from: "", to: "" })
  const [periodOpen, setPeriodOpen] = useState(false)
  const periodRef = useRef(null)

  const dateRange = useMemo(() => {
    switch (period.mode) {
      case "today": return { from: today, to: today }
      case "yesterday": {
        const yesterday = shiftDate(today, -1)
        return { from: yesterday, to: yesterday }
      }
      case "week": return { from: shiftDate(today, -6), to: today }
      case "month": return { from: `${today.slice(0, 8)}01`, to: today }
      case "custom": return { from: period.from || null, to: period.to || null }
      default: return { from: null, to: null }
    }
  }, [period, today])

  const periodLabel = (() => {
    if (period.mode === "overall") return "Overall (all time)"
    if (period.mode === "custom") {
      if (dateRange.from && dateRange.to) {
        return dateRange.from === dateRange.to
          ? formatDate(dateRange.from)
          : `${formatDate(dateRange.from)} – ${formatDate(dateRange.to)}`
      }
      if (dateRange.from) return `From ${formatDate(dateRange.from)}`
      if (dateRange.to) return `Up to ${formatDate(dateRange.to)}`
      return "All dates"
    }
    if (period.mode === "today") return `Today, ${formatDate(today)}`
    return DATE_PRESETS.find((item) => item.mode === period.mode)?.label || "Overall (all time)"
  })()

  const choosePeriod = (mode) => {
    setPeriod({ mode, from: "", to: "" })
    setPeriodOpen(false)
    setPage(1)
  }

  const changeCustomDate = (key, value) => {
    const next = { from: dateRange.from || "", to: dateRange.to || "", [key]: value }
    if (next.from && next.to && next.from > next.to) {
      if (key === "from") next.to = next.from
      else next.from = next.to
    }
    setPeriod({ mode: "custom", ...next })
    setPage(1)
  }

  const dismissedStorageKey = shopId ? `khaatapro:reminders:hidden-customers:${shopId}` : null

  // Page-only hide list: this never deletes or updates customer/bill records in Supabase.
  useEffect(() => {
    if (!dismissedStorageKey) {
      setDismissedCustomerKeys([])
      return
    }
    try {
      const saved = JSON.parse(window.localStorage.getItem(dismissedStorageKey) || "[]")
      setDismissedCustomerKeys(Array.isArray(saved) ? saved : [])
    } catch {
      setDismissedCustomerKeys([])
    }
    setSelected([])
    setPage(1)
  }, [dismissedStorageKey])

  const dismissCustomerFromPage = (row) => {
    const next = [...new Set([...dismissedCustomerKeys, row.key])]
    setDismissedCustomerKeys(next)
    setSelected((current) => current.filter((key) => key !== row.key))
    try {
      if (dismissedStorageKey) window.localStorage.setItem(dismissedStorageKey, JSON.stringify(next))
    } catch (error) {
      console.warn("Could not save hidden customer list:", error)
    }
    toast.success("Customer removed from this list")
    setCustomerToHide(null)
  }

  const requestRef = useRef(0)
  const hasLoaded = useRef(false)
  const lastRefreshAt = useRef(Date.now())

  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [])

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

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === "Escape") {
        setReminderTarget(null)
        setViewTarget(null)
        setBulkOpen(false)
        setAddReminderOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  /* ---------------- LOAD ---------------- */

  const loadData = useCallback(
    async (showRefresh = false) => {
      const requestId = ++requestRef.current

      if (!shopId) {
        setLoading(false)
        setRows([])
        setNotifications([])
        setStats(EMPTY_STATS)
        return
      }

      if (showRefresh || hasLoaded.current) setRefreshing(true)
      else setLoading(true)
      setLoadError("")

      try {
        // ✅ FIX: customers select mein `mobile`, `whatsapp` — `phone`/`email` NAHI
        const bills = await fetchAllRows(() =>
          supabase
            .from("bills")
            .select(
              "id, bill_number, bill_date, due_date, amount_due, grand_total, payment_status, customer_id, customers(id, name, mobile, whatsapp, photo_url)"
            )
            .eq("shop_id", shopId)
            .gt("amount_due", 0)
            .order("due_date", { ascending: true })
        )

        if (requestId !== requestRef.current) return

        // Customer reminder history and important system notifications are kept separate.
        let reminderLog = []
        let notificationRows = []
        try {
          const { data, error } = await supabase
            .from(REMINDER_TABLE)
            .select("id, customer_id, created_at, record_type")
            .eq("shop_id", shopId)
            .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
          if (!error && data) {
            reminderLog = data.filter((item) => item.record_type !== "notification")
          }
        } catch (err) {
          console.warn("Reminders history skipped:", err?.message)
        }

        try {
          notificationRows = await fetchAllRows(() =>
            supabase
              .from(REMINDER_TABLE)
              .select("id, shop_id, record_type, event_type, title, body, message, entity_type, entity_id, entity_label, is_read, read_at, created_at, due_date, status, metadata")
              .eq("shop_id", shopId)
              .eq("record_type", "notification")
              .order("created_at", { ascending: false })
          )
        } catch (err) {
          console.warn("Important notifications could not be loaded:", err?.message)
        }

        if (requestId !== requestRef.current) return
        setNotifications(notificationRows)

        const customerMap = new Map()

        bills.forEach((bill) => {
          const key = bill.customer_id || `walkin-${bill.id}`
          const isOverdue = bill.due_date && bill.due_date < today
          const existing = customerMap.get(key)
          const cust = bill.customers || {}
          const billSnap = {
            id: bill.id,
            bill_number: bill.bill_number,
            bill_date: bill.bill_date,
            due_date: bill.due_date,
            amount_due: num(bill.amount_due),
            grand_total: num(bill.grand_total),
            payment_status: bill.payment_status,
          }

          if (existing) {
            existing.due += num(bill.amount_due)
            existing.billCount += 1
            existing.bills.push(billSnap)
            if (isOverdue) existing.overdue += num(bill.amount_due)
            if (!existing.oldestDue || (bill.due_date && bill.due_date < existing.oldestDue)) {
              existing.oldestDue = bill.due_date
            }
            if (!existing.newestBillDate || (bill.bill_date && bill.bill_date > existing.newestBillDate)) {
              existing.newestBillDate = bill.bill_date
            }
          } else {
            customerMap.set(key, {
              key,
              customerId: bill.customer_id,
              shopId,
              name: cust.name || "Walk-in Customer",
              phone: pickPhone(cust),
              photoUrl: cust.photo_url || null,
              mobile: cust.mobile || "",
              whatsapp: cust.whatsapp || "",
              due: num(bill.amount_due),
              overdue: isOverdue ? num(bill.amount_due) : 0,
              billCount: 1,
              oldestDue: bill.due_date,
              newestBillDate: bill.bill_date,
              bills: [billSnap],
            })
          }
        })

        const list = Array.from(customerMap.values()).sort((a, b) => b.overdue - a.overdue || b.due - a.due)

        const reminderByCustomer = new Map()
        reminderLog.forEach((r) => {
          if (!r.customer_id) return
          const prev = reminderByCustomer.get(r.customer_id)
          const ts = new Date(r.created_at).getTime()
          if (!prev || ts > prev) reminderByCustomer.set(r.customer_id, ts)
        })

        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)

        const overdueRows = list.filter((r) => r.overdue > 0)
        const upcomingRows = list.filter((r) => {
          if (!r.oldestDue) return false
          const diff = daysBetween(today, r.oldestDue)
          return diff >= 0 && diff <= 7
        })

        setStats({
          totalDue: list.reduce((t, r) => t + r.due, 0),
          overdueDue: overdueRows.reduce((t, r) => t + r.due, 0),
          overdueCount: overdueRows.length,
          upcomingDue: upcomingRows.reduce((t, r) => t + r.due, 0),
          upcomingCount: upcomingRows.length,
          customersWithDue: list.length,
          remindersSent: reminderLog.length,
          remindersToday: reminderLog.filter((r) => new Date(r.created_at) >= todayStart).length,
        })

        setRows(list.map((r) => ({ ...r, lastReminder: reminderByCustomer.get(r.customerId) || null })))
        setLastUpdated(new Date())
        lastRefreshAt.current = Date.now()
        hasLoaded.current = true
      } catch (error) {
        if (requestId !== requestRef.current) return
        console.error("Reminders load error:", error)
        setLoadError(error?.message || "Unable to load reminders.")
        toast.error("Could not load reminders", { description: error?.message })
      } finally {
        if (requestId === requestRef.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [shopId, today]
  )

  const markNotificationRead = async (notification) => {
    if (!notification || notification.is_read) return
    const previous = notifications
    setNotifications((items) => items.map((item) =>
      item.id === notification.id ? { ...item, is_read: true, read_at: new Date().toISOString() } : item
    ))
    try {
      const { error } = await supabase
        .from(REMINDER_TABLE)
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", notification.id)
        .eq("shop_id", shopId)
        .eq("record_type", "notification")
      if (error) throw error
    } catch (error) {
      setNotifications(previous)
      toast.error("Could not mark notification as read", { description: error?.message })
    }
  }

  const markAllNotificationsRead = async () => {
    const unread = notifications.filter((item) => !item.is_read)
    if (!unread.length) return
    setNotificationBusy(true)
    const readAt = new Date().toISOString()
    setNotifications((items) => items.map((item) => ({ ...item, is_read: true, read_at: item.read_at || readAt })))
    try {
      const { error } = await supabase
        .from(REMINDER_TABLE)
        .update({ is_read: true, read_at: readAt })
        .eq("shop_id", shopId)
        .eq("record_type", "notification")
        .eq("is_read", false)
      if (error) throw error
      toast.success("All notifications marked as read")
    } catch (error) {
      toast.error("Could not update notifications", { description: error?.message })
      await loadData(true)
    } finally {
      setNotificationBusy(false)
    }
  }

  const deleteNotification = async (notification) => {
    if (!notification) return
    const previous = notifications
    setNotifications((items) => items.filter((item) => item.id !== notification.id))
    try {
      const { error } = await supabase
        .from(REMINDER_TABLE)
        .delete()
        .eq("id", notification.id)
        .eq("shop_id", shopId)
        .eq("record_type", "notification")
      if (error) throw error
      toast.success("Notification deleted")
    } catch (error) {
      setNotifications(previous)
      toast.error("Could not delete notification", { description: error?.message })
    }
  }

  const clearAllNotifications = async () => {
    if (!notifications.length) return
    if (!window.confirm("Clear all important notifications? This cannot be undone.")) return
    const previous = notifications
    setNotifications([])
    setNotificationBusy(true)
    try {
      const { error } = await supabase
        .from(REMINDER_TABLE)
        .delete()
        .eq("shop_id", shopId)
        .eq("record_type", "notification")
      if (error) throw error
      toast.success("All notifications cleared")
    } catch (error) {
      setNotifications(previous)
      toast.error("Could not clear notifications", { description: error?.message })
    } finally {
      setNotificationBusy(false)
    }
  }

  const visibleNotifications = notifications.filter((item) => {
    if (notificationFilter === "unread") return !item.is_read
    if (notificationFilter === "read") return Boolean(item.is_read)
    return true
  })
  const unreadNotificationCount = notifications.filter((item) => !item.is_read).length

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (!shopId) return
    const tick = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRefreshAt.current >= AUTO_REFRESH_MS) {
        loadData(true)
      }
    }
    const id = setInterval(tick, 30000)
    document.addEventListener("visibilitychange", tick)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [shopId, loadData])

  // Keep the notification centre in sync with database changes and the header bell.
  useEffect(() => {
    if (!shopId) return
    const channel = supabase
      .channel(`reminders-notifications-${shopId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: REMINDER_TABLE, filter: `shop_id=eq.${shopId}` },
        () => loadData(true)
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [shopId, loadData])

  useEffect(() => { setPage(1) }, [search, statusFilter])

  /* ---------------- FILTERS ---------------- */

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (dismissedCustomerKeys.includes(r.key)) return false
      if (dateRange.from || dateRange.to) {
        const hasBillInRange = (r.bills || []).some((bill) => {
          if (!bill.due_date) return false
          if (dateRange.from && bill.due_date < dateRange.from) return false
          if (dateRange.to && bill.due_date > dateRange.to) return false
          return true
        })
        if (!hasBillInRange) return false
      }
      if (statusFilter === "overdue" && r.overdue <= 0) return false
      if (statusFilter === "today") {
        if (!r.oldestDue) return false
        if (daysBetween(today, r.oldestDue) !== 0) return false
      }
      if (statusFilter === "upcoming") {
        if (!r.oldestDue) return false
        const d = daysBetween(today, r.oldestDue)
        if (d < 1 || d > 7) return false
      }
      if (statusFilter === "contactless" && r.phone) return false
      if (q) {
        const hay = `${r.name} ${r.phone}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, search, statusFilter, today, dismissedCustomerKeys, dateRange])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [totalPages, page])

  const showingFrom = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const showingTo = Math.min(page * PAGE_SIZE, filtered.length)

  const openCustomerProfile = async (row) => {
    setViewTarget({ ...row, profileLoading: Boolean(row.customerId) })
    if (!row.customerId) return
    try {
      // Fetch the complete customer record so optional profile fields and photo
      // are not limited to the columns used by the reminder table.
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", row.customerId)
        .maybeSingle()
      if (error) throw error
      if (data) {
        const photoUrl =
          data.photo_url || data.profile_photo_url || data.avatar_url ||
          data.profile_image || data.image_url || data.image || row.photoUrl || null
        setViewTarget((current) =>
          current?.key === row.key
            ? {
                ...current,
                ...data,
                profile: data,
                photoUrl,
                name: data.name || current.name,
                mobile: data.mobile || current.mobile,
                whatsapp: data.whatsapp || current.whatsapp,
                phone: data.whatsapp || data.mobile || current.phone,
                profileLoading: false,
              }
            : current
        )
      } else {
        setViewTarget((current) => current?.key === row.key ? { ...current, profileLoading: false } : current)
      }
    } catch (error) {
      console.error("Customer profile fetch failed:", error)
      setViewTarget((current) => current?.key === row.key ? { ...current, profileLoading: false } : current)
      toast.error("Could not load full customer profile", { description: error?.message })
    }
  }

  /* ---------------- SELECTION ---------------- */

  const toggleSelect = (key) => {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.includes(r.key))

  const toggleSelectAll = () => {
    const pageKeys = pageRows.map((r) => r.key)
    setSelected((prev) =>
      allOnPageSelected ? prev.filter((k) => !pageKeys.includes(k)) : [...new Set([...prev, ...pageKeys])]
    )
  }

  const selectedRows = filtered.filter((r) => selected.includes(r.key))

  /* ---------------- EXPORT ---------------- */

  const handleExport = () => {
    setExporting(true)
    try {
      const header = ["Customer", "Phone", "Pending", "Overdue", "Bills", "Oldest Due", "Last Reminder"]
      const csv = [
        header.join(","),
        ...filtered.map((r) =>
          [
            `"${r.name}"`,
            `"${r.phone || ""}"`,
            r.due.toFixed(2),
            r.overdue.toFixed(2),
            r.billCount,
            r.oldestDue || "",
            r.lastReminder ? new Date(r.lastReminder).toISOString() : "",
          ].join(",")
        ),
      ].join("\n")

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `reminders-${today}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Exported ${filtered.length} customers`)
    } catch (error) {
      toast.error("Could not export", { description: error?.message })
    } finally {
      setExporting(false)
    }
  }

  /* ---------------- RENDER ---------------- */

  if (!currentShop) {
    return (
      <div ref={rootRef} className="flex min-h-[400px] items-center justify-center rounded-3xl border border-dashed border-violet-200 bg-white/80 p-8 text-center">
        <div className="max-w-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <Store className="h-7 w-7" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">No workspace selected</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Select or create a workspace to manage reminders.
          </p>
          <DashButton asChild className="mt-5">
            <Link to="/settings">Open workspace settings</Link>
          </DashButton>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-full w-full space-y-4 rounded-2xl bg-[#f7f5ff] px-3 py-5 sm:px-5 lg:px-6" aria-busy="true">
        <Skeleton className="h-20 w-72" />
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 2xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[124px] rounded-[20px]" />
          ))}
        </div>
        <Skeleton className="h-[480px] rounded-[20px]" />
      </div>
    )
  }

  return (
    <div ref={rootRef} className="reminders-page min-h-full w-full min-w-0 space-y-4 overflow-x-hidden rounded-2xl bg-[#f7f5ff] px-3 py-4 text-slate-800 sm:px-5 sm:py-5 xl:px-6">
      <style>{`
        .reminders-page { color-scheme: light; }
        html.dark .reminders-page, .dark .reminders-page, [data-theme="dark"] .reminders-page { color-scheme: dark; background: #020617 !important; color: #f1f5f9; }
        .reminders-page button:not(:disabled) { -webkit-tap-highlight-color: transparent; }
        /* Shared button foundation: neutral lavender/white, consistent across the page.
           Utility classes may still adjust size or semantic state where needed. */
        :where(.reminders-page) button {
          border-radius: 12px;
          border-color: #ddd6fe;
          background-color: rgba(255,255,255,.94);
          color: #475569;
          box-shadow: 0 1px 2px rgba(80,65,130,.07);
          transition: background-color .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease;
        }
        :where(.reminders-page) button:hover:not(:disabled) {
          border-color: #c4b5fd;
          background-color: #f5f3ff;
          box-shadow: 0 3px 9px rgba(80,65,130,.10);
        }
        :where(.reminders-page) button:focus-visible {
          outline: 2px solid #8b5cf6;
          outline-offset: 2px;
        }
        :where(.reminders-page) button:disabled {
          cursor: not-allowed;
          opacity: .48;
        }
        .reminders-page .bg-emerald-600 { background-color:#fff !important; color:#334155 !important; border-color:#ddd6fe !important; }
        .reminders-page .hover\\:bg-emerald-700:hover { background-color:#f5f3ff !important; }
        .reminders-page .text-emerald-700 { color:#475569 !important; }
        .dark .reminders-page, [data-theme="dark"] .reminders-page {
          color-scheme: dark; background: #020617 !important; color: #f1f5f9;
        }
        .dark .reminders-page :is(.bg-white,.bg-white\\/80,.bg-white\\/85,.bg-white\\/90,.bg-white\\/60,.bg-white\\/65),
        [data-theme="dark"] .reminders-page :is(.bg-white,.bg-white\\/80,.bg-white\\/85,.bg-white\\/90,.bg-white\\/60,.bg-white\\/65) { background-color: #0f172a !important; }
        .dark .reminders-page :is(.bg-\\[\\#f5f3fc\\],.bg-\\[\\#f7f5ff\\],.bg-slate-50,.bg-slate-50\\/50),
        [data-theme="dark"] .reminders-page :is(.bg-\\[\\#f5f3fc\\],.bg-\\[\\#f7f5ff\\],.bg-slate-50,.bg-slate-50\\/50) { background-color: #0b1325 !important; }
        .dark .reminders-page :is(.text-slate-900,.text-slate-800,.text-slate-700,.text-\\[\\#171a39\\],.text-\\[\\#171a36\\],.text-\\[\\#151934\\]),
        [data-theme="dark"] .reminders-page :is(.text-slate-900,.text-slate-800,.text-slate-700,.text-\\[\\#171a39\\],.text-\\[\\#171a36\\],.text-\\[\\#151934\\]) { color: #f1f5f9 !important; }
        .dark .reminders-page :is(.text-slate-600,.text-slate-500,.text-slate-400),
        [data-theme="dark"] .reminders-page :is(.text-slate-600,.text-slate-500,.text-slate-400) { color: #94a3b8 !important; }
        .dark .reminders-page :is(.border-violet-100,.border-violet-200,.border-\\[\\#eae7f4\\],.border-\\[\\#ece9f5\\],.border-\\[\\#eeecf5\\],.border-\\[\\#eae7f4\\]),
        [data-theme="dark"] .reminders-page :is(.border-violet-100,.border-violet-200,.border-\\[\\#eae7f4\\],.border-\\[\\#ece9f5\\],.border-\\[\\#eeecf5\\]) { border-color: #1e293b !important; }
        .dark .reminders-page input,.dark .reminders-page select,.dark .reminders-page textarea,
        [data-theme="dark"] .reminders-page input,[data-theme="dark"] .reminders-page select,[data-theme="dark"] .reminders-page textarea {
          background-color: #0b1325; color: #f1f5f9; border-color: #334155;
        }
        .dark .reminders-page input::placeholder,.dark .reminders-page textarea::placeholder,
        [data-theme="dark"] .reminders-page input::placeholder,[data-theme="dark"] .reminders-page textarea::placeholder { color: #8290a5; }
        .dark .reminders-page table tbody tr:hover,[data-theme="dark"] .reminders-page table tbody tr:hover { background-color: #263449 !important; }
        .dark .reminders-page .shadow-sm,[data-theme="dark"] .reminders-page .shadow-sm { box-shadow: 0 2px 8px rgba(0,0,0,.22); }
        .dark .reminders-page [role="dialog"],[data-theme="dark"] .reminders-page [role="dialog"] { background:#0f172a !important; border-color:#1e293b !important; color:#f1f5f9; }
        .dark .reminders-page [role="dialog"] :is(.bg-white,.bg-white\\/60,.bg-white\\/80,.bg-violet-50\\/40),[data-theme="dark"] .reminders-page [role="dialog"] :is(.bg-white,.bg-white\\/60,.bg-white\\/80,.bg-violet-50\\/40) { background-color:#1f2937 !important; }
        .dark .reminders-page [role="dialog"] :is(.text-slate-900,.text-slate-800,.text-slate-700),[data-theme="dark"] .reminders-page [role="dialog"] :is(.text-slate-900,.text-slate-800,.text-slate-700) { color:#e5e7eb !important; }
        .dark .reminders-page [role="dialog"] :is(.border-violet-100,.border-violet-200,.border-slate-200),[data-theme="dark"] .reminders-page [role="dialog"] :is(.border-violet-100,.border-violet-200,.border-slate-200) { border-color:#374151 !important; }
        @media (max-width: 640px) {
          .reminders-page [role="dialog"] { max-height: 94dvh; border-radius: 18px; }
          .reminders-page [role="dialog"] > div { min-width: 0; }
          .reminders-page table { min-width: 760px; }
        }
      `}</style>
      {/* HEADER */}
      <header className="flex min-w-0 flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className="truncate">{currentShop.name || "Workspace"}</span>
            <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>Reminders</span>
          </nav>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-[26px] font-bold tracking-tight text-[#171a39] sm:text-[32px]">
            Payment reminders
            {stats.overdueCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                <AlertCircle className="h-3 w-3" />
                {stats.overdueCount} overdue
              </span>
            )}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-slate-600">
            <span>Chase pending payments and keep your cash flow healthy.</span>
            {lastUpdated && (
              <span className="flex items-center gap-1.5 text-xs text-slate-500" aria-live="polite">
                <span className={`h-1.5 w-1.5 rounded-full ${refreshing ? "animate-pulse bg-amber-500" : "bg-emerald-500"}`} aria-hidden="true" />
                {refreshing ? "Updating…" : `Updated ${timeAgo(lastUpdated, now)}`}
              </span>
            )}
          </p>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          <div ref={periodRef} className="relative col-span-2 w-full sm:col-span-1 sm:w-auto">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={periodOpen}
              onClick={() => setPeriodOpen((open) => !open)}
              className={cn(BTN, "w-full justify-start sm:w-auto sm:max-w-[270px]")}
            >
              <CalendarDays className="h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
              <span className="truncate">{periodLabel}</span>
              <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 text-slate-500 transition-transform", periodOpen && "rotate-180")} aria-hidden="true" />
            </button>
            {periodOpen && (
              <>
                <div className="fixed inset-0 z-40 cursor-pointer bg-slate-900/35 lg:hidden" onClick={() => setPeriodOpen(false)} aria-hidden="true" />
                <div
                  role="menu"
                  aria-label="Choose reminder date range"
                  className="fixed inset-x-3 bottom-3 z-50 mx-auto max-h-[min(82dvh,620px)] w-auto max-w-[520px] overflow-y-auto overscroll-contain rounded-2xl border border-violet-100 bg-white p-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_16px_40px_rgba(80,65,130,0.28)] lg:absolute lg:inset-x-auto lg:bottom-auto lg:right-0 lg:top-[calc(100%+8px)] lg:z-30 lg:max-h-[min(80vh,620px)] lg:w-[320px] lg:max-w-[calc(100vw-2rem)] lg:overflow-y-auto lg:pb-2"
                >
                  {[...DATE_PRESETS, { mode: "overall", label: "Overall (all time)" }].map((option) => {
                    const active = period.mode === option.mode
                    return (
                      <button
                        key={option.mode}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        onClick={() => choosePeriod(option.mode)}
                        className={cn("flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors", FOCUS_RING, active ? "bg-violet-100 font-semibold text-violet-900" : "text-slate-700 hover:bg-violet-50")}
                      >
                        {option.label}
                        {active && <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    )
                  })}
                  <div className="mt-2 border-t border-[#eeecf5] px-1 pb-1 pt-3">
                    <p className="mb-2 px-2 text-xs font-semibold text-slate-500">Pick dates</p>
                    <div className="grid grid-cols-2 gap-2 px-1">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-slate-500">From</span>
                        <input type="date" value={dateRange.from || ""} max={dateRange.to || today} onChange={(event) => changeCustomDate("from", event.target.value)} className={cn("h-9 w-full cursor-pointer rounded-lg border border-violet-200 bg-white px-2 text-xs text-slate-700", FOCUS_RING)} />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-slate-500">To</span>
                        <input type="date" value={dateRange.to || ""} min={dateRange.from || undefined} max={today} onChange={(event) => changeCustomDate("to", event.target.value)} className={cn("h-9 w-full cursor-pointer rounded-lg border border-violet-200 bg-white px-2 text-xs text-slate-700", FOCUS_RING)} />
                      </label>
                    </div>
                    <p className="mt-3 px-2 text-[11px] leading-4 text-slate-500">The customer list shows bills whose due dates fall within this range.</p>
                    <DashButton type="button" onClick={() => setPeriodOpen(false)} className="mt-3 w-full">Done</DashButton>
                  </div>
                </div>
              </>
            )}
          </div>
          <DashButton type="button" onClick={() => loadData(true)} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 shrink-0 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
            <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
          </DashButton>
          <DashButton type="button" onClick={handleExport} disabled={exporting || filtered.length === 0}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export
          </DashButton>
          <DashButton asChild>
            <Link to="/dues">
              <Wallet className="h-4 w-4" aria-hidden="true" />
              All dues
            </Link>
          </DashButton>
          <DashButton type="button" onClick={() => setAddReminderOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add reminder
          </DashButton>
          {selected.length > 0 && (
            <DashButton
              type="button"
              onClick={() => setBulkOpen(true)}
              className="col-span-2 border-violet-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50 sm:col-span-1"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              Send {selected.length} reminder{selected.length === 1 ? "" : "s"}
            </DashButton>
          )}
        </div>
      </header>

      {/* ERROR */}
      {loadError && (
        <div role="alert" className="flex flex-col items-stretch justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-start gap-2 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Could not load reminders. <span className="ml-1 text-xs text-rose-500">({loadError})</span></span>
          </div>
          <DashButton type="button" onClick={() => loadData()} className="w-full shrink-0 sm:w-auto">
            Try again
          </DashButton>
        </div>
      )}

      {/* SUMMARY */}
      <section aria-label="Reminder overview" className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 2xl:grid-cols-4">
        <SummaryCard
          label="Total pending"
          value={formatCurrency(stats.totalDue)}
          detail={`${stats.customersWithDue} customers with dues`}
          icon={IndianRupee}
          tone="pink"
        />
        <SummaryCard
          label="Overdue"
          value={formatCurrency(stats.overdueDue)}
          detail={`${stats.overdueCount} customers past due`}
          icon={CircleAlert}
          tone="amber"
          badge={stats.overdueCount > 0 ? "Action" : undefined}
        />
        <SummaryCard
          label="Due this week"
          value={formatCurrency(stats.upcomingDue)}
          detail={`${stats.upcomingCount} customers due soon`}
          icon={CalendarClock}
          tone="blue"
        />
        <SummaryCard
          label="Reminders sent"
          value={stats.remindersSent.toLocaleString("en-IN")}
          detail={`${stats.remindersToday} sent today`}
          icon={BellRing}
          tone="green"
        />
      </section>

      

      {/* IMPORTANT NOTIFICATIONS — due today, overdue and critical record events only */}
      <Card className={cardClass}>
        <SectionHeader
          icon={BellRing}
          title="Important notifications"
          description="Only important business events — bills due today, overdue bills and critical record changes."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700">
                {unreadNotificationCount} unread
              </span>
              <button
                type="button"
                onClick={markAllNotificationsRead}
                disabled={notificationBusy || unreadNotificationCount === 0}
                className={cn(BTN, BTN_SM)}
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
              <button
                type="button"
                onClick={clearAllNotifications}
                disabled={notificationBusy || notifications.length === 0}
                className={cn(BTN, BTN_SM, "border-rose-200 text-rose-700 hover:border-rose-300 hover:bg-rose-50")}
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear all
              </button>
            </div>
          }
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eeecf5] px-4 py-3 sm:px-5">
          <div className="flex flex-wrap gap-1.5">
            {[
              { value: "all", label: `All (${notifications.length})` },
              { value: "unread", label: `Unread (${unreadNotificationCount})` },
              { value: "read", label: "Read" },
            ].map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setNotificationFilter(filter.value)}
                className={cn(
                  BTN,
                  BTN_SM,
                  notificationFilter === filter.value && "border-violet-300 bg-violet-100 text-violet-800 hover:bg-violet-100"
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-violet-50 hover:text-violet-800"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} /> Refresh
          </button>
        </div>

        {visibleNotifications.length === 0 ? (
          <EmptyNote
            icon={notificationFilter === "unread" ? CheckCircle2 : Bell}
            title={
              notificationFilter === "unread"
                ? "You're all caught up"
                : notificationFilter === "read"
                  ? "No read notifications"
                  : "No important notifications yet"
            }
            description={
              notificationFilter === "all"
                ? "When a bill becomes due or overdue, or an important record is deleted, the alert will appear here."
                : "There are no notifications in this filter."
            }
          />
        ) : (
          <div className="divide-y divide-[#eeecf5]">
            {visibleNotifications.map((item) => {
              const tone = notificationTone(item.event_type)
              const isUnread = !item.is_read
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex min-w-0 flex-col gap-3 px-4 py-4 transition-colors sm:flex-row sm:items-start sm:px-5",
                    isUnread ? "bg-violet-50/35" : "bg-white"
                  )}
                >
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", tone)}>
                    {String(item.event_type || "").includes("deleted")
                      ? <Trash2 className="h-4.5 w-4.5" />
                      : String(item.event_type || "").includes("overdue")
                        ? <CircleAlert className="h-4.5 w-4.5" />
                        : <BellRing className="h-4.5 w-4.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-[#171a36]">{cleanNotificationText(item.title) || "Important update"}</p>
                      {isUnread && <span className="h-2 w-2 rounded-full bg-violet-600" aria-label="Unread" />}
                      {(item.entity_label || String(item.event_type || "").includes("deleted")) && (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          {getNotificationEntityLabel(item)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-line break-words text-xs leading-5 text-slate-600">
                      {cleanNotificationText(item.body || item.message) || "An important business event occurred."}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
                      <span>{notificationTime(item.created_at)}</span>
                      {item.due_date && <span>Due date: {formatDate(item.due_date)}</span>}
                      {item.event_type && <span className="capitalize">{String(item.event_type).replaceAll("_", " ")}</span>}
                      <span className={isUnread ? "font-semibold text-violet-700" : "text-slate-400"}>
                        {isUnread ? "Unread" : "Read"}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center justify-end gap-1.5 sm:pt-0.5">
                    {isUnread && (
                      <button
                        type="button"
                        onClick={() => markNotificationRead(item)}
                        title="Mark as read"
                        aria-label="Mark notification as read"
                        className={cn(ICON_BTN, "h-9 w-9 border-emerald-200 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50")}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteNotification(item)}
                      title="Delete notification"
                      aria-label="Delete notification"
                      className={cn(ICON_BTN, "h-9 w-9 border-rose-200 text-rose-600 hover:border-rose-300 hover:bg-rose-50")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {notifications.length > 0 && (
          <div className="border-t border-[#eeecf5] bg-white/60 px-4 py-2.5 text-[11px] text-slate-500 sm:px-5">
            Showing {visibleNotifications.length} of {notifications.length} notifications · unread count stays synced with the header bell
          </div>
        )}
      </Card>

      {/* TABLE CARD */}
      <Card className={cardClass}>
        <SectionHeader
          icon={Bell}
          title="Who owes you"
          description="Filter, select and send reminders in one click."
          action={
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  ref={searchRef}
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name or phone"
                  className="h-10 w-full rounded-xl border border-violet-200 bg-white pl-9 pr-12 text-sm text-slate-700 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 sm:w-[260px]"
                />
                <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 sm:inline-block">
                  ⌘K
                </kbd>
              </div>
              <div className="relative">
                <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-10 w-full cursor-pointer appearance-none rounded-xl border border-violet-200 bg-white pl-9 pr-8 text-sm font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 sm:w-[170px]"
                >
                  <option value="all">All customers</option>
                  <option value="overdue">Overdue only</option>
                  <option value="today">Due today</option>
                  <option value="upcoming">Due this week</option>
                  <option value="contactless">No phone number</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              </div>
            </div>
          }
        />

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-100 bg-violet-50/60 px-4 py-2.5 sm:px-5">
            <p className="text-xs font-semibold text-slate-700">
              <CheckCheck className="mr-1 inline h-3.5 w-3.5" />
              {selected.length} selected · {formatCurrency(selectedRows.reduce((t, r) => t + r.due, 0))} pending
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelected([])}
                className="rounded-lg px-2 py-1 text-xs font-medium text-slate-700 hover:bg-emerald-100"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setBulkOpen(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-violet-50"
              >
                <Send className="h-3 w-3" />
                Send to {selected.length}
              </button>
            </div>
          </div>
        )}

        {pageRows.length === 0 ? (
          <EmptyNote
            icon={rows.length === 0 ? CheckCircle2 : Search}
            title={rows.length === 0 ? "All clear — no pending dues" : "No customers match your filters"}
            description={
              rows.length === 0
                ? "When a bill becomes unpaid, the customer will appear here for reminders."
                : "Try clearing the search or switching the filter."
            }
            action={
              rows.length === 0 ? (
                <DashButton asChild>
                  <Link to="/bills">
                    <FileText className="h-4 w-4" />
                    View all bills
                  </Link>
                </DashButton>
              ) : (
                <DashButton onClick={() => { setSearch(""); setStatusFilter("all") }}>
                  Clear filters
                </DashButton>
              )
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto px-3 pt-3 sm:px-4">
              <table className="w-full min-w-[820px] text-left">
                <caption className="sr-only">Customers with pending dues</caption>
                <thead>
                  <tr className="bg-[#f5f3fc] text-[11px] font-semibold text-slate-600">
                    <th scope="col" className="rounded-l-xl px-3 py-3">
                      <SelectCheckbox label="Select all on this page" checked={allOnPageSelected} onChange={toggleSelectAll} />
                    </th>
                    <th scope="col" className="px-3 py-3">Customer</th>
                    <th scope="col" className="px-3 py-3">Phone</th>
                    <th scope="col" className="px-3 py-3 text-right">Pending</th>
                    <th scope="col" className="px-3 py-3">Status</th>
                    <th scope="col" className="px-3 py-3">Last reminder</th>
                    <th scope="col" className="rounded-r-xl px-3 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, index) => {
                    const isSelected = selected.includes(row.key)
                    return (
                      <tr
                        key={row.key}
                        className={cn(
                          "border-b border-[#eeecf5] transition-colors last:border-0 hover:bg-[#f9f8ff]",
                          isSelected && "bg-violet-50/40"
                        )}
                      >
                        <td className="px-3 py-3">
                          <SelectCheckbox label={`Select ${row.name}`} checked={isSelected} onChange={() => toggleSelect(row.key)} />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <CustomerAvatar name={row.name} photoUrl={row.photoUrl} className="h-9 w-9 text-xs" index={index} />
                            <div className="min-w-0">
                              <p className="max-w-[180px] truncate text-[12px] font-bold text-slate-800">{row.name}</p>
                              <p className="text-[11px] text-slate-500">
                                {row.billCount} unpaid {row.billCount === 1 ? "bill" : "bills"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {row.phone ? (
                            <p className="flex items-center gap-1 text-[11px] text-slate-600">
                              <Phone className="h-3 w-3" />
                              {row.phone}
                            </p>
                          ) : (
                            <span className="text-[11px] text-amber-600">No phone</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-bold tabular-nums text-rose-600">
                          {formatCurrency(row.due)}
                          {row.overdue > 0 && (
                            <p className="text-[10px] font-semibold text-rose-500">
                              {formatCurrency(row.overdue)} overdue
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <DueStatusBadge dueDate={row.oldestDue} today={today} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">
                          {row.lastReminder
                            ? <span className="flex items-center gap-1"><History className="h-3 w-3" />{timeAgo(new Date(row.lastReminder), now)}</span>
                            : <span className="text-slate-400">Never</span>}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openCustomerProfile(row)}
                              aria-label={`View details for ${row.name}`}
                              title="View details"
                              className={cn(ICON_BTN)}
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setCustomerToHide(row)}
                              aria-label={`Remove ${row.name} from this list`}
                              title="Remove from this list"
                              className={cn(ICON_BTN, "border-rose-200 text-rose-600 hover:border-rose-300 hover:bg-rose-50")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setReminderTarget(row)}
                              aria-label={`Send reminder to ${row.name}`}
                              title="Send reminder"
                              disabled={!row.phone}
                              className={cn(
                                ICON_BTN,
                                "border-violet-200 text-slate-700 hover:bg-violet-50",
                                !row.phone && "opacity-40"
                              )}
                            >
                              <Send className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-[#eeecf5] bg-white/60 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="text-xs font-medium text-slate-600" aria-live="polite">
                Showing <span className="font-semibold text-slate-800">{showingFrom}–{showingTo}</span> of{" "}
                <span className="font-semibold text-slate-800">{filtered.length}</span> customers
              </p>
              <nav aria-label="Pagination" className="flex flex-wrap items-center justify-end gap-1.5">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className={ICON_BTN}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                  .map((n, i, arr) => (
                    <span key={n} className="contents">
                      {i > 0 && arr[i - 1] !== n - 1 && <span className="px-1 text-xs text-slate-400">…</span>}
                      <button
                        type="button"
                        aria-label={`Page ${n}`}
                        aria-current={page === n ? "page" : undefined}
                        onClick={() => setPage(n)}
                        className={cn(ICON_BTN, "min-w-9 text-xs font-semibold", page === n && "border-violet-300 bg-violet-100 text-violet-900")}
                      >
                        {n}
                      </button>
                    </span>
                  ))}
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className={ICON_BTN}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </nav>
            </div>
          </>
        )}
      </Card>

      {/* TIPS */}
      <Card className={cardClass}>
        <SectionHeader
          icon={Sparkles}
          title="Best practices"
          description="Proven tactics to get paid faster."
        />
        <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5">
          {[
            { title: "Send at 10–11 AM", text: "Morning reminders get the highest response rate. Avoid late evenings.", icon: Clock3, tone: "text-emerald-700 bg-emerald-50" },
            { title: "Keep the first nudge friendly", text: "A polite first reminder preserves the relationship and still works.", icon: MessageCircle, tone: "text-blue-700 bg-blue-50" },
            { title: "Include a pay link", text: "Add a UPI ID or payment link so customers can pay in one tap.", icon: CreditCard, tone: "text-violet-700 bg-violet-50" },
            { title: "Follow up in 3 days", text: "If no reply, a second reminder after 3 days usually gets the money in.", icon: RefreshCw, tone: "text-amber-700 bg-amber-50" },
          ].map((tip) => {
            const Icon = tip.icon
            return (
              <div key={tip.title} className="flex items-start gap-3 rounded-xl border border-[#ece9f5] bg-white p-3.5 transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-sm">
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tip.tone)}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-slate-800">{tip.title}</p>
                  <p className="mt-0.5 text-[11px] leading-5 text-slate-500">{tip.text}</p>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* FOOTER */}
      <footer className="flex flex-col justify-between gap-2 rounded-xl border border-white/80 bg-white/65 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-emerald-700" aria-hidden="true" />
          <span>Workspace: <strong className="ml-1 text-slate-700">{currentShop.name}</strong></span>
        </div>
        <span>
          {lastUpdated
            ? `Last updated at ${lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · refreshes automatically`
            : "Not updated yet"}
        </span>
      </footer>

      {/* PAGE-ONLY CUSTOMER REMOVE CONFIRMATION */}
      {customerToHide && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[3px]"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setCustomerToHide(null) }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="hide-customer-title" className="w-full max-w-md overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-2xl">
            <div className="flex items-start gap-3 border-b border-violet-100 px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="hide-customer-title" className="text-base font-bold text-slate-900">Remove customer from this list?</h2>
                <p className="mt-1 text-sm leading-5 text-slate-500">{customerToHide.name} will no longer appear in the Who owes you list on this page.</p>
              </div>
              <button type="button" onClick={() => setCustomerToHide(null)} className={ICON_BTN} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-slate-600">You can cancel now and keep the customer visible.</p>
              <div className="mt-5 flex flex-col-reverse justify-end gap-2 sm:flex-row">
                <DashButton type="button" onClick={() => setCustomerToHide(null)}>Cancel</DashButton>
                <DashButton type="button" onClick={() => dismissCustomerFromPage(customerToHide)} className="border-rose-200 bg-rose-600 text-white hover:border-rose-300 hover:bg-rose-700 hover:text-white">
                  <Trash2 className="h-4 w-4" /> Remove from list
                </DashButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODALS */}
      {addReminderOpen && (
        <AddReminderModal
          customers={rows}
          onClose={() => setAddReminderOpen(false)}
          onChoose={(customer) => {
            setAddReminderOpen(false)
            setReminderTarget(customer)
          }}
        />
      )}
      <CustomerDetailModal
        customer={viewTarget}
        onClose={() => setViewTarget(null)}
        onRemind={(c) => setReminderTarget(c)}
        shopName={currentShop?.name || ""}
      />
      <ReminderModal
        customer={reminderTarget}
        onClose={() => setReminderTarget(null)}
        onSent={() => loadData(true)}
        shopName={currentShop?.name || ""}
      />
      {bulkOpen && selectedRows.length > 0 && (
        <BulkReminderModal
          customers={selectedRows}
          onClose={() => setBulkOpen(false)}
          onSent={() => { loadData(true); setSelected([]) }}
        />
      )}
    </div>
  )
}