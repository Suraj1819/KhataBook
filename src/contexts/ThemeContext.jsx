import { createContext, useContext, useEffect, useState } from "react"

const ThemeContext = createContext(undefined)

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    // 1. Check karein agar user ne pehle koi theme save ki hai
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("app-theme")
      if (savedTheme) {
        return savedTheme
      }
      // 2. Agar save nahi hai, toh system ki setting check karein
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        return "dark"
      }
    }
    // 3. Default theme
    return "light"
  })

  useEffect(() => {
    const root = window.document.documentElement

    // Theme change karte waqt thodi si smooth transition lagayein
    root.style.setProperty("transition", "background-color 0.3s ease, color 0.3s ease")

    if (theme === "dark") {
      root.classList.add("dark")
    } else {
      root.classList.remove("dark")
    }

    // Local storage mein save karein
    localStorage.setItem("app-theme", theme)
  }, [theme])

  // Toggle function
  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === "dark" ? "light" : "dark"))
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

// Custom hook banayein taaki easily use kar sakein
export function useTheme() {
  const context = useContext(ThemeContext)
  
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  
  return context
}