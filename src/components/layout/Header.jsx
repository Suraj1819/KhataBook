import { Menu, ChevronDown, LogOut, User, Store, Settings, Sun, Moon } from "lucide-react"
import { useState, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useShop } from "@/contexts/ShopContext"
import { useTheme } from "@/contexts/ThemeContext"
import { cn } from "@/lib/utils"

function getInitials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
}

export function Header({ onMenuClick }) {
  const { user, profile, signOut } = useAuth()
  const { shops, currentShop, selectShop } = useShop()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  
  const [shopOpen, setShopOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  
  const shopRef = useRef(null)
  const userRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (shopRef.current && !shopRef.current.contains(e.target)) setShopOpen(false)
      if (userRef.current && !userRef.current.contains(e.target)) setUserOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  async function handleSignOut() {
    await signOut()
    navigate("/login")
  }

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "User"
  const initials = getInitials(displayName) || "U"
  const avatarUrl = profile?.avatar_url

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 transition-colors dark:border-slate-800 dark:bg-slate-950 sm:gap-3 sm:px-4 lg:px-6">
      
      {/* Left Side: Menu Button & Shop Switcher */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Mobile Menu Button */}
        <button 
          onClick={onMenuClick} 
          className="rounded-md p-2 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
        >
          <Menu className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </button>

        {/* Shop Switcher */}
        <div className="relative" ref={shopRef}>
          <button
            onClick={() => setShopOpen(!shopOpen)}
            className={cn(
              "flex max-w-[150px] sm:max-w-[220px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 sm:px-3 sm:py-2 sm:gap-2.5",
              shopOpen && "border-emerald-500 ring-2 ring-emerald-500/20 dark:border-emerald-500"
            )}
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-50 dark:bg-emerald-900/30">
              <Store className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="truncate dark:text-slate-200">{currentShop?.name || "Select Shop"}</span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", shopOpen && "rotate-180")} />
          </button>

          {/* Shop Dropdown */}
          {shopOpen && (
            <div className="absolute left-0 top-full z-50 mt-2 w-[260px] sm:w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <p className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Your Shops
              </p>

              {shops.length === 0 ? (
                <p className="px-3 py-2 text-sm text-slate-500">No shops yet</p>
              ) : (
                shops.map((shop) => (
                  <button
                    key={shop.id}
                    onClick={() => {
                      selectShop(shop)
                      setShopOpen(false)
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800",
                      currentShop?.id === shop.id ? "bg-emerald-50/60 dark:bg-emerald-900/20" : ""
                    )}
                  >
                    <div className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                      currentShop?.id === shop.id 
                        ? "border-emerald-200 bg-white text-emerald-600 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-400" 
                        : "border-slate-100 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                    )}>
                      <Store className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn(
                        "truncate font-medium",
                        currentShop?.id === shop.id ? "text-emerald-700 dark:text-emerald-400" : "text-slate-700 dark:text-slate-300"
                      )}>
                        {shop.name}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {shop.business_type || "General Store"}
                      </p>
                    </div>
                  </button>
                ))
              )}

              <div className="mt-1.5 border-t border-slate-100 pt-1.5 dark:border-slate-800">
                <button
                  onClick={() => {
                    setShopOpen(false)
                    navigate("/settings")
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                >
                  <Settings className="h-4 w-4" />
                  Manage Shops
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Side: Theme Toggle & User Menu */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          title="Toggle Theme"
        >
          {theme === "dark" ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </button>

        {/* User Menu */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => setUserOpen(!userOpen)}
            className={cn(
              "flex items-center gap-2.5 rounded-xl p-1.5 sm:pr-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800",
              userOpen && "bg-slate-50 dark:bg-slate-800"
            )}
          >
            {/* Avatar Display */}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-emerald-100 text-sm font-semibold text-emerald-700 shadow-sm dark:border-slate-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="h-full w-full object-cover"
                />
              ) : (
                initials
              )}
            </div>

            {/* Name: Desktop only */}
            <span className="hidden max-w-[120px] truncate text-sm font-medium text-slate-700 dark:text-slate-300 md:block">
              {displayName}
            </span>
            
            <ChevronDown className={cn("hidden md:block h-4 w-4 text-slate-400 transition-transform", userOpen && "rotate-180")} />
          </button>

          {/* User Dropdown */}
          {userOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
              {/* User Info Header */}
              <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {displayName}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {user?.email}
                </p>
              </div>

              {/* Actions */}
              <div className="pt-1.5">
                <button
                  onClick={() => {
                    setUserOpen(false)
                    navigate("/profile")
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <User className="h-4 w-4 text-slate-400" />
                  My Profile
                </button>
                
                <button
                  onClick={() => {
                    setUserOpen(false)
                    navigate("/settings")
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Settings className="h-4 w-4 text-slate-400" />
                  Settings
                </button>
              </div>

              <div className="mt-1.5 border-t border-slate-100 pt-1.5 dark:border-slate-800">
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}