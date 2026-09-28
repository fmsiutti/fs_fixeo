import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // injectManifest (en vez del generateSW por defecto) porque necesitamos
      // codigo propio en el service worker: push + notificationclick +
      // fallback offline (apps/web/CLAUDE.md). Fuente en src/sw.ts.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        // offline.html e icon-192.png quedan precacheados desde la
        // instalacion (los usa src/sw.ts para el fallback offline y el push).
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
      },
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Fixeo",
        short_name: "Fixeo",
        description: "Marketplace de oficios para el AMBA",
        lang: "es-AR",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#0f766e",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
