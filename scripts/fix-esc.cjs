// One off: replace literal control bytes in source files with \u escapes, so
// nothing invisible ends up committed.
const fs = require("node:fs");

const KEEP = new Set([9, 10, 13]); // tab, newline, carriage return

for (const file of process.argv.slice(2)) {
  const text = fs.readFileSync(file, "utf8");
  let out = "";
  let changed = 0;
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code !== undefined && code < 32 && !KEEP.has(code)) {
      out += `\\u${code.toString(16).toUpperCase().padStart(4, "0")}`;
      changed += 1;
    } else if (code === 127) {
      out += "\\u007F";
      changed += 1;
    } else {
      out += char;
    }
  }
  if (changed === 0) {
    console.log(`clean: ${file}`);
    continue;
  }
  fs.writeFileSync(file, out);
  console.log(`fixed: ${file} (${changed})`);
}
