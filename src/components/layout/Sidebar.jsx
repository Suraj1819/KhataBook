import { useEffect, useState } from "react"
import { NavLink } from "react-router-dom"
import {
  LayoutDashboard,
  Users,
  FileText,
  PlusCircle,
  BookOpen,
  AlertCircle,
  CreditCard,
  Settings,
  Store,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useShop } from "@/contexts/ShopContext"

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/customers", icon: Users, label: "Customers" },
  { to: "/bills/new", icon: PlusCircle, label: "Create Bill" },
  { to: "/bills", icon: FileText, label: "All Bills" },
  { to: "/khata", icon: BookOpen, label: "Personal Khata" },
  { to: "/dues", icon: AlertCircle, label: "Dues" },
  { to: "/payments", icon: CreditCard, label: "Payments" },
  { to: "/settings", icon: Settings, label: "Shop Settings" },
]

const STORAGE_KEY = "sidebar-collapsed"

export function Sidebar({ open, onClose }) {
  const { currentShop } = useShop()
  const [collapsed, setCollapsed] = useState(false)

  // Restore collapsed state
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === "1") setCollapsed(true)
    } catch {
      /* ignore */
    }
  }, [])

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0")
      } catch {
        /* ignore */
      }
      return next
    })
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px] dark:bg-black/60 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-full flex-col border-r border-slate-200 bg-white transition-[width,transform] duration-200 ease-out dark:border-slate-800 dark:bg-slate-950 lg:static lg:z-auto",
          collapsed ? "w-[72px]" : "w-64",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "flex h-16 items-center border-b border-slate-100 dark:border-slate-800/60",
            collapsed ? "justify-center px-2" : "justify-between px-4"
          )}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 shadow-sm shadow-emerald-600/20">
              <Store className="h-4 w-4 text-white" />
            </div>

            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100">
                  Digital Khata
                </p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {currentShop?.name || "No shop selected"}
                </p>
              </div>
            )}
          </div>

          {/* Mobile close */}
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav
          className={cn(
            "flex-1 overflow-y-auto py-4",
            collapsed ? "px-2" : "px-3"
          )}
        >
          <div className="space-y-0.5">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                onClick={onClose}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  cn(
                    "group flex items-center rounded-lg text-sm font-medium transition-colors",
                    collapsed
                      ? "justify-center px-0 py-2.5"
                      : "gap-3 px-3 py-2.5",
                    isActive
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  )
                }
              >
                <Icon
                  className={cn(
                    "shrink-0 transition-colors",
                    collapsed ? "h-5 w-5" : "h-[18px] w-[18px]"
                  )}
                />
                {!collapsed && <span className="truncate">{label}</span>}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-100 p-3 dark:border-slate-800/60">
          {/* Desktop collapse toggle */}
          <button
            onClick={toggleCollapsed}
            className={cn(
              "mb-2 hidden w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 lg:flex",
              collapsed ? "justify-center" : "gap-3"
            )}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-[18px] w-[18px]" />
            ) : (
              <>
                <PanelLeftClose className="h-[18px] w-[18px]" />
                <span>Collapse</span>
              </>
            )}
          </button>

          {!collapsed && (
            <p className="text-center text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
              Made for Indian Shopkeepers
            </p>
          )}
        </div>
      </aside>
    </>
  )
}