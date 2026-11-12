import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Store,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Zap,
} from "lucide-react"
import { toast } from "sonner"

export default function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()

    if (!email || !password) {
      toast.error("Please fill all fields")
      return
    }

    setLoading(true)

    try {
      await signIn({ email, password })
      toast.success("Welcome back!")
      navigate("/")
    } catch (err) {
      toast.error(err.message || "Login failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-2">
      {/* ============ LEFT: Branding Panel ============ */}
      <div className="relative hidden overflow-hidden bg-emerald-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
        {/* Decorative gradient blobs */}
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
            Run your shop smarter with a{" "}
            <span className="text-emerald-400">digital khata</span>.
          </h1>

          <p className="mt-4 text-sm leading-6 text-emerald-100/70">
            Manage customers, create GST bills, track payments and stay on top
            of every rupee — all from one clean dashboard.
          </p>

          <div className="mt-8 space-y-4">
            {[
              {
                icon: Zap,
                title: "Fast billing",
                text: "Create professional bills in seconds.",
              },
              {
                icon: ShieldCheck,
                title: "Secure ledger",
                text: "Your customer data stays safe and organized.",
              },
              {
                icon: CheckCircle2,
                title: "Track every payment",
                text: "Never lose sight of dues and advances.",
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

      {/* ============ RIGHT: Login Form ============ */}
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
              Welcome back
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Sign in to manage your shops, customers and bills.
            </p>
          </div>

          {/* Form card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="email"
                  className="text-sm font-medium text-slate-700"
                >
                  Email address
                </Label>

                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="h-11 rounded-xl border-slate-200 bg-slate-50/50 pl-10 text-sm shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/20"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="password"
                    className="text-sm font-medium text-slate-700"
                  >
                    Password
                  </Label>

                  <button
                    type="button"
                    className="text-xs font-medium text-emerald-700 hover:underline"
                    onClick={() =>
                      toast.info("Password reset is not configured yet.")
                    }
                  >
                    Forgot password?
                  </button>
                </div>

                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
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
                    Signing in...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Sign in
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

            {/* Register link */}
            <p className="text-center text-sm text-slate-600">
              Don&apos;t have an account?{" "}
              <Link
                to="/register"
                className="font-semibold text-emerald-700 hover:underline"
              >
                Create one
              </Link>
            </p>
          </div>

          {/* Bottom trust line */}
          <p className="mt-6 text-center text-xs text-slate-400">
            By signing in, you agree to our{" "}
            <span className="font-medium text-slate-500">Terms</span> and{" "}
            <span className="font-medium text-slate-500">Privacy Policy</span>.
          </p>
        </div>
      </div>
    </div>
  )
}