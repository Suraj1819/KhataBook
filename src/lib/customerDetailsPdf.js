
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"

/* =========================================================
   KHAATAPRO — CUSTOMER DETAILS PDF
========================================================= */

const PAGE_MARGIN = 10
const FOOTER_SPACE = 18

const num = (value) => Number(value) || 0
const rows = (value) => Array.isArray(value) ? value : []

const text = (value, fallback = "—") => {
  const valueText = String(value ?? "").trim()
  return valueText || fallback
}

const money = (value) =>
  `Rs. ${num(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const date = (value) => {
  if (!value) return "—"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

const safeFileName = (value) =>
  text(value, "Customer")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")

const C = {
  ink: [17, 24, 39],
  muted: [100, 106, 116],
  line: [211, 215, 222],
  soft: [246, 247, 249],
  white: [255, 255, 255],
}

function setFont(doc, size = 8, bold = false, color = C.ink) {
  doc.setFont("helvetica", bold ? "bold" : "normal")
  doc.setFontSize(size)
  doc.setTextColor(...color)
}

function drawLine(doc, y) {
  doc.setDrawColor(...C.line)
  doc.setLineWidth(0.25)
  doc.line(
    PAGE_MARGIN,
    y,
    doc.internal.pageSize.getWidth() - PAGE_MARGIN,
    y
  )
}

function drawHeader(doc, shop, customer, periodLabel) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const shopName = text(shop?.name, "KHAATAPRO")

  setFont(doc, 15, true)
  doc.text("CUSTOMER ACCOUNT DETAILS", pageWidth / 2, 13, {
    align: "center",
  })

  setFont(doc, 10, true)
  doc.text(shopName, PAGE_MARGIN, 23)

  setFont(doc, 7, false, C.muted)

  const shopAddress = [
    shop?.address,
    shop?.city,
    shop?.state,
    shop?.pincode,
  ].filter(Boolean).join(", ")

  if (shopAddress) {
    doc.text(
      doc.splitTextToSize(shopAddress, 130),
      PAGE_MARGIN,
      28
    )
  }

  const contact = [
    shop?.mobile && `Mobile: ${shop.mobile}`,
    shop?.email && `Email: ${shop.email}`,
    shop?.gstin && `GSTIN: ${shop.gstin}`,
  ].filter(Boolean).join(" | ")

  if (contact) {
    doc.text(
      doc.splitTextToSize(contact, 130),
      PAGE_MARGIN,
      33
    )
  }

  const boxX = pageWidth - PAGE_MARGIN - 70

  doc.setFillColor(...C.soft)
  doc.setDrawColor(...C.line)
  doc.roundedRect(boxX, 18, 70, 27, 1.5, 1.5, "FD")

  setFont(doc, 6.5, true, C.muted)
  doc.text("CUSTOMER", boxX + 4, 24)

  setFont(doc, 9, true)
  doc.text(
    doc.splitTextToSize(text(customer?.name), 62)[0],
    boxX + 4,
    30
  )

  setFont(doc, 6.5, false, C.muted)
  doc.text(
    `Period: ${text(periodLabel, "All time")}`,
    boxX + 4,
    37
  )

  drawLine(doc, 49)
  return 56
}

function drawFooter(doc, shopName) {
  const pageCount = doc.getNumberOfPages()
  const width = doc.internal.pageSize.getWidth()
  const height = doc.internal.pageSize.getHeight()

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    drawLine(doc, height - 14)

    setFont(doc, 7, true)
    doc.text("KHAATAPRO", PAGE_MARGIN, height - 9)

    setFont(doc, 6.5, false, C.muted)
    doc.text(
      `${shopName} | Customer Account Report`,
      PAGE_MARGIN + 27,
      height - 9
    )

    doc.text(
      `Page ${page} of ${pageCount}`,
      width - PAGE_MARGIN,
      height - 9,
      { align: "right" }
    )
  }
}

function drawSection(doc, title, y, subtitle = "") {
  setFont(doc, 9, true)
  doc.text(String(title).toUpperCase(), PAGE_MARGIN, y)

  if (subtitle) {
    setFont(doc, 7, false, C.muted)
    doc.text(subtitle, PAGE_MARGIN, y + 4)
    return y + 9
  }

  return y + 6
}

function drawCards(doc, items, y) {
  const width = doc.internal.pageSize.getWidth() - PAGE_MARGIN * 2
  const gap = 3
  const cardWidth = (width - gap * (items.length - 1)) / items.length

  items.forEach(([label, value], index) => {
    const x = PAGE_MARGIN + index * (cardWidth + gap)

    doc.setFillColor(...C.soft)
    doc.setDrawColor(...C.line)
    doc.roundedRect(x, y, cardWidth, 19, 1.5, 1.5, "FD")

    setFont(doc, 6.3, true, C.muted)
    doc.text(String(label).toUpperCase(), x + 3, y + 5)

    setFont(doc, 8.5, true)
    const valueLines = doc.splitTextToSize(
      String(value),
      cardWidth - 6
    )
    doc.text(valueLines[0], x + 3, y + 13)
  })

  return y + 25
}

function makeTable(doc, startY, head, body, options = {}) {
  autoTable(doc, {
    startY,
    head: [head],
    body,
    theme: "plain",

    margin: {
      left: PAGE_MARGIN,
      right: PAGE_MARGIN,
      top: 17,
      bottom: FOOTER_SPACE,
    },

    styles: {
      font: "helvetica",
      fontSize: 7,
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
      fontSize: 6.8,
      cellPadding: 3,
    },

    alternateRowStyles: {
      fillColor: C.soft,
    },

    showHead: "everyPage",
    ...options,
  })

  return doc.lastAutoTable.finalY
}

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

  const twoDigits = (number) =>
    number < 20
      ? ones[number]
      : `${tens[Math.floor(number / 10)]} ${ones[number % 10]}`.trim()

  const threeDigits = (number) => [
    Math.floor(number / 100)
      ? `${ones[Math.floor(number / 100)]} Hundred`
      : "",
    number % 100 ? twoDigits(number % 100) : "",
  ].filter(Boolean).join(" ")

  let number = Math.floor(Math.abs(num(value)))
  if (!number) return "Zero Rupees Only"

  const parts = []

  const crore = Math.floor(number / 10000000)
  number %= 10000000

  const lakh = Math.floor(number / 100000)
  number %= 100000

  const thousand = Math.floor(number / 1000)
  number %= 1000

  if (crore) parts.push(`${threeDigits(crore)} Crore`)
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`)
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`)
  if (number) parts.push(threeDigits(number))

  const paise = Math.round((Math.abs(num(value)) % 1) * 100)

  return `${parts.join(" ")} Rupees${
    paise ? ` and ${twoDigits(paise)} Paise` : ""
  } Only`
}

function statusOfBill(bill) {
  if (num(bill.amount_due) <= 0) return "Paid"

  if (
    num(bill.amount_paid) > 0 ||
    num(bill.advance_adjusted) > 0
  ) {
    return "Partial"
  }

  return "Unpaid"
}

/* =========================================================
   MAIN CUSTOMER DETAILS PDF
========================================================= */

export function generateCustomerDetailsPDF({
  customer,
  bills = [],
  payments = [],
  advances = [],
  billItems = [],
  calc = {},
  statement = {},
  shop = {},
  periodLabel = "All time",
} = {}) {
  if (!customer) {
    throw new Error("Customer details are required.")
  }

  const billRows = rows(bills)
  const paymentRows = rows(payments)
  const advanceRows = rows(advances)
  const itemRows = rows(billItems)
  const statementRows = rows(statement?.rows)

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  })

  const shopName = text(shop?.name, "KHAATAPRO")

  const totalPurchase = num(calc.totalPurchase)
  const totalDue = num(calc.totalDue)
  const totalReceived = num(calc.totalReceived)
  const totalRefunded = num(calc.totalRefunded)
  const totalAdvance = num(calc.totalAdvanceReceived)
  const availableAdvance = num(calc.availableAdvance)

  /* PAGE 1 — CUSTOMER PROFILE */

  let y = drawHeader(doc, shop, customer, periodLabel)

  setFont(doc, 10, true)
  doc.text(text(customer.name), PAGE_MARGIN, y)
  y += 5

  setFont(doc, 7.2, false, C.muted)

  const customerAddress = [
    customer.address,
    customer.city,
    customer.state,
    customer.pincode,
  ].filter(Boolean).join(", ")

  const profile = [
    customer.mobile && `Mobile: ${customer.mobile}`,
    customer.whatsapp && `WhatsApp: ${customer.whatsapp}`,
    customer.gstin && `GSTIN: ${customer.gstin}`,
    `Type: ${text(customer.customer_type, "Individual")}`,
    customer.created_at && `Customer since: ${date(customer.created_at)}`,
  ].filter(Boolean).join(" | ")

  if (profile) {
    doc.text(
      doc.splitTextToSize(profile, 270),
      PAGE_MARGIN,
      y
    )
    y += 5
  }

  if (customerAddress) {
    doc.text(
      doc.splitTextToSize(`Address: ${customerAddress}`, 270),
      PAGE_MARGIN,
      y
    )
    y += 5
  }

  y += 3

  y = drawCards(doc, [
    ["Total purchase", money(totalPurchase)],
    ["Total received", money(totalReceived)],
    ["Outstanding dues", money(totalDue)],
    ["Advance balance", money(availableAdvance)],
  ], y)

  y = drawCards(doc, [
    ["Total bills", calc.totalBills ?? billRows.length],
    ["Overdue amount", money(calc.overdueAmount)],
    ["Due today", money(calc.dueTodayAmount)],
    ["Collection rate", `${num(calc.collectionRate)}%`],
  ], y)

  y = drawSection(doc, "Account Financial Summary", y)

  makeTable(doc, y, ["Particulars", "Amount"], [
    ["Total purchase / billed", money(totalPurchase)],
    ["Total received (net of refunds)", money(totalReceived)],
    ["Total refunds", money(totalRefunded)],
    ["Outstanding bill dues", money(totalDue)],
    ["Advance received", money(totalAdvance)],
    ["Advance adjusted", money(calc.advanceAdjusted)],
    ["Available advance", money(availableAdvance)],
    ["Overdue amount", money(calc.overdueAmount)],
    ["Due today", money(calc.dueTodayAmount)],
    ["Average bill value", money(calc.averageBill)],
  ], {
    tableWidth: 130,
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: 3,
      lineColor: C.line,
      lineWidth: 0.15,
    },
    columnStyles: {
      0: { cellWidth: 85, fontStyle: "bold" },
      1: { halign: "right" },
    },
  })

  /* PAGE 2 — BILL LEDGER */

  doc.addPage()

  setFont(doc, 8, true, C.muted)
  doc.text("CUSTOMER BILL LEDGER", PAGE_MARGIN, 10)
  drawLine(doc, 12)

  makeTable(doc, 19, [
    "#",
    "Bill Number",
    "Bill Date",
    "Due Date",
    "Status",
    "Subtotal",
    "Discount",
    "GST",
    "Grand Total",
    "Paid",
    "Advance Adjusted",
    "Amount Due",
  ], billRows.map((bill, index) => [
    index + 1,
    text(bill.bill_number),
    date(bill.bill_date),
    date(bill.due_date),
    statusOfBill(bill),
    money(bill.subtotal),
    money(bill.discount_amount),
    money(bill.total_gst),
    money(bill.grand_total),
    money(bill.amount_paid),
    money(bill.advance_adjusted),
    money(bill.amount_due),
  ]), {
    rowPageBreak: "avoid",
    styles: {
      fontSize: 6.4,
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 24 },
      2: { cellWidth: 21 },
      3: { cellWidth: 21 },
      4: { cellWidth: 17 },
      5: { cellWidth: 22, halign: "right" },
      6: { cellWidth: 20, halign: "right" },
      7: { cellWidth: 18, halign: "right" },
      8: { cellWidth: 24, halign: "right" },
      9: { cellWidth: 22, halign: "right" },
      10: { cellWidth: 25, halign: "right" },
      11: {
        cellWidth: 24,
        halign: "right",
        fontStyle: "bold",
      },
    },
  })

  /* PAGE 3 — BILL-WISE PAYMENT BREAKDOWN */

  doc.addPage()

  setFont(doc, 8, true, C.muted)
  doc.text("BILL-WISE PAYMENT BREAKDOWN", PAGE_MARGIN, 10)
  drawLine(doc, 12)

  let paymentBreakdownY = 19

  if (!billRows.length) {
    setFont(doc, 8, false, C.muted)
    doc.text("No bill records are available.", PAGE_MARGIN, paymentBreakdownY + 5)
  } else {
    billRows.forEach((bill) => {
      const linkedPayments = paymentRows
        .filter((payment) => payment.bill_id === bill.id)
        .sort((a, b) =>
          new Date(a.payment_date || 0) - new Date(b.payment_date || 0)
        )

      const directPayments = linkedPayments.filter(
        (payment) => !payment.is_refund && !payment.is_advance
      )

      const refunds = linkedPayments.filter((payment) => payment.is_refund)

      const directPaidFromTransactions = directPayments.reduce(
        (sum, payment) => sum + num(payment.amount), 0
      )

      const refundedFromTransactions = refunds.reduce(
        (sum, payment) => sum + num(payment.amount), 0
      )

      const billPaid = num(bill.amount_paid)
      const advanceAdjusted = num(bill.advance_adjusted)
      const billDue = num(bill.amount_due)
      const grandTotal = num(bill.grand_total)
      const transactionNet = directPaidFromTransactions - refundedFromTransactions

      const requiredHeight = linkedPayments.length ? 48 : 42

      if (paymentBreakdownY + requiredHeight > 265) {
        doc.addPage()
        setFont(doc, 8, true, C.muted)
        doc.text("BILL-WISE PAYMENT BREAKDOWN — CONTINUED", PAGE_MARGIN, 10)
        drawLine(doc, 12)
        paymentBreakdownY = 19
      }

      paymentBreakdownY = drawSection(
        doc,
        `${text(bill.bill_number, "Bill")} · ${date(bill.bill_date)}`,
        paymentBreakdownY,
        `Due date: ${date(bill.due_date)}  |  Status: ${statusOfBill(bill)}`
      )

      paymentBreakdownY = drawCards(doc, [
        ["Bill grand total", money(grandTotal)],
        ["Paid against bill", money(billPaid)],
        ["Advance adjusted", money(advanceAdjusted)],
        ["Balance due", money(billDue)],
      ], paymentBreakdownY)

      setFont(doc, 6.8, false, C.muted)
      doc.text(
        `Payment transactions linked to this bill: ${linkedPayments.length}  |  ` +
        `Transaction payments: ${money(directPaidFromTransactions)}  |  ` +
        `Refunds: ${money(refundedFromTransactions)}  |  ` +
        `Net transactions: ${money(transactionNet)}`,
        PAGE_MARGIN,
        paymentBreakdownY
      )
      paymentBreakdownY += 5

      if (linkedPayments.length) {
        paymentBreakdownY = makeTable(doc, paymentBreakdownY, [
          "#",
          "Payment Date",
          "Transaction Type",
          "Payment Mode",
          "Amount",
          "Notes / Reference",
        ], linkedPayments.map((payment, index) => [
          index + 1,
          date(payment.payment_date),
          payment.is_refund
            ? "Refund"
            : payment.is_advance
              ? "Advance"
              : "Bill Payment",
          text(payment.payment_mode, "Other"),
          `${payment.is_refund ? "-" : "+"}${money(payment.amount)}`,
          text(payment.notes),
        ]), {
          styles: {
            fontSize: 6.6,
            cellPadding: 2.2,
          },
          columnStyles: {
            0: { cellWidth: 10, halign: "center" },
            1: { cellWidth: 28 },
            2: { cellWidth: 30 },
            3: { cellWidth: 30 },
            4: { cellWidth: 32, halign: "right", fontStyle: "bold" },
            5: { cellWidth: 125 },
          },
        }) + 5
      } else {
        setFont(doc, 7, false, C.muted)
        doc.text(
          "No individual payment transaction is linked to this bill. The paid / advance / due figures above are taken from the bill record.",
          PAGE_MARGIN,
          paymentBreakdownY
        )
        paymentBreakdownY += 8
      }

      drawLine(doc, paymentBreakdownY)
      paymentBreakdownY += 5
    })
  }

  /* PAGE 4 — BILL ITEMS */

  doc.addPage()

  setFont(doc, 8, true, C.muted)
  doc.text("BILL-WISE ITEM DETAILS", PAGE_MARGIN, 10)
  drawLine(doc, 12)

  let itemY = 19

  if (!itemRows.length) {
    setFont(doc, 8, false, C.muted)
    doc.text(
      "No bill item details are available.",
      PAGE_MARGIN,
      itemY + 5
    )
  } else {
    billRows.forEach((bill) => {
      const items = itemRows.filter(
        (item) => item.bill_id === bill.id
      )

      if (!items.length) return

      if (itemY > 245) {
        doc.addPage()
        setFont(doc, 8, true, C.muted)
        doc.text(
          "BILL-WISE ITEM DETAILS — CONTINUED",
          PAGE_MARGIN,
          10
        )
        drawLine(doc, 12)
        itemY = 19
      }

      itemY = drawSection(
        doc,
        `${text(bill.bill_number, "Bill")} · ${date(bill.bill_date)}`,
        itemY
      )

      itemY = makeTable(doc, itemY, [
        "Item",
        "Description",
        "Quantity",
        "Unit",
        "Rate",
        "GST %",
        "Amount",
      ], items.map((item) => [
        text(item.item_name),
        text(item.description),
        item.quantity ?? "—",
        text(item.unit),
        money(item.rate),
        `${num(item.gst_percent)}%`,
        money(item.total_amount),
      ]), {
        styles: {
          fontSize: 6.8,
          cellPadding: 2.2,
        },
        columnStyles: {
          0: { cellWidth: 42, fontStyle: "bold" },
          1: { cellWidth: 70 },
          2: { cellWidth: 20, halign: "right" },
          3: { cellWidth: 18 },
          4: { cellWidth: 25, halign: "right" },
          5: { cellWidth: 18, halign: "right" },
          6: {
            cellWidth: 25,
            halign: "right",
            fontStyle: "bold",
          },
        },
      }) + 7
    })
  }

  /* PAGE 5 — PAYMENT HISTORY */

  doc.addPage()

  setFont(doc, 8, true, C.muted)
  doc.text("PAYMENT & REFUND HISTORY", PAGE_MARGIN, 10)
  drawLine(doc, 12)

  makeTable(doc, 19, [
    "#",
    "Payment Date",
    "Type",
    "Payment Mode",
    "Bill Reference",
    "Notes",
    "Amount",
  ], paymentRows.map((payment, index) => {
    const relatedBill = billRows.find(
      (bill) => bill.id === payment.bill_id
    )

    return [
      index + 1,
      date(payment.payment_date),
      payment.is_refund
        ? "Refund"
        : payment.is_advance
          ? "Advance"
          : "Payment",
      text(payment.payment_mode, "Other"),
      text(
        relatedBill?.bill_number,
        payment.bill_id ? String(payment.bill_id).slice(0, 8) : "—"
      ),
      text(payment.notes),
      `${payment.is_refund ? "-" : "+"}${money(payment.amount)}`,
    ]
  }), {
    styles: {
      fontSize: 6.8,
      cellPadding: 2.4,
    },
    columnStyles: {
      0: { cellWidth: 9, halign: "center" },
      1: { cellWidth: 25 },
      2: { cellWidth: 20 },
      3: { cellWidth: 25 },
      4: { cellWidth: 30 },
      5: { cellWidth: 105 },
      6: {
        cellWidth: 28,
        halign: "right",
        fontStyle: "bold",
      },
    },
  })

  /* PAGE 6 — ADVANCE HISTORY */

  doc.addPage()

  setFont(doc, 8, true, C.muted)
  doc.text("ADVANCE DEPOSIT HISTORY", PAGE_MARGIN, 10)
  drawLine(doc, 12)

  makeTable(doc, 19, [
    "#",
    "Date",
    "Reference",
    "Amount Received",
    "Amount Adjusted",
    "Remaining Amount",
    "Notes",
  ], advanceRows.map((advance, index) => {
    const original = num(advance.amount)
    const remaining = num(advance.remaining_amount)

    return [
      index + 1,
      date(advance.created_at),
      String(advance.id || "").slice(0, 8) || "—",
      money(original),
      money(Math.max(0, original - remaining)),
      money(remaining),
      text(advance.notes),
    ]
  }), {
    styles: {
      fontSize: 6.8,
      cellPadding: 2.5,
    },
    columnStyles: {
      0: { cellWidth: 9, halign: "center" },
      1: { cellWidth: 25 },
      2: { cellWidth: 25 },
      3: { cellWidth: 32, halign: "right" },
      4: { cellWidth: 32, halign: "right" },
      5: { cellWidth: 32, halign: "right" },
      6: { cellWidth: 85 },
    },
  })

  /* PAGE 7 — ACCOUNT STATEMENT */

  doc.addPage()

  setFont(doc, 8, true, C.muted)
  doc.text("CUSTOMER ACCOUNT STATEMENT", PAGE_MARGIN, 10)
  drawLine(doc, 12)

  makeTable(doc, 19, [
    "Date",
    "Description",
    "Reference",
    "Debit",
    "Credit",
    "Running Balance",
  ], statementRows.map((row) => [
    date(row.date),
    text(row.description),
    text(row.reference),
    money(row.debit),
    money(row.credit),
    `${money(Math.abs(num(row.balance)))} ${
      num(row.balance) > 0
        ? "Dr"
        : num(row.balance) < 0
          ? "Cr"
          : ""
    }`,
  ]), {
    styles: {
      fontSize: 6.8,
      cellPadding: 2.5,
    },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 80 },
      2: { cellWidth: 28 },
      3: { cellWidth: 32, halign: "right" },
      4: { cellWidth: 32, halign: "right" },
      5: {
        cellWidth: 43,
        halign: "right",
        fontStyle: "bold",
      },
    },
  })

  /* FINAL SUMMARY */

  doc.addPage()

  setFont(doc, 8, true, C.muted)
  doc.text("FINAL CUSTOMER ACCOUNT SUMMARY", PAGE_MARGIN, 10)
  drawLine(doc, 12)

  makeTable(doc, 19, ["Particulars", "Value"], [
    ["Customer", text(customer.name)],
    ["Mobile", text(customer.mobile)],
    ["WhatsApp", text(customer.whatsapp)],
    ["Customer type", text(customer.customer_type, "Individual")],
    ["GSTIN", text(customer.gstin)],
    ["Address", text(customerAddress)],
    ["Total purchase", money(totalPurchase)],
    ["Total received", money(totalReceived)],
    ["Total refunds", money(totalRefunded)],
    ["Outstanding dues", money(totalDue)],
    ["Advance received", money(totalAdvance)],
    ["Available advance", money(availableAdvance)],
    [
      "Net outstanding after advance",
      money(totalDue - availableAdvance),
    ],
  ], {
    tableWidth: 145,
    styles: {
      fontSize: 7.5,
      cellPadding: 3.2,
      lineColor: C.line,
      lineWidth: 0.15,
    },
    columnStyles: {
      0: { cellWidth: 80, fontStyle: "bold" },
      1: { halign: "left" },
    },
  })

  let summaryY = doc.lastAutoTable.finalY + 10

  setFont(doc, 7, true, C.muted)
  doc.text(
    "OUTSTANDING AMOUNT IN WORDS",
    PAGE_MARGIN,
    summaryY
  )

  setFont(doc, 9, true)
  doc.text(
    doc.splitTextToSize(amountInWords(totalDue), 170),
    PAGE_MARGIN,
    summaryY + 7
  )

  summaryY += 22
  drawLine(doc, summaryY)

  setFont(doc, 7, false, C.muted)
  doc.text(
    "This report is generated from the customer, bill, payment, advance and statement records available in the selected workspace.",
    PAGE_MARGIN,
    summaryY + 6
  )

  setFont(doc, 8.5, true)
  doc.text(`For ${shopName}`, 287, summaryY + 6, {
    align: "right",
  })

  doc.setDrawColor(...C.muted)
  doc.line(232, summaryY + 27, 287, summaryY + 27)

  setFont(doc, 7.5, false, C.muted)
  doc.text("Authorised Signatory", 287, summaryY + 32, {
    align: "right",
  })

  drawFooter(doc, shopName)

  doc.save(
    `${safeFileName(customer.name)}_Customer_Details_${new Date().toISOString().slice(0, 10)}.pdf`
  )

  return doc
}

export default generateCustomerDetailsPDF
