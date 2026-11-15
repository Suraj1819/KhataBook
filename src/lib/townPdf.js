
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { formatDate } from "./utils"

/* =========================================================
   KHAATAPRO - TOWN DETAILS REPORT
   Payments PDF visual system | A4 Landscape | Monochrome

   Usage:
   generateTownDetailsPDF({ towns, shop, periodLabel })
========================================================= */

const COLORS = {
  ink: [17, 24, 39],
  muted: [95, 102, 112],
  soft: [247, 248, 250],
  light: [242, 243, 245],
  line: [205, 210, 218],
  white: [255, 255, 255],
}

const MARGIN = 10
const FOOTER_SPACE = 20

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
  (clean(value) || "Town_Details")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")

const addressOf = (entity = {}) =>
  [entity.address, entity.city, entity.state, entity.pincode ? `PIN ${entity.pincode}` : ""]
    .map(clean)
    .filter(Boolean)
    .join(", ")

const dateLabel = (value) => {
  if (!value) return "—"
  try {
    return formatDate(value)
  } catch {
    return clean(value)
  }
}

const safeArray = (value) => Array.isArray(value) ? value : []

function setText(doc, { size = 8, bold = false, italic = false, color = COLORS.ink } = {}) {
  doc.setFont("helvetica", bold ? "bold" : italic ? "italic" : "normal")
  doc.setFontSize(size)
  doc.setTextColor(...color)
}

function wrapped(doc, value, x, y, width, lineHeight = 4) {
  const lines = doc.splitTextToSize(clean(value) || "—", width)
  doc.text(lines, x, y)
  return y + lines.length * lineHeight
}

function kv(doc, label, value, x, y, maxWidth, size = 8) {
  setText(doc, { size, bold: true })
  doc.text(label, x, y)
  const labelWidth = doc.getTextWidth(label) + 1.5
  setText(doc, { size })
  const lines = doc.splitTextToSize(clean(value) || "—", Math.max(10, maxWidth - labelWidth))
  doc.text(lines[0], x + labelWidth, y)
  let nextY = y + 4.2
  lines.slice(1).forEach((line) => {
    doc.text(line, x + labelWidth, nextY)
    nextY += 4.2
  })
  return nextY
}

/* =========================================================
   TOTALS & ANALYTICS
========================================================= */

function getTotals(towns) {
  return safeArray(towns).reduce((total, town) => {
    const customers = safeArray(town?.customers)
    total.towns += 1
    total.customers += customers.length
    total.opening += amount(town?.opening)
    total.billDue += amount(town?.billDue)
    total.overdue += amount(town?.overdue)
    total.due += amount(town?.due)
    total.pendingBills += customers.reduce(
      (sum, row) => sum + safeArray(row?.pendingBills).length,
      0
    )
    return total
  }, {
    towns: 0,
    customers: 0,
    opening: 0,
    billDue: 0,
    overdue: 0,
    due: 0,
    pendingBills: 0,
  })
}

function getTownSummary(towns) {
  return safeArray(towns).map((town) => {
    const customers = safeArray(town?.customers)
    const customerCount = customers.length
    const pendingBills = customers.reduce(
      (sum, row) => sum + safeArray(row?.pendingBills).length,
      0
    )
    return {
      name: clean(town?.name) || "Town not specified",
      customers: customerCount,
      pendingBills,
      opening: amount(town?.opening),
      billDue: amount(town?.billDue),
      overdue: amount(town?.overdue),
      due: amount(town?.due),
    }
  }).sort((a, b) => b.due - a.due)
}

function getCustomerSummary(towns) {
  const rows = []
  safeArray(towns).forEach((town) => {
    safeArray(town?.customers).forEach((row) => {
      const customer = row?.customer || {}
      rows.push({
        town: clean(town?.name) || "Town not specified",
        name: clean(customer?.name) || "—",
        mobile: clean(customer?.mobile || customer?.whatsapp) || "—",
        opening: amount(row?.opening),
        billDue: amount(row?.billDue),
        overdue: amount(row?.overdue),
        due: amount(row?.due),
        pendingBills: safeArray(row?.pendingBills).length,
      })
    })
  })
  return rows.sort((a, b) => b.due - a.due)
}

/* =========================================================
   HEADER & SUMMARY CARDS
========================================================= */

