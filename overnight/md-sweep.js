/* md-sweep.js — port Node de la física de js/estados-agua.js (sin DOM).
 * Tareas nocturnas:
 *  A) equilibrar sólido/líquido/gas (~400k pasos c/u) y guardar snapshots JSON
 *  B) barrido T* → curva de transición del modelo (fracción de puentes H)
 * Salida: overnight/md/*.json
 */
"use strict";
const fs = require("fs"), path = require("path");
const OUT = path.join(__dirname, "md"); fs.mkdirSync(OUT, { recursive: true });

// ---- constantes y funciones puras copiadas de js/estados-agua.js ----
const N = 150, SIGMA = 1, CUTOFF = 2.5, EPS_LJ = 0.22, EPS_HB = 1.15;
const HB_R0 = 0.96, HB_WIDTH = 0.24, BOND = 0.305, HALF_ANGLE = 52.25 * Math.PI / 180;
const INERTIA = 0.16, SUBSTEP = 0.004;
const PHASES = { solid: { target: 0.12 }, liquid: { target: 0.38 }, gas: { target: 1.15 } };
let prng = 90210;
const rand = () => (prng = (prng * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;
const gauss = () => { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

let molecules = [], bonds = [], phase = "liquid", targetT = 0.38;
const box = { x: 0, y: 0, w: 16, h: 13 };

const _hb = { s: 0, d: 0 };
function hbTerms(m, ux, uy, out) {
  let sum = 0, der = 0, c = ux * m.d1x + uy * m.d1y;
  if (c > 0) { const q = c * c; sum += q * q; der += 4 * q * c * (uy * m.d1x - ux * m.d1y); }
  c = ux * m.d2x + uy * m.d2y;
  if (c > 0) { const q = c * c; sum += q * q; der += 4 * q * c * (uy * m.d2x - ux * m.d2y); }
  out.s = sum; out.d = der;
}
function addPairForce(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, r2 = dx * dx + dy * dy;
  if (r2 >= CUTOFF * CUTOFF) return;
  const ru = Math.sqrt(r2), r = Math.max(0.72, ru);
  const ux = ru > 1e-9 ? dx / ru : 1, uy = ru > 1e-9 ? dy / ru : 0;
  const sr6 = Math.pow(SIGMA / r, 6);
  let dUdr = 24 * EPS_LJ / r * (sr6 - 2 * sr6 * sr6);
  if (r < 1.8) {
    hbTerms(a, ux, uy, _hb); const Ai = _hb.s, dAi = _hb.d;
    hbTerms(b, -ux, -uy, _hb); const Aj = _hb.s, dAj = _hb.d;
    const dr = r - HB_R0, g = Math.exp(-0.5 * (dr / HB_WIDTH) ** 2);
    dUdr += EPS_HB * g * dr / (HB_WIDTH * HB_WIDTH) * (Ai + Aj);
    a.torque += EPS_HB * g * dAi; b.torque += EPS_HB * g * dAj;
    if (r < 1.38 && (Ai > 0.62 || Aj > 0.62)) bonds.push(1);
  }
  dUdr = Math.max(-70, Math.min(70, dUdr));
  const fx = dUdr * dx / r, fy = dUdr * dy / r;
  a.fx += fx; a.fy += fy; b.fx -= fx; b.fy -= fy;
}
function computeForces() {
  bonds = [];
  const cells = new Map(), key = (x, y) => (x + 512) * 2048 + (y + 512);
  for (let i = 0; i < molecules.length; i++) {
    const m = molecules[i]; m.fx = 0; m.fy = 0; m.torque = 0;
    const a1 = m.theta - HALF_ANGLE, a2 = m.theta + HALF_ANGLE;
    m.d1x = Math.cos(a1); m.d1y = Math.sin(a1); m.d2x = Math.cos(a2); m.d2y = Math.sin(a2);
    const cx = Math.floor(m.x / CUTOFF), cy = Math.floor(m.y / CUTOFF), k = key(cx, cy);
    if (!cells.has(k)) cells.set(k, []); cells.get(k).push(i);
  }
  for (let i = 0; i < molecules.length; i++) {
    const a = molecules[i], cx = Math.floor(a.x / CUTOFF), cy = Math.floor(a.y / CUTOFF);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const list = cells.get(key(cx + ox, cy + oy));
      if (list) for (const j of list) if (j > i) addPairForce(a, molecules[j]);
    }
  }
}
function newMol(x, y, th, ts) { return { x, y, theta: th, vx: gauss() * ts, vy: gauss() * ts, omega: gauss() * ts * 0.55, fx: 0, fy: 0, torque: 0 }; }
function init(ph) {
  phase = ph; targetT = PHASES[ph].target; molecules = []; prng = 90210 + Math.round(targetT * 1000);
  const density = ph === "gas" ? 0.30 : ph === "liquid" ? 0.52 : 0.62;
  const need = Math.sqrt(N / density), w = need, h = need * (ph === "gas" ? 1.22 : 0.82);
  box.w = Math.max(8, w); box.h = Math.max(6.5, h);
  if (ph === "solid") {
    const nx = Math.max(4, Math.ceil(Math.sqrt(N * w / h))), ny = Math.ceil(N / nx);
    const sp = Math.min(1.15, Math.max(0.88, Math.sqrt((w * h) / N)));
    for (let r = 0; r < ny && molecules.length < N; r++) for (let c = 0; c < nx && molecules.length < N; c++)
      molecules.push(newMol(w / 2 - (nx - 1) * sp / 2 + c * sp + (r % 2) * sp / 2, h / 2 - (ny - 1) * sp * 0.44 + r * sp * 0.88, (r + c) % 2 ? 0 : Math.PI, 0.16));
  } else {
    let att = 0;
    while (molecules.length < N && att++ < 20000) {
      const x = 0.8 + rand() * (w - 1.6), y = 0.8 + rand() * (h - 1.6);
      if (molecules.every(m => (m.x - x) ** 2 + (m.y - y) ** 2 > 0.78 ** 2)) molecules.push(newMol(x, y, rand() * Math.PI * 2, Math.sqrt(targetT) * 0.78));
    }
    while (molecules.length < N) molecules.push(newMol(0.9 + (molecules.length % 12) * Math.max(0.9, (w - 1.8) / 11), 0.9 + Math.floor(molecules.length / 12) * 0.95, rand() * Math.PI * 2, Math.sqrt(targetT) * 0.78));
  }
  computeForces();
}
function walls(m) {
  const p = 0.25, x0 = box.x + p, x1 = box.x + box.w - p, y0 = box.y + p, y1 = box.y + box.h - p;
  if (m.x < x0) { m.x = x0; m.vx = Math.abs(m.vx) * 0.72; } if (m.x > x1) { m.x = x1; m.vx = -Math.abs(m.vx) * 0.72; }
  if (m.y < y0) { m.y = y0; m.vy = Math.abs(m.vy) * 0.72; } if (m.y > y1) { m.y = y1; m.vy = -Math.abs(m.vy) * 0.72; }
}
function thermo() {
  let k = 0; for (const m of molecules) k += 0.5 * (m.vx ** 2 + m.vy ** 2 + INERTIA * m.omega ** 2);
  const cur = 2 * k / Math.max(1, 3 * N - 2); if (cur < 1e-8) return;
  const f = Math.max(0.9, Math.min(1.1, Math.sqrt(targetT / cur))), s = 1 + (f - 1) * 0.16;
  for (const m of molecules) { m.vx *= s; m.vy *= s; m.omega *= s; }
}
function step(dt) {
  for (const m of molecules) {
    m.vx += 0.5 * m.fx * dt; m.vy += 0.5 * m.fy * dt; m.omega += 0.5 * m.torque / INERTIA * dt;
    m.x += m.vx * dt; m.y += m.vy * dt; m.theta += m.omega * dt; walls(m);
  }
  computeForces();
  for (const m of molecules) { m.vx += 0.5 * m.fx * dt; m.vy += 0.5 * m.fy * dt; m.omega += 0.5 * m.torque / INERTIA * dt; }
}
function bondFrac() { return bonds.length / Math.max(1, molecules.length); }
function snapshot() { return molecules.map(m => [+m.x.toFixed(4), +m.y.toFixed(4), +m.theta.toFixed(4), +m.vx.toFixed(4), +m.vy.toFixed(4), +m.omega.toFixed(4)]); }

const mode = process.argv[2] || "all";
if (mode === "all" || mode === "snaps") {
  for (const ph of ["solid", "liquid", "gas"]) {
    const t0 = Date.now(); init(ph);
    const snaps = [];
    for (let s = 1; s <= 400000; s++) { step(SUBSTEP); if (s % 8 === 0) thermo(); if (s % 50000 === 0) snaps.push({ step: s, bonds: bonds.length, data: snapshot() }); }
    fs.writeFileSync(path.join(OUT, `snaps_${ph}.json`), JSON.stringify({ phase: ph, T: PHASES[ph].target, box: { w: box.w, h: box.h }, snaps }));
    console.log(`${ph}: 400k pasos en ${((Date.now() - t0) / 1000).toFixed(0)}s, ${snaps.length} snapshots, bonds=${bonds.length}`);
  }
}
if (mode === "all" || mode === "sweep") {
  const rows = [];
  for (const T of [0.08, 0.15, 0.25, 0.38, 0.55, 0.8, 1.15, 1.6, 2.2]) {
    init("liquid"); targetT = T;
    let series = [];
    for (let s = 1; s <= 120000; s++) { step(SUBSTEP); if (s % 8 === 0) thermo(); if (s % 20000 === 0) series.push(bondFrac()); }
    const last = series.slice(-3);
    rows.push({ T, bondFrac: +(last.reduce((a, b) => a + b) / last.length).toFixed(4), series: series.map(v => +v.toFixed(3)) });
    console.log(`T*=${T}: bondFrac=${rows[rows.length-1].bondFrac}`);
  }
  fs.writeFileSync(path.join(OUT, "sweep.json"), JSON.stringify(rows, null, 1));
  console.log("barrido listo");
}
console.log("LISTO md-sweep");
