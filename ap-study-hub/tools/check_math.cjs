// Renders every $...$ / $$...$$ segment in public/js/data.js with KaTeX (strict) to catch typos.
// Usage: node tools/check_math.cjs [path/to/katex]
const path = require("path");
const fs = require("fs");
const katexDir = process.argv[2] || "/opt/npm-tools/node_modules/katex";
const katex = require(katexDir);
global.katex = katex; require(path.join(katexDir, "dist/contrib/mhchem.js"));

const src = fs.readFileSync(path.join(__dirname, "../public/js/data.js"), "utf8");
const window = {};
new Function("window", src)(window);
const { courses } = window.HUB_DATA;

let count = 0, bad = 0;
function check(text, where) {
  if (typeof text !== "string") return;
  const re = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
  let m;
  while ((m = re.exec(text))) {
    const tex = m[1] ?? m[2];
    count++;
    try {
      katex.renderToString(tex, { throwOnError: true, displayMode: !!m[1], strict: "ignore" });
    } catch (e) {
      bad++;
      console.log(`✗ ${where}: ${e.message}\n    ${tex}`);
    }
  }
  // An odd number of unescaped $ means a broken delimiter
  const dollars = (text.replace(/\$\$/g, "").match(/\$/g) || []).length;
  if (dollars % 2) { bad++; console.log(`✗ ${where}: unbalanced $ delimiters`); }
}
function walk(obj, where) {
  if (typeof obj === "string") return check(obj, where);
  if (Array.isArray(obj)) return obj.forEach((v, i) => walk(v, `${where}[${i}]`));
  if (obj && typeof obj === "object") for (const [k, v] of Object.entries(obj)) walk(v, `${where}.${k}`);
}
for (const c of courses) {
  if (!c.math) continue;
  for (const key of ["mcq", "frq", "flashcards", "tips"]) walk(c[key], `${c.id}.${key}`);
}
console.log(`${count} math segments checked, ${bad} problems`);
process.exit(bad ? 1 : 0);