function drawHeader(doc, shop, periodLabel, totals) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const shopName = clean(shop?.name) || "KHAATAPRO"
  const shopAddress = addressOf(shop)
  const generatedAt = new Date().toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })

  setText(doc, { size: 15, bold: true })
  doc.text("Town Details Report", pageWidth / 2, 13, { align: "center" })

  setText(doc, { size: 10, bold: true })
  doc.text(shopName, MARGIN, 23)

  setText(doc, { size: 7.5, color: COLORS.muted })
  let shopY = 28
  if (shopAddress) shopY = wrapped(doc, shopAddress, MARGIN, shopY, pageWidth * 0.55, 3.8)

  const contacts = [
    shop?.mobile ? `Mobile: ${shop.mobile}` : "",
    shop?.email ? `Email: ${shop.email}` : "",
    shop?.gstin ? `GSTIN: ${shop.gstin}` : "",
  ].filter(Boolean).join("  |  ")
  if (contacts) wrapped(doc, contacts, MARGIN, shopY, pageWidth * 0.55, 3.8)

  const boxWidth = 66
  const boxX = pageWidth - MARGIN - boxWidth
  doc.setFillColor(...COLORS.soft)
  doc.setDrawColor(...COLORS.line)
  doc.setLineWidth(0.25)
  doc.roundedRect(boxX, 18, boxWidth, 25, 1.8, 1.8, "FD")

  setText(doc, { size: 6.8, bold: true, color: COLORS.muted })
  doc.text("REPORT GENERATED", boxX + 4, 24)
  setText(doc, { size: 9, bold: true })
  doc.text(generatedAt, boxX + 4, 30)
  setText(doc, { size: 6.8, bold: true, color: COLORS.muted })
  doc.text(`${totals.towns} TOWNS  |  ${totals.customers} CUSTOMERS`, boxX + 4, 37)

  doc.setDrawColor(...COLORS.line)
  doc.setLineWidth(0.35)
  doc.line(MARGIN, 47, pageWidth - MARGIN, 47)
  return 53
}

function drawSummaryCards(doc, totals, periodLabel, startY) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const contentWidth = pageWidth - MARGIN * 2
  const gap = 3
  const cardWidth = (contentWidth - gap * 3) / 4
  const cardHeight = 18
  const cards = [
    ["TOTAL TOWNS", String(totals.towns)],
    ["TOTAL CUSTOMERS", String(totals.customers)],
    ["PENDING BILLS", String(totals.pendingBills)],
    ["OUTSTANDING BALANCE", money(totals.due)],
  ]

  cards.forEach(([label, value], index) => {
    const x = MARGIN + index * (cardWidth + gap)
    doc.setFillColor(...COLORS.soft)
    doc.setDrawColor(...COLORS.line)
    doc.setLineWidth(0.3)
    doc.roundedRect(x, startY, cardWidth, cardHeight, 1.5, 1.5, "FD")
    setText(doc, { size: 6.5, bold: true, color: COLORS.muted })
    doc.text(label, x + 3, startY + 5)
    setText(doc, { size: 9, bold: true })
    doc.text(doc.splitTextToSize(value, cardWidth - 6)[0], x + 3, startY + 13)
  })

  setText(doc, { size: 7, color: COLORS.muted })
  doc.text(`Report Period: ${clean(periodLabel) || "Selected period"}`, MARGIN, startY + 25)
  return startY + 30
}

function drawReportDetails(doc, totals, startY) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const width = (pageWidth - MARGIN * 2 - 12) / 4
  const xs = [0, 1, 2, 3].map((i) => MARGIN + i * (width + 4))
  const items = [
    ["OPENING BALANCE", money(totals.opening)],
    ["BILL DUE", money(totals.billDue)],
    ["OVERDUE", money(totals.overdue)],
    ["BALANCE DUE", money(totals.due)],
  ]
  items.forEach(([label, value], i) => {
    setText(doc, { size: 6.8, bold: true, color: COLORS.muted })
    doc.text(label, xs[i], startY)
    setText(doc, { size: 8.5, bold: true })
    doc.text(doc.splitTextToSize(value, width - 2)[0], xs[i], startY + 7)
  })
  doc.setDrawColor(...COLORS.line)
  doc.setLineWidth(0.25)
  doc.line(MARGIN, startY + 13, pageWidth - MARGIN, startY + 13)
  return startY + 19
}

/* =========================================================
   MAIN TOWN-WISE CUSTOMER TABLE
========================================================= */

