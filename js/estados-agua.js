/* estados-agua.js — dinámica molecular 2D cualitativa de moléculas rígidas H₂O.
 * Pares cercanos por cuadrícula espacial; potencial Lennard-Jones + puente H orientacional.
 * No es un campo de fuerza parametrizado para predicción experimental. */
(function () {
"use strict";

const MIN_PARTICLES = 54;
const MAX_PARTICLES = 180;
const DEFAULT_PARTICLES = 96;
const SIGMA = 1;
const CUTOFF = 2.5 * SIGMA;
const EPS_LJ = 0.22;
const EPS_HB = 1.15;
const HB_R0 = 0.96;
const HB_WIDTH = 0.24;
const BOND = 0.305;
const HALF_ANGLE = 52.25 * Math.PI / 180;
const INERTIA = 0.16;
const SUBSTEP = 0.004;
const PHASES = {
  solid: { label: "Sólido", target: 0.12 },
  liquid: { label: "Líquido", target: 0.38 },
  gas: { label: "Gas", target: 1.15 },
};

function ljPotential(r) {
  const safe = Math.max(0.72, r);
  const s6 = Math.pow(SIGMA / safe, 6);
  return 4 * EPS_LJ * (s6 * s6 - s6);
}

function donorAlignment(theta, phi) {
  let sum = 0, deriv = 0;
  for (const side of [-1, 1]) {
    const delta = phi - (theta + side * HALF_ANGLE);
    const c = Math.max(0, Math.cos(delta));
    sum += Math.pow(c, 4);
    if (c > 0) deriv += 4 * Math.pow(c, 3) * Math.sin(delta);
  }
  return { sum, deriv };
}

// ---------- navegador ----------
if (typeof document !== "undefined") (function () {
const $ = id => document.getElementById(id);
const canvas = $("sim"), ctx = canvas.getContext("2d");
const COLORS = { bg: "#0d1117", O: "#f85149", H: "#e6edf3", hb: "#58a6ff", gold: "#f0c000" };

let molecules = [], bonds = [], phase = "liquid", targetT = PHASES.liquid.target;
let particleTarget = DEFAULT_PARTICLES, manualCount = 0, perfEma = 16.7, lastAdapt = 0;
let paused = false, box = { x: 0, y: 0, w: 0, h: 0 }, unit = 40;
let W = 0, H = 0, frameCount = 0, statCount = 0, fpsWindow = [];
let last = performance.now(), prng = 90210;

function rand() {
  prng = (1664525 * prng + 1013904223) >>> 0;
  return prng / 4294967296;
}
function gaussian() {
  return Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-10))) * Math.cos(2 * Math.PI * rand());
}
function fit() {
  const dpr = window.devicePixelRatio || 1;
  W = canvas.clientWidth; H = canvas.clientHeight;
  if (!W || !H) return false;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  unit = Math.max(25, Math.min(52, Math.min(W, H) * 0.078));
  return true;
}

function setBox() {
  const n = molecules.length || particleTarget;
  const density = phase === "gas" ? 0.30 : phase === "liquid" ? 0.52 : 0.62;
  const aspect = phase === "gas" ? 1.22 : 0.82;
  const maxArea = Math.max(1, ((W - 40) / unit) * ((H - 40) / unit));
  const need = Math.sqrt(n / density);
  let w = need, h = need * aspect;
  if (w * h > maxArea) { const k = Math.sqrt(maxArea / (w * h)); w *= k; h *= k; }
  box.w = Math.max(8, w);
  box.h = Math.max(6.5, h);
  // Molecule coordinates are local to the centered simulation box.
  box.x = 0;
  box.y = 0;
}

function newMolecule(x, y, theta, thermalScale = 0.45) {
  return {
    x, y, theta,
    vx: gaussian() * thermalScale,
    vy: gaussian() * thermalScale,
    omega: gaussian() * thermalScale * 0.55,
    fx: 0, fy: 0, torque: 0,
  };
}

function initializePositions() {
  molecules = [];
  if (phase === "solid") {
    const nx = Math.max(4, Math.ceil(Math.sqrt(particleTarget * box.w / Math.max(1, box.h))));
    const ny = Math.ceil(particleTarget / nx), spacing = Math.min(1.15, Math.max(0.88, Math.sqrt((box.w * box.h) / particleTarget)));
    const gridW = (nx - 1) * spacing, gridH = (ny - 1) * spacing * 0.88;
    for (let row = 0; row < ny; row++) {
      for (let col = 0; col < nx; col++) {
        const x = box.x + box.w / 2 - gridW / 2 + col * spacing + (row % 2) * spacing / 2;
        const y = box.y + box.h / 2 - gridH / 2 + row * spacing * 0.88;
        molecules.push(newMolecule(x, y, (row + col) % 2 ? 0 : Math.PI, 0.16));
      }
    }
  } else {
    let attempts = 0;
    while (molecules.length < particleTarget && attempts++ < 12000) {
      const x = box.x + 0.8 + rand() * (box.w - 1.6);
      const y = box.y + 0.8 + rand() * (box.h - 1.6);
      if (molecules.every(m => (m.x - x) ** 2 + (m.y - y) ** 2 > 0.78 ** 2)) {
        molecules.push(newMolecule(x, y, rand() * Math.PI * 2, Math.sqrt(targetT) * 0.78));
      }
    }
    // Fallback only for narrow/mobile boxes where rejection sampling packs slowly.
    while (molecules.length < particleTarget) {
      const i = molecules.length, cols = Math.max(4, Math.ceil(Math.sqrt(particleTarget)));
      const x = box.x + 0.9 + (i % cols) * Math.max(0.9, (box.w - 1.8) / (cols - 1));
      const y = box.y + 0.9 + Math.floor(i / cols) * 0.95;
      molecules.push(newMolecule(Math.min(box.x + box.w - 0.6, x), Math.min(box.y + box.h - 0.6, y), rand() * Math.PI * 2, Math.sqrt(targetT) * 0.78));
    }
  }
  bonds = [];
}

function resizeParticles(next) {
  next = Math.max(MIN_PARTICLES, Math.min(MAX_PARTICLES, Math.round(next)));
  if (next === molecules.length) return;
  if (next < molecules.length) { molecules.length = next; }
  else {
    while (molecules.length < next) {
      const x = box.x + 0.8 + rand() * Math.max(1, box.w - 1.6);
      const y = box.y + 0.8 + rand() * Math.max(1, box.h - 1.6);
      molecules.push(newMolecule(x, y, rand() * Math.PI * 2, Math.sqrt(targetT) * 0.55));
    }
  }
  particleTarget = next;
  setBox();
  computeForces();
  updateStats();
}

function chooseParticleCount(mode) {
  if (mode === "auto") {
    const area = Math.max(1, W * H);
    const base = Math.round(area / 2600);
    particleTarget = Math.max(MIN_PARTICLES, Math.min(MAX_PARTICLES, base));
    manualCount = 0;
  } else {
    manualCount = Math.max(MIN_PARTICLES, Math.min(MAX_PARTICLES, +mode || DEFAULT_PARTICLES));
    particleTarget = manualCount;
  }
  resizeParticles(particleTarget);
  const countRead = document.getElementById("countRead");
  const countReadSide = document.getElementById("countReadSide");
  const countSel = document.getElementById("count");
  const countSelSide = document.getElementById("countSide");
  const label = manualCount ? String(particleTarget) : "auto";
  if (countRead) countRead.textContent = particleTarget;
  if (countReadSide) countReadSide.textContent = `${particleTarget} (${label})`;
  if (countSel) countSel.value = mode === "auto" ? "auto" : String(particleTarget);
  if (countSelSide) countSelSide.value = mode === "auto" ? "auto" : String(particleTarget);
}

function adaptParticles(dtMs) {
  perfEma = perfEma * 0.92 + dtMs * 0.08;
  fpsWindow.push(dtMs);
  if (fpsWindow.length > 45) fpsWindow.shift();
  const now = performance.now();
  if (now - lastAdapt < 1800) return;
  lastAdapt = now;
  const avg = fpsWindow.reduce((a, b) => a + b, 0) / fpsWindow.length;
  if (manualCount) return;
  if (avg > 24 && particleTarget < MAX_PARTICLES) {
    resizeParticles(Math.min(MAX_PARTICLES, particleTarget + Math.max(6, Math.round(particleTarget * 0.08))));
  } else if (avg > 34 && particleTarget < MAX_PARTICLES) {
    resizeParticles(Math.min(MAX_PARTICLES, particleTarget + Math.max(4, Math.round(particleTarget * 0.05))));
  } else if (avg < 13 && particleTarget > MIN_PARTICLES) {
    resizeParticles(Math.max(MIN_PARTICLES, particleTarget - Math.max(6, Math.round(particleTarget * 0.10))));
  }
}

function reset(nextPhase = phase) {
  phase = nextPhase;
  targetT = PHASES[phase].target;
  $("temp").value = Math.round(targetT * 100);
  $("tempVal").textContent = targetT.toFixed(2);
  $("tempRead").textContent = targetT.toFixed(2);
  document.querySelectorAll("#phases button").forEach(b => b.classList.toggle("on", b.dataset.phase === phase));
  if (!fit()) { requestAnimationFrame(() => reset(nextPhase)); return; }
  particleTarget = manualCount || particleTarget;
  setBox();
  prng = 90210 + Math.round(targetT * 1000);
  initializePositions();
  computeForces();
  updateStats();
}

function alignmentDerivative(theta, phi) {
  return donorAlignment(theta, phi);
}

function addPairForce(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const r2 = dx * dx + dy * dy;
  if (r2 >= CUTOFF * CUTOFF) return;
  const r = Math.max(0.72, Math.sqrt(r2));
  const phi = Math.atan2(dy, dx);

  // Short-range isotropic repulsion/dispersion between oxygen sites.
  const sr6 = Math.pow(SIGMA / r, 6);
  let dUdr = 24 * EPS_LJ / r * (sr6 - 2 * sr6 * sr6);

  // Effective directional attraction when an O-H axis points at a neighbor.
  let Ai = 0, Aj = 0, dAi = 0, dAj = 0;
  if (r < 1.8) {
    const ai = alignmentDerivative(a.theta, phi);
    const aj = alignmentDerivative(b.theta, phi + Math.PI);
    Ai = ai.sum; Aj = aj.sum; dAi = ai.deriv; dAj = aj.deriv;
    const dr = r - HB_R0;
    const g = Math.exp(-0.5 * (dr / HB_WIDTH) ** 2);
    const orient = Ai + Aj;
    dUdr += EPS_HB * g * dr / (HB_WIDTH * HB_WIDTH) * orient;
    a.torque += EPS_HB * g * dAi;
    b.torque += EPS_HB * g * dAj;
    if (r < 1.38 && (Ai > 0.62 || Aj > 0.62)) bonds.push([a, b]);
  }
  dUdr = Math.max(-70, Math.min(70, dUdr));
  const fx = dUdr * dx / r, fy = dUdr * dy / r;
  a.fx += fx; a.fy += fy;
  b.fx -= fx; b.fy -= fy;
}

function computeForces() {
  for (const m of molecules) { m.fx = 0; m.fy = 0; m.torque = 0; }
  bonds = [];
  const cells = new Map();
  const key = (x, y) => `${x},${y}`;
  for (let i = 0; i < molecules.length; i++) {
    const m = molecules[i], cx = Math.floor(m.x / CUTOFF), cy = Math.floor(m.y / CUTOFF);
    const k = key(cx, cy);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(i);
  }
  // Each molecule checks only its 3×3 cell neighborhood, not all N bodies.
  for (let i = 0; i < molecules.length; i++) {
    const a = molecules[i], cx = Math.floor(a.x / CUTOFF), cy = Math.floor(a.y / CUTOFF);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const list = cells.get(key(cx + ox, cy + oy));
      if (!list) continue;
      for (const j of list) if (j > i) addPairForce(a, molecules[j]);
    }
  }
}

