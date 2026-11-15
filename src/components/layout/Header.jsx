import {
  Bell,
  ChevronDown,
  Check,
  Loader2,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  Store,
  Sun,
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

const SHOP_SEARCH_MIN = 5 // show the search box when there are more shops than this
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

function getLocalDateString() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

// Number of bills that are unpaid and past their due date
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

      // The bell is optional, so fail quietly
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

const ACTION_BUTTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"

const ICON_BUTTON =
  "relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-white/90 text-slate-600 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"

const MENU_ITEM =
  "flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-violet-50 focus-visible:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800"

/* ==================================================
   HEADER
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

  const shopRef = useRef(null)
  const userRef = useRef(null)

  const overdueCount = useOverdueCount(currentShop?.id)
  const online = useOnlineStatus()

  // Close menus on outside click or Escape
  useEffect(() => {
    if (!shopOpen && !userOpen) return

    function handleClick(e) {
      if (shopRef.current && !shopRef.current.contains(e.target)) setShopOpen(false)
      if (userRef.current && !userRef.current.contains(e.target)) setUserOpen(false)
    }
    function handleKey(e) {
      if (e.key === "Escape") {
        setShopOpen(false)
        setUserOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleKey)
    }
  }, [shopOpen, userOpen])

  // Close menus when the page changes
  useEffect(() => {
    setShopOpen(false)
    setUserOpen(false)
  }, [pathname])

  // Reset the search each time the shop menu closes
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
    overdueCount > 0
      ? `${overdueCount} overdue ${overdueCount === 1 ? "bill" : "bills"}`
      : "No overdue bills"

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur transition-colors dark:border-slate-800 dark:bg-slate-950/95 sm:gap-3 sm:px-4 lg:px-6">
      {/* ================= LEFT ================= */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {/* Mobile menu button */}
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className={cn(ICON_BUTTON, "lg:hidden")}
        >
          <Menu className="h-5 w-5 text-slate-600 dark:text-slate-400" aria-hidden="true" />
        </button>

        {/* Page title (desktop) */}
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
            }}
            aria-haspopup="menu"
            aria-expanded={shopOpen}
            aria-label="Switch shop"
            className={cn(
              "inline-flex h-10 max-w-[150px] items-center gap-2 rounded-xl border border-violet-200 bg-white/90 px-3 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800 sm:max-w-[220px] sm:gap-2.5 sm:px-4",
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
                    className="pointer-events-none absolute left-5.5 top-1/2 h-3.5 w-3.5 -translate-y-[60%] text-slate-400"
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
                          "flex min-h-11 w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm font-medium transition-all hover:border-violet-100 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 dark:hover:border-slate-700 dark:hover:bg-slate-800",
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
                  className={cn(ACTION_BUTTON, "h-10 w-full justify-start border-transparent bg-transparent text-emerald-700 shadow-none hover:border-violet-100 hover:bg-violet-50 dark:text-emerald-400 dark:hover:border-slate-700 dark:hover:bg-slate-800")}
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
        {/* Offline badge */}
        {!online && (
          <span
            role="status"
            className="hidden items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400 sm:inline-flex"
          >
            <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
            Offline
          </span>
        )}

        {/* Quick action: create bill */}
        {pathname !== "/bills/new" && (
          <Link
            to="/bills/new"
            className={cn(ACTION_BUTTON, "hidden sm:inline-flex")}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create bill
          </Link>
        )}

        {/* Overdue bills bell */}
        <Link to="/dues" className={ICON_BUTTON} title={bellLabel} aria-label={bellLabel}>
          <Bell className="h-5 w-5" aria-hidden="true" />
          {overdueCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-slate-950">
              {overdueCount > 99 ? "99+" : overdueCount}
            </span>
          )}
        </Link>

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
            }}
            aria-haspopup="menu"
            aria-expanded={userOpen}
            aria-label="Account menu"
            className={cn(
              "flex items-center gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-slate-800 sm:pr-2.5",
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