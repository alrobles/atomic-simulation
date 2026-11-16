/* superposicion.js — Visualización de Ψ(r, t) = c₁ψ₁e^(-iE₁t/ℏ) + c₂ψ₂e^(-iE₂t/ℏ)
 * y cálculo del momento dipolar oscilante ⟨z⟩(t).
 * Funciones puras arriba → también corre en Node para pruebas.
 */
(function (root) {
  "use strict";

  const A = (typeof Atom !== "undefined") ? Atom : require("./physics.js");

  const PRESETS = {
    "1s-2pz":   { s1: [1, 0, 0], s2: [2, 1, 2], label: "1s ↔ 2p_z", Rmax: 11, desc: "Transición dipolar permitida (Δℓ = 1, ΔE = 10.20 eV, λ = 121.6 nm UV). La carga oscila arriba y abajo del núcleo." },
    "2pz-3dz2": { s1: [2, 1, 2], s2: [3, 2, 2], label: "2p_z ↔ 3d_z²", Rmax: 20, desc: "Transición dipolar permitida (Δℓ = 1, ΔE = 1.89 eV, λ = 656.3 nm rojo Hα)." },
    "1s-3pz":   { s1: [1, 0, 0], s2: [3, 1, 2], label: "1s ↔ 3p_z", Rmax: 18, desc: "Transición dipolar permitida (Δℓ = 1, ΔE = 12.09 eV, λ = 102.6 nm UV)." },
    "1s-2s":    { s1: [1, 0, 0], s2: [2, 0, 0], label: "1s ↔ 2s", Rmax: 11, desc: "Transición dipolar prohibida (Δℓ = 0): la densidad pulsa radialmente pero su centro de carga ⟨z⟩ permanece en 0." },
  };

  function bohrEnergyEv(n) {
    return -13.6057 / (n * n);
  }

  /** Densidad |Ψ(r, t)|² dados ψ₁, ψ₂ reales, pesos c₁, c₂ y fase ωt. */
  function superpositionDensity(psi1, psi2, c1, c2, phase) {
    return c1 * c1 * psi1 * psi1 + c2 * c2 * psi2 * psi2 + 2 * c1 * c2 * psi1 * psi2 * Math.cos(phase);
  }

  // Exportar funciones puras para Node
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { PRESETS, bohrEnergyEv, superpositionDensity };
  }

  if (typeof document === "undefined") return;

  const $ = (id) => document.getElementById(id);
  const dCv = $("densityCanvas"), dCtx = dCv.getContext("2d");
  const wCv = $("waveCanvas"), wCtx = wCv.getContext("2d");

  const state = {
    preset: "1s-2pz",
    playing: true,
    speed: 1.0,
    mix: 0.5, // |c₂|²
    phase: 0,
  };

  const G = 150;
  let grid1 = new Float32Array(G * G);
  let grid2 = new Float32Array(G * G);
  let gridMax = 1e-6;
  let imgData = null;
  let dipoleAmp = 0;

  // Normalización aproximada de ψ_{n,l,i} para que c₁ψ₁ y c₂ψ₂ tengan norma L² comparable en 3D
  function psiNorm(s, x, y, z) {
    const [n, l, i] = s;
    const rad = A.radial(n, l);
    const angNorm = l === 0 ? 1 / Math.sqrt(4 * Math.PI)
      : l === 1 ? Math.sqrt(3 / (4 * Math.PI))
      : i === 2 ? Math.sqrt(5 / (16 * Math.PI)) : Math.sqrt(15 / (4 * Math.PI));
    return Math.sqrt(rad.norm2) * angNorm * A.psi(n, l, i, x, y, z);
  }

  function buildGrid() {
    const p = PRESETS[state.preset];
    const E = p.Rmax;
    let m1 = 0, m2 = 0, dipSum = 0, norm1 = 0, norm2 = 0;
    for (let iy = 0; iy < G; iy++) {
      const z = E * (1 - (2 * (iy + 0.5)) / G);
      for (let ix = 0; ix < G; ix++) {
        const x = E * ((2 * (ix + 0.5)) / G - 1);
        const v1 = psiNorm(p.s1, x, 0, z);
        const v2 = psiNorm(p.s2, x, 0, z);
        const idx = iy * G + ix;
        grid1[idx] = v1;
        grid2[idx] = v2;
        if (v1 * v1 > m1) m1 = v1 * v1;
        if (v2 * v2 > m2) m2 = v2 * v2;
        // Peso cilíndrico |x| para estimar el dipolo ⟨z⟩ en simetría axial
        const w = Math.abs(x);
        dipSum += w * v1 * v2 * z;
        norm1 += w * v1 * v1;
        norm2 += w * v2 * v2;
      }
    }
    gridMax = Math.max(m1, m2, 1e-12);
    dipoleAmp = (norm1 > 0 && norm2 > 0) ? dipSum / Math.sqrt(norm1 * norm2) : 0;
    updateInfo();
  }

  function updateInfo() {
    const p = PRESETS[state.preset];
    const e1 = bohrEnergyEv(p.s1[0]), e2 = bohrEnergyEv(p.s2[0]);
    const dE = Math.abs(e2 - e1);
    const lam = dE > 0 ? (1239.84 / dE).toFixed(1) : "∞";
    const c2 = Math.sqrt(state.mix), c1 = Math.sqrt(1 - state.mix);

    $("info").innerHTML = `<div class="big">Ψ(r⃗, t) = ${c1.toFixed(2)} ψ(${p.label.split(" ↔ ")[0]}) + ${c2.toFixed(2)} ψ(${p.label.split(" ↔ ")[1]}) e<sup>−iωt</sup></div>
      ΔE = <b>${dE.toFixed(2)} eV</b> · λ = <b>${lam} nm</b> · Oscilación |Ψ|² a frecuencia ω = ΔE/ℏ`;

    $("stateInfo").innerHTML = `
      <div><b>${p.label}</b></div>
      <div style="color:#8b949e; margin:4px 0;">E₁ = ${e1.toFixed(2)} eV · E₂ = ${e2.toFixed(2)} eV</div>
      <div>${p.desc}</div>
    `;
  }

  function heatRGB(v) {
    // Escala oscura -> azul -> cian -> amarillo -> blanco
    const t = Math.pow(Math.min(1, Math.max(0, v)), 0.48);
    const r = Math.round(255 * Math.min(1, Math.max(0, 1.8 * t - 0.55)));
    const g = Math.round(255 * Math.min(1, Math.max(0, 1.4 * t - 0.15)));
    const b = Math.round(255 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.9 + 255 * Math.max(0, t - 0.75) * 2);
    return [Math.min(255, r), Math.min(255, g), Math.min(255, b)];
  }

  function drawDensity() {
    const dpr = window.devicePixelRatio || 1;
    const W = dCv.clientWidth, H = dCv.clientHeight;
    if (!W || !H) return;
    if (dCv.width !== Math.round(W * dpr) || dCv.height !== Math.round(H * dpr)) {
      dCv.width = Math.round(W * dpr); dCv.height = Math.round(H * dpr);
    }
    dCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dCtx.fillStyle = "#0d1117"; dCtx.fillRect(0, 0, W, H);

    const panelW = 0;
    const size = Math.min(W - panelW - 40, H - 60);
    if (size < 60) return;
    const ox = (W - size) / 2, oy = (H - size) / 2 + 12;

    if (!imgData) imgData = dCtx.createImageData(G, G);
    const data = imgData.data;
    const c2 = Math.sqrt(state.mix), c1 = Math.sqrt(1 - state.mix);
    const cosP = Math.cos(state.phase);

    for (let k = 0; k < G * G; k++) {
      const v1 = grid1[k], v2 = grid2[k];
      const rho = c1 * c1 * v1 * v1 + c2 * c2 * v2 * v2 + 2 * c1 * c2 * v1 * v2 * cosP;
      const [r, g, b] = heatRGB(rho / (gridMax * 1.15));
      const p = k * 4;
      data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
    }

    const off = drawDensity._off || (drawDensity._off = document.createElement("canvas"));
    if (off.width !== G) { off.width = G; off.height = G; }
    off.getContext("2d").putImageData(imgData, 0, 0);

    dCtx.imageSmoothingEnabled = true;
    dCtx.drawImage(off, ox, oy, size, size);
    dCtx.strokeStyle = "#30363d"; dCtx.strokeRect(ox, oy, size, size);

    // Núcleo y vector dipolar ⟨z⟩(t)
    const cx = ox + size / 2, cy = oy + size / 2;
    const dip = 2 * c1 * c2 * dipoleAmp * cosP;
    const arrowLen = Math.max(-size * 0.35, Math.min(size * 0.35, (dip / PRESETS[state.preset].Rmax) * size * 0.8));

    if (Math.abs(arrowLen) > 2) {
      dCtx.strokeStyle = "#f0c000"; dCtx.lineWidth = 3;
      dCtx.beginPath(); dCtx.moveTo(cx, cy); dCtx.lineTo(cx, cy - arrowLen); dCtx.stroke();
      const dir = arrowLen > 0 ? -1 : 1;
      dCtx.fillStyle = "#f0c000";
      dCtx.beginPath();
      dCtx.moveTo(cx, cy - arrowLen + dir * 7);
      dCtx.lineTo(cx - 5, cy - arrowLen - dir * 3);
      dCtx.lineTo(cx + 5, cy - arrowLen - dir * 3);
      dCtx.closePath(); dCtx.fill();
    }
    dCtx.fillStyle = "#fff";
    dCtx.beginPath(); dCtx.arc(cx, cy, 3, 0, Math.PI * 2); dCtx.fill();
  }

  function drawWave() {
    const dpr = window.devicePixelRatio || 1;
    const W = wCv.clientWidth || 340, H = wCv.clientHeight || 130;
    if (wCv.width !== Math.round(W * dpr) || wCv.height !== Math.round(H * dpr)) {
      wCv.width = Math.round(W * dpr); wCv.height = Math.round(H * dpr);
    }
    wCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    wCtx.fillStyle = "#0d1117"; wCtx.fillRect(0, 0, W, H);

    const mid = H / 2;
    wCtx.strokeStyle = "#30363d"; wCtx.lineWidth = 1;
    wCtx.beginPath(); wCtx.moveTo(0, mid); wCtx.lineTo(W, mid); wCtx.stroke();

    const c2 = Math.sqrt(state.mix), c1 = Math.sqrt(1 - state.mix);
    const amp = 2 * c1 * c2 * (Math.abs(dipoleAmp) / PRESETS[state.preset].Rmax) * (H * 0.9);
    const cappedAmp = Math.min(H * 0.38, amp);

    wCtx.strokeStyle = "#f0c000"; wCtx.lineWidth = 2;
    wCtx.beginPath();
    for (let x = 0; x <= W; x += 2) {
      const ph = state.phase - ((W - x) / W) * 4 * Math.PI;
      const y = mid - cappedAmp * Math.cos(ph);
      if (x === 0) wCtx.moveTo(x, y); else wCtx.lineTo(x, y);
    }
    wCtx.stroke();

    wCtx.fillStyle = "#f0c000";
    const curY = mid - cappedAmp * Math.cos(state.phase);
    wCtx.beginPath(); wCtx.arc(W - 4, curY, 4, 0, Math.PI * 2); wCtx.fill();
  }

  let lastT = performance.now();
  function tick(now) {
    const dt = (now - lastT) / 1000;
    lastT = now;
    if (state.playing) {
      const p = PRESETS[state.preset];
      const dE = Math.abs(bohrEnergyEv(p.s2[0]) - bohrEnergyEv(p.s1[0]));
      state.phase += dt * state.speed * (0.8 + dE * 0.25);
    }
    drawDensity();
    drawWave();
    requestAnimationFrame(tick);
  }

  $("presetBtns").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state.preset = b.dataset.p;
    document.querySelectorAll("#presetBtns button").forEach((el) => el.classList.toggle("on", el === b));
    buildGrid();
  });

  $("btnPlay").addEventListener("click", () => {
    state.playing = !state.playing;
    $("btnPlay").textContent = state.playing ? "⏸ Pausar" : "▶ Reanudar";
    $("btnPlay").classList.toggle("on", state.playing);
  });

  $("speedSlider").addEventListener("input", (e) => { state.speed = +e.target.value; });
  $("mixSlider").addEventListener("input", (e) => {
    state.mix = +e.target.value;
    $("mixVal").textContent = Math.round(state.mix * 100) + "%";
    updateInfo();
  });

  $("btnExportPNG").addEventListener("click", () => {
    const a = document.createElement("a");
    a.download = `superposicion_${state.preset}.png`;
    a.href = dCv.toDataURL("image/png");
    a.click();
  });

  buildGrid();
  requestAnimationFrame(tick);
})();