function enforceWalls(m) {
  const pad = 0.25;
  const xmin = box.x + pad, xmax = box.x + box.w - pad;
  const ymin = box.y + pad, ymax = box.y + box.h - pad;
  if (m.x < xmin) { m.x = xmin; m.vx = Math.abs(m.vx) * 0.72; }
  if (m.x > xmax) { m.x = xmax; m.vx = -Math.abs(m.vx) * 0.72; }
  if (m.y < ymin) { m.y = ymin; m.vy = Math.abs(m.vy) * 0.72; }
  if (m.y > ymax) { m.y = ymax; m.vy = -Math.abs(m.vy) * 0.72; }
}

function thermostat() {
  let kinetic = 0;
  for (const m of molecules)
    kinetic += 0.5 * (m.vx * m.vx + m.vy * m.vy + INERTIA * m.omega * m.omega);
  const current = 2 * kinetic / Math.max(1, 3 * molecules.length - 2);
  if (current < 1e-8) return;
  const factor = Math.max(0.9, Math.min(1.1, Math.sqrt(targetT / current)));
  // Weak velocity rescaling approximates a thermostat without freezing collisions.
  const blend = 0.16;
  const scale = 1 + (factor - 1) * blend;
  for (const m of molecules) { m.vx *= scale; m.vy *= scale; m.omega *= scale; }
}

