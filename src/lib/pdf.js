import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { formatDate } from "./utils"

/* =========================================================
   GST TAX INVOICE PDF  (A4, monochrome, Flipkart-style)
   Optional fields (agar aapke data me hain to automatically dikhenge):
   shop     : pan, state, bank_name, bank_account, bank_ifsc, upi_id,
              terms, signature (base64 image)
   customer : state, gstin, shipping_address
   bill     : order_id, place_of_supply, tax_inclusive, terms,
              shipping_address, payment_mode
   item     : hsn_code (ya hsn), gross_amount, taxable_amount,
              cgst_amount, sgst_amount, igst_amount
   ========================================================= */

const COLORS = {
  ink: [17, 24, 39],
  muted: [95, 102, 112],
  soft: [247, 248, 250],
  line: [205, 210, 218],
  primary: [17, 24, 39],
  white: [255, 255, 255],
}

const MARGIN = 10
const PAGE_BOTTOM = 276

// ---------- basic helpers ----------
const amount = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}
const pick = (value, fallback) =>
  value === undefined || value === null || value === "" ? fallback : amount(value)
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100
const clean = (value) => String(value ?? "").trim()
const num = (value) =>
  amount(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
// Helvetica me ₹ glyph nahi hota, isliye "Rs."
const money = (value) => `Rs. ${num(value)}`

const addressOf = (entity) =>
  [
    entity?.address,
    entity?.city,
    entity?.state,
    entity?.pincode ? `PIN ${entity.pincode}` : "",
  ]
    .map(clean)
    .filter(Boolean)
    .join(", ")

const safeFileName = (value) =>
  (clean(value) || "Invoice").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_")

// ---------- amount in words (Indian system) ----------
const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
]
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
const twoDigits = (n) =>
  n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`
const threeDigits = (n) =>
  `${n >= 100 ? ONES[Math.floor(n / 100)] + " Hundred" : ""}${
    n % 100 ? (n >= 100 ? " " : "") + twoDigits(n % 100) : ""
  }`

const amountInWords = (value) => {
  const total = Math.round(Math.abs(amount(value)) * 100)
  const rupees = Math.floor(total / 100)
  const paise = total % 100
  if (rupees === 0 && paise === 0) return "Rupees Zero Only"

  const parts = []
  const crore = Math.floor(rupees / 10000000)
  const lakh = Math.floor((rupees % 10000000) / 100000)
  const thousand = Math.floor((rupees % 100000) / 1000)
  const rest = rupees % 1000
  if (crore) parts.push(`${twoDigits(crore)} Crore`)
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`)
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`)
  if (rest) parts.push(threeDigits(rest))

  let words = `Rupees ${parts.join(" ") || "Zero"}`
  if (paise) words += ` and ${twoDigits(paise)} Paise`
  return `${words} Only`
}

// ---------- drawing helpers ----------
function setText(doc, { size = 8, bold = false, italic = false, color = COLORS.ink } = {}) {
  doc.setFont("helvetica", bold ? "bold" : italic ? "italic" : "normal")
  doc.setFontSize(size)
  doc.setTextColor(...color)
}

function wrapped(doc, text, x, y, maxWidth, lineHeight = 4) {
  const lines = doc.splitTextToSize(clean(text), maxWidth)
  doc.text(lines, x, y)
  return y + lines.length * lineHeight
}

// "Label: value" (label bold, value normal), returns next y
function kv(doc, label, value, x, y, maxWidth, size = 8) {
  setText(doc, { size, bold: true })
  doc.text(label, x, y)
  const w = doc.getTextWidth(label) + 1.5
  setText(doc, { size })
  const lines = doc.splitTextToSize(clean(value) || "-", Math.max(10, maxWidth - w))
  doc.text(lines[0], x + w, y)
  let yy = y + 4.2
  lines.slice(1).forEach((ln) => {
    doc.text(ln, x + w, yy)
    yy += 4.2
  })
  return yy
}

function addImageSafe(doc, data, x, y, w, h) {
  if (!data) return false
  try {
    doc.addImage(data, undefined, x, y, w, h)
    return true
  } catch {
    return false
  }
}

function drawPageFooter(doc, shop, shopName) {
  const pageCount = doc.getNumberOfPages()
  const pageHeight = doc.internal.pageSize.getHeight()
  const pageWidth = doc.internal.pageSize.getWidth()
  const regd = addressOf(shop)

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)

    doc.setDrawColor(...COLORS.line)
    doc.setLineWidth(0.25)
    doc.line(MARGIN, pageHeight - 16, pageWidth - MARGIN, pageHeight - 16)

    setText(doc, { size: 7.5, bold: true, color: COLORS.ink })
    doc.text("Thank you for your business!", MARGIN, pageHeight - 11.5)

    setText(doc, { size: 6.5, color: COLORS.muted })
    const line = regd ? `Regd. office: ${shopName}, ${regd}` : shopName
    doc.text(doc.splitTextToSize(line, 140).slice(0, 2), MARGIN, pageHeight - 8)

    setText(doc, { size: 7, bold: true, color: COLORS.ink })
    doc.text("E. & O.E.", pageWidth - MARGIN - 22, pageHeight - 11.5, { align: "right" })
    setText(doc, { size: 7, color: COLORS.muted })
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - MARGIN, pageHeight - 11.5, {
      align: "right",
    })
    doc.text("Computer-generated invoice", pageWidth - MARGIN, pageHeight - 8, {
      align: "right",
    })
  }
}

// ---------- item calculation ----------
function calcItem(item, bill, interstate) {
  const qty = amount(item?.quantity)
  const rate = amount(item?.rate)
  const disc = amount(item?.discount)
  const gst = amount(item?.gst_percent)
  const gross = amount(item?.gross_amount) || qty * rate
  const hasTotal =
    item?.total_amount !== undefined && item?.total_amount !== null && item?.total_amount !== ""
  const inclusive = Boolean(bill?.tax_inclusive)

  let taxable
  if (
    item?.taxable_amount !== undefined &&
    item?.taxable_amount !== null &&
    item?.taxable_amount !== ""
  ) {
    taxable = amount(item.taxable_amount)
  } else if (inclusive && hasTotal) {
    taxable = amount(item.total_amount) / (1 + gst / 100)
  } else if (inclusive) {
    taxable = (gross - disc) / (1 + gst / 100)
  } else {
    taxable = Math.max(0, gross - disc)
  }

  const explicit =
    item?.cgst_amount != null || item?.sgst_amount != null || item?.igst_amount != null
  let cgst, sgst, igst
  if (explicit) {
    cgst = amount(item.cgst_amount)
    sgst = amount(item.sgst_amount)
    igst = amount(item.igst_amount)
  } else {
    const tax = (taxable * gst) / 100
    igst = interstate ? tax : 0
    cgst = interstate ? 0 : tax / 2
    sgst = interstate ? 0 : tax / 2
  }

  const total = hasTotal ? amount(item.total_amount) : taxable + cgst + sgst + igst

  return {
    name: clean(item?.item_name) || "Item",
    description: clean(item?.description),
    hsn: clean(item?.hsn_code || item?.hsn || item?.hsn_sac),
    unit: clean(item?.unit),
    qty,
    gst,
    gross: r2(gross),
    disc: r2(disc),
    taxable: r2(taxable),
    cgst: r2(cgst),
    sgst: r2(sgst),
    igst: r2(igst),
    total: r2(total),
  }
}

// ---------- main builder ----------
function buildBillPDF(bill = {}, items = [], shop = {}, customer = {}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const contentWidth = pageWidth - MARGIN * 2
  if (typeof doc.setCharSpace === "function") doc.setCharSpace(0)

  const shopName = clean(shop?.name) || "Shop"
  const billNumber = clean(bill?.bill_number) || "Invoice"
  const billDate = bill?.bill_date ? formatDate(bill.bill_date) : "-"
  const dueDate = bill?.due_date ? formatDate(bill.due_date) : "-"
  const interstate = Boolean(bill?.is_interstate)

  const rows = (Array.isArray(items) ? items : []).map((it) => calcItem(it, bill, interstate))
  const sum = (key) => r2(rows.reduce((s, r) => s + r[key], 0))

  const subtotal = pick(bill?.subtotal, sum("gross"))
  const discount = pick(bill?.discount_amount, sum("disc"))
  const taxableAmt = pick(bill?.taxable_amount, sum("taxable"))
  const cgst = pick(bill?.cgst_amount, sum("cgst"))
  const sgst = pick(bill?.sgst_amount, sum("sgst"))
  const igst = pick(bill?.igst_amount, sum("igst"))
  const roundOff = amount(bill?.round_off)
  const grandTotal = pick(bill?.grand_total, sum("total"))
  const advance = amount(bill?.advance_adjusted)
  const paid = amount(bill?.amount_paid)
  const due = pick(bill?.amount_due, Math.max(0, grandTotal - advance - paid))
  const received = advance + paid
  const paymentMode = clean(bill?.payment_mode || bill?.payment_method)

  let y = 0
  const ensureSpace = (h) => {
    if (y + h > PAGE_BOTTOM) {
      doc.addPage()
      y = 20
    }
  }

  // ===== TITLE =====
  setText(doc, { size: 15, bold: true })
  doc.text("Tax Invoice", pageWidth / 2, 14, { align: "center" })

  // ===== SELLER (left) =====
  setText(doc, { size: 11, bold: true })
  doc.text(`Sold By: ${shopName}`, MARGIN, 23)

  setText(doc, { size: 8, color: COLORS.muted })
  let shopY = 28
  const shopAddress = addressOf(shop)
  if (shopAddress) shopY = wrapped(doc, shopAddress, MARGIN, shopY, 120, 4)

  const contacts = [
    shop?.mobile ? `Mobile: ${shop.mobile}` : "",
    shop?.email ? `Email: ${shop.email}` : "",
    shop?.website ? `Web: ${shop.website}` : "",
  ]
    .filter(Boolean)
    .join("  |  ")
  if (contacts) shopY = wrapped(doc, contacts, MARGIN, shopY, 120, 4)

  if (shop?.gstin) shopY = kv(doc, "GSTIN - ", shop.gstin, MARGIN, shopY + 0.5, 120)
  if (shop?.pan) shopY = kv(doc, "PAN - ", shop.pan, MARGIN, shopY, 120)

  // ===== INVOICE NUMBER BOX (right, dashed) =====
  const boxW = 62
  const boxX = pageWidth - MARGIN - boxW
  doc.setFillColor(...COLORS.soft)
  doc.setDrawColor(...COLORS.line)
  doc.setLineWidth(0.25)
  doc.roundedRect(boxX, 18, boxW, 18, 1.8, 1.8, "FD")

  setText(doc, { size: 7, bold: true, color: COLORS.muted })
  doc.text("INVOICE NUMBER", boxX + 4, 24)
  setText(doc, { size: 10.5, bold: true })
  doc.text(billNumber, boxX + 4, 31)
  const status = clean(bill?.payment_status || bill?.status)
  if (status) {
    setText(doc, { size: 7, bold: true, color: COLORS.muted })
    doc.text(`STATUS: ${status.toUpperCase()}`, boxX + 4, 34.5)
  }

  y = Math.max(shopY, 40) + 3
  doc.setDrawColor(...COLORS.ink)
  doc.setLineWidth(0.35)
  doc.line(MARGIN, y, pageWidth - MARGIN, y)

  // ===== DETAILS ROW: invoice info | bill to | ship to =====
  y += 6
  const colW = (contentWidth - 8) / 3
  const c1 = MARGIN
  const c2 = MARGIN + colW + 4
  const c3 = MARGIN + (colW + 4) * 2
  const topY = y
  const detailsBottom = topY + 30
  doc.setDrawColor(...COLORS.line)
  doc.setLineWidth(0.2)
  doc.line(c2 - 2, topY - 2, c2 - 2, detailsBottom)
  doc.line(c3 - 2, topY - 2, c3 - 2, detailsBottom)

  // column 1 - invoice info
  let y1 = topY
  y1 = kv(doc, "Invoice Date: ", billDate, c1, y1, colW)
  y1 = kv(doc, "Due Date: ", dueDate, c1, y1, colW)
  if (bill?.order_id) y1 = kv(doc, "Order ID: ", bill.order_id, c1, y1, colW)
  y1 = kv(
    doc,
    "Supply: ",
    interstate ? "Interstate (IGST)" : "Intrastate (CGST + SGST)",
    c1,
    y1,
    colW
  )
  const placeOfSupply = clean(bill?.place_of_supply || customer?.state || shop?.state)
  if (placeOfSupply) y1 = kv(doc, "Place of Supply: ", placeOfSupply, c1, y1, colW)
  if (paymentMode) y1 = kv(doc, "Payment: ", paymentMode, c1, y1, colW)

  // party column drawer
  const drawParty = (title, party, addressText, x) => {
    let yy = topY
    setText(doc, { size: 8.5, bold: true })
    doc.text(title, x, yy)
    yy += 4.6
    setText(doc, { size: 9, bold: true })
    doc.text(doc.splitTextToSize(clean(party?.name) || "Walk-in customer", colW)[0], x, yy)
    yy += 4.4
    setText(doc, { size: 8, color: COLORS.ink })
    if (addressText) yy = wrapped(doc, addressText, x, yy, colW, 3.9)
    const phone = clean(party?.mobile || party?.whatsapp)
    if (phone) {
      doc.text(`Phone: ${phone}`, x, yy)
      yy += 3.9
    }
    if (party?.gstin) {
      setText(doc, { size: 8, bold: true })
      doc.text(`GSTIN: ${clean(party.gstin)}`, x, yy)
      yy += 3.9
    }
    return yy
  }

  const billAddr = addressOf(customer)
  const shipAddr = clean(bill?.shipping_address || customer?.shipping_address) || billAddr
  const y2 = drawParty("Bill To", customer, billAddr, c2)
  const y3 = drawParty("Ship To", customer, shipAddr, c3)

  y = Math.max(y1, y2, y3) + 3

  // ===== ITEMS TABLE =====
  setText(doc, { size: 8, color: COLORS.muted })
  doc.text(`Total items: ${rows.length}`, MARGIN, y)
  y += 2

  const taxHead = interstate ? ["IGST"] : ["CGST", "SGST"]
  const taxCols = (r) => (interstate ? [num(r.igst)] : [num(r.cgst), num(r.sgst)])
  const head = [
    "#",
    "Item Description",
    "HSN/SAC",
    "Qty",
    "Gross Amt",
    "Discount",
    "Taxable Value",
    ...taxHead,
    "Total",
  ]

  const body = rows.length
    ? rows.map((r, i) => [
        String(i + 1),
        [r.name, r.description, `GST @ ${r.gst}%`].filter(Boolean).join("\n"),
        r.hsn || "-",
        `${r.qty} ${r.unit}`.trim(),
        num(r.gross),
        num(r.disc),
        num(r.taxable),
        ...taxCols(r),
        num(r.total),
      ])
    : [["-", "No item details available", ...Array(head.length - 2).fill("-")]]

  const totalQty = rows.reduce((s, r) => s + r.qty, 0)
  const foot = [
    "",
    "Total  (Amounts in Rs.)",
    "",
    String(totalQty),
    num(sum("gross")),
    num(sum("disc")),
    num(sum("taxable")),
    ...(interstate ? [num(sum("igst"))] : [num(sum("cgst")), num(sum("sgst"))]),
    num(sum("total")),
  ]

  const taxW = interstate ? 17 : 15
  const columnStyles = {
    0: { cellWidth: 7, halign: "center" },
    1: { cellWidth: "auto" },
    2: { cellWidth: 16, halign: "center" },
    3: { cellWidth: 12, halign: "right" },
    4: { cellWidth: 19, halign: "right" },
    5: { cellWidth: 16, halign: "right" },
    6: { cellWidth: 19, halign: "right" },
  }
  taxHead.forEach((_, i) => {
    columnStyles[7 + i] = { cellWidth: taxW, halign: "right" }
  })
  columnStyles[7 + taxHead.length] = { cellWidth: 21, halign: "right", fontStyle: "bold" }

  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    foot: [foot],
    showFoot: "lastPage",
    theme: "plain",
    margin: { left: MARGIN, right: MARGIN, bottom: 20, top: 16 },
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: { top: 2.6, bottom: 2.6, left: 1.8, right: 1.8 },
      textColor: COLORS.ink,
      lineWidth: 0,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: COLORS.white,
      textColor: COLORS.ink,
      fontStyle: "bold",
      fontSize: 6.8,
      cellPadding: { top: 3.2, bottom: 3.2, left: 1.8, right: 1.8 },
      lineColor: COLORS.line,
      lineWidth: { bottom: 0.45 },
    },
    footStyles: {
      fillColor: COLORS.soft,
      textColor: COLORS.ink,
      fontStyle: "bold",
      fontSize: 7.2,
      lineColor: COLORS.line,
      lineWidth: { top: 0.35 },
    },
    alternateRowStyles: { fillColor: COLORS.white },
    columnStyles,
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index >= 3) data.cell.styles.halign = "right"
      if (data.section === "head" && data.column.index === 2) data.cell.styles.halign = "center"
    },
    didDrawCell: (data) => {
      if (data.section === "body") {
        doc.setDrawColor(...COLORS.line)
        doc.setLineWidth(0.18)
        doc.line(
          data.cell.x,
          data.cell.y + data.cell.height,
          data.cell.x + data.cell.width,
          data.cell.y + data.cell.height
        )
      }
    },
    didDrawPage: () => {
      if (doc.internal.getCurrentPageInfo().pageNumber > 1) {
        setText(doc, { size: 8, bold: true, color: COLORS.muted })
        doc.text(`${billNumber} - continued`, MARGIN, 10)
      }
    },
  })

  y = (doc.lastAutoTable?.finalY || y) + 7

  // ===== SUMMARY (right) + WORDS/BANK/NOTES (left) =====
  const summaryRows = [
    { label: "Subtotal", value: money(subtotal) },
    ...(discount > 0 ? [{ label: "Discount", value: `- ${money(discount)}` }] : []),
    { label: "Taxable amount", value: money(taxableAmt) },
    ...(cgst > 0 ? [{ label: "CGST", value: money(cgst) }] : []),
    ...(sgst > 0 ? [{ label: "SGST", value: money(sgst) }] : []),
    ...(igst > 0 ? [{ label: "IGST", value: money(igst) }] : []),
    ...(roundOff !== 0 ? [{ label: "Round off", value: money(roundOff) }] : []),
    { label: "Grand Total", value: money(grandTotal), type: "grand" },
    ...(advance > 0 ? [{ label: "Advance adjusted", value: `- ${money(advance)}` }] : []),
    ...(paid > 0 ? [{ label: "Payments received", value: `- ${money(paid)}` }] : []),
    { label: "Balance Due", value: money(due), type: "due" },
  ]

  const rowH = (r) => (r.type === "grand" ? 10 : r.type === "due" ? 8 : 5.8)
  const summaryHeight = summaryRows.reduce((s, r) => s + rowH(r), 0) + 4
  const summaryWidth = 84
  const summaryX = pageWidth - MARGIN - summaryWidth

  ensureSpace(Math.max(summaryHeight, 40))

  doc.setDrawColor(...COLORS.line)
  doc.setLineWidth(0.25)
  doc.rect(summaryX, y, summaryWidth, summaryHeight, "S")

  let sy = y + 2
  summaryRows.forEach((r) => {
    const h = rowH(r)
    const mid = sy + h / 2 + 1.1

    if (r.type === "grand") {
      doc.setFillColor(...COLORS.primary)
      doc.rect(summaryX + 1.5, sy, summaryWidth - 3, h - 1, "F")
      setText(doc, { size: 9.5, bold: true, color: COLORS.white })
    } else if (r.type === "due") {
      doc.setFillColor(...COLORS.soft)
      doc.rect(summaryX + 1.5, sy, summaryWidth - 3, h - 0.5, "F")
      setText(doc, { size: 8.5, bold: true })
    } else {
      setText(doc, { size: 8 })
    }
    doc.text(r.label, summaryX + 5, mid)
    doc.text(r.value, summaryX + summaryWidth - 5, mid, { align: "right" })
    sy += h
  })

  // left side
  const leftW = summaryX - MARGIN - 8
  let ly = y + 3
  setText(doc, { size: 7.5, bold: true, color: COLORS.muted })
  doc.text("AMOUNT IN WORDS", MARGIN, ly)
  ly += 4.5
  setText(doc, { size: 9, bold: true })
  ly = wrapped(doc, amountInWords(grandTotal), MARGIN, ly, leftW, 4.4) + 2

  const hasBank = shop?.bank_name || shop?.bank_account || shop?.upi_id
  if (hasBank) {
    ly += 1
    setText(doc, { size: 7.5, bold: true, color: COLORS.muted })
    doc.text("BANK / PAYMENT DETAILS", MARGIN, ly)
    ly += 4.2
    if (shop?.bank_name) ly = kv(doc, "Bank: ", shop.bank_name, MARGIN, ly, leftW, 7.5)
    if (shop?.bank_account) ly = kv(doc, "A/c No: ", shop.bank_account, MARGIN, ly, leftW, 7.5)
    if (shop?.bank_ifsc) ly = kv(doc, "IFSC: ", shop.bank_ifsc, MARGIN, ly, leftW, 7.5)
    if (shop?.upi_id) ly = kv(doc, "UPI: ", shop.upi_id, MARGIN, ly, leftW, 7.5)
  }

  if (clean(bill?.notes)) {
    ly += 1
    setText(doc, { size: 7.5, bold: true, color: COLORS.muted })
    doc.text("NOTES", MARGIN, ly)
    ly += 4.2
    setText(doc, { size: 7.5, color: COLORS.ink })
    ly = wrapped(doc, bill.notes, MARGIN, ly, leftW, 3.8)
  }

  y = Math.max(ly, y + summaryHeight) + 6

  // ===== TAX SUMMARY TABLE =====
  const groups = {}
  rows.forEach((r) => {
    const key = `${r.hsn}|${r.gst}`
    if (!groups[key])
      groups[key] = { hsn: r.hsn, gst: r.gst, taxable: 0, cgst: 0, sgst: 0, igst: 0 }
    groups[key].taxable += r.taxable
    groups[key].cgst += r.cgst
    groups[key].sgst += r.sgst
    groups[key].igst += r.igst
  })
  const groupList = Object.values(groups)

  if (groupList.length) {
    ensureSpace(14 + groupList.length * 7)
    {
      doc.setDrawColor(...COLORS.line)
      doc.setLineWidth(0.25)
      doc.line(MARGIN, y - 2, pageWidth - MARGIN, y - 2)
    }
    setText(doc, { size: 7.5, bold: true, color: COLORS.muted })
    doc.text("TAX SUMMARY", MARGIN, y)

    const tHead = [
      "HSN/SAC",
      "GST Rate",
      "Taxable Value",
      ...(interstate ? ["IGST"] : ["CGST", "SGST"]),
      "Total Tax",
    ]
    const tBody = groupList.map((g) => [
      g.hsn || "-",
      `${g.gst}%`,
      num(g.taxable),
      ...(interstate ? [num(g.igst)] : [num(g.cgst), num(g.sgst)]),
      num(g.cgst + g.sgst + g.igst),
    ])

    autoTable(doc, {
      startY: y + 2,
      head: [tHead],
      body: tBody,
      theme: "plain",
      margin: { left: MARGIN, right: MARGIN, bottom: 20, top: 16 },
      tableWidth: contentWidth,
      styles: { fontSize: 7.5, cellPadding: 2, textColor: COLORS.ink, lineWidth: 0 },
      headStyles: { fillColor: COLORS.soft, textColor: COLORS.ink, fontStyle: "bold", fontSize: 7 },
      columnStyles: Object.fromEntries(
        tHead.map((_, i) => [i, { halign: i === 0 ? "left" : "right" }])
      ),
      didParseCell: (data) => {
        if (data.section === "head" && data.column.index > 0) data.cell.styles.halign = "right"
      },
      didDrawCell: (data) => {
        doc.setDrawColor(...COLORS.line)
        doc.setLineWidth(0.15)
        doc.line(
          data.cell.x,
          data.cell.y + data.cell.height,
          data.cell.x + data.cell.width,
          data.cell.y + data.cell.height
        )
      },
    })
    y = (doc.lastAutoTable?.finalY || y) + 7
  }

  // ===== PAYMENT DETAILS =====
  if (received > 0 || paymentMode) {
    ensureSpace(14)
    setText(doc, { size: 7.5, bold: true, color: COLORS.muted })
    doc.text("PAYMENT DETAILS", MARGIN, y)
    y += 4.5
    setText(doc, { size: 8, color: COLORS.ink })
    const paymentLine = [
      `Total received: ${money(received)}`,
      paymentMode ? `Mode: ${paymentMode}` : "",
      `Outstanding: ${money(due)}`,
    ]
      .filter(Boolean)
      .join("   |   ")
    y = wrapped(doc, paymentLine, MARGIN, y, contentWidth, 4) + 4
  }

  // ===== TERMS (left) + SIGNATURE (right) =====
  ensureSpace(36)
  doc.setDrawColor(...COLORS.line)
  doc.setLineWidth(0.25)
  doc.line(MARGIN, y, pageWidth - MARGIN, y)
  y += 5

  const termsText =
    clean(bill?.terms || shop?.terms) ||
    [
      "1. Goods once sold will not be taken back or exchanged.",
      "2. Please keep this invoice for warranty / return purposes.",
      shop?.city ? `3. Subject to ${clean(shop.city)} jurisdiction only.` : "",
    ]
      .filter(Boolean)
      .join("\n")

  setText(doc, { size: 7.5, bold: true, color: COLORS.muted })
  doc.text("TERMS & CONDITIONS", MARGIN, y)
  setText(doc, { size: 7.5, color: COLORS.ink })
  const termsLines = termsText.split("\n").flatMap((l) => doc.splitTextToSize(l, 105))
  doc.text(termsLines, MARGIN, y + 4.5)

  const sigRight = pageWidth - MARGIN
  setText(doc, { size: 8.5, bold: true })
  doc.text(`For ${shopName}`, sigRight, y, { align: "right" })
  addImageSafe(doc, shop?.signature, sigRight - 38, y + 2, 38, 14)

  doc.setDrawColor(...COLORS.muted)
  doc.setLineWidth(0.25)
  doc.line(sigRight - 55, y + 20, sigRight, y + 20)
  setText(doc, { size: 7.5, color: COLORS.muted })
  doc.text("Authorised Signatory", sigRight, y + 24, { align: "right" })

  drawPageFooter(doc, shop, shopName)
  return doc
}

// ===== DOWNLOAD PDF =====
export function generateBillPDF(bill, items, shop, customer) {
  const doc = buildBillPDF(bill, items, shop, customer)
  doc.save(`${safeFileName(bill?.bill_number)}.pdf`)
  return doc
}

// ===== CREATE PDF BLOB =====
export function createBillPDFBlob(bill, items, shop, customer) {
  const doc = buildBillPDF(bill, items, shop, customer)
  return doc.output("blob")
}

// ===== SHARE COMPLETE PDF =====
export async function shareBillPDF(bill, items, shop, customer) {
  const blob = createBillPDFBlob(bill, items, shop, customer)
  const fileName = `${safeFileName(bill?.bill_number)}.pdf`
  const file = new File([blob], fileName, { type: "application/pdf" })

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    await navigator.share({
      files: [file],
      title: `Invoice ${clean(bill?.bill_number)}`,
      text: `Invoice from ${clean(shop?.name) || "our shop"}`,
    })
    return { shared: true, fileName }
  }

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)

  return { shared: false, downloaded: true, fileName }
}