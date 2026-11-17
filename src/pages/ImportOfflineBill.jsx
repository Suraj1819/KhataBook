import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import {
  calculateItemAmounts,
  formatCurrency,
  generateBillNumber,
  roundToTwo,
  UNITS,
  GST_RATES,
  PAYMENT_MODES,
} from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertCircle, ArrowLeft, CalendarDays, Camera, Check, CheckCircle2, ChevronRight,
  Copy, CreditCard, FileText, IndianRupee, Lightbulb, Loader2, Plus, Receipt,
  ScanLine, ShieldCheck, Trash2, UploadCloud, UserRound,
} from "lucide-react"
import { toast } from "sonner"

/* ------------------------------------------------------------------ */
/* Constants & small helpers                                           */
/* ------------------------------------------------------------------ */
const MAX_FILE_SIZE = 5 * 1024 * 1024
const todayString = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0
const money = (v) => roundToTwo(Math.max(0, num(v)))
const normalizePhone = (v) => String(v || "").replace(/\D/g, "").slice(-10)
const clean = (v) => String(v || "").replace(/\s+/g, " ").trim()
const emptyItem = () => ({ item_name: "", description: "", quantity: "1", unit: "Piece", rate: "0", discount: "0", gst_percent: "0" })

/* Shared look — every input, card and button on this page uses these */
const inputClass = "h-11 rounded-xl border-violet-200 bg-white text-sm text-slate-800 shadow-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
const labelClass = "mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300"
const cardClass = "overflow-hidden rounded-[20px] border border-white/80 bg-white/90 shadow-[0_5px_18px_rgba(80,65,130,0.07)]"

const BTN_BASE = "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:pointer-events-none disabled:opacity-50"
const BTN_VARIANTS = {
  primary: "bg-emerald-700 text-white shadow-sm hover:bg-emerald-800",
  secondary: "border border-violet-200 bg-white text-slate-700 shadow-sm hover:bg-violet-50",
  ghost: "text-slate-600 hover:bg-violet-100/60",
  danger: "border border-rose-200 bg-white text-rose-700 shadow-sm hover:bg-rose-50",
}
const BTN_SIZES = {
  md: "h-11 px-4 text-sm",
  sm: "h-9 px-3 text-xs",
  icon: "h-9 w-9 text-xs",
}

/* One button for the whole page: same height, radius, weight and focus ring */
function Btn({ variant = "secondary", size = "md", className = "", type = "button", ...props }) {
  return <button type={type} className={`${BTN_BASE} ${BTN_VARIANTS[variant]} ${BTN_SIZES[size]} ${className}`} {...props} />
}

/* ------------------------------------------------------------------ */
/* Bill text parsing (unchanged logic)                                 */
/* ------------------------------------------------------------------ */
function parseDate(text) {
  const source = String(text || "")
  const labeled = source.match(/(?:bill\s*date|invoice\s*date|dated|date)\s*[:\-]?\s*((?:\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})|(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}))/i)
  const candidate = labeled?.[1] || ""
  if (!candidate) return ""
  const parts = candidate.split(/[-/.]/).map(Number)
  let year, month, day
  if (parts[0] > 999) [year, month, day] = parts
  else {
    [day, month, year] = parts
    if (year < 100) year += year < 50 ? 2000 : 1900
  }
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    !Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) ||
    date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day || date > new Date(`${todayString()}T23:59:59`)
  ) return ""
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function parseAmount(value) {
  if (!value) return ""
  const normalized = String(value).replace(/[₹,\s]/g, "").replace(/[^\d.]/g, "")
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return ""
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? String(parsed) : ""
}

function parseBillText(text) {
  const lines = String(text || "").split(/\r?\n/).map(clean).filter(Boolean)
  const joined = lines.join("\n")

  // Only accept values attached to their own explicit labels.
  const phoneLine = lines.find((line) => /(?:mobile|phone|contact|mob)\s*(?:no\.?|number)?\s*[:\-]/i.test(line))
  const phoneCandidate = phoneLine?.match(/(?:\+?91[\s-]?)?([6-9]\d{9})\b/)?.[1] || ""
  const totalLine = lines.find((line) => /(?:grand\s*total|net\s*amount|amount\s*payable|invoice\s*total|total\s*amount)\s*[:\-]/i.test(line))
  const paidLine = lines.find((line) => /(?:amount\s*paid|paid|received)\s*[:\-]/i.test(line))
  const dueLine = lines.find((line) => /(?:amount\s*due|balance\s*due|pending\s*amount)\s*[:\-]/i.test(line))
  const total = parseAmount(totalLine?.match(/(?:grand\s*total|net\s*amount|amount\s*payable|invoice\s*total|total\s*amount)\s*[:\-]\s*₹?\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1])
  const paid = parseAmount(paidLine?.match(/(?:amount\s*paid|paid|received)\s*[:\-]\s*₹?\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1])
  const due = parseAmount(dueLine?.match(/(?:amount\s*due|balance\s*due|pending\s*amount)\s*[:\-]\s*₹?\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1])
  const gstLine = lines.find((line) => /\bGST\b/i.test(line))
  const gstValue = gstLine?.match(/\b(0|5|12|18|28)\s*%/i)?.[1] || "0"
  const billDate = parseDate(joined)

  const customerLine = lines.find((line) => /(?:customer\s*name|buyer\s*name|party\s*name|customer|buyer|bill\s*to|party)\s*[:\-]/i.test(line))
  const customerName = customerLine
    ? clean(customerLine.replace(/^(?:customer\s*name|buyer\s*name|party\s*name|customer|buyer|bill\s*to|party)\s*[:\-]\s*/i, ""))
    : ""

  const skip = /^(tax invoice|invoice|bill|cash memo|receipt|gstin|gst no|phone|mobile|date|qty|quantity|rate|price|amount|subtotal|sub total|grand total|net amount|total|cgst|sgst|igst|terms|thank|customer|buyer|ship to|bill to)/i
  const itemLines = []
  for (const line of lines) {
    if (skip.test(line) || line.length < 4) continue
    // Accept an item only when the row has a clear numeric quantity and rate structure.
    const row = line.match(/^(.{2,}?)\s+(\d+(?:\.\d+)?)\s+(?:pcs?|nos?|kg|g|ltr|mtr|box|piece|unit)?\s*₹?\s*([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)$/i)
    if (row) {
      const quantity = Number(row[2])
      const rate = parseAmount(row[3])
      if (Number.isFinite(quantity) && quantity > 0 && rate !== "") {
        itemLines.push({ ...emptyItem(), item_name: clean(row[1]), quantity: String(quantity), rate, gst_percent: gstValue })
      }
      continue
    }
    const simple = line.match(/^(.{3,}?)\s{2,}(\d+(?:\.\d+)?)\s*[xX@]\s*₹?\s*([\d,]+(?:\.\d{1,2})?)/)
    if (simple) {
      const quantity = Number(simple[2])
      const rate = parseAmount(simple[3])
      if (Number.isFinite(quantity) && quantity > 0 && rate !== "") {
        itemLines.push({ ...emptyItem(), item_name: clean(simple[1]), quantity: String(quantity), rate, gst_percent: gstValue })
      }
    }
  }

  return {
    customer: { name: customerName, mobile: phoneCandidate },
    billDate,
    items: itemLines.length ? itemLines : [emptyItem()],
    total: total || "",
    paid: paid || "",
    due: due || "",
    rawText: joined,
  }
}

async function imageToText(file, onProgress) {
  const { createWorker } = await import("tesseract.js")
  const worker = await createWorker("eng+hin", 1, {
    logger: (m) => { if (m.status === "recognizing text") onProgress(Math.round((m.progress || 0) * 100)) },
  })
  try {
    const { data } = await worker.recognize(file)
    return data.text || ""
  } finally {
    await worker.terminate()
  }
}
async function pdfToText(file, onProgress) {
  const pdfjs = await import("pdfjs-dist")
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString()
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages = []
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    onProgress(Math.round(((pageNo - 1) / pdf.numPages) * 100))
    const page = await pdf.getPage(pageNo)
    const content = await page.getTextContent()
    const text = content.items.map((item) => item.str).join(" ")
    if (text.trim().length > 30) {
      pages.push(text)
    } else {
      const viewport = page.getViewport({ scale: 1.8 })
      const canvas = document.createElement("canvas")
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise
      const { createWorker } = await import("tesseract.js")
      const worker = await createWorker("eng+hin")
      try { pages.push((await worker.recognize(canvas)).data.text || "") }
      finally { await worker.terminate() }
    }
  }
  onProgress(100)
  return pages.join("\n")
}

