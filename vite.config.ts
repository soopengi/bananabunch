import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// A plain static React site. GitHub Pages serves it from /<repo-name>/, so the
// deploy workflow sets BASE_PATH; locally it is served from /.
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  server: { port: 5173 },
  plugins: [react()],
});
