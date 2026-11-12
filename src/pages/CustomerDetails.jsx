import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatDate } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

import {
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  IndianRupee,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  Wallet,
  UserRound,
  Building2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Receipt,
  CreditCard,
  MessageCircle,
  History,
} from "lucide-react"

import { toast } from "sonner"

function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function getPaymentStatus(bill) {
  if (Number(bill.amount_due || 0) <= 0) return "paid"
  if (
    Number(bill.amount_paid || 0) > 0 ||
    Number(bill.advance_adjusted || 0) > 0
  ) {
    return "partial"
  }

  return "unpaid"
}

function getStatusBadge(status) {
  if (status === "paid") {
    return (
      <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
        Paid
      </Badge>
    )
  }

  if (status === "partial") {
    return (
      <Badge className="border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">
        Partial
      </Badge>
    )
  }

  return (
    <Badge className="border border-red-200 bg-red-50 text-red-700 hover:bg-red-50">
      Unpaid
    </Badge>
  )
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = "slate",
}) {
  const colors = {
    slate: "bg-slate-50 text-slate-700 border-slate-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    red: "bg-red-50 text-red-700 border-red-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
  }

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-slate-500">{title}</p>

            <p className="mt-2 break-words text-2xl font-semibold tracking-tight text-slate-950">
              {value}
            </p>

            <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
          </div>

          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${colors[color]}`}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SectionHeader({ title, subtitle, count }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        )}
      </div>

      {count !== undefined && (
        <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
          {count} records
        </span>
      )}
    </div>
  )
}

function DetailRow({ label, value, icon: Icon }) {
  return (
    <div className="flex items-start gap-3">
      {Icon && (
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      )}

      <div className="min-w-0">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="mt-1 break-words text-sm font-medium text-slate-800">
          {value || "Not provided"}
        </p>
      </div>
    </div>
  )
}

export default function CustomerDetails() {
  const { customerId } = useParams()
  const { currentShop } = useShop()

  const [customer, setCustomer] = useState(null)
  const [bills, setBills] = useState([])
  const [payments, setPayments] = useState([])
  const [advances, setAdvances] = useState([])
  const [billItems, setBillItems] = useState([])

  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [billFilter, setBillFilter] = useState("all")
  const [activeTab, setActiveTab] = useState("bills")
  const [expandedBill, setExpandedBill] = useState(null)

  const loadCustomerDetails = useCallback(async () => {
    if (!currentShop?.id || !customerId) return

    setLoading(true)

    try {
      // Customer details
      const { data: customerData, error: customerError } =
        await supabase
          .from("customers")
          .select("*")
          .eq("id", customerId)
          .eq("shop_id", currentShop.id)
          .single()

      if (customerError) throw customerError

      setCustomer(customerData)

      // Customer bills
      const { data: billData, error: billError } =
        await supabase
          .from("bills")
          .select("*")
          .eq("shop_id", currentShop.id)
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false })

      if (billError) throw billError

      const safeBills = billData || []
      setBills(safeBills)

      // Bill items
      const billIds = safeBills.map((bill) => bill.id)

      if (billIds.length > 0) {
        const { data: itemData, error: itemError } =
          await supabase
            .from("bill_items")
            .select("*")
            .in("bill_id", billIds)
            .order("sort_order")

        if (itemError) throw itemError

        setBillItems(itemData || [])
      } else {
        setBillItems([])
      }

      // Payment history
      const { data: paymentData, error: paymentError } =
        await supabase
          .from("payments")
          .select("*")
          .eq("shop_id", currentShop.id)
          .eq("customer_id", customerId)
          .order("payment_date", { ascending: false })

      if (paymentError) throw paymentError

      setPayments(paymentData || [])

      // Customer advances
      const { data: advanceData, error: advanceError } =
        await supabase
          .from("customer_advances")
          .select("*")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false })

      if (advanceError) throw advanceError

      setAdvances(advanceData || [])
    } catch (error) {
      console.error("Customer details error:", error)
      toast.error(error.message || "Unable to load customer details")
    } finally {
      setLoading(false)
    }
  }, [currentShop?.id, customerId])

  useEffect(() => {
    loadCustomerDetails()
  }, [loadCustomerDetails])

  const calculations = useMemo(() => {
    const totalBills = bills.length

    const totalPurchase = bills.reduce(
      (sum, bill) => sum + Number(bill.grand_total || 0),
      0
    )

    const totalBillDue = bills.reduce(
      (sum, bill) => sum + Number(bill.amount_due || 0),
      0
    )

    const totalBillPaid = bills.reduce(
      (sum, bill) => sum + Number(bill.amount_paid || 0),
      0
    )

    const totalAdvanceAdjusted = bills.reduce(
      (sum, bill) => sum + Number(bill.advance_adjusted || 0),
      0
    )

    const totalReceived = payments.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    )

    const totalAdvanceReceived = advances.reduce(
      (sum, advance) => sum + Number(advance.amount || 0),
      0
    )

    const availableAdvance = advances.reduce(
      (sum, advance) =>
        sum + Number(advance.remaining_amount || 0),
      0
    )

    const totalAdvanceAdjustedFromRecords = advances.reduce(
      (sum, advance) =>
        sum +
        Math.max(
          0,
          Number(advance.amount || 0) -
            Number(advance.remaining_amount || 0)
        ),
      0
    )

    const today = localDateString()

    const overdueBills = bills.filter(
      (bill) =>
        Number(bill.amount_due || 0) > 0 &&
        bill.due_date &&
        bill.due_date < today
    )

    const dueTodayBills = bills.filter(
      (bill) =>
        Number(bill.amount_due || 0) > 0 &&
        bill.due_date === today
    )

    const overdueAmount = overdueBills.reduce(
      (sum, bill) => sum + Number(bill.amount_due || 0),
      0
    )

    const dueTodayAmount = dueTodayBills.reduce(
      (sum, bill) => sum + Number(bill.amount_due || 0),
      0
    )

    const unpaidBills = bills.filter(
      (bill) => Number(bill.amount_due || 0) > 0
    )

    return {
      totalBills,
      totalPurchase,
      totalBillDue,
      totalBillPaid,
      totalAdvanceAdjusted,
      totalReceived,
      totalAdvanceReceived,
      availableAdvance,
      totalAdvanceAdjustedFromRecords,
      overdueBills,
      overdueAmount,
      dueTodayBills,
      dueTodayAmount,
      unpaidBills,
    }
  }, [bills, payments, advances])

  const filteredBills = useMemo(() => {
    const query = search.trim().toLowerCase()

    return bills.filter((bill) => {
      const matchesSearch =
        !query ||
        bill.bill_number?.toLowerCase().includes(query)

      const status = getPaymentStatus(bill)

      const matchesFilter =
        billFilter === "all" ||
        (billFilter === "overdue" &&
          Number(bill.amount_due || 0) > 0 &&
          bill.due_date &&
          bill.due_date < localDateString()) ||
        (billFilter === "unpaid" && status === "unpaid") ||
        (billFilter === "partial" && status === "partial") ||
        (billFilter === "paid" && status === "paid")

      return matchesSearch && matchesFilter
    })
  }, [bills, search, billFilter])

  const getBillItems = (billId) =>
    billItems.filter((item) => item.bill_id === billId)

  const getBillPayments = (billId) =>
    payments.filter((payment) => payment.bill_id === billId)

  if (!currentShop) {
    return (
      <div className="py-16 text-center text-sm text-slate-500">
        Select a shop first.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-emerald-600" />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center text-center">
        <UserRound className="h-10 w-10 text-slate-300" />
        <h2 className="mt-4 font-semibold text-slate-900">
          Customer not found
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          This customer may have been deleted or does not belong to this shop.
        </p>

        <Button asChild variant="outline" className="mt-4 rounded-xl">
          <Link to="/customers">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to customers
          </Link>
        </Button>
      </div>
    )
  }

  const initials = customer.name
    ?.trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-10">

      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <Link to="/customers" className="hover:text-slate-700">
          Customers
        </Link>
        <span>/</span>
        <span className="font-medium text-slate-700">
          {customer.name}
        </span>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            asChild
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-xl"
          >
            <Link to="/customers">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>

          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-lg font-semibold text-slate-700">
            {initials || "C"}
          </div>

          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
              {customer.name}
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Customer account overview
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {customer.mobile && (
            <Button
              asChild
              variant="outline"
              className="h-10 rounded-xl"
            >
              <a href={`tel:${customer.mobile}`}>
                <Phone className="mr-2 h-4 w-4" />
                Call
              </a>
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={loadCustomerDetails}
            className="h-10 rounded-xl"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>

          <Button
            asChild
            className="h-10 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
          >
            <Link to="/bills/new">
              <PlusIcon />
              Create bill
            </Link>
          </Button>
        </div>
      </div>

      {/* Contact Details */}
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="grid gap-5 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
          <DetailRow
            label="Mobile number"
            value={customer.mobile}
            icon={Phone}
          />

          <DetailRow
            label="WhatsApp"
            value={customer.whatsapp}
            icon={MessageCircle}
          />

          <DetailRow
            label="Customer type"
            value={customer.customer_type || "Individual"}
            icon={Building2}
          />

          <DetailRow
            label="GSTIN"
            value={customer.gstin}
            icon={FileText}
          />

          <div className="sm:col-span-2 lg:col-span-4">
            <DetailRow
              label="Address"
              value={[
                customer.address,
                customer.city,
                customer.state,
                customer.pincode,
              ]
                .filter(Boolean)
                .join(", ")}
              icon={MapPin}
            />
          </div>
        </CardContent>
      </Card>

      {/* Main Stats */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total bills"
          value={calculations.totalBills}
          subtitle="Bills created for this customer"
          icon={Receipt}
          color="blue"
        />

        <StatCard
          title="Total purchase"
          value={formatCurrency(calculations.totalPurchase)}
          subtitle="Combined bill value"
          icon={IndianRupee}
          color="slate"
        />

        <StatCard
          title="Total received"
          value={formatCurrency(calculations.totalReceived)}
          subtitle="Payments recorded"
          icon={ArrowDownLeft}
          color="emerald"
        />

        <StatCard
          title="Outstanding dues"
          value={formatCurrency(calculations.totalBillDue)}
          subtitle="Amount remaining on bills"
          icon={Wallet}
          color="red"
        />
      </div>

      {/* Advance + Overdue */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Advance Summary */}
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">
                  Advance account
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Customer advance balance
                </p>
              </div>

              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50">
                <Wallet className="h-5 w-5 text-emerald-700" />
              </div>
            </div>

            <div className="mt-5">
              <p className="text-xs text-slate-500">
                Available advance
              </p>

              <p className="mt-1 text-3xl font-semibold tracking-tight text-emerald-700">
                {formatCurrency(calculations.availableAdvance)}
              </p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">
                  Total advance received
                </p>

                <p className="mt-2 text-base font-semibold text-slate-900">
                  {formatCurrency(calculations.totalAdvanceReceived)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">
                  Advance adjusted
                </p>

                <p className="mt-2 text-base font-semibold text-slate-900">
                  {formatCurrency(calculations.totalAdvanceAdjustedFromRecords)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Overdue Summary */}
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">
                  Due overview
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Pending payment deadlines
                </p>
              </div>

              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 bg-red-50">
                <Clock3 className="h-5 w-5 text-red-600" />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-red-100 bg-red-50/60 p-3">
                <p className="text-xs text-red-600">
                  Overdue amount
                </p>

                <p className="mt-2 text-xl font-semibold text-red-700">
                  {formatCurrency(calculations.overdueAmount)}
                </p>

                <p className="mt-1 text-xs text-red-500">
                  {calculations.overdueBills.length} overdue bills
                </p>
              </div>

              <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
                <p className="text-xs text-amber-700">
                  Due today
                </p>

                <p className="mt-2 text-xl font-semibold text-amber-700">
                  {formatCurrency(calculations.dueTodayAmount)}
                </p>

                <p className="mt-1 text-xs text-amber-600">
                  {calculations.dueTodayBills.length} bills
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-sm text-slate-500">
                Pending bills
              </span>

              <span className="text-sm font-semibold text-slate-900">
                {calculations.unpaidBills.length}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="space-y-4">
        <div className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-2">
          {[
            { id: "bills", label: "Bills", icon: FileText },
            { id: "payments", label: "Payments", icon: CreditCard },
            { id: "advances", label: "Advances", icon: Wallet },
            { id: "statement", label: "Statement", icon: History },
          ].map((tab) => {
            const Icon = tab.icon

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-slate-900 text-white"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Bills Tab */}
        {activeTab === "bills" && (
          <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <SectionHeader
                title="Customer bills"
                subtitle="All purchases and payment deadlines"
                count={filteredBills.length}
              />

              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative sm:w-56">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                  <Input
                    placeholder="Search bill number..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="h-10 rounded-xl pl-9"
                  />
                </div>

                <select
                  value={billFilter}
                  onChange={(event) => setBillFilter(event.target.value)}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none"
                >
                  <option value="all">All bills</option>
                  <option value="paid">Paid</option>
                  <option value="partial">Partial</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
            </div>

            {filteredBills.length === 0 ? (
              <div className="py-14 text-center">
                <FileText className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 font-medium text-slate-700">
                  No bills found
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  No bills match the selected filter.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredBills.map((bill) => {
                  const status = getPaymentStatus(bill)
                  const isExpanded = expandedBill === bill.id

                  const overdue =
                    Number(bill.amount_due || 0) > 0 &&
                    bill.due_date &&
                    bill.due_date < localDateString()

                  const items = getBillItems(bill.id)
                  const billPaymentList = getBillPayments(bill.id)

                  return (
                    <div key={bill.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedBill(
                            isExpanded ? null : bill.id
                          )
                        }
                        className="w-full p-4 text-left transition-colors hover:bg-slate-50/80 sm:px-5"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
                              <FileText className="h-5 w-5 text-slate-600" />
                            </div>

                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-slate-900">
                                  {bill.bill_number}
                                </p>

                                {getStatusBadge(status)}

                                {overdue && (
                                  <Badge className="border border-red-200 bg-red-50 text-red-700 hover:bg-red-50">
                                    Overdue
                                  </Badge>
                                )}
                              </div>

                              <p className="mt-1 text-xs text-slate-500">
                                Bill date: {formatDate(bill.bill_date)}
                              </p>

                              <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                                <CalendarDays className="h-3 w-3" />
                                Due: {bill.due_date
                                  ? formatDate(bill.due_date)
                                  : "No deadline"}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-5 lg:justify-end">
                            <div className="grid grid-cols-3 gap-4 text-right">
                              <div>
                                <p className="text-[11px] text-slate-400">
                                  Bill total
                                </p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">
                                  {formatCurrency(bill.grand_total)}
                                </p>
                              </div>

                              <div>
                                <p className="text-[11px] text-slate-400">
                                  Paid
                                </p>
                                <p className="mt-1 text-sm font-medium text-emerald-700">
                                  {formatCurrency(
                                    Number(bill.amount_paid || 0) +
                                    Number(bill.advance_adjusted || 0)
                                  )}
                                </p>
                              </div>

                              <div>
                                <p className="text-[11px] text-slate-400">
                                  Due
                                </p>
                                <p className="mt-1 text-sm font-semibold text-red-600">
                                  {formatCurrency(bill.amount_due)}
                                </p>
                              </div>
                            </div>

                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                            )}
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="space-y-4 border-t border-slate-100 bg-slate-50/60 p-4 sm:p-5">

                          {/* Bill Items */}
                          <div>
                            <h3 className="mb-3 text-sm font-semibold text-slate-800">
                              Purchased items
                            </h3>

                            {items.length === 0 ? (
                              <p className="text-sm text-slate-500">
                                No item details available.
                              </p>
                            ) : (
                              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                                <table className="w-full min-w-[550px] text-left text-sm">
                                  <thead className="bg-slate-50">
                                    <tr>
                                      <th className="px-4 py-3 text-xs font-medium text-slate-500">
                                        Item
                                      </th>
                                      <th className="px-4 py-3 text-xs font-medium text-slate-500">
                                        Qty
                                      </th>
                                      <th className="px-4 py-3 text-xs font-medium text-slate-500">
                                        Rate
                                      </th>
                                      <th className="px-4 py-3 text-xs font-medium text-slate-500">
                                        GST
                                      </th>
                                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">
                                        Amount
                                      </th>
                                    </tr>
                                  </thead>

                                  <tbody className="divide-y divide-slate-100">
                                    {items.map((item) => (
                                      <tr key={item.id}>
                                        <td className="px-4 py-3">
                                          <p className="font-medium text-slate-800">
                                            {item.item_name}
                                          </p>

                                          {item.description && (
                                            <p className="mt-0.5 text-xs text-slate-400">
                                              {item.description}
                                            </p>
                                          )}
                                        </td>

                                        <td className="px-4 py-3 text-slate-600">
                                          {item.quantity} {item.unit}
                                        </td>

                                        <td className="px-4 py-3 text-slate-600">
                                          {formatCurrency(item.rate)}
                                        </td>

                                        <td className="px-4 py-3 text-slate-600">
                                          {item.gst_percent}%
                                        </td>

                                        <td className="px-4 py-3 text-right font-medium text-slate-900">
                                          {formatCurrency(item.total_amount)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>

                          {/* Bill Summary */}
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="rounded-xl border border-slate-200 bg-white p-4">
                              <h3 className="mb-3 text-sm font-semibold text-slate-800">
                                Bill summary
                              </h3>

                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between gap-3">
                                  <span className="text-slate-500">Subtotal</span>
                                  <span>{formatCurrency(bill.subtotal)}</span>
                                </div>

                                <div className="flex justify-between gap-3">
                                  <span className="text-slate-500">Discount</span>
                                  <span>{formatCurrency(bill.discount_amount)}</span>
                                </div>

                                <div className="flex justify-between gap-3">
                                  <span className="text-slate-500">GST</span>
                                  <span>{formatCurrency(bill.total_gst)}</span>
                                </div>

                                <div className="flex justify-between gap-3 border-t border-slate-100 pt-2 font-semibold">
                                  <span>Grand total</span>
                                  <span>{formatCurrency(bill.grand_total)}</span>
                                </div>
                              </div>
                            </div>

                            <div className="rounded-xl border border-slate-200 bg-white p-4">
                              <h3 className="mb-3 text-sm font-semibold text-slate-800">
                                Payment breakdown
                              </h3>

                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between gap-3">
                                  <span className="text-slate-500">Direct payments</span>
                                  <span className="text-emerald-700">
                                    {formatCurrency(bill.amount_paid)}
                                  </span>
                                </div>

                                <div className="flex justify-between gap-3">
                                  <span className="text-slate-500">Advance adjusted</span>
                                  <span className="text-emerald-700">
                                    {formatCurrency(bill.advance_adjusted)}
                                  </span>
                                </div>

                                <div className="flex justify-between gap-3 border-t border-slate-100 pt-2 font-semibold">
                                  <span>Remaining due</span>
                                  <span className="text-red-600">
                                    {formatCurrency(bill.amount_due)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Payments for this bill */}
                          {billPaymentList.length > 0 && (
                            <div className="rounded-xl border border-slate-200 bg-white p-4">
                              <h3 className="mb-3 text-sm font-semibold text-slate-800">
                                Payment records
                              </h3>

                              <div className="space-y-3">
                                {billPaymentList.map((payment) => (
                                  <div
                                    key={payment.id}
                                    className="flex items-center justify-between gap-3"
                                  >
                                    <div>
                                      <p className="text-sm font-medium text-slate-800">
                                        {payment.payment_mode || "Payment"}
                                      </p>
                                      <p className="mt-1 text-xs text-slate-400">
                                        {formatDate(payment.payment_date)}
                                      </p>
                                    </div>

                                    <p className="text-sm font-semibold text-emerald-700">
                                      {formatCurrency(payment.amount)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="flex justify-end">
                            <Button
                              asChild
                              variant="outline"
                              size="sm"
                              className="rounded-xl"
                            >
                              <Link to={`/bills/${bill.id}`}>
                                Open full bill
                                <ArrowUpRight className="ml-2 h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        )}

        {/* Payments Tab */}
        {activeTab === "payments" && (
          <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
            <div className="border-b border-slate-100 p-4 sm:p-5">
              <SectionHeader
                title="Payment history"
                subtitle="All payments received from this customer"
                count={payments.length}
              />
            </div>

            {payments.length === 0 ? (
              <div className="py-14 text-center">
                <CreditCard className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 font-medium text-slate-700">
                  No payments recorded
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {payments.map((payment) => {
                  const relatedBill = bills.find(
                    (bill) => bill.id === payment.bill_id
                  )

                  return (
                    <div
                      key={payment.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50">
                          <ArrowDownLeft className="h-5 w-5 text-emerald-700" />
                        </div>

                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">
                            {payment.payment_mode || "Payment"}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {formatDate(payment.payment_date)}
                          </p>

                          <p className="mt-1 text-xs text-slate-400">
                            {relatedBill
                              ? relatedBill.bill_number
                              : "No bill reference"}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-base font-semibold text-emerald-700">
                          +{formatCurrency(payment.amount)}
                        </p>

                        <Badge
                          variant="secondary"
                          className="mt-1 border border-emerald-200 bg-emerald-50 text-emerald-700"
                        >
                          Received
                        </Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        )}

        {/* Advances Tab */}
        {activeTab === "advances" && (
          <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
            <div className="border-b border-slate-100 p-4 sm:p-5">
              <SectionHeader
                title="Advance history"
                subtitle="Customer deposits and remaining advance balances"
                count={advances.length}
              />
            </div>

            {advances.length === 0 ? (
              <div className="py-14 text-center">
                <Wallet className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 font-medium text-slate-700">
                  No advance records
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  No advance payments have been recorded for this customer.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {advances.map((advance) => {
                  const original = Number(advance.amount || 0)
                  const remaining = Number(advance.remaining_amount || 0)
                  const adjusted = Math.max(0, original - remaining)

                  return (
                    <div
                      key={advance.id}
                      className="p-4 sm:p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            Advance deposit
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {formatDate(
                              advance.created_at?.split("T")[0]
                            )}
                          </p>
                        </div>

                        <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                          Advance
                        </Badge>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-3">
                        <div>
                          <p className="text-xs text-slate-400">
                            Received
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {formatCurrency(original)}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-slate-400">
                            Adjusted
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-700">
                            {formatCurrency(adjusted)}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-slate-400">
                            Remaining
                          </p>
                          <p className="mt-1 text-sm font-semibold text-emerald-700">
                            {formatCurrency(remaining)}
                          </p>
                        </div>
                      </div>

                      {advance.notes && (
                        <p className="mt-3 text-xs text-slate-500">
                          {advance.notes}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        )}

        {/* Statement Tab */}
        {activeTab === "statement" && (
          <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
            <div className="border-b border-slate-100 p-4 sm:p-5">
              <SectionHeader
                title="Account statement"
                subtitle="Purchase and payment activity"
              />
            </div>

            {(() => {
              const transactions = [
                ...bills.map((bill) => ({
                  id: `bill-${bill.id}`,
                  date: bill.bill_date,
                  type: "bill",
                  reference: bill.bill_number,
                  description: "Bill created",
                  debit: Number(bill.grand_total || 0),
                  credit: 0,
                })),

                ...payments.map((payment) => ({
                  id: `payment-${payment.id}`,
                  date: payment.payment_date,
                  type: "payment",
                  reference: payment.id.slice(0, 8),
                  description: `Payment received - ${payment.payment_mode || "Other"}`,
                  debit: 0,
                  credit: Number(payment.amount || 0),
                })),

                ...advances.map((advance) => ({
                  id: `advance-${advance.id}`,
                  date: advance.created_at?.split("T")[0],
                  type: "advance",
                  reference: advance.id.slice(0, 8),
                  description: "Advance received",
                  debit: 0,
                  credit: Number(advance.amount || 0),
                })),
              ].sort((a, b) => {
                return (a.date || "").localeCompare(b.date || "")
              })

              let runningBalance = 0

              const rows = transactions.map((transaction) => {
                runningBalance +=
                  transaction.debit - transaction.credit

                return {
                  ...transaction,
                  balance: runningBalance,
                }
              }).reverse()

              return rows.length === 0 ? (
                <div className="py-14 text-center">
                  <History className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-3 font-medium text-slate-700">
                    No account activity
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[650px] text-left">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-5 py-3 text-xs font-medium text-slate-500">
                          Date
                        </th>
                        <th className="px-5 py-3 text-xs font-medium text-slate-500">
                          Description
                        </th>
                        <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">
                          Debit
                        </th>
                        <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">
                          Credit
                        </th>
                        <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">
                          Balance
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {rows.map((row) => (
                        <tr key={row.id}>
                          <td className="px-5 py-4 text-xs text-slate-500">
                            {formatDate(row.date)}
                          </td>

                          <td className="px-5 py-4">
                            <p className="text-sm font-medium text-slate-800">
                              {row.description}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              {row.reference}
                            </p>
                          </td>

                          <td className="px-5 py-4 text-right text-sm text-red-600">
                            {row.debit > 0
                              ? formatCurrency(row.debit)
                              : "—"}
                          </td>

                          <td className="px-5 py-4 text-right text-sm text-emerald-700">
                            {row.credit > 0
                              ? formatCurrency(row.credit)
                              : "—"}
                          </td>

                          <td className="px-5 py-4 text-right text-sm font-semibold text-slate-900">
                            {formatCurrency(row.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </Card>
        )}
      </div>

      {/* Notes */}
      {customer.notes && (
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold text-slate-900">
              Customer notes
            </h2>

            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
              {customer.notes}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function PlusIcon() {
  return <ArrowUpRight className="mr-2 h-4 w-4" />
}