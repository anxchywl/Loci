import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--lm-bg)",
        surface: "var(--lm-surface)",
        text: "var(--lm-text)",
        muted: "var(--lm-muted)",
        accent: "var(--lm-accent)",
        "accent-text": "var(--lm-accent-text)",
        border: "var(--lm-border)",
      },
      borderRadius: {
        DEFAULT: "8px",
        sheet: "12px",
      },
      transitionTimingFunction: {
        lm: "cubic-bezier(0.2, 0, 0, 1)",
      },
      keyframes: {
        "sheet-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "story-state": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "dialog-in": {
          from: { opacity: "0", transform: "translateY(8px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        "sheet-up": "sheet-up 240ms cubic-bezier(0.2, 0, 0, 1)",
        "fade-in": "fade-in 150ms cubic-bezier(0.2, 0, 0, 1)",
        "story-state": "story-state 240ms cubic-bezier(0.2, 0, 0, 1)",
        "dialog-in": "dialog-in 200ms cubic-bezier(0.2, 0, 0, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
