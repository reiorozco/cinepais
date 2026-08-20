import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * `environment` stays `node`: the eleven business-rule / API / SSE suites need no
 * DOM and are measurably faster without one. The single component suite opts in
 * per-file with a `@vitest-environment jsdom` docblock, so jsdom is paid for only
 * where it is actually used.
 *
 * The React plugin pins the JSX transform to React's automatic runtime explicitly.
 * Vitest's bare esbuild transform happens to work today only because
 * `tsconfig.json` says `jsx: "react-jsx"` — but that field belongs to the Next.js
 * build, and a future change there would silently break `.tsx` tests. The plugin
 * makes the test-side transform independent of it.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    testTimeout: 120000,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
