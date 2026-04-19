import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import electron from "vite-plugin-electron/simple"

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === "web"
      ? []
      : [
          electron({
            main: {
              entry: "electron/main.ts",
              vite: {
                build: {
                  rollupOptions: {
                    external: [/^node:sqlite$/, /^playwright($|\/)/, /^playwright-core($|\/)/, /^chromium-bidi($|\/)/],
                  },
                },
              },
            },
            preload: {
              input: "electron/preload.ts",
            },
          }),
        ]),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}))
