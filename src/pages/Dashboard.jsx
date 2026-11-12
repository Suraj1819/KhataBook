import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  IndianRupee,
  Loader2,
  Plus,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"

function getLocalDateString() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function getPaymentBadgeVariant(status) {
  if (status === "paid") return "success"
  if (status === "partial") return "warning"
  return "destructive"
}

function SummaryCard({ label, value, detail, icon: Icon, tone = "slate" }) {
  const tones = {
    slate: {
      card: "border-slate-200 bg-white",
      icon: "bg-slate-100 text-slate-700",
      label: "text-slate-500",
      value: "text-slate-950",
      detail: "text-slate-500",
    },
    emerald: {
      card: "border-emerald-100 bg-emerald-50/40",
      icon: "bg-emerald-100 text-emerald-700",
      label: "text-emerald-700",
      value: "text-emerald-800",
      detail: "text-emerald-700/80",
    },
    red: {
      card: "border-red-100 bg-red-50/40",
      icon: "bg-red-100 text-red-700",
      label: "text-red-700",
      value: "text-red-800",
      detail: "text-red-700/80",
    },
    amber: {
      card: "border-amber-100 bg-amber-50/40",
      icon: "bg-amber-100 text-amber-700",
      label: "text-amber-700",
      value: "text-amber-800",
      detail: "text-amber-700/80",
    },
    blue: {
      card: "border-blue-100 bg-blue-50/40",
      icon: "bg-blue-100 text-blue-700",
      label: "text-blue-700",
      value: "text-blue-800",
      detail: "text-blue-700/80",
    },
  }

  const style = tones[tone] || tones.slate

  return (
    <Card className={`rounded-2xl shadow-sm ${style.card}`}>
      <CardContent className="flex min-w-0 items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className={`text-sm font-medium ${style.label}`}>{label}</p>
          <p className={`mt-2 break-words text-2xl font-semibold tracking-tight ${style.value}`}>
            {value}
          </p>
          <p className={`mt-1 text-xs ${style.detail}`}>{detail}</p>
        </div>
        <div className={`shrink-0 rounded-xl p-3 ${style.icon}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  )
}

export default function Dashboard() {
  const { currentShop } = useShop()
  const [stats, setStats] = useState({
    customers: 0,
    bills: 0,
    todaySales: 0,
    totalReceived: 0,
    outstanding: 0,
    advances: 0,
    overdue: 0,
  })
  const [recentBills, setRecentBills] = useState([])
  const [pendingCustomers, setPendingCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState("")

  const today = getLocalDateString()

  const loadDashboard = useCallback(async (showRefresh = false) => {
    if (!currentShop?.id) {
      setStats({
        customers: 0,
        bills: 0,
        todaySales: 0,
        totalReceived: 0,
        outstanding: 0,
        advances: 0,
        overdue: 0,
      })
      setRecentBills([])
      setPendingCustomers([])
      setLoading(false)
      return
    }

    if (showRefresh) setRefreshing(true)
    else setLoading(true)

    setLoadError("")

    try {
      const shopId = currentShop.id
      const [
        custRes,
        billsRes,
        todayRes,
        paidRes,
        dueRes,
        advRes,
        recentRes,
      ] = await Promise.all([
        supabase
          .from("customers")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", shopId)
          .eq("is_active", true),
        supabase
          .from("bills")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", shopId),
        supabase
          .from("bills")
          .select("grand_total")
          .eq("shop_id", shopId)
          .eq("bill_date", today),
        supabase
          .from("payments")
          .select("amount")
          .eq("shop_id", shopId)
          .eq("is_refund", false),
        supabase
          .from("bills")
          .select("amount_due, due_date, customer_id, customers(name)")
          .eq("shop_id", shopId)
          .gt("amount_due", 0),
        supabase
          .from("customer_advances")
          .select("remaining_amount")
          .eq("shop_id", shopId)
          .gt("remaining_amount", 0),
        supabase
          .from("bills")
          .select("id, bill_number, bill_date, grand_total, amount_due, payment_status, customers(name)")
          .eq("shop_id", shopId)
          .order("created_at", { ascending: false })
          .limit(6),
      ])

      const results = [
        custRes,
        billsRes,
        todayRes,
        paidRes,
        dueRes,
        advRes,
        recentRes,
      ]
      const failedResult = results.find((result) => result.error)
      if (failedResult?.error) throw failedResult.error

      const customers = custRes.count || 0
      const bills = billsRes.count || 0
      const todaySales = (todayRes.data || []).reduce(
        (sum, bill) => sum + Number(bill.grand_total || 0),
        0
      )
      const totalReceived = (paidRes.data || []).reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
      )
      const outstanding = (dueRes.data || []).reduce(
        (sum, bill) => sum + Number(bill.amount_due || 0),
        0
      )
      const advances = (advRes.data || []).reduce(
        (sum, advance) => sum + Number(advance.remaining_amount || 0),
        0
      )
      const overdueBills = (dueRes.data || []).filter(
        (bill) => bill.due_date && bill.due_date < today
      )
      const overdue = overdueBills.reduce(
        (sum, bill) => sum + Number(bill.amount_due || 0),
        0
      )

      const customerMap = new Map()
      ;(dueRes.data || []).forEach((bill) => {
        const customerId = bill.customer_id || `unknown-${bill.customers?.name || "walk-in"}`
        const existing = customerMap.get(customerId)

        if (existing) {
          existing.due += Number(bill.amount_due || 0)
          existing.billCount += 1
        } else {
          customerMap.set(customerId, {
            name: bill.customers?.name || "Walk-in customer",
            due: Number(bill.amount_due || 0),
            billCount: 1,
          })
        }
      })

      const pending = Array.from(customerMap.values())
        .sort((a, b) => b.due - a.due)
        .slice(0, 5)

      setStats({
        customers,
        bills,
        todaySales,
        totalReceived,
        outstanding,
        advances,
        overdue,
      })
      setRecentBills(recentRes.data || [])
      setPendingCustomers(pending)
    } catch (error) {
      console.error("Dashboard error:", error)
      setLoadError(error.message || "Unable to load dashboard data.")
      toast.error(error.message || "Could not load dashboard")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [currentShop?.id, today])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  const secondaryStats = useMemo(
    () => [
      {
        label: "Total customers",
        value: stats.customers.toLocaleString("en-IN"),
        icon: Users,
      },
      {
        label: "Bills created",
        value: stats.bills.toLocaleString("en-IN"),
        icon: FileText,
      },
      {
        label: "Customer advances",
        value: formatCurrency(stats.advances),
        icon: Wallet,
      },
    ],
    [stats]
  )

  if (!currentShop) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
        <div className="max-w-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
            <Wallet className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">No shop selected</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Select or create a shop to see its sales, customer balances and recent bills.
          </p>
          <Button asChild className="mt-5 h-10 rounded-xl">
            <Link to="/settings">Go to shop settings</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-slate-700" />
          Loading your shop dashboard...
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-8">
      {/* Page heading */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Wallet className="h-4 w-4" />
            <span>Overview</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-700">Dashboard</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            A clear overview of {currentShop.name || "your shop"} and its activity.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => loadDashboard(true)}
            disabled={refreshing}
            className="h-10 gap-2 rounded-xl border-slate-200 bg-white"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button asChild className="h-10 gap-2 rounded-xl">
            <Link to="/bills/new">
              <Plus className="h-4 w-4" />
              Create bill
            </Link>
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{loadError}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => loadDashboard()}
            className="rounded-lg border-red-200 bg-white text-red-700 hover:bg-red-100"
          >
            Try again
          </Button>
        </div>
      )}

      {/* Primary financial metrics */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Today's sales"
          value={formatCurrency(stats.todaySales)}
          detail="Total bill value created today"
          icon={TrendingUp}
          tone="emerald"
        />
        <SummaryCard
          label="Amount received"
          value={formatCurrency(stats.totalReceived)}
          detail="Recorded payments, excluding refunds"
          icon={ArrowDownLeft}
          tone="blue"
        />
        <SummaryCard
          label="Outstanding dues"
          value={formatCurrency(stats.outstanding)}
          detail="Pending amount across all bills"
          icon={IndianRupee}
          tone="red"
        />
        <SummaryCard
          label="Overdue amount"
          value={formatCurrency(stats.overdue)}
          detail="Outstanding bills past their due date"
          icon={Clock3}
          tone="amber"
        />
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {secondaryStats.map((item) => {
          const Icon = item.icon
          return (
            <Card key={item.label} className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">{item.label}</p>
                  <p className="mt-0.5 text-lg font-semibold tracking-tight text-slate-900">
                    {item.value}
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Recent bills and pending customers */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
            <div>
              <h2 className="font-semibold text-slate-900">Recent bills</h2>
              <p className="mt-1 text-sm text-slate-500">
                Latest bills created in this shop
              </p>
            </div>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5 rounded-xl border-slate-200"
            >
              <Link to="/bills">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          {recentBills.length === 0 ? (
            <div className="flex min-h-[230px] flex-col items-center justify-center px-5 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                <FileText className="h-6 w-6" />
              </div>
              <p className="mt-3 font-medium text-slate-900">No bills yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Create your first bill to start tracking shop activity.
              </p>
              <Button asChild size="sm" className="mt-4 gap-2 rounded-xl">
                <Link to="/bills/new">
                  <Plus className="h-4 w-4" /> Create bill
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[520px] text-left">
                  <thead className="bg-slate-50/80">
                    <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-3">Customer / Bill</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3 text-right">Amount</th>
                      <th className="px-5 py-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentBills.map((bill) => (
                      <tr key={bill.id} className="transition-colors hover:bg-slate-50/70">
                        <td className="px-5 py-4">
                          <Link
                            to={`/bills/${bill.id}`}
                            className="font-medium text-slate-900 transition-colors hover:text-emerald-700"
                          >
                            {bill.customers?.name || "Walk-in customer"}
                          </Link>
                          <p className="mt-1 text-xs text-slate-500">
                            {bill.bill_number || "Bill"}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">
                          {bill.bill_date ? formatDate(bill.bill_date) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-right text-sm font-semibold text-slate-900">
                          {formatCurrency(bill.grand_total)}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Badge variant={getPaymentBadgeVariant(bill.payment_status)}>
                            {bill.payment_status || "unpaid"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-slate-100 sm:hidden">
                {recentBills.map((bill) => (
                  <Link
                    key={bill.id}
                    to={`/bills/${bill.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-4 transition-colors hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {bill.customers?.name || "Walk-in customer"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {bill.bill_number || "Bill"} · {bill.bill_date ? formatDate(bill.bill_date) : "—"}
                      </p>
                      <div className="mt-2">
                        <Badge variant={getPaymentBadgeVariant(bill.payment_status)}>
                          {bill.payment_status || "unpaid"}
                        </Badge>
                      </div>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-slate-900">
                      {formatCurrency(bill.grand_total)}
                    </p>
                  </Link>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
            <div>
              <h2 className="font-semibold text-slate-900">Customers with pending dues</h2>
              <p className="mt-1 text-sm text-slate-500">
                Customers with the highest outstanding balances
              </p>
            </div>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5 rounded-xl border-slate-200"
            >
              <Link to="/dues">
                View dues <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          {pendingCustomers.length === 0 ? (
            <div className="flex min-h-[230px] flex-col items-center justify-center px-5 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <p className="mt-3 font-medium text-slate-900">No pending dues</p>
              <p className="mt-1 text-sm text-slate-500">
                There are no outstanding customer balances to follow up.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingCustomers.map((customer, index) => (
                <div
                  key={`${customer.name}-${index}`}
                  className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-600">
                      {customer.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {customer.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {customer.billCount} pending {customer.billCount === 1 ? "bill" : "bills"}
                      </p>
                    </div>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums text-red-600">
                    {formatCurrency(customer.due)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {pendingCustomers.length > 0 && (
            <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
              <Link
                to="/dues"
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 transition-colors hover:text-emerald-700"
              >
                Review all outstanding payments
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </Card>
      </div>

      {/* Footer context */}
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          <span>Showing shop activity for {currentShop.name || "selected shop"}</span>
        </div>
        <span>Today: {formatDate(today)}</span>
      </div>
    </div>
  )
}
