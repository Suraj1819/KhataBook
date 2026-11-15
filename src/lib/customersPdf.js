import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"

/* =========================================================
   KHAATAPRO — CUSTOMER PDF REPORTS

   Exports:
   - generateCustomersPDF()
   - generateCustomerPDF()
========================================================= */

const C = {
  ink: [17, 24, 39],
  muted: [95, 102, 112],
  soft: [247, 248, 250],
  line: [205, 210, 218],
  white: [255, 255, 255],
}

const M = 10
const FOOT = 18

const arr = (v) => Array.isArray(v) ? v : []
const n = (v) => Number.isFinite(Number(v)) ? Number(v) : 0
const s = (v) => String(v ?? "").trim()

const money = (v) =>
  `Rs. ${n(v).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const filePart = (v) =>
  (s(v) || "Customer")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")

const date = (v) => {
  if (!v) return "—"

  const d = new Date(v)

  return Number.isNaN(d.getTime())
    ? s(v)
    : d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
}

const address = (c = {}) =>
  [c.address, c.city, c.state, c.pincode]
    .map(s)
    .filter(Boolean)
    .join(", ") || "—"

function font(doc, size = 8, bold = false, color = C.ink) {
  doc.setFont("helvetica", bold ? "bold" : "normal")
  doc.setFontSize(size)
  doc.setTextColor(...color)
}

function line(doc, y) {
  doc.setDrawColor(...C.line)
  doc.setLineWidth(0.25)
  doc.line(
    M,
    y,
    doc.internal.pageSize.getWidth() - M,
    y
  )
}

function section(doc, title, y, subtitle = "") {
  font(doc, 9, true)
  doc.text(title.toUpperCase(), M, y)

  if (subtitle) {
    font(doc, 7, false, C.muted)
    doc.text(subtitle, M, y + 4)
    return y + 8
  }

  return y + 6
}

function header(doc, shop = {}, title, periodLabel = "All time") {
  const w = doc.internal.pageSize.getWidth()

  font(doc, 15, true)
  doc.text(title, w / 2, 13, { align: "center" })

  font(doc, 10, true)
  doc.text(s(shop.name) || "KHAATAPRO", M, 23)

  font(doc, 7, false, C.muted)

  let y = 28
  const addr = address(shop)

  if (addr !== "—") {
    const lines = doc.splitTextToSize(addr, 135)
    doc.text(lines, M, y)
    y += lines.length * 3.8
  }

  const contact = [
    shop.mobile && `Mobile: ${shop.mobile}`,
    shop.email && `Email: ${shop.email}`,
    shop.gstin && `GSTIN: ${shop.gstin}`,
  ].filter(Boolean).join(" | ")

  if (contact) {
    doc.text(doc.splitTextToSize(contact, 135), M, y)
  }

  const x = w - M - 69

  doc.setFillColor(...C.soft)
  doc.setDrawColor(...C.line)
  doc.roundedRect(x, 18, 69, 26, 1.5, 1.5, "FD")

  font(doc, 6.5, true, C.muted)
  doc.text("REPORT GENERATED", x + 4, 24)

  font(doc, 8.2, true)
  doc.text(new Date().toLocaleString("en-IN"), x + 4, 30)

  font(doc, 6.5, false, C.muted)
  doc.text(`Period: ${s(periodLabel) || "All time"}`, x + 4, 37)

  line(doc, 48)

  return 56
}

function cards(doc, items, y) {
  const w = doc.internal.pageSize.getWidth() - M * 2
  const gap = 3
  const cw = (w - gap * (items.length - 1)) / items.length

  items.forEach(([label, value], i) => {
    const x = M + i * (cw + gap)

    doc.setFillColor(...C.soft)
    doc.setDrawColor(...C.line)
    doc.roundedRect(x, y, cw, 19, 1.5, 1.5, "FD")

    font(doc, 6.4, true, C.muted)
    doc.text(label.toUpperCase(), x + 3, y + 5)

    font(doc, 9, true)
    doc.text(
      doc.splitTextToSize(String(value), cw - 6)[0],
      x + 3,
      y + 13
    )
  })

  return y + 26
}

function footer(doc, shopName) {
  const pages = doc.getNumberOfPages()
  const w = doc.internal.pageSize.getWidth()
  const h = doc.internal.pageSize.getHeight()

  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)

    line(doc, h - 14)

    font(doc, 7, true)
    doc.text("KHAATAPRO", M, h - 9)

    font(doc, 6.5, false, C.muted)
    doc.text(
      `${shopName} | Customer Report`,
      M + 27,
      h - 9
    )

    doc.text(
      `Page ${i} of ${pages}`,
      w - M,
      h - 9,
      { align: "right" }
    )
  }
}

function table(doc, startY, head, body, extra = {}) {
  autoTable(doc, {
    startY,
    head: [head],
    body,
    theme: "plain",

    margin: {
      left: M,
      right: M,
      top: 17,
      bottom: FOOT,
    },

    styles: {
      font: "helvetica",
      fontSize: 6.8,
      textColor: C.ink,
      cellPadding: 2.5,
      lineColor: C.line,
      lineWidth: 0.12,
      overflow: "linebreak",
      valign: "middle",
    },

    headStyles: {
      fillColor: C.ink,
      textColor: C.white,
      fontStyle: "bold",
      fontSize: 6.6,
      cellPadding: 3,
    },

    alternateRowStyles: {
      fillColor: C.soft,
    },

    showHead: "everyPage",

    ...extra,
  })

  return doc.lastAutoTable.finalY
}

function continued(doc, title) {
  font(doc, 8, true, C.muted)
  doc.text(title.toUpperCase(), M, 10)
  line(doc, 12)
}

function amountWords(value) {
  const num = Math.floor(Math.abs(n(value)))

  const ones = [
    "", "One", "Two", "Three", "Four", "Five",
    "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen",
    "Fifteen", "Sixteen", "Seventeen", "Eighteen",
    "Nineteen",
  ]

  const tens = [
    "", "", "Twenty", "Thirty", "Forty",
    "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
  ]

  const two = (v) =>
    v < 20
      ? ones[v]
      : `${tens[Math.floor(v / 10)]} ${ones[v % 10]}`.trim()

  const three = (v) =>
    [
      Math.floor(v / 100)
        ? `${ones[Math.floor(v / 100)]} Hundred`
        : "",
      v % 100 ? two(v % 100) : "",
    ].filter(Boolean).join(" ")

  if (!num) return "Zero Rupees Only"

  let v = num
  const parts = []

  const crore = Math.floor(v / 10000000)
  v %= 10000000

  const lakh = Math.floor(v / 100000)
  v %= 100000

  const thousand = Math.floor(v / 1000)
  v %= 1000

  if (crore) parts.push(`${three(crore)} Crore`)
  if (lakh) parts.push(`${three(lakh)} Lakh`)
  if (thousand) parts.push(`${three(thousand)} Thousand`)
  if (v) parts.push(three(v))

  const paise = Math.round((Math.abs(n(value)) % 1) * 100)

  return `${parts.join(" ")} Rupees${
    paise ? ` and ${two(paise)} Paise` : ""
  } Only`
}

/* =========================================================
   CUSTOMER LIST PDF
========================================================= */

export function generateCustomersPDF({
  customers = [],
  shop = {},
  periodLabel = "All time",
} = {}) {
  const rows = arr(customers)

  if (!rows.length) {
    throw new Error("No customers available to export.")
  }

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  })

  const shopName = s(shop.name) || "KHAATAPRO"

  const totalDue = rows.reduce((a, r) => a + n(r.due), 0)
  const totalOverdue = rows.reduce((a, r) => a + n(r.overdue), 0)
  const totalAdvance = rows.reduce((a, r) => a + n(r.advance), 0)
  const totalBills = rows.reduce((a, r) => a + n(r.bills), 0)

  const active = rows.filter((r) => !r.archived).length

  let y = header(
    doc,
    shop,
    "Customer Directory & Financial Report",
    periodLabel
  )

  y = cards(doc, [
    ["Customers in report", rows.length],
    ["Active customers", active],
    ["Total bills", totalBills],
    ["Outstanding", money(totalDue)],
  ], y)

  y = section(doc, "Financial Overview", y)

  y = cards(doc, [
    ["Outstanding balance", money(totalDue)],
    ["Overdue amount", money(totalOverdue)],
    ["Advance held", money(totalAdvance)],
  ], y)

  y = section(
    doc,
    "Customer-wise Directory",
    y,
    "Customer contact information and current account position."
  )

  table(
    doc,
    y + 2,
    [
      "#",
      "Customer",
      "Type",
      "Mobile",
      "WhatsApp",
      "GSTIN",
      "City / State",
      "Bills",
      "Billed",
      "Outstanding",
      "Overdue",
      "Advance",
      "Status",
    ],
    rows.map((r, i) => {
      const c = r.customer || r

      return [
        i + 1,
        c.name || "—",
        c.customer_type || "Individual",
        c.mobile || "—",
        c.whatsapp || "—",
        c.gstin || "—",
        [c.city, c.state].filter(Boolean).join(", ") || "—",
        n(r.bills),
        money(r.billed),
        money(r.due),
        money(r.overdue),
        money(r.advance),
        r.archived ? "Archived" : "Active",
      ]
    }),
    {
      tableWidth: "auto",
      rowPageBreak: "avoid",

      // FIX: compact typography and balanced column widths
      styles: {
        font: "helvetica",
        fontSize: 6.2,
        cellPadding: {
          top: 2.1,
          right: 1.6,
          bottom: 2.1,
          left: 1.6,
        },
        overflow: "linebreak",
        valign: "middle",
        minCellHeight: 8,
      },

      headStyles: {
        fontSize: 6.1,
        cellPadding: {
          top: 3,
          right: 1.5,
          bottom: 3,
          left: 1.5,
        },
        halign: "left",
      },

      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: 30, fontStyle: "bold" },
        2: { cellWidth: 20 },
        3: { cellWidth: 21 },
        4: { cellWidth: 20 },
        5: { cellWidth: 22 },
        6: { cellWidth: 29 },
        7: { cellWidth: 10, halign: "right" },
        8: { cellWidth: 23, halign: "right" },
        9: {
          cellWidth: 25,
          halign: "right",
          fontStyle: "bold",
        },
        10: { cellWidth: 23, halign: "right" },
        11: { cellWidth: 23, halign: "right" },
        12: {
          cellWidth: 15,
          halign: "center",
          fontSize: 5.8,
        },
      },
    }
  )

  doc.addPage()
  continued(doc, "Customer Report — Summary & Notes")

  const summaryRows = [
    ["Customers in report", String(rows.length)],
    ["Active customers", String(active)],
    ["Archived customers", String(rows.length - active)],
    ["Total bills", String(totalBills)],
    ["Outstanding balance", money(totalDue)],
    ["Overdue amount", money(totalOverdue)],
    ["Advance held", money(totalAdvance)],
  ]

  table(doc, 20, ["Particulars", "Value"], summaryRows, {
    tableWidth: 125,

    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 4,
      lineColor: C.line,
      lineWidth: 0.2,
    },

    columnStyles: {
      0: { cellWidth: 78, fontStyle: "bold" },
      1: { halign: "right" },
    },
  })

  let sy = doc.lastAutoTable.finalY + 10

  font(doc, 8, true, C.muted)
  doc.text("OUTSTANDING BALANCE IN WORDS", M, sy)

  font(doc, 9, true)
  doc.text(
    doc.splitTextToSize(amountWords(totalDue), 160),
    M,
    sy + 7
  )

  sy += 20
  line(doc, sy)

  font(doc, 7.5, false, C.muted)
  doc.text(
    "This report reflects the filtered customer records and current financial values supplied by the application.",
    M,
    sy + 6
  )

  footer(doc, shopName)

  doc.save(
    `${filePart(shopName)}_Customers_${new Date().toISOString().slice(0, 10)}.pdf`
  )

  return doc
}

/* =========================================================
   INDIVIDUAL CUSTOMER PDF
========================================================= */

export function generateCustomerPDF({
  customer = {},
  bills = [],
  payments = [],
  advances = [],
  statement = null,
  calc = {},
  shop = {},
  periodLabel = "All time",
  itemsByBill = {},
} = {}) {
  if (!customer?.id && !customer?.name) {
    throw new Error("Customer information is required.")
  }

  const billRows = arr(bills)
  const paymentRows = arr(payments)
  const advanceRows = arr(advances)

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  })

  const shopName = s(shop.name) || "KHAATAPRO"
  const customerName = s(customer.name) || "Customer"

  const totalBilled = billRows.reduce(
    (a, b) => a + n(b.grand_total),
    0
  )

  const totalPaid = paymentRows
    .filter((p) => !p.is_refund)
    .reduce((a, p) => a + n(p.amount), 0)

  const totalRefund = paymentRows
    .filter((p) => p.is_refund)
    .reduce((a, p) => a + n(p.amount), 0)

  const totalBillDue = billRows.reduce(
    (a, b) => a + n(b.amount_due),
    0
  )

  const opening = n(customer.opening_balance)

  const outstanding =
    calc.totalOutstanding != null
      ? n(calc.totalOutstanding)
      : opening + totalBillDue

  const advanceBalance =
    calc.availableAdvance != null
      ? n(calc.availableAdvance)
      : advanceRows.reduce(
          (a, p) => a + n(p.remaining_amount),
          0
        )

  /* PAGE 1 — PROFILE & OVERVIEW */

  let y = header(
    doc,
    shop,
    "Customer Account Report",
    periodLabel
  )

  font(doc, 10, true)
  doc.text(customerName, M, y)
  y += 5

  font(doc, 7.5, false, C.muted)

  const contactLine = [
    customer.mobile && `Mobile: ${customer.mobile}`,
    customer.whatsapp && `WhatsApp: ${customer.whatsapp}`,
    customer.gstin && `GSTIN: ${customer.gstin}`,
  ].filter(Boolean).join(" | ")

  if (contactLine) {
    doc.text(doc.splitTextToSize(contactLine, 190), M, y)
  }

  y += contactLine ? 5 : 0

  const addr = address(customer)

  if (addr !== "—") {
    doc.text(
      doc.splitTextToSize(`Address: ${addr}`, 190),
      M,
      y
    )
    y += 5
  }

  doc.text(
    `Customer Type: ${customer.customer_type || "Individual"}   |   Customer Since: ${date(customer.created_at)}`,
    M,
    y
  )

  y += 8

  y = cards(doc, [
    ["Total Bills", billRows.length],
    ["Total Billed", money(totalBilled)],
    ["Payments Received", money(totalPaid - totalRefund)],
    ["Outstanding", money(outstanding)],
  ], y)

  y = cards(doc, [
    ["Opening Balance", money(opening)],
    ["Bill Due", money(totalBillDue)],
    ["Overdue", money(calc.overdueAmount)],
    ["Available Advance", money(advanceBalance)],
  ], y)

  y = section(doc, "Account Financial Summary", y)

  table(doc, y + 2, ["Particulars", "Amount"], [
    ["Opening balance", money(opening)],
    ["Total billed", money(totalBilled)],
    ["Direct payments received", money(totalPaid)],
    ["Refunds", money(totalRefund)],
    ["Current bill balance due", money(totalBillDue)],
    ["Outstanding including opening balance", money(outstanding)],
    [
      "Total advance received",
      money(
        calc.totalAdvanceReceived ??
        advanceRows.reduce((a, p) => a + n(p.amount), 0)
      ),
    ],
    ["Advance adjusted", money(calc.advanceAdjusted)],
    ["Available advance", money(advanceBalance)],
    [
      "Net position",
      money(calc.netPosition ?? (outstanding - advanceBalance)),
    ],
  ], {
    tableWidth: 125,

    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: 3.2,
      lineColor: C.line,
      lineWidth: 0.15,
    },

    columnStyles: {
      0: { cellWidth: 78, fontStyle: "bold" },
      1: { halign: "right" },
    },
  })

  /* PAGE 2 — BILL LEDGER */

  doc.addPage()
  continued(doc, "Customer Bill Ledger")

  table(
    doc,
    19,
    [
      "#",
      "Bill Number",
      "Bill Date",
      "Due Date",
      "Subtotal",
      "Discount",
      "GST",
      "Grand Total",
      "Paid",
      "Advance Adjusted",
      "Amount Due",
      "Status",
    ],
    billRows.map((b, i) => [
      i + 1,
      b.bill_number || "—",
      date(b.bill_date),
      date(b.due_date),
      money(b.subtotal),
      money(b.discount_amount),
      money(b.total_gst),
      money(b.grand_total),
      money(b.amount_paid),
      money(b.advance_adjusted),
      money(b.amount_due),
      n(b.amount_due) <= 0
        ? "Paid"
        : n(b.amount_paid) > 0 || n(b.advance_adjusted) > 0
          ? "Partial"
          : "Unpaid",
    ]),
    {
      foot: [[
        "",
        "TOTAL",
        "",
        "",
        "",
        "",
        "",
        money(totalBilled),
        money(totalPaid),
        money(calc.advanceAdjusted),
        money(totalBillDue),
        "",
      ]],

      footStyles: {
        fillColor: C.ink,
        textColor: C.white,
        fontStyle: "bold",
      },

      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: 24 },
        2: { cellWidth: 22 },
        3: { cellWidth: 22 },
        4: { cellWidth: 23, halign: "right" },
        5: { cellWidth: 20, halign: "right" },
        6: { cellWidth: 19, halign: "right" },
        7: { cellWidth: 25, halign: "right" },
        8: { cellWidth: 23, halign: "right" },
        9: { cellWidth: 25, halign: "right" },
        10: {
          cellWidth: 25,
          halign: "right",
          fontStyle: "bold",
        },
      },
    }
  )

  /* PAGE 3 — BILL ITEMS */

  doc.addPage()
  continued(doc, "Bill-wise Item Details")

  let itemY = 19
  let hasItems = false

  billRows.forEach((bill) => {
    const items = arr(itemsByBill?.[bill.id])

    if (!items.length) return

    hasItems = true

    itemY = section(
      doc,
      `${bill.bill_number || "Bill"} — ${date(bill.bill_date)}`,
      itemY
    )

    itemY = table(
      doc,
      itemY,
      [
        "Item",
        "Description",
        "Quantity",
        "Unit",
        "Rate",
        "GST %",
        "Amount",
      ],
      items.map((item) => [
        item.item_name || "—",
        item.description || "—",
        item.quantity ?? "—",
        item.unit || "—",
        money(item.rate),
        `${n(item.gst_percent)}%`,
        money(item.total_amount),
      ]),
      {
        margin: {
          left: M,
          right: M,
          top: 17,
          bottom: FOOT,
        },

        columnStyles: {
          0: { cellWidth: 42, fontStyle: "bold" },
          1: { cellWidth: 60 },
          2: { cellWidth: 20, halign: "right" },
          3: { cellWidth: 18 },
          4: { cellWidth: 28, halign: "right" },
          5: { cellWidth: 20, halign: "right" },
          6: { halign: "right", fontStyle: "bold" },
        },
      }
    ) + 8

    if (itemY > 250) {
      doc.addPage()
      continued(doc, "Bill-wise Item Details — Continued")
      itemY = 19
    }
  })

  if (!hasItems) {
    font(doc, 8, false, C.muted)
    doc.text(
      "No bill item details are available for this customer.",
      M,
      25
    )
  }

  /* PAGE 4 — PAYMENTS */

  doc.addPage()
  continued(doc, "Payment & Refund History")

  table(
    doc,
    19,
    [
      "#",
      "Payment Date",
      "Type",
      "Payment Mode",
      "Bill Reference",
      "Notes",
      "Amount",
    ],
    paymentRows.map((p, i) => [
      i + 1,
      date(p.payment_date),
      p.is_refund
        ? "Refund"
        : p.is_advance
          ? "Advance"
          : "Payment",
      p.payment_mode || "Other",
      p.bill_id ? String(p.bill_id).slice(0, 8) : "—",
      p.notes || "—",
      `${p.is_refund ? "-" : "+"}${money(p.amount)}`,
    ]),
    {
      foot: [[
        "",
        "",
        "",
        "",
        "",
        "Net payments received",
        money(totalPaid - totalRefund),
      ]],

      footStyles: {
        fillColor: C.ink,
        textColor: C.white,
        fontStyle: "bold",
      },

      columnStyles: {
        0: { cellWidth: 9, halign: "center" },
        1: { cellWidth: 27 },
        2: { cellWidth: 22 },
        3: { cellWidth: 27 },
        4: { cellWidth: 29 },
        5: { cellWidth: 95 },
        6: { halign: "right", fontStyle: "bold" },
      },
    }
  )

  /* PAGE 5 — ADVANCE LEDGER */

  doc.addPage()
  continued(doc, "Advance Deposit & Adjustment History")

  table(
    doc,
    19,
    [
      "#",
      "Date",
      "Reference",
      "Amount Received",
      "Remaining Amount",
      "Adjusted Amount",
      "Notes",
    ],
    advanceRows.map((a, i) => [
      i + 1,
      date(a.created_at),
      String(a.id || "").slice(0, 8) || "—",
      money(a.amount),
      money(a.remaining_amount),
      money(Math.max(0, n(a.amount) - n(a.remaining_amount))),
      a.notes || "—",
    ]),
    {
      foot: [[
        "",
        "",
        "TOTAL",
        money(advanceRows.reduce((v, a) => v + n(a.amount), 0)),
        money(advanceRows.reduce((v, a) => v + n(a.remaining_amount), 0)),
        money(
          advanceRows.reduce(
            (v, a) => v + Math.max(0, n(a.amount) - n(a.remaining_amount)),
            0
          )
        ),
        "",
      ]],

      footStyles: {
        fillColor: C.ink,
        textColor: C.white,
        fontStyle: "bold",
      },

      columnStyles: {
        0: { cellWidth: 9, halign: "center" },
        1: { cellWidth: 27 },
        2: { cellWidth: 25 },
        3: { cellWidth: 35, halign: "right" },
        4: { cellWidth: 35, halign: "right" },
        5: { cellWidth: 35, halign: "right" },
      },
    }
  )

  /* PAGE 6 — STATEMENT */

  doc.addPage()
  continued(doc, "Customer Account Statement")

  const statementRows = arr(statement?.asc)

  table(
    doc,
    19,
    [
      "Date",
      "Description",
      "Reference",
      "Debit",
      "Credit",
      "Running Balance",
    ],
    statementRows.map((r) => [
      date(r.date),
      r.description || "—",
      r.reference || "—",
      money(r.debit),
      money(r.credit),
      `${money(Math.abs(n(r.balance)))} ${
        n(r.balance) > 0
          ? "Dr"
          : n(r.balance) < 0
            ? "Cr"
            : ""
      }`,
    ]),
    {
      foot: [[
        "",
        "TOTAL",
        "",
        money(statement?.totalDebit),
        money(statement?.totalCredit),
        `${money(Math.abs(n(statement?.closing)))} ${
          n(statement?.closing) > 0
            ? "Dr"
            : n(statement?.closing) < 0
              ? "Cr"
              : ""
        }`,
      ]],

      footStyles: {
        fillColor: C.ink,
        textColor: C.white,
        fontStyle: "bold",
      },

      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 78 },
        2: { cellWidth: 30 },
        3: { cellWidth: 30, halign: "right" },
        4: { cellWidth: 30, halign: "right" },
        5: { halign: "right", fontStyle: "bold" },
      },
    }
  )

  /* FINAL SUMMARY */

  doc.addPage()
  continued(doc, "Final Account Summary & Authorisation")

  table(
    doc,
    20,
    ["Particulars", "Value"],
    [
      ["Customer", customerName],
      ["Customer type", customer.customer_type || "Individual"],
      ["Mobile", customer.mobile || "—"],
      ["WhatsApp", customer.whatsapp || "—"],
      ["GSTIN", customer.gstin || "—"],
      ["Address", address(customer)],
      ["Opening balance", money(opening)],
      ["Total billed", money(totalBilled)],
      ["Payments received", money(totalPaid)],
      ["Refunds", money(totalRefund)],
      ["Current outstanding", money(outstanding)],
      ["Available advance", money(advanceBalance)],
      [
        "Net position",
        money(calc.netPosition ?? outstanding - advanceBalance),
      ],
    ],
    {
      tableWidth: 145,

      styles: {
        font: "helvetica",
        fontSize: 7.5,
        cellPadding: 3.2,
        lineColor: C.line,
        lineWidth: 0.15,
      },

      columnStyles: {
        0: { cellWidth: 78, fontStyle: "bold" },
        1: { halign: "left" },
      },
    }
  )

  let fy = doc.lastAutoTable.finalY + 9

  font(doc, 7, true, C.muted)
  doc.text("OUTSTANDING BALANCE IN WORDS", M, fy)

  font(doc, 9, true)
  doc.text(
    doc.splitTextToSize(amountWords(outstanding), 160),
    M,
    fy + 7
  )

  fy += 20
  line(doc, fy)

  font(doc, 7.2, false, C.muted)
  doc.text(
    "This statement is generated from the customer, bill, payment and advance records available in the selected workspace.",
    M,
    fy + 6
  )

  font(doc, 8.5, true)
  doc.text(`For ${shopName}`, 287, fy + 6, {
    align: "right",
  })

  doc.setDrawColor(...C.muted)
  doc.line(232, fy + 27, 287, fy + 27)

  font(doc, 7.5, false, C.muted)
  doc.text("Authorised Signatory", 287, fy + 32, {
    align: "right",
  })

  footer(doc, shopName)

  doc.save(
    `${filePart(customerName)}_Account_Report_${new Date().toISOString().slice(0, 10)}.pdf`
  )

  return doc
}

export default generateCustomerPDF