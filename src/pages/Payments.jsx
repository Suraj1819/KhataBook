
import { useEffect, useMemo, useState } from "react"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatDate, PAYMENT_MODES } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Plus,
  Search,
  CreditCard,
  Wallet,
  ArrowDownLeft,
  CalendarDays,
  X,
  Receipt,
} from "lucide-react"
import { toast } from "sonner"

const getToday = () => {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const initialForm = () => ({
  customer_id: "",
  amount: "",
  payment_mode: "Cash",
  payment_date: getToday(),
  is_advance: false,
  notes: "",
})

function SummaryCard({
  title,
  value,
  description,
  icon: Icon,
  iconBg = "bg-slate-100",
  iconColor = "text-slate-700",
}) {
  return (
    <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[15px] font-medium text-slate-600">
            {title}
          </p>

          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${iconBg}`}
          >
            <Icon className={`h-6 w-6 ${iconColor}`} />
          </div>
        </div>

        <p className="mt-[-2px] text-[28px] font-semibold tracking-tight text-slate-950">
          {value}
        </p>

        <p className="mt-1 text-sm text-slate-500">
          {description}
        </p>
      </CardContent>
    </Card>
  )
}

export default function Payments() {
  const { currentShop } = useShop()

  const [payments, setPayments] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [customersLoading, setCustomersLoading] = useState(false)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")

  const [form, setForm] = useState(initialForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!currentShop?.id) {
      setPayments([])
      setCustomers([])
      setLoading(false)
      return
    }

    loadPayments()
    loadCustomers()
  }, [currentShop?.id])

  async function loadPayments() {
    if (!currentShop?.id) return

    setLoading(true)

    try {
      const { data, error } = await supabase
        .from("payments")
        .select("*, customers(name, mobile), bills(bill_number)")
        .eq("shop_id", currentShop.id)
        .order("payment_date", { ascending: false })
        .limit(100)

      if (error) throw error

      setPayments(data || [])
    } catch (error) {
      toast.error(error.message || "Failed to load payments")
    } finally {
      setLoading(false)
    }
  }

  async function loadCustomers() {
    if (!currentShop?.id) return

    setCustomersLoading(true)

    try {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, mobile")
        .eq("shop_id", currentShop.id)
        .eq("is_active", true)
        .order("name")

      if (error) throw error

      setCustomers(data || [])
    } catch (error) {
      toast.error(error.message || "Failed to load customers")
    } finally {
      setCustomersLoading(false)
    }
  }

  const filteredPayments = useMemo(() => {
    return payments.filter((payment) => {
      const query = search.trim().toLowerCase()

      const searchableFields = [
        payment.customers?.name,
        payment.customers?.mobile,
        payment.bills?.bill_number,
        payment.payment_mode,
        payment.amount,
        payment.payment_date,
        formatDate(payment.payment_date),
        payment.notes,
        payment.is_refund ? "refund" : "",
        payment.is_advance ? "advance" : "payment",
      ]

      const searchMatch =
        !query ||
        searchableFields.some((value) =>
          String(value ?? "").toLowerCase().includes(query)
        )

      let typeMatch = true

      if (typeFilter === "advance") {
        typeMatch = payment.is_advance && !payment.is_refund
      } else if (typeFilter === "regular") {
        typeMatch = !payment.is_advance && !payment.is_refund
      } else if (typeFilter === "refund") {
        typeMatch = payment.is_refund
      }

      return searchMatch && typeMatch
    })
  }, [payments, search, typeFilter])

  const summary = useMemo(() => {
    const received = payments.reduce((total, payment) => {
      if (payment.is_refund) return total
      return total + Number(payment.amount || 0)
    }, 0)

    const advances = payments.reduce((total, payment) => {
      if (payment.is_advance && !payment.is_refund) {
        return total + Number(payment.amount || 0)
      }
      return total
    }, 0)

    const refunds = payments.reduce((total, payment) => {
      if (payment.is_refund) {
        return total + Number(payment.amount || 0)
      }
      return total
    }, 0)

    return {
      received,
      advances,
      refunds,
      count: payments.length,
    }
  }, [payments])

  function updateForm(key, value) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  function openDialog() {
    if (customers.length === 0 && !customersLoading) {
      loadCustomers()
    }

    setForm(initialForm())
    setDialogOpen(true)
  }

  function closeDialog(open) {
    if (saving) return

    setDialogOpen(open)

    if (!open) {
      setForm(initialForm())
    }
  }

  async function handleSave(e) {
    e.preventDefault()

    if (!currentShop?.id) {
      toast.error("Please select a shop first")
      return
    }

    if (!form.customer_id) {
      toast.error("Please select a customer")
      return
    }

    const amount = Number(form.amount)

    if (
      !form.amount ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      toast.error("Please enter a valid amount")
      return
    }

    if (!form.payment_date) {
      toast.error("Please select a payment date")
      return
    }

    setSaving(true)

    try {
      const { data: payment, error } = await supabase
        .from("payments")
        .insert({
          shop_id: currentShop.id,
          customer_id: form.customer_id,
          amount,
          payment_mode: form.payment_mode,
          payment_date: form.payment_date,
          is_advance: form.is_advance,
          notes: form.notes.trim() || null,
        })
        .select()
        .single()

      if (error) throw error

      if (form.is_advance) {
        const { error: advanceError } = await supabase
          .from("customer_advances")
          .insert({
            shop_id: currentShop.id,
            customer_id: form.customer_id,
            amount,
            remaining_amount: amount,
            payment_id: payment.id,
          })

        if (advanceError) {
          toast.error(
            `Payment saved, but advance creation failed: ${advanceError.message}`
          )
          setDialogOpen(false)
          setForm(initialForm())
          await loadPayments()
          return
        }
      }

      toast.success(
        form.is_advance
          ? "Advance payment recorded successfully"
          : "Payment recorded successfully"
      )

      setDialogOpen(false)
      setForm(initialForm())

      await loadPayments()
    } catch (error) {
      toast.error(error.message || "Failed to record payment")
    } finally {
      setSaving(false)
    }
  }

  if (!currentShop) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-slate-500">
          Select a shop first
        </p>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6 pb-8">

      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Payments
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage customer payments and advance records.
          </p>
        </div>

        <Button
          onClick={openDialog}
          disabled={customersLoading}
          className="h-10 rounded-xl bg-emerald-600 px-5 font-medium hover:bg-emerald-700"
        >
          <Plus className="mr-2 h-4 w-4" />
          Record Payment
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Total Received"
          value={formatCurrency(summary.received)}
          description="Payments recorded"
          icon={CreditCard}
          iconBg="bg-slate-100"
          iconColor="text-slate-700"
        />

        <SummaryCard
          title="Advance Payments"
          value={formatCurrency(summary.advances)}
          description="Advance amounts recorded"
          icon={Wallet}
          iconBg="bg-blue-100"
          iconColor="text-blue-700"
        />

        <SummaryCard
          title="Refunds"
          value={formatCurrency(summary.refunds)}
          description="Total refunded amount"
          icon={ArrowDownLeft}
          iconBg="bg-red-100"
          iconColor="text-red-600"
        />

        <SummaryCard
          title="Transactions"
          value={summary.count}
          description="Total payment records"
          icon={CalendarDays}
          iconBg="bg-amber-100"
          iconColor="text-amber-700"
        />
      </div>

      {/* Payment History */}
      <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

        {/* Table Header and Filters */}
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Payment History
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {filteredPayments.length} records found
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search anything..."
                className="h-11 rounded-xl border-slate-200 pl-10 pr-10 text-sm shadow-none placeholder:text-slate-400 focus-visible:ring-emerald-500"
              />

              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <Select
              value={typeFilter}
              onValueChange={setTypeFilter}
            >
              <SelectTrigger className="h-11 w-full rounded-xl border-slate-200 shadow-none sm:w-44">
                <SelectValue placeholder="All Payments" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="all">All Payments</SelectItem>
                <SelectItem value="regular">Regular</SelectItem>
                <SelectItem value="advance">Advance</SelectItem>
                <SelectItem value="refund">Refunds</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Loading */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-emerald-600 border-t-transparent" />
          </div>
        ) : filteredPayments.length === 0 ? (

          /* Empty State */
          <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
              <Receipt className="h-5 w-5 text-slate-500" />
            </div>

            <p className="text-sm font-semibold text-slate-800">
              {payments.length === 0
                ? "No payments recorded yet"
                : "No matching payments found"}
            </p>

            <p className="mt-1 text-sm text-slate-500">
              {payments.length === 0
                ? "Record your first customer payment."
                : "Try another search or filter."}
            </p>

            {payments.length === 0 && (
              <Button
                onClick={openDialog}
                variant="outline"
                className="mt-4 h-9 rounded-xl"
              >
                <Plus className="mr-2 h-4 w-4" />
                Record Payment
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-left">
                    <th className="px-6 py-4 font-medium text-slate-500">
                      Customer
                    </th>
                    <th className="px-5 py-4 font-medium text-slate-500">
                      Date
                    </th>
                    <th className="px-5 py-4 font-medium text-slate-500">
                      Payment Mode
                    </th>
                    <th className="px-5 py-4 font-medium text-slate-500">
                      Reference
                    </th>
                    <th className="px-5 py-4 font-medium text-slate-500">
                      Type
                    </th>
                    <th className="px-6 py-4 text-right font-medium text-slate-500">
                      Amount
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200">
                  {filteredPayments.map((payment) => (
                    <tr
                      key={payment.id}
                      className="transition-colors hover:bg-slate-50/70"
                    >
                      <td className="px-6 py-4">
                        <p className="font-medium text-slate-900">
                          {payment.customers?.name || "Unknown customer"}
                        </p>

                        {payment.customers?.mobile && (
                          <p className="mt-1 text-xs text-slate-400">
                            {payment.customers.mobile}
                          </p>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                        {formatDate(payment.payment_date)}
                      </td>

                      <td className="px-5 py-4 text-slate-700">
                        {payment.payment_mode || "—"}
                      </td>

                      <td className="px-5 py-4 font-medium text-slate-800">
                        {payment.bills?.bill_number || "—"}
                      </td>

                      <td className="px-5 py-4">
                        <span className="text-sm text-slate-600">
                          {payment.is_refund
                            ? "Refund"
                            : payment.is_advance
                              ? "Advance"
                              : "Payment"}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <span
                          className={`font-semibold tabular-nums ${
                            payment.is_refund
                              ? "text-red-600"
                              : "text-emerald-600"
                          }`}
                        >
                          {payment.is_refund ? "-" : "+"}
                          {formatCurrency(payment.amount)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile List */}
            <div className="divide-y divide-slate-200 md:hidden">
              {filteredPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-slate-50/70"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {payment.customers?.name || "Unknown customer"}
                    </p>

                    {payment.customers?.mobile && (
                      <p className="mt-0.5 text-xs text-slate-400">
                        {payment.customers.mobile}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>{formatDate(payment.payment_date)}</span>
                      <span>·</span>
                      <span>{payment.payment_mode}</span>
                      <span>·</span>
                      <span>
                        {payment.is_refund
                          ? "Refund"
                          : payment.is_advance
                            ? "Advance"
                            : "Payment"}
                      </span>
                    </div>

                    {payment.bills?.bill_number && (
                      <p className="mt-1 text-xs text-slate-400">
                        {payment.bills.bill_number}
                      </p>
                    )}
                  </div>

                  <p
                    className={`shrink-0 text-sm font-semibold tabular-nums ${
                      payment.is_refund
                        ? "text-red-600"
                        : "text-emerald-600"
                    }`}
                  >
                    {payment.is_refund ? "-" : "+"}
                    {formatCurrency(payment.amount)}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* Record Payment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-[480px]">

          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg font-semibold text-slate-900">
              Record Payment
            </DialogTitle>

            <DialogDescription className="text-sm text-slate-500">
              Enter customer payment details below.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-5">

            {/* Customer */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">
                Customer <span className="text-red-500">*</span>
              </Label>

              <Select
                value={form.customer_id}
                onValueChange={(value) =>
                  updateForm("customer_id", value)
                }
                disabled={customersLoading || saving}
              >
                <SelectTrigger className="h-11 rounded-xl border-slate-200">
                  <SelectValue
                    placeholder={
                      customersLoading
                        ? "Loading customers..."
                        : "Select customer"
                    }
                  />
                </SelectTrigger>

                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem
                      key={customer.id}
                      value={customer.id}
                    >
                      <div className="flex flex-col">
                        <span>{customer.name}</span>
                        {customer.mobile && (
                          <span className="text-xs text-slate-400">
                            {customer.mobile}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {!customersLoading && customers.length === 0 && (
                <p className="text-xs text-red-500">
                  No active customers found. Add a customer first.
                </p>
              )}
            </div>

            {/* Amount and Payment Mode */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">
                  Amount <span className="text-red-500">*</span>
                </Label>

                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Enter amount"
                  value={form.amount}
                  onChange={(e) =>
                    updateForm("amount", e.target.value)
                  }
                  className="h-11 rounded-xl border-slate-200"
                  required
                  disabled={saving}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">
                  Payment Mode
                </Label>

                <Select
                  value={form.payment_mode}
                  onValueChange={(value) =>
                    updateForm("payment_mode", value)
                  }
                  disabled={saving}
                >
                  <SelectTrigger className="h-11 rounded-xl border-slate-200">
                    <SelectValue />
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
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">
                Payment Date <span className="text-red-500">*</span>
              </Label>

              <Input
                type="date"
                value={form.payment_date}
                onChange={(e) =>
                  updateForm("payment_date", e.target.value)
                }
                className="h-11 rounded-xl border-slate-200"
                required
                disabled={saving}
              />
            </div>

            {/* Advance Checkbox */}
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 transition-colors hover:bg-slate-50">
              <input
                type="checkbox"
                checked={form.is_advance}
                onChange={(e) =>
                  updateForm("is_advance", e.target.checked)
                }
                disabled={saving}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-emerald-600"
              />

              <span>
                <span className="block text-sm font-medium text-slate-800">
                  Advance Payment
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  Save this amount as customer advance for adjustment in future bills.
                </span>
              </span>
            </label>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">
                Notes
              </Label>

              <Textarea
                value={form.notes}
                onChange={(e) =>
                  updateForm("notes", e.target.value)
                }
                placeholder="Add payment details (optional)"
                rows={3}
                className="resize-none rounded-xl border-slate-200"
                disabled={saving}
              />
            </div>

            {/* Amount Preview */}
            {Number(form.amount) > 0 && Number.isFinite(Number(form.amount)) && (
              <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
                <span className="text-sm font-medium text-slate-600">
                  Amount to record
                </span>
                <span className="text-lg font-semibold text-emerald-700">
                  {formatCurrency(Number(form.amount))}
                </span>
              </div>
            )}

            {/* Footer */}
            <DialogFooter className="flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => closeDialog(false)}
                disabled={saving}
                className="h-10 rounded-xl"
              >
                Cancel
              </Button>

              <Button
                type="submit"
                disabled={
                  saving ||
                  customersLoading ||
                  customers.length === 0
                }
                className="h-10 rounded-xl bg-emerald-600 px-6 hover:bg-emerald-700"
              >
                {saving ? (
                  <>
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Save Payment
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
