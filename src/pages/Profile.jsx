import { useRef, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase" // Make sure path is correct
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { User, Mail, Phone, Save, Loader2, Camera } from "lucide-react"
import { toast } from "sonner"

function getInitials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
}

export default function Profile() {
  const { user, profile, updateProfile } = useAuth()
  const fileInputRef = useRef(null)

  const [form, setForm] = useState({
    full_name: profile?.full_name || "",
    mobile: profile?.mobile || "",
  })
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url || "")
  const [selectedFile, setSelectedFile] = useState(null) // Naya state file ke liye
  const [saving, setSaving] = useState(false)

  const displayName = form.full_name || user?.email?.split("@")[0] || "User"
  const initials = getInitials(displayName) || "U"

  function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file")
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be smaller than 2 MB")
      return
    }

    // Save file for upload and create preview
    setSelectedFile(file)
    
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === "string") {
        setAvatarPreview(result)
      }
    }
    reader.readAsDataURL(file)
  }

  async function handleSave(e) {
    e.preventDefault()

    if (!form.full_name.trim()) {
      toast.error("Full name cannot be empty")
      return
    }

    setSaving(true)

    try {
      let finalAvatarUrl = profile?.avatar_url || ""

      // 1. Agar user ne nayi photo select ki hai, toh Supabase Storage mein upload karein
      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop()
        // Unique filename banayein taaki cache issue na aaye
        const fileName = `${user.id}-${Date.now()}.${fileExt}`

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(fileName, selectedFile, { upsert: true })

        if (uploadError) throw new Error("Failed to upload image: " + uploadError.message)

        // Upload hone ke baad public URL nikalein
        const { data: urlData } = supabase.storage
          .from("avatars")
          .getPublicUrl(fileName)

        finalAvatarUrl = urlData.publicUrl
      }

      // 2. Profile update karein (text aur avatar_url dono)
      await updateProfile({
        full_name: form.full_name.trim(),
        mobile: form.mobile.trim(),
        avatar_url: finalAvatarUrl,
      })
      
      toast.success("Profile updated successfully")
      setSelectedFile(null) // File state clear karein
    } catch (err) {
      toast.error(err.message || "Failed to update profile")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-6 pb-8">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Profile &amp; Account
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your personal details.
        </p>
      </div>

      {/* Card */}
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-5 sm:p-6">
          {/* ===== Photo section ===== */}
          <div className="mb-6 flex flex-col items-center">
            <div className="relative">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-emerald-600 text-xl font-semibold text-white shadow-lg shadow-emerald-600/25 ring-1 ring-slate-100">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt={displayName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initials
                )}
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-emerald-600 text-white shadow-md transition-colors hover:bg-emerald-700"
                title="Change photo"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>

            <p className="mt-3 text-base font-semibold tracking-tight text-slate-900">
              {displayName}
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              {user?.email || "No email"}
            </p>
          </div>

          <div className="mb-5 h-px bg-slate-100" />

          {/* ===== Form ===== */}
          <form onSubmit={handleSave} className="space-y-5">
            {/* Email (read-only) */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">
                Email
              </Label>

              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={user?.email || ""}
                  disabled
                  className="h-11 cursor-not-allowed rounded-xl border-slate-200 bg-slate-100 pl-10 text-sm text-slate-500 shadow-none"
                />
              </div>
            </div>

            {/* Full name */}
            <div className="space-y-1.5">
              <Label
                htmlFor="full_name"
                className="text-sm font-medium text-slate-700"
              >
                Full name
              </Label>

              <div className="relative">
                <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="full_name"
                  value={form.full_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, full_name: e.target.value }))
                  }
                  placeholder="Enter your full name"
                  className="h-11 rounded-xl border-slate-200 bg-slate-50/50 pl-10 text-sm shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/20"
                />
              </div>
            </div>

            {/* Mobile */}
            <div className="space-y-1.5">
              <Label
                htmlFor="mobile"
                className="text-sm font-medium text-slate-700"
              >
                Mobile
              </Label>

              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="mobile"
                  type="tel"
                  inputMode="numeric"
                  value={form.mobile}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      mobile: e.target.value
                        .replace(/[^\d]/g, "")
                        .slice(0, 10),
                    }))
                  }
                  placeholder="10-digit mobile number"
                  className="h-11 rounded-xl border-slate-200 bg-slate-50/50 pl-10 text-sm shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/20"
                />
              </div>
            </div>

            {/* Save button */}
            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                disabled={saving}
                className="h-10 rounded-xl bg-emerald-600 px-5 text-sm font-medium shadow-sm shadow-emerald-600/20 hover:bg-emerald-700"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Save className="h-4 w-4" />
                    Save changes
                  </span>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}