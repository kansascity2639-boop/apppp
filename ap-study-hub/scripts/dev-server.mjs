// Local preview that mirrors the Vercel deployment: serves public/ with the same
// headers, clean URLs, and SPA rewrite defined in vercel.json. No dependencies.
//   npm start            -> http://localhost:3000
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const config = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
};
// vercel.json "source" patterns are path-to-regexp; the ones used here are plain regex groups.
const toRegex = (src) => new RegExp("^" + src + "$");

function headersFor(urlPath) {
  const out = {};
  for (const rule of config.headers || []) if (toRegex(rule.source).test(urlPath)) for (const h of rule.headers) out[h.key] = h.value;
  return out;
}

function resolveFile(urlPath) {
  const safe = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  let file = path.join(PUBLIC, safe);
  if (!file.startsWith(PUBLIC)) return null;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (fs.existsSync(file)) return file;
  if (config.cleanUrls && fs.existsSync(file + ".html")) return file + ".html";
  for (const r of config.rewrites || []) if (toRegex(r.source).test(urlPath)) return path.join(PUBLIC, r.destination);
  return null;
}

const server = http.createServer((req, res) => {
  const urlPath = new URL(req.url, "http://localhost").pathname;
  const file = resolveFile(urlPath);
  const headers = headersFor(urlPath);
  if (!file) { res.writeHead(404, { ...headers, "Content-Type": "text/plain" }); res.end("Not found"); return; }
  res.writeHead(200, { ...headers, "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, () => console.log(`AP Study Hub preview at http://localhost:${PORT}`));
