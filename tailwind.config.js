/*
 * ⚠️ CRITICAL THEME CONFIGURATION FILE ⚠️
 * DO NOT MODIFY THE backgroundColor SECTION!
 * This file contains essential theme colors for dark/light mode switching.
 * Modifying this file may break the theme system.
 */

import { heroui } from "@heroui/theme";

/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./modules/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        'xs': '475px',
      },
      colors: {
        primary: "#01A47F",
        secondary: "#7D7D7D",
        warning: "#FAE33A",
        danger: "#E35D12",

        light: {
          background: "#FCFCFC",
          foreground: "#ededed",
          text: "#171717",
        },
        dark: {
          background: "#171717",
          foreground: "#313131",
          text: "#FAFAFA",
        },
      },
      backgroundColor: {
        'light-background': '#FCFCFC',
        'dark-background': '#171717',
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
    },
  },
  darkMode: "class",
  plugins: [heroui()],
};

module.exports = config;
