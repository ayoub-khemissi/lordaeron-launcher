import { heroui } from "@heroui/react";

// The site's palette (lordaeron-front/styles/globals.css): WoW gold on a near-black blue. HeroUI's components use the
// whole scale of a colour (flat buttons take primary-600, focus rings primary-300...), so every shade is gold here.
// A dark theme's scale runs from the darkest (50) to the lightest (900), as HeroUI's own dark colours do.
const gold = {
  50: "#1c1406",
  100: "#33250b",
  200: "#4f3912",
  300: "#6b4f1b",
  400: "#8a6b2a",
  500: "#c79c3e",
  600: "#d3ab52",
  700: "#e0be6e",
  800: "#ecd59a",
  900: "#f5e9c8",
  DEFAULT: "#c79c3e",
  foreground: "#140e04",
};

const ice = {
  50: "#03141d",
  100: "#062636",
  200: "#0b3d56",
  300: "#125a7d",
  400: "#1f86b5",
  500: "#4fc3f7",
  600: "#7dd3fc",
  700: "#aee3fb",
  800: "#d4f0fd",
  900: "#ecf8fe",
  DEFAULT: "#4fc3f7",
  foreground: "#04121b",
};

export default heroui({
  defaultTheme: "dark",
  themes: {
    dark: {
      colors: {
        background: "#050810",
        foreground: "#e8e6e1",
        primary: gold,
        secondary: ice,
        focus: "#e0be6e",
      },
    },
  },
});
