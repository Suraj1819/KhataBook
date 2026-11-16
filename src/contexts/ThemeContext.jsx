import { createContext, useContext, useEffect, useState } from "react"

const ThemeContext = createContext(null)

const THEME_KEY = "khaatapro-session-theme"

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      // Same browser session mein refresh par selected theme restore hogi.
      return sessionStorage.getItem(THEME_KEY) || "light"
    } catch {
      return "light"
    }
  })

  useEffect(() => {
    const root = document.documentElement

    root.classList.toggle("dark", theme === "dark")
    root.style.colorScheme = theme

    try {
      sessionStorage.setItem(THEME_KEY, theme)
    } catch {
      // Theme still works for the current page.
    }
  }, [theme])

  const toggleTheme = () => {
    setTheme((current) => current === "dark" ? "light" : "dark")
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider")
  }

  return context
}