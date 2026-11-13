import { useEffect, useMemo, useRef, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useShop } from "@/contexts/ShopContext"
import { supabase } from "@/lib/supabase"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"

import {
  BadgeCheck,
  Camera,
  CheckCircle2,
  ChevronRight,
  Circle,
  Copy,
  Eye,
  EyeOff,
  ImagePlus,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  MonitorSmartphone,
  Phone,
  RotateCcw,
  Save,
  ShieldCheck,
  Store,
  Trash2,
  User,
  UserCircle2,
} from "lucide-react"

import { toast } from "sonner"

/* ==================================================
   CONSTANTS & HELPERS
================================================== */

const AVATAR_BUCKET = "avatars"
const MAX_AVATAR_SIZE = 2 * 1024 * 1024 // 2 MB
const MIN_PASSWORD_LENGTH = 8
const MOBILE_REGEX = /^[6-9]\d{9}$/ // Indian 10-digit mobile

const OUTLINE_BUTTON_CLASS =
  "rounded-xl border-violet-200 bg-white text-slate-700 shadow-sm hover:bg-violet-50"

const INPUT_CLASS =
  "h-11 rounded-xl border-slate-200 bg-slate-50/50 pl-10 text-sm shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus-visible:bg-slate-900"

function getInitials(name = "") {
  return (
    String(name)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U"
  )
}

function formatDateTime(value) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatDay(value) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function getAvatarPath(url) {
  if (!url || !url.includes(`/${AVATAR_BUCKET}/`)) return null
  return decodeURIComponent(url.split(`/${AVATAR_BUCKET}/`)[1].split("?")[0])
}

function getPasswordStrength(password) {
  if (!password) return 0
  let score = 0
  if (password.length >= MIN_PASSWORD_LENGTH) score += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1
  return score
}

const STRENGTH_META = [
  { label: "", bar: "bg-slate-200", text: "text-slate-500" },
  { label: "Weak", bar: "bg-rose-500", text: "text-rose-600" },
  { label: "Fair", bar: "bg-amber-500", text: "text-amber-600" },
  { label: "Good", bar: "bg-emerald-500", text: "text-emerald-600" },
  { label: "Strong", bar: "bg-emerald-600", text: "text-emerald-700" },
]

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(successMessage)
  } catch {
    toast.error("Could not copy. Please copy it manually.")
  }
}

/* ==================================================
   SMALL UI PIECES
================================================== */

