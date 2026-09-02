// Resolves the "@/*" tsconfig path alias (-> "src/*") for Node's native test
// runner. Next.js resolves this alias itself via webpack/Turbopack, but
// `node --test` uses Node's own ESM resolver, which has no notion of
// tsconfig "paths". Without this hook, any module under test that imports
// something through "@/..." (a value import, not an erased "import type")
// fails with ERR_MODULE_NOT_FOUND for a package literally named "@".
//
// Usage: node --import ./scripts/node-test-loader.mjs --test
import { register } from "node:module";

register("./alias-resolve-hook.mjs", import.meta.url);
