
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

const INK = [28, 31, 52]
const MUTED = [105, 110, 126]
const LINE = [224, 226, 234]
const SOFT = [247, 246, 251]
const GREEN = [16, 130, 88]
const BLUE = [55, 115, 190]
const RED = [190, 65, 78]

const n = (value) => Number(value) || 0

const money = (value) =>
  `Rs. ${n(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const dateText = (value) => {
  if (!value) return "—"

  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)

  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
}

const safe = (value) =>
  String(value ?? "").replace(/[\r\n]+/g, " ").trim() || "—"

const filename = (value) =>
  String(value || "dashboard")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

function createDocument(title, subtitle, shopName) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  })

  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFillColor(...SOFT)
  doc.rect(0, 0, pageWidth, 39, "F")

  doc.setTextColor(...INK)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(19)
  doc.text(title, 14, 17)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  doc.text(safe(shopName), 14, 24)
  doc.text(safe(subtitle), 14, 31)

  doc.setDrawColor(...LINE)
  doc.line(14, 36, pageWidth - 14, 36)

  return doc
}

function addFooter(doc) {
  const pages = doc.internal.getNumberOfPages()

  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)

    const width = doc.internal.pageSize.getWidth()
    const height = doc.internal.pageSize.getHeight()

    doc.setDrawColor(...LINE)
    doc.line(14, height - 13, width - 14, height - 13)

    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)

    doc.text("Generated from KHAATAPRO", 14, height - 8)
    doc.text(`Page ${page} of ${pages}`, width - 14, height - 8, {
      align: "right",
    })
  }
}

function addSection(doc, title, rows, startY, options = {}) {
  const y = startY

  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(...INK)
  doc.text(title, 14, y)

  autoTable(doc, {
    startY: y + 4,
    head: options.head || [],
    body: rows,
    theme: "grid",
    margin: {
      left: 14,
      right: 14,
      bottom: 18,
    },
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 2.3,
      textColor: INK,
      lineColor: LINE,
      lineWidth: 0.15,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: INK,
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [250, 250, 252],
    },
    ...options.tableOptions,
  })

  return doc.lastAutoTable.finalY + 9
}

export function exportDashboardPdf(data = {}) {
  const shop = data.shop || {}
  const stats = data.stats || {}

  const doc = createDocument(
    "DASHBOARD REPORT",
    `${safe(data.periodLabel || data.shortLabel)}  |  Generated ${new Date().toLocaleString("en-IN")}`,
    shop.name || "KHAATAPRO"
  )

  let y = 45

  y = addSection(
    doc,
    "FINANCIAL OVERVIEW",
    [
      ["Sales", money(stats.totalSales), "Bills created", String(n(stats.bills))],
      ["Received (net)", money(stats.totalReceived), "Refunded", money(stats.totalRefunded)],
      ["Outstanding dues", money(stats.outstanding), "Overdue", money(stats.overdue)],
      ["Customer advances", money(stats.advances), "Active customers", String(n(stats.customers))],
      ["Pending bills", String(n(stats.pendingBillCount)), "Overdue bills", String(n(stats.overdueBillCount))],
      ["Collection rate", `${n(data.collectionRate)}%`, "Average bill value", money(data.averageBillValue)],
    ],
    y,
    {
      head: [["Metric", "Value", "Metric", "Value"]],
    }
  )

  const trend = (data.trend || []).map((item) => [
    dateText(item.date),
    money(item.sales),
    money(item.received),
  ])

  if (trend.length) {
    y = addSection(doc, "SALES TREND", trend, y, {
      head: [["Date", "Sales", "Received"]],
    })
  }

  const modes = (data.paymentModes || []).map((item) => [
    safe(item.mode),
    money(item.amount),
  ])

  if (modes.length) {
    y = addSection(doc, "PAYMENT MODES", modes, y, {
      head: [["Payment mode", "Amount"]],
    })
  }

  const aging = data.aging || {}

  const agingRows = [
    ["Not yet due", n(aging.current?.count), money(aging.current?.amount)],
    ["1–7 days late", n(aging.d1?.count), money(aging.d1?.amount)],
    ["8–30 days late", n(aging.d2?.count), money(aging.d2?.amount)],
    ["30+ days late", n(aging.d3?.count), money(aging.d3?.amount)],
  ]

  y = addSection(doc, "DUES AGING", agingRows, y, {
    head: [["Age bucket", "Bills", "Outstanding"]],
  })

  const pending = (data.pendingCustomers || []).map((item) => [
    safe(item.name),
    n(item.billCount),
    money(item.due),
    money(item.overdue),
  ])

  if (pending.length) {
    y = addSection(doc, "TOP CUSTOMERS WITH DUES", pending, y, {
      head: [["Customer", "Unpaid bills", "Due amount", "Overdue"]],
    })
  }

  const recentBills = (data.recentBills || []).map((bill) => [
    safe(bill.customers?.name || "Walk-in Customer"),
    safe(bill.bill_number),
    dateText(bill.bill_date),
    money(bill.grand_total),
    money(bill.amount_due),
    safe(
      bill.payment_status ||
        (n(bill.amount_due) > 0 ? "Unpaid" : "Paid")
    ),
  ])

  if (recentBills.length) {
    y = addSection(doc, "RECENT BILLS (CURRENT PAGE)", recentBills, y, {
      head: [["Customer", "Bill no.", "Date", "Total", "Due", "Status"]],
      tableOptions: {
        styles: {
          fontSize: 7.2,
          cellPadding: 1.8,
          overflow: "linebreak",
        },
      },
    })
  }

  const payments = (data.recentPayments || []).map((payment) => [
    safe(payment.customers?.name || "Walk-in Customer"),
    dateText(payment[data.paymentDateColumn || "payment_date"]),
    safe(payment.payment_mode || "Payment"),
    payment.is_refund ? "Refund" : "Received",
    `${payment.is_refund ? "-" : ""}${money(payment.amount)}`,
  ])

  if (payments.length) {
    y = addSection(doc, "RECENT PAYMENTS", payments, y, {
      head: [["Customer", "Date", "Mode", "Type", "Amount"]],
    })
  }

  addFooter(doc)

  doc.save(
    `khaatapro-${filename(shop.name)}-dashboard-${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`
  )
}

export function exportRecentBillsPdf({
  bills = [],
  shop = {},
  periodLabel = "Selected period",
} = {}) {
  const doc = createDocument(
    "RECENT BILLS REPORT",
    `${safe(periodLabel)}  |  ${bills.length} bills  |  ${new Date().toLocaleString("en-IN")}`,
    shop.name || "KHAATAPRO"
  )

  const rows = bills.map((bill, index) => [
    index + 1,
    safe(bill.customers?.name || "Walk-in Customer"),
    safe(bill.bill_number),
    dateText(bill.bill_date),
    money(bill.grand_total),
    money(bill.amount_due),
    safe(
      bill.payment_status ||
        (n(bill.amount_due) > 0 ? "Unpaid" : "Paid")
    ),
  ])

  const total = bills.reduce(
    (sum, bill) => sum + n(bill.grand_total),
    0
  )

  const due = bills.reduce(
    (sum, bill) => sum + n(bill.amount_due),
    0
  )

  autoTable(doc, {
    startY: 45,
    head: [["#", "Customer", "Bill no.", "Date", "Total", "Due", "Status"]],
    body: rows,
    foot: [["", "", "", "TOTAL", money(total), money(due), ""]],
    showFoot: "lastPage",
    theme: "grid",
    margin: {
      left: 10,
      right: 10,
      bottom: 18,
    },
    styles: {
      font: "helvetica",
      fontSize: 7.2,
      cellPadding: 2,
      textColor: INK,
      lineColor: LINE,
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: INK,
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    footStyles: {
      fillColor: SOFT,
      textColor: INK,
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [250, 250, 252],
    },
  })

  addFooter(doc)

  doc.save(
    `khaatapro-recent-bills-${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`
  )
}

function csvCell(value) {
  let text = value == null ? "" : String(value)

  if (/^[\s]*[=+\-@]/.test(text)) {
    text = `'${text}`
  }

  return `"${text.replace(/"/g, '""')}"`
}

