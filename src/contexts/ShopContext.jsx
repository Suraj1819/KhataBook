import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "./AuthContext"

const ShopContext = createContext(null)
const STORAGE_KEY = "currentShopId"

function readSavedShopId() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function saveShopId(id) {
  try {
    if (id) {
      localStorage.setItem(STORAGE_KEY, String(id))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch (error) {
    console.error("Could not save selected shop:", error)
  }
}

export function ShopProvider({ children }) {
  const { user } = useAuth()

  const [shops, setShops] = useState([])
  const [currentShop, setCurrentShopState] = useState(null)
  const [loading, setLoading] = useState(true)

  // Prevent an older request from overwriting a newer user's shop list.
  const requestId = useRef(0)

  const fetchShops = useCallback(async () => {
    const currentRequest = ++requestId.current

    if (!user?.id) {
      setShops([])
      setCurrentShopState(null)
      saveShopId(null)
      setLoading(false)
      return []
    }

    setLoading(true)

    try {
      const { data, error } = await supabase
        .from("shops")
        .select("*")
        .eq("owner_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: true })

      if (error) throw error

      // Ignore stale responses.
      if (currentRequest !== requestId.current) return []

      const shopList = data || []
      setShops(shopList)

      const savedId = readSavedShopId()
      const savedShop = shopList.find(
        (shop) => String(shop.id) === String(savedId)
      )

      const nextShop = savedShop || shopList[0] || null

      setCurrentShopState(nextShop)
      saveShopId(nextShop?.id)

      return shopList
    } catch (error) {
      if (currentRequest === requestId.current) {
        console.error("Fetch shops error:", error)
      }
      return []
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false)
      }
    }
  }, [user?.id])

  useEffect(() => {
    fetchShops()

    return () => {
      requestId.current += 1
    }
  }, [fetchShops])

  // Select a shop from the currently loaded, owner-scoped shop list.
  const selectShop = useCallback(
    (shopOrId) => {
      if (!shopOrId) {
        setCurrentShopState(null)
        saveShopId(null)
        return null
      }

      const requestedId =
        typeof shopOrId === "object" ? shopOrId.id : shopOrId

      const selectedShop = shops.find(
        (shop) => String(shop.id) === String(requestedId)
      )

      if (!selectedShop) {
        console.warn("Shop selection ignored: shop is not in the user's active shop list.", requestedId)
        return null
      }

      setCurrentShopState(selectedShop)
      saveShopId(selectedShop.id)

      return selectedShop
    },
    [shops]
  )

  // Compatibility alias for components that still call setCurrentShop(shop).
  const setCurrentShop = selectShop

  const createShop = useCallback(
    async (shopData) => {
      if (!user?.id) {
        throw new Error("You must be signed in to create a shop.")
      }

      const { data, error } = await supabase
        .from("shops")
        .insert({
          ...shopData,
          owner_id: user.id,
          is_active: true,
        })
        .select("*")
        .single()

      if (error) throw error

      setShops((previous) => [...previous, data])

      // Automatically select the newly created shop only if no shop is active.
      if (!currentShop) {
        setCurrentShopState(data)
        saveShopId(data.id)
      }

      return data
    },
    [user?.id, currentShop]
  )

  const updateShop = useCallback(
    async (id, updates) => {
      if (!user?.id) {
        throw new Error("You must be signed in to update a shop.")
      }

      const { data, error } = await supabase
        .from("shops")
        .update(updates)
        .eq("id", id)
        .eq("owner_id", user.id)
        .select("*")
        .single()

      if (error) throw error

      setShops((previous) =>
        previous.map((shop) => (shop.id === id ? data : shop))
      )

      setCurrentShopState((previous) =>
        previous?.id === id ? data : previous
      )

      return data
    },
    [user?.id]
  )

  const deleteShop = useCallback(
    async (id) => {
      if (!user?.id) {
        throw new Error("You must be signed in to delete a shop.")
      }

      const { error } = await supabase
        .from("shops")
        .update({ is_active: false })
        .eq("id", id)
        .eq("owner_id", user.id)

      if (error) throw error

      const remainingShops = shops.filter(
        (shop) => String(shop.id) !== String(id)
      )

      setShops(remainingShops)

      if (String(currentShop?.id) === String(id)) {
        const nextShop = remainingShops[0] || null
        setCurrentShopState(nextShop)
        saveShopId(nextShop?.id)
      }

      return true
    },
    [user?.id, shops, currentShop]
  )

  return (
    <ShopContext.Provider
      value={{
        shops,
        currentShop,
        loading,
        selectShop,
        setCurrentShop,
        createShop,
        updateShop,
        deleteShop,
        fetchShops,
      }}
    >
      {children}
    </ShopContext.Provider>
  )
}

export function useShop() {
  const context = useContext(ShopContext)

  if (context === null) {
    throw new Error("useShop must be used within ShopProvider")
  }

  return context
}
