#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
//  J.A.R.V.I.S. — builds the Iron Man HUD artwork for the profile README
//
//    node ironman/build.mjs            artwork + live GitHub stats (needs GITHUB_TOKEN)
//    node ironman/build.mjs --static   artwork only
//
//  Output → assets/ironman/*.svg   (text & settings live in ironman/config.mjs)
//  Zero dependencies — Node 18+.
// ════════════════════════════════════════════════════════════════════
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from './config.mjs';
import BRAND from './brand-icons.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'ironman');
const STATIC_ONLY = process.argv.includes('--static');
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

// ─── Palette & type ─────────────────────────────────────────────────
const C = {
  ink: '#07080C', panel: '#0B0E14', tile: '#0D121A',
  red: '#C1121F', redHot: '#E63946', redDeep: '#6A040F',
  gold: '#F7C548', goldLight: '#FFE7A3', goldDeep: '#B7892A',
  arc: '#7DF9FF', arcDeep: '#1FB6C9', arcSoft: '#D6FEFF',
  text: '#E8EDF2', muted: '#8A94A6', line: '#1E2633', track: '#151B26',
};
const TONE = { red: C.redHot, gold: C.gold, arc: C.arc };
const LANG_COLORS = ['#F7C548', '#E63946', '#7DF9FF', '#FF8C42', '#C9D1D9', '#1FB6C9', '#B7892A'];
const DISPLAY = `'Bahnschrift','DIN Alternate','DIN Condensed','Roboto Condensed','Arial Narrow','Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const MONO = `'SF Mono','JetBrains Mono','Cascadia Code',Menlo,Consolas,'Liberation Mono','DejaVu Sans Mono',monospace`;

const BASE_CSS = `
.d{font-family:${DISPLAY};font-weight:700}
.dl{font-family:${DISPLAY};font-weight:400}
.m{font-family:${MONO}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes spinr{to{transform:rotate(-360deg)}}
@keyframes pulse{0%,100%{opacity:.7}50%{opacity:1}}
@keyframes breathe{0%,100%{opacity:.25}50%{opacity:.65}}
@keyframes blink{0%,55%{opacity:1}56%,100%{opacity:.12}}
@keyframes chase{0%{opacity:.6}35%,100%{opacity:0}}
@keyframes flow{to{stroke-dashoffset:-240}}
@keyframes scan{from{transform:translateY(-120px)}to{transform:translateY(560px)}}
@keyframes rise{from{transform:translateY(8px)}to{transform:none}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes lock{0%{transform:scale(1.35);opacity:0}60%{opacity:1}100%{transform:scale(1);opacity:1}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;

// ─── Helpers ────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const chars = (s) => [...String(s)].length;
const r2 = (n) => Math.round(n * 100) / 100;
const polar = (cx, cy, r, deg) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [r2(cx + r * Math.cos(a)), r2(cy + r * Math.sin(a))];
};
const arcPath = (cx, cy, r, a0, a1) => {
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
};
const sector = (cx, cy, r0, r1, a0, a1) => {
  const big = a1 - a0 > 180 ? 1 : 0;
  const [ax, ay] = polar(cx, cy, r1, a0), [bx, by] = polar(cx, cy, r1, a1);
  const [qx, qy] = polar(cx, cy, r0, a1), [px, py] = polar(cx, cy, r0, a0);
  return `M${ax} ${ay}A${r1} ${r1} 0 ${big} 1 ${bx} ${by}L${qx} ${qy}A${r0} ${r0} 0 ${big} 0 ${px} ${py}Z`;
};
const origin = (x, y) => `transform-origin:${r2(x)}px ${r2(y)}px`;
const fmt = (n) => (n >= 100000 ? `${Math.round(n / 1000)}k` : n.toLocaleString('en-US'));
const roman = (n) => {
  const map = [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, r] of map) while (n >= v) { s += r; n -= v; }
  return s;
};
const LANG_ALIAS = { 'Visual Basic .NET': 'VB.NET', 'Jupyter Notebook': 'Jupyter', 'Objective-C++': 'Obj-C++', 'Objective-C': 'Obj-C', 'Protocol Buffer': 'Protobuf', 'Dockerfile': 'Docker' };
const shortLang = (name) => {
  const n = LANG_ALIAS[name] || name;
  return chars(n) > 12 ? `${[...n].slice(0, 11).join('')}…` : n;
};
const hexPoints = (cx, cy, r) =>
  Array.from({ length: 6 }, (_, i) => polar(cx, cy, r, i * 60 + 30).join(',')).join(' ');

async function dataUri(file) {
  try {
    const buf = await readFile(join(ROOT, file));
    const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[extname(file).toLowerCase()] || 'application/octet-stream';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    console.warn(`  ! image not found: ${file}`);
    return null;
  }
}

function svg(w, h, title, defs, body, css = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<style>${BASE_CSS}${css}</style>
<defs>${defs}</defs>
${body}
</svg>
`;
}

function brackets(x, y, w, h, len = 18, color = C.gold, width = 2, opacity = 1) {
  const d = `M${x} ${y + len}V${y}H${x + len}M${x + w - len} ${y}H${x + w}V${y + len}M${x + w} ${y + h - len}V${y + h}H${x + w - len}M${x + len} ${y + h}H${x}V${y + h - len}`;
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-opacity="${opacity}"/>`;
}

function hexPattern(id, s = 14, color = C.arc, opacity = 0.06) {
  const w = r2(Math.sqrt(3) * s), h = 3 * s, hw = r2(w / 2);
  const d = `M${hw} 0V${s / 2}L${w} ${s}V${2 * s}L${hw} ${2.5 * s}V${h}M${hw} ${2.5 * s}L0 ${2 * s}V${s}L${hw} ${s / 2}`;
  return `<pattern id="${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse"><path d="${d}" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="1"/></pattern>`;
}

// Dark HUD panel: background, hex mesh, glows, gradient border.
function panel(id, w, h, { rx = 18, glows = [] } = {}) {
  const defs = `
<clipPath id="${id}Clip"><rect width="${w}" height="${h}" rx="${rx}"/></clipPath>
<linearGradient id="${id}Bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B0E15"/><stop offset=".55" stop-color="${C.ink}"/><stop offset="1" stop-color="#110609"/></linearGradient>
<linearGradient id="${id}Bd" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.red}"/><stop offset=".5" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.red}"/></linearGradient>
${hexPattern(`${id}Hex`)}
${glows.map((g, i) => `<radialGradient id="${id}Gl${i}" cx="${g.x}" cy="${g.y}" r="${g.r}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${g.color}" stop-opacity="${g.o}"/><stop offset="1" stop-color="${g.color}" stop-opacity="0"/></radialGradient>`).join('')}`;
  const back = `
<g clip-path="url(#${id}Clip)">
<rect width="${w}" height="${h}" fill="url(#${id}Bg)"/>
${glows.map((g, i) => `<rect width="${w}" height="${h}" fill="url(#${id}Gl${i})"/>`).join('')}
<rect width="${w}" height="${h}" fill="url(#${id}Hex)"/>`;
  const front = `</g>
<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${rx - 1}" fill="none" stroke="url(#${id}Bd)" stroke-width="2" stroke-opacity=".9"/>
${brackets(12, 12, w - 24, h - 24, 22, C.gold, 2, 0.85)}`;
  return { defs, back, front };
}

// ─── Arc reactor ────────────────────────────────────────────────────
function reactor(id, cx, cy, R, { ticks = true, orbit = true, chase = true, glow = 1.7 } = {}) {
  const o = origin(cx, cy);
  const defs = `
<radialGradient id="${id}G" cx="${cx}" cy="${cy}" r="${r2(R * glow)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${C.arc}" stop-opacity=".5"/><stop offset=".42" stop-color="${C.arc}" stop-opacity=".14"/><stop offset="1" stop-color="${C.arc}" stop-opacity="0"/></radialGradient>
<radialGradient id="${id}M" cx="${cx}" cy="${cy}" r="${r2(R * 1.05)}" gradientUnits="userSpaceOnUse"><stop offset=".55" stop-color="#05070B"/><stop offset=".86" stop-color="#1A2130"/><stop offset=".95" stop-color="#3B4659"/><stop offset="1" stop-color="#10151E"/></radialGradient>
<radialGradient id="${id}K" cx="${cx}" cy="${cy}" r="${r2(R * 0.92)}" gradientUnits="userSpaceOnUse"><stop offset=".62" stop-color="${C.goldLight}"/><stop offset=".8" stop-color="#D9A441"/><stop offset="1" stop-color="#5E3C0F"/></radialGradient>
<radialGradient id="${id}C" cx="${cx}" cy="${cy}" r="${r2(R * 0.56)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".32" stop-color="${C.arcSoft}"/><stop offset=".7" stop-color="${C.arc}" stop-opacity=".85"/><stop offset="1" stop-color="${C.arcDeep}" stop-opacity="0"/></radialGradient>`;
  let b = `<circle cx="${cx}" cy="${cy}" r="${r2(R * glow)}" fill="url(#${id}G)" style="animation:pulse 3.4s ease-in-out infinite"/>`;
  if (ticks) {
    let d = '';
    for (let i = 0; i < 72; i++) {
      const [x0, y0] = polar(cx, cy, i % 6 ? R * 1.16 : R * 1.1, i * 5);
      const [x1, y1] = polar(cx, cy, R * 1.24, i * 5);
      d += `M${x0} ${y0}L${x1} ${y1}`;
    }
    b += `<path d="${d}" stroke="${C.arc}" stroke-opacity=".5" stroke-width="${r2(Math.max(1, R * 0.012))}" style="${o};animation:spin 80s linear infinite"/>`;
  }
  if (orbit) {
    b += `<circle cx="${cx}" cy="${cy}" r="${r2(R * 1.32)}" fill="none" stroke="${C.gold}" stroke-opacity=".55" stroke-width="${r2(Math.max(1, R * 0.014))}" stroke-dasharray="${r2(R * 0.02)} ${r2(R * 0.07)}" style="${o};animation:spinr 40s linear infinite"/>`;
    b += `<g style="${o};animation:spin 22s linear infinite"><path d="${arcPath(cx, cy, R * 1.44, 20, 70)}${arcPath(cx, cy, R * 1.44, 200, 250)}" fill="none" stroke="${C.redHot}" stroke-width="${r2(R * 0.03)}" stroke-linecap="round"/></g>`;
  }
  b += `<circle cx="${cx}" cy="${cy}" r="${r2(R * 1.04)}" fill="url(#${id}M)" stroke="#3B4659" stroke-width="${r2(R * 0.02)}"/>`;
  let segs = '', lights = '';
  for (let k = 0; k < 10; k++) {
    const p = sector(cx, cy, R * 0.62, R * 0.9, k * 36 + 3.5, k * 36 + 32.5);
    segs += `<path d="${p}"/>`;
    if (chase) lights += `<path d="${p}" style="animation:chase 1.8s linear infinite;animation-delay:${r2(k * 0.18 - 1.8)}s"/>`;
  }
  b += `<g fill="url(#${id}K)" stroke="${C.arc}" stroke-opacity=".35" stroke-width="${r2(Math.max(0.6, R * 0.01))}">${segs}</g>`;
  if (chase) b += `<g fill="${C.arcSoft}">${lights}</g>`;
  b += `<circle cx="${cx}" cy="${cy}" r="${r2(R * 0.58)}" fill="none" stroke="${C.arc}" stroke-opacity=".22" stroke-width="${r2(R * 0.16)}"/>`;
  b += `<circle cx="${cx}" cy="${cy}" r="${r2(R * 0.58)}" fill="none" stroke="${C.arc}" stroke-width="${r2(R * 0.045)}"/>`;
  b += `<circle cx="${cx}" cy="${cy}" r="${r2(R * 0.54)}" fill="url(#${id}C)" style="animation:pulse 2.4s ease-in-out infinite"/>`;
  const tri = [180, 300, 60].map((a) => polar(cx, cy, R * 0.36, a).join(',')).join(' ');
  b += `<polygon points="${tri}" fill="${C.arcSoft}" fill-opacity=".18" stroke="#FFFFFF" stroke-opacity=".9" stroke-width="${r2(Math.max(1, R * 0.035))}" stroke-linejoin="round"/>`;
  b += `<circle cx="${cx}" cy="${cy}" r="${r2(R * 0.1)}" fill="#FFFFFF"/>`;
  return { defs, body: `<g>${b}</g>` };
}

// ─── Typing terminal (SMIL, discrete steps → real typing feel) ─────
function typing(id, lines, x, y, fontSize, color, cursorColor) {
  const cw = fontSize * 0.6;
  const TYPE = 0.055, HOLD = 2.4, ERASE = 0.02, GAP = 0.45;
  let t = 0.6;
  const perLine = [];
  for (const line of lines) {
    const n = chars(line), ev = [[t, 0]];
    for (let k = 1; k <= n; k++) ev.push([t + k * TYPE, k * cw]);
    const hold = t + n * TYPE + HOLD;
    for (let j = 1; j <= n; j++) ev.push([hold + j * ERASE, (n - j) * cw]);
    perLine.push({ line, n, ev });
    t = hold + n * ERASE + GAP;
  }
  const T = t;
  const animate = (ev, attr, base) => {
    const kt = [0], vals = [base];
    for (const [time, w] of ev) {
      const k = Math.round((time / T) * 1e5) / 1e5;
      if (k <= kt[kt.length - 1]) { vals[vals.length - 1] = r2(base + w); continue; }
      kt.push(k); vals.push(r2(base + w));
    }
    return `<animate attributeName="${attr}" dur="${r2(T)}s" repeatCount="indefinite" calcMode="discrete" keyTimes="${kt.join(';')}" values="${vals.join(';')}"/>`;
  };
  let defs = '', body = '';
  perLine.forEach(({ line, n, ev }, i) => {
    defs += `<clipPath id="${id}${i}"><rect x="${x}" y="${r2(y - fontSize)}" width="${i ? 0 : r2(n * cw)}" height="${r2(fontSize * 1.45)}">${animate(ev, 'width', 0)}</rect></clipPath>`;
    body += `<text class="m" x="${x}" y="${y}" font-size="${fontSize}" fill="${color}" textLength="${r2(n * cw)}" lengthAdjust="spacingAndGlyphs" xml:space="preserve" clip-path="url(#${id}${i})">${esc(line)}</text>`;
  });
  const all = perLine.flatMap((l) => l.ev).sort((a, b) => a[0] - b[0]);
  body += `<rect x="${r2(x + (perLine[0]?.n ?? 0) * cw + 2)}" y="${r2(y - fontSize * 0.82)}" width="${r2(cw * 0.62)}" height="${r2(fontSize * 1.02)}" fill="${cursorColor}" style="animation:blink 1s step-end infinite">${animate(all, 'x', x)}</rect>`;
  return { defs, body };
}

// ─── 1. Header ──────────────────────────────────────────────────────
function buildHeader() {
  const W = 1200, H = 400, cx = 225, cy = 196, R = 94, X = 440, XR = 1150;
  const p = panel('hd', W, H, { glows: [
    { x: cx, y: cy, r: 520, color: '#7A0B12', o: 0.42 },
    { x: 1080, y: 420, r: 420, color: C.goldDeep, o: 0.14 },
  ] });
  const re = reactor('hr', cx, cy, R);
  const ty = typing('ty', config.typing, X + 46, 244, 20, C.arc, C.arc);
  const nameLen = XR - X;

  let chipsSvg = '', cxp = X;
  for (const [label, value] of config.chips) {
    const lw = chars(label) * 7.2, vw = chars(value) * 9;
    const w = r2(14 + lw + 10 + vw + 14);
    if (cxp + w > XR) break;
    chipsSvg += `<g style="animation:rise .6s ease-out both;animation-delay:${r2(0.35 + (cxp - X) / 900)}s">
<rect x="${r2(cxp)}" y="286" width="${w}" height="36" rx="4" fill="#0B1016" stroke="${C.arc}" stroke-opacity=".28"/>
<path d="M${r2(cxp)} 296V286H${r2(cxp + 10)}M${r2(cxp + w)} 312V322H${r2(cxp + w - 10)}" fill="none" stroke="${C.gold}" stroke-width="2"/>
<text class="m" x="${r2(cxp + 14)}" y="309" font-size="12" fill="${C.muted}" textLength="${r2(lw)}" lengthAdjust="spacingAndGlyphs">${esc(label)}</text>
<text class="m" x="${r2(cxp + 24 + lw)}" y="310" font-size="15" font-weight="700" fill="${C.gold}" textLength="${r2(vw)}" lengthAdjust="spacingAndGlyphs">${esc(value)}</text></g>`;
    cxp += w + 12;
  }

  let ruler = '';
  for (let x = X; x <= XR; x += 10) ruler += `M${x} 352v${(x - X) % 50 ? 4 : 9}`;

  const defs = `${p.defs}${re.defs}${ty.defs}
<linearGradient id="goldText" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF4C7"/><stop offset=".5" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.goldDeep}"/></linearGradient>
<linearGradient id="shine" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="220" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/><animateTransform attributeName="gradientTransform" type="translate" values="100 0;1250 0;1250 0" keyTimes="0;.42;1" dur="6s" repeatCount="indefinite"/></linearGradient>
<linearGradient id="scanG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.arc}" stop-opacity="0"/><stop offset=".85" stop-color="${C.arc}" stop-opacity=".07"/><stop offset="1" stop-color="${C.arc}" stop-opacity=".22"/></linearGradient>
<linearGradient id="rulerG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.arc}" stop-opacity=".5"/><stop offset="1" stop-color="${C.arc}" stop-opacity=".05"/></linearGradient>`;

  const body = `${p.back}
<path d="M960 0L1030 70H1200M1060 400L1100 350H1200M0 330L60 400" fill="none" stroke="${C.gold}" stroke-opacity=".12" stroke-width="1.5"/>
<path d="M975 0L1037 62H1200" fill="none" stroke="${C.red}" stroke-opacity=".35" stroke-width="3"/>
<rect x="0" y="0" width="${W}" height="120" fill="url(#scanG)" style="animation:scan 7s linear infinite"/>
${re.body}
<text class="m" x="${cx}" y="376" font-size="12" fill="${C.muted}" text-anchor="middle" letter-spacing="2">ARC REACTOR · 3 GJ/s</text>
<circle cx="${X + 6}" cy="47" r="5" fill="${C.redHot}" style="animation:blink 1.4s step-end infinite"/>
<text class="m" x="${X + 20}" y="52" font-size="14" letter-spacing="1.5"><tspan fill="${C.arc}">SYSTEM ONLINE</tspan><tspan fill="${C.muted}">  //  J.A.R.V.I.S.</tspan></text>
<text class="d" x="${XR}" y="52" font-size="15" fill="${C.gold}" fill-opacity=".9" text-anchor="end" letter-spacing="4">${esc(config.company)}</text>
<g>
<text class="d" x="${X + 3}" y="137" font-size="64" fill="${C.redDeep}" textLength="${nameLen}" lengthAdjust="spacingAndGlyphs">${esc(config.name)}</text>
<text class="d" x="${X}" y="134" font-size="64" fill="url(#goldText)" textLength="${nameLen}" lengthAdjust="spacingAndGlyphs">${esc(config.name)}</text>
<text class="d" x="${X}" y="134" font-size="64" fill="url(#shine)" textLength="${nameLen}" lengthAdjust="spacingAndGlyphs">${esc(config.name)}</text>
</g>
<rect x="${X}" y="150" width="150" height="4" fill="${C.red}"/>
<path d="M${X + 160} 152H${XR - 44}" stroke="${C.gold}" stroke-opacity=".55" stroke-width="1.5"/>
<path d="M${XR - 36} 146l6 6-6 6M${XR - 24} 146l6 6-6 6M${XR - 12} 146l6 6-6 6" fill="none" stroke="${C.redHot}" stroke-width="2"/>
<text class="dl" x="${X}" y="188" font-size="20" fill="${C.text}" fill-opacity=".88" letter-spacing="3" textLength="${Math.min(nameLen, chars(config.role) * 14.6)}" lengthAdjust="spacing">${esc(config.role)}</text>
<rect x="${X}" y="208" width="${nameLen}" height="56" rx="6" fill="#0A1119" fill-opacity=".92" stroke="${C.arc}" stroke-opacity=".3"/>
<rect x="${X}" y="208" width="4" height="56" fill="${C.red}"/>
<text class="m" x="${X + 22}" y="244" font-size="20" font-weight="700" fill="${C.redHot}">›</text>
${ty.body}
${chipsSvg}
<path d="M${X} 352H${XR}" stroke="${C.line}" stroke-width="1"/>
<path d="${ruler}" stroke="url(#rulerG)" stroke-width="1"/>
<path d="M${X} 352H${XR}" stroke="${C.arc}" stroke-width="2" stroke-dasharray="70 640" style="animation:flow 5s linear infinite"/>
<text class="m" x="${XR}" y="378" font-size="12" fill="${C.arc}" fill-opacity=".8" text-anchor="end" letter-spacing="2">ALL SYSTEMS NOMINAL</text>
<text class="m" x="${X}" y="378" font-size="12" fill="${C.muted}" letter-spacing="2">ARMOR 100% · REPULSORS READY · FLIGHT OK</text>
${p.front}`;
  return svg(W, H, `${config.name} — ${config.role.replace(/\s+/g, ' ')}`, defs, body);
}

// ─── 2. Pilot facial-recognition card ───────────────────────────────
async function buildPilot() {
  const W = 400, H = 500, PX = 20, PY = 48, S = 360;
  const pc = config.pilot;
  const img = await dataUri(pc.photo);
  const p = panel('pl', W, H, { rx: 16, glows: [{ x: 200, y: 520, r: 380, color: '#7A0B12', o: 0.5 }] });
  const fx = r2(PX + pc.face.x * S), fy = r2(PY + pc.face.y * S), fw = r2(pc.face.w * S), fh = r2(pc.face.h * S);
  const fcx = r2(fx + fw / 2), fcy = r2(fy + fh / 2);
  const L = pc.landmarks.map(([x, y]) => [r2(PX + x * S), r2(PY + y * S)]);
  const mesh = [[0, 1], [0, 2], [1, 2], [1, 4], [2, 4], [1, 3], [2, 5], [3, 6], [5, 6], [4, 6], [6, 7], [3, 7], [5, 7]]
    .filter(([a, b]) => L[a] && L[b])
    .map(([a, b]) => `M${L[a][0]} ${L[a][1]}L${L[b][0]} ${L[b][1]}`).join('');
  let grid = '';
  for (let i = 40; i < S; i += 40) grid += `M${PX + i} ${PY}v${S}M${PX} ${PY + i}h${S}`;
  let ticks = '';
  for (let yy = PY + 12; yy < PY + S; yy += 12) ticks += `M${PX + S - 10} ${yy}h${(yy - PY) % 60 ? 4 : 8}`;

  const defs = `${p.defs}
<clipPath id="pc"><polygon points="${PX + 16},${PY} ${PX + S},${PY} ${PX + S},${PY + S - 16} ${PX + S - 16},${PY + S} ${PX},${PY + S} ${PX},${PY + 16}"/></clipPath>
<linearGradient id="tint" x1="0" y1="0" x2="0" y2="1"><stop offset=".35" stop-color="${C.redDeep}" stop-opacity="0"/><stop offset="1" stop-color="${C.redDeep}" stop-opacity=".55"/></linearGradient>
<radialGradient id="vig" cx=".5" cy=".45" r=".72"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></radialGradient>
<pattern id="lines" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#000" fill-opacity=".22"/></pattern>
<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.arc}" stop-opacity="0"/><stop offset=".9" stop-color="${C.arc}" stop-opacity=".22"/><stop offset="1" stop-color="${C.arc}" stop-opacity=".9"/></linearGradient>`;

  const photo = img
    ? `<image href="${img}" x="${PX}" y="${PY}" width="${S}" height="${S}" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect x="${PX}" y="${PY}" width="${S}" height="${S}" fill="#111822"/>`;

  const body = `${p.back}
<circle cx="24" cy="27" r="5" fill="${C.arc}" style="animation:pulse 1.6s ease-in-out infinite"/>
<text class="m" x="36" y="32" font-size="13" fill="${C.arc}" letter-spacing="2">FACIAL RECOGNITION</text>
<circle cx="${W - 74}" cy="27" r="4.5" fill="${C.redHot}" style="animation:blink 1.2s step-end infinite"/>
<text class="m" x="${W - 22}" y="32" font-size="13" fill="${C.redHot}" text-anchor="end" letter-spacing="2">LIVE</text>
<g clip-path="url(#pc)">
${photo}
<rect x="${PX}" y="${PY}" width="${S}" height="${S}" fill="url(#tint)"/>
<rect x="${PX}" y="${PY}" width="${S}" height="${S}" fill="url(#vig)"/>
<rect x="${PX}" y="${PY}" width="${S}" height="${S}" fill="url(#lines)"/>
<path d="${grid}" stroke="${C.arc}" stroke-opacity=".07"/>
<path d="M${PX} ${fcy}H${fx}M${r2(fx + fw)} ${fcy}H${PX + S}M${fcx} ${PY}V${fy}M${fcx} ${r2(fy + fh)}V${PY + S}" stroke="${C.arc}" stroke-opacity=".45" stroke-dasharray="4 4"/>
<g style="animation:fade .6s ease-out 1.1s both">
<path d="${mesh}" stroke="${C.arc}" stroke-opacity=".5" stroke-width="1" fill="none"/>
${L.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="2.6" fill="${C.arc}" style="animation:pulse 1.4s ease-in-out infinite;animation-delay:-${r2(i * 0.17)}s"/>`).join('')}
</g>
<g style="${origin(fcx, fcy)};animation:lock 1.1s cubic-bezier(.2,.8,.2,1) both">${brackets(fx, fy, fw, fh, 16, C.arc, 2.5)}</g>
<g style="animation:fade .4s ease-out 1.2s both">
<rect x="${fx}" y="${r2(fy - 22)}" width="116" height="17" fill="${C.arc}"/>
<text class="m" x="${r2(fx + 6)}" y="${r2(fy - 9)}" font-size="11" font-weight="700" fill="${C.ink}" letter-spacing="1">TARGET LOCKED</text>
</g>
<rect x="${PX}" y="${PY - 70}" width="${S}" height="70" fill="url(#beam)" style="animation:scanp 3.6s ease-in-out infinite alternate"/>
<path d="${ticks}" stroke="${C.arc}" stroke-opacity=".6"/>
</g>
${brackets(PX - 6, PY - 6, S + 12, S + 12, 14, C.gold, 2)}
<text class="m" x="${PX}" y="436" font-size="12" fill="${C.muted}" letter-spacing="2">PILOT</text>
<text class="m" x="${PX + S}" y="436" font-size="13" text-anchor="end" letter-spacing="1"><tspan fill="${C.muted}">MATCH </tspan><tspan fill="${C.arc}" font-weight="700">${esc(pc.match)}</tspan></text>
<text class="d" x="${PX}" y="466" font-size="27" fill="${C.gold}" textLength="${S}" lengthAdjust="spacingAndGlyphs">${esc(config.name)}</text>
<text class="m" x="${PX + 2}" y="488" font-size="11.5" fill="${C.muted}" textLength="${S - 4}" lengthAdjust="spacingAndGlyphs">CALLSIGN ${esc(pc.callsign)} · CLEARANCE ${esc(pc.clearance)}</text>
${p.front}`;
  return svg(W, H, `J.A.R.V.I.S. facial recognition — ${config.name}`, defs, body,
    `@keyframes scanp{from{transform:translateY(0)}to{transform:translateY(${S + 70}px)}}`);
}

// ─── 3. Section title bars (dark + light) ───────────────────────────
function buildSection(sec, mode) {
  const W = 1200, H = 80, dark = mode === 'dark';
  const k = dark
    ? { title: C.gold, no: C.redHot, dim: '#6B7488', line: C.gold, hi: C.arc, hexFill: C.panel, hexStroke: C.gold, core: C.arc, chev: C.redHot, base0: C.red, base1: C.gold }
    : { title: '#8E0A14', no: '#B7892A', dim: '#6B7280', line: '#B7892A', hi: '#0E7490', hexFill: '#FFFFFF', hexStroke: '#B7892A', core: '#0891B2', chev: '#C1121F', base0: '#C1121F', base1: '#D4A24C' };
  const titleW = chars(sec.title) * 24.5;
  const tx = 164, tagX = r2(tx + titleW + 22), tag = `[ ${sec.tag} ]`, tagW = chars(tag) * 8.4;
  const lineX = r2(tagX + tagW + 22);
  const defs = `<linearGradient id="bl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${k.base0}"/><stop offset=".45" stop-color="${k.base1}"/><stop offset="1" stop-color="${k.base1}" stop-opacity="0"/></linearGradient>`;
  const body = `
