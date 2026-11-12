import { useMemo, useState } from "react"
import { useShop } from "@/contexts/ShopContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BUSINESS_TYPES } from "@/lib/utils"
import {
  Plus,
  Store,
  Pencil,
  Trash2,
  Search,
  MapPin,
  Phone,
  Building2,
  Check,
  X,
  Wallet,
  BriefcaseBusiness,
} from "lucide-react"
import { toast } from "sonner"

const createEmptyShop = () => ({
  name: "",
  business_type: "General Store",
  address: "",
  city: "",
  state: "",
  pincode: "",
  mobile: "",
  gstin: "",
})

function SummaryCard({
  title,
  value,
  description,
  icon: Icon,
  iconBg = "bg-slate-100",
  iconColor = "text-slate-700",
}) {
  return (
    <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[15px] font-medium text-slate-600">
            {title}
          </p>

          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconBg}`}
          >
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
        </div>

        <p className="mt-2 text-[28px] font-semibold tracking-tight text-slate-950">
          {value}
        </p>

        <p className="mt-1 text-sm text-slate-500">
          {description}
        </p>
      </CardContent>
    </Card>
  )
}

function DetailItem({ icon: Icon, children }) {
  if (!children) return null

  return (
    <div className="flex min-w-0 items-start gap-2 text-sm text-slate-500">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <span className="break-words">{children}</span>
    </div>
  )
}

/* Reusable styled input to keep form clean */
function FieldInput({ label, required, ...props }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>

      <Input
        {...props}
        className="h-11 rounded-xl border-slate-200 bg-slate-50/50 text-sm shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/20"
      />
    </div>
  )
}

/* Section header with icon badge */
function FormSection({ icon: Icon, title, children }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-50">
          <Icon className="h-3.5 w-3.5 text-emerald-700" />
        </div>
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      </div>

      {children}
    </div>
  )
}

export default function Settings() {
  const {
    shops,
    currentShop,
    createShop,
    updateShop,
    deleteShop,
    selectShop,
  } = useShop()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(createEmptyShop)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")

  const filteredShops = useMemo(() => {
    const query = search.trim().toLowerCase()

    return shops.filter((shop) => {
      const searchMatch =
        !query ||
        (shop.name || "").toLowerCase().includes(query) ||
        (shop.business_type || "").toLowerCase().includes(query) ||
        (shop.mobile || "").toLowerCase().includes(query) ||
        (shop.city || "").toLowerCase().includes(query) ||
        (shop.gstin || "").toLowerCase().includes(query)

      const typeMatch =
        typeFilter === "all" || shop.business_type === typeFilter

      return searchMatch && typeMatch
    })
  }, [shops, search, typeFilter])

  const activeShop = shops.find((shop) => shop.id === currentShop?.id)

  const businessTypesCount = new Set(
    shops.map((shop) => shop.business_type).filter(Boolean)
  ).size

  function updateForm(key, value) {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }))
  }

  function openCreate() {
    setEditing(null)
    setForm(createEmptyShop())
    setDialogOpen(true)
  }

  function openEdit(shop) {
    setEditing(shop)

    setForm({
      name: shop.name || "",
      business_type: shop.business_type || "General Store",
      address: shop.address || "",
      city: shop.city || "",
      state: shop.state || "",
      pincode: shop.pincode || "",
      mobile: shop.mobile || "",
      gstin: shop.gstin || "",
    })

    setDialogOpen(true)
  }

  async function handleSave(e) {
    e.preventDefault()

    if (!form.name.trim()) {
      toast.error("Shop name is required")
      return
    }

    setSaving(true)

    try {
      const shopData = {
        ...form,
        name: form.name.trim(),
        mobile: form.mobile.trim() || null,
        gstin: form.gstin.trim().toUpperCase() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        pincode: form.pincode.trim() || null,
      }

      if (editing) {
        await updateShop(editing.id, shopData)
        toast.success("Shop updated successfully")
      } else {
        const shop = await createShop(shopData)
        toast.success("Shop created successfully")
        selectShop(shop)
      }

      setDialogOpen(false)
      setEditing(null)
      setForm(createEmptyShop())
    } catch (error) {
      toast.error(error.message || "Failed to save shop")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(shop) {
    const confirmed = window.confirm(
      `Delete "${shop.name}"? This action cannot be undone.`
    )

    if (!confirmed) return

    try {
      await deleteShop(shop.id)
      toast.success("Shop deleted successfully")
    } catch (error) {
      toast.error(error.message || "Failed to delete shop")
    }
  }

  function handleDialogChange(open) {
    if (saving) return

    setDialogOpen(open)

    if (!open) {
      setEditing(null)
      setForm(createEmptyShop())
    }
  }

  return (
    <div className="w-full space-y-6 pb-8">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Shop Settings
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage your shops and business information.
          </p>
        </div>

        <Button
          onClick={openCreate}
          className="h-10 rounded-xl bg-emerald-600 px-5 font-medium hover:bg-emerald-700"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Shop
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Total Shops"
          value={shops.length}
          description="Registered shop records"
          icon={Store}
          iconBg="bg-slate-100"
          iconColor="text-slate-700"
        />

        <SummaryCard
          title="Active Shop"
          value={activeShop ? "1" : "0"}
          description={activeShop?.name || "No shop selected"}
          icon={Check}
          iconBg="bg-emerald-100"
          iconColor="text-emerald-700"
        />

        <SummaryCard
          title="Business Types"
          value={businessTypesCount}
          description="Different business categories"
          icon={BriefcaseBusiness}
          iconBg="bg-blue-100"
          iconColor="text-blue-700"
        />

        <SummaryCard
          title="Shop Management"
          value="Manage"
          description="Edit and organize your shops"
          icon={Building2}
          iconBg="bg-amber-100"
          iconColor="text-amber-700"
        />
      </div>

      {/* Shop List */}
      <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* List Header */}
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              All Shops
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {filteredShops.length} shops found
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search shop, mobile, city..."
                className="h-11 rounded-xl border-slate-200 pl-10 pr-10 text-sm shadow-none placeholder:text-slate-400 focus-visible:ring-emerald-500"
              />

              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-11 w-full rounded-xl border-slate-200 shadow-none sm:w-48">
                <SelectValue placeholder="All business types" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="all">All Business Types</SelectItem>
                {BUSINESS_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Empty State */}
        {filteredShops.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <Store className="h-6 w-6 text-slate-400" />
            </div>

            <p className="text-sm font-semibold text-slate-800">
              {shops.length === 0
                ? "No shops created yet"
                : "No matching shops found"}
            </p>

            <p className="mt-1 max-w-sm text-sm text-slate-500">
              {shops.length === 0
                ? "Create your first shop to start managing its customers, bills and payments."
                : "Try changing your search or business type filter."}
            </p>

            {shops.length === 0 && (
              <Button
                onClick={openCreate}
                className="mt-4 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Shop
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredShops.map((shop) => {
              const isActive = currentShop?.id === shop.id

              const location = [
                shop.address,
                shop.city,
                shop.state,
                shop.pincode,
              ]
                .filter(Boolean)
                .join(", ")

              return (
                <div
                  key={shop.id}
                  className="flex flex-col gap-4 p-5 transition-colors hover:bg-slate-50/60 sm:flex-row sm:items-start sm:justify-between"
                >
                  {/* Shop Information */}
                  <div className="flex min-w-0 gap-4">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                        isActive
                          ? "bg-emerald-100"
                          : "bg-slate-100"
                      }`}
                    >
                      <Store
                        className={`h-5 w-5 ${
                          isActive
                            ? "text-emerald-700"
                            : "text-slate-600"
                        }`}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900">
                          {shop.name}
                        </h3>

                        {isActive && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                            Active
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-sm text-slate-500">
                        {shop.business_type || "General Store"}
                      </p>

                      <div className="mt-3 flex flex-col gap-2">
                        <DetailItem icon={Phone}>
                          {shop.mobile}
                        </DetailItem>

                        <DetailItem icon={MapPin}>
                          {location}
                        </DetailItem>

                        <DetailItem icon={Wallet}>
                          {shop.gstin ? `GSTIN: ${shop.gstin}` : null}
                        </DetailItem>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-2 sm:justify-end">
                    {!isActive && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          selectShop(shop)
                          toast.success(`${shop.name} selected`)
                        }}
                        className="h-9 rounded-lg border-slate-200 px-4 text-sm hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        Select Shop
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => openEdit(shop)}
                      className="h-9 w-9 rounded-lg border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                      title="Edit shop"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => handleDelete(shop)}
                      className="h-9 w-9 rounded-lg border-slate-200 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      title="Delete shop"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* ============================================================ */}
      {/* Add / Edit Shop Dialog — Professional Themed                  */}
      {/* ============================================================ */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="max-h-[92vh] gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl sm:max-w-[560px]">
          {/* Header */}
          <div className="relative border-b border-slate-100 bg-gradient-to-br from-emerald-50 via-white to-white px-6 pb-5 pt-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 shadow-lg shadow-emerald-600/25">
                {editing ? (
                  <Pencil className="h-5 w-5 text-white" />
                ) : (
                  <Store className="h-5 w-5 text-white" />
                )}
              </div>

              <div className="min-w-0 flex-1 pr-6">
                <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
                  {editing ? "Edit Shop Details" : "Create New Shop"}
                </DialogTitle>

                <p className="mt-1 text-sm text-slate-500">
                  {editing
                    ? "Update your shop and business information."
                    : "Enter your business details to create a new shop."}
                </p>
              </div>
            </div>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSave}
            className="flex max-h-[calc(92vh-180px)] flex-col"
          >
            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
              {/* Basic Information */}
              <FormSection icon={Building2} title="Basic Information">
                <FieldInput
                  label="Shop Name"
                  required
                  value={form.name}
                  onChange={(e) => updateForm("name", e.target.value)}
                  placeholder="Enter shop name"
                  autoFocus
                />

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">
                    Business Type
                  </Label>

                  <Select
                    value={form.business_type}
                    onValueChange={(value) =>
                      updateForm("business_type", value)
                    }
                  >
                    <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/50 text-sm shadow-none transition-colors focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20">
                      <SelectValue placeholder="Select business type" />
                    </SelectTrigger>

                    <SelectContent>
                      {BUSINESS_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </FormSection>

              <div className="h-px bg-slate-100" />

              {/* Contact & Tax */}
              <FormSection icon={Phone} title="Contact & Tax Details">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FieldInput
                    label="Mobile Number"
                    type="tel"
                    value={form.mobile}
                    onChange={(e) =>
                      updateForm("mobile", e.target.value)
                    }
                    placeholder="Enter mobile number"
                  />

                  <FieldInput
                    label="GSTIN"
                    value={form.gstin}
                    onChange={(e) =>
                      updateForm("gstin", e.target.value.toUpperCase())
                    }
                    placeholder="Enter GSTIN"
                    maxLength={15}
                    className="h-11 rounded-xl border-slate-200 bg-slate-50/50 text-sm uppercase shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/20"
                  />
                </div>
              </FormSection>

              <div className="h-px bg-slate-100" />

              {/* Address */}
              <FormSection icon={MapPin} title="Business Address">
                <FieldInput
                  label="Address"
                  value={form.address}
                  onChange={(e) =>
                    updateForm("address", e.target.value)
                  }
                  placeholder="Street, area, landmark..."
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <FieldInput
                    label="City"
                    value={form.city}
                    onChange={(e) =>
                      updateForm("city", e.target.value)
                    }
                    placeholder="City"
                  />

                  <FieldInput
                    label="State"
                    value={form.state}
                    onChange={(e) =>
                      updateForm("state", e.target.value)
                    }
                    placeholder="State"
                  />

                  <FieldInput
                    label="Pincode"
                    value={form.pincode}
                    onChange={(e) =>
                      updateForm("pincode", e.target.value)
                    }
                    placeholder="Pincode"
                    maxLength={6}
                  />
                </div>
              </FormSection>
            </div>

            {/* Sticky Footer */}
            <DialogFooter className="border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:justify-end sm:gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDialogChange(false)}
                disabled={saving}
                className="h-10 rounded-xl border-slate-200 px-5 text-sm font-medium hover:bg-slate-100"
              >
                Cancel
              </Button>

              <Button
                type="submit"
                disabled={saving}
                className="h-10 rounded-xl bg-emerald-600 px-6 text-sm font-medium shadow-sm shadow-emerald-600/20 hover:bg-emerald-700"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Saving...
                  </span>
                ) : editing ? (
                  "Update Shop"
                ) : (
                  "Create Shop"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}