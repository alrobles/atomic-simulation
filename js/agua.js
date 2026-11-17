/* agua.js — geometría y visualización de H₂O.
 * Vista Molécula/Vibración: modelo VSEPR cualitativo.
 * Vista Densidad: si data/h2o_density.bin existe, nube muestreada de la
 * densidad electrónica real RHF/STO-3G (PySCF); si no, esquema ilustrativo. */
(function () {
"use strict";

const ANGLE_DEG = 104.5;
const BOND_ANGSTROM = 0.9584;
const DIPOLE_DEBYE = 1.85;
const DENSITY_POINTS = 5300;

/** Coordenadas nucleares en el plano molecular; O está en el origen. */
function waterGeometry(angleDeg = ANGLE_DEG, bondAngstrom = BOND_ANGSTROM) {
  const a = angleDeg * Math.PI / 360;
  return {
    O: [0, 0, 0],
    H1: [bondAngstrom * Math.sin(a), -bondAngstrom * Math.cos(a), 0],
    H2: [-bondAngstrom * Math.sin(a), -bondAngstrom * Math.cos(a), 0],
  };
}

/** Ángulo entre los dos enlaces en grados, para verificar las coordenadas. */
function angleBetweenBonds(g) {
  const [ax, ay, az] = g.H1, [bx, by, bz] = g.H2;
  const dot = ax * bx + ay * by + az * bz;
  const na = Math.hypot(ax, ay, az), nb = Math.hypot(bx, by, bz);
  return Math.acos(Math.max(-1, Math.min(1, dot / (na * nb)))) * 180 / Math.PI;
}

// ---------- navegador ----------
if (typeof document !== "undefined") (function () {
const $ = id => document.getElementById(id);
const canvas = $("mol"), ctx = canvas.getContext("2d");
const colors = {
  bg: "#0d1117", oxygen: "#f85149", hydrogen: "#e6edf3",
  bond: "#9da7b3", density: "#58a6ff", bondDensity: "#9acbff",
  gold: "#f0c000", text: "#c9d1d9", muted: "#8b949e",
};

let view = "structure", vibMode = "symmetric", playing = false, spinning = true;
let angleDeg = ANGLE_DEG, yaw = -0.38, pitch = 0.2, zoom = 1;
let drag = null, lastTime = performance.now(), animTime = 0;
let W = 0, H = 0;
// Orbitales moleculares: isosuperficies |ψ|=iso muestreadas (data/mo_*.bin).
const MO_IDX = { homo1: 3, homo: 4, lumo: 5 };
const MO_LABEL = { homo1: "MO 3 · HOMO-1", homo: "MO 4 · HOMO", lumo: "MO 5 · LUMO" };
let moOrb = "homo", moClouds = {}, moEnergies = null;

// Fija la nube aleatoria para que no parpadee entre fotogramas.
let seed = 73421;
function random() {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 4294967296;
}
function normal() {
  const u = Math.max(random(), 1e-9), v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const densitySamples = { core: [], lone: [[], []], bond: [[], []] };
// Densidad real RHF/sto-3g: Float32 [x,y,z,w]*N en coordenadas de waterGeometry.
let realDensity = null, hfInfo = null;
fetch("data/h2o_density.bin").then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status))
  .then(buf => { realDensity = new Float32Array(buf); })
  .catch(() => {});
fetch("data/h2o_info.json").then(r => r.ok ? r.json() : Promise.reject(r.status))
  .then(j => { hfInfo = j; })
  .catch(() => {});
// Isosuperficies MO: carga perezosa por orbital; energías desde data.json del HF.
function ensureMo(tag) {
  if (moClouds[tag]) return Promise.resolve(moClouds[tag]);
  const load = f => fetch("data/" + f).then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status))
    .then(b => new Float32Array(b));
  return Promise.all([load(`mo_${tag}_pos.bin`), load(`mo_${tag}_neg.bin`)])
    .then(([pos, neg]) => (moClouds[tag] = { pos, neg }))
    .catch(() => null);
}
fetch("overnight/h2o/data.json").then(r => r.ok ? r.json() : Promise.reject(r.status))
  .then(j => { moEnergies = j.mo_energies_ev; })
  .catch(() => {});
for (let i = 0; i < 600; i++) {
  densitySamples.core.push({ x: normal() * 0.14, y: normal() * 0.14, z: normal() * 0.14 });
}
for (let pair = 0; pair < 2; pair++) {
  for (let i = 0; i < 1450; i++) {
    densitySamples.lone[pair].push({
      x: normal() * 0.17, y: normal() * 0.23, z: normal() * 0.14,
    });
  }
}
for (let bond = 0; bond < 2; bond++) {
  for (let i = 0; i < 900; i++) {
    densitySamples.bond[bond].push({
      t: 0.24 + random() * 0.68,
      n1: normal() * 0.075,
      n2: normal() * 0.075,
    });
  }
}

function fit() {
  const dpr = window.devicePixelRatio || 1;
  W = canvas.clientWidth; H = canvas.clientHeight;
  if (!W || !H) return false;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return true;
}

function project(p) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const x1 = p[0] * cy - p[2] * sy;
  const z1 = p[0] * sy + p[2] * cy;
  const y2 = p[1] * cp - z1 * sp;
  const z2 = p[1] * sp + z1 * cp;
  const perspective = 1 / (1 + z2 * 0.13);
  const scale = Math.min(W, H) * 0.43 * zoom * perspective;
  return { x: W / 2 + x1 * scale, y: H * 0.52 - y2 * scale, z: z2, scale };
}

