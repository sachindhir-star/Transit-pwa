import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png", "apple-touch-icon.png"],
      manifest: {
        name: "HK Transit — Discovery Bay",
        short_name: "HK Transit",
        description: "Phone-first Hong Kong transit planner for Discovery Bay & beyond",
        theme_color: "#c45c26",
        background_color: "#faf6f1",
        display: "standalone",
        orientation: "portrait",
        start_url: "./",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Bump cacheId whenever board/SW assets must invalidate phone precaches.
        cacheId: "hk-transit-board-v18",
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(data\.etabus\.gov\.hk|rt\.data\.gov\.hk|router\.project-osrm\.org|eta\.dbtsl\.com)\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "hk-transit-api",
              expiration: { maxEntries: 80, maxAgeSeconds: 60 },
            },
          },
          {
            urlPattern: /^https:\/\/(tile\.openstreetmap\.org|.*\.basemaps\.cartocdn\.com)\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "map-tiles",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/api/kmb": {
        target: "https://data.etabus.gov.hk",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/kmb/, "/v1/transport/kmb"),
      },
      "/api/ctb": {
        target: "https://rt.data.gov.hk",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/ctb/, "/v2/transport/citybus"),
      },
      "/api/osrm": {
        target: "https://router.project-osrm.org",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/osrm/, ""),
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 5178,
    allowedHosts: true,
    proxy: {
      "/api/kmb": {
        target: "https://data.etabus.gov.hk",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/kmb/, "/v1/transport/kmb"),
      },
      "/api/ctb": {
        target: "https://rt.data.gov.hk",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/ctb/, "/v2/transport/citybus"),
      },
      "/api/osrm": {
        target: "https://router.project-osrm.org",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/osrm/, ""),
      },
    },
  },
});