function downloadCsv(rows, name) {
  const csv =
    "\uFEFFsep=,\r\n" +
    rows.map((row) => row.map(csvCell).join(",")).join("\r\n")

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  })

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")

  anchor.href = url
  anchor.download = name

  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  URL.revokeObjectURL(url)
}

export function exportRecentBillsCsv({
  bills = [],
  shop = {},
  periodLabel = "Selected period",
} = {}) {
  const rows = [
    ["KHAATAPRO - RECENT BILLS REPORT"],
    [
      "Shop",
      shop.name || "",
      "Period",
      periodLabel,
      "Generated",
      new Date().toLocaleString("en-IN"),
    ],
    [],
    [
      "S.No.",
      "Customer",
      "Bill Number",
      "Bill Date",
      "Grand Total (Rs.)",
      "Amount Due (Rs.)",
      "Payment Status",
    ],
    ...bills.map((bill, index) => [
      index + 1,
      bill.customers?.name || "Walk-in Customer",
      bill.bill_number || "",
      bill.bill_date || "",
      n(bill.grand_total),
      n(bill.amount_due),
      bill.payment_status ||
        (n(bill.amount_due) > 0 ? "Unpaid" : "Paid"),
    ]),
    [],
    ["Total bills", bills.length],
    [
      "Total sales (Rs.)",
      bills.reduce((sum, bill) => sum + n(bill.grand_total), 0),
    ],
    [
      "Total due (Rs.)",
      bills.reduce((sum, bill) => sum + n(bill.amount_due), 0),
    ],
  ]

  downloadCsv(
    rows,
    `khaatapro-recent-bills-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`
  )
}