function animatedGeometry() {
  let a = angleDeg, s1 = 0, s2 = 0;
  if (playing) {
    const wave = Math.sin(animTime * 2.2);
    if (vibMode === "symmetric") s1 = s2 = 0.07 * wave;
    else if (vibMode === "asymmetric") { s1 = 0.07 * wave; s2 = -0.07 * wave; }
    else a += 8 * wave;
  }
  const g = waterGeometry(a, BOND_ANGSTROM);
  g.H1 = g.H1.map(v => v * (1 + s1));
  g.H2 = g.H2.map(v => v * (1 + s2));
  return { g, angle: a };
}

function drawBackground() {
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.52, 10, W * 0.5, H * 0.52, Math.max(W, H) * 0.62);
  glow.addColorStop(0, "rgba(28,54,76,0.28)");
  glow.addColorStop(1, "rgba(13,17,23,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(139,148,158,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(W * 0.12, H * 0.52); ctx.lineTo(W * 0.88, H * 0.52);
  ctx.moveTo(W * 0.5, H * 0.15); ctx.lineTo(W * 0.5, H * 0.88); ctx.stroke();
}

function lonePairCenter(pair, angle) {
  // Dos lóbulos esquemáticos en el lado opuesto a los enlaces O–H.
  const a = (42 + (angle - ANGLE_DEG) * 0.18) * Math.PI / 180;
  return [(pair ? -1 : 1) * Math.sin(a) * 0.48, Math.cos(a) * 0.48, 0];
}

function drawDensity(g, angle) {
  // 5,300 muestras; transformar en un lote reduce trigonometría y cambios de estilo.
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const base = Math.min(W, H) * 0.43 * zoom;
  const cx = W / 2, cy0 = H * 0.52;
  const point = (x, y, z, size) => {
    const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
    const y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    const scale = base / (1 + z2 * 0.13);
    ctx.fillRect(cx + x1 * scale, cy0 - y1 * scale, size, size);
  };
  // Densidad electrónica real RHF/STO-3G: 50k muestras ∝ ρ(r), tamaño ∝ peso local.
  if (realDensity) {
    const n = realDensity.length, d = realDensity;
    ctx.globalAlpha = 0.42; ctx.fillStyle = colors.density;
    for (let i = 0; i < n; i += 4) {
      const s = 1.0 + d[i + 3] * 1.5;
      point(d[i], d[i + 1], d[i + 2], s);
    }
    ctx.globalAlpha = 1;
    return;
  }
  // Muestras didácticas de regiones electrónicas; no son electrones individuales.
  ctx.globalAlpha = 0.28; ctx.fillStyle = colors.oxygen;
  for (const q of densitySamples.core) point(q.x, q.y, q.z, 1.7);
  ctx.globalAlpha = 0.34; ctx.fillStyle = colors.density;
  for (let pair = 0; pair < 2; pair++) {
    const c = lonePairCenter(pair, angle);
    for (const q of densitySamples.lone[pair]) point(c[0] + q.x, c[1] + q.y, q.z, 1.5);
  }
  ctx.globalAlpha = 0.28; ctx.fillStyle = colors.bondDensity;
  for (let bond = 0; bond < 2; bond++) {
    const h = bond ? g.H2 : g.H1;
    const len = Math.hypot(h[0], h[1]) || 1, px = -h[1] / len, py = h[0] / len;
    for (const q of densitySamples.bond[bond]) {
      point(h[0] * q.t + px * q.n1, h[1] * q.t + py * q.n1, q.n2, 1.45);
    }
  }
  ctx.globalAlpha = 1;
}

