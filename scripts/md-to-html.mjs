import { readFileSync, writeFileSync } from "node:fs";

const [, , inPath, outPath] = process.argv;
const src = readFileSync(inPath, "utf8");

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s) {
  // escape first, then apply inline markup
  let t = esc(s);
  // inline code
  t = t.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  // bold
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // links [text](href)
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return t;
}

const lines = src.split(/\r?\n/);
let html = "";
let i = 0;

function flushTable(rows) {
  // rows: array of raw "| a | b |" lines; second row is separator
  const parse = (line) =>
    line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const header = parse(rows[0]);
  const body = rows.slice(2).map(parse);
  let t = "<table><thead><tr>";
  for (const h of header) t += `<th>${inline(h)}</th>`;
  t += "</tr></thead><tbody>";
  for (const r of body) {
    t += "<tr>";
    for (const c of r) t += `<td>${inline(c)}</td>`;
    t += "</tr>";
  }
  t += "</tbody></table>";
  return t;
}

while (i < lines.length) {
  const line = lines[i];

  // fenced code block
  if (/^```/.test(line)) {
    let code = "";
    i++;
    while (i < lines.length && !/^```/.test(lines[i])) {
      code += esc(lines[i]) + "\n";
      i++;
    }
    i++; // closing fence
    html += `<pre><code>${code}</code></pre>`;
    continue;
  }

  // table
  if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:-]+\|/.test(lines[i + 1])) {
    const rows = [];
    while (i < lines.length && /^\s*\|/.test(lines[i])) {
      rows.push(lines[i]);
      i++;
    }
    html += flushTable(rows);
    continue;
  }

  // blockquote (consecutive >)
  if (/^>\s?/.test(line)) {
    let q = "";
    while (i < lines.length && /^>\s?/.test(lines[i])) {
      q += inline(lines[i].replace(/^>\s?/, "")) + " ";
      i++;
    }
    html += `<blockquote>${q.trim()}</blockquote>`;
    continue;
  }

  // hr
  if (/^---+\s*$/.test(line)) {
    html += "<hr/>";
    i++;
    continue;
  }

  // headings
  const h = line.match(/^(#{1,6})\s+(.*)$/);
  if (h) {
    const lvl = h[1].length;
    html += `<h${lvl}>${inline(h[2])}</h${lvl}>`;
    i++;
    continue;
  }

  // ordered list
  if (/^\d+\.\s+/.test(line)) {
    let l = "<ol>";
    while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
      l += `<li>${inline(lines[i].replace(/^\d+\.\s+/, ""))}</li>`;
      i++;
    }
    l += "</ol>";
    html += l;
    continue;
  }

  // unordered list
  if (/^[-*]\s+/.test(line)) {
    let l = "<ul>";
    while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
      l += `<li>${inline(lines[i].replace(/^[-*]\s+/, ""))}</li>`;
      i++;
    }
    l += "</ul>";
    html += l;
    continue;
  }

  // blank
  if (/^\s*$/.test(line)) {
    i++;
    continue;
  }

  // paragraph (gather until blank)
  let p = "";
  while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|>|```|---+\s*$|\d+\.\s|[-*]\s|\s*\|)/.test(lines[i])) {
    p += (p ? " " : "") + lines[i];
    i++;
  }
  if (p) html += `<p>${inline(p)}</p>`;
}

const doc = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #17354c; font-size: 11px; line-height: 1.55; }
  h1 { font-size: 22px; color: #004262; border-bottom: 3px solid #008e9c; padding-bottom: 6px; margin: 0 0 10px; }
  h2 { font-size: 16px; color: #00579f; margin: 20px 0 6px; border-bottom: 1px solid rgba(0,66,98,.14); padding-bottom: 3px; }
  h3 { font-size: 13px; color: #004262; margin: 14px 0 4px; }
  p { margin: 5px 0; }
  a { color: #0087c1; text-decoration: none; }
  code { background: #eef4f7; color: #004262; padding: 1px 4px; border-radius: 4px; font-family: Consolas, monospace; font-size: 10px; }
  pre { background: #0d1b26; color: #e6eef3; padding: 10px 12px; border-radius: 8px; overflow-x: auto; page-break-inside: avoid; }
  pre code { background: transparent; color: #e6eef3; padding: 0; font-size: 9.5px; white-space: pre-wrap; word-break: break-word; }
  blockquote { border-left: 4px solid #008e9c; background: #f0f7f9; margin: 8px 0; padding: 7px 12px; color: #3a5366; font-size: 10.5px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 10px; page-break-inside: avoid; }
  th, td { border: 1px solid rgba(0,66,98,.18); padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #eef4f7; color: #004262; }
  ul, ol { margin: 5px 0 5px 18px; padding: 0; }
  li { margin: 2px 0; }
  hr { border: none; border-top: 1px solid rgba(0,66,98,.16); margin: 14px 0; }
</style></head><body>
${html}
</body></html>`;

writeFileSync(outPath, doc, "utf8");
console.log("HTML written:", outPath);
