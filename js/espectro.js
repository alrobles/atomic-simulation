/* espectro.js — espectro de emisión de gases nobles: espectro visible,
 * diagrama de niveles (Grotrian esquemático) y simulación de cascada.
 * Datos: js/specdata.js (NIST ASD). Funciones puras arriba → también corre en Node. */
(function () {
"use strict";
const NS = (typeof SPEC !== "undefined") ? { SPEC, SPEC_ORDER } : require("./specdata.js");
const SPECd = NS.SPEC, ORDERd = NS.SPEC_ORDER;

const CM2EV = 1 / 8065.54;           // cm^-1 → eV
const EV2CM = 8065.54;               // eV → cm^-1
const LAM_MIN = 250, LAM_MAX = 1050; // ventana del espectro (nm)
const VIS_LO = 380, VIS_HI = 750;    // rango visible

// ---------- funciones puras ----------

/** λ (nm) → [r,g,b] 0..1, aproximación de Bruton; atenúa fuera del visible. */
function wave2rgb(w) {
  let r = 0, g = 0, b = 0;
  if (w >= 380 && w < 440) { r = -(w - 440) / 60; g = 0; b = 1; }
  else if (w < 490) { r = 0; g = (w - 440) / 50; b = 1; }
  else if (w < 510) { r = 0; g = 1; b = -(w - 510) / 20; }
  else if (w < 580) { r = (w - 510) / 70; g = 1; b = 0; }
  else if (w < 645) { r = 1; g = -(w - 645) / 65; b = 0; }
  else if (w <= 780) { r = 1; g = 0; b = 0; }
  let f = 1;
  if (w > 700) f = 0.3 + 0.7 * (780 - w) / 80;
  else if (w < 420) f = 0.3 + 0.7 * (w - 380) / 40;
  if (w < 380 || w > 780) { const k = 0.22; r *= k; g *= k; b = b * k + 0.10; }
  return [r * f, g * f, b * f];
}
const rgbCss = c => `rgb(${c.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255)).join(",")})`;

const COL = { s: 0, p: 1, d: 2, f: 3 };
const COL_NAME = ["s", "p", "d", "f"];
const COL_CSS = ["#ff6b6b", "#ffd43b", "#4dabf7", "#69db7c"]; // mismos colores que orbitales.html

function prepLevel(l) {
  const c = (l.orb || "s")[0].toLowerCase();
  l.col = COL[c] !== undefined ? COL[c] : 1;
  l.xoff = ((Math.round(l.e * 7) % 5) - 2) * 2.5; // jitter determinista anti-solape
  return l;
}

/** Niveles de energía a partir de las transiciones más intensas.
 *  Devuelve {levels, top, get}: levels ordenados por energía (cm^-1);
 *  top = líneas dibujadas; get(e,orb,term) crea/nivela bajo demanda. */
function buildLevels(lines, maxTrans, eLimit) {
  maxTrans = maxTrans || 44;
  const pool = eLimit ? lines.filter(L => L.ek <= eLimit) : lines;
  const top = pool.slice().sort((a, b) => b.rel - a.rel).slice(0, maxTrans);
  const lvMap = new Map();
  const get = (e, orb, term) => {
    const k = Math.round(e);
    let v = lvMap.get(k);
    if (!v) { v = prepLevel({ e, orb, term }); lvMap.set(k, v); }
    return v;
  };
  for (const L of top) {
    L.lo = get(L.ei, L.lorb, L.lterm);
    L.up = get(L.ek, L.uorb, L.uterm);
  }
  if (!lvMap.has(0)) lvMap.set(0, prepLevel({ e: 0, orb: "1s", term: "fundamental" }));
  const levels = [...lvMap.values()].sort((a, b) => a.e - b.e);
  return { levels, top, get, lvMap };
}

/** Cascada de emisión: excita hasta el nivel superior de la primera línea
 *  y decae por las transiciones más probables (hasta maxSteps fotones). */
function buildCascade(lines, maxSteps) {
  maxSteps = maxSteps || 4;
  const cand = lines.slice().sort((a, b) => b.rel - a.rel);
  if (!cand.length) return [];
  // sesgo hacia niveles superiores: cascadas más largas
  const pool = cand.slice(0, Math.min(30, cand.length)).sort((a, b) => b.ek - a.ek);
  const first = pool[Math.floor(Math.random() * Math.min(4, pool.length))];
  const path = [first];
  let at = first.ei, guard = 0;
  while (path.length < maxSteps && guard++ < 25) {
    let best = null;
    for (const L of cand) {
      if (Math.abs(L.ek - at) < 800 && !path.includes(L) && (!best || L.rel > best.rel)) best = L;
    }
    if (!best) break;
    path.push(best); at = best.ei;
  }
  return path;
}

function sup(s) { return String(s).split("").map(c => "⁰¹²³⁴⁵⁶⁷⁸⁹"[+c] || c).join(""); }
function termLabel(orb, term) { return `${orb} ${sup(term || "")}`.trim(); }

// ---------- navegador ----------
if (typeof document !== "undefined") (function () {

const $ = id => document.getElementById(id);
let gas = "Ne";
let G = null;               // estado del gas actual
const specCv = $("spec"), specCtx = specCv.getContext("2d");
const levCv = $("levels"), levCtx = levCv.getContext("2d");

// estado de simulación
const sim = { on: false, t0: 0, path: [], flashes: [], exciteDur: 850, stepDur: 1250 };
let selLine = null, hoverLine = null;
let lastSpec = { W: 0, H: 0 }, lastLev = { W: 0, H: 0 };

// ---------- carga de gas ----------
function loadGas(el) {
  gas = el;
  const d = SPECd[el];
  const lines = d.lines.map(a => ({ lam: a[0], rel: a[1], ei: a[2], ek: a[3],
    lorb: a[4], lterm: a[5], uorb: a[6], uterm: a[7] }));
  const bl = buildLevels(lines, 44, d.ie * EV2CM);
  G = { el, z: d.z, name: d.name, ie: d.ie, conf: d.conf, lines,
        maxRel: Math.max(...lines.map(l => l.rel), 1),
        levels: bl.levels, top: bl.top, getLevel: bl.get, lvMap: bl.lvMap };
  refreshMaxE();
  sim.on = false; sim.flashes = []; sim.path = []; selLine = null; hoverLine = null;
  updatePanel(); drawTabs();
}
function refreshMaxE() {
  G.maxE = Math.max(...G.levels.map(l => l.e), G.ie * EV2CM);
  G.ieE = G.ie * EV2CM;
}
// asegura que las líneas de la cascada tengan niveles en el diagrama
function ensurePathLevels() {
  let added = false;
  for (const L of sim.path) {
    if (!L.lo) { L.lo = G.getLevel(L.ei, L.lorb, L.lterm); added = true; }
    if (!L.up) { L.up = G.getLevel(L.ek, L.uorb, L.uterm); added = true; }
  }
  if (added) {
    G.levels = [...G.lvMap.values()].sort((a, b) => a.e - b.e);
    refreshMaxE();
  }
}

// ---------- panel ----------
function updatePanel() {
  const d = SPECd[gas];
  $("sym").innerHTML = `${gas}<small>Z=${d.z}</small>`;
  $("gname").textContent = d.name;
  $("gconf").textContent = "gas noble";
  $("kvconf").textContent = d.conf;
  $("kvie").textContent = d.ie.toFixed(3) + " eV";
  $("kvlines").textContent = d.lines.length;
  $("btnSim").disabled = !d.lines.length;
  $("nodata").hidden = !!d.lines.length;
  if (!d.lines.length) $("nodata").innerHTML =
    `<b>Sin espectro medido para ${gas}.</b><br><br>` +
    (gas === "Og"
      ? "El oganesón (Z=118) se sintetizó por primera vez en 2002 y sus átomos viven ~1 ms: no existe espectroscopía de emisión. La física de sus electrones externos (7p⁶) solo está predicha."
      : "El radón es radiactivo y escaso: solo unas pocas líneas de emisión han sido confirmadas experimentalmente.");
  showSel(null);
}
function showSel(L) {
  selLine = L;
  const box = $("selinfo");
  if (!L) { box.innerHTML = `<span class="note">Pasa el cursor sobre el espectro o haz clic en una línea para ver su transición.</span>`; return; }
  const dE = (L.ek - L.ei) * CM2EV;
  box.innerHTML =
    `<div class="lam" style="color:${rgbCss(wave2rgb(L.lam))}">${L.lam.toFixed(2)} nm</div>` +
    `<div>ΔE = ${dE.toFixed(2)} eV · I<sub>rel</sub> = ${Math.round(L.rel)}</div>` +
    `<div class="tr">${termLabel(L.uorb, L.uterm)} → ${termLabel(L.lorb, L.lterm)}</div>`;
}

// ---------- canvas helpers ----------
function fit(cv, ctx) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  return { W, H };
}
const sx = lam => (lam - LAM_MIN) / (LAM_MAX - LAM_MIN) * lastSpec.W;

// ---------- espectro ----------
function drawSpec(now) {
  const { W, H } = fit(specCv, specCtx); lastSpec = { W, H };
  const c = specCtx;
  c.fillStyle = "#0d1117"; c.fillRect(0, 0, W, H);
  if (!G || !G.lines.length) { drawSpecAxis(c, W, H); return; }

  // fondo espectral: arcoíris aproximado en la zona visible
  const x0 = sx(VIS_LO), x1 = sx(VIS_HI);
  const step = Math.max(2, W / 160);
  for (let x = x0; x < x1; x += step) {
    const lam = LAM_MIN + (x / W) * (LAM_MAX - LAM_MIN);
    const [r, g, b] = wave2rgb(lam);
    c.fillStyle = `rgba(${r * 90 | 0},${g * 90 | 0},${b * 90 | 0},0.55)`;
    c.fillRect(x, 0, step + 0.5, H);
  }
  // bordes UV / IR atenuados
  c.fillStyle = "rgba(13,17,23,0.72)";
  c.fillRect(0, 0, x0, H); c.fillRect(x1, 0, W - x1, H);
  c.fillStyle = "#6e7681"; c.font = "10px sans-serif"; c.textAlign = "center";
  c.fillText("UV", x0 / 2, 12); c.fillText("IR", (W + x1) / 2, 12);
  c.fillText("VISIBLE", (x0 + x1) / 2, 12);

  // líneas de emisión
  const maxH = H * 0.62;
  for (const L of G.lines) {
    const x = sx(L.lam);
    let h = maxH * (0.05 + 0.6 * Math.sqrt(L.rel / G.maxRel));
    for (const f of sim.flashes) {
      const age = now - f.t0;
      if (age < 1400 && Math.abs(L.lam - f.lam) < 0.4) h *= 1 + 1.6 * Math.exp(-age / 380);
    }
    const [r, g, b] = wave2rgb(L.lam);
    const dim = (L.lam < VIS_LO || L.lam > VIS_HI) ? 0.5 : 1;
    c.fillStyle = `rgba(${r * 255 | 0},${g * 255 | 0},${b * 255 | 0},${0.9 * dim})`;
    c.fillRect(x - 0.8, H - h, 1.6, h);
  }
  drawSpecAxis(c, W, H);

  // hover
  if (hoverLine) {
    const x = sx(hoverLine.lam), [r, g, b] = wave2rgb(hoverLine.lam);
    c.strokeStyle = "rgba(255,255,255,0.8)"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x, 14); c.lineTo(x, H); c.stroke();
    c.fillStyle = rgbCss([r, g, b]); c.font = "bold 11px sans-serif";
    c.fillText(hoverLine.lam.toFixed(1) + " nm", Math.min(x + 4, W - 60), 24);
  }
  $("specinfo").textContent = G ? `${G.name} · ${G.lines.length} líneas neutras (NIST ASD) · clic en una línea` : "";
}

function drawSpecAxis(c, W, H) {
  c.strokeStyle = "#30363d"; c.fillStyle = "#8b949e"; c.font = "10px sans-serif"; c.textAlign = "center";
  c.beginPath(); c.moveTo(0, H - 0.5); c.lineTo(W, H - 0.5); c.stroke();
  for (let lam = 300; lam <= 1000; lam += 100) {
    const x = sx(lam);
    c.beginPath(); c.moveTo(x, H - 4); c.lineTo(x, H); c.stroke();
    c.fillText(String(lam), x, H - 6);
  }
  for (let lam = 350; lam <= 1000; lam += 50) {
    if (lam % 100 === 0) continue;
    const x = sx(lam);
    c.beginPath(); c.moveTo(x, H - 2); c.lineTo(x, H); c.stroke();
  }
}

// ---------- diagrama de niveles ----------
function levelPos(l, W, H) {
  const padL = 46, padR = 70, padT = 26, padB = 30;
  const colW = (W - padL - padR) / COLS;
  const cx = padL + l.col * colW + colW / 2 + (l.xoff || 0);
  const eMax = Math.max(G.maxE, 1);
  const y = padT + (1 - l.e / eMax) * (H - padT - padB);
  return { x: cx, y };
}
const COLS = 4;

function drawLevels(now) {
  const { W, H } = fit(levCv, levCtx); lastLev = { W, H };
  const c = levCtx;
  c.fillStyle = "#0d1117"; c.fillRect(0, 0, W, H);
  if (!G || !G.levels.length) return;

  const padL = 46, padR = 70, padT = 26, padB = 30;
  const eMax = Math.max(G.maxE, 1);
  const yOf = e => padT + (1 - e / eMax) * (H - padT - padB);

  // rejilla de energía (eV)
  c.strokeStyle = "#161b22"; c.fillStyle = "#6e7681"; c.font = "9px sans-serif"; c.textAlign = "left";
  const eVmax = eMax * CM2EV;
  for (let ev = 2; ev < eVmax; ev += 2) {
    const y = yOf(ev * EV2CM);
    c.beginPath(); c.moveTo(padL, y); c.lineTo(W - padR, y); c.stroke();
    c.fillText(ev + " eV", W - padR + 5, y + 3);
  }
  // línea de ionización
  if (G.ieE < eMax) {
    const y = yOf(G.ieE);
    c.strokeStyle = "#f85149"; c.setLineDash([4, 4]);
    c.beginPath(); c.moveTo(padL, y); c.lineTo(W - padR, y); c.stroke(); c.setLineDash([]);
    c.fillStyle = "#f85149"; c.fillText("ionización", padL + 4, y - 3);
  }

  // columnas s p d f
  const colW = (W - padL - padR) / COLS;
  c.textAlign = "center"; c.font = "bold 12px sans-serif";
  for (let i = 0; i < COLS; i++) {
    c.fillStyle = COL_CSS[i];
    c.fillText(COL_NAME[i], padL + i * colW + colW / 2, H - 10);
  }

  // niveles
  for (const l of G.levels) {
    const p = levelPos(l, W, H);
    const isGround = l.e < 1;
    c.strokeStyle = isGround ? "#f0c000" : COL_CSS[l.col];
    c.lineWidth = isGround ? 2 : 1.4;
    c.beginPath(); c.moveTo(p.x - 8, p.y); c.lineTo(p.x + 8, p.y); c.stroke();
    c.fillStyle = "#8b949e"; c.font = "9px sans-serif"; c.textAlign = "right";
    c.fillText(termLabel(l.orb, l.term).slice(0, 18), p.x - 11, p.y + 3);
    if (isGround) { c.fillStyle = "#f0c000"; c.fillText("fundamental", p.x - 11, p.y - 4); }
  }

  // transiciones (flechas)
  c.lineWidth = 0.8;
  for (const L of G.top) {
    if (!L.lo || !L.up) continue;
    const pu = levelPos(L.up, W, H), pl = levelPos(L.lo, W, H);
    const mx = (pu.x + pl.x) / 2, my = (pu.y + pl.y) / 2;
    const dx = pl.x - pu.x, dy = pl.y - pu.y;
    const len = Math.hypot(dx, dy) || 1;
    const bow = Math.min(30, len * 0.25) * (L.up.col === L.lo.col ? 0.4 : 1);
    const cxp = mx - dy / len * bow, cyp = my + dx / len * bow;
    const [r, g, b] = wave2rgb(L.lam);
    const isSel = selLine === L, isHov = hoverLine === L;
    const inPath = sim.on && sim.path.includes(L);
    c.strokeStyle = rgbCss([r, g, b]);
    c.globalAlpha = isSel || isHov || inPath ? 0.95 : 0.4;
    c.lineWidth = isSel || isHov || inPath ? 1.8 : 0.8;
    c.beginPath(); c.moveTo(pu.x, pu.y); c.quadraticCurveTo(cxp, cyp, pl.x, pl.y); c.stroke();
    // punta de flecha en el nivel inferior
    const t = 0.06;
    const ex = (1 - t) * (1 - t) * pu.x + 2 * (1 - t) * t * cxp + t * t * pl.x;
    const ey = (1 - t) * (1 - t) * pu.y + 2 * (1 - t) * t * cyp + t * t * pl.y;
    const ang = Math.atan2(pl.y - ey, pl.x - ex);
    c.fillStyle = rgbCss([r, g, b]);
    c.beginPath();
    c.moveTo(pl.x, pl.y);
    c.lineTo(pl.x - 7 * Math.cos(ang - 0.4), pl.y - 7 * Math.sin(ang - 0.4));
    c.lineTo(pl.x - 7 * Math.cos(ang + 0.4), pl.y - 7 * Math.sin(ang + 0.4));
    c.fill();
    c.globalAlpha = 1; c.lineWidth = 0.8;
    if (isSel || isHov) {
      c.fillStyle = "#fff"; c.font = "10px sans-serif"; c.textAlign = "center";
      c.fillText(L.lam.toFixed(1) + " nm", mx, my - 6);
    }
  }

  // ---- simulación ----
  if (sim.on && sim.path.length) {
    const t = now - sim.t0;
    const first = sim.path[0];
    if (t < sim.exciteDur && first.up) {
      // excitación: nivel fundamental → nivel superior de la primera emisión
      const gLvl = G.levels.find(l => l.e < 1) || G.levels[0];
      const p0 = levelPos(gLvl, W, H), p1 = levelPos(first.up, W, H);
      const cxp = (p0.x + p1.x) / 2 - (p1.y - p0.y) * 0.15, cyp = (p0.y + p1.y) / 2 + (p1.x - p0.x) * 0.15;
      const p = t / sim.exciteDur;
      const bez = u => ({ x: (1 - u) * (1 - u) * p0.x + 2 * (1 - u) * u * cxp + u * u * p1.x,
                          y: (1 - u) * (1 - u) * p0.y + 2 * (1 - u) * u * cyp + u * u * p1.y });
      const pe = bez(Math.min(1, p * 1.05));
      c.strokeStyle = "rgba(255,255,255,0.75)"; c.setLineDash([5, 4]); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(p0.x, p0.y); c.quadraticCurveTo(cxp, cyp, pe.x, pe.y); c.stroke(); c.setLineDash([]);
      const pg = bez(p);
      c.fillStyle = "#fff"; c.shadowColor = "#fff"; c.shadowBlur = 8;
      c.beginPath(); c.arc(pg.x, pg.y, 3, 0, 7); c.fill(); c.shadowBlur = 0;
      const pu = levelPos(first.up, W, H);
      c.strokeStyle = "#f0c000"; c.lineWidth = 2;
      c.beginPath(); c.arc(pu.x, pu.y, 8 + 3 * Math.sin(now / 90), 0, 7); c.stroke();
    } else {
      // emisiones en cascada
      for (let i = 0; i < sim.path.length; i++) {
        const start = sim.exciteDur + i * sim.stepDur;
        const lt = t - start;
        if (lt < 0 || lt > sim.stepDur) continue;
        const L = sim.path[i];
        if (!L.lo || !L.up) continue;
        const pu = levelPos(L.up, W, H), pl = levelPos(L.lo, W, H);
        const mx = (pu.x + pl.x) / 2, my = (pu.y + pl.y) / 2;
        const dx = pl.x - pu.x, dy = pl.y - pu.y, len = Math.hypot(dx, dy) || 1;
        const bow = Math.min(30, len * 0.25) * (L.up.col === L.lo.col ? 0.4 : 1);
        const cxp = mx - dy / len * bow, cyp = my + dx / len * bow;
        const bez = u => ({ x: (1 - u) * (1 - u) * pu.x + 2 * (1 - u) * u * cxp + u * u * pl.x,
                            y: (1 - u) * (1 - u) * pu.y + 2 * (1 - u) * u * cyp + u * u * pl.y });
        const p = lt / sim.stepDur;
        if (p < 0.85) {
          const [r, g, b] = wave2rgb(L.lam);
          c.strokeStyle = rgbCss([r, g, b]); c.globalAlpha = 0.4 + 0.6 * Math.sin(Math.min(1, p / 0.85) * Math.PI);
          c.lineWidth = 2.2;
          c.beginPath(); c.moveTo(pu.x, pu.y); c.quadraticCurveTo(cxp, cyp, pl.x, pl.y); c.stroke();
          c.globalAlpha = 1; c.lineWidth = 0.8;
        }
        if (p > 0.08 && p < 0.58) {
          const u = (p - 0.08) / 0.5;
          const pt = bez(u);
          const [r, g, b] = wave2rgb(L.lam);
          c.fillStyle = rgbCss([r, g, b]); c.shadowColor = rgbCss([r, g, b]); c.shadowBlur = 12;
          c.beginPath(); c.arc(pt.x, pt.y, 3.2, 0, 7); c.fill(); c.shadowBlur = 0;
        }
        if (p > 0.55 && p < 0.62 && !L._flashed) {
          L._flashed = true;
          sim.flashes.push({ lam: L.lam, t0: now });
        }
        if (p > 0.55 && p < 0.9) {
          const [r, g, b] = wave2rgb(L.lam);
          c.strokeStyle = rgbCss([r, g, b]); c.globalAlpha = 0.8 * (1 - (p - 0.55) / 0.35);
          c.beginPath(); c.arc(pl.x, pl.y, 6 + 14 * (p - 0.55) / 0.35, 0, 7); c.stroke();
          c.globalAlpha = 1;
        }
      }
      const total = sim.exciteDur + sim.path.length * sim.stepDur;
      if (t > total + 300) { sim.on = false; sim.path.forEach(L => L._flashed = false); }
    }
  }
}

// ---------- interacción ----------
function nearestLine(x) {
  if (!G) return null;
  let best = null, bd = 1e9;
  for (const L of G.lines) {
    const d = Math.abs(sx(L.lam) - x);
    if (d < bd) { bd = d; best = L; }
  }
  return bd < 5 ? best : null;
}
specCv.addEventListener("mousemove", e => {
  if (!G) return;
  const r = specCv.getBoundingClientRect();
  hoverLine = nearestLine(e.clientX - r.left);
  if (hoverLine) showSel(hoverLine); else showSel(selLine);
});
specCv.addEventListener("mouseleave", () => { hoverLine = null; showSel(selLine); });
specCv.addEventListener("click", () => { if (hoverLine) { selLine = hoverLine; showSel(selLine); } });

levCv.addEventListener("click", e => {
  if (!G) return;
  const r = levCv.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  let best = null, bd = 1e9;
  for (const L of G.top) {
    if (!L.lo || !L.up) continue;
    const pu = levelPos(L.up, r.width, r.height), pl = levelPos(L.lo, r.width, r.height);
    const mx = (pu.x + pl.x) / 2, my = (pu.y + pl.y) / 2;
    const d = Math.hypot(mx - x, my - y);
    if (d < bd) { bd = d; best = L; }
  }
  if (best && bd < 40) { selLine = best; showSel(best); }
});

// ---------- tabs ----------
function drawTabs() {
  const nav = $("tabs");
  nav.innerHTML = "";
  for (const el of ORDERd) {
    const d = SPECd[el];
    const t = document.createElement("div");
    t.className = "tab" + (el === gas ? " on" : "");
    t.innerHTML = `<b>${el}</b><small>Z=${d.z}${d.lines.length ? "" : " · sin datos"}</small>`;
    t.onclick = () => loadGas(el);
    nav.appendChild(t);
  }
}

$("btnSim").onclick = () => {
  if (!G || !G.lines.length || sim.on) return;
  sim.path = buildCascade(G.lines, 4);
  if (!sim.path.length) return;
  ensurePathLevels();
  sim.path.forEach(L => L._flashed = false);
  sim.t0 = performance.now(); sim.on = true;
};

// ---------- bucle ----------
function frame(now) {
  drawSpec(now); drawLevels(now);
  requestAnimationFrame(frame);
}
loadGas("Ne");
requestAnimationFrame(frame);

})();

// export para pruebas en Node
if (typeof module !== "undefined") module.exports = { wave2rgb, buildLevels, buildCascade, SPEC: SPECd, SPEC_ORDER: ORDERd };

})();
