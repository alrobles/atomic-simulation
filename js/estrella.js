/* estrella.js — ciclo de vida estelar: secuencia principal → gigante →
 * (enana blanca | supernova → neutrones | agujero negro) según la masa.
 * Modelo esquemático con anclas calibradas a valores reales. */
(function () {
"use strict";

// ---------- funciones puras ----------
/** temperatura (K) → [r,g,b] 0..255, aproximación de Tanner Helland */
function kelvin(T) {
  T = Math.min(40000, Math.max(1200, T)) / 100;
  let r, g, b;
  if (T <= 66) {
    r = 255; g = 99.4708025861 * Math.log(T) - 161.1195681661;
    b = T <= 19 ? 0 : 138.5177312231 * Math.log(T - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(T - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(T - 60, -0.0755148492);
    b = 255;
  }
  const c = v => Math.max(0, Math.min(255, Math.round(v)));
  return [c(r), c(g), c(b)];
}
const css = c => `rgb(${c[0]},${c[1]},${c[2]})`;

function fmtBig(y) {
  if (y >= 1e9) return (y / 1e9).toPrecision(2) + "×10⁹ años";
  if (y >= 1e6) return (y / 1e6).toPrecision(2) + "×10⁶ años";
  return "~10^" + Math.floor(Math.log10(y)) + " años";
}

/** Fases del ciclo de vida para una masa M (en M☉).
 *  Cada fase: {n,sub,yrs,burn,desc,fx,a,b} — a/b = anclas {L,R,T}
 *  con L,R en log10(Solar) y T en K. */
function phasesFor(M) {
  const lg = Math.log10;
  const lz = lg(Math.pow(M, 3.5)), rz = lg(Math.pow(M, 0.8));
  const Tz = 5778 * Math.pow(Math.pow(M, 1.9), 0.25);
  const A = (L, R, T) => ({ L, R, T });
  const tms = 1e10 * Math.pow(M, -2.5);
  const P = [];
  const push = (n, sub, yrs, burn, a, b, fx, desc) =>
    P.push({ n, sub, yrs, burn, a, b, fx: fx || null, desc: desc || "" });
  const tams = A(lz + 0.25, rz + 0.18, Tz * 0.93);

  if (M < 0.5) return [  // enana marrón: nunca enciende el hidrógeno
    { n: "Enana marrón", sub: "nunca alcanza la ignición estable", yrs: "~10¹⁰ años",
      burn: "— (solo deuterio inicial)", fx: null,
      a: A(0.5, 0.2, 2500), b: A(-2.5, 0.0, 900),
      desc: "M < 0.5 M☉: el centro nunca llega a ~10⁷ K. No hay secuencia principal — la " +
            "esfera se contrae, quema su deuterio inicial y se apaga como brasa tibia." },
    { n: "Enfriamiento", sub: "sin fuente de energía", yrs: "eterno",
      burn: "ninguna", fx: null,
      a: A(-2.5, 0.0, 900), b: A(-3.5, 0.0, 500),
      desc: "La enana marrón se convierte en un objeto casi invisible: masa de planeta, " +
            "temperatura de nevera cósmica." },
  ];

  push("Secuencia principal", "enana de secuencia principal", fmtBig(tms),
    M > 1.3 ? "H → He (ciclo CNO)" : "H → He (cadena pp)",
    A(lz, rz, Tz), tams, null,
    "La etapa adulta: el núcleo quema hidrógeno. La masa decide la potencia: L ∝ M^3.5.");

  if (M < 8) {  // ---------- camino a enana blanca ----------
    push("Subgigante", "se agota el H del núcleo", "~10⁹ años", "H en capa",
      tams, A(lz + 0.7, rz + 0.9, Tz * 0.78), null,
      "El núcleo se contrae y enciende una capa de H: la estrella se hincha.");
    const lrgb = 3.3 + 1.2 * lg(M), rrgb = 2.0 + 0.5 * lg(M);
    push("Rama de gigantes rojas", "inflación extrema", "~10⁹ años", "H en capa gruesa",
      A(lz + 0.7, rz + 0.9, Tz * 0.78), A(lrgb, rrgb, 3700), null,
      "La estrella se expande hasta ~100 R☉ y se enfría: gigante roja. Núcleo de He degenerado.");
    push("Flash de helio / rama horizontal", "ignición del He", "~10⁸ años", "He → C en el núcleo",
      A(lrgb, rrgb, 3700), A(1.85 + 0.8 * lg(M), 1.0 + 0.3 * lg(M), 6400), "flashHe",
      "El núcleo de He enciende (en estrellas <2 M☉, en un flash degenerado). La estrella se encoge y se recalienta.");
    push("Rama AGB", "doble capa de quemado", "~10⁶ años", "H y He en capas",
      A(1.85 + 0.8 * lg(M), 1.0 + 0.3 * lg(M), 6400), A(4.0 + 0.9 * lg(M), 2.3 + 0.4 * lg(M), 3200), null,
      "Capas de H y He queman a la vez con pulsos térmicos: la estrella se hincha de nuevo (gigante roja asintótica).");
    push("Nebulosa planetaria", "eyección de la envoltura", "~10⁴ años", "—",
      A(4.0 + 0.9 * lg(M), 2.3 + 0.4 * lg(M), 3200), A(0.3, -0.9, 80000), null,
      "La envoltura se expulsa: queda al descubierto el núcleo caliente de C/O.");
    push("Enana blanca", "enfriamiento residual", "~10¹⁰ años", "ninguna (enfría)",
      A(0.3, -0.9, 80000), A(-3.8, -1.85, 11000), null,
      "Un Sol comprimido en la Tierra: materia degenerada que brilla solo por calor residual.");
  } else {  // ---------- camino masivo → supernova ----------
    push("Supergigante roja", "H en capa, He en núcleo", "~10⁶ años", "He → C en capas",
      tams, A(lz + 1.2, rz + 1.6, 4000), null,
      "La estrella se convierte en supergigante: hasta ~1000 R☉. Empieza el quemado por capas.");
    push("Supergigante azul", "loop hacia el azul", "~10⁵ años", "He → C en el núcleo",
      A(lz + 1.2, rz + 1.6, 4000), A(lz + 1.1, rz + 0.9, 13000), null,
      "Al agotar el He del núcleo, la estrella se contrae y se calienta: lazo azul.");
    push("Quemado avanzado por capas", "capas cada vez más pesadas", "~10³–10⁵ años", "C→Ne→O→Si",
      A(lz + 1.1, rz + 0.9, 13000), A(lz + 1.3, rz + 1.4, 4200), null,
      "El núcleo quema carbono, neón, oxígeno y silicio en capas concéntricas — cada fase más corta que la anterior.");
    push("Núcleo de hierro", "colapso inminente", "segundos", "Fe (inerte)",
      A(lz + 1.3, rz + 1.4, 4200), A(lz + 1.25, rz + 1.35, 3800), "collapse",
      "El hierro no puede fusionarse: el núcleo degenera y colapsa en ~1 segundo.");
    const remL = -1.3, remR = -4.5;
    push("¡SUPERNOVA!", "explosión de colapso", "segundos–semanas", "todos los elementos",
      A(lz + 1.25, rz + 1.35, 3800), A(remL, remR, M < 25 ? 500000 : 0), "sn",
      "El rebote del núcleo libera ~10⁵³ erg: la explosión más luminosa del universo. Forja los elementos pesados.");
    if (M < 25)
      push("Estrella de neutrones", "remanente compacto", "mil años de enfriamiento", "—",
        A(remL, remR, 500000), A(remL - 0.5, remR, 200000), "ns",
        "~1.4 M☉ en ~20 km: la materia más densa conocida. Pulsa como púlsar.");
    else
      push("Agujero negro", "Horizonte de sucesos", "eterno", "—",
        A(remL, remR, 0), A(remL, remR, 0), "bh",
        "El núcleo supera la masa de Oppenheimer-Volkoff: ni la luz escapa.");
  }
  return P;
}

/** Destino final según la masa */
function fateFor(M) {
  if (M < 0.5) return ["Enana marrón", "nunca alcanza la ignición estable del hidrógeno; se apaga como brasa tibia."];
  if (M < 8) return ["Enana blanca", "núcleo de C/O degenerado (~0.6 M☉, ~R⊕) que se enfría por ~10¹⁰ años."];
  if (M < 25) return ["Estrella de neutrones", "supernova de colapso → ~1.4 M☉ comprimidas en ~20 km."];
  return ["Agujero negro", "supernova fallida o directa → horizonte de sucesos, ni la luz escapa."];
}

// ---------- navegador ----------
if (typeof document !== "undefined") (function () {

const $ = id => document.getElementById(id);
const sCv = $("starcv"), sCtx = sCv.getContext("2d");
const hCv = $("hrcv"), hCtx = hCv.getContext("2d");

let M = 1.0, phases = [], idx = 0, prog = 0, playing = false, speedMul = 1;
let trail = [], W = 0, H = 0, HW = 0, HH = 0;
let lastT = performance.now(), phaseT0 = lastT;
const PHASE_MS = 4800;

const fit = (cv, ctx) => {
  const d = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) {
    cv.width = Math.round(w * d); cv.height = Math.round(h * d);
  }
  ctx.setTransform(d, 0, 0, d, 0, 0);
  return { w, h };
};

// posición actual interpolada (a→b por u suavizado)
function curState(u) {
  const ph = phases[idx]; if (!ph) return null;
  const s = u * u * (3 - 2 * u);
  const L = ph.a.L + (ph.b.L - ph.a.L) * s;
  const R = ph.a.R + (ph.b.R - ph.a.R) * s;
  const T = Math.pow(10, Math.log10(ph.a.T || 1) + (Math.log10(ph.b.T || ph.a.T || 1) - Math.log10(ph.a.T || 1)) * s);
  return { L, R, T, ph };
}
const fmtR_km = Rlog => { const r = Math.pow(10, Rlog) * 695700; return r < 20000 ? (r / 1000).toFixed(0) + " km" : Math.pow(10, Rlog).toPrecision(2) + " R☉"; };
const fmtL_s = L => { const l = Math.pow(10, L); return l >= 100 ? l.toExponential(1) + " L☉" : l.toPrecision(2) + " L☉"; };
const fmtT_k = T => T >= 1e6 ? (T / 1e6).toFixed(1) + " MK" : T >= 1e4 ? (T / 1e3).toFixed(0) + " kK" : T.toFixed(0) + " K";

function buildPhases() {
  phases = phasesFor(M); idx = Math.min(idx, phases.length - 1); prog = 0; phaseT0 = performance.now();
  trail = [];
  const tl = $("tl"); tl.innerHTML = "";
  phases.forEach((p, i) => {
    const d = document.createElement("div");
    d.className = "ph" + (i === idx ? " on" : "");
    d.innerHTML = `<b>${p.n}</b>${p.sub}<br><span style="color:#6e7681">${p.yrs}</span>`;
    d.onclick = () => { idx = i; prog = 0; phaseT0 = performance.now(); syncUI(); };
    tl.appendChild(d);
  });
  syncUI();
}

function syncUI() {
  const ph = phases[idx]; if (!ph) return;
  $("kvPh").textContent = ph.n;
  $("kvDur").textContent = ph.yrs;
  $("kvBurn").textContent = ph.burn;
  document.querySelectorAll(".ph").forEach((d, i) => d.classList.toggle("on", i === idx));
  const f = fateFor(M);
  $("fate").innerHTML = `<b>Destino final:</b> ${f[0]} — ${f[1]}`;
}

// ---------- dibujo: estrella ----------
function drawStar(now) {
  const { w, h } = fit(sCv, sCtx);
  W = w; H = h;
  sCtx.fillStyle = "#0d1117"; sCtx.fillRect(0, 0, W, H);
  const st = curState(prog); if (!st) return;
  const cx = W / 2, cy = H * 0.40;
  // radio en px: logR ∈ [-2,3] → [9,175]
  let rp = 9 + (st.R + 2) / 5 * 166;
  rp = Math.max(4, Math.min(185, rp));
  const col = kelvin(st.T);
  const fx = st.ph.fx;

  if (fx === "sn") {
    // supernova: destello + ondas expansivas + implosión
    const p = prog;
    const flash = Math.max(0, 1 - p * 6);
    if (flash > 0) { sCtx.fillStyle = `rgba(255,255,240,${flash * 0.5})`; sCtx.fillRect(0, 0, W, H); }
    for (let k = 0; k < 3; k++) {
      const rr = (p * 1.15 - k * 0.12) * Math.max(W, H) * 0.55;
      if (rr > 0 && rr < Math.max(W, H)) {
        sCtx.strokeStyle = `rgba(255,${200 - k * 40},120,${(1 - p) * 0.55})`;
        sCtx.lineWidth = 3 - k * 0.7;
        sCtx.beginPath(); sCtx.arc(cx, cy, rr, 0, 7); sCtx.stroke();
      }
    }
    rp = Math.max(4, rp * (1 - p) + 4 * p);
  }
  if (fx === "bh") rp = Math.max(6, rp * 0.4);

  // halo
  const g = sCtx.createRadialGradient(cx, cy, rp * 0.2, cx, cy, rp * 2.6);
  g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},0.35)`);
  g.addColorStop(1, "rgba(13,17,23,0)");
  sCtx.fillStyle = g; sCtx.fillRect(0, 0, W, H);

  if (fx === "bh") {
    // agujero negro: disco negro + anillo de fotones
    sCtx.fillStyle = "#000"; sCtx.beginPath(); sCtx.arc(cx, cy, rp, 0, 7); sCtx.fill();
    const pu = 0.6 + 0.4 * Math.sin(now / 300);
    sCtx.strokeStyle = `rgba(190,160,255,${0.75 * pu})`; sCtx.lineWidth = 2;
    sCtx.beginPath(); sCtx.arc(cx, cy, rp + 3, 0, 7); sCtx.stroke();
    sCtx.strokeStyle = `rgba(190,160,255,${0.3 * pu})`; sCtx.lineWidth = 6;
    sCtx.beginPath(); sCtx.arc(cx, cy, rp + 5, 0, 7); sCtx.stroke();
  } else {
    // cuerpo estelar con oscurecimiento de limbo
    const body = sCtx.createRadialGradient(cx - rp * 0.3, cy - rp * 0.3, rp * 0.1, cx, cy, rp);
    const lite = col.map(v => Math.min(255, v + 60));
    body.addColorStop(0, css(lite)); body.addColorStop(0.7, css(col)); body.addColorStop(1, css(col.map(v => v * 0.55)));
    sCtx.fillStyle = body; sCtx.beginPath(); sCtx.arc(cx, cy, rp, 0, 7); sCtx.fill();
    // granulación en gigantes (barata)
    if (st.R > 1.4 && st.T < 5000) {
      sCtx.fillStyle = "rgba(0,0,0,0.10)";
      for (let k = 0; k < 7; k++) {
        const a = now / 4000 + k * 2.4, rr = rp * (0.25 + 0.6 * ((k * 37) % 10) / 10);
        sCtx.beginPath(); sCtx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a * 1.3) * rr * 0.8, rp * 0.16, 0, 7); sCtx.fill();
      }
    }
  }
  // etiqueta
  sCtx.fillStyle = "#8b949e"; sCtx.font = "12px sans-serif"; sCtx.textAlign = "center";
  sCtx.fillText(`${st.ph.n}`, cx, cy + rp + 20);
  sCtx.fillStyle = "#e6edf3"; sCtx.font = "bold 13px sans-serif";
  sCtx.fillText(`T≈${fmtT_k(st.T)}   R≈${fmtR_km(st.R)}   L≈${fmtL_s(st.L)}`, cx, cy + rp + 38);
  $("starlab").innerHTML = `<b>${st.ph.sub}</b> · quema: ${st.ph.burn}`;
}

// ---------- dibujo: diagrama H-R ----------
const LOGT_MIN = 3.4, LOGT_MAX = 5.7, LOGL_MIN = -4.5, LOGL_MAX = 9.5;
const X = lt => 46 + (LOGT_MAX - lt) / (LOGT_MAX - LOGT_MIN) * (HW - 46 - 14);
const Y = ll => 26 + (LOGL_MAX - ll) / (LOGL_MAX - LOGL_MIN) * (HH - 26 - 30);

function drawHR(now) {
  const { w, h } = fit(hCv, hCtx); HW = w; HH = h;
  hCtx.fillStyle = "#0d1117"; hCtx.fillRect(0, 0, HW, HH);
  // rejilla
  hCtx.font = "9px sans-serif"; hCtx.textAlign = "center";
  for (const T of [3000, 4000, 6000, 10000, 20000, 50000, 150000]) {
    const x = X(Math.log10(T));
    hCtx.strokeStyle = "#161b22"; hCtx.beginPath(); hCtx.moveTo(x, 26); hCtx.lineTo(x, HH - 30); hCtx.stroke();
    hCtx.fillStyle = "#6e7681"; hCtx.fillText(T >= 1000 ? (T / 1000) + "k" : T, x, HH - 18);
  }
  hCtx.textAlign = "right";
  for (let ll = -4; ll <= 8; ll += 2) {
    const y = Y(ll);
    hCtx.strokeStyle = "#161b22"; hCtx.beginPath(); hCtx.moveTo(46, y); hCtx.lineTo(HW - 14, y); hCtx.stroke();
    hCtx.fillStyle = "#6e7681"; hCtx.fillText(ll === 0 ? "1" : "10^" + ll, 42, y + 3);
  }
  hCtx.fillStyle = "#8b949e"; hCtx.textAlign = "center";
  hCtx.fillText("temperatura efectiva →", HW / 2, HH - 5);
  hCtx.save(); hCtx.translate(11, HH / 2); hCtx.rotate(-Math.PI / 2);
  hCtx.fillText("luminosidad (L☉) →", 0, 0); hCtx.restore();

  // ZAMS (M 0.5→50)
  hCtx.strokeStyle = "rgba(255,255,255,0.18)"; hCtx.lineWidth = 1; hCtx.beginPath();
  let first = true;
  for (let m = 0.5; m <= 50; m *= 1.08) {
    const L = Math.log10(Math.pow(m, 3.5)), R = Math.log10(Math.pow(m, 0.8));
    const T = 5778 * Math.pow(Math.pow(m, 1.9), 0.25);
    const lt = Math.log10(Math.min(5e5, Math.max(2500, T)));
    const x = X(lt), y = Y(L);
    first ? hCtx.moveTo(x, y) : hCtx.lineTo(x, y); first = false;
  }
  hCtx.stroke();
  hCtx.fillStyle = "rgba(255,255,255,0.35)"; hCtx.font = "9px sans-serif"; hCtx.textAlign = "left";
  hCtx.fillText("secuencia principal", X(Math.log10(6000)) + 6, Y(0.5) - 4);

  // trayectoria recorrida
  if (trail.length > 1) {
    hCtx.strokeStyle = "#f0c000"; hCtx.lineWidth = 1.6; hCtx.beginPath();
    trail.forEach((p, i) => i ? hCtx.lineTo(p.x, p.y) : hCtx.moveTo(p.x, p.y));
    hCtx.stroke();
  }
  const st = curState(prog);
  if (st) {
    const lt = Math.log10(Math.min(5e5, Math.max(2500, st.T)));
    const x = X(lt), y = Y(st.L);
    trail.push({ x, y }); if (trail.length > 5000) trail.shift();
    hCtx.fillStyle = "#f0c000"; hCtx.shadowColor = "#f0c000"; hCtx.shadowBlur = 10;
    hCtx.beginPath(); hCtx.arc(x, y, 4, 0, 7); hCtx.fill(); hCtx.shadowBlur = 0;
    hCtx.strokeStyle = "rgba(240,192,0,0.5)";
    hCtx.beginPath(); hCtx.arc(x, y, 8 + 2 * Math.sin(now / 200), 0, 7); hCtx.stroke();
  }
}

// ---------- bucle ----------
function frame(now) {
  const dt = now - lastT; lastT = now;
  if (playing && phases.length) {
    prog += dt * speedMul / PHASE_MS;
    if (prog >= 1) {
      prog = 0; idx++;
      if (idx >= phases.length) { idx = phases.length - 1; playing = false; $("btnPlay").textContent = "▶ evolucionar"; prog = 1; }
      syncUI();
    }
  }
  drawStar(now); drawHR(now);
  requestAnimationFrame(frame);
}

// ---------- controles ----------
$("mass").oninput = e => {
  M = e.target.value / 100;
  $("massVal").textContent = M.toFixed(2).replace(/0$/, "") + " M☉";
  $("kvM").textContent = M.toFixed(2).replace(/0$/, "") + " M☉";
  buildPhases();
};
$("btnPlay").onclick = () => {
  if (!phases.length) return;
  if (!playing && idx === phases.length - 1 && prog >= 1) { idx = 0; prog = 0; buildPhases(); }
  playing = !playing;
  $("btnPlay").textContent = playing ? "⏸ pausar" : "▶ evolucionar";
};
$("btnReset").onclick = () => { idx = 0; prog = 0; phaseT0 = performance.now(); trail = []; syncUI(); };
document.querySelectorAll(".spd").forEach(b => b.onclick = () => {
  document.querySelectorAll(".spd").forEach(x => x.classList.remove("on"));
  b.classList.add("on"); speedMul = +b.dataset.s;
});

M = 1.0; buildPhases();
requestAnimationFrame(frame);

})();

})();
