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
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-[3px] border-emerald-600 border-t-transparent" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return (
    // ⚠️ Added dark:bg-slate-950 to main container
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Sidebar — fixed, own scroll */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Right column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header — fixed */}
        <Header onMenuClick={() => setSidebarOpen(true)} />

        {/* Main — only this scrolls */}
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">
          <div className="p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}