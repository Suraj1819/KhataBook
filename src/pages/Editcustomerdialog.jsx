import { useMemo, useRef, useState } from "react"
import { formatCurrency, formatDate } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import {
  Camera,
  Check,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Receipt,
  StickyNote,
  Store,
  User,
  Wallet,
} from "lucide-react"

/* ==================================================
   CONSTANTS
================================================== */

/**
 * Email, PIN, GSTIN, customer type and notes need 5 extra columns in the
 * "khata_entries" table (SQL is in KhataDetail-changes.md).
 * Set this to false to hide those fields and keep the old 4-field form.
 */
export const CUSTOMER_EXTRA_FIELDS = true

// Your image in the /public folder. The first file that exists is used.
const CUSTOMER_TYPES = [
  { value: "retailer", label: "Retailer" },
  { value: "wholesaler", label: "Wholesaler" },
  { value: "individual", label: "Individual" },
  { value: "other", label: "Other" },
]

const ACTIVE_WITHIN_DAYS = 90
const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const FIELD_CLASS =
  "rounded-xl border-violet-100 bg-white text-sm shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-violet-400 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-violet-500/15 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus-visible:border-violet-400 dark:focus-visible:bg-slate-900"

const LABEL_CLASS = "text-xs font-medium text-slate-600 dark:text-slate-400"

/* ==================================================
   HELPERS (also used by KhataDetail.jsx)
================================================== */

const clean = (value) => String(value ?? "").trim() || null

// "+91 98765 43210" -> "9876543210"
const normalizeMobile = (value) => {
  const digits = String(value || "").replace(/\D/g, "")
  return digits.length > 10 ? digits.slice(-10) : digits
}

const getInitials = (name) =>
  String(name || "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?"

function daysSince(dateStr) {
  if (!dateStr) return Infinity
  const [y, m, d] = dateStr.split("-").map(Number)
  return Math.floor((Date.now() - new Date(y, m - 1, d).getTime()) / 86400000)
}

/** Starting values for the form, built from the customer shown on the page. */
export function buildEditForm(customer = {}) {
  return {
    name: customer.name || "",
    mobile: customer.mobile || "",
    email: customer.email || "",
    address: customer.address || "",
    pin_code: customer.pin_code || "",
    gstin: customer.gstin || "",
    customer_type: customer.customer_type || "",
    notes: customer.notes || "",
    photo: null,
    photo_preview: customer.photo || "",
  }
}

/** Returns an object of error messages. Empty object = form is valid. */
export function validateCustomerForm(form) {
  const errors = {}

  if (!form.name.trim()) errors.name = "Customer name is required."

  if (form.mobile.trim() && normalizeMobile(form.mobile).length !== 10) {
    errors.mobile = "Enter a 10-digit mobile number."
  }

  if (CUSTOMER_EXTRA_FIELDS) {
    if (form.email.trim() && !EMAIL_REGEX.test(form.email.trim())) {
      errors.email = "Enter a valid email address."
    }
    if (form.pin_code.trim() && !/^\d{6}$/.test(form.pin_code.trim())) {
      errors.pin_code = "PIN code must be 6 digits."
    }
    if (form.gstin.trim() && !GSTIN_REGEX.test(form.gstin.trim())) {
      errors.gstin = "Enter a valid 15-character GSTIN."
    }
  }

  return errors
}

/** The fields written to every khata entry of this customer. */
export function buildCustomerPayload(form, photoUrl) {
  return {
    customer_name: form.name.trim().replace(/\s+/g, " "),
    mobile: clean(form.mobile),
    address: clean(form.address),
    customer_photo: photoUrl || null,
    ...(CUSTOMER_EXTRA_FIELDS
      ? {
          email: clean(form.email),
          pin_code: clean(form.pin_code),
          gstin: clean(form.gstin),
          customer_type: clean(form.customer_type),
          customer_notes: clean(form.notes),
        }
      : {}),
  }
}

/* ==================================================
   SMALL UI PIECES
================================================== */

function SectionTitle({ icon: Icon, children }) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5">
      <Icon className="h-[18px] w-[18px] text-slate-700 dark:text-slate-300" strokeWidth={2} aria-hidden="true" />
      <h3 className="text-[15px] font-bold tracking-tight text-slate-900 dark:text-slate-100">{children}</h3>
    </div>
  )
}

