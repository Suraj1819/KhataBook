
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { formatDate } from "./utils"

/* =========================================================
   KHAATAPRO - DUES REPORT PDF
   A4 Portrait | Monochrome | Tax Invoice Style
   ========================================================= */

const COLORS = {
  ink: [17, 24, 39],
  muted: [95, 102, 112],
  soft: [247, 248, 250],
  line: [205, 210, 218],
  white: [255, 255, 255],
}

const MARGIN = 10
const FOOTER_SPACE = 22
const PAGE_BOTTOM = 276

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
  (clean(value) || "Dues_Report")
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
    clean(value) || "-",
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

function addImageSafe(doc, data, x, y, width, height) {
  if (!data) return false

  try {
    doc.addImage(data, undefined, x, y, width, height)
    return true
  } catch {
    return false
  }
}

/* =========================================================
   DATE HELPERS
   ========================================================= */

function parseDate(value) {
  if (!value) return null

  const parts = String(value)
    .slice(0, 10)
    .split("-")
    .map(Number)

  if (parts.length !== 3 || parts.some((part) => !part)) {
    return null
  }

  return new Date(parts[0], parts[1] - 1, parts[2])
}

function localToday() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")

  return `${y}-${m}-${d}`
}

function dueState(dueDate, today = localToday()) {
  if (!dueDate) return "No due date"

  const due = parseDate(dueDate)
  const current = parseDate(today)

  if (!due || !current) return "No due date"
  if (due < current) return "Overdue"

  if (due.getTime() === current.getTime()) {
    return "Due today"
  }

  return "Upcoming"
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
      pageHeight - 16,
      pageWidth - MARGIN,
      pageHeight - 16
    )

    setText(doc, { size: 7.5, bold: true })

    doc.text(
      "Thank you for your business!",
      MARGIN,
      pageHeight - 11.5
    )

    setText(doc, { size: 6.5, color: COLORS.muted })

    const registeredLine = registeredAddress
      ? `Regd. office: ${shopName}, ${registeredAddress}`
      : shopName

    doc.text(
      doc.splitTextToSize(registeredLine, 128).slice(0, 2),
      MARGIN,
      pageHeight - 8
    )

    setText(doc, { size: 7, bold: true })

    doc.text(
      "E. & O.E.",
      pageWidth - MARGIN - 22,
      pageHeight - 11.5,
      { align: "right" }
    )

    setText(doc, { size: 7, color: COLORS.muted })

    doc.text(
      `Page ${page} of ${pageCount}`,
      pageWidth - MARGIN,
      pageHeight - 11.5,
      { align: "right" }
    )

    doc.text(
      "Computer-generated dues report",
      pageWidth - MARGIN,
      pageHeight - 8,
      { align: "right" }
    )
  }
}

/* =========================================================
   SUMMARY BOX
   ========================================================= */