<polygon points="${hexPoints(42, 40, 22)}" fill="${k.hexFill}" stroke="${k.hexStroke}" stroke-width="2"/>
<circle cx="42" cy="40" r="12" fill="none" stroke="${k.core}" stroke-opacity=".45" stroke-width="1.5" stroke-dasharray="3 3" style="${origin(42, 40)};animation:spin 10s linear infinite"/>
<circle cx="42" cy="40" r="6.5" fill="${k.core}" style="animation:pulse 2s ease-in-out infinite"/>
<text class="d" x="80" y="53" font-size="34" fill="${k.no}">${esc(sec.no)}</text>
<text class="d" x="124" y="52" font-size="28" fill="${k.dim}">//</text>
<text class="d" x="${tx}" y="53" font-size="34" fill="${k.title}" textLength="${r2(titleW)}" lengthAdjust="spacingAndGlyphs">${esc(sec.title)}</text>
<text class="m" x="${tagX}" y="51" font-size="14" fill="${k.dim}" textLength="${r2(tagW)}" lengthAdjust="spacingAndGlyphs">${esc(tag)}</text>
<path d="M${lineX} 44H1146" stroke="${k.line}" stroke-opacity=".45" stroke-width="1.5"/>
<path d="M${lineX} 44H1146" stroke="${k.hi}" stroke-width="2.5" stroke-dasharray="46 500" style="animation:flow 4.5s linear infinite"/>
<path d="M1152 38l6 6-6 6M1164 38l6 6-6 6M1176 38l6 6-6 6" fill="none" stroke="${k.chev}" stroke-width="2.2"/>
<rect x="20" y="72" width="1160" height="2" fill="url(#bl)"/>`;
  return svg(W, H, `${sec.no} // ${sec.title} — ${sec.tag}`, defs, body);
}

