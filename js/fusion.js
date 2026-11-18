/* fusion.js — simulación de la cadena pp: 4p → ⁴He + energía (caldera solar).
 * Modelo cualitativo: plasma 2D; probabilidad de fusión ∝ exp(−τ·T^(−1/3))
 * (forma de la ventana de Gamow), calibrada para visualización. */
(function () {
"use strict";

// ---------- datos y funciones puras ----------
const MEV2J = 1.602176634e-13;   // 1 MeV en joules
const C2 = 299792458 * 299792458;
const U2MEV = 931.494;           // 1 u → MeV/c²
const ALPHA_FS = 1 / 137.035999; // constante de estructura fina
const MP_U = 1.00727647;         // masa del protón en u

/* Energía: se contabiliza el Q COMPLETO de cada reacción, incluida la parte que se lleva
 * el neutrino. En p+p → d + e⁺ + νₑ (Q = 1.44 MeV) el código suma qPrompt = Q − qAnni =
 * 0.42 MeV al fusionar y +1.02 MeV al aniquilarse el positrón, de modo que
 * 2×(0.42+1.02) + 2×5.49 + 12.86 = 26.72 MeV ≈ el Q tabulado de la cadena (26.73 MeV) y
 * el Δm·c² que muestra la página cuadran. Lo que realmente calienta el plasma son
 * ~26.2 MeV: ~0.5 MeV (2 %) escapan con los dos neutrinos. */
const REACTIONS = {
  pp: { Q: 1.44, qPrompt: 0.42, qAnni: 1.02, eq: "p⁺ + p⁺ → d + e⁺ + νₑ",
        tau: 6.0, k: 110,
        note: "interacción débil — el paso más lento" },
  pd: { Q: 5.49, eq: "d + p⁺ → ³He + γ",
        tau: 4.5, k: 1500,
        note: "captura radiativa — rápida" },
  hh: { Q: 12.86, eq: "³He + ³He → ⁴He + 2p⁺",
        tau: 7.0, k: 6000,
        note: "cierra el ciclo y devuelve protones" },
};
const NET_Q = 26.73;

/** keV → MK (1 keV ≈ 11.6 MK) */
function keVtoMK(kev) { return kev * 11.6045; }
/** tasa relativa de fusión mientras dos iones están en contacto (s⁻¹) */
function fusionRate(rx, TkeV) {
  return rx.k * Math.exp(-rx.tau * Math.pow(Math.max(TkeV, 0.05), -1 / 3));
}
/** probabilidad de fusión exacta (Poisson) durante un intervalo dt de contacto */
function fusionProb(rx, TkeV, dt) {
  if (!(dt > 0)) return 0;
  return 1 - Math.exp(-fusionRate(rx, TkeV) * dt);
}
/** energía de Gamow E_G = 2 μ c² (π α Z₁ Z₂)² en keV */
function gamowEnergy(Z1, Z2, muU) {
  const pa = Math.PI * ALPHA_FS * Z1 * Z2;
  return 2 * muU * (U2MEV * 1000) * pa * pa;
}
const GAMOW_EG_PP = gamowEnergy(1, 1, MP_U / 2); // ≈ 493.1 keV
/** pico de Gamow E₀ = (E_G (kT)² / 4)^(1/3) en keV */
function gamowPeakE0(EG, TkeV) {
  const T = Math.max(TkeV, 0.05);
  return Math.cbrt(EG * T * T / 4);
}
/** anchura del pico de Gamow Δ = (4/√3) √(E₀ kT) en keV */
function gamowWidth(EG, TkeV) {
  const T = Math.max(TkeV, 0.05);
  return (4 / Math.sqrt(3)) * Math.sqrt(gamowPeakE0(EG, T) * T);
}
/** componentes del integrando de Gamow en E (keV): Maxwell-Boltzmann, túnel y producto normalizado al pico */
function gamowIntegrand(E, EG, TkeV) {
  const T = Math.max(TkeV, 0.05);
  if (!(E > 0)) return { mb: 1, tunnel: 0, peakNorm: 0 };
  const e0 = gamowPeakE0(EG, T);
  const logPeak = -3 * e0 / T;
  const logProd = -E / T - Math.sqrt(EG / E);
  return {
    mb: Math.exp(-E / T),
    tunnel: Math.exp(-Math.sqrt(EG / E)),
    peakNorm: Math.exp(logProd - logPeak),
  };
}
/** velocidad del centro de masa conservando momento lineal */
function combineMomentum(m1, vx1, vy1, m2, vx2, vy2) {
  const M = m1 + m2;
  if (!(M > 0)) return { vx: 0, vy: 0, M: 0 };
  return { vx: (m1 * vx1 + m2 * vx2) / M, vy: (m1 * vy1 + m2 * vy2) / M, M };
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

// tipos de partícula: masa ∝ A (u), carga Z, radio y color
const TYPES = {
  p:   { A: 1,     Z: 1, r: 4.2, col: "#f85149", name: "p" },
  d:   { A: 2,     Z: 1, r: 5.6, col: "#ffa657", name: "d" },
  he3: { A: 3,     Z: 2, r: 6.6, col: "#3fb950", name: "³He" },
  he4: { A: 4,     Z: 2, r: 8.0, col: "#d29922", name: "⁴He" },
  ep:  { A: 0.05,  Z: 1, r: 3.0, col: "#ffe066", name: "e⁺", life: 0.95 },
  nu:  { A: 0.001, Z: 0, r: 1.8, col: "rgba(201,209,217,0.55)", name: "ν", ghost: true, life: 2.4 },
};

// estado
const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let parts = [], flashes = [], floats = [];
let T = 1.3, speedMul = reducedMotion ? 0.5 : 1, paused = false, simTime = 0, gamowMode = "peak";
let Etotal = 0, he4count = 0, bgGrad = null, bgW = 0, bgH = 0, plasmaDirty = true;
const VUNIT = 78;               // px/s que equivale a ~1 keV por partícula (escala del modelo)
const N_P = 40, MAX_PARTS = 120;
let W = 0, H = 0;

// ---------- utilidades ----------
const rnd = (a, b) => a + Math.random() * (b - a);
let pid = 0;
function makeParticle(type, x, y, vx, vy) {
  const t = TYPES[type];
  return { id: ++pid, type, A: t.A, Z: t.Z, x, y, vx, vy, r: t.r, born: simTime };
}
function spawn(type, x, y, vx, vy) {
  const p = makeParticle(type, x, y, vx, vy);
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
  parts = []; flashes = []; floats = [];
  Etotal = 0; he4count = 0; pid = 0; simTime = 0;
  $("log").innerHTML = '<div class="note">Las reacciones aparecerán aquí…</div>';
  for (let i = 0; i < N_P; i++) {
    const a = rnd(0, Math.PI * 2), s = VUNIT * Math.sqrt(T) * rnd(0.55, 1.45);
    spawn("p", rnd(20, Math.max(W - 20, 60)), rnd(20, Math.max(H - 20, 60)), Math.cos(a) * s, Math.sin(a) * s);
  }
  updateStats();
  drawGamow();
}

// ---------- física ----------
function matchReaction(a, b) {
  if (a.type === "p" && b.type === "p") return REACTIONS.pp;
  if ((a.type === "p" && b.type === "d") || (a.type === "d" && b.type === "p")) return REACTIONS.pd;
  if (a.type === "he3" && b.type === "he3") return REACTIONS.hh;
  return null;
}

function fusePair(a, b, rx, now, outSpawned) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const cm = combineMomentum(a.A, a.vx, a.vy, b.A, b.vx, b.vy);
  const cap = VUNIT * 3.4;
  const addProd = (type, kickX, kickY) => {
    let vx = cm.vx + kickX, vy = cm.vy + kickY;
    const sp = Math.hypot(vx, vy);
    if (sp > cap && type !== "nu" && type !== "ep") { vx *= cap / sp; vy *= cap / sp; }
    const p = makeParticle(type, mx + rnd(-2.5, 2.5), my + rnd(-2.5, 2.5), vx, vy);
    outSpawned.push(p);
    return p;
  };

  if (rx === REACTIONS.pp) {
    // retroceso simétrico entre deuterón (A=2) y leptones ligeros
    const ang = rnd(0, Math.PI * 2), rec = 12;
    addProd("d", -Math.cos(ang) * rec * 0.5, -Math.sin(ang) * rec * 0.5);
    addProd("ep", Math.cos(ang) * 150, Math.sin(ang) * 150);
    const na = rnd(0, Math.PI * 2), ns = rnd(240, 340);
    const nu = makeParticle("nu", mx, my, Math.cos(na) * ns, Math.sin(na) * ns);
    outSpawned.push(nu);
  } else if (rx === REACTIONS.pd) {
    // ³He absorbe el momento total con leve retroceso del fotón γ
    const ang = rnd(0, Math.PI * 2);
    addProd("he3", Math.cos(ang) * 10, Math.sin(ang) * 10);
  } else {
    // ³He + ³He → ⁴He + 2 p⁺ conservando momento total (suma de impulsos = 0)
    const ang = rnd(0, Math.PI * 2), kick = 38;
    const kx1 = Math.cos(ang) * kick, ky1 = Math.sin(ang) * kick;
    const kx2 = Math.cos(ang + 2.2) * kick, ky2 = Math.sin(ang + 2.2) * kick;
    addProd("p", kx1, ky1);
    addProd("p", kx2, ky2);
    addProd("he4", -(kx1 + kx2) / TYPES.he4.A, -(ky1 + ky2) / TYPES.he4.A);
    he4count++;
  }

  // energía: prompt ahora; positrón suma +1.02 MeV al aniquilarse
  const qNow = rx === REACTIONS.pp ? rx.qPrompt : rx.Q;
  addEnergy(qNow);
  flashes.push({ x: mx, y: my, t0: now, col: rx === REACTIONS.pp ? "#ffe066" : rx === REACTIONS.pd ? "#58a6ff" : "#d29922" });
  floats.push({ x: mx, y: my - 8, txt: `+${qNow.toFixed(2)} MeV`, t0: now, col: "#3fb950" });
  logRxn(rx.eq, rx.Q);
  const card = $("rxn-" + (rx === REACTIONS.pp ? "pp" : rx === REACTIONS.pd ? "pd" : "hh"));
  card.classList.add("hit"); setTimeout(() => card.classList.remove("hit"), 550);
}

function addEnergy(MeV) { Etotal += MeV; }

function logRxn(eq, q) {
  const el = $("log");
  if (el.querySelector(".note")) el.textContent = "";
  const d = document.createElement("div");
  const sp = document.createElement("span");
  sp.className = "me";
  sp.textContent = eq;
  d.append(sp, ` — Q = ${q} MeV`);
  el.prepend(d);
  while (el.children.length > 40) el.lastChild.remove();
}

function step(dt, now) {
  simTime += dt;
  // repulsión coulombiana suave entre iones cargados (muestra visualmente la barrera)
  const kCoul = 2200;
  for (let i = 0; i < parts.length; i++) {
    const a = parts[i];
    if (!a.Z || a.type === "ep") continue;
    for (let j = i + 1; j < parts.length; j++) {
      const b = parts[j];
      if (!b.Z || b.type === "ep") continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const r2 = dx * dx + dy * dy;
      if (r2 > 2200 || r2 < 1e-4) continue; // corte de apantallamiento de Debye visual (~47 px)
      const r = Math.sqrt(r2);
      const soft = Math.max(r, a.r + b.r);
      const f = kCoul * a.Z * b.Z / (soft * soft * soft); // 1/r² suavizado
      const fx = f * dx * dt, fy = f * dy * dt;
      a.vx -= fx / a.A; a.vy -= fy / a.A;
      b.vx += fx / b.A; b.vy += fy / b.A;
    }
  }

  // mover y rebotar (dt ya viene multiplicado por speedMul desde frame())
  const vmax = VUNIT * Math.sqrt(T) * 2.8;
  for (const p of parts) {
    if (p.type !== "nu" && p.type !== "ep") {
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > vmax) { const s = vmax / sp; p.vx *= s; p.vy *= s; }
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.type === "nu") continue;               // el neutrino no interactúa
    if (p.x < p.r) { p.x = p.r; p.vx = Math.abs(p.vx); }
    if (p.x > W - p.r) { p.x = W - p.r; p.vx = -Math.abs(p.vx); }
    if (p.y < p.r) { p.y = p.r; p.vy = Math.abs(p.vy); }
    if (p.y > H - p.r) { p.y = H - p.r; p.vy = -Math.abs(p.vy); }
  }

  // positrones: se aniquilan tras ~0.95 s de tiempo simulado → +1.02 MeV
  const dead = new Set();
  for (const p of parts) {
    const age = simTime - p.born;
    if (p.type === "ep" && age > TYPES.ep.life) {
      dead.add(p);
      addEnergy(REACTIONS.pp.qAnni);
      flashes.push({ x: p.x, y: p.y, t0: now, col: "#ffe066", small: true });
      floats.push({ x: p.x, y: p.y - 6, txt: "+1.02 MeV γγ", t0: now, col: "#ffe066" });
    } else if (p.type === "nu" && age > TYPES.nu.life) {
      dead.add(p);
    }
  }

  // fusiones: evaluación segura sin mutar `parts` durante el bucle
  const spawned = [];
  for (let i = 0; i < parts.length; i++) {
    const a = parts[i];
    if (dead.has(a) || a.type === "nu" || a.type === "he4" || a.type === "ep") continue;
    for (let j = i + 1; j < parts.length; j++) {
      const b = parts[j];
      if (dead.has(b) || b.type === "nu" || b.type === "he4" || b.type === "ep") continue;
      const rx = matchReaction(a, b);
      if (!rx) continue;
      const rr = a.r + b.r + 8;
      const dx = a.x - b.x, dy = a.y - b.y;
      if (dx * dx + dy * dy < rr * rr) {
        if (Math.random() < fusionProb(rx, T, dt)) {
          dead.add(a); dead.add(b);
          fusePair(a, b, rx, now, spawned);
          break; // `a` ya se fusionó
        }
      }
    }
  }

  if (dead.size || spawned.length) {
    parts = parts.filter(p => !dead.has(p));
    for (const s of spawned) parts.push(s);
  }
}

// ---------- dibujo ----------
const TAU = Math.PI * 2;
function draw(now) {
  fit();
  ctx.fillStyle = "#0d1117"; ctx.fillRect(0, 0, W, H);
  // halo suave del "núcleo" (cacheado por tamaño)
  if (!bgGrad || bgW !== W || bgH !== H) {
    bgW = W; bgH = H;
    bgGrad = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, Math.max(W, H) * 0.7);
    bgGrad.addColorStop(0, "rgba(210,153,34,0.05)");
    bgGrad.addColorStop(1, "rgba(13,17,23,0)");
  }
  ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H);

  for (const p of parts) {
    const t = TYPES[p.type];
    if (p.type === "nu") {
      const fade = Math.max(0, 1 - (simTime - p.born) / t.life);
      ctx.strokeStyle = `rgba(201,209,217,${0.35 * fade})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x - p.vx * 0.09, p.y - p.vy * 0.09); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.fillStyle = `rgba(201,209,217,${0.5 * fade})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, t.r, 0, TAU); ctx.fill();
      continue;
    }
    ctx.shadowColor = t.col; ctx.shadowBlur = p.type === "he4" ? 14 : 8;
    ctx.fillStyle = t.col;
    ctx.beginPath(); ctx.arc(p.x, p.y, t.r, 0, TAU); ctx.fill();
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
    ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, TAU); ctx.stroke();
    ctx.globalAlpha = (1 - u) * 0.35;
    ctx.beginPath(); ctx.arc(f.x, f.y, R * 0.55, 0, TAU); ctx.stroke();
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

