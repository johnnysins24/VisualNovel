#!/usr/bin/env node
// The world map as a poster (run from the repo root, after `node art/kit/map.mjs`):
//   node art/kit/map-poster.mjs    writes art/preview/map_poster.png (the day map at 3x with every
//                                  name, the airship routes, the title, a compass, a legend and the
//                                  scale), map_poster_night.png (the same at night) and
//                                  map_details.png (five places close up).
// The names are set in the game's own fonts (Noto Serif Thai for headings, Anuphan for names,
// Silkscreen for numbers; Google Fonts, as in index.html), so this needs Playwright's Chromium and
// the network. A name that would cover another name or a pillar moves to the nearest free spot;
// small print with no free spot is left out, and anything else that still overlaps is listed.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = JSON.parse(readFileSync(join(ROOT, 'public/map/labels.json'), 'utf8'));
let IMG = pathToFileURL(join(ROOT, 'public/map/world_day.png')).href;
const FONTS = 'https://fonts.googleapis.com/css2?family=Anuphan:wght@400;500;600&family=Noto+Serif+Thai:wght@500;600;700&family=Silkscreen&display=block';
const S = 3; // poster px per map px
const { width: MW, height: MH } = DATA;

// The order names are placed in: earlier ones keep their spot, later ones move out of the way.
const RANK = { capital: 0, city: 1, pillar: 2, town: 3, temple: 4, village: 5, station: 6, pass: 6, fort: 7, landmark: 7, camp: 8, pit: 8 };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const CSS = `
  :root { --ink: #2b2840; --bone: #f1ebdf; --paper: #e9e2d2; --frame: #1f2236; --gold: #c9a95e; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: var(--frame); color: var(--bone); font-family: Anuphan, sans-serif; }
  .map { position: relative; image-rendering: pixelated; background-repeat: no-repeat; overflow: hidden; }
  .map > svg { position: absolute; left: 0; top: 0; overflow: visible; }
  text { paint-order: stroke; stroke-linejoin: round; dominant-baseline: middle; }
  .region { font: 600 32px 'Noto Serif Thai'; fill: #fbf6ea; stroke: rgba(43,40,64,.78); stroke-width: 7px; letter-spacing: .1em; }
  .sea { font: 500 28px 'Noto Serif Thai'; fill: #d8e6f6; stroke: rgba(37,52,88,.5); stroke-width: 4px; letter-spacing: .55em; }
  .river { font: 500 15px Anuphan; fill: #e3eefa; stroke: rgba(43,40,64,.75); stroke-width: 3.5px; letter-spacing: .22em; }
  .capital { font: 700 29px 'Noto Serif Thai'; fill: #fff8e8; stroke: var(--ink); stroke-width: 7px; }
  .city { font: 600 24px 'Noto Serif Thai'; fill: #fff8e8; stroke: var(--ink); stroke-width: 6px; }
  .pillar { font: 600 18px 'Noto Serif Thai'; fill: #f6e6bd; stroke: var(--ink); stroke-width: 5px; }
  .town { font: 600 19px Anuphan; fill: #fffdf7; stroke: var(--ink); stroke-width: 5px; }
  .name { font: 500 16px Anuphan; fill: #fffdf7; stroke: rgba(43,40,64,.92); stroke-width: 4.5px; }
  .minor { font: 500 13.5px Anuphan; fill: #f3efe6; stroke: rgba(43,40,64,.9); stroke-width: 4px; }
  .route { fill: none; stroke: rgba(255,255,255,.72); stroke-width: 2.6; stroke-dasharray: 1 9; stroke-linecap: round; }
  .route-shadow { fill: none; stroke: rgba(30,28,50,.35); stroke-width: 2.6; stroke-dasharray: 1 9; stroke-linecap: round; }
  .num { font-family: Silkscreen, monospace; }
`;

const classOf = l => (l.cls === 'region' || l.cls === 'sea' || l.cls === 'river' ? l.cls
  : l.cls === 'capital' ? 'capital' : l.cls === 'city' ? 'city' : l.cls === 'pillar' ? 'pillar' : l.cls === 'town' ? 'town'
  : l.minor ? 'minor' : 'name');

