import { heroui } from "@heroui/react";

// the site's palette (lordaeron-front/styles/globals.css): WoW gold on a near-black blue
export default heroui({
  defaultTheme: "dark",
  themes: {
    dark: {
      colors: {
        background: "#050810",
        foreground: "#e8e6e1",
        primary: { DEFAULT: "#c79c3e", foreground: "#0a0e14" },
        secondary: { DEFAULT: "#4fc3f7", foreground: "#0a0e14" },
        focus: "#e0be6e",
      },
    },
  },
});