function drawSummaryBox(doc, rows, x, y, width) {
  const rowHeight = (row) =>
    row.type === "grand" ? 10 : row.type === "due" ? 8 : 6

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
      doc.rect(x + 1.5, currentY, width - 3, h - 1, "F")

      setText(doc, {
        size: 9.2,
        bold: true,
        color: COLORS.white,
      })
    } else if (row.type === "due") {
      doc.setFillColor(...COLORS.soft)
      doc.rect(x + 1.5, currentY, width - 3, h - 0.5, "F")

      setText(doc, { size: 8.3, bold: true })
    } else {
      setText(doc, { size: 7.8 })
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
   MAIN PDF BUILDER
   ========================================================= */

function buildDuesPDF(dues = [], shop = {}, options = {}) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const contentWidth = pageWidth - MARGIN * 2

  if (typeof doc.setCharSpace === "function") {
    doc.setCharSpace(0)
  }

  const rows = Array.isArray(dues) ? dues : []
  const shopName = clean(shop?.name) || "Shop"

  const reportDate = options?.reportDate || localToday()
  const reportLabel = options?.periodLabel || "All outstanding bills"

  const totalBills = rows.length

  const totalBillValue = r2(
    rows.reduce(
      (sum, bill) => sum + amount(bill.grand_total),
      0
    )
  )

  const totalAdvance = r2(
    rows.reduce(
      (sum, bill) => sum + amount(bill.advance_adjusted),
      0
    )
  )

  const totalPaid = r2(
    rows.reduce(
      (sum, bill) => sum + amount(bill.amount_paid),
      0
    )
  )

  const totalDue = r2(
    rows.reduce(
      (sum, bill) => sum + amount(bill.amount_due),
      0
    )
  )

  const customerCount = new Set(
    rows.map(
      (bill) =>
        bill.customer_id ||
        bill.customers?.name ||
        "walk-in"
    )
  ).size

  /* DUE STATUS COUNTS */

  const statusCounts = {
    overdue: { count: 0, amount: 0 },
    today: { count: 0, amount: 0 },
    upcoming: { count: 0, amount: 0 },
    noDate: { count: 0, amount: 0 },
  }

  rows.forEach((bill) => {
    const state = dueState(bill.due_date, reportDate)

    const key =
      state === "Overdue"
        ? "overdue"
        : state === "Due today"
          ? "today"
          : state === "Upcoming"
            ? "upcoming"
            : "noDate"

    statusCounts[key].count += 1
    statusCounts[key].amount += amount(bill.amount_due)
  })

  /* =======================================================
     PAGE 1 - REPORT HEADER
     ======================================================= */

  setText(doc, { size: 15, bold: true })

  doc.text(
    "Outstanding Dues Report",
    pageWidth / 2,
    14,
    { align: "center" }
  )

  setText(doc, { size: 11, bold: true })

  doc.text(
    `Sold By: ${shopName}`,
    MARGIN,
    23
  )

  setText(doc, { size: 8, color: COLORS.muted })

  let shopY = 28
  const shopAddress = addressOf(shop)

  if (shopAddress) {
    shopY = wrapped(
      doc,
      shopAddress,
      MARGIN,
      shopY,
      112,
      4
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
      112,
      4
    )
  }

  /* REPORT NUMBER BOX */

  const boxWidth = 62
  const boxX = pageWidth - MARGIN - boxWidth

  doc.setFillColor(...COLORS.soft)
  doc.setDrawColor(...COLORS.line)
  doc.setLineWidth(0.25)

  doc.roundedRect(
    boxX,
    18,
    boxWidth,
    22,
    1.8,
    1.8,
    "FD"
  )

  setText(doc, {
    size: 7,
    bold: true,
    color: COLORS.muted,
  })

  doc.text("REPORT GENERATED", boxX + 4, 24)

  setText(doc, { size: 10, bold: true })

  doc.text(
    formatDate(reportDate),
    boxX + 4,
    31
  )

  setText(doc, {
    size: 7,
    bold: true,
    color: COLORS.muted,
  })

  doc.text(
    `${totalBills} PENDING ${totalBills === 1 ? "BILL" : "BILLS"}`,
    boxX + 4,
    36
  )

  let y = Math.max(shopY, 43) + 2

  doc.setDrawColor(...COLORS.ink)
  doc.setLineWidth(0.35)

  doc.line(
    MARGIN,
    y,
    pageWidth - MARGIN,
    y
  )

  /* =======================================================
     REPORT DETAILS
     ======================================================= */

  y += 6

  const colWidth = (contentWidth - 8) / 3

  const c1 = MARGIN
  const c2 = MARGIN + colWidth + 4
  const c3 = MARGIN + (colWidth + 4) * 2

  const detailTop = y
  const detailBottom = detailTop + 25

  doc.setDrawColor(...COLORS.line)
  doc.setLineWidth(0.2)

  doc.line(
    c2 - 2,
    detailTop - 2,
    c2 - 2,
    detailBottom
  )

  doc.line(
    c3 - 2,
    detailTop - 2,
    c3 - 2,
    detailBottom
  )

  let y1 = detailTop

  y1 = kv(
    doc,
    "Report Date: ",
    formatDate(reportDate),
    c1,
    y1,
    colWidth
  )

  y1 = kv(
    doc,
    "Report Type: ",
    reportLabel,
    c1,
    y1,
    colWidth
  )

  y1 = kv(
    doc,
    "Total Bills: ",
    String(totalBills),
    c1,
    y1,
    colWidth
  )

  setText(doc, { size: 8.5, bold: true })
  doc.text("CUSTOMERS", c2, detailTop)

  setText(doc, { size: 13, bold: true })
  doc.text(String(customerCount), c2, detailTop + 9)

  setText(doc, { size: 7.5, color: COLORS.muted })
  doc.text(
    "With outstanding balances",
    c2,
    detailTop + 14
  )

  setText(doc, { size: 8.5, bold: true })
  doc.text("TOTAL OUTSTANDING", c3, detailTop)

  setText(doc, { size: 12, bold: true })
  doc.text(money(totalDue), c3, detailTop + 9)

  setText(doc, { size: 7.5, color: COLORS.muted })
  doc.text(
    "Amount pending collection",
    c3,
    detailTop + 14
  )

  y = Math.max(y1, detailBottom) + 5

  setText(doc, { size: 8, color: COLORS.muted })

  doc.text(
    `Bill-wise outstanding details  |  ${totalBills} records`,
    MARGIN,
    y
  )

  y += 2

  /* =======================================================
     DUES TABLE
     ======================================================= */

  const tableHead = [[
    "#",
    "Customer / Bill Details",
    "Bill Date",
    "Due Date",
    "Bill Total",
    "Advance",
    "Paid",
    "Balance Due",
  ]]

  const tableBody = rows.length
    ? rows.map((bill, index) => {
        const customerName =
          clean(bill.customers?.name) || "Walk-in customer"

        const mobile = clean(bill.customers?.mobile)
        const billNo = clean(bill.bill_number) || "-"

        return [
          String(index + 1),

          [
            customerName,
            billNo,
            mobile ? `Mobile: ${mobile}` : "",
          ]
            .filter(Boolean)
            .join("\n"),

          bill.bill_date ? formatDate(bill.bill_date) : "-",
          bill.due_date ? formatDate(bill.due_date) : "-",

          moneyNumber(bill.grand_total),
          moneyNumber(bill.advance_adjusted),
          moneyNumber(bill.amount_paid),
          moneyNumber(bill.amount_due),
        ]
      })
    : [[
        "-",
        "No outstanding bills found",
        "-",
        "-",
        "0.00",
        "0.00",
        "0.00",
        "0.00",
      ]]

  const tableFoot = [[
    "",
    "Total (Amounts in Rs.)",
    "",
    "",
    moneyNumber(totalBillValue),
    moneyNumber(totalAdvance),
    moneyNumber(totalPaid),
    moneyNumber(totalDue),
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
      fontSize: 6.7,

      cellPadding: {
        top: 2.4,
        bottom: 2.4,
        left: 1.4,
        right: 1.4,
      },

      textColor: COLORS.ink,
      lineWidth: 0,
      overflow: "linebreak",
      valign: "middle",
    },

    headStyles: {
      fillColor: COLORS.white,
      textColor: COLORS.ink,
      fontStyle: "bold",
      fontSize: 6.5,

      cellPadding: {
        top: 3,
        bottom: 3,
        left: 1.2,
        right: 1.2,
      },

      lineColor: COLORS.line,
      lineWidth: { bottom: 0.45 },
    },

    footStyles: {
      fillColor: COLORS.soft,
      textColor: COLORS.ink,
      fontStyle: "bold",
      fontSize: 6.5,
      lineColor: COLORS.line,
      lineWidth: { top: 0.35 },
    },

    columnStyles: {
      0: { cellWidth: 7, halign: "center" },
      1: { cellWidth: 49 },
      2: { cellWidth: 21, halign: "center" },
      3: { cellWidth: 21, halign: "center" },
      4: { cellWidth: 23, halign: "right" },
      5: { cellWidth: 20, halign: "right" },
      6: { cellWidth: 20, halign: "right" },
      7: {
        cellWidth: 29,
        halign: "right",
        fontStyle: "bold",
      },
    },

    didDrawCell: (data) => {
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

    didDrawPage: () => {
      if (doc.internal.getCurrentPageInfo().pageNumber > 1) {
        setText(doc, {
          size: 8,
          bold: true,
          color: COLORS.muted,
        })

        doc.text(
          "Outstanding Dues Report - continued",
          MARGIN,
          10
        )
      }
    },
  })

  /* =======================================================
     AMOUNT SUMMARY
     ======================================================= */

  let summaryY = (doc.lastAutoTable?.finalY || y) + 7

  const summaryWidth = 84
  const summaryX = pageWidth - MARGIN - summaryWidth

  const summaryRows = [
    {
      label: "Total bill value",
      value: money(totalBillValue),
    },
    {
      label: "Advance adjusted",
      value: `- ${money(totalAdvance)}`,
    },
    {
      label: "Amount paid",
      value: `- ${money(totalPaid)}`,
    },
    {
      label: "Total Outstanding",
      value: money(totalDue),
      type: "grand",
    },
  ]

  const summaryHeight =
    summaryRows.reduce(
      (sum, row) => sum + (row.type === "grand" ? 10 : 6),
      0
    ) + 4

  if (summaryY + summaryHeight > PAGE_BOTTOM) {
    doc.addPage()
    summaryY = 22
  }

  const leftWidth = summaryX - MARGIN - 8

  let leftY = summaryY + 3

  setText(doc, {
    size: 7.5,
    bold: true,
    color: COLORS.muted,
  })

  doc.text("AMOUNT IN WORDS", MARGIN, leftY)

  leftY += 4.5

  setText(doc, { size: 8.5, bold: true })

  leftY = wrapped(
    doc,
    amountInWords(totalDue),
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
     PAGE 2 - DUES SUMMARY
     ======================================================= */

  doc.addPage()

  let page2Y = 20

  setText(doc, {
    size: 8,
    bold: true,
    color: COLORS.muted,
  })

  doc.text("DUES SUMMARY", MARGIN, page2Y)

  page2Y += 3

  const agingRows = [
    [
      "Overdue",
      String(statusCounts.overdue.count),
      moneyNumber(statusCounts.overdue.amount),
    ],
    [
      "Due today",
      String(statusCounts.today.count),
      moneyNumber(statusCounts.today.amount),
    ],
    [
      "Upcoming",
      String(statusCounts.upcoming.count),
      moneyNumber(statusCounts.upcoming.amount),
    ],
    [
      "No due date",
      String(statusCounts.noDate.count),
      moneyNumber(statusCounts.noDate.amount),
    ],
  ]

  autoTable(doc, {
    startY: page2Y,

    head: [[
      "Due Category",
      "Bills",
      "Outstanding Amount (Rs.)",
    ]],

    body: agingRows,

    foot: [[
      "Total",
      String(totalBills),
      moneyNumber(totalDue),
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
      cellPadding: 2.6,
      textColor: COLORS.ink,
      lineWidth: 0,
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
      lineWidth: { top: 0.3 },
    },

    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 35, halign: "right" },
      2: { halign: "right" },
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

  page2Y = (doc.lastAutoTable?.finalY || page2Y) + 10

  /* REPORT NOTES */

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
    size: 7.5,
    bold: true,
    color: COLORS.muted,
  })

  doc.text("REPORT NOTES", MARGIN, page2Y)

  page2Y += 5

  setText(doc, { size: 7.5, color: COLORS.ink })

  const notes = [
    "1. This report contains bills with an outstanding balance at the time of export.",
    "2. Amount Paid and Advance Adjusted are shown separately. Balance Due is the pending amount recorded against each bill.",
    "3. Please verify the latest payment entries before collecting or reconciling any balance.",
  ]

  notes.forEach((note) => {
    page2Y = wrapped(
      doc,
      note,
      MARGIN,
      page2Y,
      118,
      4
    ) + 1.5
  })

  /* AUTHORISED SIGNATORY */

  const signX = pageWidth - MARGIN

  setText(doc, { size: 8.5, bold: true })

  doc.text(
    `For ${shopName}`,
    signX,
    page2Y,
    { align: "right" }
  )

  addImageSafe(
    doc,
    shop?.signature,
    signX - 38,
    page2Y + 2,
    38,
    14
  )

  doc.setDrawColor(...COLORS.muted)
  doc.setLineWidth(0.25)

  doc.line(
    signX - 55,
    page2Y + 20,
    signX,
    page2Y + 20
  )

  setText(doc, {
    size: 7.5,
    color: COLORS.muted,
  })

  doc.text(
    "Authorised Signatory",
    signX,
    page2Y + 24,
    { align: "right" }
  )

  drawFooter(doc, shop, shopName)

  return doc
}

/* =========================================================
   DOWNLOAD PDF
   ========================================================= */

export function generateDuesPDF(
  dues = [],
  shop = {},
  options = {}
) {
  const doc = buildDuesPDF(dues, shop, options)

  const fileName = `Dues_Report_${localToday()}.pdf`

  doc.save(fileName)

  return fileName
}

/* =========================================================
   CREATE PDF BLOB
   ========================================================= */

export function createDuesPDFBlob(
  dues = [],
  shop = {},
  options = {}
) {
  return buildDuesPDF(dues, shop, options).output("blob")
}

/* =========================================================
   SHARE PDF
   ========================================================= */

export async function shareDuesPDF(
  dues = [],
  shop = {},
  options = {}
) {
  const blob = createDuesPDFBlob(dues, shop, options)

  const fileName = `Dues_Report_${localToday()}.pdf`

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
      title: "Outstanding Dues Report",
      text: `Dues report from ${clean(shop?.name) || "our shop"}`,
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

export default generateDuesPDF
