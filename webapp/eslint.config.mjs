import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: [
      // Legacy upload paths are retained as an incremental type-migration boundary.
      // New RAW routes/components remain under the strict default TypeScript rules.
      "app/api/upload/route.ts",
      "app/upload/page.tsx",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: [
      // RAW Expansion import/query helpers (CommonJS).
      "lib/ads-raw-import.js",
      "lib/balance-raw-import.js",
      "lib/exception-raw-import.js",
      "lib/raw-expansion-classifier.js",
      "lib/raw-expansion-db.js",
      "lib/raw-expansion-query.js",
      "lib/upload-preview-ticket.js",
      "scripts/migrate-raw-expansion.js",
      // Legacy CommonJS modules/scripts that legitimately use require().
      "lib/dashboard-auth.js",
      "lib/income-raw-db.js",
      "lib/income-raw-import.js",
      "lib/sku-raw-import.js",
      "scripts/migrate-income-raw.js",
      "scripts/migrate-multi-store.js",
      "scripts/migrate-order-all-snapshot-metadata.js",
      "scripts/migrate-sku-raw.js",
      "scripts/repair-order-all-currency.js",
      "scripts/setup-db.js",
      "test-db.js",
    ],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
