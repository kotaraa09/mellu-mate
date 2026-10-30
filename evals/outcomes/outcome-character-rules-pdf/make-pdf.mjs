// Writes the rule book in book.txt as a PDF of about 30 pages: node make-pdf.mjs <out.pdf>
// No dependencies: a text-only PDF in the base-14 fonts, built by hand. The tables that a
// real rule book has (equipment, fares, travel, creatures) are generated here from a fixed
// seed, so every run gets the same book, and they hold no rule a hero needs.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? 'RULES.pdf';

let seed = 20261029;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

const MATERIALS = ['iron', 'ash-wood', 'bronze', 'steam-glass', 'cliff-oak', 'reed', 'bone', 'copper', 'Ember-forged'];
const GOODS = ['lantern', 'rope (50 feet)', 'spear', 'shield', 'cooking pot', 'fishing net', 'tent', 'short blade', 'long blade',
  'bow', 'quiver of arrows', 'climbing hooks', 'water skin', 'map case', 'ink and pen', 'blanket', 'hand axe', 'helmet',
  'chain coat', 'leather coat', 'compass', 'whistle', 'mirror', 'chalk (ten sticks)', 'lock and key', 'healer\'s bag'];
const PLACES = ['Cindral', 'Halls of Morrow', 'Port Vey', 'Steamwatch', 'Greyhollow', 'Tallreach', 'the Free Ports',
  'Saltmere', 'Brindle Moor', 'Ashgate', 'Lantern Key', 'Hollow Bay', 'Kettle Isle', 'the Moot of Halls', 'Driftwick'];
const BEAST_A = ['Steam', 'Cinder', 'Moss', 'Cliff', 'Ash', 'Tide', 'Ember', 'Reef', 'Hollow', 'Thorn', 'Brine', 'Smoke'];
const BEAST_B = ['hound', 'crawler', 'wyrm', 'stalker', 'crab', 'serpent', 'wisp', 'troll', 'eel', 'moth', 'goat', 'heron', 'golem'];
const HABITS = ['hunts at dusk and sleeps through the heat of the day', 'follows ferries in packs and waits for something to fall in',
  'nests in old tombs and guards whatever it finds there', 'drinks from the hot springs and is calm unless someone comes too close',
  'eats metal, and a hero\'s blade is a meal to it', 'sings before it attacks, and sailors stuff their ears with wax',
  'is shy in daylight and bold in the steam banks', 'collects shiny things and trades them to anyone who brings it fish'];

function table(name) {
  const rows = [];
  if (name === 'equipment') {
    for (let i = 0; i < 140; i++) {
      rows.push(`${pick(MATERIALS)} ${pick(GOODS)} - ${between(1, 60)} crowns, weight ${between(1, 20)} pounds. ` +
        `Sold in ${pick(PLACES)} and ${pick(PLACES)}.`);
    }
  } else if (name === 'services') {
    for (let i = 0; i < 40; i++) {
      rows.push(`Ferry from ${pick(PLACES)} to ${pick(PLACES)} - ${between(1, 12)} crowns, ${between(1, 5)} days. ` +
        `A room at the inn there costs ${between(1, 4)} crowns a night.`);
    }
  } else if (name === 'travel') {
    for (let i = 0; i < 30; i++) {
      rows.push(`Road from ${pick(PLACES)} to ${pick(PLACES)}: ${between(10, 120)} miles. In the steam season, ` +
        `${pick(['add a day', 'the road is closed', 'travel only by day', 'hire a guide for 2 crowns'])}.`);
    }
  } else if (name === 'bestiary') {
    for (let i = 0; i < 70; i++) {
      rows.push(`${pick(BEAST_A)} ${pick(BEAST_B)}. Hit points ${between(4, 120)}, defense ${between(10, 19)}, ` +
        `speed ${pick([20, 25, 30, 40, 50])}. It ${pick(HABITS)}. Found near ${pick(PLACES)}. ` +
        `Its attack does ${between(1, 4)} dice of harm${rand() < 0.3 ? ', and the harm is fire' : ''}.`);
      rows.push('');
    }
  } else throw new Error(`no table named ${name}`);
  return rows;
}

// Layout: US letter, 11-point text, a new page for each chapter, a page number at the foot.
const W = 612, H = 792, M = 60, SIZE = 11, LEAD = 15, WRAP = 86;
const LINES = Math.floor((H - 2 * M - 20) / LEAD);
const pages = [];
let page = null;
const newPage = () => { page = []; pages.push(page); };
const put = (text, font = 'F1') => {
  if (!page || page.length >= LINES) newPage();
  page.push({ text, font });
};
const wrap = (text) => {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + ' ' + word).length > WRAP) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
};

for (const raw of readFileSync(join(here, 'book.txt'), 'utf8').split(/\r?\n/)) {
  if (raw.startsWith('# ')) { newPage(); put(raw.slice(2), 'F3'); put(''); }
  else if (raw.startsWith('## ')) { if (page.length > LINES - 4) newPage(); put(raw.slice(3), 'F2'); }
  else if (raw.startsWith('@table ')) for (const row of table(raw.slice(7).trim())) for (const l of row ? wrap(row) : ['']) put(l);
  else if (!raw.trim()) { if (page && page.length && page.at(-1).text) put(''); }
  else for (const l of wrap(raw)) put(l);
}

const esc = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);
const objects = [];
const add = (body) => { objects.push(body); return objects.length; };
const catalog = add(null);
const tree = add(null);
const fonts = ['Helvetica', 'Helvetica-Bold', 'Helvetica-Bold'].map((f) => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`));
const kids = pages.map((lines, i) => {
  let y = H - M;
  const ops = [];
  for (const { text, font } of lines) {
    const size = font === 'F3' ? 16 : font === 'F2' ? 12.5 : SIZE;
    if (text) ops.push(`BT /${font} ${size} Tf ${M} ${y} Td (${esc(text)}) Tj ET`);
    y -= LEAD;
  }
  ops.push(`BT /F1 9 Tf ${W / 2 - 15} ${M - 25} Td (Page ${i + 1}) Tj ET`);
  const stream = ops.join('\n');
  const content = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
  return add(`<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 ${W} ${H}] /Contents ${content} 0 R ` +
    `/Resources << /Font << /F1 ${fonts[0]} 0 R /F2 ${fonts[1]} 0 R /F3 ${fonts[2]} 0 R >> >> >>`);
});
objects[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R >>`;
objects[tree - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;

let pdf = '%PDF-1.4\n';
const offsets = objects.map((body, i) => {
  const at = Buffer.byteLength(pdf, 'latin1');
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  return at;
});
const xref = Buffer.byteLength(pdf, 'latin1');
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
writeFileSync(out, pdf, 'latin1');
console.log(`${out}: ${pages.length} pages`);
