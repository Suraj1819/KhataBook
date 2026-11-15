
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

const COLORS = {
  ink: [24, 29, 50],
  muted: [103, 110, 128],
  line: [218, 222, 232],
  soft: [246, 247, 251],
  violet: [91, 74, 160],
  green: [16, 132, 94],
  red: [190, 55, 75],
}

const num = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const money = (value) =>
  `Rs. ${num(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const clean = (value, fallback = "—") => {
  const result = String(value ?? "").trim()
  return result || fallback
}

const formatDate = (value) => {
  if (!value) return "—"
  const raw = String(value).slice(0, 10)
  const parts = raw.split("-")
  return parts.length === 3
    ? `${parts[2]}/${parts[1]}/${parts[0]}`
    : raw
}

const entryLabel = (entry) => {
  const labels = {
    you_gave: "You gave (credit)",
    customer_paid: "Customer payment",
    new_due: "New due",
    advance_received: "Advance received",
    advance_returned: "Advance returned",
  }

  return labels[entry?.entry_type] ||
    clean(entry?.entry_type, "Transaction")
}

const safeFileName = (value) =>
  String(value || "Customer")
    .trim()
    .replace(/[^\w-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "Customer"

function drawPageHeader(
  doc,
  { shop = {}, customer = {}, periodLabel = "All time" } = {}
) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const left = 13
  const right = pageWidth - 13

  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.setTextColor(...COLORS.ink)
  doc.text(clean(shop.name, "Business"), left, 16)

  const shopDetails = [
    shop.address,
    [shop.city, shop.state, shop.pincode]
      .filter(Boolean)
      .join(", "),
    shop.mobile ? `Mobile: ${shop.mobile}` : "",
    shop.email ? `Email: ${shop.email}` : "",
    shop.gstin ? `GSTIN: ${shop.gstin}` : "",
  ].filter(Boolean)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(...COLORS.muted)

  if (shopDetails.length) {
    doc.text(shopDetails.join("  |  "), left, 22, {
      maxWidth: right - left,
    })
  }

  doc.setDrawColor(...COLORS.line)
  doc.line(left, 27, right, 27)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.setTextColor(...COLORS.ink)
  doc.text("CUSTOMER KHATA STATEMENT", left, 35)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.muted)
  doc.text(`Period: ${clean(periodLabel, "All time")}`, left, 41)
  doc.text(
    `Generated: ${formatDate(new Date().toISOString())}`,
    right,
    41,
    { align: "right" }
  )

  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.violet)
  doc.text(clean(customer.name, "Customer"), left, 50)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(...COLORS.muted)

  const profile = [
    customer.mobile ? `Mobile: ${customer.mobile}` : "",
    customer.email ? `Email: ${customer.email}` : "",
    customer.address,
    customer.pin_code ? `PIN: ${customer.pin_code}` : "",
    customer.gstin ? `GSTIN: ${customer.gstin}` : "",
    customer.customer_type
      ? `Type: ${customer.customer_type}`
      : "",
  ].filter(Boolean)

  if (profile.length) {
    doc.text(profile.join("  |  "), left, 55, {
      maxWidth: right - left,
    })
  }

  return profile.length ? 64 : 59
}

function drawSummaryCards(doc, y, summary, customer) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const left = 13
  const gap = 4
  const cardWidth = (pageWidth - 26 - gap * 3) / 4

  const items = [
    ["Opening balance", money(Math.abs(num(summary.opening)))],
    ["You gave", money(summary.gave)],
    ["You received", money(summary.received)],
    ["Closing balance", money(Math.abs(num(summary.closing)))],
  ]

  items.forEach(([label, value], index) => {
    const x = left + index * (cardWidth + gap)

    doc.setFillColor(...COLORS.soft)
    doc.setDrawColor(...COLORS.line)
    doc.roundedRect(x, y, cardWidth, 17, 2, 2, "FD")

    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.setTextColor(...COLORS.muted)
    doc.text(label, x + 3, y + 6)

    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.setTextColor(...COLORS.ink)
    doc.text(value, x + 3, y + 12.5)
  })

  const closing = num(summary.closing)

  const status =
    closing > 0
      ? "Amount receivable"
      : closing < 0
        ? "Advance held"
        : "Account settled"

  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(
    ...(closing > 0
      ? COLORS.red
      : closing < 0
        ? COLORS.violet
        : COLORS.green)
  )

  doc.text(
    `${status}: ${money(Math.abs(closing))}`,
    left,
    y + 23
  )

  const details = [
    `Total entries: ${num(summary.entries?.length).toLocaleString("en-IN")}`,
    `Customer since: ${formatDate(customer.since)}`,
    `Last transaction: ${formatDate(customer.lastEntry)}`,
  ]

  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)
  doc.setTextColor(...COLORS.muted)
  doc.text(details.join("    |    "), left, y + 29)

  return y + 35
}

function addTable(doc, startY, head, body, options = {}) {
  autoTable(doc, {
    startY,
    head: [head],
    body,
    margin: {
      left: 13,
      right: 13,
      top: 13,
      bottom: 15,
    },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.2,
      cellPadding: 2.4,
      textColor: COLORS.ink,
      lineColor: COLORS.line,
      lineWidth: 0.15,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: COLORS.soft,
      textColor: COLORS.ink,
      fontStyle: "bold",
      lineColor: COLORS.line,
    },
    alternateRowStyles: {
      fillColor: [251, 251, 253],
    },
    ...options,
  })

  return doc.lastAutoTable?.finalY || startY
}

function addFooter(doc, shopName) {
  const pages = doc.getNumberOfPages()

  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)

    const width = doc.internal.pageSize.getWidth()
    const height = doc.internal.pageSize.getHeight()

    doc.setDrawColor(...COLORS.line)
    doc.line(13, height - 10, width - 13, height - 10)

    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.setTextColor(...COLORS.muted)

    doc.text(clean(shopName, "Business"), 13, height - 6)
    doc.text(
      `Page ${page} of ${pages}`,
      width - 13,
      height - 6,
      { align: "right" }
    )
  }
}

function makeTransactionRows(entries) {
  return entries.map((entry, index) => {
    const debit = Boolean(entry.debit)
    const amount = num(entry.amount)
    const balance = num(entry.running)

    const balanceLabel =
      balance > 0
        ? `${money(balance)} Due`
        : balance < 0
          ? `${money(Math.abs(balance))} Advance`
          : "Settled"

    return [
      index + 1,
      formatDate(entry.entry_date),
      entryLabel(entry),
      debit ? money(amount) : "—",
      debit ? "—" : money(amount),
      balanceLabel,
      formatDate(entry.due_date),
      clean(entry.notes, ""),
    ]
  })
}

export function generateKhataDetailsPDF({
  customer = {},
  entries = [],
  summary = {},
  shop = {},
  periodLabel = "All time",
} = {}) {
  const safeEntries = Array.isArray(entries) ? entries : []

  if (!safeEntries.length) {
    throw new Error(
      "There are no transactions in the selected period to export."
    )
  }

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  })

  let y = drawPageHeader(doc, {
    shop,
    customer,
    periodLabel,
  })

  y = drawSummaryCards(
    doc,
    y + 2,
    { ...summary, entries: safeEntries },
    customer
  )

  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.ink)
  doc.text("TRANSACTION DETAILS", 13, y + 1)

  addTable(
    doc,
    y + 5,
    [
      "#",
      "Date",
      "Transaction type",
      "Debit / Given",
      "Credit / Received",
      "Balance after entry",
      "Due date",
      "Notes",
    ],
    makeTransactionRows(safeEntries),
    {
      styles: {
        fontSize: 6.8,
        cellPadding: 2.2,
      },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: 21 },
        2: { cellWidth: 38 },
        3: { cellWidth: 28, halign: "right" },
        4: { cellWidth: 28, halign: "right" },
        5: { cellWidth: 37, halign: "right" },
        6: { cellWidth: 21 },
        7: { cellWidth: "auto" },
      },
    }
  )

  addFooter(doc, shop.name)

  return doc
}

export function downloadKhataDetailsPDF(options = {}) {
  const doc = generateKhataDetailsPDF(options)

  const datePart = new Date().toISOString().slice(0, 10)
  const customerName = safeFileName(options.customer?.name)

  doc.save(
    `${customerName}_Khata_Details_${datePart}.pdf`
  )

  return doc
}

export default downloadKhataDetailsPDF
