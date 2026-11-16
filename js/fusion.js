/* fusion.js — simulación de la cadena pp: 4p → ⁴He + energía (caldera solar).
 * Modelo cualitativo: plasma 2D; probabilidad de fusión ∝ exp(−τ·T^(−1/3))
 * (forma de la ventana de Gamow), calibrada para visualización. */
(function () {
"use strict";

// ---------- datos y funciones puras ----------
const MEV2J = 1.602176634e-13;   // 1 MeV en joules
const C2 = 299792458 * 299792458;
const U2MEV = 931.494;           // 1 u → MeV/c²

/* Energía: se contabiliza el Q COMPLETO de cada reacción, incluida la parte que se lleva
 * el neutrino. En p+p → d + e⁺ + νₑ (Q = 1.44 MeV) el código suma qPrompt = Q − qAnni =
 * 0.42 MeV al fusionar y +1.02 MeV al aniquilarse el positrón, de modo que
 * 2×(0.42+1.02) + 2×5.49 + 12.86 = 26.72 MeV ≈ el Q tabulado de la cadena (26.73 MeV) y
 * el Δm·c² que muestra la página cuadran. Lo que realmente calienta el plasma son
 * ~26.2 MeV: ~0.5 MeV (2 %) escapan con los dos neutrinos. */
const REACTIONS = {
  pp: { Q: 1.44, qPrompt: 0.42, qAnni: 1.02, eq: "p⁺ + p⁺ → d + e⁺ + νₑ",
        tau: 6.0, k: 40,
        note: "interacción débil — el paso más lento" },
  pd: { Q: 5.49, eq: "d + p⁺ → ³He + γ",
        tau: 4.5, k: 1500,
        note: "captura radiativa — rápida" },
  hh: { Q: 12.86, eq: "³He + ³He → ⁴He + 2p⁺",
        tau: 7.0, k: 6000,
        note: "cierra el ciclo y devuelve protones" },
};
const NET_Q = 26.73, NET_MASS_U = 0.0287, NET_PCT = 0.71;

/** keV → MK (1 keV ≈ 11.6 MK) */
function keVtoMK(kev) { return kev * 11.6045; }
/** tasa relativa de fusión mientras dos iones están en contacto (s⁻¹) */
function fusionRate(rx, TkeV) {
  return rx.k * Math.exp(-rx.tau * Math.pow(Math.max(TkeV, 0.05), -1 / 3));
}
/** masa equivalente en u de una energía Q en MeV */
function massU(Q) { return Q / U2MEV; }
/** kg de materia convertida por E MeV (E = mc²) */
function kgOf(E) { return E * MEV2J / C2; }

// ---------- navegador ----------
if (typeof document !== "undefined") (function () {

const $ = id => document.getElementById(id);
const cv = $("plasma"), ctx = cv.getContext("2d");
const gCv = $("gamow"), gCtx = gCv.getContext("2d");

// tipos de partícula: masa ∝ A (u), radio y color
const TYPES = {
  p:   { A: 1,   r: 4.0, col: "#f85149", name: "p" },
  d:   { A: 2,   r: 5.5, col: "#ffa657", name: "d" },
  he3: { A: 3,   r: 6.5, col: "#3fb950", name: "³He" },
  he4: { A: 4,   r: 8.0, col: "#d29922", name: "⁴He" },
  ep:  { A: 0.05, r: 3.0, col: "#ffe066", name: "e⁺", life: 950 },
  nu:  { A: 0.001, r: 1.8, col: "rgba(201,209,217,0.55)", name: "ν", ghost: true, life: 2400 },
};

// estado
let parts = [], flashes = [], floats = [], logN = 0;
let T = 1.3, speedMul = 1, paused = false, t0 = performance.now();
let Etotal = 0, he4count = 0, pairCd = new Map();
const VUNIT = 78;               // px/s que equivale a ~1 keV por partícula (escala del modelo)
const N_P = 40;
let W = 0, H = 0;

// ---------- utilidades ----------
const rnd = (a, b) => a + Math.random() * (b - a);
const dist2 = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; };
let pid = 0;
function spawn(type, x, y, vx, vy) {
  const t = TYPES[type];
  const p = { id: ++pid, type, x, y, vx, vy, r: t.r, born: performance.now() };
  parts.push(p); return p;
}
function fit() {
  const dpr = window.devicePixelRatio || 1;
  W = cv.clientWidth; H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function reset() {
  fit();
  parts = []; flashes = []; floats = []; pairCd.clear();
  Etotal = 0; he4count = 0; pid = 0; t0 = performance.now();
  $("log").innerHTML = '<div class="note">Las reacciones aparecerán aquí…</div>';
  for (let i = 0; i < N_P; i++) {
    const a = rnd(0, Math.PI * 2), s = VUNIT * Math.sqrt(T) * rnd(0.55, 1.45);
    spawn("p", rnd(20, Math.max(W - 20, 60)), rnd(20, Math.max(H - 20, 60)), Math.cos(a) * s, Math.sin(a) * s);
  }
  updateStats();
}

// ---------- física ----------
function thermalSpeed() { return VUNIT * Math.sqrt(T) * rnd(0.55, 1.45); }

function tryFuse(a, b, now, dt) {
  const rx = (a.type === "p" && b.type === "p") ? REACTIONS.pp
           : ((a.type === "p" && b.type === "d") || (a.type === "d" && b.type === "p")) ? REACTIONS.pd
           : (a.type === "he3" && b.type === "he3") ? REACTIONS.hh : null;
  if (!rx) return;
  const key = Math.min(a.id, b.id) + ":" + Math.max(a.id, b.id);
  if (pairCd.has(key) && now - pairCd.get(key) < 140) return;
  pairCd.set(key, now);
  // probabilidad acumulada durante el contacto
  if (Math.random() > 1 - Math.exp(-fusionRate(rx, T) * dt)) { fuse(a, b, rx); return; }
}

function fuse(a, b, rx) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  // momento total (masa ∝ A)
  const Px = a.A * a.vx + b.A * b.vx, Py = a.A * a.vy + b.A * b.vy;
  const Mtot = a.A + b.A;
  const kill = new Set([a, b]);
  const prods = [];
  const push = (type) => {
    const t = TYPES[type], m = t.A;
    const jx = rnd(-1, 1) * 14, jy = rnd(-1, 1) * 14;
    let vx = Mtot ? (Px * m / Mtot / Math.max(m, 0.02)) + jx : jx;
    let vy = Mtot ? (Py * m / Mtot / Math.max(m, 0.02)) + jy : jy;
    const sp = Math.hypot(vx, vy), cap = VUNIT * 3.2;
    if (sp > cap) { vx *= cap / sp; vy *= cap / sp; }
    const p = spawn(type, mx + rnd(-3, 3), my + rnd(-3, 3), vx, vy);
    prods.push(p); return p;
  };
  if (rx === REACTIONS.pp) {
    push("d");
    const ep = push("ep"); ep.vx *= 3; ep.vy *= 3;   // positrón energético
    const nu = push("nu");                            // neutrino: sale volando
    const na = rnd(0, Math.PI * 2), ns = rnd(220, 340);
    nu.vx = Math.cos(na) * ns; nu.vy = Math.sin(na) * ns;
  }
  else if (rx === REACTIONS.pd) { push("he3"); }
  else { push("he4"); push("p"); push("p"); }
  parts = parts.filter(p => !kill.has(p));

  // energía: prompt ahora; positrón suma +1.02 MeV al aniquilarse
  const qNow = rx === REACTIONS.pp ? rx.qPrompt : rx.Q;
  addEnergy(qNow);
  flashes.push({ x: mx, y: my, t0: performance.now(), col: rx === REACTIONS.pp ? "#ffe066" : rx === REACTIONS.pd ? "#58a6ff" : "#d29922" });
  floats.push({ x: mx, y: my - 8, txt: `+${qNow.toFixed(2)} MeV`, t0: performance.now(), col: "#3fb950" });
  for (const pr of prods) if (pr.type === "he4") he4count++;
  logRxn(rx.eq, rx.Q, mx, my);
  const card = $("rxn-" + (rx === REACTIONS.pp ? "pp" : rx === REACTIONS.pd ? "pd" : "hh"));
  card.classList.add("hit"); setTimeout(() => card.classList.remove("hit"), 550);
}

function addEnergy(MeV) { Etotal += MeV; }

function logRxn(eq, q, x, y) {
  const el = $("log");
  if (el.querySelector(".note")) el.innerHTML = "";
  const d = document.createElement("div");
  d.innerHTML = `<span class="me">${eq}</span> — Q = ${q} MeV`;
  el.prepend(d);
  while (el.children.length > 40) el.lastChild.remove();
  logN++;
}

function step(dt, now) {
  // mover y rebotar
  for (const p of parts) {
    p.x += p.vx * dt * speedMul; p.y += p.vy * dt * speedMul;
    if (p.type === "nu") continue;               // el neutrino no interactúa
    if (p.x < p.r) { p.x = p.r; p.vx = Math.abs(p.vx); }
    if (p.x > W - p.r) { p.x = W - p.r; p.vx = -Math.abs(p.vx); }
    if (p.y < p.r) { p.y = p.r; p.vy = Math.abs(p.vy); }
    if (p.y > H - p.r) { p.y = H - p.r; p.vy = -Math.abs(p.vy); }
  }
  // positrones: se aniquilan tras ~1 s → +1.02 MeV
  const dead = [];
  for (const p of parts) {
    if (p.type === "ep" && now - p.born > TYPES.ep.life) {
      dead.push(p);
      addEnergy(REACTIONS.pp.qAnni);
      flashes.push({ x: p.x, y: p.y, t0: now, col: "#ffe066", small: true });
      floats.push({ x: p.x, y: p.y - 6, txt: "+1.02 MeV γγ", t0: now, col: "#ffe066" });
    } else if (p.type === "nu" && now - p.born > TYPES.nu.life) dead.push(p);
  }
  if (dead.length) parts = parts.filter(p => !dead.includes(p));
  // fusiones: solo pares compatibles
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    const a = parts[i], b = parts[j];
    if (a.type === "nu" || b.type === "nu" || a.type === "he4" || b.type === "he4") continue;
    const rr = a.r + b.r + 7;
    if (dist2(a, b) < rr * rr) tryFuse(a, b, now, dt);
  }
  // limpieza de mapas de cooldown
  if (pairCd.size > 400) pairCd.clear();
}

// ---------- dibujo ----------
function draw(now) {
  fit();
  ctx.fillStyle = "#0d1117"; ctx.fillRect(0, 0, W, H);
  // halo suave del "núcleo"
  const g = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, Math.max(W, H) * 0.7);
  g.addColorStop(0, "rgba(210,153,34,0.05)"), g.addColorStop(1, "rgba(13,17,23,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  for (const p of parts) {
    const t = TYPES[p.type];
    if (p.type === "nu") {
      const fade = Math.max(0, 1 - (now - p.born) / t.life);
      ctx.strokeStyle = `rgba(201,209,217,${0.35 * fade})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x - p.vx * 0.09, p.y - p.vy * 0.09); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.fillStyle = `rgba(201,209,217,${0.5 * fade})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, t.r, 0, 7); ctx.fill();
      continue;
    }
    ctx.shadowColor = t.col; ctx.shadowBlur = p.type === "he4" ? 14 : 8;
    ctx.fillStyle = t.col;
    ctx.beginPath(); ctx.arc(p.x, p.y, t.r, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    if (p.type !== "ep") {
      ctx.fillStyle = "rgba(13,17,23,0.85)";
      ctx.font = `bold ${Math.max(6, t.r * 0.95)}px sans-serif`; ctx.textAlign = "center";
      ctx.fillText(t.name, p.x, p.y + t.r * 0.32);
    }
  }
  // flashes de fusión
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i], age = now - f.t0;
    const life = f.small ? 500 : 900;
    if (age > life) { flashes.splice(i, 1); continue; }
    const u = age / life, R = (f.small ? 16 : 34) * (0.3 + u);
    ctx.strokeStyle = f.col; ctx.globalAlpha = (1 - u) * 0.9; ctx.lineWidth = 2.5 * (1 - u) + 0.5;
    ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, 7); ctx.stroke();
    ctx.globalAlpha = (1 - u) * 0.35;
    ctx.beginPath(); ctx.arc(f.x, f.y, R * 0.55, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // textos flotantes
  ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i], age = now - f.t0;
    if (age > 1400) { floats.splice(i, 1); continue; }
    ctx.globalAlpha = 1 - age / 1400;
    ctx.fillStyle = f.col; ctx.fillText(f.txt, f.x, f.y - age * 0.03);
    ctx.globalAlpha = 1;
  }
}