/** SVG for the names inside the map box [bx, by, bw, bh] at `scale` poster px per map px. */
function labelsSvg(box, scale, { big = 1 } = {}) {
  const [bx, by, bw, bh] = box, out = [];
  for (const [k, l] of DATA.labels.entries()) {
    if (l.x < bx - 4 || l.y < by - 4 || l.x > bx + bw + 4 || l.y > by + bh + 4) continue;
    const c = classOf(l), x = (l.x - bx) * scale, y = (l.y - by) * scale, anchor = l.anchor ?? 'middle';
    const fixed = c === 'region' || c === 'sea' || c === 'river';
    const rot = l.angle ? ` transform="rotate(${l.angle} ${x} ${y})"` : '';
    const size = big !== 1 ? ` style="font-size:${big}em"` : '';
    const [ax, ay] = l.at ? [(l.at[0] - bx) * scale, (l.at[1] - by) * scale] : [x, y];
    out.push(`<text class="${c}" data-k="${k}" data-rank="${fixed ? -1 : (RANK[l.cls] ?? 7) + (l.minor ? 10 : 0)}" data-ax="${ax}" data-ay="${ay}" x="${x}" y="${y}" text-anchor="${anchor}"${rot}${size}>${esc(l.th)}</text>`);
  }
  return out.join('\n');
}

function routesSvg(box, scale) {
  const [bx, by] = box, P = ([x, y]) => `${((x - bx) * scale).toFixed(1)} ${((y - by) * scale).toFixed(1)}`;
  return DATA.routes.map(r => {
    const d = `M ${P(r.from)} Q ${P(r.c)} ${P(r.to)}`;
    return `<path class="route-shadow" d="${d}" transform="translate(4 7)"/><path class="route" d="${d}"/>`;
  }).join('\n');
}

const mapDiv = (box, scale, extra = '') => {
  const [bx, by, bw, bh] = box;
  return `<div class="map" style="width:${bw * scale}px;height:${bh * scale}px;background-image:url('${IMG}');background-size:${MW * scale}px ${MH * scale}px;background-position:${-bx * scale}px ${-by * scale}px">
    <svg width="${bw * scale}" height="${bh * scale}" data-scale="${scale}" data-box="${box.join(',')}">${routesSvg(box, scale)}${labelsSvg(box, scale, extra)}</svg></div>`;
};

// a small piece of the map itself, for the legend
const chip = (box, scale = 3) => `<div class="map chip" style="width:${box[2] * scale}px;height:${box[3] * scale}px;background-image:url('${IMG}');background-size:${MW * scale}px ${MH * scale}px;background-position:${-box[0] * scale}px ${-box[1] * scale}px"></div>`;

const compass = `<svg width="150" height="150" viewBox="-75 -75 150 150" style="position:absolute;left:40px;top:34px">
  <circle r="46" fill="none" stroke="rgba(241,235,223,.55)" stroke-width="1.5"/>
  <circle r="40" fill="none" stroke="rgba(241,235,223,.3)" stroke-width="1" stroke-dasharray="2 4"/>
  <g fill="#f1ebdf" stroke="#2b2840" stroke-width="1.5" stroke-linejoin="round">
    <path d="M0 -58 L9 -9 L0 0 Z"/><path d="M0 -58 L-9 -9 L0 0 Z" fill="#cfc6b4"/>
    <path d="M0 58 L9 9 L0 0 Z" fill="#cfc6b4"/><path d="M0 58 L-9 9 L0 0 Z"/>
    <path d="M58 0 L9 -9 L0 0 Z" fill="#cfc6b4"/><path d="M58 0 L9 9 L0 0 Z"/>
    <path d="M-58 0 L-9 9 L0 0 Z" fill="#cfc6b4"/><path d="M-58 0 L-9 -9 L0 0 Z"/>
    <path d="M0 -30 L5 -5 L0 0 L-5 -5 Z" fill="#c9a95e"/>
  </g>
  <text y="-66" text-anchor="middle" style="font:700 17px 'Noto Serif Thai';fill:#fbf6ea;stroke:#2b2840;stroke-width:4px">เหนือ</text>
</svg>`;

