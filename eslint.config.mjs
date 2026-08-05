import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "build/**",
    "lib/generated/**",
    "out/**",
    "output/**",
    "prisma/postgres-migrations/**",
    "reports/**",
    "tmp/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
