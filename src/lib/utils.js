import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return "₹0.00"
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount))
}

export function formatDate(date) {
  if (!date) return "—"
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(date))
  } catch {
    return "—"
  }
}

export function formatDateTime(date) {
  if (!date) return "—"
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date))
  } catch {
    return "—"
  }
}

export function roundToTwo(num) {
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100
}

export function calculateItemAmounts({ quantity, rate, discount = 0, gstPercent = 0, taxInclusive = false }) {
  const qty = Number(quantity) || 0
  const r = Number(rate) || 0
  const disc = Number(discount) || 0
  const gst = Number(gstPercent) || 0

  let gross = qty * r
  let afterDiscount = Math.max(0, gross - disc)

  let taxable, gstAmount, total

  if (taxInclusive && gst > 0) {
    taxable = roundToTwo(afterDiscount / (1 + gst / 100))
    gstAmount = roundToTwo(afterDiscount - taxable)
    total = roundToTwo(afterDiscount)
  } else {
    taxable = roundToTwo(afterDiscount)
    gstAmount = roundToTwo(taxable * (gst / 100))
    total = roundToTwo(taxable + gstAmount)
  }

  return {
    gross: roundToTwo(gross),
    discount: roundToTwo(disc),
    taxable,
    gstAmount,
    total,
  }
}

export function generateBillNumber(prefix = "INV") {
  const now = new Date()
  const y = now.getFullYear().toString().slice(-2)
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  const rand = Math.floor(Math.random() * 9000) + 1000
  return `${prefix}-${y}${m}${d}-${rand}`
}

export const UNITS = [
  "Piece", "Bag", "Kg", "Quintal", "Ton", "Meter", "Feet",
  "Box", "Packet", "Litre", "Dozen", "Set", "Roll", "Bundle", "CFT"
]

export const GST_RATES = [0, 5, 12, 18, 28]

export const PAYMENT_MODES = ["Cash", "UPI", "Bank Transfer", "Cheque", "Other"]

export const CUSTOMER_TYPES = ["Individual", "Contractor", "Business", "Regular Customer"]

export const BUSINESS_TYPES = [
  "Hardware Shop", "Stationery Shop", "Clothing Shop",
  "Grocery Shop", "Electrical Shop", "General Store", "Other"
]
