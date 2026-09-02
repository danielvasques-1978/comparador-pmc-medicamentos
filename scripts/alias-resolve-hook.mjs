// Module customization hook (see node-test-loader.mjs for why this exists).
// Rewrites "@/x" to the repository's "src/x" and lets Node's default
// resolver take it from there (it still needs the real file extension,
// same as any other Node ESM specifier).
import fs from "node:fs";
import path from "node:path";
import { URL, fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = pathToFileURL(path.resolve(import.meta.dirname, "..") + "/");
const CANDIDATE_EXTENSIONS = [".ts", ".tsx", ".json", ".js", ".mjs"];

function withResolvableExtension(fileUrl) {
  const filePath = fileURLToPath(fileUrl);
  if (fs.existsSync(filePath)) return fileUrl;
  for (const ext of CANDIDATE_EXTENSIONS) {
    if (fs.existsSync(filePath + ext)) return fileUrl + ext;
  }
  return fileUrl;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const target = withResolvableExtension(new URL(`src/${specifier.slice(2)}`, repoRoot).href);
    return nextResolve(target, context);
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  // A "@/x.json" import has no "with { type: 'json' }" attribute in the
  // source (TypeScript's resolveJsonModule doesn't require one), but
  // Node's own loader demands it for a JSON file. Load it ourselves so the
  // attribute check never runs.
  if (url.endsWith(".json")) {
    const source = fs.readFileSync(fileURLToPath(url), "utf8");
    return { format: "json", source, shortCircuit: true };
  }
  return nextLoad(url, context);
}