// ---------- gráfica de Gamow (Pico P(E) real o Tasa vs T) ----------
function drawGamow() {
  const dpr = window.devicePixelRatio || 1;
  const W = gCv.clientWidth, H = gCv.clientHeight;
  if (!W || !H) return;
  if (gCv.width !== Math.round(W * dpr) || gCv.height !== Math.round(H * dpr)) {
    gCv.width = Math.round(W * dpr); gCv.height = Math.round(H * dpr);
  }
  gCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  gCtx.fillStyle = "#0d1117"; gCtx.fillRect(0, 0, W, H);
  const padL = 10, padR = 16, padT = 16, padB = 18;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  if (gamowMode === "rate") {
    const tmax = 5;
    const X = t => padL + (t - 0.3) / (tmax - 0.3) * plotW;
    let vmax = 0;
    const ys = [];
    for (let i = 0; i <= 120; i++) {
      const t = 0.3 + i / 120 * (tmax - 0.3);
      const v = fusionRate(REACTIONS.pp, t);
      ys.push(v); if (v > vmax) vmax = v;
    }
    const Y = v => H - padB - (v / vmax) * plotH;
    gCtx.strokeStyle = "#30363d";
    for (const tk of [1, 2, 3, 4, 5]) {
      gCtx.beginPath(); gCtx.moveTo(X(tk), H - padB); gCtx.lineTo(X(tk), H - padB + 3); gCtx.stroke();
      gCtx.fillStyle = "#6e7681"; gCtx.font = "9px sans-serif";
      gCtx.textAlign = tk === 5 ? "right" : "center";
      gCtx.fillText(tk + " keV", tk === 5 ? X(tk) + 4 : X(tk), H - 5);
    }
    gCtx.beginPath(); gCtx.moveTo(X(0.3), H - padB);
    ys.forEach((v, i) => gCtx.lineTo(X(0.3 + i / 120 * (tmax - 0.3)), Y(v)));
    gCtx.lineTo(X(tmax), H - padB); gCtx.closePath();
    gCtx.fillStyle = "rgba(248,81,73,0.25)"; gCtx.fill();
    gCtx.beginPath();
    ys.forEach((v, i) => { const x = X(0.3 + i / 120 * (tmax - 0.3)), y = Y(v); i ? gCtx.lineTo(x, y) : gCtx.moveTo(x, y); });
    gCtx.strokeStyle = "#f85149"; gCtx.lineWidth = 1.6; gCtx.stroke();
    const cx = X(Math.min(tmax, Math.max(0.3, T))), cy = Y(fusionRate(REACTIONS.pp, T));
    gCtx.fillStyle = "#f0c000"; gCtx.beginPath(); gCtx.arc(cx, cy, 4, 0, TAU); gCtx.fill();
    gCtx.fillStyle = "#8b949e"; gCtx.font = "10px sans-serif"; gCtx.textAlign = "left";
    gCtx.fillText("Tasa p+p ∝ exp(−τ·T^−⅓) · T = " + T.toFixed(2) + " keV", padL + 2, 11);
    return;
  }

  // Modo "peak": Pico real de Gamow P(E) = exp(-E/kT) × exp(-√(E_G/E))
  const E0 = gamowPeakE0(GAMOW_EG_PP, T);
  const dE = gamowWidth(GAMOW_EG_PP, T);
  const Emax = Math.max(20, Math.ceil((E0 + dE * 2.1) / 5) * 5);
  const X = E => padL + (E / Emax) * plotW;
  const Y = v => H - padB - Math.max(0, Math.min(1, v)) * plotH;

  // escala visual de la curva de túnel normalizada en Emax para que ambas alas sean legibles
  const tunMax = Math.exp(-Math.sqrt(GAMOW_EG_PP / Emax));
  const N = 160;

  // banda de anchura Δ alrededor de E₀
  const xLo = X(Math.max(0, E0 - dE / 2)), xHi = X(Math.min(Emax, E0 + dE / 2));
  gCtx.fillStyle = "rgba(240,192,0,0.08)";
  gCtx.fillRect(xLo, padT, xHi - xLo, plotH);

  // Maxwell-Boltzmann e^(-E/kT)
  gCtx.save(); gCtx.setLineDash([4, 3]);
  gCtx.beginPath();
  for (let i = 0; i <= N; i++) {
    const E = (i / N) * Emax;
    const x = X(E), y = Y(Math.exp(-E / T));
    i ? gCtx.lineTo(x, y) : gCtx.moveTo(x, y);
  }
  gCtx.strokeStyle = "#f8514999"; gCtx.lineWidth = 1.2; gCtx.stroke();

  // Probabilidad de túnel exp(-√(E_G/E)) (reescalada al eje [0,1] del panel)
  gCtx.beginPath();
  for (let i = 1; i <= N; i++) {
    const E = (i / N) * Emax;
    const tn = Math.exp(-Math.sqrt(GAMOW_EG_PP / E)) / (tunMax || 1);
    const x = X(E), y = Y(tn);
    i === 1 ? gCtx.moveTo(x, y) : gCtx.lineTo(x, y);
  }
  gCtx.strokeStyle = "#58a6ffaa"; gCtx.lineWidth = 1.2; gCtx.stroke();
  gCtx.restore();

  // Producto: Pico de Gamow normalizado
  gCtx.beginPath(); gCtx.moveTo(X(0), H - padB);
  for (let i = 1; i <= N; i++) {
    const E = (i / N) * Emax;
    const g = gamowIntegrand(E, GAMOW_EG_PP, T);
    gCtx.lineTo(X(E), Y(g.peakNorm));
  }
  gCtx.lineTo(X(Emax), H - padB); gCtx.closePath();
  gCtx.fillStyle = "rgba(240,192,0,0.28)"; gCtx.fill();

  gCtx.beginPath();
  for (let i = 1; i <= N; i++) {
    const E = (i / N) * Emax;
    const g = gamowIntegrand(E, GAMOW_EG_PP, T);
    const x = X(E), y = Y(g.peakNorm);
    i === 1 ? gCtx.moveTo(x, y) : gCtx.lineTo(x, y);
  }
  gCtx.strokeStyle = "#f0c000"; gCtx.lineWidth = 1.8; gCtx.stroke();

  // línea vertical en E₀
  const x0 = X(E0);
  gCtx.strokeStyle = "#f0c00088"; gCtx.lineWidth = 1;
  gCtx.beginPath(); gCtx.moveTo(x0, padT); gCtx.lineTo(x0, H - padB); gCtx.stroke();

  // eje X
  gCtx.strokeStyle = "#30363d";
  gCtx.beginPath(); gCtx.moveTo(padL, H - padB); gCtx.lineTo(W - padR, H - padB); gCtx.stroke();
  const stepTick = Emax <= 25 ? 5 : 10;
  gCtx.fillStyle = "#6e7681"; gCtx.font = "9px sans-serif"; gCtx.textAlign = "center";
  for (let ek = stepTick; ek < Emax; ek += stepTick) {
    const x = X(ek);
    gCtx.beginPath(); gCtx.moveTo(x, H - padB); gCtx.lineTo(x, H - padB + 3); gCtx.stroke();
    gCtx.fillText(ek + " keV", x, H - 5);
  }

  // leyenda superior
  gCtx.font = "9.5px sans-serif"; gCtx.textAlign = "left";
  gCtx.fillStyle = "#f0c000"; gCtx.fillText(`E₀ = ${E0.toFixed(1)} keV (Δ = ${dE.toFixed(1)})`, padL + 2, 11);
  gCtx.textAlign = "right";
  gCtx.fillStyle = "#f85149cc"; gCtx.fillText("MB", W - padR - 46, 11);
  gCtx.fillStyle = "#58a6ffcc"; gCtx.fillText("Túnel", W - padR - 2, 11);
}

