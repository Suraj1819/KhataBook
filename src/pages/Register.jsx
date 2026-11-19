import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff, UserPlus } from "lucide-react"
import { toast } from "sonner"

// Logo file: public/logo/hh.png
const LOGO_SRC = "/public/Logo/hh.png"

// Dashboard jaisa style: white, rounded-xl, halka lavender border + soft shadow
const softBtn =
  "rounded-xl border border-violet-200 bg-white text-slate-800 shadow-sm transition-colors hover:bg-violet-50 hover:border-violet-300"

const inputClass =
  "h-11 rounded-xl border-violet-200 shadow-none focus-visible:border-violet-400 focus-visible:ring-2 focus-visible:ring-violet-200"

/* Simple password strength helper */
function getPasswordStrength(password) {
  if (!password) return { score: 0, label: "", color: "" }

  let score = 0
  if (password.length >= 6) score++
  if (password.length >= 10) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  if (score <= 2) return { score, label: "Weak", color: "bg-red-500" }
  if (score <= 3) return { score, label: "Fair", color: "bg-amber-500" }
  if (score <= 4) return { score, label: "Good", color: "bg-violet-400" }
  return { score, label: "Strong", color: "bg-violet-600" }
}

export default function Register() {
  const [form, setForm] = useState({
    fullName: "",
    mobile: "",
    email: "",
    password: "",
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const strength = useMemo(
    () => getPasswordStrength(form.password),
    [form.password]
  )

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!form.fullName || !form.email || !form.password) {
      toast.error("Please fill required fields")
      return
    }

    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters")
      return
    }

    setLoading(true)

    try {
      await signUp(form)
      toast.success("Account created! Please sign in.")
      navigate("/login")
    } catch (err) {
      toast.error(err.message || "Registration failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-violet-50/60 px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center text-center">
          <img
            src={LOGO_SRC}
            alt="Digital Khata"
            className="h-14 w-14 object-contain"
            draggable={false}
          />
          <h1 className="mt-4 text-xl font-semibold text-slate-900">
            Create your account
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Start managing your shop with Digital Khata
          </p>
        </div>

        {/* Form card */}
        <div className="rounded-2xl border border-violet-100 bg-white p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full name */}
            <div className="space-y-1.5">
              <Label htmlFor="fullName" className="text-sm text-slate-700">
                Full name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="fullName"
                value={form.fullName}
                onChange={(e) => update("fullName", e.target.value)}
                autoComplete="name"
                className={inputClass}
              />
            </div>

            {/* Mobile */}
            <div className="space-y-1.5">
              <Label htmlFor="mobile" className="text-sm text-slate-700">
                Mobile number
              </Label>
              <Input
                id="mobile"
                type="tel"
                inputMode="numeric"
                value={form.mobile}
                onChange={(e) =>
                  update(
                    "mobile",
                    e.target.value.replace(/[^\d]/g, "").slice(0, 10)
                  )
                }
                placeholder="10-digit mobile number"
                autoComplete="tel"
                className={inputClass}
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm text-slate-700">
                Email <span className="text-red-500">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                autoComplete="email"
                className={inputClass}
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm text-slate-700">
                Password <span className="text-red-500">*</span>
              </Label>

              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  placeholder="Min 6 characters"
                  autoComplete="new-password"
                  className={`${inputClass} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* Password strength */}
              {form.password && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          i <= strength.score ? strength.color : "bg-slate-200"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">
                    Password strength:{" "}
                    <span className="font-medium text-slate-700">
                      {strength.label}
                    </span>
                  </p>
                </div>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading}
              variant="outline"
              className={`${softBtn} h-11 w-full gap-2 text-sm font-medium`}
            >
              <UserPlus className="h-4 w-4" />
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-slate-900 underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}