// ─── 4. Bullet icons ────────────────────────────────────────────────
function buildIcon(kind) {
  const shapes = {
    mission: `<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" fill="none" stroke="${C.gold}" stroke-width="2" stroke-linejoin="round"/>`,
    ai: `<rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="${C.gold}" stroke-width="2"/><rect x="9" y="9" width="6" height="6" fill="${C.arc}" style="animation:pulse 1.6s ease-in-out infinite"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" stroke="${C.gold}" stroke-width="2" stroke-linecap="round"/>`,
    comms: `<circle cx="12" cy="12" r="2.4" fill="${C.arc}"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49" fill="none" stroke="${C.gold}" stroke-width="2" stroke-linecap="round" style="animation:pulse 1.4s ease-in-out infinite"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" fill="none" stroke="${C.gold}" stroke-width="2" stroke-linecap="round" style="animation:breathe 1.4s ease-in-out infinite;animation-delay:-.7s"/>`,
  };
  let inner, defs = '';
  if (kind === 'reactor') {
    const re = reactor('ir', 14, 14, 8.2, { ticks: false, orbit: false, glow: 1.6 });
    defs = re.defs; inner = re.body;
  } else {
    inner = `<g transform="translate(5 5) scale(.75)">${shapes[kind]}</g>`;
  }
  const body = `<rect x=".75" y=".75" width="26.5" height="26.5" rx="7" fill="${C.panel}" stroke="${C.gold}" stroke-opacity=".55" stroke-width="1.5"/>${inner}`;
  return svg(28, 28, `${kind} icon`, defs, body);
}

