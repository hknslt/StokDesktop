import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark";
type ThemeCtx = { theme: Theme; toggle: () => void; set: (t: Theme) => void; };

const Ctx = createContext<ThemeCtx>({ theme: "dark", toggle: () => {}, set: () => {} });

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("capri-theme") as Theme | null;
    return saved ?? (prefersDark ? "dark" : "light");
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("capri-theme", theme);
  }, [theme]);

  const value = useMemo(
    () => ({ theme, toggle: () => setTheme(t => (t === "dark" ? "light" : "dark")), set: setTheme }),
    [theme]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
