import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Two independent pages, one per explorer; Vite builds each html entry.
export default defineConfig({
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
