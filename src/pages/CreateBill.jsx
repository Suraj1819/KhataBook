import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import {
  formatCurrency,
  calculateItemAmounts,
  generateBillNumber,
  UNITS,
  GST_RATES,
  PAYMENT_MODES,
  roundToTwo,
} from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Plus,
  Trash2,
  Search,
  X,
  UserRound,
  FileText,
  Receipt,
  CreditCard,
  CalendarDays,
  ChevronLeft,
  Loader2,
  Upload,
  Image as ImageIcon,
} from "lucide-react"
import { toast } from "sonner"

const emptyItem = () => ({
  item_name: "",
  description: "",
  quantity: "1",
  unit: "Piece",
  rate: "",
  discount: "0",
  gst_percent: "0",          // ⚠️ Changed default from "18" to "0"
  custom_gst_percent: "0",   // ⚠️ Changed default from "18" to "0"
})

const numberValue = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const fieldClass =
  "h-11 rounded-xl border-slate-200 bg-slate-50/50 text-sm shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/20"

const labelClass = "text-sm font-medium text-slate-700"

function Section({ title, description, icon: Icon, action, children }) {
  return (
    <section className="relative rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex min-h-[56px] items-center justify-between gap-3 rounded-t-2xl border-b border-slate-100 bg-white px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Icon className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            {description && (
              <p className="mt-0.5 text-xs text-slate-500">{description}</p>
            )}
          </div>
        </div>
        {action}
      </div>

      <div className="p-5">{children}</div>
    </section>
  )
}

function SummaryRow({ label, value, className = "", emphasized = false }) {
  return (
    <div className={`flex items-center justify-between gap-3 text-sm ${className}`}>
      <span className={emphasized ? "font-medium text-slate-700" : "text-slate-500"}>
        {label}
      </span>
      <span
        className={`shrink-0 tabular-nums ${
          emphasized ? "text-base font-semibold text-slate-900" : "font-medium text-slate-800"
        }`}
      >
        {value}
      </span>
    </div>
  )
}