function makeCustomerRows(towns) {
  const body = []
  safeArray(towns).forEach((town) => {
    const customers = safeArray(town?.customers)
    body.push([{
      content: clean(town?.name) || "Town not specified",
      colSpan: 9,
      styles: {
        fillColor: COLORS.soft,
        textColor: COLORS.ink,
        fontStyle: "bold",
        fontSize: 7.5,
        cellPadding: { top: 3.5, bottom: 2.5, left: 2, right: 2 },
        lineWidth: { bottom: 0.3 },
        lineColor: COLORS.line,
      },
    }])

    customers.forEach((row) => {
      const customer = row?.customer || {}
      const pending = safeArray(row?.pendingBills).map((bill) => {
        const billNo = bill?.number ? `#${bill.number}` : "Bill"
        const dueDate = bill?.dueDate ? dateLabel(bill.dueDate) : "No due date"
        return `${billNo} | ${dueDate} | ${money(bill?.due)}`
      }).join("\n")

      body.push([
        clean(customer?.name) || "—",
        clean(customer?.mobile || customer?.whatsapp) || "—",
        addressOf(customer) || "—",
        clean(customer?.customer_type) || "Individual",
        money(row?.opening),
        money(row?.billDue),
        amount(row?.overdue) > 0 ? money(row?.overdue) : "—",
        money(row?.due),
        pending || "—",
      ])
    })

    body.push([
      { content: "Town Total", colSpan: 4, styles: { halign: "right", fontStyle: "bold", fillColor: COLORS.white, textColor: COLORS.ink, lineColor: COLORS.line, lineWidth: { top: 0.3 } } },
      ...[town?.opening, town?.billDue, town?.overdue, town?.due].map((value) => ({
        content: money(value),
        styles: { fontStyle: "bold", textColor: COLORS.ink, lineColor: COLORS.line, lineWidth: { top: 0.3 } },
      })),
      { content: `${customers.reduce((sum, row) => sum + safeArray(row?.pendingBills).length, 0)} bills`, styles: { fontStyle: "bold", lineColor: COLORS.line, lineWidth: { top: 0.3 } } },
    ])
  })
  return body
}

function drawSummaryBox(doc, rows, x, y, width) {
  const rowHeight = (row) => row.type === "grand" ? 10 : 6
  const height = rows.reduce((sum, row) => sum + rowHeight(row), 0) + 4
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
      setText(doc, { size: 8.5, bold: true, color: COLORS.white })
    } else {
      setText(doc, { size: 7.5 })
    }
    doc.text(row.label, x + 5, baseline)
    doc.text(row.value, x + width - 5, baseline, { align: "right" })
    currentY += h
  })
  return height
}

/* =========================================================
   FOOTER
========================================================= */

function drawFooter(doc, shopName) {
  const pageCount = doc.getNumberOfPages()
  const pageHeight = doc.internal.pageSize.getHeight()
  const pageWidth = doc.internal.pageSize.getWidth()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setDrawColor(...COLORS.line)
    doc.setLineWidth(0.25)
    doc.line(MARGIN, pageHeight - 14, pageWidth - MARGIN, pageHeight - 14)
    setText(doc, { size: 7.2, bold: true })
    doc.text("Thank you for your business!", MARGIN, pageHeight - 9)
    setText(doc, { size: 6.8, color: COLORS.muted })
    doc.text(`${shopName} | Confidential Business Report`, MARGIN, pageHeight - 5.5)
    setText(doc, { size: 7, bold: true })
    doc.text("E. & O.E.", pageWidth - MARGIN - 25, pageHeight - 9, { align: "right" })
    setText(doc, { size: 7, color: COLORS.muted })
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - MARGIN, pageHeight - 9, { align: "right" })
  }
}

/* =========================================================
   PDF GENERATOR
========================================================= */