// ─── 5. Suit status log (code cycle) ────────────────────────────────
async function buildStatusLog() {
  const W = 1200, H = 350, cols = [210, 600, 990], cy = 130;
  const p = panel('sl', W, H, { glows: [{ x: 600, y: 140, r: 600, color: '#7A0B12', o: 0.25 }] });
  const fills = [0.25, 1, 0.62];
  let defs = p.defs, body = p.back;
  for (let i = 0; i < config.statusLog.length && i < 3; i++) {
    const s = config.statusLog[i], x = cols[i], tone = TONE[s.tone] || C.gold;
    const img = await dataUri(s.image);
    const circ = 2 * Math.PI * 84, dash = r2(circ * fills[i]);
    defs += `<radialGradient id="sg${i}" cx="${x}" cy="${cy}" r="96" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${tone}" stop-opacity=".28"/><stop offset="1" stop-color="${tone}" stop-opacity="0"/></radialGradient>`;
    body += `
<circle cx="${x}" cy="${cy}" r="96" fill="url(#sg${i})" style="animation:pulse 2.6s ease-in-out infinite;animation-delay:-${i * 0.8}s"/>
<circle cx="${x}" cy="${cy}" r="96" fill="none" stroke="${tone}" stroke-opacity=".55" stroke-width="1.5" stroke-dasharray="2 8" style="${origin(x, cy)};animation:${i % 2 ? 'spinr' : 'spin'} 30s linear infinite"/>
<circle cx="${x}" cy="${cy}" r="76" fill="${C.panel}" stroke="${C.line}" stroke-width="2"/>
<circle cx="${x}" cy="${cy}" r="84" fill="none" stroke="${C.track}" stroke-width="5"/>
<circle cx="${x}" cy="${cy}" r="84" fill="none" stroke="${tone}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${dash} ${r2(circ)}" transform="rotate(-90 ${x} ${cy})" style="animation:draw${i} 1.6s ease-out .3s both"/>
${img ? `<image href="${img}" x="${x - 58}" y="${cy - 58}" width="116" height="116"/>` : ''}
<text class="m" x="${x - 100}" y="42" font-size="13" fill="${C.muted}" letter-spacing="2">0${i + 1}</text>
${(() => {
      const tw = chars(s.state) * 20, x0 = r2(x - (tw + 22) / 2);
      return `<circle cx="${x0 + 6}" cy="245" r="6" fill="${tone}" style="animation:blink ${1 + i * 0.35}s step-end infinite"/>
<text class="d" x="${x0 + 22}" y="254" font-size="27" fill="${tone}" textLength="${tw}" lengthAdjust="spacingAndGlyphs">${esc(s.state)}</text>`;
    })()}
<text class="m" x="${x}" y="286" font-size="15" fill="${C.text}" fill-opacity=".8" text-anchor="middle">${esc(s.text)}</text>`;
  }
  for (let i = 0; i < 2; i++) {
    const a = cols[i] + 112, b = cols[i + 1] - 112;
    body += `<path d="M${a} ${cy}H${b - 12}" stroke="${C.gold}" stroke-opacity=".3" stroke-width="2"/>
<path d="M${a} ${cy}H${b - 12}" stroke="${C.arc}" stroke-width="2.5" stroke-dasharray="18 22" style="animation:flow 3s linear infinite"/>
<path d="M${b - 16} ${cy - 9}l10 9-10 9" fill="none" stroke="${C.redHot}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  body += `<path d="M${cols[2]} 300V318H${cols[0]}V306" fill="none" stroke="${C.muted}" stroke-opacity=".45" stroke-width="1.5" stroke-dasharray="6 6" style="animation:flow 12s linear infinite reverse"/>
<path d="M${cols[0] - 7} 311l7-8 7 8" fill="none" stroke="${C.muted}" stroke-opacity=".7" stroke-width="1.5"/>
<rect x="520" y="308" width="160" height="20" fill="${C.ink}"/>
<text class="m" x="600" y="323" font-size="12" fill="${C.arc}" text-anchor="middle" letter-spacing="2">∞ REBOOT · REPEAT</text>
${p.front}`;
  const css = fills.map((f, i) => `@keyframes draw${i}{from{stroke-dasharray:0 ${r2(2 * Math.PI * 84)}}}`).join('');
  return svg(W, H, 'Suit status log — broken, fixed, works but nobody knows why', defs, body, css);
}

// ─── 6. Footer ──────────────────────────────────────────────────────
function buildFooter() {
  const W = 1200, H = 220, cx = 600, cy = 78;
  const p = panel('ft', W, H, { glows: [{ x: cx, y: cy, r: 460, color: '#7A0B12', o: 0.4 }] });
  const re = reactor('fr', cx, cy, 30, { glow: 2.2 });
  const m = config.footer.motto, mw = Math.min(1000, chars(m) * 27);
  const defs = `${p.defs}${re.defs}
<linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF4C7"/><stop offset=".5" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.goldDeep}"/></linearGradient>
<linearGradient id="bmL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.arc}" stop-opacity="0"/><stop offset="1" stop-color="${C.arc}" stop-opacity=".85"/></linearGradient>
<linearGradient id="bmR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="${C.arc}" stop-opacity="0"/><stop offset="1" stop-color="${C.arc}" stop-opacity=".85"/></linearGradient>
<linearGradient id="fshine" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="200" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/><animateTransform attributeName="gradientTransform" type="translate" values="100 0;1100 0;1100 0" keyTimes="0;.45;1" dur="5.5s" repeatCount="indefinite"/></linearGradient>`;
  const body = `${p.back}
<path d="M60 ${cy}H${cx - 64}" stroke="url(#bmL)" stroke-width="2"/>
<path d="M${cx + 64} ${cy}H1140" stroke="url(#bmR)" stroke-width="2"/>
<path d="M60 ${cy}H${cx - 64}" stroke="${C.arcSoft}" stroke-width="3" stroke-dasharray="30 170" style="animation:flow 3s linear infinite reverse"/>
<path d="M${cx + 64} ${cy}H1140" stroke="${C.arcSoft}" stroke-width="3" stroke-dasharray="30 170" style="animation:flow 3s linear infinite"/>
<path d="M300 ${cy - 10}H${cx - 90}M300 ${cy + 10}H${cx - 90}M${cx + 90} ${cy - 10}H900M${cx + 90} ${cy + 10}H900" stroke="${C.gold}" stroke-opacity=".3"/>
${re.body}
<text class="d" x="${cx}" y="160" font-size="38" fill="${C.redDeep}" text-anchor="middle" textLength="${mw}" lengthAdjust="spacingAndGlyphs" transform="translate(3 3)">${esc(m)}</text>
<text class="d" x="${cx}" y="160" font-size="38" fill="url(#fg)" text-anchor="middle" textLength="${mw}" lengthAdjust="spacingAndGlyphs">${esc(m)}</text>
<text class="d" x="${cx}" y="160" font-size="38" fill="url(#fshine)" text-anchor="middle" textLength="${mw}" lengthAdjust="spacingAndGlyphs">${esc(m)}</text>
<text class="m" x="${cx}" y="194" font-size="13" fill="${C.muted}" text-anchor="middle" letter-spacing="2">${esc(config.footer.signoff)}</text>
${p.front}`;
  return svg(W, H, `${m} — ${config.footer.signoff}`, defs, body);
}

// ─── 7. Live telemetry (GitHub API) ─────────────────────────────────
async function gql(query, variables = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'jarvis-hud' },
        body: JSON.stringify({ query, variables }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.errors) throw new Error(`GitHub API ${res.status}: ${JSON.stringify(json.errors || json.message || json)}`);
      return json.data;
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

async function fetchStats(login) {
  const Q = `query($login:String!,$cursor:String){user(login:$login){createdAt followers{totalCount} pullRequests{totalCount} issues{totalCount}
    repositories(first:100,after:$cursor,ownerAffiliations:OWNER,isFork:false,privacy:PUBLIC){totalCount pageInfo{hasNextPage endCursor}
    nodes{name stargazerCount languages(first:10,orderBy:{field:SIZE,direction:DESC}){edges{size node{name}}}}}
    contributionsCollection{contributionCalendar{totalContributions}}}}`;
  let cursor = null, user, repos = [];
  do {
    const d = await gql(Q, { login, cursor });
    if (!d.user) throw new Error(`user "${login}" not found`);
    user = d.user;
    repos.push(...user.repositories.nodes);
    cursor = user.repositories.pageInfo.hasNextPage ? user.repositories.pageInfo.endCursor : null;
  } while (cursor);

  // One contribution calendar per year, since the account was created.
  const now = new Date(), firstYear = new Date(user.createdAt).getUTCFullYear(), thisYear = now.getUTCFullYear();
  const QY = `query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){
    totalCommitContributions restrictedContributionsCount contributionCalendar{totalContributions weeks{contributionDays{date contributionCount}}}}}}`;
  let years = [];
  for (let y = firstYear; y <= thisYear; y++) {
    const to = y === thisYear ? now.toISOString() : `${y}-12-31T23:59:59Z`;
    const c = (await gql(QY, { login, from: `${y}-01-01T00:00:00Z`, to })).user.contributionsCollection;
    const days = c.contributionCalendar.weeks.flatMap((w) => w.contributionDays).filter((d) => d.date.startsWith(String(y)));
    years.push({
      year: y, total: c.contributionCalendar.totalContributions, commits: c.totalCommitContributions,
      restricted: c.restrictedContributionsCount,
      weeks: c.contributionCalendar.weeks.map((w) => w.contributionDays.reduce((a, d) => a + d.contributionCount, 0)),
      days,
    });
  }
  const allDays = years.flatMap((y) => y.days).sort((a, b) => a.date.localeCompare(b.date));
  let longest = 0, run = 0;
  for (const d of allDays) { run = d.contributionCount > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  let i = allDays.length - 1, current = 0;
  if (i >= 0 && allDays[i].contributionCount === 0) i--; // today may simply not have a commit yet
  for (; i >= 0 && allDays[i].contributionCount > 0; i--) current++;
  const activeDays = allDays.filter((d) => d.contributionCount > 0).length;
  while (years.length > 1 && years[0].total === 0) years.shift(); // drop empty years before the first contribution

  // Languages by bytes across owned, public, non-fork repos.
  const skip = new Set(config.stats.excludeLanguages.map((s) => s.toLowerCase()));
  const skipRepo = new Set(config.stats.excludeRepos.map((s) => s.toLowerCase()));
  const kept = repos.filter((r) => !skipRepo.has(r.name.toLowerCase()));
  const bytes = new Map();
  for (const r of kept) for (const e of r.languages.edges) {
    if (skip.has(e.node.name.toLowerCase())) continue;
    bytes.set(e.node.name, (bytes.get(e.node.name) || 0) + e.size);
  }
  const totalBytes = [...bytes.values()].reduce((a, b) => a + b, 0) || 1;
  const sorted = [...bytes.entries()].sort((a, b) => b[1] - a[1]);
  const langs = sorted.slice(0, config.stats.topLanguages).map(([name, b]) => ({ name, pct: (b / totalBytes) * 100 }));
  const rest = sorted.slice(config.stats.topLanguages).reduce((a, [, b]) => a + b, 0);
  if (rest > 0) langs.push({ name: 'Other', pct: (rest / totalBytes) * 100 });

  const contributions = years.reduce((a, y) => a + y.total, 0);
  const stars = kept.reduce((a, r) => a + r.stargazerCount, 0);
  const score = contributions + stars * 5 + user.pullRequests.totalCount * 2 + user.issues.totalCount + user.followers.totalCount * 2;
  const mark = Math.max(1, Math.min(85, Math.round((85 * Math.log10(1 + score)) / Math.log10(1 + 20000))));

  return {
    // key: [label, value, icon, note]
    metrics: {
      contributions: ['CONTRIBUTIONS', contributions, 'calendar', 'ALL TIME'],
      contributionsYear: ['CONTRIBUTIONS', user.contributionsCollection.contributionCalendar.totalContributions, 'calendar', 'LAST 12 MO'],
      commits: ['COMMITS', years.reduce((a, y) => a + y.commits, 0), 'commit', 'PUBLIC'],
      classified: ['CLASSIFIED OPS', years.reduce((a, y) => a + y.restricted, 0), 'lock', 'PRIVATE'],
      prs: ['PULL REQUESTS', user.pullRequests.totalCount, 'pr', 'OPENED'],
      issues: ['ISSUES', user.issues.totalCount, 'issue', 'OPENED'],
      stars: ['STARS', stars, 'star', 'EARNED'],
      repos: ['REPOSITORIES', user.repositories.totalCount, 'repo', 'PUBLIC'],
      followers: ['FOLLOWERS', user.followers.totalCount, 'users', 'ALLIES'],
      languages: ['LANGUAGES', bytes.size, 'code', 'IN USE'],
      years: ['YEARS ACTIVE', Math.max(1, thisYear - firstYear), 'clock', `SINCE ${firstYear}`],
      activeDays: ['ACTIVE DAYS', activeDays, 'flame', 'ALL TIME'],
    },
    years, langs, mark, longest, current, activeDays, contributions,
    date: now.toISOString().slice(0, 10), thisYear,
  };
}

const ICONS = {
  calendar: `<rect x="1.5" y="3" width="15" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M1.5 7h15M5.5 1v4M12.5 1v4" stroke="currentColor" stroke-width="1.6"/><rect x="5" y="9.5" width="3" height="3" fill="currentColor"/>`,
  commit: `<circle cx="9" cy="9" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M0 9h5.4M12.6 9H18" stroke="currentColor" stroke-width="1.8"/>`,
  pr: `<circle cx="4" cy="3.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="4" cy="14.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="14" cy="14.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 5.7v6.6M14 12.3V7a3 3 0 0 0-3-3H8M10 1.5L7.5 4 10 6.5" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
  issue: `<circle cx="9" cy="9" r="7.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="9" r="1.8" fill="currentColor"/>`,
  star: `<path d="M9 1.2l2.4 5 5.4.7-4 3.8 1 5.4L9 13.5l-4.8 2.6 1-5.4-4-3.8 5.4-.7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`,
  repo: `<path d="M3 2.5A1.5 1.5 0 0 1 4.5 1H15v13H4.5A1.5 1.5 0 0 0 3 15.5zM3 15.5A1.5 1.5 0 0 0 4.5 17H15v-3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6.5 4.5h5" stroke="currentColor" stroke-width="1.6"/>`,
  users: `<circle cx="6.5" cy="5.5" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M1 16c0-3 2.5-5 5.5-5s5.5 2 5.5 5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 2.8a3 3 0 0 1 0 5.4M14.5 11.4c1.6.8 2.5 2.4 2.5 4.6" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
  code: `<path d="M5.5 4.5L1 9l4.5 4.5M12.5 4.5L17 9l-4.5 4.5M10.5 2l-3 14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`,
  clock: `<circle cx="9" cy="9" r="7.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 4.5V9l3 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  flame: `<path d="M9 1c1 3.5 5 5 5 9.5A5 5 0 0 1 4 10.5C4 8 5.5 6.8 6.5 5.5c.3 1.8 1.2 2.8 2.2 3C8.2 6 8 3.5 9 1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`,
  shield: `<path d="M9 1l7 3v5c0 4-3 7-7 8.5C5 16 2 13 2 9V4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`,
  lock: `<rect x="2.5" y="8" width="13" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5.5 8V5.5a3.5 3.5 0 0 1 7 0V8" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="12.5" r="1.4" fill="currentColor"/>`,
};

