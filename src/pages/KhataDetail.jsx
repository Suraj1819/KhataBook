import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
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
  ArrowLeft,
  Phone,
  MessageCircle,
  Plus,
  CalendarDays,
  Trash2,
  AlertTriangle,
  Loader2,
  User,
  MapPin,
  FileText,
  Pencil,
  Camera,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Eye,
  RefreshCw,
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

const getEntryLabel = (type) => ENTRY_TYPES.find((e) => e.value === type)?.label || type
const getEntryAmountColor = (type) => (DEBIT_TYPES.includes(type) ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")
const getEntryPrefix = (type) => (DEBIT_TYPES.includes(type) ? "+" : "-")

const getToday = () => {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export default function KhataDetail() {
  const { customerKey } = useParams()
  const navigate = useNavigate()
  const { currentShop } = useShop()
  
  // Refs
  const editFileInputRef = useRef(null)
  const photoMenuRef = useRef(null)

  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  // Image Menu & Preview Modal State
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  
  // Custom Delete Photo Modal State
  const [deletePhotoModalOpen, setDeletePhotoModalOpen] = useState(false)
  const [deletingPhoto, setDeletingPhoto] = useState(false)

  // Delete Entry Modal State
  const [deleteEntryId, setDeleteEntryId] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // New Entry Modal State
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    entry_type: "you_gave",
    amount: "",
    due_date: "",
    notes: "",
    entry_date: getToday(),
  })

  // Edit Customer Modal State
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editForm, setEditForm] = useState({ name: "", mobile: "", address: "", photo: null, photo_preview: "" })
  const [editingSaving, setEditingSaving] = useState(false)

  useEffect(() => {
    if (!currentShop?.id || !customerKey) return
    loadEntries()
  }, [currentShop?.id, customerKey])

  // Close photo menu on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (photoMenuRef.current && !photoMenuRef.current.contains(event.target)) {
        setPhotoMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  async function loadEntries() {
    setLoading(true)
    try {
      const decodedKey = decodeURIComponent(customerKey).toLowerCase()

      const { data, error } = await supabase
        .from("khata_entries")
        .select("*")
        .eq("shop_id", currentShop.id)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })

      if (error) throw error

      const customerEntries = (data || []).filter((entry) => {
        const nameMatch = (entry.customer_name || "").trim().toLowerCase() === decodedKey
        const mobileMatch = (entry.mobile || "").trim() === decodedKey
        return nameMatch || mobileMatch
      })

      setEntries(customerEntries)
    } catch (error) {
      toast.error(error.message || "Failed to load customer khata")
    } finally {
      setLoading(false)
    }
  }

  const customerInfo = useMemo(() => {
    if (entries.length === 0) {
      return { name: "Customer", balance: 0, mobile: "", address: "", photo: "" }
    }
    const latest = entries[0]
    return {
      name: latest.customer_name,
      mobile: latest.mobile,
      address: latest.address,
      photo: latest.customer_photo,
      balance: Number(latest.balance_after || 0),
    }
  }, [entries])

  // ⚠️ HELPER: Storage se file delete karne ke liye
  async function removeFileFromStorage(url) {
    if (!url) return
    try {
      // URL se file path extract karein (e.g., khata/shop_id/12345.jpg)
      const urlParts = url.split("/avatars/")
      if (urlParts.length < 2) return
      
      const filePath = urlParts[1] // "khata/..."
      
      const { error } = await supabase.storage
        .from("avatars")
        .remove([filePath])
        
      if (error) console.error("Failed to remove file from storage:", error)
    } catch (err) {
      console.error("Storage remove error:", err)
    }
  }

  // --- PHOTO ACTIONS LOGIC ---
  function handlePhotoOption(action) {
    setPhotoMenuOpen(false)
    if (action === "preview") {
      setPreviewModalOpen(true)
    } else if (action === "replace" || action === "add") {
      editFileInputRef.current?.click()
    } else if (action === "edit") {
      openEditCustomer()
    } else if (action === "delete") {
      setDeletePhotoModalOpen(true)
    }
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Photo must be smaller than 2MB")
      return
    }

    setUploadingPhoto(true)
    try {
      // 1. Purani photo storage se delete karein (agar hai toh)
      if (customerInfo.photo) {
        await removeFileFromStorage(customerInfo.photo)
      }

      // 2. Nayi photo upload karein
      const fileExt = file.name.split('.').pop()
      const fileName = `khata/${currentShop.id}/${Date.now()}.${fileExt}`
      
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true })

      if (uploadError) throw uploadError
      
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(fileName)
      
      await updateCustomerPhotoInDB(urlData.publicUrl)
      
      toast.success("Photo updated successfully")
      await loadEntries()
    } catch (error) {
      toast.error(error.message || "Failed to upload photo")
    } finally {
      setUploadingPhoto(false)
      if (editFileInputRef.current) editFileInputRef.current.value = ""
    }
  }

  async function executeDeletePhoto() {
    setDeletingPhoto(true)
    try {
      // ⚠️ Pehle Storage se delete karein
      if (customerInfo.photo) {
        await removeFileFromStorage(customerInfo.photo)
      }
      
      // Phir DB se null karein
      await updateCustomerPhotoInDB(null)
      
      toast.success("Photo removed successfully")
      setDeletePhotoModalOpen(false)
      await loadEntries()
    } catch (error) {
      toast.error(error.message || "Failed to delete photo")
    } finally {
      setDeletingPhoto(false)
    }
  }

  async function updateCustomerPhotoInDB(photoUrl) {
    const decodedKey = decodeURIComponent(customerKey).toLowerCase()
    const { data: allEntries, error: fetchError } = await supabase
      .from("khata_entries")
      .select("id")
      .eq("shop_id", currentShop.id)
      .or(`customer_name.ilike.${decodedKey},mobile.eq.${decodedKey}`)

    if (fetchError) throw fetchError

    if (allEntries && allEntries.length > 0) {
      const entryIds = allEntries.map(e => e.id)
      const { error: updateError } = await supabase
        .from("khata_entries")
        .update({ customer_photo: photoUrl })
        .in("id", entryIds)

      if (updateError) throw updateError
    }
  }

  // --- NEW ENTRY LOGIC ---
  async function handleAddEntry(e) {
    e.preventDefault()
    const amount = Number(form.amount)

    if (!form.amount || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Please enter a valid amount")
      return
    }

    setSaving(true)
    try {
      let newBalance = customerInfo.balance
      if (DEBIT_TYPES.includes(form.entry_type)) {
        newBalance += amount
      } else {
        newBalance -= amount
      }

      const { error } = await supabase.from("khata_entries").insert({
        shop_id: currentShop.id,
        customer_name: customerInfo.name,
        mobile: customerInfo.mobile || null,
        address: customerInfo.address || null,
        customer_photo: customerInfo.photo || null,
        entry_type: form.entry_type,
        amount,
        balance_after: newBalance,
        due_date: form.due_date || null,
        notes: form.notes.trim() || null,
        entry_date: form.entry_date,
      })

      if (error) throw error

      toast.success("Entry added successfully")
      setAddDialogOpen(false)
      setForm({ entry_type: "you_gave", amount: "", due_date: "", notes: "", entry_date: getToday() })
      loadEntries()
    } catch (error) {
      toast.error(error.message || "Failed to add entry")
    } finally {
      setSaving(false)
    }
  }

  // --- DELETE ENTRY LOGIC ---
  async function handleDeleteEntry() {
    if (!deleteEntryId) return
    setDeleting(true)
    try {
      const { error } = await supabase
        .from("khata_entries")
        .delete()
        .eq("id", deleteEntryId)
        .eq("shop_id", currentShop.id)

      if (error) throw error

      toast.success("Entry deleted successfully")
      setDeleteEntryId(null)
      loadEntries()
    } catch (error) {
      toast.error(error.message || "Failed to delete entry")
    } finally {
      setDeleting(false)
    }
  }

  // --- EDIT CUSTOMER LOGIC ---
  function openEditCustomer() {
    setEditForm({
      name: customerInfo.name,
      mobile: customerInfo.mobile || "",
      address: customerInfo.address || "",
      photo: null,
      photo_preview: customerInfo.photo || "",
    })
    setEditDialogOpen(true)
  }

  function handleEditPhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Photo must be smaller than 2MB")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setEditForm((prev) => ({ ...prev, photo: file, photo_preview: reader.result }))
      }
    }
    reader.readAsDataURL(file)
  }

  async function handleUpdateCustomer(e) {
    e.preventDefault()
    if (!editForm.name.trim()) {
      toast.error("Customer name cannot be empty")
      return
    }

    setEditingSaving(true)
    try {
      let uploadedPhotoUrl = customerInfo.photo

      // Agar edit form se nayi photo select hui hai
      if (editForm.photo) {
        // 1. Purani photo storage se delete karein
        if (customerInfo.photo) {
          await removeFileFromStorage(customerInfo.photo)
        }

        // 2. Nayi upload karein
        const fileExt = editForm.photo.name.split('.').pop()
        const fileName = `khata/${currentShop.id}/${Date.now()}.${fileExt}`
        
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(fileName, editForm.photo, { upsert: true })

        if (uploadError) throw new Error("Photo upload failed: " + uploadError.message)
        
        const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(fileName)
        uploadedPhotoUrl = urlData.publicUrl
      }

      const decodedKey = decodeURIComponent(customerKey).toLowerCase()
      const { data: allEntries, error: fetchError } = await supabase
        .from("khata_entries")
        .select("id")
        .eq("shop_id", currentShop.id)
        .or(`customer_name.ilike.${decodedKey},mobile.eq.${decodedKey}`)

      if (fetchError) throw fetchError

      if (allEntries && allEntries.length > 0) {
        const entryIds = allEntries.map(e => e.id)

        const { error: updateError } = await supabase
          .from("khata_entries")
          .update({
            customer_name: editForm.name.trim(),
            mobile: editForm.mobile.trim() || null,
            address: editForm.address.trim() || null,
            customer_photo: uploadedPhotoUrl,
          })
          .in("id", entryIds)

        if (updateError) throw updateError
      }

      toast.success("Customer updated successfully")
      setEditDialogOpen(false)
      
      const newKey = encodeURIComponent(editForm.mobile.trim() || editForm.name.trim())
      if (newKey !== customerKey) {
        navigate(`/khata/${newKey}`, { replace: true })
      }
      
      await loadEntries()
    } catch (error) {
      toast.error(error.message || "Failed to update customer")
    } finally {
      setEditingSaving(false)
    }
  }

  const whatsappLink = customerInfo.mobile
    ? `https://wa.me/91${customerInfo.mobile.replace(/\D/g, "")}?text=Namaste ${customerInfo.name}, aapka current balance ${formatCurrency(Math.abs(customerInfo.balance))} hai. - Digital Khata`
    : null

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-8">
      
      {/* Hidden input for photo upload */}
      <input 
        type="file" 
        accept="image/*" 
        className="hidden" 
        ref={editFileInputRef} 
        onChange={handlePhotoUpload} 
      />

      {/* Header Breadcrumb */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => navigate("/khata")} className="h-9 w-9 rounded-full shrink-0 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 font-medium dark:text-slate-400">
            <Link to="/khata" className="hover:text-emerald-700 transition-colors dark:hover:text-emerald-400">Khata</Link>
            <span>/</span>
            <span className="text-slate-700 truncate dark:text-slate-200">{customerInfo.name}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 truncate dark:text-slate-50">
            {customerInfo.name}
          </h1>
        </div>
      </div>

      {/* Premium Profile Card */}
      <Card className="relative rounded-3xl border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="bg-slate-50 p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 dark:bg-slate-900/50 rounded-t-3xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            
            <div className="flex items-center gap-4 sm:gap-5">
              
              {/* Avatar with Dropdown Menu */}
              <div className="relative" ref={photoMenuRef}>
                <div 
                  className="relative group cursor-pointer"
                  onClick={() => setPhotoMenuOpen(!photoMenuOpen)}
                >
                  <div className="flex h-20 w-20 sm:h-24 sm:w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-emerald-100 text-emerald-700 shadow-md dark:border-slate-800 dark:bg-emerald-900/50 dark:text-emerald-400">
                    {uploadingPhoto || deletingPhoto ? (
                      <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                    ) : customerInfo.photo ? (
                      <img 
                        src={customerInfo.photo} 
                        alt={customerInfo.name} 
                        className="h-full w-full object-cover" 
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'block';
                        }}
                      />
                    ) : null}
                    <User className={`h-10 w-10 sm:h-12 sm:w-12 ${customerInfo.photo ? "hidden" : "block"}`} />
                  </div>
                  <div className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-white shadow-sm transition-transform group-hover:scale-110 dark:border-slate-800 dark:bg-slate-700">
                    <Camera className="h-3.5 w-3.5" />
                  </div>
                </div>

                {/* DYNAMIC OPTIONS DROPDOWN */}
                {photoMenuOpen && (
                  <div className="absolute left-0 top-full z-[100] mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-2xl dark:border-slate-700 dark:bg-slate-800">
                    {!customerInfo.photo ? (
                      <>
                        <button
                          onClick={() => handlePhotoOption("add")}
                          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                        >
                          <Camera className="h-4 w-4" /> Add Photo
                        </button>
                        <button
                          onClick={() => handlePhotoOption("edit")}
                          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/50"
                        >
                          <Pencil className="h-4 w-4" /> Edit Details
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handlePhotoOption("preview")}
                          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-emerald-600 dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-emerald-400"
                        >
                          <Eye className="h-4 w-4" /> Preview Photo
                        </button>
                        <button
                          onClick={() => handlePhotoOption("replace")}
                          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-emerald-600 dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-emerald-400"
                        >
                          <RefreshCw className="h-4 w-4" /> Replace Photo
                        </button>
                        <button
                          onClick={() => handlePhotoOption("edit")}
                          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-emerald-600 dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-emerald-400"
                        >
                          <Pencil className="h-4 w-4" /> Edit Details
                        </button>
                        <div className="my-1 h-px bg-slate-100 dark:bg-slate-700"></div>
                        <button
                          onClick={() => handlePhotoOption("delete")}
                          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                        >
                          <Trash2 className="h-4 w-4" /> Delete Photo
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 truncate dark:text-slate-100">{customerInfo.name}</h2>
                  <Button variant="ghost" size="icon" onClick={openEditCustomer} className="h-7 w-7 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-full dark:text-slate-500 dark:hover:text-emerald-400 dark:hover:bg-slate-800">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-500 dark:text-slate-400">
                  {customerInfo.mobile && (
                    <span className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-md border border-slate-100 dark:bg-slate-800 dark:border-slate-700">
                      <Phone className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" /> {customerInfo.mobile}
                    </span>
                  )}
                  {customerInfo.address && (
                    <span className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-md border border-slate-100 dark:bg-slate-800 dark:border-slate-700">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" /> {customerInfo.address}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Balance Info */}
            <div className="flex flex-col sm:items-end bg-white p-4 rounded-2xl border border-slate-100 sm:min-w-[200px] dark:bg-slate-800 dark:border-slate-700">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1 dark:text-slate-400">Current Balance</p>
              <p className={`text-3xl font-black tracking-tight ${customerInfo.balance > 0 ? "text-red-600 dark:text-red-400" : customerInfo.balance < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-slate-100"}`}>
                {formatCurrency(Math.abs(customerInfo.balance))}
              </p>
              <p className={`text-xs font-medium mt-1 ${customerInfo.balance > 0 ? "text-red-600/80 dark:text-red-400/80" : customerInfo.balance < 0 ? "text-emerald-600/80 dark:text-emerald-400/80" : "text-slate-500 dark:text-slate-400"}`}>
                {customerInfo.balance > 0 ? "You will get" : customerInfo.balance < 0 ? "You will pay" : "Settled"}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 sm:p-5 flex flex-wrap gap-2 sm:gap-3 bg-white dark:bg-slate-900 rounded-b-3xl">
          <Button asChild variant="outline" className="flex-1 h-11 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-emerald-400" disabled={!customerInfo.mobile}>
            <a href={`tel:${customerInfo.mobile}`}><Phone className="mr-2 h-4 w-4" /> Call</a>
          </Button>
          
          <Button asChild variant="outline" className="flex-1 h-11 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-emerald-400" disabled={!whatsappLink}>
            <a href={whatsappLink} target="_blank" rel="noreferrer"><MessageCircle className="mr-2 h-4 w-4" /> WhatsApp</a>
          </Button>
          
          <Button onClick={() => setAddDialogOpen(true)} className="flex-1 h-11 rounded-xl bg-emerald-600 shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 text-white">
            <Plus className="mr-2 h-4 w-4" /> New Entry
          </Button>
        </div>
      </Card>

      {/* Transaction History */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 dark:text-slate-100">
            <FileText className="h-5 w-5 text-slate-400 dark:text-slate-500" />
            Transaction History
          </h3>
          <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full dark:bg-slate-800 dark:text-slate-300">
            {entries.length} Entries
          </span>
        </div>
        
        <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 mb-3 dark:bg-slate-800">
                <Wallet className="h-6 w-6 text-slate-300 dark:text-slate-500" />
              </div>
              <p className="text-slate-900 font-medium dark:text-slate-100">No transactions yet</p>
              <p className="text-sm text-slate-500 mt-1 max-w-[250px] dark:text-slate-400">Add your first transaction for {customerInfo.name} to start tracking.</p>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/80 border-b border-slate-100 dark:bg-slate-800/50 dark:border-slate-800">
                    <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <th className="px-5 py-4">Date</th>
                      <th className="px-5 py-4">Transaction Type</th>
                      <th className="px-5 py-4">Notes</th>
                      <th className="px-5 py-4 text-right">Amount</th>
                      <th className="px-5 py-4 text-right">Balance</th>
                      <th className="px-5 py-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {entries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors group dark:hover:bg-slate-800/50">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                            <CalendarDays className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                            <span className="font-medium">{formatDate(entry.entry_date)}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${DEBIT_TYPES.includes(entry.entry_type) ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"}`}>
                            {DEBIT_TYPES.includes(entry.entry_type) ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownLeft className="h-3.5 w-3.5" />}
                            {getEntryLabel(entry.entry_type)}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm text-slate-600 line-clamp-1 max-w-[200px] dark:text-slate-400" title={entry.notes}>
                            {entry.notes || <span className="text-slate-400 italic dark:text-slate-600">No notes</span>}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className={`text-sm font-bold tabular-nums ${getEntryAmountColor(entry.entry_type)}`}>
                            {getEntryPrefix(entry.entry_type)}{formatCurrency(entry.amount)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="text-sm font-semibold text-slate-700 tabular-nums dark:text-slate-300">
                            {formatCurrency(entry.balance_after)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-300 opacity-0 group-hover:opacity-100 transition-all hover:text-red-600 hover:bg-red-50 dark:text-slate-600 dark:hover:text-red-400 dark:hover:bg-red-950/30"
                            onClick={() => setDeleteEntryId(entry.id)}
                            title="Delete Entry"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                {entries.map((entry) => (
                  <div key={entry.id} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors dark:hover:bg-slate-800/50">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${DEBIT_TYPES.includes(entry.entry_type) ? "bg-red-50 border-red-100 text-red-600 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-400" : "bg-emerald-50 border-emerald-100 text-emerald-600 dark:bg-emerald-950/30 dark:border-emerald-900/50 dark:text-emerald-400"}`}>
                        {DEBIT_TYPES.includes(entry.entry_type) ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownLeft className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate dark:text-slate-100">{getEntryLabel(entry.entry_type)}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-1 font-medium"><CalendarDays className="h-3.5 w-3.5" /> {formatDate(entry.entry_date)}</span>
                          {entry.notes && (
                            <>
                              <span className="text-slate-300 dark:text-slate-600">•</span>
                              <span className="truncate max-w-[120px] italic">{entry.notes}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className={`text-sm font-bold tabular-nums ${getEntryAmountColor(entry.entry_type)}`}>
                          {getEntryPrefix(entry.entry_type)}{formatCurrency(entry.amount)}
                        </p>
                        <p className="text-[10px] font-medium text-slate-400 mt-0.5 dark:text-slate-500">Bal: {formatCurrency(entry.balance_after)}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-300 hover:text-red-600 hover:bg-red-50 dark:text-slate-600 dark:hover:text-red-400 dark:hover:bg-red-950/30"
                        onClick={() => setDeleteEntryId(entry.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* --- ADD NEW ENTRY DIALOG --- */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl dark:bg-slate-900">
          <div className="border-b border-slate-100 bg-gradient-to-br from-emerald-50 via-white to-white px-6 pb-5 pt-6 dark:from-slate-800 dark:via-slate-900 dark:to-slate-900 dark:border-slate-800">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 shadow-lg shadow-emerald-600/25">
                <Plus className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0 flex-1 pr-6">
                <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">New Entry</DialogTitle>
                <DialogDescription className="mt-1 text-sm text-slate-500 dark:text-slate-400">For {customerInfo.name} — add a credit or payment.</DialogDescription>
              </div>
            </div>
          </div>

          <form onSubmit={handleAddEntry} className="flex flex-col">
            <div className="space-y-5 px-6 py-5">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Entry Type</Label>
                <Select value={form.entry_type} onValueChange={(val) => setForm((f) => ({ ...f, entry_type: val }))}>
                  <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/50 text-sm shadow-none transition-colors focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTRY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Amount (₹) <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">₹</span>
                    <Input type="number" min="0.01" step="0.01" required value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="h-11 rounded-xl border-slate-200 bg-slate-50/50 pl-8 text-sm font-semibold shadow-none transition-colors placeholder:font-normal focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" placeholder="0.00" autoFocus />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Date</Label>
                  <Input type="date" required value={form.entry_date} onChange={(e) => setForm((f) => ({ ...f, entry_date: e.target.value }))} className="h-11 rounded-xl border-slate-200 bg-slate-50/50 text-sm shadow-none transition-colors focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Due Date <span className="text-slate-400 font-normal dark:text-slate-500">(Optional)</span></Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} className="h-11 rounded-xl border-slate-200 bg-slate-50/50 text-sm shadow-none transition-colors focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Notes</Label>
                <Textarea rows={2} placeholder="Add any extra details here..." value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="resize-none rounded-xl border-slate-200 bg-slate-50/50 text-sm shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
              </div>

              {form.amount && Number(form.amount) > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 flex items-center justify-between dark:border-slate-700 dark:bg-slate-900/50">
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">New Balance</p>
                    <p className="text-sm text-slate-700 mt-0.5 dark:text-slate-300">
                      {DEBIT_TYPES.includes(form.entry_type) ? "Will increase by" : "Will decrease by"}{" "}
                      <span className="font-semibold">{formatCurrency(Number(form.amount))}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${DEBIT_TYPES.includes(form.entry_type) ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {formatCurrency(DEBIT_TYPES.includes(form.entry_type) ? customerInfo.balance + Number(form.amount) : customerInfo.balance - Number(form.amount))}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:justify-end sm:gap-2 dark:border-slate-800 dark:bg-slate-900/50">
              <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)} disabled={saving} className="h-10 rounded-xl border-slate-200 px-5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</Button>
              <Button type="submit" disabled={saving} className="h-10 rounded-xl bg-emerald-600 px-6 text-sm font-medium shadow-sm shadow-emerald-600/20 hover:bg-emerald-700">
                {saving ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Saving...</span> : "Add Entry"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* --- EDIT CUSTOMER DIALOG (WITH PHOTO UPLOAD) --- */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl dark:bg-slate-900">
          <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-white px-6 pb-5 pt-6 dark:from-slate-800 dark:via-slate-900 dark:to-slate-900 dark:border-slate-800">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 shadow-lg shadow-slate-900/25 dark:bg-slate-700">
                <Pencil className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0 flex-1 pr-6">
                <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">Edit Customer</DialogTitle>
                <DialogDescription className="mt-1 text-sm text-slate-500 dark:text-slate-400">Update details for {customerInfo.name}.</DialogDescription>
              </div>
            </div>
          </div>

          <form onSubmit={handleUpdateCustomer} className="flex flex-col">
            <div className="space-y-5 px-6 py-5">
              
              {/* Photo & Name Section */}
              <div className="flex items-center gap-4 bg-slate-50/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900/50">
                <div className="relative group">
                  <div 
                    className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-slate-200 shadow-sm cursor-pointer transition-opacity hover:opacity-80 dark:border-slate-700 dark:bg-slate-800" 
                    onClick={() => editFileInputRef.current?.click()}
                  >
                    {editForm.photo_preview ? (
                      <img src={editForm.photo_preview} alt="Preview" className="h-full w-full object-cover" />
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
                    ref={editFileInputRef} 
                    onChange={handleEditPhotoChange} 
                  />
                </div>
                <div className="space-y-1.5 flex-1">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Customer Name <span className="text-red-500">*</span></Label>
                  <Input value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} className="h-10 rounded-xl bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" required />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Mobile Number</Label>
                  <Input type="tel" value={editForm.mobile} onChange={(e) => setEditForm(f => ({ ...f, mobile: e.target.value }))} className="h-11 rounded-xl bg-slate-50/50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" placeholder="10-digit" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Address</Label>
                  <Input value={editForm.address} onChange={(e) => setEditForm(f => ({ ...f, address: e.target.value }))} className="h-11 rounded-xl bg-slate-50/50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" placeholder="City, Area" />
                </div>
              </div>
            </div>

            <DialogFooter className="border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:justify-end sm:gap-2 dark:border-slate-800 dark:bg-slate-900/50">
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)} className="h-10 rounded-xl border-slate-200 px-5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</Button>
              <Button type="submit" disabled={editingSaving} className="h-10 rounded-xl bg-emerald-600 px-6 text-sm font-medium shadow-sm shadow-emerald-600/20 hover:bg-emerald-700">
                {editingSaving ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Saving...</span> : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* --- DELETE ENTRY DIALOG --- */}
      <Dialog open={!!deleteEntryId} onOpenChange={() => setDeleteEntryId(null)}>
        <DialogContent className="max-w-sm gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl dark:bg-slate-900">
           <div className="px-6 py-6 flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100/80 dark:bg-red-950/50">
              <AlertTriangle className="h-7 w-7 text-red-600 dark:text-red-400" />
            </div>
            <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">Delete Entry?</DialogTitle>
            <DialogDescription className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Are you sure you want to delete this transaction? This action cannot be undone and will affect the total balance.
            </DialogDescription>
          </div>
          <DialogFooter className="bg-slate-50/70 border-t border-slate-100 p-4 flex flex-col sm:flex-row gap-2 sm:justify-end dark:border-slate-800 dark:bg-slate-900/50">
            <Button variant="outline" onClick={() => setDeleteEntryId(null)} disabled={deleting} className="w-full sm:w-auto h-10 rounded-xl border-slate-200 px-5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              Cancel
            </Button>
            <Button onClick={handleDeleteEntry} disabled={deleting} className="w-full sm:w-auto h-10 rounded-xl bg-red-600 text-white px-5 text-sm font-medium shadow-sm shadow-red-600/20 hover:bg-red-700">
              {deleting ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Deleting...</span> : "Delete Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- DELETE PHOTO DIALOG --- */}
      <Dialog open={deletePhotoModalOpen} onOpenChange={setDeletePhotoModalOpen}>
        <DialogContent className="max-w-sm gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl dark:bg-slate-900">
           <div className="px-6 py-6 flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100/80 dark:bg-red-950/50">
              <Trash2 className="h-7 w-7 text-red-600 dark:text-red-400" />
            </div>
            <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">Delete Photo?</DialogTitle>
            <DialogDescription className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Are you sure you want to remove {customerInfo.name}'s profile photo? This will also delete it from storage.
            </DialogDescription>
          </div>
          <DialogFooter className="bg-slate-50/70 border-t border-slate-100 p-4 flex flex-col sm:flex-row gap-2 sm:justify-end dark:border-slate-800 dark:bg-slate-900/50">
            <Button variant="outline" onClick={() => setDeletePhotoModalOpen(false)} disabled={deletingPhoto} className="w-full sm:w-auto h-10 rounded-xl border-slate-200 px-5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              Cancel
            </Button>
            <Button onClick={executeDeletePhoto} disabled={deletingPhoto} className="w-full sm:w-auto h-10 rounded-xl bg-red-600 text-white px-5 text-sm font-medium shadow-sm shadow-red-600/20 hover:bg-red-700">
              {deletingPhoto ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Removing...</span> : "Delete Photo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- PREVIEW IMAGE MODAL --- */}
      <Dialog open={previewModalOpen} onOpenChange={setPreviewModalOpen}>
        <DialogContent className="max-w-xl overflow-hidden rounded-2xl border-0 p-0 shadow-2xl dark:bg-slate-900">
          <div className="relative flex items-center justify-center bg-slate-950 p-2 sm:p-4">
            {customerInfo.photo && (
              <img 
                src={customerInfo.photo} 
                alt={customerInfo.name} 
                className="max-h-[80vh] w-auto rounded-lg object-contain shadow-lg" 
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}