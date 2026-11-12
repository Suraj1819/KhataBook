import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { formatCurrency, formatDate } from "./utils"

export function generateBillPDF(bill, items, shop, customer) {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 15

  // Shop header
  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.text(shop?.name || "Shop", pageWidth / 2, y, { align: "center" })
  y += 6
  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  if (shop?.address || shop?.city) {
    doc.text([shop.address, shop.city, shop.state, shop.pincode].filter(Boolean).join(", "), pageWidth / 2, y, { align: "center" })
    y += 5
  }
  if (shop?.mobile) {
    doc.text(`Mobile: ${shop.mobile}`, pageWidth / 2, y, { align: "center" })
    y += 5
  }
  if (shop?.gstin) {
    doc.text(`GSTIN: ${shop.gstin}`, pageWidth / 2, y, { align: "center" })
    y += 5
  }

  y += 3
  doc.setDrawColor(200)
  doc.line(14, y, pageWidth - 14, y)
  y += 8

  // Bill info
  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.text("TAX INVOICE", pageWidth / 2, y, { align: "center" })
  y += 8

  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.text(`Bill No: ${bill.bill_number}`, 14, y)
  doc.text(`Date: ${formatDate(bill.bill_date)}`, pageWidth - 14, y, { align: "right" })
  y += 7

  // Customer
  doc.setFont("helvetica", "bold")
  doc.text("Bill To:", 14, y)
  y += 5
  doc.setFont("helvetica", "normal")
  doc.text(customer?.name || "", 14, y)
  y += 4
  if (customer?.mobile) { doc.text(`Mobile: ${customer.mobile}`, 14, y); y += 4 }
  if (customer?.address || customer?.city) {
    doc.text([customer.address, customer.city, customer.state].filter(Boolean).join(", "), 14, y)
    y += 4
  }
  if (customer?.gstin) { doc.text(`GSTIN: ${customer.gstin}`, 14, y); y += 4 }

  y += 4

  // Items table
  const tableData = items.map((it, i) => [
    String(i + 1),
    it.item_name + (it.description ? `\n${it.description}` : ""),
    `${it.quantity} ${it.unit}`,
    formatCurrency(it.rate).replace("₹", ""),
    it.discount > 0 ? formatCurrency(it.discount).replace("₹", "") : "—",
    `${it.gst_percent}%`,
    formatCurrency(it.total_amount).replace("₹", ""),
  ])

  autoTable(doc, {
    startY: y,
    head: [["#", "Item", "Qty", "Rate", "Disc", "GST", "Amount"]],
    body: tableData,
    theme: "grid",
    headStyles: { fillColor: [5, 150, 105], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 10 },
      6: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
    margin: { left: 14, right: 14 },
  })

  y = doc.lastAutoTable.finalY + 8

  // Summary
  const summaryX = pageWidth - 70
  const labelX = summaryX - 40

  const lines = [
    ["Subtotal", formatCurrency(bill.subtotal)],
  ]
  if (Number(bill.discount_amount) > 0) lines.push(["Discount", `-${formatCurrency(bill.discount_amount)}`])
  if (Number(bill.cgst_amount) > 0) lines.push(["CGST", formatCurrency(bill.cgst_amount)])
  if (Number(bill.sgst_amount) > 0) lines.push(["SGST", formatCurrency(bill.sgst_amount)])
  if (Number(bill.igst_amount) > 0) lines.push(["IGST", formatCurrency(bill.igst_amount)])
  if (Number(bill.round_off) !== 0) lines.push(["Round Off", formatCurrency(bill.round_off)])
  lines.push(["Grand Total", formatCurrency(bill.grand_total)])
  if (Number(bill.advance_adjusted) > 0) lines.push(["Advance Adjusted", `-${formatCurrency(bill.advance_adjusted)}`])
  if (Number(bill.amount_paid) > 0) lines.push(["Amount Paid", formatCurrency(bill.amount_paid)])
  lines.push(["Amount Due", formatCurrency(bill.amount_due)])

  doc.setFontSize(9)
  lines.forEach(([label, value], i) => {
    const isTotal = label === "Grand Total" || label === "Amount Due"
    if (isTotal) doc.setFont("helvetica", "bold")
    else doc.setFont("helvetica", "normal")
    doc.text(label, labelX, y)
    doc.text(value, pageWidth - 14, y, { align: "right" })
    y += 5
  })

  if (bill.due_date) {
    y += 3
    doc.setFont("helvetica", "normal")
    doc.text(`Payment Due Date: ${formatDate(bill.due_date)}`, 14, y)
  }

  if (bill.notes) {
    y += 8
    doc.setFont("helvetica", "bold")
    doc.text("Notes:", 14, y)
    y += 4
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.text(bill.notes, 14, y, { maxWidth: pageWidth - 28 })
  }

  y = Math.max(y + 15, 270)
  doc.setFontSize(8)
  doc.setTextColor(150)
  doc.text("Thank you for your business!", pageWidth / 2, y, { align: "center" })

  doc.save(`${bill.bill_number}.pdf`)
}
