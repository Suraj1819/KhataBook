import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Store,
  Mail,
  Lock,
  User,
  Phone,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"

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
  if (score <= 4) return { score, label: "Good", color: "bg-emerald-500" }
  return { score, label: "Strong", color: "bg-emerald-600" }
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
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-2">
      {/* ============ LEFT: Branding Panel ============ */}
      <div className="relative hidden overflow-hidden bg-emerald-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(16,185,129,0.15),_transparent_50%)]" />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500 shadow-lg shadow-emerald-500/30">
            <Store className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-base font-semibold text-white">
              Digital Khata
            </p>
            <p className="text-xs text-emerald-300/80">
              Billing &amp; Ledger
            </p>
          </div>
        </div>

        {/* Center content */}
        <div className="relative z-10 max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-white">
            Start your{" "}
            <span className="text-emerald-400">digital khata</span> in
            minutes.
          </h1>

          <p className="mt-4 text-sm leading-6 text-emerald-100/70">
            Create your free account and get a clean dashboard for customers,
            GST bills, payments and outstanding dues — built for shop owners.
          </p>

          <div className="mt-8 space-y-4">
            {[
              {
                icon: Sparkles,
                title: "Free to start",
                text: "No credit card required to create an account.",
              },
              {
                icon: ShieldCheck,
                title: "Private by default",
                text: "Your shop data stays in your own workspace.",
              },
              {
                icon: CheckCircle2,
                title: "Everything in one place",
                text: "Bills, customers, payments and reports.",
              },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 ring-1 ring-emerald-400/20">
                  <item.icon className="h-4 w-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-xs text-emerald-100/60">
                    {item.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center gap-2 text-xs text-emerald-200/50">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Trusted by shop owners across India
        </div>
      </div>

      {/* ============ RIGHT: Register Form ============ */}
      <div className="flex min-h-screen items-center justify-center px-4 py-10 lg:min-h-0 lg:px-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 shadow-lg shadow-emerald-600/20">
              <Store className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-900">
                Digital Khata
              </p>
              <p className="text-xs text-slate-500">Billing &amp; Ledger</p>
            </div>
          </div>

          {/* Heading */}
          <div className="mb-8 text-center lg:text-left">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              Create your account
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Start managing your shops digitally — it takes less than a
              minute.
            </p>
          </div>

          {/* Form card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Full name */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="fullName"
                  className="text-sm font-medium text-slate-700"
                >
                  Full name <span className="text-red-500">*</span>
                </Label>

                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                  <Input
                    id="fullName"
                    value={form.fullName}
                    onChange={(e) => update("fullName", e.target.value)}
                    placeholder="Your full name"
                    autoComplete="name"
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
                  Mobile number
                </Label>

                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

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
                    className="h-11 rounded-xl border-slate-200 bg-slate-50/50 pl-10 text-sm shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/20"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="email"
                  className="text-sm font-medium text-slate-700"
                >
                  Email address <span className="text-red-500">*</span>
                </Label>

                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="h-11 rounded-xl border-slate-200 bg-slate-50/50 pl-10 text-sm shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/20"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="password"
                  className="text-sm font-medium text-slate-700"
                >
                  Password <span className="text-red-500">*</span>
                </Label>

                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => update("password", e.target.value)}
                    placeholder="Min 6 characters"
                    autoComplete="new-password"
                    className="h-11 rounded-xl border-slate-200 bg-slate-50/50 pl-10 pr-10 text-sm shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/20"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
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
                            i <= strength.score
                              ? strength.color
                              : "bg-slate-200"
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

              {/* Submit */}
              <Button
                type="submit"
                disabled={loading}
                className="h-11 w-full rounded-xl bg-emerald-600 text-sm font-medium shadow-sm shadow-emerald-600/20 hover:bg-emerald-700"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Creating account...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Create account
                    <ArrowRight className="h-4 w-4" />
                  </span>
                )}
              </Button>
            </form>

            {/* Divider */}
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs text-slate-400">OR</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            {/* Login link */}
            <p className="text-center text-sm text-slate-600">
              Already have an account?{" "}
              <Link
                to="/login"
                className="font-semibold text-emerald-700 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>

          {/* Trust line */}
          <p className="mt-6 text-center text-xs text-slate-400">
            By creating an account, you agree to our{" "}
            <span className="font-medium text-slate-500">Terms</span> and{" "}
            <span className="font-medium text-slate-500">Privacy Policy</span>.
          </p>
        </div>
      </div>
    </div>
  )
}