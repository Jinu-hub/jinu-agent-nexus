import { defineConfig } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
// `agents/vite` registers the TC39 decorator transform required by
// `@callable()` and runs the agents-SDK pre-bundling step. Without it,
// methods decorated with `@callable()` won't be reachable over RPC and
// Vite's optimizer will trip on the SDK's worker-side imports.
import agents from "agents/vite";

export default defineConfig({
  plugins: [agents(), react(), tailwindcss(), cloudflare()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // The Cloudflare Vite plugin creates two module scopes — one for the
    // SPA, one for the worker. If React resolves separately in each
    // scope, components that span both can end up with two `useState`
    // references and you'll see the "Invalid hook call" error.
    // Forcing dedupe keeps React singular.
    dedupe: ["react", "react-dom"],
  },
  // Tunnel-friendly settings. If you run `cloudflared tunnel --url
  // http://localhost:5173` to expose your dev server, Vite would
  // otherwise reject the unknown Host header.
  server: {
    host: true,
    allowedHosts: true,
    cors: true,
  },
});