function buildDiagnostics(s) {
  const W = 1200, H = 500;
  const p = panel('dg', W, H, { glows: [
    { x: 195, y: 285, r: 420, color: '#7A0B12', o: 0.4 },
    { x: 1050, y: 60, r: 380, color: C.goldDeep, o: 0.1 },
  ] });
  const cx = 195, cy = 285, RR = 112;
  const defs = `${p.defs}
<radialGradient id="dcore" cx="${cx}" cy="${cy}" r="86" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${C.arc}" stop-opacity=".32"/><stop offset=".7" stop-color="${C.arc}" stop-opacity=".08"/><stop offset="1" stop-color="${C.arc}" stop-opacity="0"/></radialGradient>
<linearGradient id="sweep" gradientUnits="userSpaceOnUse" x1="${cx}" y1="${cy - 140}" x2="${cx + 80}" y2="${cy - 110}"><stop offset="0" stop-color="${C.arc}" stop-opacity=".3"/><stop offset="1" stop-color="${C.arc}" stop-opacity="0"/></linearGradient>
<linearGradient id="bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.red}"/></linearGradient>
<linearGradient id="barNow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.arc}"/><stop offset="1" stop-color="${C.arcDeep}" stop-opacity=".5"/></linearGradient>`;
  let css = '';

  // Arc-reactor ring = language share
  let ring = `<circle cx="${cx}" cy="${cy}" r="${RR}" fill="none" stroke="${C.track}" stroke-width="26"/>`;
  let a = 0;
  s.langs.forEach((l, i) => {
    const span = (l.pct / 100) * 360, gap = s.langs.length > 1 ? Math.min(1.6, span / 4) : 0;
    const a0 = a + gap, a1 = a + span - gap;
    a += span;
    if (a1 - a0 < 0.3) return;
    const color = l.name === 'Other' ? '#4A5568' : LANG_COLORS[i % LANG_COLORS.length];
    const len = r2((Math.PI * 2 * RR * (a1 - a0)) / 360);
    const d = a1 - a0 >= 359.9 ? `M${cx} ${cy - RR}a${RR} ${RR} 0 1 1 0 ${2 * RR}a${RR} ${RR} 0 1 1 0 ${-2 * RR}` : arcPath(cx, cy, RR, a0, a1);
    css += `@keyframes seg${i}{from{stroke-dashoffset:${len}}}`;
    ring += `<path d="${d}" fill="none" stroke="${color}" stroke-width="26" stroke-dasharray="${len} ${len}" style="animation:seg${i} .9s ease-out ${r2(0.2 + i * 0.12)}s both"/>`;
  });
  let tk = '';
  for (let i = 0; i < 60; i++) {
    const [x0, y0] = polar(cx, cy, i % 5 ? 136 : 131, i * 6), [x1, y1] = polar(cx, cy, 142, i * 6);
    tk += `M${x0} ${y0}L${x1} ${y1}`;
  }
  const lead = s.langs[0] || { name: 'N/A', pct: 0 };
  const reactorSvg = `
<path d="${tk}" stroke="${C.arc}" stroke-opacity=".45" style="${origin(cx, cy)};animation:spin 90s linear infinite"/>
<g style="${origin(cx, cy)};animation:spin 6s linear infinite"><path d="${sector(cx, cy, 0, 146, 0, 40)}" fill="url(#sweep)"/></g>
${ring}
<circle cx="${cx}" cy="${cy}" r="92" fill="none" stroke="${C.arc}" stroke-opacity=".7" stroke-width="2"/>
<circle cx="${cx}" cy="${cy}" r="86" fill="url(#dcore)" style="animation:pulse 2.8s ease-in-out infinite"/>
<text class="m" x="${cx}" y="${cy - 28}" font-size="11" fill="${C.muted}" text-anchor="middle" letter-spacing="2">PRIMARY CORE</text>
<text class="d" x="${cx}" y="${cy + 14}" font-size="44" fill="${C.text}" text-anchor="middle">${Math.round(lead.pct)}<tspan font-size="24" fill="${C.muted}">%</tspan></text>
<text class="m" x="${cx}" y="${cy + 40}" font-size="14" fill="${C.gold}" text-anchor="middle" letter-spacing="1" font-weight="700">${esc(shortLang(lead.name).toUpperCase())}</text>`;

  // Legend
  const maxPct = Math.max(...s.langs.map((l) => l.pct), 1);
  const step = s.langs.length > 1 ? Math.min(44, 262 / (s.langs.length - 1)) : 0;
  const legend = s.langs.map((l, i) => {
    const y = r2(154 + i * step), color = l.name === 'Other' ? '#4A5568' : LANG_COLORS[i % LANG_COLORS.length];
    const bw = r2((178 * l.pct) / maxPct);
    return `<g style="animation:rise .5s ease-out ${r2(0.3 + i * 0.08)}s both">
<rect x="365" y="${r2(y - 11)}" width="9" height="9" fill="${color}" transform="rotate(45 369.5 ${r2(y - 6.5)})"/>
<text class="m" x="384" y="${y}" font-size="15" fill="${C.text}">${esc(shortLang(l.name))}</text>
<text class="d" x="562" y="${y}" font-size="17" fill="${C.gold}" text-anchor="end">${l.pct.toFixed(1)}%</text>
<rect x="384" y="${r2(y + 8)}" width="178" height="4" fill="${C.track}"/>
<rect x="384" y="${r2(y + 8)}" width="${bw}" height="4" fill="${color}" style="${origin(384, y + 10)};animation:grow .9s ease-out ${r2(0.4 + i * 0.08)}s both"/></g>`;
  }).join('');

  // Readout tiles
  const accents = [C.gold, C.redHot, C.arc];
  const tile = (x, y, w, h, accent, icon, label, delay) =>
    `<g style="animation:rise .55s ease-out ${r2(delay)}s both">
<path d="M${x} ${y}H${x + w - 12}L${x + w} ${y + 12}V${y + h}H${x}Z" fill="${C.tile}" fill-opacity=".92" stroke="${C.line}" stroke-width="1.2"/>
<rect x="${x}" y="${y}" width="3" height="${h}" fill="${accent}"/>
<g transform="translate(${x + 14} ${y + 14})" color="${C.arc}">${ICONS[icon] || ''}</g>
<text class="m" x="${x + 40}" y="${y + 27}" font-size="12" fill="${C.muted}" letter-spacing="1"${chars(label) * 8.2 > w - 54 ? ` textLength="${w - 54}" lengthAdjust="spacingAndGlyphs"` : ''}>${esc(label)}</text>`;
  let tilesSvg = '';
  const fallback = config.stats.tileFallback || {};
  config.stats.tiles.slice(0, 6).map((k) => (fallback[k] && !s.metrics[k]?.[1] ? fallback[k] : k)).forEach((key, i) => {
    const [label, value, icon, note = ''] = s.metrics[key] || [key.toUpperCase(), 0, 'code'];
    const x = 620 + (i % 3) * 184, y = 96 + Math.floor(i / 3) * 98;
    tilesSvg += `${tile(x, y, 172, 86, accents[i % 3], icon, label, 0.25 + i * 0.07)}
<text class="d" x="${x + 14}" y="${y + 71}" font-size="34" fill="${C.gold}">${esc(fmt(value))}</text>
<text class="m" x="${x + 160}" y="${y + 70}" font-size="10" fill="${C.muted}" fill-opacity=".8" text-anchor="end" letter-spacing="1">${esc(note)}</text></g>`;
  });
  tilesSvg += `${tile(620, 292, 264, 80, C.redHot, 'flame', 'LONGEST FLIGHT', 0.7)}
<text class="d" x="634" y="356" font-size="34" fill="${C.gold}">${s.longest}<tspan class="m" font-size="14" fill="${C.muted}" font-weight="400"> DAY${s.longest === 1 ? '' : 'S'} STREAK</tspan></text>
<text class="m" x="870" y="336" font-size="11" fill="${C.muted}" text-anchor="end" letter-spacing="1">ACTIVE DAYS</text>
<text class="d" x="870" y="358" font-size="20" fill="${C.arc}" text-anchor="end">${fmt(s.activeDays)}</text></g>
${tile(896, 292, 264, 80, C.gold, 'shield', 'ARMOR CLASS', 0.78)}
<text class="d" x="910" y="356" font-size="32" fill="${C.gold}">MARK ${roman(s.mark)}</text>
<polygon points="${hexPoints(1122, 334, 24)}" fill="none" stroke="${C.gold}" stroke-width="2"/>
<polygon points="${hexPoints(1122, 334, 17)}" fill="${C.arc}" fill-opacity=".12" stroke="${C.arc}" stroke-opacity=".6" style="animation:pulse 2s ease-in-out infinite"/>
<text class="d" x="1122" y="341" font-size="18" fill="${C.arc}" text-anchor="middle">${s.mark}</text></g>`;

  // Flight log — contributions per year
  const ys = s.years.slice(-10), gx = 620, gw = 540, base = 460, bh = 42;
  const maxY = Math.max(...ys.map((y) => y.total), 1);
  const bw = Math.min(58, (gw - (ys.length - 1) * 10) / ys.length);
  const x0 = gx + (gw - (ys.length * bw + (ys.length - 1) * 10)) / 2;
  const bars = ys.map((y, i) => {
    const x = r2(x0 + i * (bw + 10)), h = r2(Math.max(2, (y.total / maxY) * bh)), now = y.year === s.thisYear;
    return `<rect x="${x}" y="${r2(base - h)}" width="${r2(bw)}" height="${h}" fill="url(#${now ? 'barNow' : 'bar'})" style="${origin(x, base)};animation:growY .8s ease-out ${r2(0.8 + i * 0.08)}s both"/>
<text class="m" x="${r2(x + bw / 2)}" y="${r2(base - h - 5)}" font-size="11" fill="${now ? C.arc : C.text}" text-anchor="middle">${fmt(y.total)}</text>
<text class="m" x="${r2(x + bw / 2)}" y="${base + 16}" font-size="11" fill="${C.muted}" text-anchor="middle">${now ? `${y.year}*` : y.year}</text>`;
  }).join('');
  css += '@keyframes growY{from{transform:scaleY(0)}to{transform:scaleY(1)}}';

  const body = `${p.back}
<text x="40" y="52"><tspan class="d" font-size="30" fill="${C.gold}" letter-spacing="3">SUIT DIAGNOSTICS</tspan><tspan class="m" font-size="14" fill="${C.muted}" letter-spacing="1.5">   //  LIVE TELEMETRY · GITHUB</tspan></text>
<circle cx="954" cy="47" r="4.5" fill="${C.arc}" style="animation:blink 1.6s step-end infinite"/>
<text class="m" x="1160" y="52" font-size="13" fill="${C.arc}" text-anchor="end" letter-spacing="1">SYNCED ${s.date} UTC</text>
<path d="M40 72H1160" stroke="${C.line}"/>
<rect x="40" y="71" width="120" height="3" fill="${C.red}"/>
<text class="m" x="40" y="108" font-size="12" fill="${C.muted}" letter-spacing="1">POWER DISTRIBUTION · TOP LANGUAGES</text>
${reactorSvg}
${legend}
<path d="M592 96V470" stroke="${C.line}"/>
${tilesSvg}
<text class="m" x="${gx}" y="400" font-size="12" fill="${C.muted}" letter-spacing="1">FLIGHT LOG · CONTRIBUTIONS PER YEAR${ys.some((y) => y.year === s.thisYear) ? '  (* = so far this year)' : ''}</text>
<path d="M${gx} ${base}H${gx + gw}" stroke="${C.line}"/>
${bars}
${p.front}`;
  return svg(W, H, `Suit diagnostics — ${s.contributions} contributions all time, top language ${lead.name}, armor class Mark ${roman(s.mark)}`, defs, body, css);
}