function posterHtml() {
  const legend = [
    ['pillar', 'เสาฟ้า', `<svg width="30" height="44" viewBox="0 0 30 44"><path d="M3 9c3-6 21-6 24 0-1 4-23 4-24 0z" fill="#f8faff" stroke="#2b2840" stroke-width="1.5"/><rect x="11" y="11" width="8" height="28" fill="#e4ddd0" stroke="#2b2840" stroke-width="1.5"/><rect x="9" y="38" width="12" height="4" fill="#d8d1c4" stroke="#2b2840" stroke-width="1.5"/></svg>`],
    ['city', 'เมือง', chip([330, 316, 16, 11])],
    ['town', 'เมืองตลาด', chip([306, 287, 16, 9])],
    ['village', 'หมู่บ้าน', chip([298, 276, 11, 7])],
    ['fort', 'ป้อมผู้เฝ้าผนึก', chip([473, 242, 11, 8])],
    ['pit', 'หลุมถ่านมาร', chip([488, 249, 11, 8])],
    ['rail', 'ทางรถไฟ', `<svg width="64" height="20"><line x1="2" y1="10" x2="62" y2="10" stroke="#3e3c4a" stroke-width="3"/>${Array.from({ length: 10 }, (_, i) => `<line x1="${5 + i * 6}" y1="10" x2="${5 + i * 6}" y2="14" stroke="#9e7850" stroke-width="2.4"/>`).join('')}</svg>`],
    ['road', 'ถนน', `<svg width="64" height="20"><line x1="2" y1="10" x2="62" y2="10" stroke="#a3866f" stroke-width="3"/></svg>`],
    ['track', 'ทางเกวียน', `<svg width="64" height="20"><line x1="2" y1="10" x2="62" y2="10" stroke="#a3866f" stroke-width="3" stroke-dasharray="6 3"/></svg>`],
    ['route', 'เส้นทางเรือเหาะ', `<svg width="64" height="20"><path class="route" d="M2 14 Q32 2 62 14" style="stroke:#fff"/></svg>`],
  ].map(([k, t, icon]) => `<div class="li li-${k}"><div class="icon">${icon}</div><span>${t}</span></div>`).join('');
  const day = 25 * S;
  const scale = `<div class="scale"><div class="bar">${Array.from({ length: 5 }, (_, i) => `<i style="left:${i * day}px;width:${day}px" class="${i % 2 ? 'b' : 'a'}"></i>`).join('')}
    ${Array.from({ length: 6 }, (_, i) => `<b class="num" style="left:${i * day}px">${i}</b>`).join('')}</div><span>วันเดินเท้า</span></div>`;
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}"><style>${CSS}
    .page { width: ${MW * S + 96}px; padding: 0 48px; }
    .head { height: 168px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; position: relative; }
    .head h1 { font: 700 62px/1.15 'Noto Serif Thai'; letter-spacing: .14em; color: #f6efdd; text-shadow: 0 3px 0 #11131f; }
    .head p { font: 500 21px Anuphan; color: #c8c0ae; letter-spacing: .12em; }
    .head p .num { font-size: 18px; color: #e3cf96; letter-spacing: .05em; }
    .orn { position: absolute; top: 74px; width: 360px; height: 2px; background: linear-gradient(90deg, transparent, var(--gold)); }
    .orn.l { left: 170px; } .orn.r { right: 170px; transform: scaleX(-1); }
    .frame { position: relative; outline: 2px solid var(--gold); outline-offset: 6px; box-shadow: 0 0 0 14px #262a42, 0 0 0 15px rgba(201,169,94,.45); }
    .foot { height: 160px; display: flex; align-items: center; justify-content: space-between; gap: 28px; padding: 26px 8px 0; }
    .legend { display: grid; grid-template-columns: repeat(5, auto); gap: 12px 30px; align-items: center; }
    .li { display: flex; align-items: center; gap: 10px; font: 500 17px Anuphan; color: #ece5d6; white-space: nowrap; }
    .icon { width: 64px; height: 44px; display: flex; align-items: center; justify-content: center; }
    .chip { outline: 1px solid rgba(201,169,94,.35); }
    .scale { display: flex; flex-direction: column; align-items: flex-start; gap: 30px; font: 500 17px Anuphan; color: #ece5d6; }
    .scale .bar { position: relative; width: ${day * 5}px; height: 12px; }
    .scale i { position: absolute; top: 0; height: 12px; border: 2px solid #ece5d6; }
    .scale i.a { background: #ece5d6; } .scale i.b { background: #1f2236; }
    .scale b { position: absolute; top: 20px; transform: translateX(-50%); font-size: 14px; font-weight: 400; color: #e3cf96; }
    .credit { font: 500 15px Anuphan; color: #9d96a8; text-align: right; line-height: 1.6; }
    .credit b { font: 600 19px 'Noto Serif Thai'; color: #e9e1cf; }
  </style></head><body><div class="page">
    <div class="head"><div class="orn l"></div><div class="orn r"></div><h1>แผ่นดินเจ็ดเสา</h1>
      <p>แผนที่ทวีปในปีที่ <span class="num">312</span> แห่งศักราชผนึก</p></div>
    <div class="frame">${mapDiv([0, 0, MW, MH], S)}${compass}</div>
    <div class="foot"><div class="legend">${legend}</div>${scale}<div class="credit"><b>เถ้ากับดาว</b><br>ทิศเหนืออยู่ด้านบน<br>แสงจากทิศตะวันตกเฉียงเหนือ</div></div>
  </div></body></html>`;
}

// Five places close up, each with a line about it.
const DETAILS = [
  { title: 'เวนทราส', note: 'เมืองหลวงที่ปากแม่น้ำ กำแพงเมืองเก่า วิหารที่โคนเสาเวรัส โรงกลั่นน้ำค้างดาว และอู่ราชนาวี', box: [292, 292, 104, 70], scale: 6 },
  { title: 'ถิ่นรอบเสาอีเซล', note: 'วิหารใหญ่ บ้านเงาเสาในเงาของเสา ทุ่งจานรับดาว เมืองตลาด และทุ่งที่เหลืองไปจนสุดตาในหน้าเก็บเกี่ยว', box: [242, 238, 104, 70], scale: 6 },
  { title: 'ทุนดาร์ใต้เสาออสซา', note: 'เมืองหลวงของคนแคระสร้างวนรอบโคนเสา ทางรถไฟไต่เขาเป็นขั้นบันได ปล่องเตาพ่นควันสีสนิม', box: [268, 44, 124, 84], scale: 5 },
  { title: 'วงหินผนึก', note: 'ตอเสาอัสเทลกลางเถ้าลึกถึงเข่า ป้อมเจ็ดแห่งบนวงหิน ท่อนบนของเสานอนยาวไปถึงทะเลตะวันออก', box: [436, 140, 204, 140], scale: 3 },
  { title: 'ใจกลางป่าไอเลธ', note: 'เสาอุลเวนกับเสาทาลิสห่างกันหนึ่งวันเดิน ลมระหว่างสองเสาไม่เคยหยุด หอนับดาวบนต้นไม้ที่สูงที่สุด', box: [22, 112, 156, 105], scale: 4 },
];

function detailsHtml() {
  const cards = DETAILS.map(d => `<figure><div class="frame">${mapDiv(d.box, d.scale, { big: 1.12 })}</div><figcaption><b>${d.title}</b><span>${d.note}</span></figcaption></figure>`).join('');
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}"><style>${CSS}
    .page { width: 1980px; padding: 40px 48px 48px; }
    h1 { font: 700 44px 'Noto Serif Thai'; color: #f6efdd; letter-spacing: .12em; text-align: center; margin-bottom: 30px; }
    h1 small { display: block; font: 500 18px Anuphan; color: #c8c0ae; letter-spacing: .1em; margin-top: 4px; }
    .grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 34px 40px; }
    figure { width: 624px; }
    .frame { outline: 2px solid var(--gold); outline-offset: 4px; }
    figcaption { margin-top: 16px; display: flex; flex-direction: column; gap: 4px; }
    figcaption b { font: 600 24px 'Noto Serif Thai'; color: #f6efdd; }
    figcaption span { font: 400 16.5px/1.55 Anuphan; color: #cfc8b8; }
  </style></head><body><div class="page"><h1>แผ่นดินเจ็ดเสา<small>ห้าที่ในระยะใกล้</small></h1><div class="grid">${cards}</div></div></body></html>`;
}

// Runs in the page: move names off each other and off the pillars, nearest free spot first: first
// nudged about where they were put, then set to the right or the left of the place itself. In a
// close-up a name must also fit inside the picture, or it is left out.
function place(obstacles) {
  const pad = 3, report = [];
  for (const svg of document.querySelectorAll('svg[data-box]')) {
    const s = Number(svg.dataset.scale), [bx, by, bw, bh] = svg.dataset.box.split(',').map(Number), whole = bx === 0 && by === 0;
    const W = bw * s, H = bh * s;
    const taken = obstacles.map(([x0, y0, x1, y1]) => ({ x: (x0 - bx) * s, y: (y0 - by) * s, w: (x1 - x0) * s, h: (y1 - y0) * s, what: 'a pillar' }));
    const hits = (b, list) => list.find(o => b.x < o.x + o.w + pad && b.x + b.width + pad > o.x && b.y < o.y + o.h + pad && b.y + b.height + pad > o.y);
    const fits = b => whole || (b.x >= 4 && b.y >= 4 && b.x + b.width <= W - 4 && b.y + b.height <= H - 4);
    const texts = [...svg.querySelectorAll('text')].sort((a, b) => a.dataset.rank - b.dataset.rank);
    const placed = [], step = 6 * (s / 3);
    const near = [[0, 0], [0, 1.6], [0, -1.6], [2.2, 0], [-2.2, 0], [0, 3], [0, -3], [3, 1.5], [-3, 1.5], [3, -1.5], [-3, -1.5], [0, 4.5], [0, -4.5]];
    for (const t of texts) {
      const rank = Number(t.dataset.rank), x0 = Number(t.getAttribute('x')), y0 = Number(t.getAttribute('y')), a0 = t.getAttribute('text-anchor');
      if (rank < 0) {
        // seas, rivers and regions stay where they were put; the rest keep clear of them
        const b = t.getBBox();
        if (!fits(b)) { t.style.display = 'none'; continue; }
        if (!t.getAttribute('transform')) placed.push({ x: b.x, y: b.y, w: b.width, h: b.height, what: t.textContent });
        const o = hits(b, taken);
        if (o) report.push(`${t.textContent} covers ${o.what}`);
        continue;
      }
      const ax = Number(t.dataset.ax), ay = Number(t.dataset.ay), side = 5 * s;
      const tries = [
        ...near.map(([dx, dy]) => [a0, x0 + dx * step, y0 + dy * step]),
        ...[0, -1, 1, -2, 2].flatMap(dy => [['start', ax + side, ay - 2 * s + dy * step], ['end', ax - side, ay - 2 * s + dy * step]]),
        ['middle', ax, ay + 4 * s], ['middle', ax, ay - 8 * s], ['middle', ax, ay + 7 * s], ['middle', ax, ay - 11 * s],
      ];
      let ok = false;
      for (const [anchor, x, y] of tries) {
        t.setAttribute('text-anchor', anchor); t.setAttribute('x', x); t.setAttribute('y', y);
        const b = t.getBBox();
        if (fits(b) && !hits(b, taken) && !hits(b, placed)) { placed.push({ x: b.x, y: b.y, w: b.width, h: b.height, what: t.textContent }); ok = true; break; }
      }
      if (ok) continue;
      t.setAttribute('text-anchor', a0); t.setAttribute('x', x0); t.setAttribute('y', y0);
      const b = t.getBBox();
      if (!fits(b)) { t.style.display = 'none'; continue; }
      if (rank >= 10) { t.style.display = 'none'; report.push(`${t.textContent} left out: no room`); continue; } // small print gives way
      const o = hits(b, taken) ?? hits(b, placed);
      placed.push({ x: b.x, y: b.y, w: b.width, h: b.height, what: t.textContent });
      report.push(`${t.textContent} overlaps ${o?.what}`);
    }
  }
  return report;
}

async function shoot(html, out, fonts) {
  const { chromium } = await import('playwright');
  let browser;
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const opts = proxy ? { proxy: { server: proxy } } : {};
  try { browser = await chromium.launch(opts); } catch { browser = await chromium.launch({ ...opts, executablePath: '/opt/pw-browsers/chromium' }); }
  const dir = mkdtempSync(join(tmpdir(), 'map-poster-')), file = join(dir, 'page.html');
  writeFileSync(file, html);
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const missing = await page.evaluate(want => want.filter(f => ![...document.fonts].some(x => x.family.replace(/["']/g, '') === f && x.status === 'loaded')), fonts);
  if (missing.length) console.warn(`fonts not loaded: ${missing.join(', ')} (no network?)`);
  const report = await page.evaluate(place, DATA.obstacles ?? []);
  const el = await page.$('.page');
  await el.screenshot({ path: out });
  await browser.close();
  return report;
}

const r1 = await shoot(posterHtml(), join(ROOT, 'art/preview/map_poster.png'), ['Anuphan', 'Noto Serif Thai', 'Silkscreen']);
const r2 = await shoot(detailsHtml(), join(ROOT, 'art/preview/map_details.png'), ['Anuphan', 'Noto Serif Thai']);
IMG = pathToFileURL(join(ROOT, 'public/map/world_night.png')).href;
await shoot(posterHtml(), join(ROOT, 'art/preview/map_poster_night.png'), ['Anuphan', 'Noto Serif Thai', 'Silkscreen']);
console.log('wrote art/preview/map_poster.png, map_poster_night.png and map_details.png');
for (const r of [...r1.map(x => `poster: ${x}`), ...r2.map(x => `details: ${x}`)]) console.log('  ' + r);