function FieldError({ id, message }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">
      {message}
    </p>
  )
}

function IconField({ icon: Icon, multiline = false, children }) {
  return (
    <div className="relative">
      <Icon
        className={`pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400 dark:text-slate-500 ${
          multiline ? "top-3.5" : "top-1/2 -translate-y-1/2"
        }`}
        aria-hidden="true"
      />
      {children}
    </div>
  )
}

function getBalanceTone(balance) {
  if (balance > 0) {
    return {
      label: "You'll get",
      box: "border-rose-200/70 bg-rose-50/80 dark:border-rose-500/30 dark:bg-rose-500/10",
      icon: "bg-white/80 text-rose-600 dark:bg-slate-900/60 dark:text-rose-400",
      text: "text-rose-600 dark:text-rose-400",
    }
  }
  if (balance < 0) {
    return {
      label: "Advance held",
      box: "border-emerald-200/70 bg-emerald-50/80 dark:border-emerald-500/30 dark:bg-emerald-500/10",
      icon: "bg-white/80 text-emerald-700 dark:bg-slate-900/60 dark:text-emerald-400",
      text: "text-emerald-700 dark:text-emerald-400",
    }
  }
  return {
    label: "Settled",
    box: "border-slate-200/80 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800/60",
    icon: "bg-white/80 text-slate-600 dark:bg-slate-900/60 dark:text-slate-300",
    text: "text-slate-600 dark:text-slate-300",
  }
}

/* ==================================================
   EDIT CUSTOMER DIALOG
================================================== */

