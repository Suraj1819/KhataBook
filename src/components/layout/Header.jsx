import {
  Bell,
  BellRing,
  CheckCheck,
  Calculator,
  Clock3,
  X,
  ChevronDown,
  Check,
  Loader2,
  LogOut,
  Menu,
  Minus,
  Maximize2,
  Moon,
  Plus,
  Search,
  Settings,
  Store,
  Sun,
  Trash2,
  User,
  WifiOff,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useShop } from "@/contexts/ShopContext"
import { useTheme } from "@/contexts/ThemeContext"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/* ==================================================
   CONSTANTS & HELPERS
================================================== */

const SHOP_SEARCH_MIN = 5
const OVERDUE_REFRESH_MS = 5 * 60 * 1000

const PAGE_TITLES = {
  "/": "Dashboard",
  "/command-center": "Command Center",
  "/bills": "All Bills",
  "/bills/new": "Create Bill",
  "/dues": "Dues",
  "/payments": "Payments",
  "/customers": "Customers",
  "/khata": "Personal Khata",
  "/items": "Items",
  "/reminders": "Reminders",
  "/settings": "Shop Settings",
  "/profile": "My Profile",
}

function getPageTitle(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  if (pathname.startsWith("/bills/")) return "Bill Details"
  if (pathname.startsWith("/customers/")) return "Customer Details"
  return "KhaataPro"
}

function getInitials(name = "") {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "U"
  )
}

function calculateExpression(expression) {
  const input = String(expression || "").replace(/\s+/g, "")
  if (!input) return 0
  const tokens = input.match(/(?:\d+\.?\d*|\.\d+)|[()+\-*/%]/g) || []
  if (tokens.join("") !== input) throw new Error("Invalid expression")
  let index = 0

  const primary = () => {
    const token = tokens[index]
    if (token === "+" || token === "-") {
      index += 1
      const value = primary()
      return token === "-" ? -value : value
    }
    if (token === "(") {
      index += 1
      const value = sum()
      if (tokens[index] !== ")") throw new Error("Missing closing bracket")
      index += 1
      return value
    }
    if (!token || !/^(?:\d+\.?\d*|\.\d+)$/.test(token)) throw new Error("Invalid expression")
    index += 1
    return Number(token)
  }

  const product = () => {
    let value = primary()
    while (["*", "/", "%"].includes(tokens[index])) {
      const operator = tokens[index++]
      const next = primary()
      if ((operator === "/" || operator === "%") && next === 0) throw new Error("Cannot divide by zero")
      if (operator === "*") value *= next
      if (operator === "/") value /= next
      if (operator === "%") value %= next
    }
    return value
  }

  const sum = () => {
    let value = product()
    while (tokens[index] === "+" || tokens[index] === "-") {
      const operator = tokens[index++]
      const next = product()
      value = operator === "+" ? value + next : value - next
    }
    return value
  }

  const result = sum()
  if (index !== tokens.length || !Number.isFinite(result)) throw new Error("Invalid expression")
  return Number(result.toPrecision(12))
}

function getLocalDateString() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function useOverdueCount(shopId) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!shopId) {
      setCount(0)
      return
    }
    let cancelled = false

    async function load() {
      const { count: total, error } = await supabase
        .from("bills")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .gt("amount_due", 0)
        .lt("due_date", getLocalDateString())

      if (!cancelled && !error) setCount(total || 0)
    }

    load()
    const timer = setInterval(load, OVERDUE_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [shopId])

  return count
}

function useOnlineStatus() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  )
  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener("online", goOnline)
    window.addEventListener("offline", goOffline)
    return () => {
      window.removeEventListener("online", goOnline)
      window.removeEventListener("offline", goOffline)
    }
  }, [])
  return online
}

// ─── Shared button styles ───
const ACTION_BUTTON =
  "inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"

const ICON_BUTTON =
  "relative inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-violet-200 bg-white/90 text-slate-600 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"

const MENU_ITEM =
  "flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-violet-50 focus-visible:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800"

/* ==================================================
   ✅ HEADER EXPORT — THIS IS THE FIX
================================================== */