// ---------- gráfica de Gamow ----------
function drawGamow() {
  const dpr = window.devicePixelRatio || 1;
  const W = gCv.clientWidth, H = gCv.clientHeight;
  if (gCv.width !== Math.round(W * dpr)) { gCv.width = Math.round(W * dpr); gCv.height = Math.round(H * dpr); }
  gCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  gCtx.fillStyle = "#0d1117"; gCtx.fillRect(0, 0, W, H);
  const padL = 8, padR = 8, padT = 6, padB = 16;
  const X = t => padL + (t - 0.3) / (5 - 0.3) * (W - padL - padR);
  const tmax = 5;
  let vmax = 0;
  const ys = [];
  for (let i = 0; i <= 120; i++) {
    const t = 0.3 + i / 120 * (tmax - 0.3);
    const v = fusionRate(REACTIONS.pp, t);
    ys.push(v); if (v > vmax) vmax = v;
  }
  const Y = v => H - padB - (v / vmax) * (H - padT - padB);
  gCtx.strokeStyle = "#30363d";
  for (const tk of [1, 2, 3, 4, 5]) {
    gCtx.beginPath(); gCtx.moveTo(X(tk), H - padB); gCtx.lineTo(X(tk), H - padB + 3); gCtx.stroke();
    gCtx.fillStyle = "#6e7681"; gCtx.font = "9px sans-serif"; gCtx.textAlign = "center";
    gCtx.fillText(tk + " keV", X(tk), H - 5);
  }
  // área bajo la curva (pp)
  gCtx.beginPath(); gCtx.moveTo(X(0.3), H - padB);
  ys.forEach((v, i) => gCtx.lineTo(X(0.3 + i / 120 * (tmax - 0.3)), Y(v)));
  gCtx.lineTo(X(tmax), H - padB); gCtx.closePath();
  gCtx.fillStyle = "rgba(248,81,73,0.25)"; gCtx.fill();
  gCtx.beginPath();
  ys.forEach((v, i) => { const x = X(0.3 + i / 120 * (tmax - 0.3)), y = Y(v); i ? gCtx.lineTo(x, y) : gCtx.moveTo(x, y); });
  gCtx.strokeStyle = "#f85149"; gCtx.lineWidth = 1.6; gCtx.stroke();
  // marcador de T actual
  const cx = X(Math.min(tmax, Math.max(0.3, T))), cy = Y(fusionRate(REACTIONS.pp, T));
  gCtx.fillStyle = "#f0c000"; gCtx.beginPath(); gCtx.arc(cx, cy, 4, 0, 7); gCtx.fill();
  gCtx.fillStyle = "#8b949e"; gCtx.font = "9px sans-serif"; gCtx.textAlign = "left";
  gCtx.fillText("tasa p+p vs T", padL + 2, padT + 8);
}