// ---------- stats / UI ----------
function updateStats() {
  const nP = parts.filter(p => p.type === "p").length;
  const nMid = parts.filter(p => p.type === "d" || p.type === "he3").length;
  $("stHe4").textContent = he4count;
  $("stP").textContent = nP;
  $("stMid").textContent = nMid;
  $("stE").textContent = Etotal >= 1000 ? (Etotal / 1000).toFixed(2) + " GeV" : Etotal.toFixed(1) + " MeV";
  $("stKg").textContent = kgOf(Etotal).toExponential(2) + " kg";
  $("stRate").textContent = (simTime > 1 ? Etotal / simTime : 0).toFixed(2) + " MeV/s";
  $("plasmainfo").textContent =
    `núcleo estelar · T = ${T.toFixed(2)} keV (~${Math.round(keVtoMK(T))} MK) · E₀ = ${gamowPeakE0(GAMOW_EG_PP, T).toFixed(1)} keV`;
}

$("temp").oninput = e => {
  const knew = e.target.value / 100;
  const f = Math.sqrt(knew / T);
  for (const p of parts) {
    if (p.type === "nu" || p.type === "ep") continue;
    p.vx *= f; p.vy *= f;
  }
  T = knew;
  $("tempVal").textContent = T.toFixed(2) + " keV";
  $("kvT").textContent = `${T.toFixed(2)} keV · ~${Math.round(keVtoMK(T))} MK`;
  $("sconf").textContent = `plasma de ¹H a ~${Math.round(keVtoMK(T))} MK`;
  drawGamow();
};
document.querySelectorAll(".gbtn").forEach(b => b.onclick = () => {
  document.querySelectorAll(".gbtn").forEach(x => { x.classList.remove("on"); x.setAttribute("aria-pressed", "false"); });
  b.classList.add("on");
  b.setAttribute("aria-pressed", "true");
  gamowMode = b.dataset.gm;
  $("gamowCap").innerHTML = gamowMode === "peak"
    ? "Ventana de Gamow real (p+p, E<sub>G</sub> = 493.1 keV): Maxwell-Boltzmann × túnel cuántico"
    : "Tasa relativa p+p ∝ exp(−τ·T<sup>−⅓</sup>) frente a temperatura T (cualitativa)";
  drawGamow();
});
$("btnPause").onclick = () => {
  paused = !paused;
  $("btnPause").textContent = paused ? "▶ reanudar" : "⏸ pausa";
  $("btnPause").setAttribute("aria-pressed", String(paused));
  plasmaDirty = true;
};
$("btnReset").onclick = () => { reset(); plasmaDirty = true; };
$("btnFeed").onclick = () => {
  const room = Math.max(0, MAX_PARTS - parts.length);
  const add = Math.min(20, room);
  for (let i = 0; i < add; i++) {
    const a = rnd(0, Math.PI * 2), s = VUNIT * Math.sqrt(T) * rnd(0.55, 1.45);
    spawn("p", rnd(20, Math.max(W - 20, 60)), rnd(20, Math.max(H - 20, 60)), Math.cos(a) * s, Math.sin(a) * s);
  }
  plasmaDirty = true;
  updateStats();
};
window.addEventListener("resize", () => { fit(); plasmaDirty = true; drawGamow(); });
document.querySelectorAll(".spd").forEach(b => b.onclick = () => {
  document.querySelectorAll(".spd").forEach(x => { x.classList.remove("on"); x.setAttribute("aria-pressed", "false"); });
  b.classList.add("on"); b.setAttribute("aria-pressed", "true");
  speedMul = +b.dataset.s;
});

// ---------- bucle ----------
let last = performance.now(), statTick = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * speedMul; last = now;
  const active = !paused || flashes.length > 0 || floats.length > 0;
  if (!paused) step(dt, now);
  if (active || plasmaDirty) {
    draw(now);
    plasmaDirty = false;
  }
  if (!paused && (statTick++ & 15) === 0) updateStats();
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);

})();

// export para pruebas en Node
if (typeof module !== "undefined")
  module.exports = {
    REACTIONS, NET_Q, GAMOW_EG_PP,
    keVtoMK, fusionRate, fusionProb,
    gamowEnergy, gamowPeakE0, gamowWidth, gamowIntegrand,
    combineMomentum, massU, kgOf
  };

})();