function FormField({ label, children, className = "", hint }) {
  return (
    <div className={`min-w-0 space-y-1.5 ${className}`}>
      <Label className={labelClass}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

export default function CreateBill() {
  const { currentShop } = useShop()
  const navigate = useNavigate()

  const [customers, setCustomers] = useState([])
  const [customerId, setCustomerId] = useState("")
  const [customerSearch, setCustomerSearch] = useState("")
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false)
  const customerBoxRef = useRef(null)

  const [items, setItems] = useState([emptyItem()])

  const [isInterstate, setIsInterstate] = useState(false)
  const [taxInclusive, setTaxInclusive] = useState(false)

  const [billDiscount, setBillDiscount] = useState("0")
  const [roundOff, setRoundOff] = useState("0")
  const [notes, setNotes] = useState("")
  const [dueDate, setDueDate] = useState("")

  const [amountPaid, setAmountPaid] = useState("0")
  const [paymentMode, setPaymentMode] = useState("Cash")

  const [advanceAvailable, setAdvanceAvailable] = useState(0)
  const [advanceUsed, setAdvanceUsed] = useState("0")

  // 📁 Offline Bill Upload State
  const [offlineBillFile, setOfflineBillFile] = useState(null)
  const [offlineBillPreview, setOfflineBillPreview] = useState("")

  const [saving, setSaving] = useState(false)
  const [loadingCustomers, setLoadingCustomers] = useState(false)

  useEffect(() => {
    if (currentShop?.id) {
      loadCustomers()
    } else {
      setCustomers([])
      setCustomerId("")
    }
  }, [currentShop?.id])

  useEffect(() => {
    if (customerId) {
      loadAdvance()
    } else {
      setAdvanceAvailable(0)
      setAdvanceUsed("0")
    }
  }, [customerId])

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        customerBoxRef.current &&
        !customerBoxRef.current.contains(event.target)
      ) {
        setCustomerDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  async function loadCustomers() {
    setLoadingCustomers(true)
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, mobile, city, state, gstin")
        .eq("shop_id", currentShop.id)
        .eq("is_active", true)
        .order("name")

      if (error) throw error
      setCustomers(data || [])
    } catch (error) {
      console.error(error)
      toast.error("Could not load customers")
    } finally {
      setLoadingCustomers(false)
    }
  }

  async function loadAdvance() {
    try {
      const { data, error } = await supabase
        .from("customer_advances")
        .select("remaining_amount")
        .eq("customer_id", customerId)
        .gt("remaining_amount", 0)

      if (error) throw error

      const total = (data || []).reduce(
        (sum, advance) => sum + numberValue(advance.remaining_amount),
        0
      )
      setAdvanceAvailable(roundToTwo(total))
    } catch (error) {
      console.error(error)
      setAdvanceAvailable(0)
    }
  }

  function updateItem(index, field, value) {
    setItems((previous) =>
      previous.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    )
  }

  function addItem() {
    setItems((previous) => [...previous, emptyItem()])
  }

  function removeItem(index) {
    setItems((previous) => {
      if (previous.length === 1) return previous
      return previous.filter((_, i) => i !== index)
    })
  }

  // 📁 Handle Offline Bill Upload
  function handleOfflineBillChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size must be less than 5MB")
      return
    }

    setOfflineBillFile(file)

    // Preview only if it's an image
    if (file.type.startsWith("image/")) {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setOfflineBillPreview(reader.result)
        }
      }
      reader.readAsDataURL(file)
    } else {
      setOfflineBillPreview("")
    }
  }

  function removeOfflineBill() {
    setOfflineBillFile(null)
    setOfflineBillPreview("")
  }

  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase()
    if (!query) return customers
    return customers.filter(
      (customer) =>
        customer.name?.toLowerCase().includes(query) ||
        customer.mobile?.toLowerCase().includes(query)
    )
  }, [customers, customerSearch])

  const selectedCustomer = customers.find((customer) => customer.id === customerId)

  const calculated = useMemo(() => {
    const validItems = items.map((item) => {
      const gstPercent =
        item.gst_percent === "custom"
          ? clamp(numberValue(item.custom_gst_percent), 0, 100)
          : clamp(numberValue(item.gst_percent), 0, 100)

      const quantity = Math.max(0, numberValue(item.quantity))
      const rate = Math.max(0, numberValue(item.rate))
      const discount = Math.max(0, numberValue(item.discount))

      const calc = calculateItemAmounts({
        quantity: String(quantity),
        rate: String(rate),
        discount: String(discount),
        gstPercent: String(gstPercent),
        taxInclusive,
      })

      return { ...calc, gstPercent, quantity, rate, discount }
    })

    const subtotal = roundToTwo(
      validItems.reduce((sum, item) => sum + numberValue(item.gross), 0)
    )

    const itemDiscount = roundToTwo(
      validItems.reduce((sum, item) => sum + numberValue(item.discount), 0)
    )

    const originalTaxable = validItems.reduce((sum, item) => sum + numberValue(item.taxable), 0)
    const originalGst = validItems.reduce((sum, item) => sum + numberValue(item.gstAmount), 0)
    const originalTotal = validItems.reduce((sum, item) => sum + numberValue(item.total), 0)

    const discountBase = taxInclusive ? originalTotal : originalTaxable

    const appliedBillDiscount = roundToTwo(
      clamp(numberValue(billDiscount), 0, Math.max(0, discountBase))
    )

    let allocatedDiscount = 0

    const adjustedItems = validItems.map((item, index) => {
      const base = taxInclusive ? numberValue(item.total) : numberValue(item.taxable)
      let allocation = 0

      if (discountBase > 0) {
        allocation =
          index === validItems.length - 1
            ? Math.max(0, appliedBillDiscount - allocatedDiscount)
            : (appliedBillDiscount * base) / discountBase
      }

      allocation = Math.min(allocation, base)
      allocatedDiscount += allocation

      let taxableAmount = numberValue(item.taxable)
      let gstAmount = numberValue(item.gstAmount)
      let totalAmount = numberValue(item.total)

      if (taxInclusive) {
        const adjustedTotal = Math.max(0, totalAmount - allocation)
        const ratio = totalAmount > 0 ? adjustedTotal / totalAmount : 0
        taxableAmount = roundToTwo(taxableAmount * ratio)
        gstAmount = roundToTwo(gstAmount * ratio)
        totalAmount = roundToTwo(taxableAmount + gstAmount)
      } else {
        taxableAmount = roundToTwo(Math.max(0, taxableAmount - allocation))
        gstAmount = roundToTwo(taxableAmount * (item.gstPercent / 100))
        totalAmount = roundToTwo(taxableAmount + gstAmount)
      }

      return { ...item, taxableAmount, gstAmount, totalAmount, billDiscountShare: roundToTwo(allocation) }
    })

    const taxable = roundToTwo(adjustedItems.reduce((sum, item) => sum + item.taxableAmount, 0))
    const totalGst = roundToTwo(adjustedItems.reduce((sum, item) => sum + item.gstAmount, 0))
    const totalDiscount = roundToTwo(itemDiscount + appliedBillDiscount)

    const cgst = isInterstate ? 0 : roundToTwo(totalGst / 2)
    const sgst = isInterstate ? 0 : roundToTwo(totalGst - cgst)
    const igst = isInterstate ? totalGst : 0

    const beforeRound = roundToTwo(taxable + totalGst)
    const rOff = numberValue(roundOff)
    const grandTotal = Math.max(0, roundToTwo(beforeRound + rOff))

    const adv = roundToTwo(
      clamp(numberValue(advanceUsed), 0, Math.min(advanceAvailable, grandTotal))
    )

    const paid = roundToTwo(
      clamp(numberValue(amountPaid), 0, Math.max(0, grandTotal - adv))
    )

    const due = roundToTwo(Math.max(0, grandTotal - adv - paid))

    return {
      itemCalcs: adjustedItems,
      subtotal,
      itemDiscount,
      billDiscount: appliedBillDiscount,
      totalDiscount,
      taxable,
      totalGst,
      cgst,
      sgst,
      igst,
      grandTotal,
      advanceUsed: adv,
      amountPaid: paid,
      amountDue: due,
    }
  }, [
    items,
    billDiscount,
    roundOff,
    taxInclusive,
    isInterstate,
    advanceUsed,
    amountPaid,
    advanceAvailable,
  ])

  async function handleSubmit(event) {
    event.preventDefault()

    if (!customerId) {
      toast.error("Select a customer")
      return
    }

    const validItems = items
      .map((item, index) => ({ ...item, originalIndex: index }))
      .filter((item) => item.item_name.trim())

    // Allow bill creation if there are items OR an offline bill is uploaded
    if (validItems.length === 0 && !offlineBillFile) {
      toast.error("Add at least one item or upload an offline bill")
      return
    }

    const invalidItem = validItems.find(
      (item) =>
        numberValue(item.quantity) <= 0 ||
        numberValue(item.rate) < 0 ||
        numberValue(item.discount) < 0 ||
        (item.gst_percent === "custom" &&
          (numberValue(item.custom_gst_percent) < 0 ||
            numberValue(item.custom_gst_percent) > 100))
    )

    if (invalidItem) {
      toast.error("Check item quantity, rate, discount and GST")
      return
    }

    if (numberValue(billDiscount) < 0) {
      toast.error("Bill discount cannot be negative")
      return
    }

    if (numberValue(amountPaid) < 0 || numberValue(advanceUsed) < 0) {
      toast.error("Payment amounts cannot be negative")
      return
    }

    if (numberValue(roundOff) + calculated.taxable + calculated.totalGst < 0) {
      toast.error("Invalid round off amount")
      return
    }

    setSaving(true)
    let createdBillId = null

    try {
      const billNumber = generateBillNumber()
      let uploadedBillUrl = null

      // 1. Upload Offline Bill to Supabase Storage (if selected)
      if (offlineBillFile) {
        const fileExt = offlineBillFile.name.split('.').pop()
        const fileName = `${currentShop.id}/${billNumber}-${Date.now()}.${fileExt}`
        
        const { error: uploadError } = await supabase.storage
          .from("bill_attachments")
          .upload(fileName, offlineBillFile)

        if (uploadError) throw new Error("Failed to upload attachment: " + uploadError.message)

        const { data: urlData } = supabase.storage
          .from("bill_attachments")
          .getPublicUrl(fileName)
          
        uploadedBillUrl = urlData.publicUrl
      }

      const billPayload = {
        shop_id: currentShop.id,
        customer_id: customerId,
        bill_number: billNumber,
        bill_date: new Date().toISOString().split("T")[0],
        is_interstate: isInterstate,
        tax_inclusive: taxInclusive,
        subtotal: calculated.subtotal,
        discount_amount: calculated.totalDiscount,
        taxable_amount: calculated.taxable,
        cgst_amount: calculated.cgst,
        sgst_amount: calculated.sgst,
        igst_amount: calculated.igst,
        total_gst: calculated.totalGst,
        round_off: numberValue(roundOff),
        grand_total: calculated.grandTotal,
        advance_adjusted: calculated.advanceUsed,
        amount_paid: calculated.amountPaid,
        amount_due: calculated.amountDue,
        due_date: dueDate || null,
        payment_status:
          calculated.amountDue <= 0
            ? "paid"
            : calculated.amountPaid > 0 || calculated.advanceUsed > 0
              ? "partial"
              : "unpaid",
        notes: notes.trim() || null,
        attachment_url: uploadedBillUrl, 
      }

      const { data: bill, error: billError } = await supabase
        .from("bills")
        .insert(billPayload)
        .select()
        .single()

      if (billError) throw billError
      createdBillId = bill.id

      if (validItems.length > 0) {
        const itemRows = validItems.map((item, index) => {
          const calc = calculated.itemCalcs[item.originalIndex]
          const gstPercent =
            item.gst_percent === "custom"
              ? numberValue(item.custom_gst_percent)
              : numberValue(item.gst_percent)

          return {
            bill_id: bill.id,
            item_name: item.item_name.trim(),
            description: item.description.trim() || null,
            quantity: calc.quantity,
            unit: item.unit,
            rate: calc.rate,
            discount: roundToTwo(calc.discount + calc.billDiscountShare),
            gst_percent: gstPercent,
            taxable_amount: calc.taxableAmount,
            gst_amount: calc.gstAmount,
            total_amount: calc.totalAmount,
            sort_order: index,
          }
        })

        const { error: itemsError } = await supabase.from("bill_items").insert(itemRows)
        if (itemsError) throw itemsError
      }

      if (calculated.amountPaid > 0) {
        const { error: paymentError } = await supabase.from("payments").insert({
          shop_id: currentShop.id,
          customer_id: customerId,
          bill_id: bill.id,
          amount: calculated.amountPaid,
          payment_mode: paymentMode,
          payment_date: new Date().toISOString().split("T")[0],
          is_advance: false,
        })
        if (paymentError) throw paymentError
      }

      if (calculated.advanceUsed > 0) {
        const { data: advances, error: advanceError } = await supabase
          .from("customer_advances")
          .select("*")
          .eq("customer_id", customerId)
          .gt("remaining_amount", 0)
          .order("created_at", { ascending: true })

        if (advanceError) throw advanceError

        let remaining = calculated.advanceUsed

        for (const advance of advances || []) {
          if (remaining <= 0) break

          const available = numberValue(advance.remaining_amount)
          const use = roundToTwo(Math.min(available, remaining))
          if (use <= 0) continue

          const { error: allocationError } = await supabase
            .from("advance_allocations")
            .insert({ advance_id: advance.id, bill_id: bill.id, amount: use })

          if (allocationError) throw allocationError

          const { error: updateError } = await supabase
            .from("customer_advances")
            .update({ remaining_amount: roundToTwo(available - use) })
            .eq("id", advance.id)

          if (updateError) throw updateError
          remaining = roundToTwo(remaining - use)
        }

        if (remaining > 0.01) {
          throw new Error("Advance balance changed. Please refresh and try again.")
        }
      }

      toast.success(`Bill ${billNumber} created`)
      navigate(`/bills/${bill.id}`)
    } catch (error) {
      console.error("Create bill error:", error)

      if (createdBillId) {
        toast.error(
          "Bill was created, but a payment or item operation failed. Check the bill before retrying."
        )
      } else {
        toast.error(error.message || "Failed to create bill")
      }
    } finally {
      setSaving(false)
    }
  }

  if (!currentShop) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center">
        <p className="text-sm text-slate-500">Select a shop first</p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs text-slate-400">
            <button
              type="button"
              onClick={() => navigate("/bills")}
              className="transition-colors hover:text-slate-700"
            >
              Bills
            </button>
            <span>/</span>
            <span className="text-slate-600">Create Bill</span>
          </div>

          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Create Bill
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Create a new bill for your customer.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => navigate(-1)}
          className="h-10 rounded-xl border-slate-200 bg-white text-sm text-slate-600 hover:bg-slate-50"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
          <div className="min-w-0 space-y-4">
            {/* Customer Details */}
            <Section
              title="Customer Details"
              description="Search and select a customer for this bill."
              icon={UserRound}
            >
              <div ref={customerBoxRef} className="relative">
                {selectedCustomer ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {selectedCustomer.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {[selectedCustomer.mobile, selectedCustomer.city, selectedCustomer.state]
                          .filter(Boolean)
                          .join(" · ") || "Customer selected"}
                      </p>
                      {selectedCustomer.gstin && (
                        <p className="mt-1 text-xs text-slate-500">
                          GSTIN: {selectedCustomer.gstin}
                        </p>
                      )}
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-slate-500 hover:bg-white hover:text-red-600"
                      onClick={() => {
                        setCustomerId("")
                        setCustomerSearch("")
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value)
                        setCustomerDropdownOpen(true)
                      }}
                      onFocus={() => setCustomerDropdownOpen(true)}
                      onClick={() => setCustomerDropdownOpen(true)}
                      placeholder="Click to search or select a customer..."
                      className={`${fieldClass} pl-10 ${customerDropdownOpen ? "border-emerald-500 bg-white ring-2 ring-emerald-500/20" : ""}`}
                    />
                    {customerSearch && (
                      <button
                        type="button"
                        onClick={() => setCustomerSearch("")}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}

                    {/* Dropdown */}
                    {customerDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                        {loadingCustomers ? (
                          <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading customers...
                          </div>
                        ) : filteredCustomers.length > 0 ? (
                          filteredCustomers.map((customer) => (
                            <button
                              key={customer.id}
                              type="button"
                              onClick={() => {
                                setCustomerId(customer.id)
                                setCustomerSearch("")
                                setCustomerDropdownOpen(false)
                              }}
                              className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors last:border-0 hover:bg-slate-50"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-slate-800">
                                  {customer.name}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-500">
                                  {[customer.mobile, customer.city].filter(Boolean).join(" · ")}
                                </p>
                              </div>
                              <span className="shrink-0 text-xs font-medium text-slate-400">
                                Select
                              </span>
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-6 text-center">
                            <p className="text-sm text-slate-500">No customers found</p>
                            <p className="mt-1 text-xs text-slate-400">
                              Add this customer from the Customers page.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {selectedCustomer && advanceAvailable > 0 && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5">
                    <span className="text-xs font-medium text-slate-600">
                      Available customer advance
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-slate-800">
                      {formatCurrency(advanceAvailable)}
                    </span>
                  </div>
                )}
              </div>
            </Section>

            {/* Bill Items */}
            <Section
              title="Bill Items"
              description={`${items.filter((item) => item.item_name.trim()).length} item(s) added`}
              icon={FileText}
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addItem}
                  className="h-8 rounded-lg border-slate-200 px-3 text-xs text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add Item
                </Button>
              }
            >
              <div className="space-y-3">
                {items.map((item, index) => {
                  const calc = calculated.itemCalcs[index]

                  return (
                    <div
                      key={index}
                      className="rounded-xl border border-slate-200 bg-white transition-colors hover:border-slate-300"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-4 py-2.5 rounded-t-xl">
                        <p className="text-xs font-semibold text-slate-700">
                          Item {String(index + 1).padStart(2, "0")}
                        </p>

                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                            aria-label="Remove item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      <div className="space-y-3 p-4">
                        <FormField label="Item Name *">
                          <Input
                            value={item.item_name}
                            onChange={(e) => updateItem(index, "item_name", e.target.value)}
                            placeholder="e.g. Cement, Notebook, Shirt"
                            className={fieldClass}
                          />
                        </FormField>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <FormField label="Quantity">
                            <Input
                              type="number"
                              min="0.001"
                              step="0.001"
                              value={item.quantity}
                              onChange={(e) => updateItem(index, "quantity", e.target.value)}
                              className={fieldClass}
                            />
                          </FormField>

                          <FormField label="Unit">
                            <Select
                              value={item.unit}
                              onValueChange={(value) => updateItem(index, "unit", value)}
                            >
                              <SelectTrigger className={fieldClass}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {UNITS.map((unit) => (
                                  <SelectItem key={unit} value={unit}>
                                    {unit}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormField>

                          <FormField label="Rate (₹)">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.rate}
                              onChange={(e) => updateItem(index, "rate", e.target.value)}
                              placeholder="0.00"
                              className={fieldClass}
                            />
                          </FormField>

                          <FormField label="Discount (₹)">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.discount}
                              onChange={(e) => updateItem(index, "discount", e.target.value)}
                              className={fieldClass}
                            />
                          </FormField>

                          <FormField label="GST Rate">
                            <Select
                              value={item.gst_percent}
                              onValueChange={(value) => updateItem(index, "gst_percent", value)}
                            >
                              <SelectTrigger className={fieldClass}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {GST_RATES.map((rate) => (
                                  <SelectItem key={rate} value={String(rate)}>
                                    {rate}%
                                  </SelectItem>
                                ))}
                                <SelectItem value="custom">Custom</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormField>

                          {item.gst_percent === "custom" && (
                            <FormField label="Custom GST (%)">
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={item.custom_gst_percent}
                                onChange={(e) =>
                                  updateItem(index, "custom_gst_percent", e.target.value)
                                }
                                className={fieldClass}
                              />
                            </FormField>
                          )}

                          <div className="col-span-2 flex items-center justify-between rounded-xl bg-slate-100 px-3.5 py-2.5 sm:col-span-2">
                            <span className="text-xs font-medium text-slate-600">
                              Item Total
                            </span>
                            <span className="text-sm font-semibold tabular-nums text-slate-900">
                              {formatCurrency(calc?.totalAmount || 0)}
                            </span>
                          </div>
                        </div>

                        <FormField label="Description (Optional)">
                          <Input
                            value={item.description}
                            onChange={(e) => updateItem(index, "description", e.target.value)}
                            placeholder="Item details..."
                            className={fieldClass}
                          />
                        </FormField>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-xs text-slate-500">
                  {items.filter((item) => item.item_name.trim()).length} item(s)
                </span>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Subtotal</p>
                  <p className="text-sm font-semibold tabular-nums text-slate-900">
                    {formatCurrency(calculated.subtotal)}
                  </p>
                </div>
              </div>
            </Section>

            {/* Tax & Discount */}
            <Section
              title="Tax & Discount"
              description="Configure tax mode and bill-level discounts."
              icon={Receipt}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-3 rounded-xl bg-slate-50/70 p-3.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Tax mode
                  </p>

                  <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={isInterstate}
                      onChange={(e) => setIsInterstate(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                    />
                    Inter-state supply (IGST)
                  </label>

                  <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={taxInclusive}
                      onChange={(e) => setTaxInclusive(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                    />
                    Item rates include GST
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Bill Discount (₹)">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={billDiscount}
                      onChange={(e) => setBillDiscount(e.target.value)}
                      className={fieldClass}
                    />
                  </FormField>

                  <FormField label="Round Off (₹)">
                    <Input
                      type="number"
                      step="0.01"
                      value={roundOff}
                      onChange={(e) => setRoundOff(e.target.value)}
                      className={fieldClass}
                    />
                  </FormField>
                </div>
              </div>
            </Section>

            {/* 📁 Offline Bill Upload Section */}
            <Section
              title="Offline Bill Upload"
              description="Attach a photo or PDF of the physical bill (Optional)."
              icon={Upload}
            >
              <div className="space-y-3">
                {!offlineBillFile ? (
                  <div className="relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center transition-colors hover:border-emerald-400 hover:bg-emerald-50/30">
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleOfflineBillChange}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-100 mb-3 text-slate-500">
                      <Upload className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-medium text-slate-800">
                      Click to upload bill
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      SVG, PNG, JPG or PDF (max. 5MB)
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      {offlineBillPreview ? (
                        <img
                          src={offlineBillPreview}
                          alt="Bill Preview"
                          className="h-12 w-12 rounded-lg object-cover ring-1 ring-slate-200"
                        />
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 ring-1 ring-slate-200">
                          <FileText className="h-5 w-5 text-slate-500" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {offlineBillFile.name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {(offlineBillFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={removeOfflineBill}
                      className="h-8 w-8 shrink-0 text-slate-500 hover:bg-red-50 hover:text-red-600"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </Section>

            {/* Additional Details */}
            <Section
              title="Additional Details"
              description="Due date and internal notes."
              icon={CalendarDays}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Payment Due Date">
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className={fieldClass}
                  />
                </FormField>

                <FormField label="Notes (Optional)" className="sm:col-span-2">
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add any additional information..."
                    rows={3}
                    className="resize-none rounded-xl border-slate-200 bg-slate-50/50 text-sm shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/20"
                  />
                </FormField>
              </div>
            </Section>
          </div>

          {/* Right sticky panel */}
          <aside className="min-w-0 space-y-4 xl:sticky xl:top-4">
            {/* Bill Summary */}
            <Section title="Bill Summary" icon={Receipt}>
              <div className="space-y-3">
                <SummaryRow label="Subtotal" value={formatCurrency(calculated.subtotal)} />
                <SummaryRow
                  label="Item Discount"
                  value={`-${formatCurrency(calculated.itemDiscount)}`}
                />
                <SummaryRow
                  label="Bill Discount"
                  value={`-${formatCurrency(calculated.billDiscount)}`}
                />

                <div className="border-t border-slate-100 pt-3">
                  <SummaryRow
                    label="Taxable Amount"
                    value={formatCurrency(calculated.taxable)}
                    emphasized
                  />
                </div>

                <div className="space-y-2 border-t border-slate-100 pt-3">
                  {isInterstate ? (
                    <SummaryRow label="IGST" value={formatCurrency(calculated.igst)} />
                  ) : (
                    <>
                      <SummaryRow label="CGST" value={formatCurrency(calculated.cgst)} />
                      <SummaryRow label="SGST" value={formatCurrency(calculated.sgst)} />
                    </>
                  )}
                  <SummaryRow label="Total GST" value={formatCurrency(calculated.totalGst)} />
                  <SummaryRow
                    label="Round Off"
                    value={formatCurrency(numberValue(roundOff))}
                  />
                </div>

                <div className="rounded-xl bg-slate-100 p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-800">
                      Grand Total
                    </span>
                    <span className="text-xl font-bold tabular-nums text-slate-900">
                      {formatCurrency(calculated.grandTotal)}
                    </span>
                  </div>
                </div>
              </div>
            </Section>

            {/* Payment Details */}
            <Section title="Payment Details" icon={CreditCard}>
              <div className="space-y-4">
                {advanceAvailable > 0 && (
                  <FormField
                    label="Use Advance (₹)"
                    hint={`Available: ${formatCurrency(advanceAvailable)}`}
                  >
                    <Input
                      type="number"
                      min="0"
                      max={advanceAvailable}
                      step="0.01"
                      value={advanceUsed}
                      onChange={(e) => setAdvanceUsed(e.target.value)}
                      className={fieldClass}
                    />
                  </FormField>
                )}

                <FormField label="Amount Paid Now (₹)">
                  <Input
                    type="number"
                    min="0"
                    max={Math.max(0, calculated.grandTotal - calculated.advanceUsed)}
                    step="0.01"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    className={fieldClass}
                  />
                </FormField>

                <FormField label="Payment Mode">
                  <Select value={paymentMode} onValueChange={setPaymentMode}>
                    <SelectTrigger className={fieldClass}>
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
                </FormField>

                <div className="space-y-3 border-t border-slate-100 pt-3">
                  {calculated.advanceUsed > 0 && (
                    <SummaryRow
                      label="Advance Adjusted"
                      value={`-${formatCurrency(calculated.advanceUsed)}`}
                    />
                  )}

                  <SummaryRow
                    label="Paid Now"
                    value={formatCurrency(calculated.amountPaid)}
                  />

                  <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-100 px-3.5 py-2.5">
                    <span className="text-sm font-semibold text-slate-800">
                      Remaining Due
                    </span>
                    <span className="text-base font-bold tabular-nums text-slate-900">
                      {formatCurrency(calculated.amountDue)}
                    </span>
                  </div>
                </div>
              </div>
            </Section>

            {/* Actions */}
            <div className="space-y-2">
              <Button
                type="submit"
                disabled={saving || !customerId}
                className="h-11 w-full rounded-xl bg-emerald-600 font-medium text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating Bill...
                  </span>
                ) : (
                  "Create Bill"
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => navigate(-1)}
                className="h-11 w-full rounded-xl border-slate-200 bg-white text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </Button>

              <p className="px-2 text-center text-xs leading-5 text-slate-400">
                Review customer, items and payment details before creating the bill.
              </p>
            </div>
          </aside>
        </div>
      </form>
    </div>
  )
}