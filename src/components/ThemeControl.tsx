import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";

export function ThemeControl() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("xmind-theme") || "system";
    } catch {
      return "system";
    }
  });
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    apply();
    media.addEventListener("change", apply);
    try {
      localStorage.setItem("xmind-theme", theme);
    } catch {
      /* Browsing remains available without storage. */
    }
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  return (
    <label className="theme-control" title="页面主题">
      <Icon size={16} />
      <select
        aria-label="页面主题"
        value={theme}
        onChange={(e) => setTheme(e.target.value)}
      >
        <option value="system">跟随系统</option>
        <option value="light">浅色</option>
        <option value="dark">深色</option>
      </select>
    </label>
  );
}