// Isosuperficie |ψ|=iso de un MO real (RHF/STO-3G): puntos muestreados en la
// envolvente, azul ψ>0 / naranja ψ<0 — misma convención de fase del sitio.
function drawMo() {
  const d = moClouds[moOrb];
  if (!d) return;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const base = Math.min(W, H) * 0.43 * zoom;
  const cx = W / 2, cy0 = H * 0.52;
  const shell = (arr, color, alpha, size) => {
    ctx.globalAlpha = alpha; ctx.fillStyle = color;
    const n = arr.length;
    for (let i = 0; i < n; i += 3) {
      const x = arr[i], y = arr[i + 1], z = arr[i + 2];
      const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
      const y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      const scale = base / (1 + z2 * 0.13);
      ctx.fillRect(cx + x1 * scale, cy0 - y1 * scale, size, size);
    }
  };
  shell(d.pos, "#4dabf7", 0.5, 1.55);   // ψ > 0
  shell(d.neg, "#ff922b", 0.5, 1.55);   // ψ < 0
  ctx.globalAlpha = 1;
}

function drawBond(a, b) {
  const p = project(a), q = project(b);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = 11 * Math.min(p.scale, q.scale) / (Math.min(W, H) * 0.43);
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
  ctx.strokeStyle = colors.bond; ctx.lineWidth = 6 * Math.min(p.scale, q.scale) / (Math.min(W, H) * 0.43);
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
  ctx.restore();
}

function drawAtom(atom, label, color, radius, charge) {
  const p = project(atom);
  const r = radius * Math.min(W, H) / 500 * zoom * (1 + p.z * 0.07);
  const grad = ctx.createRadialGradient(p.x - r * 0.32, p.y - r * 0.38, r * 0.08, p.x, p.y, r);
  if (color === colors.oxygen) {
    grad.addColorStop(0, "#ffb4a9"); grad.addColorStop(0.48, "#f85149"); grad.addColorStop(1, "#7d2023");
  } else {
    grad.addColorStop(0, "#ffffff"); grad.addColorStop(0.55, "#dce7ef"); grad.addColorStop(1, "#718096");
  }
  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = label === "O" ? 22 : 12;
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#0d1117"; ctx.font = `700 ${Math.max(11, r * 0.8)}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(label, p.x, p.y + 1);
  ctx.textBaseline = "alphabetic";
  if (view === "density") {
    ctx.fillStyle = label === "O" ? "#ff8a80" : "#e6edf3";
    ctx.font = "bold 12px system-ui"; ctx.textAlign = "center";
    ctx.fillText(charge, p.x, p.y - r - 7);
  }
}