export function Header({ onMenuClick }) {
  const { user, profile, signOut } = useAuth()
  const { shops, currentShop, selectShop } = useShop()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const [shopOpen, setShopOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [shopQuery, setShopQuery] = useState("")
  const [signingOut, setSigningOut] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [calculatorOpen, setCalculatorOpen] = useState(false)
  const [calculatorMinimized, setCalculatorMinimized] = useState(false)
  const [calculatorPosition, setCalculatorPosition] = useState(null)
  const [calculatorLarge, setCalculatorLarge] = useState(false)
  const calculatorDragRef = useRef(null)
  const [calcExpression, setCalcExpression] = useState("")
  const [calcError, setCalcError] = useState("")
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notificationLoading, setNotificationLoading] = useState(false)
  const [notificationActionLoading, setNotificationActionLoading] = useState(false)

  const shopRef = useRef(null)
  const userRef = useRef(null)
  const notificationRef = useRef(null)
  const calculatorRef = useRef(null)
  const calcInputRef = useRef(null) // ✅ keeps calculator input focused

  const online = useOnlineStatus()
  const shopId = currentShop?.id

  // Close menus on outside click or Escape (calculator stays open on outside click)
  useEffect(() => {
    if (!shopOpen && !userOpen && !notificationOpen) return

    function handleClick(e) {
      if (shopRef.current && !shopRef.current.contains(e.target)) setShopOpen(false)
      if (userRef.current && !userRef.current.contains(e.target)) setUserOpen(false)
      if (notificationRef.current && !notificationRef.current.contains(e.target)) setNotificationOpen(false)
    }
    function handleKey(e) {
      if (e.key === "Escape") {
        setShopOpen(false)
        setUserOpen(false)
        setNotificationOpen(false)
        setCalculatorOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleKey)
    }
  }, [shopOpen, userOpen, notificationOpen])

  // ✅ FIX: keep the calculator input focused so typing works even after clicking outside
  useEffect(() => {
    if (!calculatorOpen || calculatorMinimized) return
    const timer = setTimeout(() => {
      calcInputRef.current?.focus()
    }, 30)
    return () => clearTimeout(timer)
  }, [calculatorOpen, calculatorMinimized, calcExpression])

  // ✅ FIX: global keyboard for calculator — works even when input is not focused
  useEffect(() => {
    if (!calculatorOpen || calculatorMinimized) return

    function handleGlobalCalculatorKeys(event) {
      const target = event.target
      // Only skip when user types in an OUTSIDE input/textarea (page forms)
      const isOutsideInput =
        target instanceof HTMLElement &&
        !calculatorRef.current?.contains(target) &&
        (target.matches("input, textarea, select") || target.isContentEditable)
      if (isOutsideInput) return

      if (/^[0-9.+*/%()\-]$/.test(event.key)) {
        event.preventDefault()
        handleCalculatorKey(event.key)
      } else if (event.key === "Enter" || event.key === "=") {
        event.preventDefault()
        handleCalculatorKey("=")
      } else if (event.key === "Backspace") {
        event.preventDefault()
        handleCalculatorKey("DEL")
      } else if (event.key === "Escape") {
        event.preventDefault()
        setCalculatorOpen(false)
      }
    }

    window.addEventListener("keydown", handleGlobalCalculatorKeys)
    return () => window.removeEventListener("keydown", handleGlobalCalculatorKeys)
  }, [calculatorOpen, calculatorMinimized, calcExpression])

  // Drag the floating calculator by its title bar
  useEffect(() => {
    if (!calculatorOpen) return
    const onMove = (event) => {
      if (!calculatorDragRef.current) return
      const { startX, startY, left, top } = calculatorDragRef.current
      const width = calculatorRef.current?.querySelector("[data-calculator-panel]")?.offsetWidth || 400
      const height = calculatorRef.current?.querySelector("[data-calculator-panel]")?.offsetHeight || 600
      const nextLeft = Math.max(8, Math.min(window.innerWidth - width - 8, left + event.clientX - startX))
      const nextTop = Math.max(8, Math.min(window.innerHeight - Math.min(height, 90) - 8, top + event.clientY - startY))
      setCalculatorPosition({ left: nextLeft, top: nextTop })
    }
    const onUp = () => { calculatorDragRef.current = null }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [calculatorOpen])

  // Load notifications
  useEffect(() => {
    if (!shopId) {
      setNotifications([])
      setUnreadCount(0)
      return
    }
    let cancelled = false

    async function loadNotifications(showLoader = false) {
      if (showLoader) setNotificationLoading(true)
      try {
        const [listResult, countResult] = await Promise.all([
          supabase
            .from("reminders")
            .select("id, title, body, message, event_type, entity_type, entity_id, entity_label, is_read, created_at, metadata")
            .eq("shop_id", shopId)
            .eq("record_type", "notification")
            .order("created_at", { ascending: false })
            .limit(8),
          supabase
            .from("reminders")
            .select("id", { count: "exact", head: true })
            .eq("shop_id", shopId)
            .eq("record_type", "notification")
            .eq("is_read", false),
        ])
        if (listResult.error) throw listResult.error
        if (countResult.error) throw countResult.error
        if (cancelled) return
        setNotifications(listResult.data || [])
        setUnreadCount(countResult.count || 0)
      } catch (error) {
        if (!cancelled) console.error("Header notifications load failed:", error)
      } finally {
        if (!cancelled && showLoader) setNotificationLoading(false)
      }
    }

    loadNotifications(true)

    const channel = supabase
      .channel(`header-notifications-${shopId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reminders", filter: `shop_id=eq.${shopId}` },
        () => loadNotifications(false)
      )
      .subscribe()

    const refreshId = setInterval(() => loadNotifications(false), 60000)
    return () => {
      cancelled = true
      clearInterval(refreshId)
      supabase.removeChannel(channel)
    }
  }, [shopId])

  async function markNotificationRead(notificationId) {
    const notification = notifications.find((item) => item.id === notificationId)
    if (!notification || notification.is_read) return
    setNotifications((current) =>
      current.map((item) => (item.id === notificationId ? { ...item, is_read: true } : item))
    )
    setUnreadCount((count) => Math.max(0, count - 1))
    const { error } = await supabase
      .from("reminders")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("shop_id", shopId)
      .eq("record_type", "notification")
    if (error) {
      console.error("Mark notification read failed:", error)
      const { data } = await supabase
        .from("reminders")
        .select("id, title, body, message, event_type, entity_type, entity_id, entity_label, is_read, created_at, metadata")
        .eq("shop_id", shopId)
        .eq("record_type", "notification")
        .order("created_at", { ascending: false })
        .limit(8)
      if (data) {
        setNotifications(data)
        setUnreadCount(data.filter((item) => !item.is_read).length)
      }
    }
  }

  async function markAllNotificationsRead() {
    if (!shopId || unreadCount === 0 || notificationActionLoading) return
    setNotificationActionLoading(true)
    const { error } = await supabase
      .from("reminders")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("shop_id", shopId)
      .eq("record_type", "notification")
      .eq("is_read", false)
    if (error) {
      console.error("Mark all notifications read failed:", error)
    } else {
      setNotifications((current) => current.map((item) => ({ ...item, is_read: true })))
      setUnreadCount(0)
    }
    setNotificationActionLoading(false)
  }

  async function clearAllNotifications() {
    if (!shopId || notifications.length === 0 || notificationActionLoading) return
    const confirmed = window.confirm("Clear all notifications for this shop? This cannot be undone.")
    if (!confirmed) return
    setNotificationActionLoading(true)
    const { error } = await supabase
      .from("reminders")
      .delete()
      .eq("shop_id", shopId)
      .eq("record_type", "notification")
    if (error) {
      console.error("Clear notifications failed:", error)
      window.alert(error.message || "Could not clear notifications.")
    } else {
      setNotifications([])
      setUnreadCount(0)
    }
    setNotificationActionLoading(false)
  }

  function handleCalculatorKey(key) {
    setCalcError("")
    if (key === "AC") { setCalcExpression(""); return }
    if (key === "DEL") { setCalcExpression((value) => value.slice(0, -1)); return }
    if (["=", "√", "x²", "±"].includes(key)) {
      try {
        const current = calculateExpression(calcExpression)
        if (key === "=") setCalcExpression(String(current))
        if (key === "√") {
          if (current < 0) throw new Error("Square root needs a positive number")
          setCalcExpression(String(Number(Math.sqrt(current).toPrecision(12))))
        }
        if (key === "x²") setCalcExpression(String(Number((current * current).toPrecision(12))))
        if (key === "±") setCalcExpression(String(-current))
      } catch (error) {
        setCalcError(error.message || "Check expression")
      }
      return
    }
    if (key === "%") {
      try {
        setCalcExpression(String(Number((calculateExpression(calcExpression) / 100).toPrecision(12))))
      } catch (error) {
        setCalcError(error.message || "Check expression")
      }
      return
    }
    setCalcExpression((value) => `${value}${key}`)
  }

  function openNotification(notification) {
    markNotificationRead(notification.id)
    setNotificationOpen(false)
    navigate("/reminders")
  }

  function formatNotificationTime(value) {
    if (!value) return ""
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ""
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  useEffect(() => {
    setShopOpen(false)
    setUserOpen(false)
    setCalculatorOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!shopOpen) setShopQuery("")
  }, [shopOpen])

  const shopList = shops || []
  const showShopSearch = shopList.length > SHOP_SEARCH_MIN

  const filteredShops = useMemo(() => {
    const query = shopQuery.trim().toLowerCase()
    if (!query) return shopList
    return shopList.filter((shop) => String(shop.name || "").toLowerCase().includes(query))
  }, [shopList, shopQuery])

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOut()
      navigate("/login")
    } catch (error) {
      console.error("Sign out failed:", error)
      setSigningOut(false)
    }
  }

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "User"
  const initials = getInitials(displayName)
  const avatarUrl = profile?.avatar_url
  const isDark = theme === "dark"
  const pageTitle = getPageTitle(pathname)

  const bellLabel =
    unreadCount > 0
      ? `${unreadCount} unread ${unreadCount === 1 ? "notification" : "notifications"}`
      : "No unread notifications"

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur transition-colors dark:border-slate-800 dark:bg-slate-950/95 sm:gap-3 sm:px-4 lg:px-6">
      {/* ================= LEFT ================= */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className={cn(ICON_BUTTON, "lg:hidden")}
        >
          <Menu className="h-5 w-5 text-slate-600 dark:text-slate-400" aria-hidden="true" />
        </button>

        <div className="hidden min-w-0 lg:block">
          <h1 className="truncate text-[17px] font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100">
            {pageTitle}
          </h1>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {currentShop?.name || "No shop selected"}
          </p>
        </div>

        <div className="hidden h-8 w-px bg-slate-200 dark:bg-slate-800 lg:block" aria-hidden="true" />

        {/* Shop switcher */}
        <div className="relative" ref={shopRef}>
          <button
            type="button"
            onClick={() => {
              setShopOpen((open) => !open)
              setUserOpen(false)
              setNotificationOpen(false)
            }}
            aria-haspopup="menu"
            aria-expanded={shopOpen}
            aria-label="Switch shop"
            className={cn(
              "inline-flex h-10 max-w-[150px] cursor-pointer items-center gap-2 rounded-xl border border-violet-200 bg-white/90 px-3 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800 sm:max-w-[220px] sm:gap-2.5 sm:px-4",
              shopOpen && "border-emerald-500 ring-2 ring-emerald-500/20 dark:border-emerald-500"
            )}
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-50 dark:bg-emerald-900/30">
              <Store className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            </div>
            <span className="truncate text-slate-800 dark:text-slate-200">
              {currentShop?.name || "Select Shop"}
            </span>
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", shopOpen && "rotate-180")}
              aria-hidden="true"
            />
          </button>

          {shopOpen && (
            <div
              role="menu"
              aria-label="Your shops"
              className="absolute left-0 top-full z-50 mt-2 w-[270px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:w-72"
            >
              <p className="px-3 pb-1.5 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Your Shops
              </p>

              {showShopSearch && (
                <div className="relative px-3 pb-2">
                  <Search
                    className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-y-[60%] text-slate-400"
                    style={{ left: "1.375rem" }}
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={shopQuery}
                    onChange={(e) => setShopQuery(e.target.value)}
                    placeholder="Search shops"
                    aria-label="Search shops"
                    autoFocus
                    className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                </div>
              )}

              <div className="max-h-64 overflow-y-auto pb-1.5">
                {shopList.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-slate-500">No shops yet</p>
                ) : filteredShops.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-slate-500">No shop matches "{shopQuery}"</p>
                ) : (
                  filteredShops.map((shop) => {
                    const selected = currentShop?.id === shop.id
                    return (
                      <button
                        key={shop.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selected}
                        onClick={() => {
                          selectShop(shop)
                          setShopOpen(false)
                        }}
                        className={cn(
                          "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm font-medium transition-all hover:border-violet-100 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 dark:hover:border-slate-700 dark:hover:bg-slate-800",
                          selected && "bg-emerald-50/60 dark:bg-emerald-900/20"
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                            selected
                              ? "border-emerald-200 bg-white text-emerald-600 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-400"
                              : "border-slate-100 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                          )}
                        >
                          <Store className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "truncate font-medium",
                              selected
                                ? "text-emerald-700 dark:text-emerald-400"
                                : "text-slate-700 dark:text-slate-300"
                            )}
                          >
                            {shop.name}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {shop.business_type || "General Store"}
                          </p>
                        </div>
                        {selected && (
                          <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                        )}
                      </button>
                    )
                  })
                )}
              </div>

              <div className="border-t border-slate-100 py-1.5 dark:border-slate-800">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShopOpen(false)
                    navigate("/settings")
                  }}
                  className={cn(ACTION_BUTTON, "h-10 w-full cursor-pointer justify-start border-transparent bg-transparent text-emerald-700 shadow-none hover:border-violet-100 hover:bg-violet-50 dark:text-emerald-400 dark:hover:border-slate-700 dark:hover:bg-slate-800")}
                >
                  <Settings className="h-4 w-4" aria-hidden="true" />
                  Manage Shops
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================= RIGHT ================= */}
      <div className="flex items-center gap-1 sm:gap-2">
        {!online && (
          <span
            role="status"
            className="hidden items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400 sm:inline-flex"
          >
            <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
            Offline
          </span>
        )}

        {pathname !== "/bills/new" && (
          <Link to="/bills/new" className={cn(ACTION_BUTTON, "hidden sm:inline-flex")}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create bill
          </Link>
        )}

        {/* Notifications */}
        <div className="relative" ref={notificationRef}>
          <button
            type="button"
            onClick={() => {
              setNotificationOpen((open) => !open)
              setShopOpen(false)
              setUserOpen(false)
            }}
            className={ICON_BUTTON}
            title={bellLabel}
            aria-label={bellLabel}
            aria-haspopup="dialog"
            aria-expanded={notificationOpen}
          >
            {unreadCount > 0
              ? <BellRing className="h-5 w-5" aria-hidden="true" />
              : <Bell className="h-5 w-5" aria-hidden="true" />}
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-slate-950">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {notificationOpen && (
            <div
              role="dialog"
              aria-label="Important notifications"
              className="fixed inset-x-2 top-[4.5rem] z-[60] mx-auto flex max-h-[calc(100dvh-5.5rem)] w-auto max-w-md flex-col overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-[0_18px_50px_rgba(30,27,75,0.18)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mx-0 sm:mt-2 sm:max-h-[min(34rem,calc(100dvh-6rem))] sm:w-[min(22rem,calc(100vw-1.5rem))]"
            >
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                    <BellRing className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Notifications</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {unreadCount} unread
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setNotificationOpen(false)}
                  className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  aria-label="Close notifications"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {notifications.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800 sm:px-4">
                  {unreadCount > 0 ? (
                    <button
                      type="button"
                      onClick={markAllNotificationsRead}
                      disabled={notificationActionLoading}
                      className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold text-violet-700 transition hover:bg-violet-50 disabled:opacity-50 dark:text-violet-300 dark:hover:bg-slate-800"
                    >
                      {notificationActionLoading
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <CheckCheck className="h-3.5 w-3.5" />}
                      Mark all as read
                    </button>
                  ) : <span className="px-2 text-[11px] text-slate-400">All caught up</span>}
                  <button
                    type="button"
                    onClick={clearAllNotifications}
                    disabled={notificationActionLoading}
                    className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                  >
                    {notificationActionLoading
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />}
                    Clear all
                  </button>
                </div>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto">
                {notificationLoading ? (
                  <div className="flex items-center justify-center gap-2 px-4 py-10 text-xs text-slate-500 dark:text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading notifications…
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center px-5 py-9 text-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                      <Check className="h-5 w-5" />
                    </span>
                    <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">You're all caught up</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Important shop updates will appear here.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {notifications.map((notification) => {
                      const title = notification.title || "Shop notification"
                      const body = notification.body || notification.message || "An important shop event occurred."
                      return (
                        <button
                          key={notification.id}
                          type="button"
                          onClick={() => openNotification(notification)}
                          className={cn(
                            "flex w-full cursor-pointer gap-3 px-4 py-3 text-left transition-colors hover:bg-violet-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 dark:hover:bg-slate-800/80",
                            !notification.is_read && "bg-violet-50/40 dark:bg-violet-500/[0.06]"
                          )}
                        >
                          <span className={cn(
                            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                            notification.is_read
                              ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                              : "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                          )}>
                            <Bell className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-2">
                              <span className={cn(
                                "line-clamp-1 text-xs",
                                notification.is_read
                                  ? "font-medium text-slate-700 dark:text-slate-300"
                                  : "font-bold text-slate-900 dark:text-slate-100"
                              )}>{title}</span>
                              {!notification.is_read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-violet-600" />}
                            </span>
                            <span className="mt-1 line-clamp-2 block text-[11px] leading-4 text-slate-500 dark:text-slate-400">{body}</span>
                            <span className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                              <Clock3 className="h-3 w-3" />
                              {formatNotificationTime(notification.created_at)}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 p-2.5 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setNotificationOpen(false)
                    navigate("/reminders")
                  }}
                  className="flex h-9 w-full cursor-pointer items-center justify-center rounded-xl bg-violet-50 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20"
                >
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Calculator */}
        <div className="relative hidden sm:block" ref={calculatorRef}>
          <button
            type="button"
            onClick={(event) => {
              const willOpen = !calculatorOpen
              if (willOpen) {
                const rect = event.currentTarget.getBoundingClientRect()
                const panelWidth = calculatorLarge ? 440 : 360
                const panelHeight = calculatorMinimized ? 76 : (calculatorLarge ? 620 : 540)
                const left = Math.max(8, Math.min(window.innerWidth - Math.min(panelWidth, window.innerWidth - 16) - 8, rect.right - Math.min(panelWidth, window.innerWidth - 16)))
                const preferredTop = rect.bottom + 10
                const top = preferredTop + Math.min(panelHeight, window.innerHeight - 16) > window.innerHeight
                  ? Math.max(8, rect.top - Math.min(panelHeight, window.innerHeight - 16) - 10)
                  : preferredTop
                setCalculatorPosition({ left, top })
              }
              setCalculatorOpen(willOpen)
              setNotificationOpen(false)
              setShopOpen(false)
              setUserOpen(false)
            }}
            className="relative hidden h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300 sm:inline-flex"
            title="Calculator"
            aria-label="Open calculator"
            aria-haspopup="dialog"
            aria-expanded={calculatorOpen}
          >
            <Calculator className="h-4 w-4" aria-hidden="true" />
            <span>Calculator</span>
          </button>

          {calculatorOpen && (
            <div
              data-calculator-panel
              role="dialog"
              aria-label="Quick calculator"
              style={{
                position: "fixed",
                zIndex: 9999,
                ...(calculatorPosition ? { left: calculatorPosition.left, top: calculatorPosition.top, right: "auto" } : { right: 24, top: 64 }),
                width: calculatorLarge ? "min(440px, calc(100vw - 24px))" : "min(360px, calc(100vw - 24px))",
                height: calculatorMinimized ? "auto" : (calculatorLarge ? "min(620px, calc(100dvh - 32px))" : "min(540px, calc(100dvh - 32px))"),
                minWidth: 300,
                minHeight: calculatorMinimized ? "auto" : 300,
                maxWidth: "calc(100vw - 16px)",
                maxHeight: "calc(100dvh - 16px)",
                resize: calculatorMinimized ? "none" : "both",
                overflow: "auto",
              }}
              className="rounded-[18px] border border-slate-200 bg-white p-3 shadow-[0_14px_36px_rgba(15,23,42,0.16)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <div
                className="mb-3 flex cursor-move select-none items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800"
                onPointerDown={(event) => {
                  if (event.target.closest("button")) return
                  const rect = event.currentTarget.parentElement.getBoundingClientRect()
                  calculatorDragRef.current = { startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top }
                  setCalculatorPosition({ left: rect.left, top: rect.top })
                }}
                title="Drag to move calculator"
              >
                <div className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
                  <Calculator className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  Calculator
                  <span className="hidden text-[10px] font-medium text-slate-400 sm:inline">DRAG TO MOVE</span>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setCalculatorMinimized((v) => !v)} aria-label={calculatorMinimized ? "Restore calculator" : "Minimize calculator"} title={calculatorMinimized ? "Restore" : "Minimize"} className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                    <Minus className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => setCalculatorLarge((v) => !v)} aria-label="Toggle calculator size" title="Toggle size" className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                    <Maximize2 className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => setCalculatorOpen(false)} aria-label="Close calculator" className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {!calculatorMinimized && <>
                <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                  {/* ✅ FIX: ref so we can refocus; typing works after outside click */}
                  <input
                    ref={calcInputRef}
                    type="text"
                    value={calcExpression}
                    onChange={(event) => {
                      setCalcExpression(event.target.value.replace(/[^0-9.+*/%()\-]/g, ""))
                      setCalcError("")
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === "=") {
                        event.preventDefault()
                        handleCalculatorKey("=")
                      } else if (event.key === "Escape") {
                        event.preventDefault()
                        setCalculatorOpen(false)
                      }
                    }}
                    autoFocus
                    aria-label="Type calculation using your keyboard"
                    placeholder="Type or use calculator keys"
                    className="min-h-8 w-full border-0 bg-transparent p-0 text-right text-sm text-slate-500 outline-none placeholder:text-slate-400 focus:ring-0 dark:text-slate-300 dark:placeholder:text-slate-500"
                  />
                  <div className="mt-1 min-h-9 break-all text-right text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {calcError ? <span className="text-xs font-medium text-rose-500">{calcError}</span> : (() => { try { return calcExpression ? calculateExpression(calcExpression).toLocaleString("en-IN") : "0" } catch { return "0" } })()}
                  </div>
                </div>
                <p className="mb-2 text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">Keyboard: type numbers/operators · Enter = calculate · Backspace = delete · Esc = close</p>
                <div className="mb-1.5 grid grid-cols-4 gap-1.5">
                  {["√", "x²", "±", "%"].map((key) => <button key={key} type="button" onClick={() => handleCalculatorKey(key)} className="h-9 cursor-pointer rounded-lg border border-emerald-100 bg-emerald-50 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20">{key}</button>)}
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {["AC", "DEL", "(", ")", "7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", "00", ".", "+"].map((key) => (
                    <button key={key} type="button" onClick={() => handleCalculatorKey(key)} className={cn("h-10 cursor-pointer rounded-lg border text-sm font-semibold transition active:scale-95", ["AC", "DEL"].includes(key) ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300" : ["/", "*", "-", "+"].includes(key) ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700")}>{key}</button>
                  ))}
                  <button type="button" onClick={() => handleCalculatorKey("=")} className="col-span-4 h-11 cursor-pointer rounded-xl bg-emerald-600 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.99]">Calculate =</button>
                </div>
              </>}
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className={ICON_BUTTON}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
        </button>

        <div className="mx-1 hidden h-8 w-px bg-slate-200 dark:bg-slate-800 sm:block" aria-hidden="true" />

        {/* User menu */}
        <div className="relative" ref={userRef}>
          <button
            type="button"
            onClick={() => {
              setUserOpen((open) => !open)
              setShopOpen(false)
              setNotificationOpen(false)
            }}
            aria-haspopup="menu"
            aria-expanded={userOpen}
            aria-label="Account menu"
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-slate-800 sm:pr-2.5",
              userOpen && "bg-slate-50 dark:bg-slate-800"
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-emerald-100 text-sm font-semibold text-emerald-700 shadow-sm dark:border-slate-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </div>

            <div className="hidden min-w-0 text-left md:block">
              <p className="max-w-[120px] truncate text-sm font-semibold leading-tight text-slate-800 dark:text-slate-200">
                {displayName}
              </p>
              <p className="max-w-[120px] truncate text-[11px] capitalize leading-tight text-slate-500 dark:text-slate-400">
                {profile?.role || "Owner"}
              </p>
            </div>

            <ChevronDown
              className={cn("hidden h-4 w-4 text-slate-400 transition-transform md:block", userOpen && "rotate-180")}
              aria-hidden="true"
            />
          </button>

          {userOpen && (
            <div
              role="menu"
              aria-label="Account menu"
              className="absolute right-0 top-full z-50 mt-2 w-[min(15rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-violet-100 bg-white py-1.5 shadow-xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30"
            >
              <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {displayName}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{user?.email}</p>
                </div>
              </div>

              <div className="pt-1.5">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setUserOpen(false)
                    navigate("/profile")
                  }}
                  className={MENU_ITEM}
                >
                  <User className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  My Profile
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setUserOpen(false)
                    navigate("/settings")
                  }}
                  className={MENU_ITEM}
                >
                  <Settings className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  Settings
                </button>
              </div>

              <div className="mt-1.5 border-t border-slate-100 pt-1.5 dark:border-slate-800">
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className={cn(
                    MENU_ITEM,
                    "font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/30"
                  )}
                >
                  {signingOut ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                  )}
                  {signingOut ? "Signing out..." : "Sign Out"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}