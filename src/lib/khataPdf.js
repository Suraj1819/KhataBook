
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

const PAGE = { left: 12, right: 12, top: 14, bottom: 14 }

const COLORS = {
  ink: [25, 31, 51],
  muted: [105, 112, 128],
  line: [218, 222, 232],
  soft: [246, 247, 251],
  accent: [16, 132, 94],
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

const safe = (value, fallback = "—") => {
  const result = String(value ?? "").trim()
  return result || fallback
}

const date = (value) => {
  if (!value) return "—"

  const raw = String(value).slice(0, 10)
  const parts = raw.split("-")

  if (parts.length !== 3) return raw

  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

const isDebit = (type) =>
  ["you_gave", "new_due", "advance_returned"].includes(type)

const isDebitEntry = (entry) => isDebit(entry?.entry_type)

const entryLabel = (type) => ({
  you_gave: "You gave (credit)",
  customer_paid: "Customer paid",
  new_due: "New due",
  advance_received: "Advance received",
  advance_returned: "Advance returned",
}[type] || safe(type, "Entry"))

function safeFileName(value) {
  return String(value || "Khata")
    .trim()
    .replace(/[^\w\-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 70) || "Khata"
}

function drawHeader(doc, shop, periodLabel) {
  const shopName = safe(shop?.name, "Business")

  doc.setFont("helvetica", "bold")
  doc.setFontSize(17)
  doc.setTextColor(...COLORS.ink)
  doc.text(shopName, PAGE.left, 17)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.muted)

  const details = [
    shop?.address,
    [shop?.city, shop?.state, shop?.pincode]
      .filter(Boolean)
      .join(", "),
    shop?.mobile ? `Mobile: ${shop.mobile}` : "",
    shop?.email ? `Email: ${shop.email}` : "",
    shop?.gstin ? `GSTIN: ${shop.gstin}` : "",
  ].filter(Boolean)

  if (details.length) {
    doc.text(details.join("  |  "), PAGE.left, 23, {
      maxWidth: 270,
    })
  }

  doc.setDrawColor(...COLORS.line)
  doc.line(PAGE.left, 29, 285, 29)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.setTextColor(...COLORS.ink)
  doc.text("CUSTOMER KHATA REPORT", PAGE.left, 37)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.muted)

  doc.text(
    `Period: ${safe(periodLabel, "All time")}  |  Generated: ${date(new Date().toISOString())}`,
    PAGE.left,
    43
  )

  return 50
}

function drawFooter(doc, shopName) {
  const pages = doc.getNumberOfPages()

  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)

    const height = doc.internal.pageSize.getHeight()

    doc.setDrawColor(...COLORS.line)
    doc.line(PAGE.left, height - 10, 285, height - 10)

    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.setTextColor(...COLORS.muted)

    doc.text(safe(shopName, "Business"), PAGE.left, height - 6)
    doc.text(`Page ${page} of ${pages}`, 285, height - 6, {
      align: "right",
    })
  }
}