/* ------------------------------------------------------------------ */
/* Small UI pieces                                                     */
/* ------------------------------------------------------------------ */
function Field({ label, hint, children }) {
  return (
    <div className="min-w-0">
      <Label className={labelClass}>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-[11px] leading-4 text-slate-500">{hint}</p>}
    </div>
  )
}

function SectionTitle({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eae7f4] px-4 py-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><Icon className="h-5 w-5" /></div>
        <div className="min-w-0">
          <h2 className="text-[16px] font-bold tracking-tight text-[#171a36]">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

function Row({ label, value, strong = false, tone = "" }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={`tabular-nums ${strong ? "font-bold" : "font-semibold"} ${tone || "text-slate-800"}`}>{value}</span>
    </div>
  )
}

function DetectChip({ ok, label }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
      ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"
    }`}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
      {label}
    </span>
  )
}

function StatusPill({ status }) {
  const map = {
    paid: ["Paid", "border-emerald-200 bg-emerald-50 text-emerald-700"],
    partial: ["Partial", "border-amber-200 bg-amber-50 text-amber-700"],
    unpaid: ["Unpaid", "border-rose-200 bg-rose-50 text-rose-700"],
  }
  const [text, cls] = map[status] || map.unpaid
  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${cls}`}>{text}</span>
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function ImportOfflineBill() {
  const { currentShop } = useShop()
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const cameraRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState("")
  const [ocrText, setOcrText] = useState("")
  const [ocrWarnings, setOcrWarnings] = useState([])
  const [detected, setDetected] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [customers, setCustomers] = useState([])
  const [customerLoading, setCustomerLoading] = useState(false)
  const [customerQuery, setCustomerQuery] = useState("")
  const [customerId, setCustomerId] = useState("")
  const [createCustomer, setCreateCustomer] = useState(false)
  const [customer, setCustomer] = useState({ name: "", mobile: "", city: "", state: "", gstin: "" })
  const [billDate, setBillDate] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [items, setItems] = useState([emptyItem()])
  const [manualTotal, setManualTotal] = useState("")
  const [amountPaid, setAmountPaid] = useState("0")
  const [paymentMode, setPaymentMode] = useState("Cash")
  const [notes, setNotes] = useState("")
  const [interstate, setInterstate] = useState(false)
  const [taxInclusive, setTaxInclusive] = useState(false)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState("upload")
  const [originalBillNo, setOriginalBillNo] = useState("")

  useEffect(() => {
    if (!currentShop?.id) { setCustomers([]); return }
    let active = true
    setCustomerLoading(true)
    supabase.from("customers").select("id,name,mobile,city,state,gstin,is_active")
      .eq("shop_id", currentShop.id).eq("is_active", true).order("name")
      .then(({ data, error }) => {
        if (!active) return
        if (error) toast.error("Could not load customers", { description: error.message })
        setCustomers(data || [])
        setCustomerLoading(false)
      })
    return () => { active = false }
  }, [currentShop?.id])

  const totals = useMemo(() => {
    const itemTotals = items.map((item) => {
      const calc = calculateItemAmounts({
        quantity: String(Math.max(0, num(item.quantity))),
        rate: String(Math.max(0, num(item.rate))),
        discount: String(Math.max(0, num(item.discount))),
        gstPercent: String(Math.max(0, Math.min(100, num(item.gst_percent)))),
        taxInclusive,
      })
      return { ...calc, gstPercent: num(item.gst_percent) }
    })
    const subtotal = roundToTwo(itemTotals.reduce((s, x) => s + num(x.gross), 0))
    const taxable = roundToTwo(itemTotals.reduce((s, x) => s + num(x.taxable), 0))
    const gst = roundToTwo(itemTotals.reduce((s, x) => s + num(x.gstAmount), 0))
    const calculatedTotal = roundToTwo(taxable + gst)
    const grandTotal = manualTotal.trim() ? money(manualTotal) : calculatedTotal
    const paid = Math.min(grandTotal, money(amountPaid))
    return { itemTotals, subtotal, taxable, gst, calculatedTotal, grandTotal, paid, due: roundToTwo(Math.max(0, grandTotal - paid)) }
  }, [items, taxInclusive, manualTotal, amountPaid])

  const matches = useMemo(() => {
    const q = clean(customerQuery).toLowerCase()
    if (!q) return []
    return customers.filter((c) => c.name?.toLowerCase().includes(q) || normalizePhone(c.mobile).includes(normalizePhone(q)))
  }, [customers, customerQuery])
  const potentialMatch = useMemo(() => {
    const phone = normalizePhone(customer.mobile)
    if (phone.length === 10) {
      const exactPhone = customers.filter((c) => normalizePhone(c.mobile) === phone)
      if (exactPhone.length === 1) return exactPhone[0]
    }
    const name = clean(customer.name).toLowerCase()
    if (name) {
      const exactName = customers.filter((c) => clean(c.name).toLowerCase() === name)
      if (exactName.length === 1) return exactName[0]
    }
    return null
  }, [customers, customer])

  function updateItem(index, key, value) {
    setItems((old) => old.map((item, i) => i === index ? { ...item, [key]: value } : item))
  }
  function addItem() { setItems((old) => [...old, emptyItem()]) }
  function duplicateItem(index) {
    setItems((old) => [...old.slice(0, index + 1), { ...old[index] }, ...old.slice(index + 1)])
  }
  function removeItem(index) { setItems((old) => old.length === 1 ? old : old.filter((_, i) => i !== index)) }

  function clearFile() {
    setFile(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview("")
  }

  async function selectFile(nextFile) {
    if (!nextFile) return
    if (nextFile.size > MAX_FILE_SIZE) { toast.error("Choose a file smaller than 5 MB"); return }
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
    if (!allowed.includes(nextFile.type)) { toast.error("Upload JPG, PNG, WebP or PDF"); return }
    setFile(nextFile)
    setOcrText("")
    setStep("upload")
    if (preview) URL.revokeObjectURL(preview)
    if (nextFile.type.startsWith("image/")) setPreview(URL.createObjectURL(nextFile))
    else setPreview("")
  }

  async function scanFile() {
    if (!file) return toast.error("Select a bill image or PDF first")

    setScanning(true)
    setProgress(3)
    setOcrWarnings([])

    try {
      // All recognition happens locally in the browser.
      // No OpenAI API, Supabase Edge Function, or paid AI service is called.
      const extractedText = file.type === "application/pdf"
        ? await pdfToText(file, setProgress)
        : await imageToText(file, setProgress)

      setOcrText(extractedText)

      const parsed = parseBillText(extractedText)
      parsed.billNumber =
        (extractedText.match(/(?:invoice|bill)\s*(?:no|number|#)?\s*[:\-]?\s*([A-Z0-9/-]{3,})/i) || [])[1] || ""

      const warnings = []

      if (!extractedText.trim()) {
        warnings.push("No readable text was detected. Enter the bill details manually.")
      } else {
        warnings.push("Local OCR was used. Carefully verify every extracted field before saving.")
      }
      if (!parsed.items.some((item) => clean(item.item_name))) {
        warnings.push("No clear line items were detected. Add the products manually.")
      }
      if (!parsed.customer.name) {
        warnings.push("Customer name was not detected clearly.")
      }
      if (!parsed.total) {
        warnings.push("Bill total was not detected. Enter the correct grand total.")
      }

      setOcrWarnings(warnings)
      setDetected({
        customer: Boolean(parsed.customer.name),
        mobile: Boolean(parsed.customer.mobile),
        date: Boolean(parsed.billDate),
        billNo: Boolean(parsed.billNumber),
        items: parsed.items.filter((item) => clean(item.item_name)).length,
        total: Boolean(parsed.total),
      })

      setCustomer({
        name: parsed.customer.name || "",
        mobile: parsed.customer.mobile || "",
        city: "",
        state: "",
        gstin: "",
      })

      setBillDate(parsed.billDate || "")
      setItems(parsed.items)
      setManualTotal(parsed.total ? String(parsed.total) : "")
      setAmountPaid(parsed.paid ? String(parsed.paid) : "0")
      setOriginalBillNo(parsed.billNumber || "")
      setCustomerQuery(parsed.customer.name || "")
      setCreateCustomer(false)
      setCustomerId("")
      setProgress(100)
      setStep("review")

      toast.success(
        extractedText.trim()
          ? "Local OCR completed. Review all details before saving."
          : "OCR could not read this bill. You can enter details manually."
      )
    } catch (error) {
      console.error("Local bill OCR error:", error)
      setOcrWarnings([
        "Automatic text recognition could not complete. You can still enter the bill details manually.",
      ])
      setDetected(null)
      toast.error("Could not scan this file", {
        description: error?.message || "Check the file and try again.",
      })
      setStep("review")
    } finally {
      setScanning(false)
    }
  }

  function startManualEntry() {
    setStep("review")
    setOcrText("")
    setDetected(null)
    setOcrWarnings([])
    if (!file) setItems([emptyItem()])
  }

  async function saveBill() {
    if (!currentShop?.id) return toast.error("Select an active shop first")
    if (saving) return
    // Respect an explicit "Create new customer" choice; otherwise reuse an exact match.
    let finalCustomerId = createCustomer ? "" : customerId
    if (!finalCustomerId && !createCustomer && potentialMatch) finalCustomerId = potentialMatch.id
    if (!finalCustomerId && !createCustomer) {
      toast.error("Select the matching customer or choose Create new customer")
      return
    }
    if (createCustomer && !clean(customer.name)) return toast.error("Customer name is required")
    if (!/^\d{4}-\d{2}-\d{2}$/.test(billDate) || billDate > todayString()) return toast.error("Enter a valid bill date")
    const validItems = items.filter((x) => clean(x.item_name))
    if (!validItems.length && !manualTotal.trim()) return toast.error("Add at least one item or enter the bill total")
    if (validItems.some((x) => num(x.quantity) <= 0 || num(x.rate) < 0 || num(x.discount) < 0 || num(x.gst_percent) < 0 || num(x.gst_percent) > 100)) {
      return toast.error("Check item quantity, rate, discount and GST values")
    }
    if (amountPaid.trim() && (!/^\d+(?:\.\d{1,2})?$/.test(amountPaid) || Number(amountPaid) < 0)) return toast.error("Enter a valid paid amount")
    if (money(amountPaid) > totals.grandTotal) return toast.error("Paid amount cannot exceed bill total")
    if (manualTotal.trim() && (!/^\d+(?:\.\d{1,2})?$/.test(manualTotal) || Number(manualTotal) < 0)) return toast.error("Enter a valid bill total")
    setSaving(true)
    let createdBillId = null
    try {
      if (!finalCustomerId) {
        // Guard against creating a duplicate if the OCR matched an existing mobile number.
        const phone = normalizePhone(customer.mobile)
        if (phone) {
          const { data: samePhone, error } = await supabase.from("customers")
            .select("id,name,mobile").eq("shop_id", currentShop.id).eq("is_active", true)
          if (error) throw error
          const found = (samePhone || []).find((c) => normalizePhone(c.mobile) === phone)
          if (found) {
            finalCustomerId = found.id
            setCustomerId(found.id)
            setCreateCustomer(false)
            toast.info(`Matched existing customer: ${found.name}`)
          }
        }
      }
      if (!finalCustomerId) {
        const { data: createdCustomer, error } = await supabase.from("customers").insert({
          shop_id: currentShop.id,
          name: clean(customer.name),
          mobile: normalizePhone(customer.mobile) || null,
          city: clean(customer.city) || null,
          state: clean(customer.state) || null,
          gstin: clean(customer.gstin).toUpperCase() || null,
          is_active: true,
        }).select("id").single()
        if (error) throw error
        finalCustomerId = createdCustomer.id
      }

      let attachmentUrl = null
      if (file) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "bin"
        const path = `${currentShop.id}/offline-${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage.from("bill_attachments").upload(path, file, { upsert: false, contentType: file.type })
        if (uploadError) throw uploadError
        attachmentUrl = supabase.storage.from("bill_attachments").getPublicUrl(path).data.publicUrl
      }

      const billNumber = generateBillNumber()
      const statusValue = totals.due <= 0 ? "paid" : totals.paid > 0 ? "partial" : "unpaid"
      const roundOff = roundToTwo(totals.grandTotal - totals.calculatedTotal)
      const billPayload = {
        shop_id: currentShop.id,
        customer_id: finalCustomerId,
        bill_number: billNumber,
        bill_date: billDate,
        is_interstate: interstate,
        tax_inclusive: taxInclusive,
        subtotal: totals.subtotal,
        discount_amount: 0,
        taxable_amount: totals.taxable,
        cgst_amount: interstate ? 0 : roundToTwo(totals.gst / 2),
        sgst_amount: interstate ? 0 : roundToTwo(totals.gst - roundToTwo(totals.gst / 2)),
        igst_amount: interstate ? totals.gst : 0,
        total_gst: totals.gst,
        round_off: roundOff,
        grand_total: totals.grandTotal,
        advance_adjusted: 0,
        amount_paid: totals.paid,
        amount_due: totals.due,
        due_date: dueDate || null,
        payment_status: statusValue,
        notes: [notes.trim(), originalBillNo ? `Original bill no: ${originalBillNo}` : "", ocrText ? "Imported from offline bill (OCR reviewed)." : "Imported from offline bill."].filter(Boolean).join("\n") || null,
        attachment_url: attachmentUrl,
      }
      const { data: bill, error: billError } = await supabase.from("bills").insert(billPayload).select().single()
      if (billError) throw billError
      createdBillId = bill.id

      if (validItems.length) {
        const rows = validItems.map((item, index) => {
          const calc = calculateItemAmounts({
            quantity: String(num(item.quantity)),
            rate: String(num(item.rate)),
            discount: String(num(item.discount)),
            gstPercent: String(num(item.gst_percent)),
            taxInclusive,
          })
          return {
            bill_id: bill.id,
            item_name: clean(item.item_name),
            description: clean(item.description) || null,
            quantity: num(item.quantity),
            unit: item.unit || "Piece",
            rate: num(item.rate),
            discount: num(item.discount),
            gst_percent: num(item.gst_percent),
            taxable_amount: roundToTwo(num(calc.taxable)),
            gst_amount: roundToTwo(num(calc.gstAmount)),
            total_amount: roundToTwo(num(calc.taxable) + num(calc.gstAmount)),
            sort_order: index,
          }
        })
        const { error: itemError } = await supabase.from("bill_items").insert(rows)
        if (itemError) throw itemError
      }
      if (totals.paid > 0) {
        const { error } = await supabase.from("payments").insert({
          shop_id: currentShop.id, customer_id: finalCustomerId, bill_id: bill.id,
          amount: totals.paid, payment_mode: paymentMode, payment_date: billDate, is_advance: false,
        })
        if (error) throw error
      }
      toast.success("Offline bill imported successfully")
      navigate(`/bills/${bill.id}`)
    } catch (error) {
      console.error("Import offline bill error:", error)
      toast.error(createdBillId
        ? "Bill record was created, but a later save step failed. Check the bill before retrying."
        : "Could not import bill", { description: error?.message || "Please try again." })
    } finally { setSaving(false) }
  }

  const customerChoice = customerId
    ? customers.find((c) => c.id === customerId)
    : potentialMatch

  if (!currentShop) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card className={cardClass}>
          <CardContent className="p-8 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-amber-500" />
            <h2 className="mt-3 font-bold text-slate-900 dark:text-white">Select a shop</h2>
            <p className="mt-1 text-sm text-slate-500">Choose an active shop to import a bill.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const namedItemCount = items.filter((item) => clean(item.item_name)).length
  const settledPercent = totals.grandTotal > 0
    ? Math.min(100, Math.round((totals.paid / totals.grandTotal) * 100))
    : 0
  const paymentStatus = totals.due <= 0 ? "paid" : totals.paid > 0 ? "partial" : "unpaid"
  const roundOffValue = roundToTwo(totals.grandTotal - totals.calculatedTotal)
  const halfGst = roundToTwo(totals.gst / 2)
  const paidValid = money(amountPaid) <= totals.grandTotal

  const checklist = [
    { ok: Boolean(customerId || createCustomer || potentialMatch), label: "Customer selected or new customer enabled" },
    { ok: Boolean(namedItemCount || manualTotal.trim()), label: "Items or manual total entered" },
    { ok: Boolean(billDate) && billDate <= todayString(), label: "Bill date verified" },
    { ok: paidValid, label: "Paid amount within bill total" },
  ]
  const readyCount = checklist.filter((c) => c.ok).length

  const steps = [
    { number: "01", title: "Upload bill", description: "Capture or choose a file", state: step === "upload" ? "current" : "done" },
    { number: "02", title: "Review details", description: "Verify extracted values", state: step === "review" ? (saving ? "done" : "current") : "pending" },
    { number: "03", title: "Import to ledger", description: "Match customer and save", state: saving ? "current" : "pending" },
  ]

  return (
    <div className="min-h-full w-full space-y-5 rounded-2xl bg-[#f7f5ff] px-3 py-5 sm:px-5 lg:px-6">
      {/* PAGE HEADER */}
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
            <span>{currentShop.name || "Workspace"}</span>
            <ChevronRight className="h-3 w-3" />
            <button type="button" onClick={() => navigate("/bills")} className="transition-colors hover:text-slate-800">Bills</button>
            <ChevronRight className="h-3 w-3" />
            <span className="text-slate-700">Import offline bill</span>
          </nav>
          <h1 className="mt-1 text-[27px] font-bold tracking-tight text-[#171a36] sm:text-[32px]">Import offline bill</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-slate-600">
            Scan a paper bill, review the extracted information and add it to the customer ledger.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex h-11 items-center gap-2 rounded-xl border border-white bg-white/85 px-3.5 text-sm font-medium text-slate-700 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {currentShop.name || "Active shop"}
          </div>
          <Btn onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /> Back</Btn>
        </div>
      </header>

      {/* WORKFLOW STEPS */}
      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map((s) => (
          <li
            key={s.number}
            aria-current={s.state === "current" ? "step" : undefined}
            className={`flex items-center gap-3 rounded-[18px] border p-3.5 shadow-sm ${
              s.state === "current" ? "border-emerald-200 bg-emerald-50/80"
                : s.state === "done" ? "border-emerald-100 bg-white/90"
                : "border-white/80 bg-white/70"
            }`}
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
              s.state === "pending" ? "bg-violet-100 text-violet-700" : "bg-emerald-700 text-white"
            }`}>
              {s.state === "done" ? <Check className="h-4 w-4" /> : s.number}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[#171a36]">{s.title}</p>
              <p className="mt-0.5 text-xs text-slate-500">{s.description}</p>
            </div>
            <span className={`hidden rounded-full px-2 py-0.5 text-[10px] font-bold sm:inline ${
              s.state === "current" ? "bg-emerald-100 text-emerald-700"
                : s.state === "done" ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-500"
            }`}>
              {s.state === "current" ? "In progress" : s.state === "done" ? "Done" : "Pending"}
            </span>
          </li>
        ))}
      </ol>

      {/* hidden file inputs */}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(event) => { selectFile(event.target.files?.[0]); event.target.value = "" }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => { selectFile(event.target.files?.[0]); event.target.value = "" }}
      />

      {step === "upload" ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          {/* UPLOAD CARD */}
          <Card className={cardClass}>
            <SectionTitle
              icon={ScanLine}
              title="Offline bill attachment"
              subtitle="Upload a photo or PDF. Text recognition runs locally in your browser."
            />
            <CardContent className="space-y-5 p-4 sm:p-5">
              {!file ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => cameraRef.current?.click()}
                    className="group flex min-h-[230px] flex-col items-center justify-center rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-6 text-center transition hover:border-emerald-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                  >
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-lg"><Camera className="h-7 w-7" /></span>
                    <span className="mt-4 text-base font-bold text-[#171a36]">Scan with camera</span>
                    <span className="mt-1 max-w-xs text-sm leading-5 text-slate-500">Capture a clear photo of the physical bill.</span>
                    <span className={`${BTN_BASE} ${BTN_VARIANTS.primary} ${BTN_SIZES.md} mt-4`}><Camera className="h-4 w-4" /> Open camera</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex min-h-[230px] flex-col items-center justify-center rounded-2xl border border-violet-200 bg-[#faf9ff] p-6 text-center transition hover:border-violet-300 hover:bg-violet-50/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                  >
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-700"><UploadCloud className="h-7 w-7" /></span>
                    <span className="mt-4 text-base font-bold text-[#171a36]">Upload from device</span>
                    <span className="mt-1 text-sm text-slate-500">JPG, PNG, WebP or PDF · Max 5 MB</span>
                    <span className={`${BTN_BASE} ${BTN_VARIANTS.secondary} ${BTN_SIZES.md} mt-4`}><UploadCloud className="h-4 w-4" /> Browse files</span>
                  </button>
                </div>
              ) : (
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <div className="flex min-h-[250px] items-center justify-center overflow-hidden rounded-2xl border border-violet-100 bg-[#faf9ff] p-3">
                    {preview ? (
                      <img src={preview} alt="Offline bill preview" className="max-h-[440px] max-w-full rounded-lg object-contain" />
                    ) : (
                      <div className="text-center">
                        <FileText className="mx-auto h-12 w-12 text-violet-500" />
                        <p className="mt-3 text-sm font-semibold text-slate-700">{file.name}</p>
                        <p className="text-xs text-slate-500">PDF document</p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col justify-center gap-4">
                    <div>
                      <p className="break-all text-sm font-bold text-slate-800">{file.name}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                          {file.type === "application/pdf" ? "PDF" : file.type.replace("image/", "").toUpperCase()}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Btn onClick={() => fileRef.current?.click()} disabled={scanning}><UploadCloud className="h-4 w-4" /> Replace file</Btn>
                      <Btn variant="danger" onClick={clearFile} disabled={scanning}><Trash2 className="h-4 w-4" /> Remove file</Btn>
                    </div>
                  </div>
                </div>
              )}

              {scanning && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-4" role="status" aria-live="polite">
                  <div className="flex items-center justify-between text-sm font-semibold text-emerald-800">
                    <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Reading bill locally…</span>
                    {progress}%
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-100">
                    <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-emerald-800/80">This can take a few seconds. Please keep this page open.</p>
                </div>
              )}

              <div className="flex flex-col justify-between gap-3 border-t border-[#eeecf5] pt-4 sm:flex-row sm:items-center">
                <p className="max-w-xl text-xs leading-5 text-slate-500">
                  OCR suggestions are not saved automatically. You can correct customer, item and payment details before importing.
                </p>
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <Btn onClick={startManualEntry} disabled={scanning}>Enter manually</Btn>
                  <Btn variant="primary" disabled={!file || scanning} onClick={scanFile}>
                    {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                    {scanning ? "Scanning bill…" : "Scan & extract details"}
                  </Btn>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* GUIDANCE */}
          <aside className="min-w-0 space-y-4">
            <Card className={cardClass}>
              <SectionTitle icon={Lightbulb} title="Tips for a better scan" />
              <CardContent className="p-4 sm:p-5">
                <ul className="space-y-3 text-sm text-slate-600">
                  {[
                    "Place the bill on a flat, plain surface.",
                    "Use good light and avoid shadows or glare.",
                    "Keep the whole bill inside the frame.",
                    "Printed bills scan better than handwriting.",
                  ].map((tip) => (
                    <li key={tip} className="flex items-start gap-2.5">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className={cardClass}>
              <SectionTitle icon={Receipt} title="What we try to read" />
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-wrap gap-2">
                  {["Customer name", "Mobile number", "Bill date", "Bill number", "Line items", "Bill total", "Amount paid"].map((label) => (
                    <span key={label} className="rounded-full border border-violet-100 bg-[#faf9ff] px-2.5 py-1 text-xs font-semibold text-slate-600">{label}</span>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">Anything we cannot read clearly is left empty for you to fill in.</p>
              </CardContent>
            </Card>

            <div className="flex items-start gap-3 rounded-[18px] border border-emerald-100 bg-emerald-50/60 p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
              <p className="text-xs leading-5 text-emerald-900">
                <span className="font-bold">Private by design.</span> Your bill is read inside this browser. No paid AI service is used, and nothing is saved until you import.
              </p>
            </div>
          </aside>
        </div>
      ) : (
        <>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            {/* LEFT COLUMN */}
            <div className="min-w-0 space-y-4">
              {/* SOURCE BILL */}
              <Card className={cardClass}>
                <CardContent className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-violet-100 bg-[#faf9ff]">
                    {preview ? <img src={preview} alt="Bill thumbnail" className="h-full w-full object-cover" /> : <FileText className="h-6 w-6 text-violet-600" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-800">{file ? file.name : "Manual entry"}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {file ? `Original bill attached · ${(file.size / 1024 / 1024).toFixed(2)} MB` : "No original bill attached"}
                    </p>
                  </div>
                  <Btn size="sm" onClick={() => setStep("upload")}>
                    <UploadCloud className="h-3.5 w-3.5" /> {file ? "Change file" : "Attach file"}
                  </Btn>
                </CardContent>
                {detected && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-[#eeecf5] bg-[#faf9ff] px-4 py-3 sm:px-5">
                    <span className="mr-1 text-xs font-semibold text-slate-500">Detected:</span>
                    <DetectChip ok={detected.customer} label="Customer" />
                    <DetectChip ok={detected.mobile} label="Mobile" />
                    <DetectChip ok={detected.date} label="Bill date" />
                    <DetectChip ok={detected.billNo} label="Bill no." />
                    <DetectChip ok={detected.items > 0} label={detected.items > 0 ? `${detected.items} ${detected.items === 1 ? "item" : "items"}` : "Items"} />
                    <DetectChip ok={detected.total} label="Total" />
                  </div>
                )}
              </Card>

              {ocrWarnings.length > 0 && (
                <div className="rounded-[18px] border border-amber-200 bg-amber-50/80 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-amber-900">OCR review required</p>
                      <p className="mt-1 text-xs leading-5 text-amber-800">
                        Local OCR can misread handwriting, item names and numbers. Verify every field before importing.
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-800">
                        {ocrWarnings.map((warning, index) => <li key={index}>{warning}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* CUSTOMER */}
              <Card className={cardClass}>
                <SectionTitle icon={UserRound} title="Customer" subtitle="Find an existing customer or create a new record." />
                <CardContent className="space-y-4 p-4 sm:p-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Customer name *">
                      <Input
                        className={inputClass}
                        value={customer.name}
                        onChange={(event) => {
                          setCustomer({ ...customer, name: event.target.value })
                          setCustomerQuery(event.target.value)
                          setCustomerId("")
                          setCreateCustomer(false)
                        }}
                        placeholder="Enter customer name"
                      />
                    </Field>
                    <Field label="Mobile number">
                      <Input
                        className={inputClass}
                        inputMode="tel"
                        value={customer.mobile}
                        onChange={(event) => {
                          setCustomer({ ...customer, mobile: event.target.value })
                          setCustomerId("")
                          setCreateCustomer(false)
                        }}
                        placeholder="10-digit mobile number"
                      />
                    </Field>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-500">Customer match:</span>
                    {customerLoading ? (
                      <span className="text-xs text-slate-500">Checking customers…</span>
                    ) : customerChoice ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Existing: {customerChoice.name}
                      </span>
                    ) : createCustomer ? (
                      <span className="rounded-full border border-violet-100 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">New customer will be created</span>
                    ) : clean(customer.name) ? (
                      <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">No exact match selected</span>
                    ) : (
                      <span className="text-xs text-slate-400">Enter a name or mobile number</span>
                    )}
                  </div>

                  {matches.length > 0 && (
                    <div className="rounded-xl border border-[#ece9f5] bg-[#faf9ff] p-2">
                      <p className="px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Matching customers</p>
                      {matches.slice(0, 5).map((match) => (
                        <button
                          key={match.id}
                          type="button"
                          onClick={() => {
                            setCustomerId(match.id)
                            setCustomer({
                              name: match.name || "",
                              mobile: match.mobile || "",
                              city: match.city || "",
                              state: match.state || "",
                              gstin: match.gstin || "",
                            })
                            setCustomerQuery(match.name || "")
                            setCreateCustomer(false)
                          }}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition hover:bg-white ${
                            customerId === match.id ? "bg-emerald-50" : ""
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-slate-800">{match.name}</span>
                            <span className="text-xs text-slate-500">{match.mobile || "No mobile number"}</span>
                          </span>
                          {customerId === match.id && <Check className="h-4 w-4 text-emerald-600" />}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 border-t border-[#eeecf5] pt-3">
                    <Btn
                      onClick={() => { setCustomerId(""); setCreateCustomer(true) }}
                      className={createCustomer ? "!border-emerald-300 !bg-emerald-50 !text-emerald-800" : ""}
                    >
                      <Plus className="h-4 w-4" /> Create new customer
                    </Btn>
                    {customerId && <Btn variant="ghost" onClick={() => setCustomerId("")}>Clear selection</Btn>}
                  </div>

                  {createCustomer && (
                    <div className="grid gap-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 sm:grid-cols-3">
                      <Field label="City">
                        <Input className={inputClass} value={customer.city} onChange={(event) => setCustomer({ ...customer, city: event.target.value })} placeholder="City" />
                      </Field>
                      <Field label="State">
                        <Input className={inputClass} value={customer.state} onChange={(event) => setCustomer({ ...customer, state: event.target.value })} placeholder="State" />
                      </Field>
                      <Field label="GSTIN">
                        <Input className={inputClass} value={customer.gstin} onChange={(event) => setCustomer({ ...customer, gstin: event.target.value.toUpperCase() })} placeholder="Optional GSTIN" />
                      </Field>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* BILL DETAILS */}
              <Card className={cardClass}>
                <SectionTitle icon={CalendarDays} title="Bill details" subtitle="Review the original bill information." />
                <CardContent className="space-y-4 p-4 sm:p-5">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Bill date *">
                      <Input type="date" max={todayString()} className={inputClass} value={billDate} onChange={(event) => setBillDate(event.target.value)} />
                    </Field>
                    <Field label="Due date">
                      <Input type="date" min={billDate || undefined} className={inputClass} value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                    </Field>
                    <Field label="Original bill number">
                      <Input className={inputClass} value={originalBillNo} onChange={(event) => setOriginalBillNo(event.target.value)} placeholder="Optional" />
                    </Field>
                  </div>
                  <Field label="Import notes">
                    <Textarea className="min-h-[88px] rounded-xl border-violet-200 bg-white text-sm shadow-none focus-visible:ring-2 focus-visible:ring-emerald-500/20" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add any notes about this imported bill…" />
                  </Field>
                </CardContent>
              </Card>

              {/* BILL ITEMS */}
              <Card className={cardClass}>
                <SectionTitle
                  icon={FileText}
                  title="Bill items"
                  subtitle={`${namedItemCount} ${namedItemCount === 1 ? "item" : "items"} added`}
                  action={<Btn size="sm" onClick={addItem}><Plus className="h-4 w-4" /> Add item</Btn>}
                />
                <CardContent className="space-y-3 p-4 sm:p-5">
                  {items.map((item, index) => {
                    const itemTotal = totals.itemTotals[index]
                    return (
                      <div key={index} className="overflow-hidden rounded-2xl border border-[#ece9f5] bg-white">
                        <div className="flex items-center justify-between gap-3 border-b border-[#eeecf5] bg-[#f5f3fc] px-4 py-2.5">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">{index + 1}</span>
                            <p className="truncate text-[13px] font-bold text-slate-800">{clean(item.item_name) || `Item ${index + 1}`}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Btn variant="ghost" size="icon" onClick={() => duplicateItem(index)} aria-label={`Duplicate item ${index + 1}`} title="Duplicate item">
                              <Copy className="h-4 w-4" />
                            </Btn>
                            {items.length > 1 && (
                              <Btn variant="ghost" size="icon" onClick={() => removeItem(index)} aria-label={`Remove item ${index + 1}`} title="Remove item" className="hover:!bg-rose-50 hover:!text-rose-600">
                                <Trash2 className="h-4 w-4" />
                              </Btn>
                            )}
                          </div>
                        </div>

                        <div className="space-y-3 p-4">
                          <Field label="Item name *">
                            <Input className={inputClass} value={item.item_name} onChange={(event) => updateItem(index, "item_name", event.target.value)} placeholder="e.g. Cement, Pipe, Paint" />
                          </Field>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <Field label="Quantity">
                              <Input type="number" min="0.001" step="any" className={inputClass} value={item.quantity} onChange={(event) => updateItem(index, "quantity", event.target.value)} />
                            </Field>
                            <Field label="Unit">
                              <select className={`${inputClass} w-full px-3`} value={item.unit} onChange={(event) => updateItem(index, "unit", event.target.value)}>
                                {UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                              </select>
                            </Field>
                            <Field label="Rate (₹)">
                              <Input type="number" min="0" step="0.01" className={inputClass} value={item.rate} onChange={(event) => updateItem(index, "rate", event.target.value)} placeholder="0.00" />
                            </Field>
                            <Field label="Discount (₹)">
                              <Input type="number" min="0" step="0.01" className={inputClass} value={item.discount} onChange={(event) => updateItem(index, "discount", event.target.value)} />
                            </Field>
                            <Field label="GST rate">
                              <select className={`${inputClass} w-full px-3`} value={item.gst_percent} onChange={(event) => updateItem(index, "gst_percent", event.target.value)}>
                                {GST_RATES.map((rate) => <option key={rate} value={String(rate)}>{rate}%</option>)}
                              </select>
                            </Field>
                            <div className="col-span-2 flex min-h-[44px] items-center justify-between self-end rounded-xl border border-emerald-100 bg-emerald-50/60 px-3.5 py-2">
                              <div>
                                <p className="text-xs font-semibold text-emerald-800">Item total</p>
                                <p className="text-[11px] text-slate-500">Taxable {formatCurrency(itemTotal?.taxable || 0)} · GST {formatCurrency(itemTotal?.gstAmount || 0)}</p>
                              </div>
                              <span className="text-base font-bold tabular-nums text-slate-900">{formatCurrency(itemTotal?.total || 0)}</span>
                            </div>
                          </div>
                          <Field label="Description (optional)">
                            <Input className={inputClass} value={item.description} onChange={(event) => updateItem(index, "description", event.target.value)} placeholder="Item details…" />
                          </Field>
                        </div>
                      </div>
                    )
                  })}

                  <Btn onClick={addItem} className="w-full border-dashed"><Plus className="h-4 w-4" /> Add another item</Btn>

                  <div className="flex items-center justify-between border-t border-[#eeecf5] pt-3">
                    <span className="text-xs font-medium text-slate-600">{namedItemCount} {namedItemCount === 1 ? "item" : "items"}</span>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Subtotal</p>
                      <p className="text-sm font-bold tabular-nums text-slate-900">{formatCurrency(totals.subtotal)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* TAX AND TOTAL */}
              <Card className={cardClass}>
                <SectionTitle icon={Receipt} title="Tax & total" subtitle="Choose the tax treatment and confirm the bill total." />
                <CardContent className="space-y-4 p-4 sm:p-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 ${interstate ? "border-emerald-200 bg-emerald-50/60" : "border-violet-100 bg-white"}`}>
                      <input type="checkbox" checked={interstate} onChange={(event) => setInterstate(event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-600" />
                      <span><span className="block text-sm font-semibold text-slate-800">Inter-state supply (IGST)</span><span className="mt-0.5 block text-xs text-slate-500">Use IGST instead of CGST and SGST.</span></span>
                    </label>
                    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 ${taxInclusive ? "border-emerald-200 bg-emerald-50/60" : "border-violet-100 bg-white"}`}>
                      <input type="checkbox" checked={taxInclusive} onChange={(event) => setTaxInclusive(event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-600" />
                      <span><span className="block text-sm font-semibold text-slate-800">Rates include GST</span><span className="mt-0.5 block text-xs text-slate-500">Entered item rates already include GST.</span></span>
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label="Manual bill total (optional)"
                      hint="Fill this if the printed bill total differs from the calculated total (for example after round-off)."
                    >
                      <Input type="number" min="0" step="0.01" className={inputClass} value={manualTotal} onChange={(event) => setManualTotal(event.target.value)} placeholder={`Calculated: ${formatCurrency(totals.calculatedTotal)}`} />
                    </Field>
                    <div className="rounded-xl border border-violet-100 bg-[#faf9ff] p-3.5 text-sm">
                      <div className="flex items-center justify-between"><span className="text-slate-600">Calculated total</span><span className="font-semibold tabular-nums text-slate-800">{formatCurrency(totals.calculatedTotal)}</span></div>
                      <div className="mt-2 flex items-center justify-between"><span className="text-slate-600">Total used</span><span className="font-bold tabular-nums text-slate-900">{formatCurrency(totals.grandTotal)}</span></div>
                      {manualTotal.trim() && (
                        <div className="mt-2 flex items-center justify-between border-t border-[#eeecf5] pt-2 text-xs">
                          <span className="text-slate-500">Difference</span>
                          <span className={`font-semibold tabular-nums ${roundOffValue === 0 ? "text-slate-600" : "text-amber-700"}`}>{roundOffValue > 0 ? "+" : ""}{formatCurrency(roundOffValue)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {ocrText && (
                    <details className="rounded-xl border border-violet-100 bg-[#faf9ff] p-3">
                      <summary className="cursor-pointer text-xs font-semibold text-slate-600">View raw OCR text</summary>
                      <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-slate-500">{ocrText}</pre>
                    </details>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* RIGHT COLUMN */}
            <aside className="min-w-0 space-y-4 xl:sticky xl:top-4">
              <Card className={cardClass}>
                <SectionTitle icon={IndianRupee} title="Bill summary" subtitle="Live totals as you review." />
                <CardContent className="space-y-3 p-5">
                  <Row label="Items" value={namedItemCount} />
                  <Row label="Subtotal" value={formatCurrency(totals.subtotal)} />
                  <Row label="Taxable amount" value={formatCurrency(totals.taxable)} />
                  {interstate ? (
                    <Row label="IGST" value={formatCurrency(totals.gst)} />
                  ) : (
                    <>
                      <Row label="CGST" value={formatCurrency(halfGst)} />
                      <Row label="SGST" value={formatCurrency(roundToTwo(totals.gst - halfGst))} />
                    </>
                  )}
                  <Row label="Total GST" value={formatCurrency(totals.gst)} />
                  {Math.abs(roundOffValue) >= 0.01 && <Row label="Round off / adjustment" value={`${roundOffValue > 0 ? "+" : ""}${formatCurrency(roundOffValue)}`} tone="text-amber-700" />}
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-emerald-800">Grand total</span>
                      <span className="text-2xl font-extrabold tracking-tight tabular-nums text-slate-900">{formatCurrency(totals.grandTotal)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className={cardClass}>
                <SectionTitle
                  icon={CreditCard}
                  title="Payment details"
                  subtitle="Record the amount received."
                  action={<StatusPill status={paymentStatus} />}
                />
                <CardContent className="space-y-4 p-5">
                  <Field label="Amount paid now (₹)">
                    <Input type="number" min="0" step="0.01" className={inputClass} value={amountPaid} onChange={(event) => setAmountPaid(event.target.value)} />
                  </Field>
                  <div className="grid grid-cols-3 gap-2">
                    <Btn size="sm" onClick={() => setAmountPaid(String(totals.grandTotal))}>Full</Btn>
                    <Btn size="sm" onClick={() => setAmountPaid(String(roundToTwo(totals.grandTotal / 2)))}>Half</Btn>
                    <Btn size="sm" onClick={() => setAmountPaid("0")}>Clear</Btn>
                  </div>
                  {!paidValid && <p className="text-xs font-medium text-rose-600">Paid amount cannot exceed the bill total.</p>}
                  <Field label="Payment mode">
                    <select className={`${inputClass} w-full px-3`} value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)}>
                      {PAYMENT_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                    </select>
                  </Field>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-600">Settled</span>
                      <span className="font-bold tabular-nums text-slate-800">{settledPercent}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-rose-100" role="progressbar" aria-valuenow={settledPercent} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${settledPercent}%` }} />
                    </div>
                  </div>
                  <div className="space-y-2 border-t border-[#eeecf5] pt-3">
                    <Row label="Paid" value={formatCurrency(totals.paid)} />
                    <div className="flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50/70 px-3.5 py-2.5">
                      <span className="text-sm font-semibold text-rose-700">Remaining due</span>
                      <span className="text-base font-bold tabular-nums text-rose-700">{formatCurrency(totals.due)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className={cardClass}>
                <CardContent className="space-y-4 p-5">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">Ready to import</span>
                      <span className="font-bold tabular-nums text-slate-800">{readyCount}/{checklist.length}</span>
                    </div>
                    <ul className="space-y-2.5">
                      {checklist.map((c) => (
                        <li key={c.label} className="flex items-center gap-2 text-xs text-slate-600">
                          <CheckCircle2 className={`h-4 w-4 shrink-0 ${c.ok ? "text-emerald-600" : "text-slate-300"}`} />
                          {c.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="grid gap-2">
                    <Btn variant="primary" className="w-full" disabled={saving || customerLoading} onClick={saveBill}>
                      {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing bill…</> : <><CheckCircle2 className="h-4 w-4" /> Import bill to customer</>}
                    </Btn>
                    <Btn className="w-full" disabled={saving} onClick={() => setStep("upload")}>
                      <ArrowLeft className="h-4 w-4" /> Back to upload
                    </Btn>
                  </div>
                  <p className="text-center text-[11px] leading-4 text-slate-500">
                    Review customer, item and payment details before importing.
                  </p>
                </CardContent>
              </Card>
            </aside>
          </div>

          {/* MOBILE ACTION BAR */}
          <div className="sticky bottom-3 z-30 flex items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-white/95 p-3 shadow-[0_12px_32px_rgba(80,65,130,0.18)] backdrop-blur xl:hidden">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-slate-500">Grand total</p>
              <p className="truncate text-lg font-bold tabular-nums text-slate-900">{formatCurrency(totals.grandTotal)}</p>
            </div>
            <Btn variant="primary" disabled={saving || customerLoading} onClick={saveBill}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> Import bill</>}
            </Btn>
          </div>
        </>
      )}
    </div>
  )
}