function integrate(dt) {
  for (const m of molecules) {
    m.vx += 0.5 * m.fx * dt; m.vy += 0.5 * m.fy * dt;
    m.omega += 0.5 * m.torque / INERTIA * dt;
    m.x += m.vx * dt; m.y += m.vy * dt; m.theta += m.omega * dt;
    enforceWalls(m);
  }
  computeForces();
  for (const m of molecules) {
    m.vx += 0.5 * m.fx * dt; m.vy += 0.5 * m.fy * dt;
    m.omega += 0.5 * m.torque / INERTIA * dt;
  }
}

function actualTemperature() {
  let k = 0;
  for (const m of molecules) k += 0.5 * (m.vx * m.vx + m.vy * m.vy + INERTIA * m.omega * m.omega);
  return 2 * k / Math.max(1, 3 * molecules.length - 2);
}

function drawMolecule(m) {
  const ox = box.x * unit + (W - box.w * unit) / 2;
  const oy = box.y * unit + (H - box.h * unit) / 2;
  const x = ox + m.x * unit, y = oy + m.y * unit;
  const h1 = [x + BOND * unit * Math.cos(m.theta - HALF_ANGLE), y + BOND * unit * Math.sin(m.theta - HALF_ANGLE)];
  const h2 = [x + BOND * unit * Math.cos(m.theta + HALF_ANGLE), y + BOND * unit * Math.sin(m.theta + HALF_ANGLE)];
  ctx.strokeStyle = "rgba(201,209,217,0.62)"; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(h1[0], h1[1]); ctx.moveTo(x, y); ctx.lineTo(h2[0], h2[1]); ctx.stroke();
  ctx.fillStyle = COLORS.O; ctx.shadowColor = COLORS.O; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(x, y, Math.max(4.3, unit * 0.13), 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = COLORS.H;
  for (const h of [h1, h2]) { ctx.beginPath(); ctx.arc(h[0], h[1], Math.max(2.5, unit * 0.073), 0, Math.PI * 2); ctx.fill(); }
}

function draw() {
  if (!fit()) return;
  ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.48, 5, W * 0.5, H * 0.48, Math.max(W, H) * 0.7);
  glow.addColorStop(0, "rgba(24,55,77,0.22)"); glow.addColorStop(1, "rgba(13,17,23,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  const bx = (W - box.w * unit) / 2, by = (H - box.h * unit) / 2;
  ctx.strokeStyle = "rgba(139,148,158,0.44)"; ctx.lineWidth = 1.2; ctx.setLineDash([5, 5]);
  ctx.strokeRect(bx, by, box.w * unit, box.h * unit); ctx.setLineDash([]);
  // Hydrogen bonds are drawn behind molecules as a transient network.
  ctx.strokeStyle = "rgba(88,166,255,0.38)"; ctx.lineWidth = 1.4; ctx.setLineDash([3, 4]);
  for (const [a, b] of bonds) {
    ctx.beginPath();
    ctx.moveTo(bx + a.x * unit, by + a.y * unit);
    ctx.lineTo(bx + b.x * unit, by + b.y * unit); ctx.stroke();
  }
  ctx.setLineDash([]);
  molecules.forEach(drawMolecule);
  ctx.fillStyle = "#8b949e"; ctx.font = "11px system-ui"; ctx.textAlign = "center";
  ctx.fillText("caja de simulación 2D", W / 2, H - 8);
}

function updateStats() {
  const phaseLabel = PHASES[phase].label;
  $("phaseName").textContent = phaseLabel;
  $("tempRead").textContent = targetT.toFixed(2);
  $("nRead").textContent = molecules.length;
  const countRead = $("countRead");
  const countReadSide = $("countReadSide");
  if (countRead) countRead.textContent = particleTarget;
  if (countReadSide) countReadSide.textContent = `${particleTarget} (${manualCount ? "manual" : "auto"})`;
  $("hbRead").textContent = bonds.length;
  $("tempVal").textContent = targetT.toFixed(2);
  $("label").textContent = `${phaseLabel} · H₂O rígidas · T* ${targetT.toFixed(2)} · ${bonds.length} puentes H próximos`;
  const descriptions = {
    solid: "Inicio sólido: una red compacta ordenada vibra alrededor de posiciones fijas. Calienta para desordenarla.",
    liquid: "Inicio líquido: moléculas densas y móviles forman y rompen puentes de hidrógeno continuamente.",
    gas: "Inicio gaseoso: moléculas más separadas recorren la caja y chocan ocasionalmente.",
  };
  $("phaseDesc").innerHTML = `<b>${phaseLabel}:</b> ${descriptions[phase]}`;
}

$("phases").querySelectorAll("button").forEach(b => b.onclick = () => reset(b.dataset.phase));
$("btnReset").onclick = () => reset(phase);
$("btnRun").onclick = () => {
  paused = !paused;
  $("btnRun").textContent = paused ? "▶ continuar" : "⏸ dinámica";
};
const syncCount = e => chooseParticleCount(e.target.value);
$("count").onchange = syncCount;
$("countSide").onchange = syncCount;
$("temp").oninput = e => {
  targetT = +e.target.value / 100;
  $("tempVal").textContent = targetT.toFixed(2);
  $("tempRead").textContent = targetT.toFixed(2);
};
window.addEventListener("resize", () => reset(phase));

function frame(now) {
  const frameStart = performance.now();
  const realDt = Math.min(0.04, Math.max(0, (now - last) / 1000));
  last = now;
  if (!paused && molecules.length) {
    const total = realDt * 0.9;
    const nSteps = Math.max(1, Math.ceil(total / SUBSTEP));
    const dt = total / nSteps;
    for (let i = 0; i < nSteps; i++) integrate(dt);
    if (++statCount % 8 === 0) thermostat();
  }
  draw();
  if (++frameCount % 12 === 0) updateStats();
  adaptParticles(performance.now() - frameStart);
  requestAnimationFrame(frame);
}

if (fit()) { chooseParticleCount("auto"); reset("liquid"); }
requestAnimationFrame(frame);
})();

if (typeof module !== "undefined")
  module.exports = { MIN_PARTICLES, MAX_PARTICLES, DEFAULT_PARTICLES, SIGMA, CUTOFF, EPS_LJ, EPS_HB, ljPotential, donorAlignment, PHASES };
})();