function drawAngle(g, angle) {
  const o = project(g.O), a = project(g.H1), b = project(g.H2);
  ctx.save();
  ctx.strokeStyle = "rgba(240,192,0,0.72)"; ctx.lineWidth = 1.4; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(a.x, a.y); ctx.moveTo(o.x, o.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.setLineDash([]);
  const ra = Math.atan2(a.y - o.y, a.x - o.x), rb = Math.atan2(b.y - o.y, b.x - o.x);
  ctx.beginPath(); ctx.arc(o.x, o.y, Math.min(W, H) * 0.13, ra, rb); ctx.stroke();
  ctx.fillStyle = colors.gold; ctx.font = "bold 13px system-ui"; ctx.textAlign = "center";
  ctx.fillText(`${angle.toFixed(1)}°`, o.x, o.y + Math.min(H * 0.17, 95));
  ctx.restore();
}

function drawLabels(g) {
  ctx.fillStyle = colors.muted; ctx.font = "12px system-ui"; ctx.textAlign = "center";
  const c = project([0, 0.83, 0]);
  ctx.fillText("pares libres (esquema)", c.x, c.y - 10);
  // Flecha del dipolo: desde el lado positivo hacia el oxígeno.
  const o = project(g.O), mid = project([0, -0.58, 0]);
  ctx.strokeStyle = colors.gold; ctx.fillStyle = colors.gold; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(mid.x, mid.y); ctx.lineTo(o.x, o.y - 26); ctx.stroke();
  const ang = Math.atan2(o.y - 26 - mid.y, o.x - mid.x);
  ctx.beginPath(); ctx.moveTo(o.x, o.y - 26);
  ctx.lineTo(o.x - 7 * Math.cos(ang - 0.45), o.y - 26 - 7 * Math.sin(ang - 0.45));
  ctx.lineTo(o.x - 7 * Math.cos(ang + 0.45), o.y - 26 - 7 * Math.sin(ang + 0.45));
  ctx.closePath(); ctx.fill();
  ctx.font = "11px system-ui"; ctx.fillText("μ", mid.x + 13, mid.y);
}

function updateText(angle) {
  const real = view === "density" && realDensity;
  const mo = view === "mo";
  const nPts = real ? realDensity.length / 4 : DENSITY_POINTS;
  const labels = {
    structure: ["Molécula", "Modelo de bolas y varillas: O rojo, H claro; los núcleos forman un ángulo de 104.5°."],
    density: [real ? "Densidad electrónica · RHF/STO-3G" : "Densidad electrónica (esquema)",
      real ? "Puntos muestreados de ρ(r) calculada con Hartree-Fock/STO-3G (PySCF) en la geometría de equilibrio; no son electrones individuales. El tamaño del punto crece con la densidad local."
           : "Puntos = muestras ilustrativas de densidad en enlaces y pares libres; no son electrones individuales ni un cálculo molecular exacto."],
    mo: ["Orbital molecular · RHF/STO-3G",
      "Isosuperficie |ψ|=const muestreada como puntos: azul ψ>0, naranja ψ<0. El plano nodal separa los lóbulos de fase opuesta."],
    vibration: ["Vibración molecular", vibMode === "bend" ? "Flexión: cambia el ángulo H–O–H; la animación está ralentizada para verla." : vibMode === "asymmetric" ? "Estiramiento asimétrico: un enlace O–H se alarga mientras el otro se acorta." : "Estiramiento simétrico: ambos enlaces O–H se alargan y acortan juntos."],
  };
  $("sceneLabel").innerHTML = `<b>${labels[view][0]}</b> · ${labels[view][1]}`;
  const hf = real && hfInfo
    ? ` · E_HF ${hfInfo.E_hartree.toFixed(2)} Ha · μ ${hfInfo.dipole_debye.toFixed(2)} D · q(O) ${hfInfo.mulliken_charges.O.toFixed(2)}e`
    : "";
  const moE = mo && moEnergies ? ` · ε = ${moEnergies[MO_IDX[moOrb]].toFixed(1)} eV` : "";
  $("modeInfo").textContent = mo
    ? `${MO_LABEL[moOrb]}${moE} · isosuperficie |ψ|=iso · fase + azul / − naranja · RHF/STO-3G`
    : `Ángulo actual: ${angle.toFixed(1)}° · longitud O–H: ${BOND_ANGSTROM.toFixed(4)} Å · momento dipolar: ${DIPOLE_DEBYE} D` +
      (view === "density" ? ` · ${Math.round(nPts).toLocaleString("es")} muestras${hf}` : "");
  $("densityText").innerHTML = mo
    ? "Los puntos muestrean la <b>envolvente isosuperficial</b> del orbital molecular real (|ψ|=const, RHF/STO-3G): cada punto es una posición sobre la superficie, no un electrón. Azul/naranja distinguen el signo de ψ — fase cuántica, no carga eléctrica. El LUMO es virtual: no contiene electrones en el estado fundamental."
    : view === "density"
    ? (real
      ? "Los puntos son <b>muestras de la densidad electrónica real</b> (HF/STO-3G, base mínima): la distribución cuántica de los 10 electrones en el estado fundamental. No son electrones individuales ni un cálculo con correlación."
      : "Los puntos son <b>muestras</b> de un esquema de densidad electrónica, no electrones individuales.")
    : "La vista <b>Molécula</b> muestra núcleos y enlaces como bolas y varillas: no dibuja electrones individuales.";
  $("angleControl").hidden = view === "vibration" || real || mo;
  $("vibControls").hidden = view !== "vibration";
  $("moSel").hidden = !mo;
}

function draw(now) {
  if (!fit()) return;
  drawBackground();
  if (spinning && !drag) yaw += 0.0018;
  // Con densidad real o MOs, la geometría es la de equilibrio HF (el ángulo editable no aplica).
  const fixed = (view === "density" && realDensity) || view === "mo";
  const { g, angle } = fixed
    ? { g: waterGeometry(ANGLE_DEG, BOND_ANGSTROM), angle: ANGLE_DEG }
    : animatedGeometry();
  if (view === "density") drawDensity(g, angle);
  if (view === "mo") drawMo();
  // Bonds are behind the atomic spheres.
  drawBond(g.O, g.H1); drawBond(g.O, g.H2);
  drawAngle(g, angle);
  if (view !== "structure") drawLabels(g);
  const atoms = [
    { xyz: g.O, label: "O", color: colors.oxygen, radius: 26, charge: "δ−" },
    { xyz: g.H1, label: "H", color: colors.hydrogen, radius: 15, charge: "δ+" },
    { xyz: g.H2, label: "H", color: colors.hydrogen, radius: 15, charge: "δ+" },
  ].map(a => ({ ...a, depth: project(a.xyz).z })).sort((a, b) => a.depth - b.depth);
  atoms.forEach(a => drawAtom(a.xyz, a.label, a.color, a.radius, a.charge));
  updateText(angle);
}

function setView(next) {
  view = next;
  document.querySelectorAll("#views button").forEach(b => b.classList.toggle("on", b.dataset.view === view));
  if (view === "mo") ensureMo(moOrb);
  if (view === "vibration") {
    $("btnVib").disabled = false;
  } else {
    playing = false;
    $("btnVib").textContent = "▶ animar";
  }
}

canvas.addEventListener("pointerdown", e => {
  drag = [e.clientX, e.clientY];
  canvas.classList.add("drag");
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", e => {
  if (!drag) return;
  yaw += (e.clientX - drag[0]) * 0.009;
  pitch = Math.max(-1.35, Math.min(1.35, pitch + (e.clientY - drag[1]) * 0.009));
  drag = [e.clientX, e.clientY];
});
canvas.addEventListener("pointerup", () => { drag = null; canvas.classList.remove("drag"); });
canvas.addEventListener("pointercancel", () => { drag = null; canvas.classList.remove("drag"); });
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  zoom = Math.max(0.55, Math.min(2.3, zoom * (e.deltaY < 0 ? 1.08 : 0.92)));
}, { passive: false });