export default function EditCustomerDialog({
  open,
  onOpenChange,
  form,
  setForm,
  errors = {},
  setErrors,
  customer,
  entryCount = 0,
  saving = false,
  onPhotoChange,
  onSubmit,
}) {
  const fileInputRef = useRef(null)

  const original = useMemo(() => buildEditForm(customer), [customer])

  const dirty =
    Boolean(form.photo) ||
    ["name", "mobile", "email", "address", "pin_code", "gstin", "customer_type", "notes"].some(
      (key) => String(form[key] || "").trim() !== String(original[key] || "").trim()
    )

  function update(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }))
    setErrors?.((previous) => (previous[key] ? { ...previous, [key]: "" } : previous))
  }

  const balance = customer?.balance || 0
  const tone = getBalanceTone(balance)
  const isActive = daysSince(customer?.lastEntry) <= ACTIVE_WITHIN_DAYS
  const typeLabel = CUSTOMER_TYPES.find((type) => type.value === form.customer_type)?.label

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] w-[calc(100%-1.5rem)] gap-0 overflow-hidden rounded-[20px] border border-violet-100 bg-white p-0 shadow-[0_12px_32px_rgba(80,65,130,0.25)] sm:max-w-[760px] dark:border-slate-700 dark:bg-slate-950">

        <form onSubmit={onSubmit} noValidate className="relative flex max-h-[94dvh] flex-col">
          {/* ============ HEADER ============ */}
          <DialogHeader className="flex-row items-center gap-4 space-y-0 border-b border-[#eae7f4] bg-gradient-to-br from-[#f1effb] via-[#f7f5ff] to-white px-5 py-5 pr-14 text-left sm:px-7 dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#eae7f8] text-[#51458a] shadow-sm dark:bg-violet-500/15 dark:text-violet-300">
              <User className="h-5 w-5" aria-hidden="true" />
            </div>

            <div className="min-w-0">
              <DialogTitle className="text-lg font-bold tracking-tight text-[#171a39] dark:text-slate-100">
                Edit Customer
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Changes apply to all {entryCount} {entryCount === 1 ? "entry" : "entries"} of{" "}
                {customer?.name || "this customer"}.
              </DialogDescription>
            </div>
          </DialogHeader>

          {/* ============ BODY ============ */}
          <div className="relative z-[1] flex-1 space-y-5 overflow-y-auto bg-white px-5 py-5 sm:px-7 dark:bg-slate-950">
            {/* Profile photo and customer overview */}
            <div className="flex flex-col gap-4 rounded-2xl border border-violet-100 bg-[#faf9ff] p-4 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex shrink-0 flex-col items-center gap-3 sm:items-start">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-violet-50 text-xl font-bold text-[#51458a] shadow-sm dark:border-slate-800 dark:bg-violet-500/10 dark:text-violet-300">
                  {form.photo_preview ? (
                    <img src={form.photo_preview} alt="Customer profile preview" className="h-full w-full object-cover" />
                  ) : (
                    getInitials(form.name)
                  )}
                </div>
              </div>

              <div className="min-w-0 flex-1 text-center sm:text-left">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Profile photo</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">JPG, PNG or WebP, up to 2 MB.</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-9 gap-2 rounded-xl border-violet-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm hover:border-violet-300 hover:bg-violet-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Camera className="h-4 w-4" aria-hidden="true" />
                    {form.photo_preview ? "Change photo" : "Upload photo"}
                  </Button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={onPhotoChange}
                />
              </div>

              <div className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 sm:w-auto sm:min-w-[190px] ${tone.box}`}>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone.icon}`}>
                  <Wallet className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-slate-600 dark:text-slate-400">Current balance</p>
                  <p className={`text-lg font-bold leading-tight tabular-nums ${tone.text}`}>{formatCurrency(Math.abs(balance))}</p>
                  <p className={`text-[11px] font-semibold ${tone.text}`}>{tone.label}</p>
                </div>
              </div>
            </div>

            {/* Customer name and status */}
            <section className="rounded-2xl border border-[#eeecf5] bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/30">
              <div className="min-w-0">
                <Label htmlFor="edit-name" className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                  Customer name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="edit-name"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Enter customer name"
                  autoComplete="off"
                  maxLength={80}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? "edit-name-error" : undefined}
                  className={`${FIELD_CLASS} mt-1.5 h-11`}
                />
                <FieldError id="edit-name-error" message={errors.name} />

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {CUSTOMER_EXTRA_FIELDS && typeLabel && (
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                      {typeLabel}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-slate-400"}`} aria-hidden="true" />
                    {isActive ? "Active" : "Inactive"}
                  </span>
                  {customer?.since && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Customer since {formatDate(customer.since)}
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* Contact + Address */}
            <div className="grid border-t border-[#eeecf5] md:grid-cols-2 md:divide-x md:divide-[#eeecf5] dark:border-slate-800 dark:md:divide-slate-800">
              <section className="py-5 md:pr-6" aria-label="Contact details">
                <SectionTitle icon={Phone}>Contact Details</SectionTitle>

                <div className="space-y-3.5">
                  <div>
                    <Label htmlFor="edit-mobile" className={LABEL_CLASS}>Mobile number</Label>
                    <div className="mt-1.5">
                      <IconField icon={Phone}>
                        <Input
                          id="edit-mobile"
                          type="tel"
                          inputMode="tel"
                          maxLength={15}
                          value={form.mobile}
                          onChange={(e) => update("mobile", e.target.value.replace(/[^\d+\s-]/g, ""))}
                          placeholder="10-digit number"
                          aria-invalid={Boolean(errors.mobile)}
                          className={`${FIELD_CLASS} h-11 pl-10`}
                        />
                      </IconField>
                    </div>
                    <FieldError message={errors.mobile} />
                  </div>

                  {CUSTOMER_EXTRA_FIELDS && (
                    <div>
                      <Label htmlFor="edit-email" className={LABEL_CLASS}>Email</Label>
                      <div className="mt-1.5">
                        <IconField icon={Mail}>
                          <Input
                            id="edit-email"
                            type="email"
                            autoComplete="off"
                            value={form.email}
                            onChange={(e) => update("email", e.target.value)}
                            placeholder="name@example.com"
                            aria-invalid={Boolean(errors.email)}
                            className={`${FIELD_CLASS} h-11 pl-10`}
                          />
                        </IconField>
                      </div>
                      <FieldError message={errors.email} />
                    </div>
                  )}
                </div>
              </section>

              <section className="border-t border-[#eeecf5] py-5 md:border-t-0 md:pl-6 dark:border-slate-800" aria-label="Address">
                <SectionTitle icon={MapPin}>Address</SectionTitle>

                <div className="space-y-3.5">
                  <div>
                    <Label htmlFor="edit-address" className={LABEL_CLASS}>Address</Label>
                    <div className="mt-1.5">
                      <IconField icon={MapPin} multiline>
                        <Textarea
                          id="edit-address"
                          rows={2}
                          value={form.address}
                          onChange={(e) => update("address", e.target.value)}
                          placeholder="Shop or house number, market, city"
                          className={`${FIELD_CLASS} min-h-[76px] resize-none pl-10`}
                        />
                      </IconField>
                    </div>
                  </div>

                  {CUSTOMER_EXTRA_FIELDS && (
                    <div>
                      <Label htmlFor="edit-pin" className={LABEL_CLASS}>PIN code</Label>
                      <Input
                        id="edit-pin"
                        inputMode="numeric"
                        maxLength={6}
                        value={form.pin_code}
                        onChange={(e) => update("pin_code", e.target.value.replace(/\D/g, ""))}
                        placeholder="6-digit PIN"
                        aria-invalid={Boolean(errors.pin_code)}
                        className={`${FIELD_CLASS} mt-1.5 h-11`}
                      />
                      <FieldError message={errors.pin_code} />
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Business + Notes */}
            {CUSTOMER_EXTRA_FIELDS && (
              <div className="grid border-t border-[#eeecf5] pb-6 md:grid-cols-2 md:divide-x md:divide-[#eeecf5] dark:border-slate-800 dark:md:divide-slate-800">
                <section className="py-5 md:pr-6" aria-label="Business details">
                  <SectionTitle icon={Receipt}>Business Details</SectionTitle>

                  <div className="space-y-3.5">
                    <div>
                      <Label htmlFor="edit-gstin" className={LABEL_CLASS}>GSTIN</Label>
                      <div className="mt-1.5">
                        <IconField icon={FileText}>
                          <Input
                            id="edit-gstin"
                            maxLength={15}
                            autoComplete="off"
                            value={form.gstin}
                            onChange={(e) =>
                              update("gstin", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                            }
                            placeholder="10ABCDE1234F1Z5"
                            aria-invalid={Boolean(errors.gstin)}
                            className={`${FIELD_CLASS} h-11 pl-10 font-medium tracking-wide`}
                          />
                        </IconField>
                      </div>
                      <FieldError message={errors.gstin} />
                    </div>

                    <div>
                      <Label htmlFor="edit-type" className={LABEL_CLASS}>Customer type</Label>
                      <div className="mt-1.5">
                        <Select
                          value={form.customer_type || "none"}
                          onValueChange={(value) => update("customer_type", value === "none" ? "" : value)}
                        >
                          <SelectTrigger
                            id="edit-type"
                            className={`${FIELD_CLASS} h-11 [&>span]:flex [&>span]:items-center [&>span]:gap-2`}
                          >
                            <Store className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Not set</SelectItem>
                            {CUSTOMER_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="border-t border-[#eeecf5] py-5 md:border-t-0 md:pl-6 dark:border-slate-800" aria-label="Additional notes">
                  <SectionTitle icon={StickyNote}>Additional Notes</SectionTitle>

                  <Label htmlFor="edit-notes" className="sr-only">Additional notes</Label>
                  <Textarea
                    id="edit-notes"
                    rows={5}
                    maxLength={300}
                    value={form.notes}
                    onChange={(e) => update("notes", e.target.value)}
                    placeholder="Regular customer, pays on the 1st of every month..."
                    className={`${FIELD_CLASS} min-h-[132px] resize-none`}
                  />
                  <p className="mt-1 text-right text-[11px] tabular-nums text-slate-400">
                    {form.notes.length}/300
                  </p>
                </section>
              </div>
            )}
          </div>

          {/* ============ FOOTER ============ */}
          <DialogFooter className="relative z-[1] flex-col-reverse gap-2 border-t border-[#eae7f4] bg-[#faf9ff] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:space-x-0 sm:px-7 dark:border-slate-800 dark:bg-slate-900/70">
            <p className="hidden text-xs text-slate-500 sm:block dark:text-slate-400" aria-live="polite">
              {dirty ? "You have unsaved changes." : "No changes yet."}
            </p>

            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
                className="h-11 rounded-xl border-violet-200 bg-white px-6 text-sm font-semibold text-slate-700 shadow-sm hover:border-violet-300 hover:bg-violet-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Close
              </Button>

              <Button
                type="submit"
                disabled={saving || !dirty}
                className="h-11 gap-2 rounded-xl border-violet-200 bg-white px-6 text-sm font-semibold text-slate-700 shadow-sm hover:border-violet-300 hover:bg-violet-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Save changes
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}