export function generateTownDetailsPDF({
  towns = [],
  shop = {},
  periodLabel = "Selected period",
} = {}) {
  const safeTowns = safeArray(towns)
  if (!safeTowns.length) throw new Error("No town details available to export.")

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - MARGIN * 2
  const totals = getTotals(safeTowns)
  const shopName = clean(shop?.name) || "KHAATAPRO"

  /* PAGE 1: MAIN REPORT */
  let y = drawHeader(doc, shop, periodLabel, totals)
  y = drawSummaryCards(doc, totals, periodLabel, y)
  y = drawReportDetails(doc, totals, y)

  setText(doc, { size: 7.5, bold: true, color: COLORS.muted })
  doc.text(`TOWN-WISE CUSTOMER DETAILS | ${totals.customers} CUSTOMER RECORDS`, MARGIN, y)

  const head = [[
    "Customer", "Mobile", "Address", "Type", "Opening",
    "Bill Due", "Overdue", "Balance Due", "Pending Bills",
  ]]

  const body = makeCustomerRows(safeTowns)
  body.push([
    { content: "GRAND TOTAL", colSpan: 4, styles: { fillColor: COLORS.ink, textColor: COLORS.white, fontStyle: "bold", halign: "right" } },
    ...[
      money(totals.opening),
      money(totals.billDue),
      money(totals.overdue),
      money(totals.due),
      `${totals.pendingBills} bills`,
    ].map((value) => ({ content: value, styles: { fillColor: COLORS.ink, textColor: COLORS.white, fontStyle: "bold" } })),
  ])

  autoTable(doc, {
    startY: y + 3,
    head,
    body,
    theme: "plain",
    tableWidth: contentWidth,
    margin: { left: MARGIN, right: MARGIN, top: 16, bottom: FOOTER_SPACE },
    showHead: "everyPage",
    styles: {
      font: "helvetica",
      fontSize: 6.7,
      textColor: COLORS.ink,
      cellPadding: { top: 2.5, bottom: 2.5, left: 1.5, right: 1.5 },
      overflow: "linebreak",
      valign: "middle",
      lineColor: COLORS.line,
      lineWidth: 0.12,
    },
    headStyles: {
      fillColor: COLORS.ink,
      textColor: COLORS.white,
      fontStyle: "bold",
      fontSize: 6.6,
      cellPadding: { top: 3.2, bottom: 3.2, left: 1.5, right: 1.5 },
      lineWidth: 0,
    },
    columnStyles: {
      0: { cellWidth: 29, fontStyle: "bold" },
      1: { cellWidth: 23 },
      2: { cellWidth: 43 },
      3: { cellWidth: 19 },
      4: { cellWidth: 22, halign: "right" },
      5: { cellWidth: 22, halign: "right" },
      6: { cellWidth: 22, halign: "right" },
      7: { cellWidth: 25, halign: "right", fontStyle: "bold" },
      8: { cellWidth: "auto" },
    },
    didParseCell(data) {
      if (data.section === "head" && data.column.index >= 4 && data.column.index <= 7) {
        data.cell.styles.halign = "right"
      }
    },
    didDrawPage() {
      if (doc.internal.getCurrentPageInfo().pageNumber > 1) {
        setText(doc, { size: 8, bold: true, color: COLORS.muted })
        doc.text("Town Details Report - continued", MARGIN, 10)
      }
    },
  })

  /* MAIN REPORT TOTALS */
  let summaryY = (doc.lastAutoTable?.finalY || y) + 7
  const summaryWidth = 91
  const summaryX = pageWidth - MARGIN - summaryWidth
  const summaryRows = [
    { label: "Opening Balance", value: money(totals.opening) },
    { label: "Bill Due", value: money(totals.billDue) },
    { label: "Overdue", value: money(totals.overdue) },
    { label: "Outstanding Balance", value: money(totals.due), type: "grand" },
  ]
  const summaryHeight = summaryRows.reduce((sum, row) => sum + (row.type === "grand" ? 10 : 6), 0) + 4

  if (summaryY + summaryHeight > pageHeight - FOOTER_SPACE) {
    doc.addPage()
    summaryY = 20
  }

  const leftWidth = summaryX - MARGIN - 8
  let leftY = summaryY + 3
  setText(doc, { size: 7.5, bold: true, color: COLORS.muted })
  doc.text("OUTSTANDING BALANCE IN WORDS", MARGIN, leftY)
  leftY += 5
  setText(doc, { size: 9, bold: true })
  wrapped(doc, money(totals.due), MARGIN, leftY, leftWidth, 4.2)
  drawSummaryBox(doc, summaryRows, summaryX, summaryY, summaryWidth)

  /* PAGE 2: TOWN & CUSTOMER ANALYSIS */
  doc.addPage()
  let page2Y = 19
  setText(doc, { size: 12, bold: true })
  doc.text("Town-wise Analysis & Summary", MARGIN, page2Y)
  page2Y += 6
  doc.setDrawColor(...COLORS.line)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, page2Y, pageWidth - MARGIN, page2Y)
  page2Y += 8

  const townSummary = getTownSummary(safeTowns)
  setText(doc, { size: 8, bold: true, color: COLORS.muted })
  doc.text("TOWN-WISE FINANCIAL SUMMARY", MARGIN, page2Y)

  autoTable(doc, {
    startY: page2Y + 3,
    head: [["Town", "Customers", "Pending Bills", "Opening", "Bill Due", "Overdue", "Balance Due"]],
    body: townSummary.map((town) => [
      town.name,
      String(town.customers),
      String(town.pendingBills),
      money(town.opening),
      money(town.billDue),
      money(town.overdue),
      money(town.due),
    ]),
    foot: [["GRAND TOTAL", String(totals.customers), String(totals.pendingBills), money(totals.opening), money(totals.billDue), money(totals.overdue), money(totals.due)]],
    theme: "plain",
    tableWidth: contentWidth,
    margin: { left: MARGIN, right: MARGIN, top: 16, bottom: FOOTER_SPACE },
    styles: { font: "helvetica", fontSize: 7, cellPadding: 2.8, textColor: COLORS.ink, lineColor: COLORS.line, lineWidth: 0.12, valign: "middle" },
    headStyles: { fillColor: COLORS.ink, textColor: COLORS.white, fontStyle: "bold", fontSize: 6.8 },
    footStyles: { fillColor: COLORS.soft, textColor: COLORS.ink, fontStyle: "bold", lineColor: COLORS.line, lineWidth: { top: 0.35 } },
    columnStyles: {
      0: { cellWidth: 52, fontStyle: "bold" },
      1: { cellWidth: 24, halign: "right" },
      2: { cellWidth: 27, halign: "right" },
      3: { cellWidth: 34, halign: "right" },
      4: { cellWidth: 34, halign: "right" },
      5: { cellWidth: 34, halign: "right" },
      6: { halign: "right", fontStyle: "bold" },
    },
  })

  page2Y = (doc.lastAutoTable?.finalY || page2Y) + 9
  setText(doc, { size: 8, bold: true, color: COLORS.muted })
  doc.text("CUSTOMER-WISE OUTSTANDING SUMMARY", MARGIN, page2Y)

  const customerSummary = getCustomerSummary(safeTowns)
  autoTable(doc, {
    startY: page2Y + 3,
    head: [["#", "Customer", "Town", "Mobile", "Opening", "Bill Due", "Overdue", "Balance Due", "Pending"]],
    body: customerSummary.length
      ? customerSummary.map((row, index) => [
          String(index + 1), row.name, row.town, row.mobile,
          money(row.opening), money(row.billDue), money(row.overdue),
          money(row.due), String(row.pendingBills),
        ])
      : [["—", "No customer records", "—", "—", "—", "—", "—", "—", "0"]],
    theme: "plain",
    tableWidth: contentWidth,
    margin: { left: MARGIN, right: MARGIN, top: 16, bottom: FOOTER_SPACE },
    styles: { font: "helvetica", fontSize: 6.6, cellPadding: 2.4, textColor: COLORS.ink, lineColor: COLORS.line, lineWidth: 0.12, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: COLORS.ink, textColor: COLORS.white, fontStyle: "bold", fontSize: 6.4 },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 35, fontStyle: "bold" },
      2: { cellWidth: 34 },
      3: { cellWidth: 25 },
      4: { cellWidth: 25, halign: "right" },
      5: { cellWidth: 25, halign: "right" },
      6: { cellWidth: 25, halign: "right" },
      7: { cellWidth: 27, halign: "right", fontStyle: "bold" },
      8: { halign: "right" },
    },
  })

  /* REPORT NOTES & SIGNATORY */
  let notesY = (doc.lastAutoTable?.finalY || page2Y) + 8
  if (notesY + 34 > pageHeight - FOOTER_SPACE) {
    doc.addPage()
    notesY = 20
  }

  doc.setDrawColor(...COLORS.line)
  doc.setLineWidth(0.25)
  doc.line(MARGIN, notesY, pageWidth - MARGIN, notesY)
  setText(doc, { size: 7.5, bold: true, color: COLORS.muted })
  doc.text("REPORT NOTES", MARGIN, notesY + 5)
  setText(doc, { size: 7.2, color: COLORS.ink })

  const notes = [
    "1. This report contains town-wise customer balances for the selected period.",
    "2. Pending bill details are shown against each customer wherever available.",
    "3. Overdue and outstanding amounts are based on the supplied town/customer records.",
    "4. Please verify recent receipts and adjustments before collecting any outstanding amount.",
  ]
  let noteY = notesY + 10
  notes.forEach((note) => {
    noteY = wrapped(doc, note, MARGIN, noteY, 150, 3.8) + 1
  })

  const signX = pageWidth - MARGIN
  setText(doc, { size: 8.5, bold: true })
  doc.text(`For ${shopName}`, signX, notesY + 5, { align: "right" })
  doc.setDrawColor(...COLORS.muted)
  doc.setLineWidth(0.25)
  doc.line(signX - 55, notesY + 25, signX, notesY + 25)
  setText(doc, { size: 7.5, color: COLORS.muted })
  doc.text("Authorised Signatory", signX, notesY + 29, { align: "right" })

  drawFooter(doc, shopName)

  const date = new Date().toISOString().slice(0, 10)
  doc.save(`${safeFileName(shopName)}_Town_Details_${date}.pdf`)
  return doc
}

export default generateTownDetailsPDF