document.querySelectorAll("#views button").forEach(b => b.onclick = () => setView(b.dataset.view));
document.querySelectorAll("#moSel button").forEach(b => b.onclick = () => {
  moOrb = b.dataset.mo;
  document.querySelectorAll("#moSel button").forEach(x => x.classList.toggle("on", x === b));
  ensureMo(moOrb);
});
document.querySelectorAll("#vibModes button").forEach(b => b.onclick = () => {
  vibMode = b.dataset.mode;
  document.querySelectorAll("#vibModes button").forEach(x => x.classList.toggle("on", x === b));
});
$("angle").oninput = e => {
  angleDeg = +e.target.value;
  $("angleVal").textContent = `${angleDeg.toFixed(1)}°`;
};
$("btnVib").onclick = () => {
  if (view !== "vibration") setView("vibration");
  playing = !playing;
  $("btnVib").textContent = playing ? "⏸ pausar" : "▶ animar";
};
$("btnSpin").onclick = () => {
  spinning = !spinning;
  $("btnSpin").textContent = spinning ? "⏸ giro" : "▶ giro";
};

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (playing) animTime += dt;
  draw(now);
  requestAnimationFrame(frame);
}
draw(performance.now());
requestAnimationFrame(frame);
})();

if (typeof module !== "undefined")
  module.exports = { ANGLE_DEG, BOND_ANGSTROM, DIPOLE_DEBYE, DENSITY_POINTS, waterGeometry, angleBetweenBonds };
})();