function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 dark:bg-slate-800 ${className}`} />
}

function ProfileSkeleton() {
  return (
    <div className="min-h-full w-full space-y-4 rounded-2xl bg-[#f7f5ff] px-3 py-5 sm:px-5 lg:px-6 dark:bg-slate-950" aria-busy="true" aria-label="Loading profile">
      <Skeleton className="h-16 w-72" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
        <Skeleton className="h-[460px] rounded-[20px]" />
        <div className="space-y-4">
          <Skeleton className="h-[340px] rounded-[20px]" />
          <Skeleton className="h-[300px] rounded-[20px]" />
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ icon: Icon, title, description, action }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#eae7f4] px-5 py-4 dark:border-slate-800">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[16px] font-bold tracking-tight text-[#171a36] dark:text-slate-100">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </div>
      {action}
    </div>
  )
}

function Field({ id, label, icon: Icon, error, hint, children }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        {children}
      </div>
      {error ? (
        <p className="text-xs font-medium text-rose-600 dark:text-rose-400" role="alert">{error}</p>
      ) : (
        hint && <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      )}
    </div>
  )
}

function InfoRow({ label, value, action }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#efedf6] py-3 last:border-0 dark:border-slate-800">
      <span className="shrink-0 text-[13px] font-medium text-slate-600 dark:text-slate-400">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[13px] font-semibold text-slate-800 dark:text-slate-200">{value}</span>
        {action}
      </div>
    </div>
  )
}

function PasswordInput({ id, value, onChange, show, onToggle, placeholder, autoComplete }) {
  return (
    <>
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`${INPUT_CLASS} pr-11`}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-violet-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </>
  )
}

/* ==================================================
   PROFILE
================================================== */

export default function Profile() {
  const { user, profile, updateProfile } = useAuth()
  const { currentShop } = useShop()

  const fileInputRef = useRef(null)
  const touched = useRef(false)

  const saved = useMemo(
    () => ({
      full_name: profile?.full_name || "",
      mobile: profile?.mobile || "",
    }),
    [profile?.full_name, profile?.mobile]
  )

  const [form, setForm] = useState(saved)
  const [errors, setErrors] = useState({})
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState("")
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [saving, setSaving] = useState(false)

  const [passwords, setPasswords] = useState({ next: "", confirm: "" })
  const [showPassword, setShowPassword] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)

  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [signingOutOthers, setSigningOutOthers] = useState(false)

  useEffect(() => {
    if (!touched.current) setForm(saved)
  }, [saved])

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl("")
      return
    }
    const url = URL.createObjectURL(selectedFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [selectedFile])

  const avatarSrc = removeAvatar ? "" : previewUrl || profile?.avatar_url || ""

  const isDirty =
    form.full_name.trim() !== saved.full_name ||
    form.mobile.trim() !== saved.mobile ||
    Boolean(selectedFile) ||
    removeAvatar

  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [isDirty])

  const displayName = form.full_name.trim() || user?.email?.split("@")[0] || "User"
  const initials = getInitials(displayName)
  const emailVerified = Boolean(user?.email_confirmed_at)

  const completeness = useMemo(() => {
    const items = [
      { label: "Full name added", done: Boolean(saved.full_name) },
      { label: "Mobile number added", done: MOBILE_REGEX.test(saved.mobile) },
      { label: "Profile photo added", done: Boolean(profile?.avatar_url) },
      { label: "Email verified", done: emailVerified },
    ]
    const doneCount = items.filter((item) => item.done).length
    return { items, percent: Math.round((doneCount / items.length) * 100) }
  }, [saved, profile?.avatar_url, emailVerified])

  const strength = getPasswordStrength(passwords.next)
  const strengthMeta = STRENGTH_META[strength]

  function handleAvatarChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file")
      return
    }
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error("Image must be smaller than 2 MB")
      return
    }
    setSelectedFile(file)
    setRemoveAvatar(false)
  }

  function handleRemoveAvatar() {
    setSelectedFile(null)
    setRemoveAvatar(true)
  }

  function validate() {
    const next = {}
    if (!form.full_name.trim()) next.full_name = "Full name cannot be empty."
    else if (form.full_name.trim().length < 2) next.full_name = "Enter at least 2 characters."
    if (form.mobile && !MOBILE_REGEX.test(form.mobile)) {
      next.mobile = "Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9."
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function handleFormChange(key, value) {
    touched.current = true
    setForm((current) => ({ ...current, [key]: value }))
    if (errors[key]) setErrors((current) => ({ ...current, [key]: "" }))
  }

  function handleReset() {
    touched.current = false
    setForm(saved)
    setErrors({})
    setSelectedFile(null)
    setRemoveAvatar(false)
  }

  async function handleSave(event) {
    event.preventDefault()
    if (!validate()) return
    setSaving(true)
    try {
      const oldAvatarUrl = profile?.avatar_url || ""
      let finalAvatarUrl = removeAvatar ? "" : oldAvatarUrl

      if (selectedFile) {
        const fileExt = selectedFile.name.split(".").pop()
        const fileName = `${user.id}-${Date.now()}.${fileExt}`
        const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(fileName, selectedFile, { upsert: true })
        if (uploadError) throw new Error(`Failed to upload image: ${uploadError.message}`)
        const { data: urlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(fileName)
        finalAvatarUrl = urlData.publicUrl
      }

      await updateProfile({
        full_name: form.full_name.trim(),
        mobile: form.mobile.trim(),
        avatar_url: finalAvatarUrl,
      })

      if (oldAvatarUrl && oldAvatarUrl !== finalAvatarUrl) {
        const oldPath = getAvatarPath(oldAvatarUrl)
        if (oldPath) supabase.storage.from(AVATAR_BUCKET).remove([oldPath]).catch(() => {})
      }

      touched.current = false
      setSelectedFile(null)
      setRemoveAvatar(false)
      toast.success("Profile updated successfully")
    } catch (error) {
      toast.error(error?.message || "Failed to update profile")
    } finally {
      setSaving(false)
    }
  }

  async function handlePasswordChange(event) {
    event.preventDefault()
    if (passwords.next.length < MIN_PASSWORD_LENGTH) return toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    if (strength < 2) return toast.error("Choose a stronger password with letters and numbers")
    if (passwords.next !== passwords.confirm) return toast.error("Passwords do not match")

    setPasswordSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: passwords.next })
      if (error) throw error
      setPasswords({ next: "", confirm: "" })
      setShowPassword(false)
      toast.success("Password changed successfully")
    } catch (error) {
      toast.error(error?.message || "Failed to change password")
    } finally {
      setPasswordSaving(false)
    }
  }

  async function handleSignOutOthers() {
    setSigningOutOthers(true)
    try {
      const { error } = await supabase.auth.signOut({ scope: "others" })
      if (error) throw error
      toast.success("Signed out from all other devices")
    } catch (error) {
      toast.error(error?.message || "Could not sign out other devices")
    } finally {
      setSigningOutOthers(false)
    }
  }

  async function handleSignOut() {
    setSigningOut(true)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch (error) {
      toast.error(error?.message || "Could not sign out")
      setSigningOut(false)
      setConfirmSignOut(false)
    }
  }

  if (!user) return <ProfileSkeleton />
  const passwordMismatch = passwords.confirm && passwords.next !== passwords.confirm

  return (
    <div className="min-h-full w-full space-y-4 rounded-2xl bg-[#f7f5ff] px-3 py-5 sm:px-5 lg:px-6 dark:bg-slate-950">
      
      {/* PAGE HEADER */}
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>{currentShop?.name || "Workspace"}</span>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            <span>Profile</span>
          </nav>
          <h1 className="mt-1 text-[29px] font-bold tracking-tight text-[#171a39] sm:text-[32px] dark:text-slate-100">
            Profile &amp; Account
          </h1>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            Manage your personal details, photo, password and signed-in devices.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[340px_1fr]">
        
        {/* ================= LEFT COLUMN (STICKY) ================= */}
        <div className="space-y-4 lg:sticky lg:top-6">
          
          {/* PROFILE SUMMARY */}
          <Card className="overflow-hidden rounded-[20px] border border-white/80 bg-white/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)] backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/85">
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col items-center text-center">
                <div className="relative flex flex-col items-center">
                  <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-emerald-600 text-3xl font-semibold text-white shadow-[0_8px_22px_rgba(16,185,129,0.18)] ring-1 ring-slate-100">
                    {avatarSrc ? (
                      <img src={avatarSrc} alt={displayName} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded-full border border-violet-100 bg-white text-violet-600 shadow-inner">
                        <ImagePlus className="h-10 w-10" strokeWidth={2.1} aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                </div>

                <h2 className="mt-4 max-w-full truncate text-lg font-bold tracking-tight text-[#171a36] dark:text-slate-100">
                  {displayName}
                </h2>
                <p className="mt-0.5 max-w-full truncate text-sm text-slate-500 dark:text-slate-400">
                  {user.email || "No email"}
                </p>

                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  {emailVerified ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                      <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      Email verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                      Email not verified
                    </span>
                  )}
                  {profile?.role && (
                    <span className="rounded-full border border-violet-200 bg-violet-100 px-2.5 py-1 text-[11px] font-bold capitalize text-violet-700 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-400">
                      {profile.role}
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-9 gap-2 rounded-xl border-violet-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm hover:bg-violet-50"
                  >
                    <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                    {avatarSrc ? "Change photo" : "Add photo"}
                  </Button>
                  {(avatarSrc || profile?.avatar_url) && !removeAvatar && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRemoveAvatar}
                      className="h-9 gap-2 rounded-xl border-rose-200 bg-white px-4 text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Remove photo
                    </Button>
                  )}
                </div>

                {(selectedFile || removeAvatar) && (
                  <p className="mt-3 text-xs font-medium text-amber-600">
                    {removeAvatar ? "Photo will be removed when you save." : "New photo selected. Save changes to apply."}
                  </p>
                )}
              </div>

              {/* COMPLETENESS */}
              <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Profile completeness</p>
                  <p className="text-sm font-extrabold tabular-nums text-slate-900 dark:text-slate-100">{completeness.percent}%</p>
                </div>
                <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white" role="progressbar" aria-label="Profile completeness" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completeness.percent}>
                  <div className="h-full rounded-full bg-emerald-600 transition-all duration-500" style={{ width: `${completeness.percent}%` }} />
                </div>
                <ul className="mt-3 space-y-1.5">
                  {completeness.items.map((item) => (
                    <li key={item.label} className="flex items-center gap-2 text-xs">
                      {item.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> : <Circle className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />}
                      <span className={item.done ? "text-slate-700 dark:text-slate-300" : "text-slate-500"}>{item.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* WORKSPACE */}
          <Card className="overflow-hidden rounded-[20px] border border-white/80 bg-white/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)] dark:border-slate-800 dark:bg-slate-900/85">
            <SectionHeader icon={Store} title="Workspace" description="The shop you are working in." />
            <CardContent className="px-5 py-1">
              <InfoRow label="Shop name" value={currentShop?.name || "Not selected"} />
              {profile?.role && <InfoRow label="Your role" value={<span className="capitalize">{profile.role}</span>} />}
            </CardContent>
          </Card>
        </div>

        {/* ================= RIGHT COLUMN ================= */}
        <div className="min-w-0 space-y-4">
          {/* PERSONAL DETAILS */}
          <Card className="overflow-hidden rounded-[20px] border border-white/80 bg-white/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)] dark:border-slate-800 dark:bg-slate-900/85">
            <SectionHeader
              icon={UserCircle2}
              title="Personal details"
              description="Your name and contact number."
              action={isDirty && <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">Unsaved changes</span>}
            />
            <CardContent className="p-5 sm:p-6">
              <form onSubmit={handleSave} className="space-y-5" noValidate>
                <Field id="email" label="Email" icon={Mail} hint="Email is used to sign in and cannot be changed here.">
                  <Input id="email" value={user.email || ""} disabled className="h-11 cursor-not-allowed rounded-xl border-slate-200 bg-slate-100 pl-10 text-sm text-slate-500 shadow-none dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400" />
                </Field>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field id="full_name" label="Full name" icon={User} error={errors.full_name}>
                    <Input id="full_name" value={form.full_name} onChange={(e) => handleFormChange("full_name", e.target.value)} placeholder="Enter your full name" autoComplete="name" maxLength={80} aria-invalid={Boolean(errors.full_name)} className={INPUT_CLASS} />
                  </Field>
                  <Field id="mobile" label="Mobile" icon={Phone} error={errors.mobile}>
                    <Input id="mobile" type="tel" inputMode="numeric" autoComplete="tel-national" value={form.mobile} onChange={(e) => handleFormChange("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile number" aria-invalid={Boolean(errors.mobile)} className={INPUT_CLASS} />
                  </Field>
                </div>

                <div className="flex flex-col-reverse gap-2 border-t border-[#eeecf5] pt-5 dark:border-slate-800 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={handleReset} disabled={!isDirty || saving} className={`h-10 gap-2 px-4 text-sm font-semibold ${OUTLINE_BUTTON_CLASS}`}>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" /> Discard
                  </Button>
                  <Button type="submit" disabled={!isDirty || saving} className={`h-10 gap-2 px-5 text-sm font-semibold ${OUTLINE_BUTTON_CLASS} disabled:opacity-50`}>
                    {saving ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Saving...</> : <><Save className="h-4 w-4" aria-hidden="true" /> Save changes</>}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* SECURITY */}
          <Card className="overflow-hidden rounded-[20px] border border-white/80 bg-white/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)] dark:border-slate-800 dark:bg-slate-900/85">
            <SectionHeader icon={KeyRound} title="Change password" description="Use a strong password you do not use anywhere else." />
            <CardContent className="p-5 sm:p-6">
              <form onSubmit={handlePasswordChange} className="space-y-5" noValidate>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field id="new_password" label="New password" icon={KeyRound}>
                    <PasswordInput id="new_password" value={passwords.next} onChange={(e) => setPasswords((current) => ({ ...current, next: e.target.value }))} show={showPassword} onToggle={() => setShowPassword((value) => !value)} placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} autoComplete="new-password" />
                  </Field>
                  <Field id="confirm_password" label="Confirm password" icon={KeyRound} error={passwordMismatch ? "Passwords do not match." : ""}>
                    <PasswordInput id="confirm_password" value={passwords.confirm} onChange={(e) => setPasswords((current) => ({ ...current, confirm: e.target.value }))} show={showPassword} onToggle={() => setShowPassword((value) => !value)} placeholder="Re-enter new password" autoComplete="new-password" />
                  </Field>
                </div>

                {passwords.next && (
                  <div aria-live="polite">
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4].map((step) => (
                        <div key={step} className={`h-1.5 flex-1 rounded-full transition-colors ${step <= strength ? strengthMeta.bar : "bg-slate-200"}`} />
                      ))}
                    </div>
                    <p className={`mt-1.5 text-xs font-semibold ${strengthMeta.text}`}>
                      {strengthMeta.label} password <span className="ml-1 font-normal text-slate-500">· Mix upper and lower case letters, numbers and symbols.</span>
                    </p>
                  </div>
                )}

                <div className="flex justify-end border-t border-[#eeecf5] pt-5 dark:border-slate-800">
                  <Button type="submit" disabled={passwordSaving || !passwords.next || !passwords.confirm} className={`h-10 gap-2 px-5 text-sm font-semibold ${OUTLINE_BUTTON_CLASS} disabled:opacity-50`}>
                    {passwordSaving ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Updating...</> : <><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Update password</>}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* ACCOUNT & SESSIONS */}
          <Card className="overflow-hidden rounded-[20px] border border-white/80 bg-white/85 shadow-[0_5px_18px_rgba(80,65,130,0.07)] dark:border-slate-800 dark:bg-slate-900/85">
            <SectionHeader icon={MonitorSmartphone} title="Account & devices" description="Account details and where you are signed in." />
            <CardContent className="p-5 sm:p-6">
              <div className="px-0">
                <InfoRow label="Member since" value={formatDay(user.created_at)} />
                <InfoRow label="Last sign in" value={formatDateTime(user.last_sign_in_at)} />
                <InfoRow label="Account ID" value={`${String(user.id).slice(0, 8)}…`} action={
                  <button type="button" onClick={() => copyText(user.id, "Account ID copied")} aria-label="Copy account ID" title="Copy account ID" className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                } />
              </div>

              <div className="mt-5 flex flex-col gap-2 border-t border-[#eeecf5] pt-5 dark:border-slate-800 sm:flex-row sm:flex-wrap">
                <Button type="button" variant="outline" onClick={handleSignOutOthers} disabled={signingOutOthers} className={`h-10 gap-2 px-4 text-sm font-semibold ${OUTLINE_BUTTON_CLASS}`}>
                  {signingOutOthers ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MonitorSmartphone className="h-4 w-4" aria-hidden="true" />} Sign out other devices
                </Button>

                {confirmSignOut ? (
                  <div className="flex items-center gap-2 sm:ml-auto">
                    <Button type="button" variant="outline" onClick={() => setConfirmSignOut(false)} disabled={signingOut} className={`h-10 px-4 text-sm font-semibold ${OUTLINE_BUTTON_CLASS}`}>Cancel</Button>
                    <Button type="button" onClick={handleSignOut} disabled={signingOut} className="h-10 gap-2 rounded-xl border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-700 shadow-sm hover:bg-rose-50">
                      {signingOut ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />} Yes, sign out
                    </Button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" onClick={() => setConfirmSignOut(true)} className="h-10 gap-2 rounded-xl border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-700 shadow-sm hover:bg-rose-50 sm:ml-auto">
                    <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}