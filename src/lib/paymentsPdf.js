
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { formatDate } from "./utils"

/* =========================================================
   KHAATAPRO - DETAILED PAYMENTS REPORT
   A4 Landscape | Monochrome | Professional Report
   Separate from duesPdf.js
========================================================= */

const COLORS = {
  ink: [17, 24, 39],
  muted: [95, 102, 112],
  soft: [247, 248, 250],
  light: [242, 243, 245],
  line: [205, 210, 218],
  white: [255, 255, 255],
  black: [0, 0, 0],
}

const MARGIN = 10
const FOOTER_SPACE = 18

/* =========================================================
   BASIC HELPERS
========================================================= */

const amount = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const r2 = (value) =>
  Math.round((amount(value) + Number.EPSILON) * 100) / 100

const clean = (value) => String(value ?? "").trim()

const moneyNumber = (value) =>
  amount(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

const money = (value) => `Rs. ${moneyNumber(value)}`

const safeFileName = (value) =>
  (clean(value) || "Payments_Report")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")

const addressOf = (shop) =>
  [
    shop?.address,
    shop?.city,
    shop?.state,
    shop?.pincode ? `PIN ${shop.pincode}` : "",
  ]
    .map(clean)
    .filter(Boolean)
    .join(", ")

const getPaymentType = (payment) => {
  if (payment?.is_refund) return "Refund"
  if (payment?.is_advance) return "Advance"
  return "Payment"
}

const getSignedAmount = (payment) =>
  payment?.is_refund
    ? -Math.abs(amount(payment?.amount))
    : amount(payment?.amount)

const getPaymentDate = (payment) =>
  payment?.payment_date
    ? formatDate(payment.payment_date)
    : "—"

const localToday = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

/* =========================================================
   TEXT HELPERS
========================================================= */

function setText(
  doc,
  {
    size = 8,
    bold = false,
    italic = false,
    color = COLORS.ink,
  } = {}
) {
  if (typeof doc.setCharSpace === "function") {
    doc.setCharSpace(0)
  }

  doc.setFont(
    "helvetica",
    bold ? "bold" : italic ? "italic" : "normal"
  )

  doc.setFontSize(size)
  doc.setTextColor(...color)
}

function wrapped(doc, value, x, y, width, lineHeight = 4) {
  const lines = doc.splitTextToSize(clean(value), width)
  doc.text(lines, x, y)
  return y + lines.length * lineHeight
}

function kv(doc, label, value, x, y, maxWidth, size = 8) {
  setText(doc, { size, bold: true })
  doc.text(label, x, y)

  const labelWidth = doc.getTextWidth(label) + 1.5

  setText(doc, { size })

  const lines = doc.splitTextToSize(
    clean(value) || "—",
    Math.max(10, maxWidth - labelWidth)
  )

  doc.text(lines[0], x + labelWidth, y)

  let nextY = y + 4.2

  lines.slice(1).forEach((line) => {
    doc.text(line, x + labelWidth, nextY)
    nextY += 4.2
  })

  return nextY
}

/* =========================================================
   AMOUNT IN WORDS - INDIAN NUMBER SYSTEM
========================================================= */

function amountInWords(value) {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ]

  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ]

  const two = (n) =>
    n < 20
      ? ones[n]
      : `${tens[Math.floor(n / 10)]}${
          n % 10 ? ` ${ones[n % 10]}` : ""
        }`

  const three = (n) =>
    `${n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred` : ""}${
      n % 100
        ? `${n >= 100 ? " " : ""}${two(n % 100)}`
        : ""
    }`

  const total = Math.round(Math.abs(amount(value)) * 100)
  const rupees = Math.floor(total / 100)
  const paise = total % 100

  if (!rupees && !paise) return "Rupees Zero Only"

  const parts = []

  const crore = Math.floor(rupees / 10000000)
  const lakh = Math.floor((rupees % 10000000) / 100000)
  const thousand = Math.floor((rupees % 100000) / 1000)
  const rest = rupees % 1000

  if (crore) parts.push(`${two(crore)} Crore`)
  if (lakh) parts.push(`${two(lakh)} Lakh`)
  if (thousand) parts.push(`${two(thousand)} Thousand`)
  if (rest) parts.push(three(rest))

  let result = `Rupees ${parts.join(" ") || "Zero"}`

  if (paise) result += ` and ${two(paise)} Paise`

  return `${result} Only`
}

/* =========================================================
   PAYMENT TOTALS
========================================================= */

function calculateTotals(payments) {
  const totals = {
    count: 0,
    received: 0,
    refunds: 0,
    advances: 0,
    regularPayments: 0,
    net: 0,
    paymentCount: 0,
    advanceCount: 0,
    refundCount: 0,
    customerCount: 0,
    average: 0,
    largest: 0,
  }

  const customers = new Set()

  payments.forEach((payment) => {
    const value = amount(payment?.amount)

    totals.count += 1

    const customerKey =
      payment?.customer_id ||
      payment?.customers?.id ||
      payment?.customers?.name

    if (customerKey) customers.add(customerKey)

    if (payment?.is_refund) {
      totals.refunds += value
      totals.refundCount += 1
      return
    }

    totals.received += value
    totals.largest = Math.max(totals.largest, value)

    if (payment?.is_advance) {
      totals.advances += value
      totals.advanceCount += 1
    } else {
      totals.regularPayments += value
      totals.paymentCount += 1
    }
  })

  totals.net = r2(totals.received - totals.refunds)
  totals.customerCount = customers.size

  const successfulCount = totals.paymentCount + totals.advanceCount

  totals.average = successfulCount
    ? r2(totals.received / successfulCount)
    : 0

  return totals
}

/* =========================================================
   PAYMENT MODE SUMMARY
========================================================= */

function calculateModeSummary(payments) {
  const modes = {}

  payments.forEach((payment) => {
    const mode = clean(payment?.payment_mode) || "Unspecified"

    if (!modes[mode]) {
      modes[mode] = {
        mode,
        count: 0,
        received: 0,
        refunds: 0,
        net: 0,
      }
    }

    modes[mode].count += 1

    if (payment?.is_refund) {
      modes[mode].refunds += amount(payment?.amount)
    } else {
      modes[mode].received += amount(payment?.amount)
    }

    modes[mode].net =
      modes[mode].received - modes[mode].refunds
  })

  return Object.values(modes).sort(
    (a, b) => b.received - a.received
  )
}

/* =========================================================
   TRANSACTION TYPE SUMMARY
========================================================= */

function calculateTypeSummary(payments) {
  const summary = {
    Payment: { count: 0, amount: 0 },
    Advance: { count: 0, amount: 0 },
    Refund: { count: 0, amount: 0 },
  }

  payments.forEach((payment) => {
    const type = getPaymentType(payment)

    summary[type].count += 1
    summary[type].amount += amount(payment?.amount)
  })

  return summary
}

/* =========================================================
   CUSTOMER SUMMARY
========================================================= */

function calculateCustomerSummary(payments) {
  const customers = {}

  payments.forEach((payment) => {
    const customer = payment?.customers || {}

    const key =
      payment?.customer_id ||
      customer?.id ||
      customer?.name ||
      "unknown"

    if (!customers[key]) {
      customers[key] = {
        name: clean(customer?.name) || "Unknown customer",
        mobile: clean(customer?.mobile) || "—",
        count: 0,
        received: 0,
        refunds: 0,
        net: 0,
      }
    }

    const record = customers[key]

    record.count += 1

    if (payment?.is_refund) {
      record.refunds += amount(payment?.amount)
    } else {
      record.received += amount(payment?.amount)
    }

    record.net = record.received - record.refunds
  })

  return Object.values(customers).sort(
    (a, b) => b.net - a.net
  )
}

/* =========================================================
   HEADER
========================================================= */

function drawHeader(doc, shop, options, totals) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const shopName = clean(shop?.name) || "Shop"
  const shopAddress = addressOf(shop)

  setText(doc, {
    size: 15,
    bold: true,
  })

  doc.text(
    "Payments Statement",
    pageWidth / 2,
    13,
    { align: "center" }
  )

  setText(doc, {
    size: 11,
    bold: true,
  })

  doc.text(`Sold By: ${shopName}`, MARGIN, 23)

  setText(doc, {
    size: 7.5,
    color: COLORS.muted,
  })

  let shopY = 28

  if (shopAddress) {
    shopY = wrapped(
      doc,
      shopAddress,
      MARGIN,
      shopY,
      pageWidth * 0.55,
      3.8
    )
  }

  const contacts = [
    shop?.mobile ? `Mobile: ${shop.mobile}` : "",
    shop?.email ? `Email: ${shop.email}` : "",
    shop?.gstin ? `GSTIN: ${shop.gstin}` : "",
  ]
    .filter(Boolean)
    .join("  |  ")

  if (contacts) {
    shopY = wrapped(
      doc,
      contacts,
      MARGIN,
      shopY,
      pageWidth * 0.55,
      3.8
    )
  }

  // Report number box
  const boxWidth = 65
  const boxX = pageWidth - MARGIN - boxWidth

  doc.setFillColor(...COLORS.soft)
  doc.setDrawColor(...COLORS.line)
  doc.setLineWidth(0.25)

  doc.roundedRect(
    boxX,
    18,
    boxWidth,
    23,
    1.8,
    1.8,
    "FD"
  )

  setText(doc, {
    size: 6.8,
    bold: true,
    color: COLORS.muted,
  })

  doc.text("REPORT GENERATED", boxX + 4, 24)

  setText(doc, {
    size: 9,
    bold: true,
  })

  doc.text(
    formatDate(options.reportDate),
    boxX + 4,
    30
  )

  setText(doc, {
    size: 6.8,
    bold: true,
    color: COLORS.muted,
  })

  doc.text(
    `${totals.count} TRANSACTIONS`,
    boxX + 4,
    36
  )

  return Math.max(shopY, 43) + 2
}

/* =========================================================
   SUMMARY CARDS
========================================================= */

function drawSummaryCards(doc, totals, startY) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const contentWidth = pageWidth - MARGIN * 2

  const gap = 3
  const cardWidth = (contentWidth - gap * 3) / 4
  const cardHeight = 17

  const cards = [
    ["TRANSACTIONS", String(totals.count)],
    ["RECEIVED", money(totals.received)],
    ["REFUNDS", money(totals.refunds)],
    ["NET RECEIVED", money(totals.net)],
  ]

  cards.forEach(([label, value], index) => {
    const x = MARGIN + index * (cardWidth + gap)

    doc.setFillColor(...COLORS.soft)
    doc.setDrawColor(...COLORS.line)
    doc.setLineWidth(0.3)

    doc.roundedRect(
      x,
      startY,
      cardWidth,
      cardHeight,
      1.5,
      1.5,
      "FD"
    )

    setText(doc, {
      size: 6.5,
      bold: true,
      color: COLORS.muted,
    })

    doc.text(label, x + 3, startY + 5)

    setText(doc, {
      size: 9,
      bold: true,
    })

    const valueLine = doc.splitTextToSize(
      value,
      cardWidth - 6
    )[0]

    doc.text(valueLine, x + 3, startY + 12)
  })

  return startY + cardHeight
}

/* =========================================================
   REPORT DETAILS
========================================================= */

function drawReportDetails(doc, options, totals, startY) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const contentWidth = pageWidth - MARGIN * 2
  const colWidth = (contentWidth - 8) / 3

  const c1 = MARGIN
  const c2 = MARGIN + colWidth + 4
  const c3 = MARGIN + (colWidth + 4) * 2

  const topY = startY
  const bottomY = topY + 25

  doc.setDrawColor(...COLORS.line)
  doc.setLineWidth(0.2)

  doc.line(c2 - 2, topY - 2, c2 - 2, bottomY)
  doc.line(c3 - 2, topY - 2, c3 - 2, bottomY)

  let y1 = topY

  y1 = kv(
    doc,
    "Report Date: ",
    formatDate(options.reportDate),
    c1,
    y1,
    colWidth
  )

  y1 = kv(
    doc,
    "Report Period: ",
    options.periodLabel,
    c1,
    y1,
    colWidth
  )

  y1 = kv(
    doc,
    "Total Transactions: ",
    String(totals.count),
    c1,
    y1,
    colWidth
  )

  setText(doc, {
    size: 8.5,
    bold: true,
  })

  doc.text("CUSTOMERS", c2, topY)

  setText(doc, {
    size: 13,
    bold: true,
  })

  doc.text(String(totals.customerCount), c2, topY + 9)

  setText(doc, {
    size: 7,
    color: COLORS.muted,
  })

  doc.text("With payment records", c2, topY + 15)

  setText(doc, {
    size: 8.5,
    bold: true,
  })

  doc.text("AVERAGE TRANSACTION", c3, topY)

  setText(doc, {
    size: 11,
    bold: true,
  })

  doc.text(money(totals.average), c3, topY + 9)

  setText(doc, {
    size: 7,
    color: COLORS.muted,
  })

  doc.text("Excluding refunds", c3, topY + 15)

  return Math.max(y1, bottomY) + 5
}

/* =========================================================
   PAYMENT TABLE
========================================================= */

function buildPaymentRows(payments) {
  return payments.map((payment, index) => {
    const customer = payment?.customers || {}
    const bill = payment?.bills || {}

    const customerDetails = [
      clean(customer?.name) || "Unknown customer",
      clean(customer?.mobile)
        ? `Mobile: ${customer.mobile}`
        : "",
    ]
      .filter(Boolean)
      .join("\n")

    return [
      String(index + 1),
      getPaymentDate(payment),
      customerDetails,
      getPaymentType(payment),
      clean(payment?.payment_mode) || "—",
      clean(bill?.bill_number) || "—",
      clean(payment?.notes) || "—",
      moneyNumber(getSignedAmount(payment)),
    ]
  })
}

/* =========================================================
   SUMMARY BOX
========================================================= */

function drawSummaryBox(doc, rows, x, y, width) {
  const rowHeight = (row) =>
    row.type === "grand" ? 10 : 6

  const height =
    rows.reduce((sum, row) => sum + rowHeight(row), 0) + 4

  doc.setDrawColor(...COLORS.line)
  doc.setLineWidth(0.25)
  doc.rect(x, y, width, height, "S")

  let currentY = y + 2

  rows.forEach((row) => {
    const h = rowHeight(row)
    const baseline = currentY + h / 2 + 1.1

    if (row.type === "grand") {
      doc.setFillColor(...COLORS.ink)
      doc.rect(
        x + 1.5,
        currentY,
        width - 3,
        h - 1,
        "F"
      )

      setText(doc, {
        size: 8.5,
        bold: true,
        color: COLORS.white,
      })
    } else {
      setText(doc, { size: 7.5 })
    }

    doc.text(row.label, x + 5, baseline)

    doc.text(
      row.value,
      x + width - 5,
      baseline,
      { align: "right" }
    )

    currentY += h
  })

  return height
}

/* =========================================================
   PAGE FOOTER
========================================================= */

function drawFooter(doc, shop, shopName) {
  const pageCount = doc.getNumberOfPages()
  const pageHeight = doc.internal.pageSize.getHeight()
  const pageWidth = doc.internal.pageSize.getWidth()
  const registeredAddress = addressOf(shop)

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)

    doc.setDrawColor(...COLORS.line)
    doc.setLineWidth(0.25)

    doc.line(
      MARGIN,
      pageHeight - 12,
      pageWidth - MARGIN,
      pageHeight - 12
    )

    setText(doc, {
      size: 7,
      bold: true,
    })

    doc.text(
      "Thank you for your business!",
      MARGIN,
      pageHeight - 7
    )

    setText(doc, {
      size: 6.3,
      color: COLORS.muted,
    })

    const registeredLine = registeredAddress
      ? `Regd. office: ${shopName}, ${registeredAddress}`
      : shopName

    doc.text(
      doc.splitTextToSize(registeredLine, 150).slice(0, 1),
      MARGIN,
      pageHeight - 4
    )

    setText(doc, {
      size: 7,
      bold: true,
    })

    doc.text(
      "E. & O.E.",
      pageWidth - MARGIN - 25,
      pageHeight - 7,
      { align: "right" }
    )

    setText(doc, {
      size: 6.5,
      color: COLORS.muted,
    })

    doc.text(
      `Page ${page} of ${pageCount}`,
      pageWidth - MARGIN,
      pageHeight - 4,
      { align: "right" }
    )
  }
}

/* =========================================================
   MAIN PDF BUILDER
========================================================= */

function buildPaymentsPDF(
  payments = [],
  shop = {},
  options = {}
) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  })

  if (typeof doc.setCharSpace === "function") {
    doc.setCharSpace(0)
  }

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - MARGIN * 2

  const rows = Array.isArray(payments) ? payments : []
  const shopName = clean(shop?.name) || "Shop"

  const reportDate = options?.reportDate || localToday()
  const periodLabel = options?.periodLabel || "All time"

  const reportOptions = {
    reportDate,
    periodLabel,
  }

  const totals = calculateTotals(rows)
  const modeSummary = calculateModeSummary(rows)
  const typeSummary = calculateTypeSummary(rows)
  const customerSummary = calculateCustomerSummary(rows)

  /* =======================================================
     PAGE 1 - HEADER
  ======================================================= */

  let y = drawHeader(
    doc,
    shop,
    reportOptions,
    totals
  )

  y += 2

  y = drawSummaryCards(doc, totals, y) + 5

  y = drawReportDetails(
    doc,
    reportOptions,
    totals,
    y
  )

  setText(doc, {
    size: 8,
    color: COLORS.muted,
  })

  doc.text(
    `Payment-wise transaction details | ${rows.length} records`,
    MARGIN,
    y
  )

  y += 2

  /* =======================================================
     PAYMENT HISTORY TABLE
  ======================================================= */

  const tableHead = [[
    "#",
    "Date",
    "Customer Details",
    "Type",
    "Payment Mode",
    "Bill Number",
    "Notes",
    "Amount (Rs.)",
  ]]

  const tableBody = rows.length
    ? buildPaymentRows(rows)
    : [[
        "—",
        "—",
        "No payment records found",
        "—",
        "—",
        "—",
        "—",
        "0.00",
      ]]

  const tableFoot = [[
    "",
    "",
    "TOTAL TRANSACTIONS",
    "",
    "",
    "",
    "NET RECEIVED",
    moneyNumber(totals.net),
  ]]

  autoTable(doc, {
    startY: y,
    head: tableHead,
    body: tableBody,
    foot: tableFoot,
    showFoot: "lastPage",

    theme: "plain",
    tableWidth: contentWidth,

    margin: {
      left: MARGIN,
      right: MARGIN,
      top: 16,
      bottom: FOOTER_SPACE,
    },

    styles: {
      font: "helvetica",
      fontSize: 6.8,
      cellPadding: {
        top: 2.4,
        bottom: 2.4,
        left: 1.5,
        right: 1.5,
      },
      textColor: COLORS.ink,
      lineColor: COLORS.line,
      lineWidth: 0,
      overflow: "linebreak",
      valign: "middle",
      charSpacing: 0,
    },

    headStyles: {
      fillColor: COLORS.white,
      textColor: COLORS.ink,
      fontStyle: "bold",
      fontSize: 6.6,
      cellPadding: {
        top: 3,
        bottom: 3,
        left: 1.5,
        right: 1.5,
      },
      lineColor: COLORS.line,
      lineWidth: {
        bottom: 0.45,
      },
    },

    footStyles: {
      fillColor: COLORS.soft,
      textColor: COLORS.ink,
      fontStyle: "bold",
      fontSize: 6.7,
      lineColor: COLORS.line,
      lineWidth: {
        top: 0.35,
      },
    },

    alternateRowStyles: {
      fillColor: COLORS.white,
    },

    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 23 },
      2: { cellWidth: 40 },
      3: { cellWidth: 21 },
      4: { cellWidth: 25 },
      5: { cellWidth: 29 },
      6: { cellWidth: "auto" },
      7: {
        cellWidth: 34,
        halign: "right",
        fontStyle: "bold",
      },
    },

    didParseCell(data) {
      if (data.column.index === 0) {
        data.cell.styles.halign = "center"
      }

      if (data.column.index === 7) {
        data.cell.styles.halign = "right"
        data.cell.styles.overflow = "linebreak"
      }
    },

    didDrawCell(data) {
      if (data.section === "body") {
        doc.setDrawColor(...COLORS.line)
        doc.setLineWidth(0.16)

        doc.line(
          data.cell.x,
          data.cell.y + data.cell.height,
          data.cell.x + data.cell.width,
          data.cell.y + data.cell.height
        )
      }
    },

    didDrawPage() {
      if (doc.internal.getCurrentPageInfo().pageNumber > 1) {
        setText(doc, {
          size: 8,
          bold: true,
          color: COLORS.muted,
        })

        doc.text(
          "Payments Statement - continued",
          MARGIN,
          10
        )
      }
    },
  })

  /* =======================================================
     PAGE 1 - FINANCIAL SUMMARY
  ======================================================= */

  let summaryY = (doc.lastAutoTable?.finalY || y) + 7

  const summaryWidth = 91
  const summaryX = pageWidth - MARGIN - summaryWidth

  const summaryRows = [
    {
      label: "Regular payments",
      value: money(totals.regularPayments),
    },
    {
      label: "Advance received",
      value: money(totals.advances),
    },
    {
      label: "Refunds issued",
      value: `- ${money(totals.refunds)}`,
    },
    {
      label: "Net received",
      value: money(totals.net),
      type: "grand",
    },
  ]

  const summaryHeight =
    summaryRows.reduce(
      (sum, row) => sum + (row.type === "grand" ? 10 : 6),
      0
    ) + 4

  if (summaryY + summaryHeight > pageHeight - FOOTER_SPACE) {
    doc.addPage()
    summaryY = 20
  }

  const leftWidth = summaryX - MARGIN - 8
  let leftY = summaryY + 3

  setText(doc, {
    size: 7.5,
    bold: true,
    color: COLORS.muted,
  })

  doc.text("NET RECEIVED IN WORDS", MARGIN, leftY)

  leftY += 5

  setText(doc, {
    size: 8.5,
    bold: true,
  })

  leftY = wrapped(
    doc,
    amountInWords(totals.net),
    MARGIN,
    leftY,
    leftWidth,
    4.2
  )

  drawSummaryBox(
    doc,
    summaryRows,
    summaryX,
    summaryY,
    summaryWidth
  )

  /* =======================================================
     PAGE 2 - PAYMENT ANALYSIS
  ======================================================= */

  doc.addPage()

  let page2Y = 19

  setText(doc, {
    size: 12,
    bold: true,
  })

  doc.text(
    "Payment Analysis & Summary",
    MARGIN,
    page2Y
  )

  page2Y += 5

  doc.setDrawColor(...COLORS.line)
  doc.setLineWidth(0.3)

  doc.line(
    MARGIN,
    page2Y,
    pageWidth - MARGIN,
    page2Y
  )

  page2Y += 8

  /* TRANSACTION TYPE SUMMARY */

  setText(doc, {
    size: 8,
    bold: true,
    color: COLORS.muted,
  })

  doc.text(
    "TRANSACTION TYPE SUMMARY",
    MARGIN,
    page2Y
  )

  const typeRows = [
    [
      "Regular Payments",
      String(typeSummary.Payment.count),
      moneyNumber(typeSummary.Payment.amount),
    ],
    [
      "Advance Payments",
      String(typeSummary.Advance.count),
      moneyNumber(typeSummary.Advance.amount),
    ],
    [
      "Refunds",
      String(typeSummary.Refund.count),
      moneyNumber(typeSummary.Refund.amount),
    ],
  ]

  autoTable(doc, {
    startY: page2Y + 3,

    head: [[
      "Transaction Type",
      "Transactions",
      "Amount (Rs.)",
    ]],

    body: typeRows,

    foot: [[
      "Total",
      String(totals.count),
      moneyNumber(totals.received + totals.refunds),
    ]],

    theme: "plain",
    tableWidth: contentWidth,

    margin: {
      left: MARGIN,
      right: MARGIN,
      top: 16,
      bottom: FOOTER_SPACE,
    },

    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: 2.8,
      textColor: COLORS.ink,
      lineColor: COLORS.line,
      lineWidth: 0,
      valign: "middle",
    },

    headStyles: {
      fillColor: COLORS.soft,
      textColor: COLORS.ink,
      fontStyle: "bold",
      fontSize: 7,
    },

    footStyles: {
      fillColor: COLORS.soft,
      textColor: COLORS.ink,
      fontStyle: "bold",
      lineColor: COLORS.line,
      lineWidth: {
        top: 0.35,
      },
    },

    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 45, halign: "right" },
      2: { halign: "right" },
    },

    didDrawCell(data) {
      if (data.section === "body") {
        doc.setDrawColor(...COLORS.line)
        doc.setLineWidth(0.15)

        doc.line(
          data.cell.x,
          data.cell.y + data.cell.height,
          data.cell.x + data.cell.width,
          data.cell.y + data.cell.height
        )
      }
    },
  })

  page2Y = (doc.lastAutoTable?.finalY || page2Y) + 9

  /* PAYMENT MODE SUMMARY */

  setText(doc, {
    size: 8,
    bold: true,
    color: COLORS.muted,
  })

  doc.text(
    "PAYMENT MODE SUMMARY",
    MARGIN,
    page2Y
  )

  const modeRows = modeSummary.length
    ? modeSummary.map((item) => [
        item.mode,
        String(item.count),
        moneyNumber(item.received),
        moneyNumber(item.refunds),
        moneyNumber(item.net),
      ])
    : [["No payment modes available", "0", "0.00", "0.00", "0.00"]]

  autoTable(doc, {
    startY: page2Y + 3,

    head: [[
      "Payment Mode",
      "Transactions",
      "Received (Rs.)",
      "Refunds (Rs.)",
      "Net (Rs.)",
    ]],

    body: modeRows,

    foot: [[
      "Total",
      String(totals.count),
      moneyNumber(totals.received),
      moneyNumber(totals.refunds),
      moneyNumber(totals.net),
    ]],

    theme: "plain",
    tableWidth: contentWidth,

    margin: {
      left: MARGIN,
      right: MARGIN,
      top: 16,
      bottom: FOOTER_SPACE,
    },

    styles: {
      font: "helvetica",
      fontSize: 7.2,
      cellPadding: 2.8,
      textColor: COLORS.ink,
      lineColor: COLORS.line,
      lineWidth: 0,
      valign: "middle",
    },

    headStyles: {
      fillColor: COLORS.soft,
      textColor: COLORS.ink,
      fontStyle: "bold",
      fontSize: 6.8,
    },

    footStyles: {
      fillColor: COLORS.soft,
      textColor: COLORS.ink,
      fontStyle: "bold",
      lineColor: COLORS.line,
      lineWidth: {
        top: 0.35,
      },
    },

    columnStyles: {
      0: { cellWidth: 65 },
      1: { cellWidth: 27, halign: "right" },
      2: { cellWidth: 35, halign: "right" },
      3: { cellWidth: 35, halign: "right" },
      4: { halign: "right" },
    },

    didDrawCell(data) {
      if (data.section === "body") {
        doc.setDrawColor(...COLORS.line)
        doc.setLineWidth(0.15)

        doc.line(
          data.cell.x,
          data.cell.y + data.cell.height,
          data.cell.x + data.cell.width,
          data.cell.y + data.cell.height
        )
      }
    },
  })

  /* =======================================================
     CUSTOMER-WISE SUMMARY
  ======================================================= */

  page2Y = (doc.lastAutoTable?.finalY || page2Y) + 9

  setText(doc, {
    size: 8,
    bold: true,
    color: COLORS.muted,
  })

  doc.text(
    "CUSTOMER-WISE PAYMENT SUMMARY",
    MARGIN,
    page2Y
  )

  const customerRows = customerSummary.length
    ? customerSummary.map((customer, index) => [
        String(index + 1),
        customer.name,
        customer.mobile,
        String(customer.count),
        moneyNumber(customer.received),
        moneyNumber(customer.refunds),
        moneyNumber(customer.net),
      ])
    : [[
        "—",
        "No customer records",
        "—",
        "0",
        "0.00",
        "0.00",
        "0.00",
      ]]

  autoTable(doc, {
    startY: page2Y + 3,

    head: [[
      "#",
      "Customer",
      "Mobile",
      "Transactions",
      "Received",
      "Refunds",
      "Net",
    ]],

    body: customerRows,

    theme: "plain",
    tableWidth: contentWidth,

    margin: {
      left: MARGIN,
      right: MARGIN,
      top: 16,
      bottom: FOOTER_SPACE,
    },

    styles: {
      font: "helvetica",
      fontSize: 6.8,
      cellPadding: 2.5,
      textColor: COLORS.ink,
      lineColor: COLORS.line,
      lineWidth: 0,
      overflow: "linebreak",
      valign: "middle",
    },

    headStyles: {
      fillColor: COLORS.soft,
      textColor: COLORS.ink,
      fontStyle: "bold",
      fontSize: 6.5,
    },

    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 49 },
      2: { cellWidth: 28 },
      3: { cellWidth: 25, halign: "right" },
      4: { cellWidth: 35, halign: "right" },
      5: { cellWidth: 35, halign: "right" },
      6: { halign: "right", fontStyle: "bold" },
    },

    didDrawCell(data) {
      if (data.section === "body") {
        doc.setDrawColor(...COLORS.line)
        doc.setLineWidth(0.15)

        doc.line(
          data.cell.x,
          data.cell.y + data.cell.height,
          data.cell.x + data.cell.width,
          data.cell.y + data.cell.height
        )
      }
    },
  })

  /* =======================================================
     REPORT NOTES
  ======================================================= */

  page2Y = (doc.lastAutoTable?.finalY || page2Y) + 9

  if (page2Y + 25 > pageHeight - FOOTER_SPACE) {
    doc.addPage()
    page2Y = 20
  }

  doc.setDrawColor(...COLORS.line)
  doc.setLineWidth(0.25)

  doc.line(
    MARGIN,
    page2Y,
    pageWidth - MARGIN,
    page2Y
  )

  page2Y += 6

  setText(doc, {
    size: 8,
    bold: true,
    color: COLORS.muted,
  })

  doc.text("REPORT NOTES", MARGIN, page2Y)

  page2Y += 5

  setText(doc, {
    size: 7.3,
    color: COLORS.ink,
  })

  const notes = [
    "1. This report contains payment transactions included in the selected period and supplied records.",
    "2. Regular payments and advance payments are shown separately.",
    "3. Refunds are deducted while calculating net received.",
    "4. Customer-wise and payment-mode summaries are based on the available transaction records.",
    "5. Please verify the latest payment entries before reconciliation or further collection.",
  ]

  notes.forEach((note) => {
    page2Y = wrapped(
      doc,
      note,
      MARGIN,
      page2Y,
      contentWidth,
      4
    ) + 1.2
  })

  /* AUTHORISED SIGNATORY */

  const signX = pageWidth - MARGIN

  setText(doc, {
    size: 8.5,
    bold: true,
  })

  doc.text(
    `For ${shopName}`,
    signX,
    page2Y + 3,
    { align: "right" }
  )

  if (shop?.signature) {
    try {
      doc.addImage(
        shop.signature,
        undefined,
        signX - 38,
        page2Y + 5,
        38,
        14
      )
    } catch {
      // Continue without an invalid signature image.
    }
  }

  doc.setDrawColor(...COLORS.muted)
  doc.setLineWidth(0.25)

  doc.line(
    signX - 55,
    page2Y + 23,
    signX,
    page2Y + 23
  )

  setText(doc, {
    size: 7.5,
    color: COLORS.muted,
  })

  doc.text(
    "Authorised Signatory",
    signX,
    page2Y + 27,
    { align: "right" }
  )

  /* FINAL FOOTER */

  drawFooter(doc, shop, shopName)

  if (typeof doc.setCharSpace === "function") {
    doc.setCharSpace(0)
  }

  return doc
}

/* =========================================================
   DOWNLOAD PDF
========================================================= */

export function downloadPaymentsPDF(
  payments = [],
  shop = {},
  periodLabel = "All time"
) {
  const options = {
    reportDate: localToday(),
    periodLabel,
  }

  const doc = buildPaymentsPDF(
    payments,
    shop,
    options
  )

  const fileName =
    `${safeFileName(shop?.name)}_Payments_Statement_${localToday()}.pdf`

  doc.save(fileName)

  return fileName
}

/* =========================================================
   CREATE PDF BLOB
========================================================= */

export function createPaymentsPDFBlob(
  payments = [],
  shop = {},
  options = {}
) {
  return buildPaymentsPDF(
    payments,
    shop,
    options
  ).output("blob")
}

/* =========================================================
   SHARE PDF
========================================================= */

export async function sharePaymentsPDF(
  payments = [],
  shop = {},
  periodLabel = "All time"
) {
  const options = {
    reportDate: localToday(),
    periodLabel,
  }

  const blob = createPaymentsPDFBlob(
    payments,
    shop,
    options
  )

  const fileName =
    `${safeFileName(shop?.name)}_Payments_Statement_${localToday()}.pdf`

  const file = new File(
    [blob],
    fileName,
    { type: "application/pdf" }
  )

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    await navigator.share({
      files: [file],
      title: "Payments Statement",
      text: `Payments statement from ${clean(shop?.name) || "our shop"}`,
    })

    return {
      shared: true,
      fileName,
    }
  }

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")

  anchor.href = url
  anchor.download = fileName

  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  window.setTimeout(
    () => URL.revokeObjectURL(url),
    1500
  )

  return {
    shared: false,
    downloaded: true,
    fileName,
  }
}

export default downloadPaymentsPDF
