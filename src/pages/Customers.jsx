import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import {
  formatCurrency,
  formatDate,
  CUSTOMER_TYPES,
  PAYMENT_MODES,
} from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  IndianRupee,
  Loader2,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react"

import { toast } from "sonner"

const emptyForm = {
  name: "",
  mobile: "",
  whatsapp: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  gstin: "",
  customer_type: "Individual",
  opening_balance: "",
  notes: "",
}

function getInitials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

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

function StatCard({ title, value, description, icon: Icon, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    emerald: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700",
  }

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            {value}
          </p>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>

        <div className={`shrink-0 rounded-xl p-3 ${tones[tone] || tones.slate}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  )
}

function SectionHeading({ title, description, action }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="font-semibold text-slate-900">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}

function DetailItem({ label, value, icon: Icon }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-slate-400">
        {Icon && <Icon className="h-4 w-4" />}
        <p className="text-xs">{label}</p>
      </div>
      <p className="mt-2 break-words text-sm font-medium text-slate-800">
        {value || "Not provided"}
      </p>
    </div>
  )
}

/* ============ NEW: Professional form primitives ============ */

function FormSection({ icon: Icon, title, description, children }) {
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
            <Icon className="h-3.5 w-3.5 text-emerald-700" />
          </div>
        )}
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs text-slate-500">{description}</p>
          )}
        </div>
      </div>
      {children}
    </section>
  )
}

function FieldInput({ label, required, hint, className, ...props }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>

      <Input
        {...props}
        className={
          className ||
          "h-11 rounded-xl border-slate-200 bg-slate-50/50 text-sm shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/20"
        }
      />

      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

/* ============ Professional CustomerFormDialog ============ */

function CustomerFormDialog({
  open,
  onOpenChange,
  editing,
  form,
  updateField,
  onSave,
  saving,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl sm:max-w-[580px]">
        {/* Header with gradient accent */}
        <div className="relative border-b border-slate-100 bg-gradient-to-br from-emerald-50 via-white to-white px-6 pb-5 pt-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 shadow-lg shadow-emerald-600/25">
              {editing ? (
                <Pencil className="h-5 w-5 text-white" />
              ) : (
                <UserRound className="h-5 w-5 text-white" />
              )}
            </div>

            <div className="min-w-0 flex-1 pr-6">
              <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
                {editing ? "Edit customer" : "Add new customer"}
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-slate-500">
                {editing
                  ? "Update customer contact and account information."
                  : "Enter the customer's details for this shop."}
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Form body (scrollable) */}
        <form
          onSubmit={onSave}
          className="flex max-h-[calc(92vh-180px)] flex-col"
        >
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
            {/* Basic info */}
            <FormSection
              icon={UserRound}
              title="Basic information"
              description="Customer name and contact details."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <FieldInput
                    label="Customer name"
                    required
                    value={form.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    placeholder="Enter customer name"
                    autoFocus
                  />
                </div>

                <FieldInput
                  label="Mobile number"
                  type="tel"
                  value={form.mobile}
                  onChange={(e) => updateField("mobile", e.target.value)}
                  placeholder="Enter mobile number"
                />

                <FieldInput
                  label="WhatsApp number"
                  type="tel"
                  value={form.whatsapp}
                  onChange={(e) => updateField("whatsapp", e.target.value)}
                  placeholder="Enter WhatsApp number"
                />

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">
                    Customer type
                  </Label>

                  <Select
                    value={form.customer_type}
                    onValueChange={(value) =>
                      updateField("customer_type", value)
                    }
                  >
                    <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/50 text-sm shadow-none transition-colors focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {CUSTOMER_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <FieldInput
                  label="GSTIN"
                  value={form.gstin}
                  onChange={(e) =>
                    updateField("gstin", e.target.value.toUpperCase())
                  }
                  placeholder="Enter GSTIN"
                  maxLength={15}
                  className="h-11 rounded-xl border-slate-200 bg-slate-50/50 text-sm uppercase shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/20"
                />
              </div>
            </FormSection>

            <div className="h-px bg-slate-100" />

            {/* Address */}
            <FormSection
              icon={MapPin}
              title="Address details"
              description="Customer's billing or business address."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <FieldInput
                    label="Address"
                    value={form.address}
                    onChange={(e) => updateField("address", e.target.value)}
                    placeholder="House number, street, locality"
                  />
                </div>

                <FieldInput
                  label="City"
                  value={form.city}
                  onChange={(e) => updateField("city", e.target.value)}
                  placeholder="City"
                />

                <FieldInput
                  label="State"
                  value={form.state}
                  onChange={(e) => updateField("state", e.target.value)}
                  placeholder="State"
                />

                <FieldInput
                  label="PIN code"
                  value={form.pincode}
                  onChange={(e) => updateField("pincode", e.target.value)}
                  placeholder="PIN code"
                  maxLength={6}
                />
              </div>
            </FormSection>

            <div className="h-px bg-slate-100" />

            {/* Opening balance */}
            <FormSection
              icon={Wallet}
              title="Opening balance"
              description="Previous pending amount before using this app."
            >
              <FieldInput
                label="Opening balance (₹)"
                type="number"
                min="0"
                step="0.01"
                value={form.opening_balance}
                onChange={(e) =>
                  updateField("opening_balance", e.target.value)
                }
                placeholder="0.00"
                hint="This is kept separately from bills created in this app."
              />
            </FormSection>

            <div className="h-px bg-slate-100" />

            {/* Notes */}
            <FormSection
              icon={FileText}
              title="Additional notes"
              description="Anything else worth remembering about this customer."
            >
              <Textarea
                value={form.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                placeholder="Add any additional information..."
                rows={3}
                className="resize-none rounded-xl border-slate-200 bg-slate-50/50 text-sm shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/20"
              />
            </FormSection>
          </div>

          {/* Sticky footer */}
          <DialogFooter className="border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:justify-end sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="h-10 rounded-xl border-slate-200 px-5 text-sm font-medium hover:bg-slate-100"
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={saving}
              className="h-10 rounded-xl bg-emerald-600 px-6 text-sm font-medium shadow-sm shadow-emerald-600/20 hover:bg-emerald-700"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Saving...
                </span>
              ) : (
                <>
                  {editing ? (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Save changes
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Add customer
                    </>
                  )}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ============ Everything else UNCHANGED below ============ */

function CustomersList({ currentShop }) {
  const [customers, setCustomers] = useState([])
  const [customerBills, setCustomerBills] = useState([])
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const loadCustomers = useCallback(async (refresh = false) => {
    if (!currentShop?.id) return

    if (refresh) setRefreshing(true)
    else setLoading(true)

    try {
      const [customerResult, billResult] = await Promise.all([
        supabase
          .from("customers")
          .select("*")
          .eq("shop_id", currentShop.id)
          .eq("is_active", true)
          .order("name"),

        supabase
          .from("bills")
          .select("id, customer_id, grand_total, amount_due, due_date, payment_status")
          .eq("shop_id", currentShop.id),
      ])

      if (customerResult.error) throw customerResult.error
      if (billResult.error) throw billResult.error

      setCustomers(customerResult.data || [])
      setCustomerBills(billResult.data || [])
    } catch (error) {
      console.error("Load customers error:", error)
      toast.error(error.message || "Unable to load customers")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [currentShop?.id])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm })
    setDialogOpen(true)
  }

  function openEdit(customer) {
    setEditing(customer)
    setForm({
      name: customer.name || "",
      mobile: customer.mobile || "",
      whatsapp: customer.whatsapp || "",
      address: customer.address || "",
      city: customer.city || "",
      state: customer.state || "",
      pincode: customer.pincode || "",
      gstin: customer.gstin || "",
      customer_type: customer.customer_type || "Individual",
      opening_balance:
        customer.opening_balance != null
          ? String(customer.opening_balance)
          : "",
      notes: customer.notes || "",
    })
    setDialogOpen(true)
  }

  function updateField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  async function handleSave(event) {
    event.preventDefault()

    if (!form.name.trim()) {
      toast.error("Customer name is required")
      return
    }

    const openingBalance = form.opening_balance.trim()
      ? Number(form.opening_balance)
      : 0

    if (!Number.isFinite(openingBalance) || openingBalance < 0) {
      toast.error("Enter a valid opening balance")
      return
    }

    setSaving(true)

    try {
      const payload = {
        name: form.name.trim(),
        mobile: form.mobile.trim(),
        whatsapp: form.whatsapp.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: form.pincode.trim(),
        gstin: form.gstin.trim().toUpperCase(),
        customer_type: form.customer_type,
        opening_balance: openingBalance,
        notes: form.notes.trim(),
        shop_id: currentShop.id,
      }

      if (editing) {
        const { error } = await supabase
          .from("customers")
          .update(payload)
          .eq("id", editing.id)
          .eq("shop_id", currentShop.id)

        if (error) throw error
        toast.success("Customer updated")
      } else {
        const { error } = await supabase
          .from("customers")
          .insert(payload)

        if (error) throw error
        toast.success("Customer added")
      }

      setDialogOpen(false)
      setEditing(null)
      setForm({ ...emptyForm })
      await loadCustomers(true)
    } catch (error) {
      console.error("Save customer error:", error)
      toast.error(error.message || "Unable to save customer")
    } finally {
      setSaving(false)
    }
  }

  const billStats = useMemo(() => {
    const map = {}

    customerBills.forEach((bill) => {
      if (!bill.customer_id) return

      if (!map[bill.customer_id]) {
        map[bill.customer_id] = {
          count: 0,
          billed: 0,
          due: 0,
          overdue: 0,
        }
      }

      const item = map[bill.customer_id]
      item.count += 1
      item.billed += Number(bill.grand_total || 0)
      item.due += Number(bill.amount_due || 0)

      if (
        Number(bill.amount_due || 0) > 0 &&
        bill.due_date &&
        bill.due_date < getLocalDateString()
      ) {
        item.overdue += Number(bill.amount_due || 0)
      }
    })

    return map
  }, [customerBills])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()

    return customers.filter((customer) => {
      const matchesSearch =
        !query ||
        customer.name?.toLowerCase().includes(query) ||
        customer.mobile?.toLowerCase().includes(query) ||
        customer.whatsapp?.toLowerCase().includes(query) ||
        customer.gstin?.toLowerCase().includes(query)

      const matchesType =
        typeFilter === "all" || customer.customer_type === typeFilter

      return matchesSearch && matchesType
    })
  }, [customers, search, typeFilter])

  const summary = useMemo(() => {
    const totalDue = customers.reduce((sum, customer) => {
      return sum +
        Number(customer.opening_balance || 0) +
        Number(billStats[customer.id]?.due || 0)
    }, 0)

    const overdue = customers.reduce((sum, customer) => {
      return sum + Number(billStats[customer.id]?.overdue || 0)
    }, 0)

    const businessCount = customers.filter(
      (customer) => customer.customer_type !== "Individual"
    ).length

    return { totalDue, overdue, businessCount }
  }, [customers, billStats])

  if (!currentShop) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
        <div>
          <Users className="mx-auto mb-3 h-9 w-9 text-slate-400" />
          <h2 className="font-semibold text-slate-900">Select a shop</h2>
          <p className="mt-1 text-sm text-slate-500">
            Choose a shop to manage its customers.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Users className="h-4 w-4" />
            <span>Workspace</span>
            <ChevronRight className="h-3 w-3 text-slate-300" />
            <span className="text-slate-700">Customers</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
            Customers
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage customer accounts, purchases and outstanding balances.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => loadCustomers(true)}
            disabled={loading || refreshing}
            className="h-10 gap-2 rounded-xl border-slate-200 bg-white"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            type="button"
            onClick={openCreate}
            className="h-10 rounded-xl bg-emerald-600 px-4 text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add customer
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total customers"
          value={customers.length}
          description="Active customer records"
          icon={Users}
        />
        <StatCard
          title="Business customers"
          value={summary.businessCount}
          description="Non-individual customers"
          icon={Building2}
          tone="blue"
        />
        <StatCard
          title="Total outstanding"
          value={formatCurrency(summary.totalDue)}
          description="Opening balance + pending bills"
          icon={Wallet}
          tone="amber"
        />
        <StatCard
          title="Overdue amount"
          value={formatCurrency(summary.overdue)}
          description="Bills past their due date"
          icon={CircleAlert}
          tone="red"
        />
      </div>

      <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">All customers</h2>
              <p className="mt-1 text-sm text-slate-500">
                Showing {filtered.length} of {customers.length} customers
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, mobile or GSTIN..."
                  className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 pr-9 focus-visible:bg-white"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-10 w-full rounded-xl sm:w-44">
                  <SlidersHorizontal className="mr-2 h-4 w-4 text-slate-400" />
                  <SelectValue placeholder="Customer type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {CUSTOMER_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[260px] items-center justify-center gap-3 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading customers...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center px-5 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <Users className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-semibold text-slate-900">
              {customers.length ? "No matching customers" : "No customers yet"}
            </h3>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              {customers.length
                ? "Try changing your search or filter."
                : "Add your first customer to start managing their account."}
            </p>
            {customers.length ? (
              <Button
                variant="outline"
                className="mt-4 rounded-xl"
                onClick={() => {
                  setSearch("")
                  setTypeFilter("all")
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button
                onClick={openCreate}
                className="mt-4 rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add customer
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[850px] text-left">
                <thead className="bg-slate-50/80">
                  <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-5 py-3">Contact</th>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3 text-right">Bills</th>
                    <th className="px-5 py-3 text-right">Outstanding</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((customer) => {
                    const stats = billStats[customer.id] || {}
                    const due =
                      Number(customer.opening_balance || 0) +
                      Number(stats.due || 0)

                    return (
                      <tr
                        key={customer.id}
                        className="transition-colors hover:bg-slate-50/70"
                      >
                        <td className="px-5 py-4">
                          <Link
                            to={`/customers/${customer.id}`}
                            className="flex items-center gap-3"
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-700">
                              {getInitials(customer.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900 hover:text-emerald-700">
                                {customer.name}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-400">
                                {customer.gstin || "No GSTIN"}
                              </p>
                            </div>
                          </Link>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm text-slate-700">
                            {customer.mobile || "No mobile"}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {customer.city || customer.state || "Address not added"}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <Badge
                            variant="outline"
                            className="border-slate-200 bg-slate-50 text-slate-600"
                          >
                            {customer.customer_type || "Individual"}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 text-right text-sm text-slate-700">
                          {stats.count || 0}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <p className={`text-sm font-semibold tabular-nums ${due > 0 ? "text-red-600" : "text-emerald-700"}`}>
                            {formatCurrency(due)}
                          </p>
                          {Number(stats.overdue || 0) > 0 && (
                            <p className="mt-1 text-xs text-red-500">
                              {formatCurrency(stats.overdue)} overdue
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(customer)}
                              className="rounded-lg text-slate-600"
                            >
                              <Pencil className="mr-1.5 h-3.5 w-3.5" />
                              Edit
                            </Button>
                            <Button
                              asChild
                              variant="ghost"
                              size="sm"
                              className="rounded-lg text-emerald-700"
                            >
                              <Link to={`/customers/${customer.id}`}>
                                Details
                                <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 md:hidden">
              {filtered.map((customer) => {
                const stats = billStats[customer.id] || {}
                const due =
                  Number(customer.opening_balance || 0) +
                  Number(stats.due || 0)

                return (
                  <div key={customer.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        to={`/customers/${customer.id}`}
                        className="flex min-w-0 items-center gap-3"
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-700">
                          {getInitials(customer.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {customer.name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {customer.mobile || "No mobile number"}
                          </p>
                        </div>
                      </Link>
                      <Badge variant="outline" className="shrink-0">
                        {customer.customer_type || "Individual"}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
                      <div>
                        <p className="text-xs text-slate-500">Total bills</p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {stats.count || 0}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Outstanding</p>
                        <p className="mt-1 font-semibold text-red-600">
                          {formatCurrency(due)}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        asChild
                        variant="outline"
                        className="flex-1 rounded-xl"
                      >
                        <Link to={`/customers/${customer.id}`}>
                          View account
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => openEdit(customer)}
                        className="rounded-xl"
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-5 py-3">
            <p className="text-xs text-slate-500">
              Showing {filtered.length} customers
            </p>
            <p className="text-xs text-slate-400">
              {currentShop.name || "Current shop"}
            </p>
          </div>
        )}
      </Card>

      <CustomerFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        form={form}
        updateField={updateField}
        onSave={handleSave}
        saving={saving}
      />
    </div>
  )
}

function CustomerDetails({ currentShop, customerId }) {
  const navigate = useNavigate()
  const [customer, setCustomer] = useState(null)
  const [bills, setBills] = useState([])
  const [billItems, setBillItems] = useState([])
  const [payments, setPayments] = useState([])
  const [advances, setAdvances] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState("")

  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const today = getLocalDateString()

  const loadDetails = useCallback(async (refresh = false) => {
    if (!currentShop?.id || !customerId) return

    if (refresh) setRefreshing(true)
    else setLoading(true)

    setLoadError("")

    try {
      const customerResult = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .eq("shop_id", currentShop.id)
        .single()

      if (customerResult.error) throw customerResult.error

      const [
        billsResult,
        paymentsResult,
        advancesResult,
      ] = await Promise.all([
        supabase
          .from("bills")
          .select("*")
          .eq("shop_id", currentShop.id)
          .eq("customer_id", customerId)
          .order("bill_date", { ascending: false }),

        supabase
          .from("payments")
          .select("*")
          .eq("shop_id", currentShop.id)
          .eq("customer_id", customerId)
          .order("payment_date", { ascending: false }),

        supabase
          .from("customer_advances")
          .select("*")
          .eq("customer_id", customerId)
          .gt("remaining_amount", 0),
      ])

      if (billsResult.error) throw billsResult.error
      if (paymentsResult.error) throw paymentsResult.error
      if (advancesResult.error) throw advancesResult.error

      const loadedBills = billsResult.data || []
      setCustomer(customerResult.data)
      setBills(loadedBills)
      setPayments(paymentsResult.data || [])
      setAdvances(advancesResult.data || [])

      if (loadedBills.length > 0) {
        const billIds = loadedBills.map((bill) => bill.id)

        const itemsResult = await supabase
          .from("bill_items")
          .select("*")
          .in("bill_id", billIds)
          .order("sort_order", { ascending: true })

        if (itemsResult.error) throw itemsResult.error
        setBillItems(itemsResult.data || [])
      } else {
        setBillItems([])
      }
    } catch (error) {
      console.error("Customer details error:", error)
      setLoadError(error.message || "Unable to load customer details")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [currentShop?.id, customerId])

  useEffect(() => {
    loadDetails()
  }, [loadDetails])

  function openEdit() {
    if (!customer) return

    setForm({
      name: customer.name || "",
      mobile: customer.mobile || "",
      whatsapp: customer.whatsapp || "",
      address: customer.address || "",
      city: customer.city || "",
      state: customer.state || "",
      pincode: customer.pincode || "",
      gstin: customer.gstin || "",
      customer_type: customer.customer_type || "Individual",
      opening_balance:
        customer.opening_balance != null
          ? String(customer.opening_balance)
          : "",
      notes: customer.notes || "",
    })

    setEditOpen(true)
  }

  function updateField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  async function handleUpdateCustomer(event) {
    event.preventDefault()

    if (!form.name.trim()) {
      toast.error("Customer name is required")
      return
    }

    const openingBalance = form.opening_balance.trim()
      ? Number(form.opening_balance)
      : 0

    if (!Number.isFinite(openingBalance) || openingBalance < 0) {
      toast.error("Enter a valid opening balance")
      return
    }

    setSaving(true)

    try {
      const { error } = await supabase
        .from("customers")
        .update({
          name: form.name.trim(),
          mobile: form.mobile.trim(),
          whatsapp: form.whatsapp.trim(),
          address: form.address.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          pincode: form.pincode.trim(),
          gstin: form.gstin.trim().toUpperCase(),
          customer_type: form.customer_type,
          opening_balance: openingBalance,
          notes: form.notes.trim(),
        })
        .eq("id", customerId)
        .eq("shop_id", currentShop.id)

      if (error) throw error

      toast.success("Customer details updated")
      setEditOpen(false)
      await loadDetails(true)
    } catch (error) {
      toast.error(error.message || "Unable to update customer")
    } finally {
      setSaving(false)
    }
  }

  const itemsByBill = useMemo(() => {
    const map = {}

    billItems.forEach((item) => {
      if (!map[item.bill_id]) map[item.bill_id] = []
      map[item.bill_id].push(item)
    })

    return map
  }, [billItems])

  const stats = useMemo(() => {
    const totalBilled = bills.reduce(
      (sum, bill) => sum + Number(bill.grand_total || 0),
      0
    )

    const billDue = bills.reduce(
      (sum, bill) => sum + Number(bill.amount_due || 0),
      0
    )

    const directPayments = payments
      .filter((payment) => !payment.is_advance)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)

    const overdueBills = bills.filter(
      (bill) =>
        Number(bill.amount_due || 0) > 0 &&
        bill.due_date &&
        bill.due_date < today
    )

    const overdueAmount = overdueBills.reduce(
      (sum, bill) => sum + Number(bill.amount_due || 0),
      0
    )

    const availableAdvance = advances.reduce(
      (sum, advance) => sum + Number(advance.remaining_amount || 0),
      0
    )

    const openingBalance = Number(customer?.opening_balance || 0)

    return {
      totalBilled,
      billDue,
      directPayments,
      overdueAmount,
      overdueCount: overdueBills.length,
      availableAdvance,
      openingBalance,
      totalOutstanding: billDue + openingBalance,
    }
  }, [bills, payments, advances, customer, today])

  const paymentHistory = useMemo(() => {
    return [...payments].sort((a, b) => {
      return String(b.payment_date || "").localeCompare(
        String(a.payment_date || "")
      )
    })
  }, [payments])

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center gap-3 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading customer account...
      </div>
    )
  }

  if (loadError || !customer) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 text-center">
        <CircleAlert className="h-9 w-9 text-red-500" />
        <h2 className="mt-3 font-semibold text-slate-900">
          Unable to open customer account
        </h2>
        <p className="mt-1 max-w-lg text-sm text-slate-500">
          {loadError || "Customer not found in this shop."}
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" onClick={() => navigate("/customers")}>
            Back to customers
          </Button>
          <Button
            onClick={() => loadDetails()}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            Try again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <Link to="/customers" className="hover:text-emerald-700">
              Customers
            </Link>
            <ChevronRight className="h-3 w-3 text-slate-300" />
            <span className="text-slate-700">{customer.name}</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-lg font-semibold text-slate-700">
              {getInitials(customer.name)}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                {customer.name}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {customer.customer_type || "Individual"} customer account
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => loadDetails(true)}
            disabled={refreshing}
            className="h-10 rounded-xl"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={openEdit}
            className="h-10 rounded-xl"
          >
            <Pencil className="mr-2 h-4 w-4" />
            Edit customer
          </Button>
          <Button
            asChild
            className="h-10 rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700"
          >
            <Link to="/bills/new">
              <Plus className="mr-2 h-4 w-4" />
              Create bill
            </Link>
          </Button>
        </div>
      </div>

      {/* Contact strip */}
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-100 p-2.5 text-slate-600">
              <Phone className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400">Mobile</p>
              <p className="truncate text-sm font-medium text-slate-800">
                {customer.mobile || "Not provided"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-100 p-2.5 text-slate-600">
              <MessageCircle className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400">WhatsApp</p>
              <p className="truncate text-sm font-medium text-slate-800">
                {customer.whatsapp || "Not provided"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-100 p-2.5 text-slate-600">
              <MapPin className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400">Location</p>
              <p className="truncate text-sm font-medium text-slate-800">
                {[customer.city, customer.state].filter(Boolean).join(", ") || "Not provided"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-100 p-2.5 text-slate-600">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400">GSTIN</p>
              <p className="truncate text-sm font-medium text-slate-800">
                {customer.gstin || "Not provided"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total billed"
          value={formatCurrency(stats.totalBilled)}
          description={`${bills.length} bills created`}
          icon={FileText}
          tone="blue"
        />
        <StatCard
          title="Payments received"
          value={formatCurrency(stats.directPayments)}
          description="Payments recorded against bills"
          icon={ArrowDownLeft}
          tone="emerald"
        />
        <StatCard
          title="Outstanding dues"
          value={formatCurrency(stats.totalOutstanding)}
          description="Pending bills + opening balance"
          icon={Wallet}
          tone="red"
        />
        <StatCard
          title="Available advance"
          value={formatCurrency(stats.availableAdvance)}
          description="Unadjusted customer advance"
          icon={IndianRupee}
          tone="amber"
        />
      </div>

      {/* Additional account figures */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-500">Opening balance</p>
            <p className="mt-2 text-xl font-semibold text-slate-900">
              {formatCurrency(stats.openingBalance)}
            </p>
            <p className="mt-1 text-xs text-slate-400">Previous pending amount</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-red-100 bg-red-50/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-red-700">Overdue amount</p>
            <p className="mt-2 text-xl font-semibold text-red-700">
              {formatCurrency(stats.overdueAmount)}
            </p>
            <p className="mt-1 text-xs text-red-600/80">
              {stats.overdueCount} overdue bills
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-500">Total transactions</p>
            <p className="mt-2 text-xl font-semibold text-slate-900">
              {payments.length}
            </p>
            <p className="mt-1 text-xs text-slate-400">Recorded payment entries</p>
          </CardContent>
        </Card>
      </div>

      {/* Bills */}
      <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <SectionHeading
            title="Bills and purchases"
            description="All bills created for this customer."
            action={
              <Badge variant="outline" className="w-fit border-slate-200 bg-slate-50">
                {bills.length} bills
              </Badge>
            }
          />
        </div>

        {bills.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <FileText className="mx-auto h-9 w-9 text-slate-300" />
            <p className="mt-3 font-medium text-slate-800">No bills yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Bills created for this customer will appear here.
            </p>
            <Button
              asChild
              className="mt-4 rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700"
            >
              <Link to="/bills/new">
                <Plus className="mr-2 h-4 w-4" />
                Create first bill
              </Link>
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {bills.map((bill) => {
              const state = getDueState(bill.due_date, today)
              const isOverdue = state === "overdue"
              const items = itemsByBill[bill.id] || []

              return (
                <div key={bill.id} className="space-y-3 p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <Link
                        to={`/bills/${bill.id}`}
                        className="font-semibold text-slate-900 hover:text-emerald-700"
                      >
                        {bill.bill_number || "Bill"}
                        <ArrowUpRight className="ml-1 inline h-3.5 w-3.5" />
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">
                        Bill date: {bill.bill_date ? formatDate(bill.bill_date) : "—"}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          bill.payment_status === "paid"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : bill.payment_status === "partial"
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-red-200 bg-red-50 text-red-700"
                        }
                      >
                        {bill.payment_status || "unpaid"}
                      </Badge>
                      {isOverdue && (
                        <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                          Overdue
                        </Badge>
                      )}
                    </div>
                  </div>

                  {items.length > 0 && (
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                      <p className="mb-2 text-xs font-medium text-slate-500">
                        Items ({items.length})
                      </p>
                      <div className="space-y-2">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start justify-between gap-3 text-sm"
                          >
                            <div className="min-w-0">
                              <p className="font-medium text-slate-800">
                                {item.item_name}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {item.quantity} {item.unit || ""} × {formatCurrency(item.rate)}
                                {" · GST "}
                                {Number(item.gst_percent || 0)}%
                              </p>
                            </div>
                            <p className="shrink-0 font-medium text-slate-800">
                              {formatCurrency(item.total_amount)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-slate-400">Bill total</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {formatCurrency(bill.grand_total)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Direct paid</p>
                      <p className="mt-1 text-sm font-medium text-emerald-700">
                        {formatCurrency(bill.amount_paid)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Advance adjusted</p>
                      <p className="mt-1 text-sm font-medium text-slate-700">
                        {formatCurrency(bill.advance_adjusted)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Remaining due</p>
                      <p className={`mt-1 text-sm font-semibold ${Number(bill.amount_due || 0) > 0 ? "text-red-600" : "text-emerald-700"}`}>
                        {formatCurrency(bill.amount_due)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <CalendarDays className="h-3.5 w-3.5" />
                      Due date: {bill.due_date ? formatDate(bill.due_date) : "Not set"}
                      {isOverdue && (
                        <span className="font-medium text-red-600">· Past deadline</span>
                      )}
                    </div>
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-lg"
                    >
                      <Link to={`/bills/${bill.id}`}>View bill</Link>
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Payment history */}
      <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <SectionHeading
            title="Payment history"
            description="Payments recorded for this customer."
            action={
              <Badge variant="outline" className="border-slate-200 bg-slate-50">
                {paymentHistory.length} entries
              </Badge>
            }
          />
        </div>

        {paymentHistory.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Wallet className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-800">
              No payment records
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Payments will appear here after they are recorded.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left">
              <thead className="bg-slate-50/80">
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Bill</th>
                  <th className="px-5 py-3">Payment mode</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paymentHistory.map((payment, index) => (
                  <tr key={payment.id || `${payment.payment_date}-${index}`}>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      {payment.payment_date ? formatDate(payment.payment_date) : "—"}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      {payment.bill_id ? (
                        <Link
                          to={`/bills/${payment.bill_id}`}
                          className="font-medium text-emerald-700 hover:underline"
                        >
                          View bill
                        </Link>
                      ) : (
                        "Not linked"
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {payment.payment_mode || "—"}
                    </td>
                    <td className="px-5 py-4">
                      <Badge
                        variant="outline"
                        className={
                          payment.is_advance
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                        }
                      >
                        {payment.is_advance ? "Advance" : "Bill payment"}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-right text-sm font-semibold tabular-nums text-slate-900">
                      {formatCurrency(payment.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Advance balance */}
      <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <SectionHeading
            title="Available customer advances"
            description="Advance amounts that have not yet been adjusted against bills."
            action={
              <Badge className="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">
                {advances.length} available entries
              </Badge>
            }
          />
        </div>

        {advances.length === 0 ? (
          <div className="px-5 py-9 text-center">
            <IndianRupee className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-800">
              No available advance
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Unadjusted advance balances will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {advances.map((advance, index) => (
              <div
                key={advance.id || index}
                className="flex items-center justify-between gap-3 p-4"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    Advance entry {index + 1}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Remaining advance balance
                  </p>
                </div>
                <p className="text-sm font-semibold text-blue-700">
                  {formatCurrency(advance.remaining_amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Customer information */}
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="space-y-5 p-4 sm:p-5">
          <SectionHeading
            title="Customer information"
            description="Saved contact, address and business details."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={openEdit}
                className="rounded-lg"
              >
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Edit details
              </Button>
            }
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DetailItem label="Customer name" value={customer.name} icon={UserRound} />
            <DetailItem label="Mobile" value={customer.mobile} icon={Phone} />
            <DetailItem label="WhatsApp" value={customer.whatsapp} icon={MessageCircle} />
            <DetailItem label="Customer type" value={customer.customer_type} icon={Users} />
            <DetailItem label="GSTIN" value={customer.gstin} icon={Building2} />
            <DetailItem
              label="Address"
              value={[
                customer.address,
                customer.city,
                customer.state,
                customer.pincode,
              ].filter(Boolean).join(", ")}
              icon={MapPin}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-medium text-slate-500">Additional notes</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {customer.notes || "No additional notes."}
            </p>
          </div>
        </CardContent>
      </Card>

      <CustomerFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        editing={customer}
        form={form}
        updateField={updateField}
        onSave={handleUpdateCustomer}
        saving={saving}
      />
    </div>
  )
}

export default function Customers() {
  const { currentShop } = useShop()
  const { customerId } = useParams()

  if (!currentShop) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
        <div>
          <Users className="mx-auto mb-3 h-9 w-9 text-slate-400" />
          <h2 className="font-semibold text-slate-900">Select a shop</h2>
          <p className="mt-1 text-sm text-slate-500">
            Choose a shop to manage its customers.
          </p>
        </div>
      </div>
    )
  }

  if (customerId) {
    return (
      <CustomerDetails
        currentShop={currentShop}
        customerId={customerId}
      />
    )
  }

  return <CustomersList currentShop={currentShop} />
}