function table(doc, startY, head, body, options = {}) {
  autoTable(doc, {
    startY,
    head: [head],
    body,
    margin: {
      left: PAGE.left,
      right: PAGE.right,
      bottom: 16,
    },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: 2.5,
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

export function generateKhataPDF({
  customers = [],
  entries = [],
  shop = {},
  periodLabel = "All time",
} = {}) {
  const normalizedCustomers = Array.isArray(customers)
    ? customers
    : []

  const normalizedEntries = Array.isArray(entries)
    ? entries
    : []

  if (!normalizedEntries.length) {
    throw new Error(
      "No khata entries are available for this report."
    )
  }

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  })

  const shopName = safe(shop?.name, "Business")
  let y = drawHeader(doc, shop, periodLabel)

  const totalDue = normalizedCustomers.reduce(
    (sum, customer) =>
      sum + Math.max(0, num(customer.balance)),
    0
  )

  const totalAdvance = normalizedCustomers.reduce(
    (sum, customer) =>
      sum + Math.max(0, -num(customer.balance)),
    0
  )

  const cards = [
    ["Customers", normalizedCustomers.length],
    ["Entries", normalizedEntries.length],
    ["Total due", money(totalDue)],
    ["Advance held", money(totalAdvance)],
  ]

  const gap = 4
  const cardWidth = (261 - gap * 3) / 4

  cards.forEach(([label, value], index) => {
    const x = PAGE.left + index * (cardWidth + gap)

    doc.setFillColor(...COLORS.soft)
    doc.setDrawColor(...COLORS.line)
    doc.roundedRect(x, y, cardWidth, 17, 2, 2, "FD")

    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.setTextColor(...COLORS.muted)
    doc.text(String(label), x + 4, y + 6)

    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.setTextColor(...COLORS.ink)
    doc.text(String(value), x + 4, y + 12.5)
  })

  y += 24

  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.ink)
  doc.text("CUSTOMER BALANCE SUMMARY", PAGE.left, y)

  y += 3

  y = table(
    doc,
    y,
    [
      "#",
      "Customer",
      "Mobile",
      "Address",
      "Entries",
      "Debit / Given",
      "Credit / Received",
      "Current Balance",
      "Position",
    ],
    normalizedCustomers.map((customer, index) => {
      const customerEntries = Array.isArray(customer.entries)
        ? customer.entries
        : []

      const debit = customerEntries
        .filter(isDebitEntry)
        .reduce(
          (sum, entry) => sum + num(entry.amount),
          0
        )

      const credit = customerEntries
        .filter((entry) => !isDebitEntry(entry))
        .reduce(
          (sum, entry) => sum + num(entry.amount),
          0
        )

      const balance = num(customer.balance)

      return [
        index + 1,
        safe(customer.name),
        safe(customer.mobile),
        safe(customer.address),
        customerEntries.length,
        money(debit),
        money(credit),
        money(Math.abs(balance)),
        balance > 0
          ? "Due"
          : balance < 0
            ? "Advance"
            : "Settled",
      ]
    }),
    {
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: 36, fontStyle: "bold" },
        2: { cellWidth: 25 },
        3: { cellWidth: 48 },
        4: { cellWidth: 14, halign: "right" },
        5: { cellWidth: 27, halign: "right" },
        6: { cellWidth: 27, halign: "right" },
        7: {
          cellWidth: 27,
          halign: "right",
          fontStyle: "bold",
        },
        8: { cellWidth: 18 },
      },
    }
  ) + 9

  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.ink)
  doc.text("TRANSACTION LEDGER", PAGE.left, y)

  y += 3

  table(
    doc,
    y,
    [
      "#",
      "Date",
      "Customer",
      "Mobile",
      "Transaction",
      "Debit",
      "Credit",
      "Balance After Entry",
      "Due Date",
      "Notes",
    ],
    normalizedEntries
      .slice()
      .sort(
        (a, b) =>
          String(a.entry_date || "").localeCompare(
            String(b.entry_date || "")
          ) ||
          new Date(a.created_at || 0).getTime() -
            new Date(b.created_at || 0).getTime()
      )
      .map((entry, index) => {
        const debit = isDebitEntry(entry)

        return [
          index + 1,
          date(entry.entry_date),
          safe(entry.customer_name),
          safe(entry.mobile),
          entryLabel(entry.entry_type),
          debit ? money(entry.amount) : "—",
          debit ? "—" : money(entry.amount),
          entry.balance_after == null
            ? "—"
            : money(Math.abs(entry.balance_after)),
          date(entry.due_date),
          safe(entry.notes, ""),
        ]
      }),
    {
      styles: {
        fontSize: 6.8,
        cellPadding: 2.1,
      },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: 19 },
        2: { cellWidth: 34 },
        3: { cellWidth: 23 },
        4: { cellWidth: 34 },
        5: { cellWidth: 23, halign: "right" },
        6: { cellWidth: 23, halign: "right" },
        7: { cellWidth: 27, halign: "right" },
        8: { cellWidth: 19 },
        9: { cellWidth: 46 },
      },
    }
  )

  drawFooter(doc, shopName)

  return doc
}

export function downloadKhataPDF(options = {}) {
  const doc = generateKhataPDF(options)

  const shopName = safe(options.shop?.name, "Business")
  const datePart = new Date().toISOString().slice(0, 10)

  doc.save(
    `${safeFileName(shopName)}_Customer_Khata_${datePart}.pdf`
  )

  return doc
}

export default downloadKhataPDF
