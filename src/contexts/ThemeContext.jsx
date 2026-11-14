import { createContext, useContext, useEffect, useState } from "react"

const ThemeContext = createContext(undefined)

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("app-theme")

      if (savedTheme === "dark" || savedTheme === "light") {
        return savedTheme
      }
    }

    // Default theme: Light
    return "light"
  })

  useEffect(() => {
    const root = document.documentElement

    root.style.setProperty(
      "transition",
      "background-color 0.3s ease, color 0.3s ease"
    )

    root.classList.toggle("dark", theme === "dark")

    localStorage.setItem("app-theme", theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme((prevTheme) =>
      prevTheme === "dark" ? "light" : "dark"
    )
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)

  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }

  return context
}