// ─── 8. Repulsor targeting grid (weekly contributions, all years) ───
function buildTargeting(s) {
  const rows = s.years.slice(-8), cols = 53, cell = 15, gap = 4, step = cell + gap;
  const gx = 110, top = 104, gw = cols * step - gap, W = 1200, H = top + rows.length * step + 78;
  const all = rows.flatMap((r) => r.weeks);
  const max = Math.max(...all, 1);
  const level = (v) => (v <= 0 ? 0 : v <= max * 0.25 ? 1 : v <= max * 0.5 ? 2 : v <= max * 0.75 ? 3 : 4);
  const ramp = [C.track, '#6A040F', C.red, C.gold, C.arc];
  const p = panel('tg', W, H, { glows: [{ x: 600, y: H, r: 700, color: '#7A0B12', o: 0.3 }] });
  const SWEEP = 6, bx0 = gx - 90, dist = gw + 120;
  const defs = `${p.defs}
<linearGradient id="beamG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.arc}" stop-opacity="0"/><stop offset=".8" stop-color="${C.arc}" stop-opacity=".18"/><stop offset="1" stop-color="${C.arc}" stop-opacity=".55"/></linearGradient>`;
  const css = `@keyframes beam{from{transform:translateX(0)}to{transform:translateX(${dist}px)}}@keyframes hit{0%{opacity:.95}10%,100%{opacity:0}}`;

  let cells = '', hits = '', labels = '';
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  months.forEach((m, i) => { labels += `<text class="m" x="${gx + Math.floor((i * cols) / 12) * step}" y="${top - 12}" font-size="11" fill="${C.muted}" letter-spacing="1">${m}</text>`; });
  const targets = [];
  rows.forEach((r, ri) => {
    const y = top + ri * step;
    const now = r.year === s.thisYear;
    labels += `<text class="d" x="${gx - 16}" y="${y + 13}" font-size="17" fill="${now ? C.arc : C.gold}" text-anchor="end">${r.year}</text>`;
    labels += `<text class="m" x="${gx + gw + 14}" y="${y + 12}" font-size="12" fill="${C.muted}">${fmt(r.total)}</text>`;
    for (let wi = 0; wi < cols; wi++) {
      const v = r.weeks[wi];
      if (v === undefined) continue;
      const x = gx + wi * step, lv = level(v);
      cells += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" fill="${ramp[lv]}"${lv ? '' : ' fill-opacity=".9"'}/>`;
      if (lv) {
        const t = r2((((x + cell / 2) - (bx0 + 60)) / dist) * SWEEP);
        hits += `<rect x="${x - 1}" y="${y - 1}" width="${cell + 2}" height="${cell + 2}" rx="3" fill="#FFFFFF" style="opacity:0;animation:hit ${SWEEP}s linear ${t}s infinite"/>`;
        targets.push({ v, x: x + cell / 2, y: y + cell / 2 });
      }
    }
  });
  const locks = targets.sort((a, b) => b.v - a.v).slice(0, 3).map((t, i) => `
<g style="${origin(t.x, t.y)};animation:lock 1s cubic-bezier(.2,.8,.2,1) ${r2(0.6 + i * 0.35)}s both">
<circle cx="${t.x}" cy="${t.y}" r="15" fill="none" stroke="${C.arc}" stroke-width="1.5"/>
<path d="M${t.x} ${t.y - 21}v8M${t.x} ${t.y + 13}v8M${t.x - 21} ${t.y}h8M${t.x + 13} ${t.y}h8" stroke="${C.arc}" stroke-width="1.5"/></g>
<text class="m" x="${r2(t.x + 18)}" y="${r2(t.y - 16)}" font-size="11" font-weight="700" fill="${C.arc}" style="animation:fade .4s ease-out ${r2(1.2 + i * 0.35)}s both">LOCK ${t.v}</text>`).join('');
  const best = Math.max(...all, 0);
  const lg = ramp.map((c, i) => `<rect x="${gx + 46 + i * 19}" y="${H - 44}" width="15" height="15" rx="2" fill="${c}"/>`).join('');

  const body = `${p.back}
<text class="m" x="40" y="48" font-size="13" fill="${C.muted}" letter-spacing="1.5">WEEKLY CONTRIBUTIONS · EVERY YEAR SINCE ${rows[0]?.year ?? s.thisYear}</text>
<text class="m" x="1160" y="48" font-size="13" text-anchor="end" letter-spacing="1"><tspan fill="${C.muted}">TOTAL </tspan><tspan fill="${C.gold}" font-weight="700">${fmt(s.contributions)}</tspan><tspan fill="${C.muted}">  ·  BEST WEEK </tspan><tspan fill="${C.arc}" font-weight="700">${best}</tspan></text>
<path d="M40 64H1160" stroke="${C.line}"/>
<rect x="40" y="63" width="120" height="3" fill="${C.red}"/>
${labels}
${cells}
${hits}
<g style="animation:beam ${SWEEP}s linear infinite">
<rect x="${bx0}" y="${top - 8}" width="60" height="${rows.length * step + 12}" fill="url(#beamG)"/>
<rect x="${bx0 + 59}" y="${top - 8}" width="2" height="${rows.length * step + 12}" fill="${C.arcSoft}"/>
</g>
${locks}
<text class="m" x="${gx}" y="${H - 32}" font-size="11" fill="${C.muted}" letter-spacing="1">LESS</text>
${lg}
<text class="m" x="${gx + 46 + 5 * 19 + 6}" y="${H - 32}" font-size="11" fill="${C.muted}" letter-spacing="1">MORE</text>
<circle cx="${1160 - 214}" cy="${H - 37}" r="4.5" fill="${C.redHot}" style="animation:blink 1.2s step-end infinite"/>
<text class="m" x="1160" y="${H - 32}" font-size="12" fill="${C.redHot}" text-anchor="end" letter-spacing="2">REPULSOR SWEEP ACTIVE</text>
${p.front}`;
  return svg(W, H, `Repulsor targeting — weekly contributions since ${rows[0]?.year ?? s.thisYear}, ${s.contributions} in total`, defs, body, css);
}

