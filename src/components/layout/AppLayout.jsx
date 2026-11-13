import { useState } from "react"
import { Outlet, Navigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useShop } from "@/contexts/ShopContext"
import { Sidebar } from "./Sidebar"
import { Header } from "./Header"

export function AppLayout() {
  const { user, loading: authLoading } = useAuth()
  const { loading: shopLoading } = useShop()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (authLoading || shopLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f5ff] dark:bg-slate-950">
        <div className="flex flex-col items-center rounded-2xl border border-white/80 bg-white/70 px-8 py-7 shadow-[0_8px_30px_rgba(80,65,130,0.08)] backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/80">
          <div className="relative flex h-12 w-12 items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-emerald-100/60 dark:bg-emerald-900/30" />
            <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-emerald-600 border-t-transparent" />
          </div>
          <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-400">
            Loading your workspace…
          </p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return (
    <div className="relative flex h-screen overflow-hidden bg-[#f7f5ff] dark:bg-slate-950">
      {/* Ambient soft glow — matches Dues page vibe */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-32 -right-24 h-72 w-72 rounded-full bg-violet-200/30 blur-3xl dark:bg-violet-900/20" />
        <div className="absolute -bottom-40 -left-24 h-80 w-80 rounded-full bg-emerald-200/20 blur-3xl dark:bg-emerald-900/10" />
      </div>

      {/* Sidebar — fixed, own scroll */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Right column */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header — fixed */}
        <Header onMenuClick={() => setSidebarOpen(true)} />

        {/* Main — only this scrolls */}
        <main className="flex-1 overflow-y-auto bg-[#f7f5ff] dark:bg-slate-950">
          <div className="mx-auto w-full max-w-[1600px] p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}