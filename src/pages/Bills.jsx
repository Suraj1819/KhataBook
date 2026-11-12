
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatDate } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Wallet,
  X,
  AlertCircle,
} from "lucide-react"

import { toast } from "sonner"

function getLocalDateString() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function getInitials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

function getStatusLabel(status) {
  if (status === "paid") return "Paid"
  if (status === "partial") return "Partial"
  return "Unpaid"
}

function StatusBadge({ status }) {
  const styles = {
    paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
    partial: "border-amber-200 bg-amber-50 text-amber-700",
    unpaid: "border-slate-200 bg-slate-50 text-slate-600",
  }

  return (
    <Badge
      variant="outline"
      className={`rounded-md px-2.5 py-1 text-xs font-medium ${styles[status] || styles.unpaid}`}
    >
      {getStatusLabel(status)}
    </Badge>
  )
}

function StatCard({ title, value, description, icon: Icon, color = "slate" }) {
  const iconStyles = {
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-100 text-blue-600",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-600",
    emerald: "bg-emerald-100 text-emerald-700",
  }

  return (
    <Card className="rounded-[20px] border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.10)] transition-shadow">
      <div className="flex min-h-[150px] items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-slate-600">
            {title}
          </p>

          <p className="mt-3 truncate text-[27px] font-semibold leading-none tracking-tight text-slate-950">
            {value}
          </p>

          <p className="mt-3 text-sm text-slate-500">
            {description}
          </p>
        </div>

        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${iconStyles[color]}`}
        >
          <Icon className="h-6 w-6" strokeWidth={2} />
        </div>
      </div>
    </Card>
  )
}

function Bills() {
  const { currentShop } = useShop()

  const [bills, setBills] = useState([])
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const today = getLocalDateString()

  const loadBills = useCallback(async (refresh = false) => {
    if (!currentShop?.id) {
      setBills([])
      setLoading(false)
      return
    }

    if (refresh) setRefreshing(true)
    else setLoading(true)

    try {
      const { data, error } = await supabase
        .from("bills")
        .select(`
          id,
          bill_number,
          bill_date,
          due_date,
          grand_total,
          amount_paid,
          amount_due,
          advance_adjusted,
          payment_status,
          created_at,
          customers (
            id,
            name,
            mobile
          )
        `)
        .eq("shop_id", currentShop.id)
        .order("created_at", { ascending: false })

      if (error) throw error

      setBills(data || [])
    } catch (error) {
      console.error("Load bills error:", error)
      toast.error(error.message || "Unable to load bills")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [currentShop?.id])

  useEffect(() => {
    loadBills()
  }, [loadBills])

  const isOverdue = useCallback((bill) => {
    return (
      Number(bill.amount_due || 0) > 0 &&
      bill.due_date &&
      bill.due_date < today
    )
  }, [today])

  const summary = useMemo(() => {
    return bills.reduce(
      (result, bill) => {
        const total = Number(bill.grand_total || 0)
        const paid = Number(bill.amount_paid || 0)
        const due = Number(bill.amount_due || 0)

        result.totalBilled += total
        result.totalPaid += paid
        result.totalDue += due

        if (bill.payment_status === "paid") {
          result.paidCount += 1
        }

        if (bill.payment_status === "partial") {
          result.partialCount += 1
        }

        if (bill.payment_status !== "paid") {
          result.unpaidCount += 1
        }

        if (
          due > 0 &&
          bill.due_date &&
          bill.due_date < today
        ) {
          result.overdueAmount += due
          result.overdueCount += 1
        }

        return result
      },
      {
        totalBilled: 0,
        totalPaid: 0,
        totalDue: 0,
        overdueAmount: 0,
        paidCount: 0,
        partialCount: 0,
        unpaidCount: 0,
        overdueCount: 0,
      }
    )
  }, [bills, today])

  const filteredBills = useMemo(() => {
    const query = search.trim().toLowerCase()

    return bills.filter((bill) => {
      const matchesSearch =
        !query ||
        bill.bill_number?.toLowerCase().includes(query) ||
        bill.customers?.name?.toLowerCase().includes(query) ||
        bill.customers?.mobile?.toLowerCase().includes(query)

      const matchesStatus =
        statusFilter === "all" ||
        bill.payment_status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [bills, search, statusFilter])

  if (!currentShop) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
        <div>
          <FileText className="mx-auto mb-3 h-9 w-9 text-slate-400" />
          <h2 className="font-semibold text-slate-900">
            Select a shop
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Choose a shop to manage its bills.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 pb-8">

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Bills
          </h1>

          <p className="mt-1 text-[15px] text-slate-500">
            Manage invoices, payments and outstanding balances.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => loadBills(true)}
            disabled={loading || refreshing}
            className="h-10 rounded-xl border-slate-200 bg-white px-3 text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>

          <Button
            asChild
            className="h-10 rounded-xl bg-slate-900 px-4 text-white hover:bg-slate-800"
          >
            <Link to="/bills/new">
              <Plus className="mr-2 h-4 w-4" />
              Create bill
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total bills"
          value={bills.length}
          description="Total invoices created"
          icon={FileText}
          color="slate"
        />

        <StatCard
          title="Paid bills"
          value={summary.paidCount}
          description={`${summary.partialCount} partially paid bills`}
          icon={CheckCircle2}
          color="blue"
        />

        <StatCard
          title="Total outstanding"
          value={formatCurrency(summary.totalDue)}
          description="Remaining customer payments"
          icon={Wallet}
          color="amber"
        />

        <StatCard
          title="Overdue amount"
          value={formatCurrency(summary.overdueAmount)}
          description={`${summary.overdueCount} bills past their due date`}
          icon={AlertCircle}
          color="red"
        />
      </div>

      {/* Bills Section */}
      <Card className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08)]">

        {/* Search and Filters */}
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                All bills
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Showing {filteredBills.length} of {bills.length} bills
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative w-full sm:w-[320px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search bill or customer..."
                  className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 pr-9 text-sm focus-visible:bg-white"
                />

                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <Select
                value={statusFilter}
                onValueChange={setStatusFilter}
              >
                <SelectTrigger className="h-10 w-full rounded-xl border-slate-200 sm:w-[165px]">
                  <SlidersHorizontal className="mr-2 h-4 w-4 text-slate-400" />
                  <SelectValue placeholder="Payment status" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading ? (
          <div className="flex min-h-[280px] items-center justify-center gap-3 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading bills...
          </div>
        ) : filteredBills.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center px-5 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <FileText className="h-6 w-6" />
            </div>

            <h3 className="mt-4 font-semibold text-slate-900">
              {bills.length
                ? "No matching bills"
                : "No bills created yet"}
            </h3>

            <p className="mt-1 max-w-sm text-sm text-slate-500">
              {bills.length
                ? "Try changing your search or payment status filter."
                : "Create your first bill to start managing customer purchases."}
            </p>

            {bills.length ? (
              <Button
                type="button"
                variant="outline"
                className="mt-4 rounded-xl"
                onClick={() => {
                  setSearch("")
                  setStatusFilter("all")
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button
                asChild
                className="mt-4 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
              >
                <Link to="/bills/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create first bill
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] text-left">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-4">Bill / Customer</th>
                    <th className="px-5 py-4">Bill date</th>
                    <th className="px-5 py-4">Due date</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4 text-right">Bill amount</th>
                    <th className="px-5 py-4 text-right">Outstanding</th>
                    <th className="px-5 py-4 text-right">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredBills.map((bill) => {
                    const overdue = isOverdue(bill)

                    return (
                      <tr
                        key={bill.id}
                        className="transition-colors hover:bg-slate-50/70"
                      >
                        <td className="px-5 py-4">
                          <Link
                            to={`/bills/${bill.id}`}
                            className="flex items-center gap-3"
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-700">
                              {getInitials(bill.customers?.name || "B")}
                            </div>

                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900 hover:text-emerald-700">
                                {bill.customers?.name || "Unknown customer"}
                              </p>

                              <p className="mt-1 text-xs text-slate-400">
                                {bill.bill_number || "Bill"}
                                {bill.customers?.mobile
                                  ? ` · ${bill.customers.mobile}`
                                  : ""}
                              </p>
                            </div>
                          </Link>
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-600">
                          {bill.bill_date
                            ? formatDate(bill.bill_date)
                            : "—"}
                        </td>

                        <td className="px-5 py-4">
                          <p className="text-sm text-slate-700">
                            {bill.due_date
                              ? formatDate(bill.due_date)
                              : "Not set"}
                          </p>

                          {overdue && (
                            <p className="mt-1 text-xs font-medium text-red-600">
                              Overdue
                            </p>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <StatusBadge status={bill.payment_status} />
                        </td>

                        <td className="px-5 py-4 text-right text-sm font-semibold tabular-nums text-slate-900">
                          {formatCurrency(bill.grand_total)}
                        </td>

                        <td className="px-5 py-4 text-right">
                          <p
                            className={`text-sm font-semibold tabular-nums ${
                              Number(bill.amount_due || 0) > 0
                                ? "text-slate-900"
                                : "text-emerald-700"
                            }`}
                          >
                            {formatCurrency(bill.amount_due)}
                          </p>
                        </td>

                        <td className="px-5 py-4 text-right">
                          <Button
                            asChild
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          >
                            <Link to={`/bills/${bill.id}`}>
                              View
                              <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="divide-y divide-slate-100 md:hidden">
              {filteredBills.map((bill) => {
                const overdue = isOverdue(bill)

                return (
                  <div key={bill.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        to={`/bills/${bill.id}`}
                        className="flex min-w-0 items-center gap-3"
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-700">
                          {getInitials(bill.customers?.name || "B")}
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {bill.customers?.name || "Unknown customer"}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {bill.bill_number || "Bill"}
                          </p>
                        </div>
                      </Link>

                      <StatusBadge status={bill.payment_status} />
                    </div>

                    <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <div>
                        <p className="text-xs text-slate-500">
                          Bill amount
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {formatCurrency(bill.grand_total)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500">
                          Outstanding
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {formatCurrency(bill.amount_due)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500">
                          Bill date
                        </p>
                        <p className="mt-1 text-sm text-slate-700">
                          {bill.bill_date
                            ? formatDate(bill.bill_date)
                            : "—"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500">
                          Due date
                        </p>
                        <p
                          className={`mt-1 text-sm ${
                            overdue
                              ? "font-medium text-red-600"
                              : "text-slate-700"
                          }`}
                        >
                          {bill.due_date
                            ? formatDate(bill.due_date)
                            : "Not set"}
                          {overdue ? " · Overdue" : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-xs text-slate-400">
                        {bill.customers?.mobile || "No mobile number"}
                      </p>

                      <Button
                        asChild
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0 rounded-lg border-slate-200"
                      >
                        <Link to={`/bills/${bill.id}`}>
                          View bill
                          <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Footer */}
        {!loading && filteredBills.length > 0 && (
          <div className="flex flex-col gap-1 border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs text-slate-500">
              Showing {filteredBills.length} bills
            </p>

            <p className="text-xs text-slate-400">
              {currentShop.name || "Current shop"}
            </p>
          </div>
        )}
      </Card>
    </div>
  )
}

export default Bills