// ─── 9. Comms buttons (social links) ────────────────────────────────
function buildSocial(so, i) {
  const W = 336, H = 96, shape = `M15 1H${W - 1}V${H - 16}L${W - 16} ${H - 1}H1V15Z`;
  const handleW = Math.min(chars(so.handle) * 9, W - 96 - 46);
  const defs = `
<linearGradient id="sbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0F131B"/><stop offset="1" stop-color="#140709"/></linearGradient>
<linearGradient id="sbd" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.red}"/><stop offset=".55" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.red}"/></linearGradient>
<clipPath id="sclip"><path d="${shape}"/></clipPath>
<radialGradient id="sglow" cx="48" cy="48" r="44" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${C.arc}" stop-opacity=".28"/><stop offset="1" stop-color="${C.arc}" stop-opacity="0"/></radialGradient>
<linearGradient id="sshine" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="90" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".13"/><stop offset="1" stop-color="#fff" stop-opacity="0"/><animateTransform attributeName="gradientTransform" type="translate" values="-120 0;380 0;380 0" keyTimes="0;.35;1" dur="5s" begin="${i * 0.6}s" repeatCount="indefinite"/></linearGradient>`;
  const body = `
<path d="${shape}" fill="url(#sbg)"/>
<g clip-path="url(#sclip)"><rect width="${W}" height="${H}" fill="url(#sshine)"/><rect x="0" y="${H - 4}" width="${W}" height="4" fill="${C.red}" fill-opacity=".55"/></g>
<path d="${shape}" fill="none" stroke="url(#sbd)" stroke-width="2"/>
<circle cx="48" cy="48" r="44" fill="url(#sglow)" style="animation:pulse 2.6s ease-in-out infinite;animation-delay:-${i * 0.7}s"/>
<circle cx="48" cy="48" r="31" fill="${C.panel}" stroke="${C.gold}" stroke-width="1.5"/>
<circle cx="48" cy="48" r="37" fill="none" stroke="${C.arc}" stroke-opacity=".55" stroke-width="1.5" stroke-dasharray="3 6" style="${origin(48, 48)};animation:${i % 2 ? 'spinr' : 'spin'} 14s linear infinite"/>
<g transform="translate(33 33) scale(1.25)"><path d="${BRAND[so.id] || ''}" fill="${C.gold}"/></g>
<text class="d" x="96" y="45" font-size="25" fill="${C.gold}" letter-spacing="2">${esc(so.label)}</text>
<text class="m" x="96" y="72" font-size="15" fill="${C.muted}"${chars(so.handle) * 9 > handleW ? ` textLength="${handleW}" lengthAdjust="spacingAndGlyphs"` : ''}>${esc(so.handle)}</text>
<circle cx="${W - 22}" cy="20" r="4" fill="${C.arc}" style="animation:blink 1.4s step-end infinite;animation-delay:-${i * 0.4}s"/>
${[0, 1, 2].map((k) => `<path d="M${W - 42 + k * 9} 41l7 7-7 7" fill="none" stroke="${C.redHot}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="animation:chase 1.2s linear infinite;animation-delay:${r2(k * 0.2 - 1.2)}s"/>`).join('')}`;
  return svg(W, H, `${so.label} — ${so.handle}`, defs, body);
}

