import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatDate, PAYMENT_MODES } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertCircle,
  ArrowDownLeft,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  IndianRupee,
  Loader2,
  RefreshCw,
  Search,
  Wallet,
  X,
} from "lucide-react"
import { toast } from "sonner"

const FILTERS = [
  { value: "all", label: "All dues" },
  { value: "overdue", label: "Overdue" },
  { value: "due_today", label: "Due today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Partially paid" },
]

function getLocalDateString() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function getDueState(dueDate, today) {
  if (!dueDate) return "no-date"
  if (dueDate < today) return "overdue"
  if (dueDate === today) return "today"
  return "upcoming"
}

export default function Dues() {
  const { currentShop } = useShop()
  const [dues, setDues] = useState([])
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [payBill, setPayBill] = useState(null)
  const [payAmount, setPayAmount] = useState("")
  const [payMode, setPayMode] = useState("Cash")
  const [saving, setSaving] = useState(false)

  const today = getLocalDateString()

  const loadDues = useCallback(async (showRefresh = false) => {
    if (!currentShop?.id) {
      setDues([])
      setLoading(false)
      return
    }

    if (showRefresh) setRefreshing(true)
    else setLoading(true)

    setLoadError("")

    try {
      const { data, error } = await supabase
        .from("bills")
        .select(
          "id, bill_number, bill_date, grand_total, amount_paid, amount_due, advance_adjusted, due_date, payment_status, customer_id, customers(name, mobile)"
        )
        .eq("shop_id", currentShop.id)
        .gt("amount_due", 0)
        .order("due_date", { ascending: true, nullsFirst: false })

      if (error) throw error
      setDues(data || [])
    } catch (error) {
      setLoadError(error.message || "Unable to load dues.")
      toast.error(error.message || "Unable to load dues")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [currentShop?.id])

  useEffect(() => {
    loadDues()
  }, [loadDues])

  const stats = useMemo(() => {
    const outstanding = dues.reduce((sum, bill) => sum + Number(bill.amount_due || 0), 0)
    const overdueBills = dues.filter((bill) => getDueState(bill.due_date, today) === "overdue")
    const dueTodayBills = dues.filter((bill) => getDueState(bill.due_date, today) === "today")
    const upcomingBills = dues.filter((bill) => getDueState(bill.due_date, today) === "upcoming")

    return {
      outstanding,
      overdue: overdueBills.reduce((sum, bill) => sum + Number(bill.amount_due || 0), 0),
      overdueCount: overdueBills.length,
      today: dueTodayBills.reduce((sum, bill) => sum + Number(bill.amount_due || 0), 0),
      todayCount: dueTodayBills.length,
      upcoming: upcomingBills.reduce((sum, bill) => sum + Number(bill.amount_due || 0), 0),
    }
  }, [dues, today])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()

    return dues.filter((bill) => {
      const state = getDueState(bill.due_date, today)
      const matchesFilter =
        filter === "all" ||
        (filter === "overdue" && state === "overdue") ||
        (filter === "due_today" && state === "today") ||
        (filter === "upcoming" && state === "upcoming") ||
        (filter === "unpaid" && bill.payment_status === "unpaid") ||
        (filter === "partial" && bill.payment_status === "partial")

      const matchesSearch =
        !query ||
        String(bill.customers?.name || "").toLowerCase().includes(query) ||
        String(bill.customers?.mobile || "").toLowerCase().includes(query) ||
        String(bill.bill_number || "").toLowerCase().includes(query)

      return matchesFilter && matchesSearch
    })
  }, [dues, filter, search, today])

  function openPayment(bill) {
    setPayBill(bill)
    setPayAmount(String(Number(bill.amount_due || 0)))
    setPayMode("Cash")
  }

  function closePayment() {
    if (saving) return
    setPayBill(null)
    setPayAmount("")
  }

  async function handlePayment(event) {
    event.preventDefault()

    if (!payBill || !currentShop?.id) return

    const amount = Number(payAmount)
    const currentDue = Number(payBill.amount_due || 0)

    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid payment amount")
      return
    }

    if (amount > currentDue) {
      toast.error(`Payment cannot exceed the pending amount of ${formatCurrency(currentDue)}`)
      return
    }

    setSaving(true)

    try {
      // Fetch the latest bill values before recording the payment.
      const { data: bill, error: billError } = await supabase
        .from("bills")
        .select("id, customer_id, amount_paid, grand_total, advance_adjusted, amount_due")
        .eq("id", payBill.id)
        .eq("shop_id", currentShop.id)
        .single()

      if (billError) throw billError

      const latestDue = Number(bill.amount_due || 0)
      if (amount > latestDue) {
        throw new Error("The pending amount has changed. Refresh the page and try again.")
      }

      const newPaid = Number(bill.amount_paid || 0) + amount
      const newDue = Math.max(
        0,
        Number(bill.grand_total || 0) -
          Number(bill.advance_adjusted || 0) -
          newPaid
      )

      const { error: paymentError } = await supabase.from("payments").insert({
        shop_id: currentShop.id,
        customer_id: bill.customer_id,
        bill_id: bill.id,
        amount,
        payment_mode: payMode,
        payment_date: today,
      })

      if (paymentError) throw paymentError

      const { error: updateError } = await supabase
        .from("bills")
        .update({
          amount_paid: newPaid,
          amount_due: newDue,
          payment_status: newDue <= 0 ? "paid" : "partial",
        })
        .eq("id", bill.id)
        .eq("shop_id", currentShop.id)

      if (updateError) {
        throw new Error(
          `Payment was recorded, but the bill balance could not be updated. Please refresh and verify the payment. ${updateError.message}`
        )
      }

      toast.success("Payment recorded successfully")
      setPayBill(null)
      setPayAmount("")
      await loadDues(true)
    } catch (error) {
      toast.error(error.message || "Could not record payment")
    } finally {
      setSaving(false)
    }
  }

  if (!currentShop) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
        <div>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <Wallet className="h-6 w-6" />
          </div>
          <h2 className="font-semibold text-slate-900">Select a shop</h2>
          <p className="mt-1 text-sm text-slate-500">
            Choose a shop to view and manage its outstanding payments.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-8">
      {/* Page heading */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Wallet className="h-4 w-4" />
            <span>Payments</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-700">Dues</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
            Outstanding dues
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Track pending customer payments and record collections.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => loadDues(true)}
          disabled={loading || refreshing}
          className="h-10 gap-2 self-start rounded-xl border-slate-200 bg-white"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="flex items-start justify-between p-5">
            <div>
              <p className="text-sm font-medium text-slate-500">Total outstanding</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                {formatCurrency(stats.outstanding)}
              </p>
              <p className="mt-1 text-xs text-slate-500">{dues.length} pending bills</p>
            </div>
            <div className="rounded-xl bg-slate-100 p-3 text-slate-700">
              <IndianRupee className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-red-100 bg-red-50/40 shadow-sm">
          <CardContent className="flex items-start justify-between p-5">
            <div>
              <p className="text-sm font-medium text-red-700">Overdue amount</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-red-700">
                {formatCurrency(stats.overdue)}
              </p>
              <p className="mt-1 text-xs text-red-600/80">{stats.overdueCount} overdue bills</p>
            </div>
            <div className="rounded-xl bg-red-100 p-3 text-red-700">
              <CircleAlert className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-amber-100 bg-amber-50/40 shadow-sm">
          <CardContent className="flex items-start justify-between p-5">
            <div>
              <p className="text-sm font-medium text-amber-700">Due today</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-amber-700">
                {formatCurrency(stats.today)}
              </p>
              <p className="mt-1 text-xs text-amber-700/80">{stats.todayCount} bills due today</p>
            </div>
            <div className="rounded-xl bg-amber-100 p-3 text-amber-700">
              <CalendarClock className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-emerald-100 bg-emerald-50/40 shadow-sm">
          <CardContent className="flex items-start justify-between p-5">
            <div>
              <p className="text-sm font-medium text-emerald-700">Upcoming amount</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-emerald-700">
                {formatCurrency(stats.upcoming)}
              </p>
              <p className="mt-1 text-xs text-emerald-700/80">Payments not yet due</p>
            </div>
            <div className="rounded-xl bg-emerald-100 p-3 text-emerald-700">
              <Clock3 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dues list */}
      <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Customer payments</h2>
              <p className="mt-1 text-sm text-slate-500">
                {filtered.length} of {dues.length} pending bills
              </p>
            </div>

            <div className="relative w-full lg:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search customer, mobile or bill..."
                className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 pr-9 focus-visible:bg-white"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {FILTERS.map((item) => {
              const count =
                item.value === "all"
                  ? dues.length
                  : dues.filter((bill) => {
                      const state = getDueState(bill.due_date, today)
                      if (item.value === "overdue") return state === "overdue"
                      if (item.value === "due_today") return state === "today"
                      if (item.value === "upcoming") return state === "upcoming"
                      return bill.payment_status === item.value
                    }).length

              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter(item.value)}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                    filter === item.value
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {item.label}
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[11px] tabular-nums ${
                      filter === item.value
                        ? "bg-white/15 text-white"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[260px] items-center justify-center">
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-slate-700" />
              Loading outstanding dues...
            </div>
          </div>
        ) : loadError ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center px-5 text-center">
            <AlertCircle className="h-9 w-9 text-red-500" />
            <p className="mt-3 font-medium text-slate-900">Could not load dues</p>
            <p className="mt-1 max-w-md text-sm text-slate-500">{loadError}</p>
            <Button variant="outline" className="mt-4 rounded-xl" onClick={() => loadDues()}>
              Try again
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center px-5 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              {dues.length === 0 ? (
                <CheckCircle2 className="h-6 w-6" />
              ) : (
                <Search className="h-6 w-6" />
              )}
            </div>
            <p className="mt-4 font-semibold text-slate-900">
              {dues.length === 0 ? "You're all caught up" : "No matching dues"}
            </p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              {dues.length === 0
                ? "There are no outstanding customer payments for this shop."
                : "Try another filter or change your search."}
            </p>
            {(filter !== "all" || search) && (
              <Button
                variant="outline"
                className="mt-4 rounded-xl"
                onClick={() => {
                  setFilter("all")
                  setSearch("")
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-left">
                <thead className="bg-slate-50/80">
                  <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3">Customer / Bill</th>
                    <th className="px-5 py-3">Due date</th>
                    <th className="px-5 py-3">Payment status</th>
                    <th className="px-5 py-3 text-right">Amount due</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((bill) => {
                    const state = getDueState(bill.due_date, today)
                    const overdue = state === "overdue"

                    return (
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
                            {bill.customers?.mobile ? ` · ${bill.customers.mobile}` : ""}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-medium text-slate-700">
                            {bill.due_date ? formatDate(bill.due_date) : "Not set"}
                          </p>
                          {overdue && (
                            <p className="mt-1 text-xs font-medium text-red-600">Past due date</p>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <Badge
                            variant="outline"
                            className={
                              bill.payment_status === "partial"
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-slate-200 bg-slate-50 text-slate-600"
                            }
                          >
                            {bill.payment_status === "partial" ? "Partially paid" : "Unpaid"}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className={`font-semibold tabular-nums ${overdue ? "text-red-600" : "text-slate-900"}`}>
                            {formatCurrency(bill.amount_due)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            <Button asChild variant="ghost" size="sm" className="rounded-lg text-slate-600">
                              <Link to={`/bills/${bill.id}`}>View bill</Link>
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => openPayment(bill)}
                              className="rounded-lg bg-slate-900 text-white hover:bg-slate-700"
                            >
                              Record payment
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="divide-y divide-slate-100 md:hidden">
              {filtered.map((bill) => {
                const state = getDueState(bill.due_date, today)
                const overdue = state === "overdue"

                return (
                  <div key={bill.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          to={`/bills/${bill.id}`}
                          className="truncate font-semibold text-slate-900 hover:text-emerald-700"
                        >
                          {bill.customers?.name || "Walk-in customer"}
                        </Link>
                        <p className="mt-1 text-xs text-slate-500">
                          {bill.bill_number || "Bill"}
                          {bill.customers?.mobile ? ` · ${bill.customers.mobile}` : ""}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          overdue
                            ? "shrink-0 border-red-200 bg-red-50 text-red-700"
                            : state === "today"
                              ? "shrink-0 border-amber-200 bg-amber-50 text-amber-700"
                              : "shrink-0 border-slate-200 bg-slate-50 text-slate-600"
                        }
                      >
                        {overdue ? "Overdue" : state === "today" ? "Due today" : bill.payment_status === "partial" ? "Partial" : "Unpaid"}
                      </Badge>
                    </div>

                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-xs text-slate-500">
                          Due date: {bill.due_date ? formatDate(bill.due_date) : "Not set"}
                        </p>
                        <p className={`mt-1 text-lg font-semibold tabular-nums ${overdue ? "text-red-600" : "text-slate-950"}`}>
                          {formatCurrency(bill.amount_due)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => openPayment(bill)}
                        className="shrink-0 rounded-lg bg-slate-900 text-white hover:bg-slate-700"
                      >
                        Record payment
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </Card>

      {/* Record payment dialog */}
      <Dialog
        open={!!payBill}
        onOpenChange={(open) => {
          if (!open) closePayment()
        }}
      >
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Record payment</DialogTitle>
            <DialogDescription>
              Add a customer payment against this bill.
            </DialogDescription>
          </DialogHeader>

          {payBill && (
            <form onSubmit={handlePayment} className="space-y-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-medium text-slate-900">
                  {payBill.customers?.name || "Walk-in customer"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Bill {payBill.bill_number || "—"}
                </p>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-500">Pending amount</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">
                      {formatCurrency(payBill.amount_due)}
                    </p>
                  </div>
                  <ArrowDownLeft className="mb-1 h-5 w-5 text-emerald-600" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-amount">Payment amount</Label>
                <Input
                  id="payment-amount"
                  type="number"
                  min="0.01"
                  max={Number(payBill.amount_due || 0)}
                  step="0.01"
                  required
                  autoFocus
                  value={payAmount}
                  onChange={(event) => setPayAmount(event.target.value)}
                  className="h-11 rounded-xl"
                  placeholder="Enter amount"
                />
                <div className="flex flex-wrap gap-2">
                  {[0.25, 0.5, 1].map((fraction) => {
                    const value = Math.round(Number(payBill.amount_due || 0) * fraction * 100) / 100
                    return (
                      <button
                        key={fraction}
                        type="button"
                        onClick={() => setPayAmount(String(value))}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        {fraction === 1 ? "Full amount" : `${fraction * 100}%`}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Payment mode</Label>
                <Select value={payMode} onValueChange={setPayMode}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue placeholder="Select payment mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {mode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closePayment}
                  disabled={saving}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving || !payAmount || Number(payAmount) <= 0}
                  className="rounded-xl bg-slate-900 text-white hover:bg-slate-700"
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Confirm payment"
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
