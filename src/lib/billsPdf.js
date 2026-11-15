
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { formatDate } from "./utils"

// =====================================================
// KHAATAPRO - MONOCHROME BILLS STATEMENT PDF
// =====================================================

const COLORS = {
  ink: [0, 0, 0],
  muted: [85, 85, 85],
  soft: [245, 245, 245],
  line: [190, 190, 190],
  primary: [0, 0, 0],
  white: [255, 255, 255],
  paid: [0, 0, 0],
  partial: [0, 0, 0],
  unpaid: [0, 0, 0],
}

const MARGIN = 10

// =====================================================
// HELPERS
// =====================================================

const amount = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const r2 = (value) =>
  Math.round((value + Number.EPSILON) * 100) / 100

const clean = (value) => String(value ?? "").trim()

const pick = (value, fallback) =>
  value === undefined || value === null || value === ""
    ? fallback
    : amount(value)

const money = (value) =>
  `Rs. ${amount(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const safeFileName = (value) =>
  (clean(value) || "Bills_Statement")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")

function setText(
  doc,
  {
    size = 8,
    bold = false,
    color = COLORS.ink,
  } = {}
) {
  doc.setFont("helvetica", bold ? "bold" : "normal")
  doc.setFontSize(size)
  doc.setTextColor(...color)
}

function getCustomer(bill) {
  return bill?.customers || bill?.customer || {}
}

function getBillTotal(bill) {
  return amount(bill?.grand_total ?? bill?.total)
}

function getBillAdvance(bill) {
  return amount(bill?.advance_adjusted)
}

function getBillReceived(bill) {
  return amount(bill?.amount_paid)
}

function getBillDue(bill) {
  const total = getBillTotal(bill)
  const advance = getBillAdvance(bill)
  const received = getBillReceived(bill)

  const fallback = Math.max(
    0,
    total - advance - received
  )

  return Math.max(
    0,
    pick(bill?.amount_due ?? bill?.due, fallback)
  )
}

function getBillCategory(bill) {
  const total = getBillTotal(bill)
  const advance = getBillAdvance(bill)
  const received = getBillReceived(bill)
  const due = getBillDue(bill)

  const paidAmount = advance + received

  if (due <= 0 || (total > 0 && paidAmount >= total)) {
    return "paid"
  }

  if (paidAmount <= 0) {
    return "unpaid"
  }

  return "partial"
}

function getStatusLabel(category) {
  if (category === "paid") return "PAID"
  if (category === "partial") return "PARTIAL"
  return "UNPAID"
}

// =====================================================
// GROUP BILLS
// =====================================================

function groupBills(bills) {
  const groups = {
    paid: [],
    partial: [],
    unpaid: [],
  }

  bills.forEach((bill) => {
    const category = getBillCategory(bill)
    groups[category].push(bill)
  })

  return groups
}

// =====================================================
// SECTION TABLE
// =====================================================

function drawSection(
  doc,
  {
    title,
    bills,
    startY,
    margin,
    contentWidth,
    pageHeight,
  }
) {
  let y = startY

  if (y + 28 > pageHeight - 18) {
    doc.addPage()
    y = 18
  }

  // Black section heading
  doc.setFillColor(...COLORS.primary)

  doc.roundedRect(
    margin,
    y,
    contentWidth,
    10,
    1.5,
    1.5,
    "F"
  )

  setText(doc, {
    size: 9,
    bold: true,
    color: COLORS.white,
  })

  doc.text(
    `${title} (${bills.length})`,
    margin + 4,
    y + 6.5
  )

  y += 13

  const body = bills.map((bill, index) => {
    const customer = getCustomer(bill)

    const total = getBillTotal(bill)
    const advance = getBillAdvance(bill)
    const received = getBillReceived(bill)
    const due = getBillDue(bill)

    const billDate = bill?.bill_date
      ? formatDate(bill.bill_date)
      : "-"

    return [
      String(index + 1),
      clean(bill?.bill_number) || "-",
      billDate,
      clean(customer?.name) || "Walk-in Customer",
      clean(customer?.mobile) || "-",
      money(total),
      money(advance),
      money(received),
      money(due),
      getStatusLabel(getBillCategory(bill)),
    ]
  })

  autoTable(doc, {
    startY: y,

    head: [[
      "#",
      "BILL NO.",
      "BILL DATE",
      "CUSTOMER",
      "MOBILE",
      "BILL TOTAL",
      "ADVANCE",
      "RECEIVED",
      "BALANCE DUE",
      "STATUS",
    ]],

    body: body.length
      ? body
      : [[
          "-",
          "-",
          "-",
          `No ${title.toLowerCase()} found`,
          "-",
          money(0),
          money(0),
          money(0),
          money(0),
          "-",
        ]],

    theme: "grid",

    margin: {
      left: margin,
      right: margin,
      top: 16,
      bottom: 19,
    },

    styles: {
      font: "helvetica",
      fontSize: 7,
      cellPadding: 2.4,
      textColor: COLORS.ink,
      lineColor: COLORS.line,
      lineWidth: 0.15,
      overflow: "linebreak",
      valign: "middle",
    },

    headStyles: {
      fillColor: COLORS.primary,
      textColor: COLORS.white,
      fontStyle: "bold",
      fontSize: 6.7,
      cellPadding: 2.8,
    },

    alternateRowStyles: {
      fillColor: COLORS.soft,
    },

    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 23 },
      2: { cellWidth: 23 },
      3: { cellWidth: 42 },
      4: { cellWidth: 25 },
      5: { cellWidth: 27, halign: "right" },
      6: { cellWidth: 23, halign: "right" },
      7: { cellWidth: 23, halign: "right" },
      8: {
        cellWidth: 27,
        halign: "right",
        fontStyle: "bold",
      },
      9: {
        cellWidth: "auto",
        halign: "center",
      },
    },

    didDrawPage: () => {
      const page = doc.internal.getCurrentPageInfo().pageNumber

      if (page > 1) {
        setText(doc, {
          size: 8,
          bold: true,
          color: COLORS.muted,
        })

        doc.text(
          "KHAATAPRO - Bills Statement (Continued)",
          margin,
          10
        )
      }
    },
  })

  return (doc.lastAutoTable?.finalY || y) + 9
}

// =====================================================
// SUMMARY BOX
// =====================================================

function drawSummary(
  doc,
  bills,
  startY,
  pageWidth,
  pageHeight
) {
  const margin = MARGIN

  const totalBilled = r2(
    bills.reduce(
      (sum, bill) => sum + getBillTotal(bill),
      0
    )
  )

  const totalAdvance = r2(
    bills.reduce(
      (sum, bill) => sum + getBillAdvance(bill),
      0
    )
  )

  const totalReceived = r2(
    bills.reduce(
      (sum, bill) => sum + getBillReceived(bill),
      0
    )
  )

  const totalDue = r2(
    bills.reduce(
      (sum, bill) => sum + getBillDue(bill),
      0
    )
  )

  const paidCount = bills.filter(
    (bill) => getBillCategory(bill) === "paid"
  ).length

  const partialCount = bills.filter(
    (bill) => getBillCategory(bill) === "partial"
  ).length

  const unpaidCount = bills.filter(
    (bill) => getBillCategory(bill) === "unpaid"
  ).length

  const summaryRows = [
    { label: "Total Bills", value: String(bills.length) },
    { label: "Paid Bills", value: String(paidCount) },
    { label: "Partially Paid Bills", value: String(partialCount) },
    { label: "Unpaid Bills", value: String(unpaidCount) },
    { label: "Total Billed", value: money(totalBilled) },
    { label: "Advance Adjusted", value: money(totalAdvance) },
    { label: "Payments Received", value: money(totalReceived) },
    {
      label: "Grand Total",
      value: money(totalBilled),
      type: "grand",
    },
    {
      label: "Outstanding Balance",
      value: money(totalDue),
      type: "due",
    },
  ]

  const rowHeight = (row) => {
    if (row.type === "grand") return 10
    if (row.type === "due") return 9
    return 6
  }

  const boxHeight =
    summaryRows.reduce(
      (sum, row) => sum + rowHeight(row),
      0
    ) + 5

  let y = startY

  if (y + boxHeight > pageHeight - 19) {
    doc.addPage()
    y = 18
  }

  const boxWidth = 91
  const boxX = pageWidth - margin - boxWidth

  doc.setDrawColor(...COLORS.line)
  doc.setLineWidth(0.3)

  doc.roundedRect(
    boxX,
    y,
    boxWidth,
    boxHeight,
    1.5,
    1.5,
    "S"
  )

  let sy = y + 2

  summaryRows.forEach((row) => {
    const h = rowHeight(row)
    const mid = sy + h / 2 + 1.1

    if (row.type === "grand") {
      doc.setFillColor(...COLORS.primary)

      doc.rect(
        boxX + 1.5,
        sy,
        boxWidth - 3,
        h - 1,
        "F"
      )

      setText(doc, {
        size: 9,
        bold: true,
        color: COLORS.white,
      })
    } else if (row.type === "due") {
      doc.setFillColor(...COLORS.soft)

      doc.rect(
        boxX + 1.5,
        sy,
        boxWidth - 3,
        h - 1,
        "F"
      )

      setText(doc, {
        size: 8.5,
        bold: true,
        color: COLORS.ink,
      })
    } else {
      setText(doc, { size: 7.7 })
    }

    doc.text(row.label, boxX + 5, mid)

    doc.text(
      row.value,
      boxX + boxWidth - 5,
      mid,
      { align: "right" }
    )

    sy += h
  })

  // Left-side overview
  let ly = y + 4

  setText(doc, {
    size: 8,
    bold: true,
    color: COLORS.muted,
  })

  doc.text(
    "BILL PAYMENT OVERVIEW",
    margin,
    ly
  )

  ly += 7

  setText(doc, {
    size: 8,
    color: COLORS.ink,
  })

  doc.text(
    `Total bills: ${bills.length}`,
    margin,
    ly
  )

  ly += 6

  doc.text(
    `Total advance adjusted: ${money(totalAdvance)}`,
    margin,
    ly
  )

  ly += 6

  doc.text(
    `Total payments received: ${money(totalReceived)}`,
    margin,
    ly
  )

  ly += 6

  doc.text(
    `Total outstanding: ${money(totalDue)}`,
    margin,
    ly
  )

  return {
    endY: Math.max(y + boxHeight, ly + 3),
    totalBilled,
    totalAdvance,
    totalReceived,
    totalDue,
  }
}

// =====================================================
// MAIN PDF GENERATOR
// =====================================================

export function generateBillsStatementPDF(
  rows = [],
  shop = {},
  periodLabel = "All time"
) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  const margin = MARGIN
  const contentWidth = pageWidth - margin * 2

  const bills = Array.isArray(rows) ? rows : []
  const shopName = clean(shop?.name) || "Shop"

  const groups = groupBills(bills)

  // ---------------------------------------------------
  // HEADER
  // ---------------------------------------------------

  setText(doc, {
    size: 17,
    bold: true,
  })

  doc.text("BILLS STATEMENT", margin, 17)

  setText(doc, {
    size: 8,
    color: COLORS.muted,
  })

  doc.text(
    `Period: ${clean(periodLabel) || "All time"}`,
    margin,
    24
  )

  doc.text(
    `Generated: ${formatDate(new Date())}`,
    pageWidth - margin,
    17,
    { align: "right" }
  )

  setText(doc, {
    size: 10,
    bold: true,
  })

  doc.text(shopName, margin, 33)

  const shopAddress = [
    shop?.address,
    shop?.city,
    shop?.state,
    shop?.pincode,
  ]
    .map(clean)
    .filter(Boolean)
    .join(", ")

  if (shopAddress) {
    setText(doc, {
      size: 7.5,
      color: COLORS.muted,
    })

    doc.text(
      doc.splitTextToSize(
        shopAddress,
        contentWidth / 2
      ),
      margin,
      38
    )
  }

  doc.setDrawColor(...COLORS.line)
  doc.setLineWidth(0.35)

  doc.line(
    margin,
    44,
    pageWidth - margin,
    44
  )

  // ---------------------------------------------------
  // QUICK SUMMARY CARDS
  // ---------------------------------------------------

  const countY = 48
  const cardGap = 4
  const cardWidth =
    (contentWidth - cardGap * 2) / 3
  const cardHeight = 15

  const cards = [
    {
      title: "PAID BILLS",
      count: groups.paid.length,
    },
    {
      title: "PARTIALLY PAID",
      count: groups.partial.length,
    },
    {
      title: "UNPAID BILLS",
      count: groups.unpaid.length,
    },
  ]

  cards.forEach((card, index) => {
    const x =
      margin + index * (cardWidth + cardGap)

    doc.setFillColor(...COLORS.soft)
    doc.setDrawColor(...COLORS.line)

    doc.roundedRect(
      x,
      countY,
      cardWidth,
      cardHeight,
      1.5,
      1.5,
      "FD"
    )

    setText(doc, {
      size: 7,
      bold: true,
      color: COLORS.ink,
    })

    doc.text(
      card.title,
      x + 4,
      countY + 5
    )

    setText(doc, {
      size: 12,
      bold: true,
    })

    doc.text(
      String(card.count),
      x + cardWidth - 4,
      countY + 10.5,
      { align: "right" }
    )
  })

  // ---------------------------------------------------
  // SEPARATE BILL TABLES
  // ---------------------------------------------------

  let y = 68

  y = drawSection(doc, {
    title: "PAID BILLS",
    bills: groups.paid,
    startY: y,
    margin,
    contentWidth,
    pageHeight,
  })

  y = drawSection(doc, {
    title: "PARTIALLY PAID BILLS",
    bills: groups.partial,
    startY: y,
    margin,
    contentWidth,
    pageHeight,
  })

  y = drawSection(doc, {
    title: "UNPAID BILLS",
    bills: groups.unpaid,
    startY: y,
    margin,
    contentWidth,
    pageHeight,
  })

  // ---------------------------------------------------
  // FINAL SUMMARY
  // ---------------------------------------------------

  drawSummary(
    doc,
    bills,
    y + 2,
    pageWidth,
    pageHeight
  )

  // ---------------------------------------------------
  // FOOTER AND PAGE NUMBERS
  // ---------------------------------------------------

  const pageCount = doc.getNumberOfPages()

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)

    doc.setDrawColor(...COLORS.line)
    doc.setLineWidth(0.25)

    doc.line(
      margin,
      pageHeight - 13,
      pageWidth - margin,
      pageHeight - 13
    )

    setText(doc, {
      size: 7,
      color: COLORS.muted,
    })

    doc.text(
      `${shopName} | KHAATAPRO Bills Statement`,
      margin,
      pageHeight - 8
    )

    doc.text(
      `Page ${page} of ${pageCount}`,
      pageWidth - margin,
      pageHeight - 8,
      { align: "right" }
    )
  }

  // ---------------------------------------------------
  // DOWNLOAD PDF
  // ---------------------------------------------------

  doc.save(
    `${safeFileName(shopName)}_Bills_Statement.pdf`
  )

  return doc
}
