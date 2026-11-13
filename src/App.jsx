
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "@/contexts/ThemeContext"
import { AuthProvider, useAuth } from "@/contexts/AuthContext"
import { ShopProvider } from "@/contexts/ShopContext"
import { AppLayout } from "@/components/layout/AppLayout"
import { AppToaster } from "@/components/ui/toaster"

import Login from "@/pages/Login"
import Register from "@/pages/Register"
import Dashboard from "@/pages/Dashboard"
import Customers from "@/pages/Customers"
import CreateBill from "@/pages/CreateBill"
import Bills from "@/pages/Bills"
import BillDetail from "@/pages/BillDetail"
import Khata from "@/pages/Khata"
import Dues from "@/pages/Dues"
import Payments from "@/pages/Payments"
import Settings from "@/pages/Settings"
import Profile from "@/pages/Profile"
import CustomerDetails from "@/pages/CustomerDetails"
import KhataDetail from "@/pages/KhataDetail"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
})

function PublicRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) return null
  if (user) return <Navigate to="/" replace />

  return children
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <ShopProvider>
            <BrowserRouter>
              <Routes>
                <Route
                  path="/login"
                  element={
                    <PublicRoute>
                      <Login />
                    </PublicRoute>
                  }
                />

                <Route
                  path="/register"
                  element={
                    <PublicRoute>
                      <Register />
                    </PublicRoute>
                  }
                />

                <Route element={<AppLayout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/customers" element={<Customers />} />
                  <Route path="/bills" element={<Bills />} />
                  <Route path="/bills/new" element={<CreateBill />} />
                  <Route path="/bills/:id" element={<BillDetail />} />
                  <Route path="/khata" element={<Khata />} />
                  <Route path="/khata/:customerKey" element={<KhataDetail />} />
                  <Route path="/dues" element={<Dues />} />
                  <Route path="/customers/:customerId" element={<CustomerDetails />} />
                  <Route path="/payments" element={<Payments />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/profile" element={<Profile />} />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>

            {/* One global toaster for the entire application */}
            <AppToaster />
          </ShopProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
