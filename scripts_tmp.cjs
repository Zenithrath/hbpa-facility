const fs = require('fs');
const p = 'src/pages/checklist.ts';
let s = fs.readFileSync(p, 'utf8');

// Add print import
s = s.replace(
  'import { $, esc, field$, isoToSlash, toast, todayISO } from "../ui";',
  'import { $, esc, field$, isoToSlash, print, toast, todayISO } from "../ui";',
  1
);

// Rename local 'marks' variable in printRow to 'viewMarks'
// The line: "      const marks = marks.filter((m) => m.view === v);"
s = s.replace(
  "      const marks = marks.filter((m) => m.view === v);",
  "      const viewMarks = marks.filter((m) => m.view === v);",
  1
);
// Update references to marks within that block: marks.length -> viewMarks.length, marks.forEach -> viewMarks.forEach
// These appear right after. Let me do targeted replacements.
s = s.replace("      if (viewMarks.length) {\n        viewMarks.forEach((m) => {", "      if (viewMarks.length) {\n        viewMarks.forEach((m) => {", 1);
// The marks.forEach for positioning also uses outer marks; check the second forEach uses marks (outer) for marks. Let me inspect.
fs.writeFileSync(p, s);
console.log('done');
// Show the dmgBox block
const i = s.indexOf('const dmgBox');
console.log(s.slice(i, i+700));
