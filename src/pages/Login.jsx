import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff, LogIn } from "lucide-react"
import { toast } from "sonner"

// Logo file: public/logo/hh.png
const LOGO_SRC = "../../public/Logo/hh.png"

// Dashboard jaisa style: white, rounded-xl, halka lavender border + soft shadow
const softBtn =
  "rounded-xl border border-violet-200 bg-white text-slate-800 shadow-sm transition-colors hover:bg-violet-50 hover:border-violet-300"

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
            Sign in to Digital Khata
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Billing &amp; Ledger for your shop
          </p>
        </div>

        {/* Form card */}
        <div className="rounded-2xl border border-violet-100 bg-white p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm text-slate-700">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="h-11 rounded-xl border-violet-200 shadow-none focus-visible:border-violet-400 focus-visible:ring-2 focus-visible:ring-violet-200"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm text-slate-700">
                  Password
                </Label>
                <button
                  type="button"
                  className="text-xs text-slate-500 hover:text-slate-900"
                  onClick={() =>
                    toast.info("Password reset is not configured yet.")
                  }
                >
                  Forgot password?
                </button>
              </div>

              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="h-11 rounded-xl border-violet-200 pr-11 shadow-none focus-visible:border-violet-400 focus-visible:ring-2 focus-visible:ring-violet-200"
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
            </div>

            <Button
              type="submit"
              disabled={loading}
              variant="outline"
              className={`${softBtn} h-11 w-full gap-2 text-sm font-medium`}
            >
              <LogIn className="h-4 w-4" />
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-slate-600">
          Don&apos;t have an account?{" "}
          <Link
            to="/register"
            className="font-medium text-slate-900 underline-offset-4 hover:underline"
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}