// ─── Main ───────────────────────────────────────────────────────────
async function main() {
  await mkdir(OUT, { recursive: true });
  const files = {
    'header.svg': buildHeader(),
    'pilot.svg': await buildPilot(),
    'status-log.svg': await buildStatusLog(),
    'footer.svg': buildFooter(),
  };
  for (const sec of config.sections) {
    files[`section-${sec.id}-dark.svg`] = buildSection(sec, 'dark');
    files[`section-${sec.id}-light.svg`] = buildSection(sec, 'light');
  }
  for (const k of ['mission', 'ai', 'comms', 'reactor']) files[`icon-${k}.svg`] = buildIcon(k);
  (config.socials || []).forEach((so, i) => { files[`comms-${so.id}.svg`] = buildSocial(so, i); });

  if (!STATIC_ONLY) {
    if (!TOKEN) {
      console.warn('  ! GITHUB_TOKEN not set — skipping live diagnostics (use --static to silence)');
    } else {
      const stats = await fetchStats(config.username);
      files['diagnostics.svg'] = buildDiagnostics(stats);
      files['targeting.svg'] = buildTargeting(stats);
      const m = Object.fromEntries(Object.entries(stats.metrics).map(([k, v]) => [k, v[1]]));
      console.log(`  ✓ telemetry: ${JSON.stringify(m)} · longest ${stats.longest}d · MARK ${roman(stats.mark)}`);
    }
  }
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(OUT, name), content);
    console.log(`  ✓ ${name.padEnd(30)} ${(Buffer.byteLength(content) / 1024).toFixed(1)} KB`);
  }
}

main().catch((err) => {
  console.error(`✗ J.A.R.V.I.S. build failed: ${err.message}`);
  process.exit(1);
});
