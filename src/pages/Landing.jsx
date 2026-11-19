import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import {
  FileText,
  Users,
  Wallet,
  Clock,
  Calculator,
  Download,
  ArrowRight,
  CalendarDays,
  RefreshCw,
  Plus,
} from "lucide-react"

// Logo file: public/logo/hh.png
const LOGO_SRC = "/logo/hh.png"

// Dashboard jaisa style: white, rounded-xl, lavender border, soft shadow
const softBtn =
  "rounded-xl border border-violet-200 bg-white text-slate-800 shadow-sm transition-colors hover:bg-violet-50 hover:border-violet-300"

const FEATURES = [
  {
    icon: FileText,
    title: "Bills in seconds",
    text: "Create GST bills for your customers and find any past bill from the All bills list.",
  },
  {
    icon: Users,
    title: "Customer ledger",
    text: "Every customer has their own khata, so you always know who owes what.",
  },
  {
    icon: Wallet,
    title: "Payments and advances",
    text: "Record what you receive and the balance updates on its own.",
  },
  {
    icon: Clock,
    title: "Overdue at a glance",
    text: "See outstanding and overdue amounts for any day, right on the dashboard.",
  },
  {
    icon: Download,
    title: "Dashboard PDF",
    text: "Download your dashboard as a PDF to keep or share.",
  },
  {
    icon: Calculator,
    title: "Built-in calculator",
    text: "Quick calculations without leaving the page.",
  },
]

const STEPS = [
  {
    title: "Create your account",
    text: "Sign up with your name, email and password.",
  },
  {
    title: "Add customers and bills",
    text: "Enter your customers and start creating bills.",
  },
  {
    title: "Track what is due",
    text: "Record payments and watch outstanding amounts go down.",
  },
]

const SAMPLE_BILLS = [
  { name: "Ramesh Kumar", no: "#1042", amt: "₹ 4,250", status: "Due" },
  { name: "Sunita Devi", no: "#1041", amt: "₹ 1,800", status: "Paid" },
  { name: "Anil Traders", no: "#1040", amt: "₹ 12,600", status: "Overdue" },
  { name: "Mohan Store", no: "#1039", amt: "₹ 3,150", status: "Paid" },
]

const STATUS_STYLE = {
  Paid: "bg-slate-100 text-slate-600",
  Due: "bg-violet-100 text-violet-700",
  Overdue: "bg-red-50 text-red-600",
}

function Logo({ small = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src={LOGO_SRC}
        alt=""
        className={`${small ? "h-7 w-7" : "h-9 w-9"} object-contain`}
        draggable={false}
      />
      <span className="text-base font-semibold text-slate-900">
        Digital Khata
      </span>
    </div>
  )
}

function DashboardPreview() {
  return (
    <div
      className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4 shadow-sm sm:p-6"
      role="img"
      aria-label="Sample view of the Digital Khata dashboard"
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${softBtn} inline-flex items-center gap-2 px-3 py-2 text-xs font-medium sm:text-sm`}>
          <CalendarDays className="h-4 w-4 text-slate-500" />
          Today
        </span>
        <span className={`${softBtn} inline-flex items-center gap-2 px-3 py-2 text-xs font-medium sm:text-sm`}>
          <RefreshCw className="h-4 w-4 text-slate-500" />
          Refresh
        </span>
        <span className={`${softBtn} inline-flex items-center gap-2 px-3 py-2 text-xs font-medium sm:text-sm`}>
          <Plus className="h-4 w-4 text-slate-500" />
          Create bill
        </span>
      </div>

      {/* Stats */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Outstanding dues", value: "₹ 48,250" },
          { label: "Overdue", value: "₹ 12,600" },
          { label: "Received today", value: "₹ 9,400" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-violet-100 bg-white p-4">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Bills */}
      <div className="mt-3 overflow-hidden rounded-xl border border-violet-100 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-medium text-slate-900">Recent bills</p>
          <p className="text-xs text-slate-400">Sample data</p>
        </div>
        {SAMPLE_BILLS.map((b) => (
          <div
            key={b.no}
            className="flex items-center justify-between gap-3 border-b border-slate-50 px-4 py-3 last:border-0"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-slate-900">{b.name}</p>
              <p className="text-xs text-slate-400">{b.no}</p>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-sm tabular-nums text-slate-800">{b.amt}</p>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[b.status]}`}>
                {b.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* ============ Header ============ */}
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/welcome" aria-label="Digital Khata home">
            <Logo />
          </Link>

          <nav className="hidden items-center gap-8 text-sm text-slate-600 md:flex">
            <a href="#features" className="hover:text-slate-900">Features</a>
            <a href="#how-it-works" className="hover:text-slate-900">How it works</a>
          </nav>

          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className={`${softBtn} h-10 px-4 text-sm font-medium`}>
              <Link to="/login">Sign in</Link>
            </Button>
            <Button
              asChild
              className="hidden h-10 rounded-xl bg-violet-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-violet-700 sm:inline-flex"
            >
              <Link to="/register">Create account</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* ============ Hero ============ */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl">
              Keep every bill and every rupee in order.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
              Digital Khata is a billing and ledger app for shop owners. Create
              bills, track customer dues and record payments from one dashboard.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                asChild
                className="h-11 gap-2 rounded-xl bg-violet-600 px-5 text-sm font-medium text-white shadow-sm hover:bg-violet-700"
              >
                <Link to="/register">
                  Create account
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className={`${softBtn} h-11 px-5 text-sm font-medium`}>
                <Link to="/login">Sign in</Link>
              </Button>
            </div>
          </div>

          <div className="mt-14">
            <DashboardPreview />
          </div>
        </section>

        {/* ============ Features ============ */}
        <section id="features" className="scroll-mt-20 border-t border-slate-100 bg-slate-50/60">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
              Everything a shop needs to manage its khata
            </h2>
            <p className="mt-3 max-w-xl text-slate-600">
              No registers, no loose slips. Your billing and your ledger live together.
            </p>

            <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="border-t border-slate-200 pt-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-200 bg-white shadow-sm">
                    <f.icon className="h-5 w-5 text-violet-600" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-slate-600">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ How it works ============ */}
        <section id="how-it-works" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
              Up and running in three steps
            </h2>

            <ol className="mt-12 grid gap-8 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-violet-200 bg-white text-sm font-medium text-violet-700 shadow-sm">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-base font-semibold">{s.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-slate-600">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ============ Final CTA ============ */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="rounded-2xl border border-violet-100 bg-violet-50/70 px-6 py-12 text-center sm:px-12">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Ready to move your khata online?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-slate-600">
              Create an account and add your first bill today.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Button
                asChild
                className="h-11 gap-2 rounded-xl bg-violet-600 px-5 text-sm font-medium text-white shadow-sm hover:bg-violet-700"
              >
                <Link to="/register">
                  Create account
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className={`${softBtn} h-11 px-5 text-sm font-medium`}>
                <Link to="/login">Sign in</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* ============ Footer ============ */}
      <footer className="border-t border-slate-100">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <Logo small />
          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} Digital Khata. All rights reserved.
          </p>
          <div className="flex gap-5 text-sm text-slate-500">
            <Link to="/login" className="hover:text-slate-900">Sign in</Link>
            <Link to="/register" className="hover:text-slate-900">Create account</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}