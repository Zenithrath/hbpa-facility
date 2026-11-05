import { renderChecklistPaper } from './src/pages/checklist-paper';
const html = renderChecklistPaper(undefined, { rowId: 1 });
const m = html.match(/<svg class="ck-g"[^>]*>[\s\S]*?<\/svg>/);
console.log(m ? m[0] : 'NO SVG');