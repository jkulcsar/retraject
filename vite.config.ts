import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Three independent pages, one per explorer; Vite builds each html entry.
// base "./" makes all emitted asset references relative, so the same build
// works at the domain root (local preview) and under a subpath
// (GitHub Pages serves this repo at /retraject/).
export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        profiles: fileURLToPath(new URL("index.html", import.meta.url)),
        robot: fileURLToPath(new URL("robot.html", import.meta.url)),
        stepper: fileURLToPath(new URL("stepper.html", import.meta.url)),
      },
    },
  },
});
