import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { createPortal } from "react-dom"
import {
  LayoutDashboard, Users, FileText, PlusCircle, BookOpen,
  AlertCircle, CreditCard, Settings, Store, UserCircle,
  X, ChevronDown, TrendingUp, LogOut, Check, Plus,
  ChevronsLeft, ChevronsRight, Sun, Moon, Loader2,
  MapPin, ScanLine, Command,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useShop } from "@/contexts/ShopContext"
import { useAuth } from "@/contexts/AuthContext"
import { useTheme } from "@/contexts/ThemeContext"

/* ==================================================
   CONSTANTS & HELPERS
================================================== */

const STORAGE_KEY = "sidebar-collapsed"
const WIDTH_STORAGE_KEY = "sidebar-width"
const MIN_SIDEBAR_WIDTH = 220
const MAX_SIDEBAR_WIDTH = 380
const DEFAULT_SIDEBAR_WIDTH = 260
const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
]

const navGroups = [
  {
    label: "Overview",
    items: [
      { to: "/", icon: LayoutDashboard, label: "Dashboard" },
      { to: "/command-center", icon: Command, label: "Command Center" },
    ],
  },
  {
    label: "Billing",
    items: [
      { to: "/bills/new", icon: PlusCircle, label: "Create Bill" },
      { to: "/bills/import", icon: ScanLine, label: "Import Offline Bill" },
      { to: "/bills", icon: FileText, label: "All Bills" },
      { to: "/dues", icon: AlertCircle, label: "Dues" },
      { to: "/town-collections", icon: MapPin, label: "Town Collection" },
      { to: "/payments", icon: CreditCard, label: "Payments" },
    ],
  },
  {
    label: "People & Ledger",
    items: [
      { to: "/customers", icon: Users, label: "Customers" },
      { to: "/khata", icon: BookOpen, label: "Personal Khata" },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/settings", icon: Settings, label: "Shop Settings" },
      { to: "/profile", icon: UserCircle, label: "My Profile" },
    ],
  },
]

function isRouteActive(to, pathname) {
  if (to === "/") return pathname === "/"

  if (to === "/bills") {
    return pathname.startsWith("/bills") && pathname !== "/bills/new"
  }

  return pathname === to || pathname.startsWith(`${to}/`)
}

function getInitials(name = "") {
  return (
    name.trim().split(/\s+/).slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U"
  )
}

/* ==================================================
   SMALL UI PIECES
================================================== */

