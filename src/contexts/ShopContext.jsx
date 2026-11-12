import { createContext, useContext, useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "./AuthContext"

const ShopContext = createContext({})

export function ShopProvider({ children }) {
  const { user } = useAuth()
  const [shops, setShops] = useState([])
  const [currentShop, setCurrentShop] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchShops = useCallback(async () => {
    if (!user) {
      setShops([])
      setCurrentShop(null)
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from("shops")
        .select("*")
        .eq("owner_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
      if (error) throw error
      setShops(data || [])
      
      // Restore last selected shop from localStorage
      const savedId = localStorage.getItem("currentShopId")
      if (savedId && data?.find(s => s.id === savedId)) {
        setCurrentShop(data.find(s => s.id === savedId))
      } else if (data?.length > 0) {
        setCurrentShop(data[0])
        localStorage.setItem("currentShopId", data[0].id)
      } else {
        setCurrentShop(null)
      }
    } catch (err) {
      console.error("Fetch shops error:", err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchShops()
  }, [fetchShops])

  function selectShop(shop) {
    setCurrentShop(shop)
    if (shop) localStorage.setItem("currentShopId", shop.id)
    else localStorage.removeItem("currentShopId")
  }

  async function createShop(shopData) {
    const { data, error } = await supabase
      .from("shops")
      .insert({ ...shopData, owner_id: user.id })
      .select()
      .single()
    if (error) throw error
    setShops(prev => [...prev, data])
    if (!currentShop) {
      setCurrentShop(data)
      localStorage.setItem("currentShopId", data.id)
    }
    return data
  }

  async function updateShop(id, updates) {
    const { data, error } = await supabase
      .from("shops")
      .update(updates)
      .eq("id", id)
      .select()
      .single()
    if (error) throw error
    setShops(prev => prev.map(s => s.id === id ? data : s))
    if (currentShop?.id === id) setCurrentShop(data)
    return data
  }

  async function deleteShop(id) {
    const { error } = await supabase
      .from("shops")
      .update({ is_active: false })
      .eq("id", id)
    if (error) throw error
    setShops(prev => prev.filter(s => s.id !== id))
    if (currentShop?.id === id) {
      const remaining = shops.filter(s => s.id !== id)
      selectShop(remaining[0] || null)
    }
  }

  return (
    <ShopContext.Provider value={{
      shops, currentShop, loading,
      selectShop, createShop, updateShop, deleteShop, fetchShops
    }}>
      {children}
    </ShopContext.Provider>
  )
}

export const useShop = () => {
  const ctx = useContext(ShopContext)
  if (!ctx) throw new Error("useShop must be used within ShopProvider")
  return ctx
}
