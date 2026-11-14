// Lets plain Node run the project's TypeScript for the Rovi evaluation: resolves "@/..." imports, transpiles .ts/.tsx
// with the project's TypeScript, loads .json as modules, and stubs the two browser-only UI modules the code touches.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url)).split("\\").join("/");
const require = createRequire(ROOT + "package.json");
const ts = require("typescript");

const STUBS = {
  "@/components/motion/PageTransition": "export const directionType = () => undefined;",
  sonner: "export const toast = Object.assign(() => {}, { error() {} });",
};
const EXTS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
const find = (base) => EXTS.map((e) => base + e).find((p) => existsSync(p) && !p.endsWith("/"));

export async function resolve(spec, ctx, next) {
  if (spec in STUBS) return { url: "stub:" + spec, shortCircuit: true };
  if (spec.startsWith("@/")) {
    const p = find(ROOT + spec.slice(2));
    if (p) return { url: pathToFileURL(p).href, shortCircuit: true };
  }
  if ((spec.startsWith("./") || spec.startsWith("../")) && ctx.parentURL?.startsWith("file:")) {
    const p = find(fileURLToPath(new URL(spec, ctx.parentURL)));
    if (p) return { url: pathToFileURL(p).href, shortCircuit: true };
  }
  const parentURL = ctx.parentURL?.startsWith("file:") ? ctx.parentURL : pathToFileURL(ROOT + "package.json").href;
  return next(spec, { ...ctx, parentURL });
}

export async function load(url, ctx, next) {
  if (url.startsWith("stub:")) return { format: "module", source: STUBS[url.slice(5)], shortCircuit: true };
  if (url.endsWith(".json")) {
    return { format: "module", source: "export default " + readFileSync(fileURLToPath(url), "utf8"), shortCircuit: true };
  }
  if (url.endsWith(".ts") || url.endsWith(".tsx")) {
    const out = ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      fileName: url,
    });
    return { format: "module", source: out.outputText, shortCircuit: true };
  }
  return next(url, ctx);
}