function BrandLogo({ compact }) {
  const [failed, setFailed] = useState(false)

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-2 ring-emerald-600/90 shadow-sm transition-all duration-200 dark:bg-white dark:ring-emerald-400",
        compact ? "h-9 w-9" : "h-10 w-10"
      )}
    >
      {failed ? (
        <span className="text-xl font-extrabold text-[#0f8a4b] dark:text-emerald-400">
          K
        </span>
      ) : (
        <img
          src="/Logo/hh.png"
          alt="KhaataPro logo"
          className="h-full w-full rounded-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}

function MenuLabel({ children }) {
  return (
    <p className="px-2 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
      {children}
    </p>
  )
}

const MENU_ITEM =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f8a4b] dark:focus-visible:ring-emerald-400"

/* ==================================================
   SIDEBAR
================================================== */

export function Sidebar({ open, onClose }) {
  const { currentShop, shops, selectShop } = useShop()
  const { user, profile, signOut } = useAuth()

  const { pathname } = useLocation()
  const navigate = useNavigate()

  const { theme, setTheme } = useTheme()

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1"
    } catch {
      return false
    }
  })

  const [shopMenuOpen, setShopMenuOpen] = useState(false)
  const [shopMenuPosition, setShopMenuPosition] = useState(null)

  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [profileMenuPosition, setProfileMenuPosition] = useState(null)

  const [loggingOut, setLoggingOut] = useState(false)

  const shopMenuRef = useRef(null)
  const shopMenuButtonRef = useRef(null)
  const shopDropdownRef = useRef(null)

  const profileMenuRef = useRef(null)
  const profileMenuButtonRef = useRef(null)
  const profileDropdownRef = useRef(null)

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(WIDTH_STORAGE_KEY))
      return Number.isFinite(saved) && saved >= MIN_SIDEBAR_WIDTH && saved <= MAX_SIDEBAR_WIDTH
        ? saved
        : DEFAULT_SIDEBAR_WIDTH
    } catch {
      return DEFAULT_SIDEBAR_WIDTH
    }
  })
  const [isResizing, setIsResizing] = useState(false)

  const compact = collapsed && !open

  const handleResizeStart = (event) => {
    if (window.innerWidth < 1024) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setIsResizing(true)
  }

  const handleResizeMove = (event) => {
    if (!isResizing) return

    const sidebarLeft = event.currentTarget.parentElement?.getBoundingClientRect().left || 0
    const requestedWidth = event.clientX - sidebarLeft

    // Dragging close to the left edge fully collapses the sidebar.
    if (!collapsed && requestedWidth <= 145) {
      setCollapsed(true)
      try { localStorage.setItem(STORAGE_KEY, "1") } catch {}
      return
    }

    // Dragging the edge outwards expands a collapsed sidebar again.
    if (collapsed && requestedWidth > 145) {
      setCollapsed(false)
      try { localStorage.setItem(STORAGE_KEY, "0") } catch {}
    }

    const nextWidth = Math.min(
      MAX_SIDEBAR_WIDTH,
      Math.max(MIN_SIDEBAR_WIDTH, requestedWidth)
    )
    setSidebarWidth(nextWidth)
    try {
      localStorage.setItem(WIDTH_STORAGE_KEY, String(nextWidth))
    } catch {}
  }

  const handleResizeEnd = () => setIsResizing(false)

  const handleResizeReset = () => {
    setCollapsed(false)
    setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)
    setIsResizing(false)
    try {
      localStorage.setItem(STORAGE_KEY, "0")
      localStorage.setItem(WIDTH_STORAGE_KEY, String(DEFAULT_SIDEBAR_WIDTH))
    } catch {}
  }

  const displayName =
    profile?.full_name ||
    user?.email?.split("@")[0] ||
    "User"

  /* ==================================================
     KEYBOARD EVENTS
  ================================================== */

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return

      if (shopMenuOpen || profileMenuOpen) {
        setShopMenuOpen(false)
        setShopMenuPosition(null)

        setProfileMenuOpen(false)
        setProfileMenuPosition(null)
      } else if (open) {
        onClose?.()
      }
    }

    document.addEventListener("keydown", onKeyDown)

    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onClose, shopMenuOpen, profileMenuOpen])

  /* ==================================================
     OUTSIDE CLICK
  ================================================== */

  useEffect(() => {
    if (!shopMenuOpen && !profileMenuOpen) return

    const onPointerDown = (event) => {
      const clickedShopTrigger =
        shopMenuRef.current?.contains(event.target)

      const clickedShopDropdown =
        shopDropdownRef.current?.contains(event.target)

      if (!clickedShopTrigger && !clickedShopDropdown) {
        setShopMenuOpen(false)
        setShopMenuPosition(null)
      }

      const clickedProfileTrigger =
        profileMenuRef.current?.contains(event.target)

      const clickedProfileDropdown =
        profileDropdownRef.current?.contains(event.target)

      if (!clickedProfileTrigger && !clickedProfileDropdown) {
        setProfileMenuOpen(false)
        setProfileMenuPosition(null)
      }
    }

    document.addEventListener("mousedown", onPointerDown)

    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [shopMenuOpen, profileMenuOpen])

  /* ==================================================
     SHOP MENU VIEWPORT
  ================================================== */

  useEffect(() => {
    if (!shopMenuOpen) return

    const closeOnViewportChange = () => {
      setShopMenuOpen(false)
      setShopMenuPosition(null)
    }

    window.addEventListener("resize", closeOnViewportChange)
    window.addEventListener("scroll", closeOnViewportChange, true)

    return () => {
      window.removeEventListener("resize", closeOnViewportChange)
      window.removeEventListener("scroll", closeOnViewportChange, true)
    }
  }, [shopMenuOpen])

  /* ==================================================
     ROUTE CHANGE
  ================================================== */

  useEffect(() => {
    setShopMenuOpen(false)
    setProfileMenuOpen(false)
    setProfileMenuPosition(null)
  }, [pathname])

  /* ==================================================
     MOBILE SCROLL LOCK
  ================================================== */

  useEffect(() => {
    if (!open) return

    const previous = document.body.style.overflow

    document.body.style.overflow = "hidden"

    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  /* ==================================================
     SHOP MENU
  ================================================== */

  function toggleShopMenu() {
    setProfileMenuOpen(false)

    if (shopMenuOpen) {
      setShopMenuOpen(false)
      setShopMenuPosition(null)
      return
    }

    const trigger = shopMenuButtonRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const viewportPadding = 12

    const menuWidth = Math.min(
      288,
      window.innerWidth - viewportPadding * 2
    )

    const preferredLeft = compact
      ? rect.right + 8
      : rect.left

    const left = Math.max(
      viewportPadding,
      Math.min(
        preferredLeft,
        window.innerWidth - menuWidth - viewportPadding
      )
    )

    const estimatedMenuHeight = Math.min(
      360,
      window.innerHeight - viewportPadding * 2
    )

    const preferredTop = compact
      ? rect.top
      : rect.bottom + 8

    const top = Math.max(
      viewportPadding,
      Math.min(
        preferredTop,
        window.innerHeight - estimatedMenuHeight - viewportPadding
      )
    )

    setShopMenuPosition({
      top,
      left,
      width: menuWidth,
      maxHeight: estimatedMenuHeight,
    })

    setShopMenuOpen(true)
  }

  function handleShopSelect(shop) {
    if (!shop?.id) return

    try {
      selectShop(shop)

      setShopMenuOpen(false)
      setShopMenuPosition(null)

      if (open) onClose?.()
    } catch (error) {
      console.error("Could not switch shop:", error)
    }
  }

  /* ==================================================
     PROFILE MENU
  ================================================== */

  function toggleProfileMenu() {
    setShopMenuOpen(false)
    setShopMenuPosition(null)

    if (profileMenuOpen) {
      setProfileMenuOpen(false)
      setProfileMenuPosition(null)
      return
    }

    const trigger = profileMenuButtonRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const viewportPadding = 12

    const estimatedHeight = Math.min(
      340,
      window.innerHeight - viewportPadding * 2
    )

    if (compact) {
      const menuWidth = Math.min(
        240,
        window.innerWidth - viewportPadding * 2
      )

      const left = Math.max(
        viewportPadding,
        Math.min(
          rect.right + 8,
          window.innerWidth - menuWidth - viewportPadding
        )
      )

      const top = Math.max(
        viewportPadding,
        Math.min(
          rect.top,
          window.innerHeight - estimatedHeight - viewportPadding
        )
      )

      setProfileMenuPosition({
        top,
        left,
        width: menuWidth,
        maxHeight: estimatedHeight,
      })
    } else {
      const menuWidth = Math.min(
        280,
        Math.max(220, rect.width - 24),
        window.innerWidth - viewportPadding * 2
      )

      const left = Math.max(
        viewportPadding,
        Math.min(
          rect.left + (rect.width - menuWidth) / 2,
          window.innerWidth - menuWidth - viewportPadding
        )
      )

      const top = Math.max(
        viewportPadding,
        Math.min(
          rect.top - estimatedHeight - 8,
          window.innerHeight - estimatedHeight - viewportPadding
        )
      )

      setProfileMenuPosition({
        top,
        left,
        width: menuWidth,
        maxHeight: estimatedHeight,
      })
    }

    setProfileMenuOpen(true)
  }

  useEffect(() => {
    if (!profileMenuOpen) return

    const closeOnViewportChange = () => {
      setProfileMenuOpen(false)
      setProfileMenuPosition(null)
    }

    window.addEventListener("resize", closeOnViewportChange)
    window.addEventListener("scroll", closeOnViewportChange, true)

    return () => {
      window.removeEventListener("resize", closeOnViewportChange)
      window.removeEventListener("scroll", closeOnViewportChange, true)
    }
  }, [profileMenuOpen])

  /* ==================================================
     COLLAPSE SIDEBAR
  ================================================== */

  function toggleCollapsed() {
    setShopMenuOpen(false)
    setProfileMenuOpen(false)

    setCollapsed((prev) => {
      const next = !prev

      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0")
      } catch {}

      return next
    })
  }

  /* ==================================================
     LOGOUT
  ================================================== */

  async function handleLogout() {
    setLoggingOut(true)

    try {
      await signOut()

      setLoggingOut(false)
      navigate("/login")
    } catch (error) {
      console.error("Logout failed:", error)
      setLoggingOut(false)
    }
  }

  /* ==================================================
     RENDER
  ================================================== */

  return (
    <>
      <style>{`
        /* Keep the sidebar scrollbar invisible until the sidebar is engaged. */
        .khaatapro-sidebar-nav {
          scrollbar-width: none;
          scrollbar-color: transparent transparent;
        }
        .khaatapro-sidebar-nav::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .khaatapro-sidebar-nav::-webkit-scrollbar-track {
          background: transparent;
        }
        .khaatapro-sidebar-nav::-webkit-scrollbar-thumb {
          background: transparent;
          border-radius: 999px;
          transition: background-color 180ms ease;
        }
        .khaatapro-sidebar:hover .khaatapro-sidebar-nav,
        .khaatapro-sidebar:focus-within .khaatapro-sidebar-nav {
          scrollbar-width: thin;
          scrollbar-color: rgba(148, 163, 184, 0.72) transparent;
        }
        .khaatapro-sidebar:hover .khaatapro-sidebar-nav::-webkit-scrollbar-thumb,
        .khaatapro-sidebar:focus-within .khaatapro-sidebar-nav::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.72);
        }
        .dark .khaatapro-sidebar:hover .khaatapro-sidebar-nav,
        .dark .khaatapro-sidebar:focus-within .khaatapro-sidebar-nav {
          scrollbar-color: rgba(100, 116, 139, 0.85) transparent;
        }
        .dark .khaatapro-sidebar:hover .khaatapro-sidebar-nav::-webkit-scrollbar-thumb,
        .dark .khaatapro-sidebar:focus-within .khaatapro-sidebar-nav::-webkit-scrollbar-thumb {
          background: rgba(100, 116, 139, 0.85);
        }
        @media (prefers-reduced-motion: reduce) {
          .khaatapro-sidebar-nav::-webkit-scrollbar-thumb {
            transition: none;
          }
        }
      `}</style>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden dark:bg-black/60"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Main navigation"
        className={cn(
          "khaatapro-sidebar relative fixed left-0 top-0 z-50 flex h-dvh max-h-dvh max-w-[88vw] flex-col border-r border-slate-100 bg-white transition-[transform] duration-300 ease-out dark:border-slate-800 dark:bg-slate-900 lg:static lg:h-full lg:max-h-none lg:z-auto lg:max-w-none",
          isResizing && "select-none transition-none",
          open
            ? "translate-x-0 shadow-2xl dark:shadow-black/50"
            : "-translate-x-full lg:translate-x-0 lg:shadow-none"
        )}
        style={{ width: compact ? 80 : sidebarWidth }}
      >

        {/* BRAND HEADER */}
        <div
          className={cn(
            "group relative flex h-[72px] shrink-0 items-center border-b border-slate-100/60 transition-all duration-300 dark:border-slate-800",
            compact ? "justify-center px-2" : "justify-between px-5"
          )}
        >
          <div
            className={cn(
              "relative flex items-center justify-center",
              compact && "h-10 w-10 rounded-xl"
            )}
          >
            <div
              className={cn(
                "transition-all duration-200",
                compact && "group-hover:scale-90 group-hover:opacity-0"
              )}
            >
              <Link
                to="/"
                onClick={onClose}
                aria-label="KhaataPro home"
                className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f8a4b] dark:focus-visible:ring-emerald-400"
              >
                <BrandLogo compact={compact} />

                {!compact && (
                  <div className="flex flex-col">
                    <span className="text-[16px] font-extrabold leading-none tracking-tight text-[#0f8a4b] dark:text-emerald-400">
                      KHAATAPRO
                    </span>

                    <span className="mt-1 text-[10px] font-medium leading-none text-slate-500 dark:text-slate-400">
                      Digital Khata Book
                    </span>
                  </div>
                )}
              </Link>
            </div>

            {/* Expand button */}
            {compact && (
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label="Expand sidebar"
                title="Expand sidebar"
                className="absolute inset-0 z-20 flex items-center justify-center rounded-xl border border-transparent bg-transparent text-[#0f8a4b] opacity-0 transition-all duration-200 hover:border-emerald-200 hover:bg-emerald-50 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f8a4b] dark:text-emerald-400 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10 dark:focus-visible:ring-emerald-400"
              >
                <ChevronsRight size={20} strokeWidth={2.2} aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Collapse button */}
          {!compact && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-slate-400 transition-all duration-200 hover:border-emerald-200 hover:bg-emerald-50 hover:text-[#0f8a4b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f8a4b] dark:text-slate-500 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400 dark:focus-visible:ring-emerald-400 lg:flex"
            >
              <ChevronsLeft size={18} strokeWidth={2.2} aria-hidden="true" />
            </button>
          )}

          {/* Mobile close */}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f8a4b] dark:text-slate-500 dark:hover:bg-slate-800 dark:focus-visible:ring-emerald-400 lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* SHOP SWITCHER */}
        <div
          className="relative z-[60] px-4 pb-4 pt-4"
          ref={shopMenuRef}
        >
          <button
            ref={shopMenuButtonRef}
            type="button"
            onClick={toggleShopMenu}
            aria-haspopup="menu"
            aria-expanded={shopMenuOpen}
            aria-label={
              compact
                ? `Current shop: ${currentShop?.name || "none"}. Switch shop`
                : undefined
            }
            title={compact ? currentShop?.name || "Select a shop" : undefined}
            className={cn(
              "group flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white text-left shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f8a4b] dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:focus-visible:ring-emerald-400",
              compact ? "justify-center p-2.5" : "px-3 py-2"
            )}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex shrink-0 items-center justify-center rounded-md text-slate-700 dark:text-slate-300">
                <Store className="h-4 w-4" aria-hidden="true" />
              </div>

              {!compact && (
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold leading-none text-slate-400 dark:text-slate-500">
                    Shop
                  </p>

                  <p className="mt-1 truncate text-[13.5px] font-semibold leading-tight text-slate-800 dark:text-slate-100">
                    {currentShop?.name || "Select a shop"}
                  </p>
                </div>
              )}
            </div>

            {!compact && (
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-slate-400 transition-transform",
                  shopMenuOpen && "rotate-180"
                )}
                aria-hidden="true"
              />
            )}
          </button>
        </div>

        {/* SHOP DROPDOWN */}
        {shopMenuOpen && shopMenuPosition && createPortal(
          <div
            ref={shopDropdownRef}
            role="menu"
            aria-label="Switch shop"
            style={{
              position: "fixed",
              top: shopMenuPosition.top,
              left: shopMenuPosition.left,
              width: shopMenuPosition.width,
              maxHeight: shopMenuPosition.maxHeight,
            }}
            className="z-[1000] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_55px_-16px_rgba(15,23,42,0.35)] dark:border-slate-700 dark:bg-slate-800"
          >
            <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-700">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                Workspace switcher
              </p>

              <p className="mt-1 text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                Select a shop
              </p>

              <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                Switch between your business workspaces.
              </p>
            </div>

            <div className="max-h-[min(48vh,260px)] overflow-y-auto p-2">
              {shops?.length ? (
                shops.map((shop) => {
                  const selected = currentShop?.id === shop.id

                  return (
                    <button
                      key={shop.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => handleShopSelect(shop)}
                      className={cn(
                        "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600",
                        selected
                          ? "border border-emerald-100 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-500/10 dark:text-emerald-300"
                          : "border border-transparent text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/60"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                          selected
                            ? "bg-white text-emerald-700 dark:bg-slate-800 dark:text-emerald-300"
                            : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300"
                        )}
                      >
                        <Store className="h-4 w-4" aria-hidden="true" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-[12px] font-semibold leading-5">
                          {shop.name || "Untitled shop"}
                        </span>

                        {selected && (
                          <span className="mt-0.5 block text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                            Currently active
                          </span>
                        )}
                      </span>

                      {selected && (
                        <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      )}
                    </button>
                  )
                })
              ) : (
                <div className="px-3 py-6 text-center">
                  <Store className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" />

                  <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                    No shops found
                  </p>

                  <p className="mt-1 text-[10px] text-slate-400">
                    Create your first shop to get started.
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 bg-slate-50/80 p-2 dark:border-slate-700 dark:bg-slate-900/60">
              <Link
                to="/settings"
                role="menuitem"
                onClick={() => {
                  setShopMenuOpen(false)
                  setShopMenuPosition(null)

                  if (open) onClose?.()
                }}
                className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add or manage shops
              </Link>
            </div>
          </div>,
          document.body
        )}

        {/* NAVIGATION */}
        <nav
          aria-label="Sidebar"
          className={cn(
            "khaatapro-sidebar-nav min-h-0 flex-1 overflow-y-auto overscroll-contain py-2",
            compact ? "px-2" : "px-3"
          )}
        >
          <div className="space-y-4">
            {navGroups.map((group, groupIndex) => (
              <div key={group.label}>
                {compact ? (
                  groupIndex > 0 && (
                    <div
                      className="mx-3 mb-2 h-px bg-slate-100 dark:bg-slate-800"
                      aria-hidden="true"
                    />
                  )
                ) : (
                  <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                    {group.label}
                  </p>
                )}

                <div className="space-y-0.5">
                  {group.items.map(({ to, icon: Icon, label }) => {
                    const active = isRouteActive(to, pathname)

                    return (
                      <Link
                        key={to}
                        to={to}
                        onClick={onClose}
                        title={compact ? label : undefined}
                        aria-label={compact ? label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex items-center rounded-xl text-[14px] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f8a4b] dark:focus-visible:ring-emerald-400",
                          compact ? "h-11 justify-center" : "gap-3 px-3 py-2.5",
                          active
                            ? "bg-[#e8f5ed] font-semibold text-[#0f8a4b] dark:bg-emerald-500/15 dark:text-emerald-400"
                            : "font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                        )}
                      >
                        {active && !compact && (
                          <span
                            className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[#0f8a4b] dark:bg-emerald-400"
                            aria-hidden="true"
                          />
                        )}

                        <Icon
                          className={cn(
                            "shrink-0 transition-colors",
                            compact ? "h-5 w-5" : "h-5 w-5",
                            active
                              ? "text-[#0f8a4b] dark:text-emerald-400"
                              : "text-slate-500 group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-300"
                          )}
                          strokeWidth={active ? 2.2 : 1.8}
                          aria-hidden="true"
                        />

                        {!compact && (
                          <span className="truncate">{label}</span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* USER FOOTER */}
        <div
          className="relative z-[70] shrink-0 border-t border-slate-100 p-3 dark:border-slate-800"
          ref={profileMenuRef}
        >
          <button
            ref={profileMenuButtonRef}
            type="button"
            onClick={toggleProfileMenu}
            aria-haspopup="menu"
            aria-expanded={profileMenuOpen}
            aria-label={compact ? `Account menu for ${displayName}` : undefined}
            title={compact ? displayName : undefined}
            className={cn(
              "group flex w-full items-center rounded-xl transition-all hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f8a4b] dark:hover:bg-slate-800 dark:focus-visible:ring-emerald-400",
              compact ? "justify-center p-1.5" : "gap-3 px-2 py-2"
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0f8a4b] text-[12px] font-bold text-white shadow-sm ring-2 ring-white dark:bg-emerald-600 dark:ring-slate-900">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                getInitials(displayName)
              )}
            </div>

            {!compact && (
              <>
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-[13.5px] font-bold text-slate-900 transition-colors group-hover:text-[#0f8a4b] dark:text-slate-100 dark:group-hover:text-emerald-400">
                    {displayName}
                  </p>

                  <p className="truncate text-[11px] font-medium capitalize text-slate-500 dark:text-slate-400">
                    {profile?.role || "Owner"}
                  </p>
                </div>

                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 transition-colors group-hover:bg-slate-200 dark:bg-slate-800 dark:group-hover:bg-slate-700">
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 text-slate-500 transition-transform dark:text-slate-400",
                      profileMenuOpen && "rotate-180"
                    )}
                    aria-hidden="true"
                  />
                </div>
              </>
            )}
          </button>

          {/* PROFILE DROPDOWN */}
          {profileMenuOpen && profileMenuPosition && createPortal(
            <div
              ref={profileDropdownRef}
              role="menu"
              aria-label="Account menu"
              style={{
                position: "fixed",
                top: profileMenuPosition.top,
                left: profileMenuPosition.left,
                width: profileMenuPosition.width,
                maxHeight: profileMenuPosition.maxHeight,
              }}
              className="z-[1100] overflow-y-auto rounded-xl border border-slate-100 bg-white shadow-xl shadow-slate-200/50 dark:border-slate-700 dark:bg-slate-800 dark:shadow-black/40"
            >
              {/* Who is signed in */}
              <div className="border-b border-slate-100 px-3.5 py-3 dark:border-slate-700">
                <p className="truncate text-[12px] font-bold text-slate-900 dark:text-slate-100">
                  {displayName}
                </p>

                <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                  {user?.email}
                </p>
              </div>

              <div className="p-1.5">
                <Link
                  to="/profile"
                  role="menuitem"
                  onClick={() => {
                    setProfileMenuOpen(false)
                    setProfileMenuPosition(null)

                    if (open) onClose?.()
                  }}
                  className={cn(
                    MENU_ITEM,
                    "text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-700/60 dark:hover:text-white"
                  )}
                >
                  <UserCircle className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  My Profile
                </Link>

                <Link
                  to="/settings"
                  role="menuitem"
                  onClick={() => {
                    setProfileMenuOpen(false)
                    setProfileMenuPosition(null)

                    if (open) onClose?.()
                  }}
                  className={cn(
                    MENU_ITEM,
                    "text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-700/60 dark:hover:text-white"
                  )}
                >
                  <Settings className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  Shop Settings
                </Link>
              </div>

              {/* THEME */}
              <div className="border-t border-slate-100 p-2 dark:border-slate-700">
                <MenuLabel>Appearance</MenuLabel>

                <div
                  role="radiogroup"
                  aria-label="Theme"
                  className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-900/60"
                >
                  {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
                    const selected = theme === value

                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={label}
                        title={label}
                        onClick={() => setTheme(value)}
                        className={cn(
                          "flex h-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f8a4b] dark:focus-visible:ring-emerald-400",
                          selected
                            ? "bg-white text-[#0f8a4b] shadow-sm dark:bg-slate-700 dark:text-emerald-400"
                            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                        )}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* LOGOUT */}
              <div className="border-t border-slate-100 p-1.5 dark:border-slate-700">
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className={cn(
                    MENU_ITEM,
                    "text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:text-rose-400 dark:hover:bg-rose-500/10"
                  )}
                >
                  {loggingOut ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                  )}

                  {loggingOut ? "Logging out..." : "Logout"}
                </button>
              </div>
            </div>,
            document.body
          )}
        </div>

        {/* DESKTOP RESIZE / COLLAPSE HANDLE */}
        <button
          type="button"
          aria-label="Drag to resize or collapse sidebar; double-click to restore default width"
          title="Drag left to collapse · Drag right to expand · Double-click to reset"
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
          onDoubleClick={handleResizeReset}
          className={cn(
            "group absolute -right-[5px] top-0 z-[80] hidden h-full w-[10px] cursor-col-resize touch-none items-center justify-center outline-none lg:flex",
            isResizing && "bg-emerald-500/10"
          )}
        >
          <span className="h-12 w-[3px] rounded-full bg-slate-300 opacity-0 transition-all group-hover:bg-emerald-500 group-hover:opacity-100 group-focus-visible:bg-emerald-500 group-focus-visible:opacity-100 dark:bg-slate-600" />
        </button>
      </aside>
    </>
  )
}