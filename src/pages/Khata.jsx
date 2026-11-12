import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Plus,
  Search,
  BookOpen,
  Users,
  Wallet,
  TrendingUp,
  X,
  Phone,
  MessageCircle,
  MapPin,
  ChevronRight,
  Camera,
  Loader2,
  ArrowUpRight,
  ArrowDownLeft,
  User,
} from "lucide-react"
import { toast } from "sonner"

const ENTRY_TYPES = [
  { value: "you_gave", label: "You Gave (Credit)" },
  { value: "customer_paid", label: "Customer Paid" },
  { value: "new_due", label: "New Due" },
  { value: "advance_received", label: "Advance Received" },
  { value: "advance_returned", label: "Advance Returned" },
]

const DEBIT_TYPES = ["you_gave", "new_due"]

const getToday = () => {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const initialForm = () => ({
  customer_name: "",
  mobile: "",
  address: "",
  entry_type: "you_gave",
  amount: "",
  due_date: "",
  notes: "",
  entry_date: getToday(),
  customer_photo: null,
  photo_preview: "",
})

function SummaryCard({ title, value, description, icon: Icon, iconBg = "bg-slate-100", iconColor = "text-slate-700" }) {
  return (
    <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[15px] font-medium text-slate-600 dark:text-slate-400">{title}</p>
          <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${iconBg} dark:bg-slate-800 dark:text-slate-300`}>
            <Icon className={`h-6 w-6 ${iconColor}`} />
          </div>
        </div>
        <p className="mt-1 text-[27px] font-semibold tracking-tight text-slate-950 dark:text-slate-50">{value}</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      </CardContent>
    </Card>
  )
}

function getEntryLabel(type) {
  return ENTRY_TYPES.find((entry) => entry.value === type)?.label || type
}
function getEntryAmountColor(type) {
  return DEBIT_TYPES.includes(type) ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
}
function getEntryPrefix(type) {
  return DEBIT_TYPES.includes(type) ? "+" : "-"
}

function CustomerKhataCard({ customer }) {
  const navigate = useNavigate()
  const balance = Number(customer.balance || 0)
  const recentEntries = customer.entries.slice(0, 2) 
  const urlKey = encodeURIComponent(customer.mobile || customer.name)

  const whatsappLink = customer.mobile 
    ? `https://wa.me/91${customer.mobile.replace(/\D/g, '')}?text=Namaste ${customer.name}, aapka current balance ${formatCurrency(Math.abs(balance))} hai. - Digital Khata`
    : null

  return (
    <Card className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:border-emerald-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-700">
      
      {/* Top Section: Profile */}
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          
          {/* Avatar & Info */}
          <div className="flex items-center gap-3.5">
            <div 
              className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50 text-slate-500 shadow-sm transition-transform hover:scale-105 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
              onClick={() => navigate(`/khata/${urlKey}`)}
            >
              {customer.photo ? (
                <img src={customer.photo} alt={customer.name} className="h-full w-full object-cover" />
              ) : (
                <User className="h-6 w-6" />
              )}
            </div>

            <div className="min-w-0">
              <h3 
                className="cursor-pointer truncate text-base sm:text-lg font-bold text-slate-900 transition-colors group-hover:text-emerald-700 dark:text-slate-100 dark:group-hover:text-emerald-400"
                onClick={() => navigate(`/khata/${urlKey}`)}
              >
                {customer.name}
              </h3>
              
              <div className="mt-1 flex flex-col gap-1 text-[13px] text-slate-500 dark:text-slate-400">
                {customer.mobile ? (
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3" /> {customer.mobile}
                  </span>
                ) : (
                  <span className="italic text-slate-400">No mobile saved</span>
                )}
                {customer.address && (
                  <span className="flex items-center gap-1.5 truncate max-w-[180px]">
                    <MapPin className="h-3 w-3 shrink-0" /> {customer.address}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Balance Highlight */}
          <div className="flex flex-col items-end shrink-0 bg-slate-50/80 px-3 py-2 rounded-xl border border-slate-100 dark:bg-slate-800/40 dark:border-slate-700/50">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {balance > 0 ? "You'll get" : balance < 0 ? "You'll pay" : "Settled"}
            </span>
            <span className={`text-lg font-black tabular-nums tracking-tight ${balance > 0 ? "text-red-600 dark:text-red-400" : balance < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-700 dark:text-slate-300"}`}>
              {formatCurrency(Math.abs(balance))}
            </span>
          </div>
        </div>
      </div>

      {/* Middle Section: Recent Activity List */}
      {recentEntries.length > 0 && (
        <div className="px-4 pb-4 sm:px-5">
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Recent Transactions
              </span>
              <span className="text-[10px] font-medium text-slate-400">
                Total: {customer.entries.length}
              </span>
            </div>
            
            <div className="space-y-2">
              {recentEntries.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${DEBIT_TYPES.includes(entry.entry_type) ? "bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"}`}>
                      {DEBIT_TYPES.includes(entry.entry_type) ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
                    </div>
                    <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-300">
                      {getEntryLabel(entry.entry_type)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[10px] text-slate-400">{formatDate(entry.entry_date)}</span>
                    <span className={`text-xs font-bold tabular-nums ${getEntryAmountColor(entry.entry_type)}`}>
                      {getEntryPrefix(entry.entry_type)}{formatCurrency(entry.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Action Bar */}
      <div className="flex border-t border-slate-100 dark:border-slate-800">
        <button 
          onClick={() => navigate(`/khata/${urlKey}`)}
          className="flex flex-1 items-center justify-center gap-2 py-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-emerald-700 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-emerald-400"
        >
          <BookOpen className="h-4 w-4" /> View Ledger
        </button>
        <div className="w-px bg-slate-100 dark:bg-slate-800"></div>
        <button 
          onClick={() => window.open(`tel:${customer.mobile}`)}
          disabled={!customer.mobile}
          className="flex flex-1 items-center justify-center gap-2 py-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-emerald-700 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-emerald-400"
        >
          <Phone className="h-4 w-4" /> Call
        </button>
        <div className="w-px bg-slate-100 dark:bg-slate-800"></div>
        <button 
          onClick={() => window.open(whatsappLink, "_blank")}
          disabled={!whatsappLink}
          className="flex flex-1 items-center justify-center gap-2 py-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-[#25D366]/10 hover:text-[#128C7E] disabled:opacity-50 dark:text-slate-400 dark:hover:bg-[#25D366]/20 dark:hover:text-[#25D366]"
        >
          <MessageCircle className="h-4 w-4" /> WhatsApp
        </button>
      </div>

    </Card>
  )
}

export default function Khata() {
  const { currentShop } = useShop()
  const fileInputRef = useRef(null)

  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [form, setForm] = useState(initialForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!currentShop?.id) {
      setEntries([])
      setLoading(false)
      return
    }
    loadEntries()
  }, [currentShop?.id])

  async function loadEntries() {
    if (!currentShop?.id) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("khata_entries")
        .select("*")
        .eq("shop_id", currentShop.id)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
      if (error) throw error
      setEntries(data || [])
    } catch (error) {
      toast.error(error.message || "Failed to load khata entries")
    } finally {
      setLoading(false)
    }
  }

  const customers = useMemo(() => {
    const grouped = new Map()
    entries.forEach((entry) => {
      const name = (entry.customer_name || "").trim()
      const mobile = (entry.mobile || "").trim()
      const key = `${name.toLowerCase()}_${mobile}`

      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          name,
          mobile,
          address: entry.address || "",
          photo: entry.customer_photo || "",
          entries: [],
          balance: 0,
          latestDate: entry.entry_date,
        })
      }
      const customer = grouped.get(key)
      customer.entries.push(entry)
      if (!customer.mobile && mobile) customer.mobile = mobile
      if (!customer.address && entry.address) customer.address = entry.address
      if (!customer.photo && entry.customer_photo) customer.photo = entry.customer_photo
    })

    return Array.from(grouped.values()).map((customer) => {
      const sortedEntries = [...customer.entries].sort((a, b) => {
        const dateDifference = new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()
        if (dateDifference !== 0) return dateDifference
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      })
      return {
        ...customer,
        entries: sortedEntries,
        balance: Number(sortedEntries[0]?.balance_after || 0),
        latestDate: sortedEntries[0]?.entry_date,
      }
    })
  }, [entries])

  const summary = useMemo(() => {
    const totalDue = customers.reduce((total, customer) => total + Math.max(customer.balance, 0), 0)
    const totalAdvance = customers.reduce((total, customer) => total + Math.max(-customer.balance, 0), 0)
    return { customers: customers.length, totalDue, totalAdvance, transactions: entries.length }
  }, [customers, entries])

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase()
    return customers
      .filter((customer) => {
        const searchMatch = !query || customer.name.toLowerCase().includes(query) || customer.mobile.toLowerCase().includes(query) || customer.address.toLowerCase().includes(query)
        let typeMatch = true
        if (typeFilter === "due") typeMatch = customer.balance > 0
        else if (typeFilter === "advance") typeMatch = customer.balance < 0
        else if (typeFilter === "settled") typeMatch = customer.balance === 0
        return searchMatch && typeMatch
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [customers, search, typeFilter])

  function updateForm(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  function openDialog() {
    setForm(initialForm())
    setDialogOpen(true)
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Photo must be smaller than 2MB")
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setForm(prev => ({
          ...prev,
          customer_photo: file,
          photo_preview: reader.result
        }))
      }
    }
    reader.readAsDataURL(file)
  }

  async function handleSave(e) {
    e.preventDefault()

    const customerName = form.customer_name.trim()
    const amount = Number(form.amount)

    if (!customerName) {
      toast.error("Please enter customer name")
      return
    }
    if (!form.amount || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Please enter a valid amount")
      return
    }

    setSaving(true)

    try {
      let uploadedPhotoUrl = null

      if (form.customer_photo) {
        const fileExt = form.customer_photo.name.split('.').pop()
        const fileName = `khata/${currentShop.id}/${Date.now()}.${fileExt}`

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(fileName, form.customer_photo, { upsert: true })

        if (uploadError) throw new Error("Photo upload failed: " + uploadError.message)

        const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(fileName)
        uploadedPhotoUrl = urlData.publicUrl
      }

      const normalizedMobile = form.mobile.trim()

      const customerEntries = entries.filter((entry) => {
        const sameName = (entry.customer_name || "").trim().toLowerCase() === customerName.toLowerCase()
        const sameMobile = (entry.mobile || "").trim() === normalizedMobile
        return sameName && sameMobile
      })

      const latestEntry = [...customerEntries].sort((a, b) => {
        const dateDifference = new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()
        if (dateDifference !== 0) return dateDifference
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      })[0]

      let balance = Number(latestEntry?.balance_after || 0)
      if (DEBIT_TYPES.includes(form.entry_type)) {
        balance += amount
      } else {
        balance -= amount
      }

      const { error } = await supabase.from("khata_entries").insert({
        shop_id: currentShop.id,
        customer_name: customerName,
        mobile: normalizedMobile || null,
        address: form.address.trim() || null,
        customer_photo: uploadedPhotoUrl || latestEntry?.customer_photo || null, // Photo carry forward
        entry_type: form.entry_type,
        amount,
        balance_after: balance,
        due_date: form.due_date || null,
        notes: form.notes.trim() || null,
        entry_date: form.entry_date,
      })

      if (error) throw error

      toast.success("Khata entry added successfully")
      setDialogOpen(false)
      setForm(initialForm())
      await loadEntries()
    } catch (error) {
      toast.error(error.message || "Failed to add khata entry")
    } finally {
      setSaving(false)
    }
  }

  if (!currentShop) {
    return <div className="flex items-center justify-center py-16"><p className="text-sm text-slate-500">Select a shop first</p></div>
  }

  return (
    <div className="w-full space-y-6 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Personal Khata</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage customer credits, payments and outstanding balances.</p>
        </div>
        <Button onClick={openDialog} className="h-10 rounded-xl bg-emerald-600 px-5 font-medium shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 text-white">
          <Plus className="mr-2 h-4 w-4" /> New Entry
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Total Customers" value={summary.customers} description="Customers in khata" icon={Users} />
        <SummaryCard title="Total Outstanding" value={formatCurrency(summary.totalDue)} description="Amount to be received" icon={Wallet} iconBg="bg-amber-100" iconColor="text-amber-700" />
        <SummaryCard title="Advance Balance" value={formatCurrency(summary.totalAdvance)} description="Customer advances received" icon={TrendingUp} iconBg="bg-emerald-100" iconColor="text-emerald-700" />
        <SummaryCard title="Total Entries" value={summary.transactions} description="Recorded transactions" icon={BookOpen} iconBg="bg-blue-100" iconColor="text-blue-700" />
      </div>

      <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Customer Khata</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{filteredCustomers.length} customers found</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, mobile..." className="h-11 rounded-xl border-slate-200 pl-10 pr-10 text-sm shadow-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
              {search && (
                <button type="button" onClick={() => setSearch("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-11 w-full rounded-xl border-slate-200 shadow-none sm:w-44 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                <SelectValue placeholder="All Customers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                <SelectItem value="due">With Due</SelectItem>
                <SelectItem value="advance">With Advance</SelectItem>
                <SelectItem value="settled">Settled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-4 bg-slate-50/50 p-4 sm:p-5 dark:bg-slate-900/50">
          {loading ? (
            <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-emerald-600 border-t-transparent" /></div>
          ) : filteredCustomers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-4 py-16 text-center dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800"><BookOpen className="h-5 w-5 text-slate-500 dark:text-slate-400" /></div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{entries.length === 0 ? "No khata entries yet" : "No matching customers"}</p>
              <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{entries.length === 0 ? "Add your first entry to start maintaining your customer khata." : "Try another search or change the filter."}</p>
              {entries.length === 0 && (
                <Button onClick={openDialog} className="mt-4 h-9 rounded-lg" variant="outline"><Plus className="h-4 w-4 mr-2" /> New Entry</Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredCustomers.map((customer) => (
                <CustomerKhataCard key={customer.key} customer={customer} />
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* --- NEW ENTRY DIALOG --- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl dark:bg-slate-900">
          <div className="border-b border-slate-100 bg-gradient-to-br from-emerald-50 via-white to-white px-6 pb-5 pt-6 dark:from-slate-800 dark:via-slate-900 dark:to-slate-900 dark:border-slate-800">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 shadow-lg shadow-emerald-600/25">
                <Plus className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0 flex-1 pr-6">
                <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">New Entry</DialogTitle>
                <DialogDescription className="mt-1 text-sm text-slate-500 dark:text-slate-400">Add customer details and transaction.</DialogDescription>
              </div>
            </div>
          </div>

          <form onSubmit={handleSave} className="flex flex-col">
            <div className="space-y-5 px-6 py-5">
              
              {/* Photo & Name Section */}
              <div className="flex items-center gap-4 bg-slate-50/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900/50">
                <div className="relative group">
                  <div 
                    className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-slate-200 shadow-sm cursor-pointer transition-opacity hover:opacity-80 dark:border-slate-700 dark:bg-slate-800" 
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {form.photo_preview ? (
                      <img src={form.photo_preview} alt="Preview" className="h-full w-full object-cover" />
                    ) : (
                      <Camera className="h-6 w-6 text-slate-500 dark:text-slate-400" />
                    )}
                  </div>
                  <div className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-emerald-600 text-white shadow-sm dark:border-slate-700">
                    <Plus className="h-3 w-3" />
                  </div>
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    ref={fileInputRef} 
                    onChange={handlePhotoChange} 
                  />
                </div>
                <div className="space-y-1.5 flex-1">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Customer Name <span className="text-red-500">*</span></Label>
                  <Input value={form.customer_name} onChange={(e) => updateForm("customer_name", e.target.value)} className="h-10 rounded-xl bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" required autoFocus />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Mobile Number</Label>
                  <Input type="tel" value={form.mobile} onChange={(e) => updateForm("mobile", e.target.value)} placeholder="10-digit" className="h-11 rounded-xl bg-slate-50/50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Address</Label>
                  <Input value={form.address} onChange={(e) => updateForm("address", e.target.value)} placeholder="City, Area" className="h-11 rounded-xl bg-slate-50/50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
                </div>
              </div>

              <div className="h-px bg-slate-100 dark:bg-slate-800 my-2" />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Entry Type</Label>
                  <Select value={form.entry_type} onValueChange={(val) => updateForm("entry_type", val)}>
                    <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/50 text-sm shadow-none transition-colors focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENTRY_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Amount (₹) <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">₹</span>
                    <Input type="number" min="0.01" step="0.01" required value={form.amount} onChange={(e) => updateForm("amount", e.target.value)} className="h-11 rounded-xl border-slate-200 bg-slate-50/50 pl-8 text-sm font-semibold shadow-none transition-colors placeholder:font-normal focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" placeholder="0.00" autoFocus />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Entry Date</Label>
                  <Input type="date" required value={form.entry_date} onChange={(e) => updateForm("entry_date", e.target.value)} className="h-11 rounded-xl border-slate-200 bg-slate-50/50 text-sm shadow-none transition-colors focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Due Date</Label>
                  <Input type="date" min={form.entry_date} value={form.due_date} onChange={(e) => updateForm("due_date", e.target.value)} className="h-11 rounded-xl border-slate-200 bg-slate-50/50 text-sm shadow-none transition-colors focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Notes</Label>
                <Textarea rows={2} placeholder="Add any extra details here..." value={form.notes} onChange={(e) => updateForm("notes", e.target.value)} className="resize-none rounded-xl border-slate-200 bg-slate-50/50 text-sm shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
              </div>

            </div>

            <DialogFooter className="border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:justify-end sm:gap-2 dark:border-slate-800 dark:bg-slate-900/50">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving} className="h-10 rounded-xl border-slate-200 px-5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</Button>
              <Button type="submit" disabled={saving} className="h-10 rounded-xl bg-emerald-600 px-6 text-sm font-medium shadow-sm shadow-emerald-600/20 hover:bg-emerald-700">
                {saving ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Saving...</span> : "Save Entry"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}