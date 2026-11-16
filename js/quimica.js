/* quimica.js — Controlador de quimica.html (hibridación y LCAO-MO). */
(function () {
  "use strict";

  const C = window.Chem;
  const $ = (id) => document.getElementById(id);

  const state = {
    mode: "hybrid",
    hybrid: "sp3",
    lobe: -1, // -1 = todos los lóbulos
    mo: "bond",
    R: 2.5,
  };

  const mainV = new Viewer($("main"), { fill: 0.36, spin: 0.002 });

  function renderLobeButtons() {
    const h = C.HYBRIDS[state.hybrid];
    let html = `<button class="q-btn ${state.lobe === -1 ? "on" : ""}" data-l="-1">Todos (${h.lobes.length})</button>`;
    h.lobes.forEach((lobe, idx) => {
      html += `<button class="q-btn ${state.lobe === idx ? "on" : ""}" data-l="${idx}">${lobe.label}</button>`;
    });
    $("lobeBtns").innerHTML = html;
  }

  function renderHybrid() {
    const h = C.HYBRIDS[state.hybrid];
    const cloud = C.genHybrid(state.hybrid, state.lobe, 26000);
    mainV.setCloud(cloud);

    const lobeNote = state.lobe >= 0
      ? `Lóbulo <b>${h.lobes[state.lobe].label}</b> · <span class="legend"><i style="background:#4dabf7"></i>fase + <i style="background:#ff922b"></i>fase −</span>`
      : `<b>${h.lobes.length}</b> orbitales híbridos equivalentes · ángulo <b>${h.angle}</b>`;

    $("info").innerHTML = `<div class="big">Hibridación ${state.hybrid}</div>${lobeNote}`;
    $("hybInfo").innerHTML = `
      <div><b>${h.name}</b></div>
      <div style="color:#8b949e; margin:4px 0;">Geometría: ${h.geom}</div>
      <div>${h.desc}</div>
    `;
  }

  function drawMOCurve() {
    const cv = $("moCurve"), ctx = cv.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth || 340, H = cv.clientHeight || 190;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0d1117"; ctx.fillRect(0, 0, W, H);

    const pad = { l: 38, r: 12, t: 14, b: 24 };
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    const Rmin = 0.5, Rmax = 6.0, Emin = -3.0, Emax = 8.0;
    const tx = (r) => pad.l + ((r - Rmin) / (Rmax - Rmin)) * pw;
    const ty = (e) => pad.t + (1 - (Math.max(Emin, Math.min(Emax, e)) - Emin) / (Emax - Emin)) * ph;

    // Línea E = 0
    ctx.strokeStyle = "#30363d"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, ty(0)); ctx.lineTo(W - pad.r, ty(0)); ctx.stroke();

    // Curvas σ₁ₛ y σ₁ₛ*
    const plot = (key, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k <= 80; k++) {
        const r = Rmin + (k / 80) * (Rmax - Rmin);
        const e = C.moEnergy(r)[key];
        const x = tx(r), y = ty(e);
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    plot("dE_anti", "#ff922b");
    plot("dE_bond", "#4dabf7");

    // Punto actual R
    const cur = C.moEnergy(state.R);
    const activeE = state.mo === "bond" ? cur.dE_bond : cur.dE_anti;
    const px = tx(state.R), py = ty(activeE);
    ctx.strokeStyle = "#f0c00088"; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(px, pad.t); ctx.lineTo(px, H - pad.b); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#f0c000";
    ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = "#8b949e"; ctx.font = "10px sans-serif";
    ctx.fillText("E (eV)", 4, 12);
    ctx.fillText("R (a₀)", W - 36, H - 6);
    ctx.fillStyle = "#4dabf7"; ctx.fillText("σ₁ₛ", pad.l + 6, H - pad.b - 6);
    ctx.fillStyle = "#ff922b"; ctx.fillText("σ₁ₛ*", pad.l + 32, pad.t + 12);
  }

  function renderMO() {
    const cloud = C.genMO(state.mo, state.R, 26000);
    mainV.setCloud(cloud);
    const e = C.moEnergy(state.R);
    const activeE = state.mo === "bond" ? e.dE_bond : e.dE_anti;
    const label = state.mo === "bond" ? "σ₁ₛ (enlazante)" : "σ₁ₛ* (antienlazante · plano nodal z=0)";

    $("info").innerHTML = `<div class="big">${label}</div>
      R = <b>${state.R.toFixed(2)} a₀</b> (${(state.R * 0.529).toFixed(2)} Å) · Solapamiento S(R) = <b>${e.S.toFixed(3)}</b><br>
      <span class="legend"><i style="background:#4dabf7"></i>fase + <i style="background:#ff922b"></i>fase −</span>`;

    $("moInfo").innerHTML = `
      <div>Solapamiento <b>S(R) = ${e.S.toFixed(3)}</b></div>
      <div>Energía relativa ΔE = <b style="color:${activeE < 0 ? "#69db7c" : "#ff922b"}">${activeE.toFixed(2)} eV</b></div>
      <div style="color:#8b949e; font-size:12px; margin-top:4px;">
        ${state.mo === "bond"
          ? "Mínimo de enlace LCAO en R ≈ 2.49 a₀. La densidad se acumula entre los dos núcleos."
          : "Curva puramente repulsiva: la interferencia destructiva anula ψ en z = 0."}
      </div>
    `;
    drawMOCurve();
  }

  function render() {
    $("panelHybrid").hidden = state.mode !== "hybrid";
    $("panelMO").hidden = state.mode !== "mo";
    if (state.mode === "hybrid") renderHybrid();
    else renderMO();
  }

  $("tabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (!t) return;
    state.mode = t.dataset.mode;
    document.querySelectorAll("#tabs .tab").forEach((el) => el.classList.toggle("on", el === t));
    render();
  });

  $("hybBtns").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state.hybrid = b.dataset.h;
    state.lobe = -1;
    document.querySelectorAll("#hybBtns button").forEach((el) => el.classList.toggle("on", el === b));
    renderLobeButtons();
    render();
  });

  $("lobeBtns").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state.lobe = +b.dataset.l;
    renderLobeButtons();
    render();
  });

  $("moBtns").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state.mo = b.dataset.mo;
    document.querySelectorAll("#moBtns button").forEach((el) => el.classList.toggle("on", el === b));
    render();
  });

  $("rSlider").addEventListener("input", (e) => {
    state.R = +e.target.value;
    $("rVal").textContent = state.R.toFixed(2) + " a₀";
    render();
  });

  $("spin").addEventListener("input", (e) => { Viewer.speed = +e.target.value; });
  $("pause").addEventListener("click", () => {
    Viewer.paused = !Viewer.paused;
    $("pause").textContent = Viewer.paused ? "▶" : "⏸";
  });
  $("btnExportPNG").addEventListener("click", () => {
    const name = state.mode === "hybrid" ? `hibrido_${state.hybrid}.png` : `H2_${state.mo}_R${state.R.toFixed(1)}.png`;
    mainV.exportPNG(name, { transparent: true, scale: 2 });
  });

  renderLobeButtons();
  render();
})();
