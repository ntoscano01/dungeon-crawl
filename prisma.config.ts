import "dotenv/config";
import { defineConfig } from "@prisma/config";

// `prisma generate` (run at install/build time — see package.json
// postinstall) only reads the schema to emit types; it never connects to a
// database. Using @prisma/config's `env()` helper here would throw if
// DATABASE_URL isn't set, breaking builds in environments that don't
// configure it until runtime. Fall back to a placeholder so `generate`
// always succeeds; real commands (`migrate`, `studio`) still use the real
// DATABASE_URL when it's set, or fail with an ordinary connection error
// (not a config crash) when it isn't.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