// ---------- stats / UI ----------
function updateStats() {
  const nP = parts.filter(p => p.type === "p").length;
  const nMid = parts.filter(p => p.type === "d" || p.type === "he3").length;
  const elapsed = (performance.now() - t0) / 1000;
  $("stHe4").textContent = he4count;
  $("stP").textContent = nP;
  $("stMid").textContent = nMid;
  $("stE").textContent = Etotal >= 1000 ? (Etotal / 1000).toFixed(2) + " GeV" : Etotal.toFixed(1) + " MeV";
  $("stKg").textContent = kgOf(Etotal).toExponential(2) + " kg";
  $("stRate").textContent = (elapsed > 1 ? Etotal / elapsed : 0).toFixed(2) + " MeV/s";
  $("plasmainfo").textContent =
    `núcleo estelar · T = ${T.toFixed(2)} keV (~${Math.round(keVtoMK(T))} MK) · clic: pausa/reanudar`;
}

$("temp").oninput = e => {
  const knew = e.target.value / 100;
  const f = Math.sqrt(knew / T);
  for (const p of parts) { p.vx *= f; p.vy *= f; }
  T = knew;
  $("tempVal").textContent = T.toFixed(2) + " keV";
  $("kvT").textContent = `${T.toFixed(2)} keV · ~${Math.round(keVtoMK(T))} MK`;
  drawGamow();
};
$("btnPause").onclick = () => {
  paused = !paused;
  $("btnPause").textContent = paused ? "▶ reanudar" : "⏸ pausa";
};
$("btnReset").onclick = reset;
document.querySelectorAll(".spd").forEach(b => b.onclick = () => {
  document.querySelectorAll(".spd").forEach(x => x.classList.remove("on"));
  b.classList.add("on"); speedMul = +b.dataset.s;
});
cv.addEventListener("click", () => $("btnPause").click());

// ---------- bucle ----------
let last = performance.now(), statTick = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * speedMul; last = now;
  if (!paused) step(dt, now);
  draw(now);
  if ((statTick++ & 15) === 0) { updateStats(); drawGamow(); }
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);

})();

// export para pruebas en Node
if (typeof module !== "undefined")
  module.exports = { REACTIONS, NET_Q, keVtoMK, fusionRate, massU, kgOf };

})();
