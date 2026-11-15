/* field.js — Visualizaciones tipo campo: mapa de densidad en un plano y distribución radial P(r). */
(function (root) {
  "use strict";
  const A = root.Atom;
  const A0_PM = 52.918; // 1 radio de Bohr en picómetros

  // Mapa de color tipo "inferno"
  const STOPS = [[0, 0, 4], [31, 12, 72], [85, 15, 109], [136, 34, 106], [186, 54, 85], [227, 89, 51], [249, 140, 10], [249, 201, 50], [252, 255, 164]];
  const LUT = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * (STOPS.length - 1), j = Math.min(STOPS.length - 2, Math.floor(x)), f = x - j;
    for (let c = 0; c < 3; c++) LUT[i * 3 + c] = Math.round(STOPS[j][c] * (1 - f) + STOPS[j + 1][c] * f);
  }
  const PHASE_POS = [77, 171, 247], PHASE_NEG = [255, 146, 43];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function fit(canvas) {
    const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.fillStyle = "#0d1117"; ctx.fillRect(0, 0, W, H);
    return { ctx, W, H };
  }

  /** Valores "redondos" en pm (1, 2, 5 × 10^k) dentro de (lo, hi). */
  function niceValues(lo, hi) {
    const out = [];
    for (let e = -2; e <= 5; e++) for (const m of [1, 2, 5]) { const v = m * Math.pow(10, e); if (v > lo && v < hi) out.push(v); }
    return out;
  }
  const fmtPm = (v) => (v >= 1 ? +v.toPrecision(3) : +v.toPrecision(2)) + " pm";

  // Mapeo radio físico ↔ coordenada de pantalla s ∈ [0,1]
  const toR = (s, E, m) => (m === "sqrt" ? s * s * E : s * E);
  const toS = (r, E, m) => (m === "sqrt" ? Math.sqrt(r / E) : r / E);

  // =====================================================================
  class FieldView {
    /** getBox(W,H) → {x, y, size}: cuadro donde se dibuja el mapa. */
    constructor(canvas, getBox) {
      this.canvas = canvas; this.getBox = getBox; this.zoom = 1; this.hover = null;
      this.off = document.createElement("canvas"); this.res = 440;
      canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        this.zoom = clamp(this.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 1, 80);
        this.compute(); this.draw();
      }, { passive: false });
      canvas.addEventListener("mousemove", (e) => {
        const r = canvas.getBoundingClientRect(); this.hover = [e.clientX - r.left, e.clientY - r.top]; this.draw();
      });
      canvas.addEventListener("mouseleave", () => { this.hover = null; this.draw(); });
      window.addEventListener("resize", () => this.spec && !canvas.hidden && this.draw());
    }

    /**
     * spec.type "atom":    {shells, qty: "P"|"rho", mapping: "linear"|"sqrt", E (a0), contours}
     * spec.type "orbital": {n, l, i, plane, E, contours}
     */
    show(spec) {
      if (!this.spec || this.spec.key !== spec.key) this.zoom = 1;
      this.spec = spec; this.compute(); this.draw();
    }

    // coordenada de pantalla normalizada (u,v ∈ [-1,1]) → [r, cosθ, sinθ] físicos
    phys(u, v) {
      const sp = this.spec, h = Math.hypot(u, v) || 1e-9, s = h / this.zoom;
      const m = sp.type === "atom" ? sp.mapping : "linear";
      return [toR(s, sp.E, m), u / h, v / h];
    }

    compute() {
      const sp = this.spec, N = this.res, off = this.off;
      off.width = off.height = N;
      const octx = off.getContext("2d"), img = octx.createImageData(N, N), D = img.data;
      const vals = new Float32Array(N * N);
      if (sp.type === "atom") {
        // perfil radial tabulado (todo es esférico)
        const G = 4000, rT = toR(Math.SQRT2 / this.zoom, sp.E, sp.mapping) * 1.01, tab = new Float64Array(G);
        for (let k = 0; k < G; k++) {
          const r = ((k + 0.5) / G) * rT;
          let v = 0;
          for (const sh of sp.shells) v += sp.qty === "rho" ? sh.rho(r) : sh.P(r);
          tab[k] = v;
        }
        let mx = 0;
        for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
          const u = (2 * (px + 0.5)) / N - 1, v = 1 - (2 * (py + 0.5)) / N, [r] = this.phys(u, v);
          const val = tab[Math.min(G - 1, Math.floor((r / rT) * G))];
          vals[py * N + px] = val; if (val > mx) mx = val;
        }
        const dec = sp.qty === "rho" ? 6 : 3, lmax = Math.log10(mx || 1);
        this.scale = { lmax, dec, qty: sp.qty };
        const t = new Float32Array(N * N);
        for (let k = 0; k < N * N; k++) t[k] = vals[k] > 0 ? clamp((Math.log10(vals[k]) - (lmax - dec)) / dec, 0, 1) : 0;
        for (let k = 0; k < N * N; k++) {
          const c = Math.round(t[k] * 255) * 3;
          D[4 * k] = LUT[c]; D[4 * k + 1] = LUT[c + 1]; D[4 * k + 2] = LUT[c + 2]; D[4 * k + 3] = 255;
        }
        if (sp.contours) this._contours(t, D, N, 12);
      } else {
        const { n, l, i, plane } = sp;
        let mx = 0;
        for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
          const u = (2 * (px + 0.5)) / N - 1, v = 1 - (2 * (py + 0.5)) / N, [r, c, s] = this.phys(u, v);
          const a = r * c, b = r * s;
          const val = plane === "xz" ? A.psi(n, l, i, a, 0, b) : plane === "xy" ? A.psi(n, l, i, a, b, 0) : A.psi(n, l, i, 0, a, b);
          vals[py * N + px] = val; if (Math.abs(val) > mx) mx = Math.abs(val);
        }
        this.scale = { qty: "psi" };
        const t = new Float32Array(N * N);
        for (let k = 0; k < N * N; k++) {
          const a = Math.sqrt(Math.abs(vals[k]) / (mx || 1)), col = vals[k] >= 0 ? PHASE_POS : PHASE_NEG;
          t[k] = a;
          D[4 * k] = col[0] * a; D[4 * k + 1] = col[1] * a; D[4 * k + 2] = col[2] * a; D[4 * k + 3] = 255;
        }
        if (sp.contours) this._contours(t, D, N, 8);
      }
      this.vals = vals;
      octx.putImageData(img, 0, 0);
    }

    _contours(t, D, N, levels) {
      for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) {
        const k = y * N + x, b = Math.floor(t[k] * levels);
        if (b > 0 && (b !== Math.floor(t[k + 1] * levels) || b !== Math.floor(t[k + N] * levels))) {
          D[4 * k] = (D[4 * k] + 255) / 2; D[4 * k + 1] = (D[4 * k + 1] + 255) / 2; D[4 * k + 2] = (D[4 * k + 2] + 255) / 2;
        }
      }
    }

    draw() {
      if (!this.spec) return;
      const { ctx, W, H } = fit(this.canvas), box = this.getBox(W, H), sp = this.spec;
      const cx = box.x + box.size / 2, cy = box.y + box.size / 2, half = box.size / 2;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.off, box.x, box.y, box.size, box.size);
      ctx.strokeStyle = "#30363d"; ctx.strokeRect(box.x, box.y, box.size, box.size);

      // círculos de referencia con su radio en pm
      const m = sp.type === "atom" ? sp.mapping : "linear";
      const rMaxView = toR(1 / this.zoom, sp.E, m) * A0_PM, rMinView = toR(0.06 / this.zoom, sp.E, m) * A0_PM;
      let lastPx = -1e9;
      ctx.font = "11px sans-serif"; ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
      niceValues(rMinView, rMaxView).forEach((pm) => {
        const px = toS(pm / A0_PM, sp.E, m) * this.zoom * half;
        if (px - lastPx < 34) return;
        lastPx = px;
        ctx.strokeStyle = "rgba(255,255,255,0.28)";
        ctx.beginPath(); ctx.arc(cx, cy, px, 0, 2 * Math.PI); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.fillText(fmtPm(pm), cx + px * 0.707 + 3, cy - px * 0.707 - 3);
      });
      ctx.setLineDash([]);
      // ejes del plano
      const axes = sp.type === "orbital" ? { xz: ["x", "z"], xy: ["x", "y"], yz: ["y", "z"] }[sp.plane] : ["x", "z"];
      ctx.fillStyle = "#8b949e"; ctx.font = "12px sans-serif";
      ctx.fillText(axes[0] + " →", box.x + box.size - 30, cy + 14);
      ctx.fillText("↑ " + axes[1], cx + 4, box.y + 14);

      // barra de color
      const bx = box.x + box.size + 14, bh = box.size * 0.6, by = cy - bh / 2;
      for (let k = 0; k < bh; k++) {
        const t = 1 - k / bh;
        if (sp.type === "atom") { const c = Math.round(t * 255) * 3; ctx.fillStyle = `rgb(${LUT[c]},${LUT[c + 1]},${LUT[c + 2]})`; }
        else { const a = Math.abs(2 * t - 1), col = t >= 0.5 ? PHASE_POS : PHASE_NEG; ctx.fillStyle = `rgb(${col[0] * a},${col[1] * a},${col[2] * a})`; }
        ctx.fillRect(bx, by + k, 12, 1);
      }
      ctx.fillStyle = "#c9d1d9"; ctx.font = "11px sans-serif";
      if (sp.type === "atom") {
        ctx.fillText("más", bx + 16, by + 8); ctx.fillText("menos", bx + 16, by + bh);
        ctx.fillText(`×10^${this.scale.dec}`, bx - 2, by + bh + 16);
      } else {
        ctx.fillText("ψ +", bx + 16, by + 8); ctx.fillText("0 (nodo)", bx + 16, by + bh / 2 + 4); ctx.fillText("ψ −", bx + 16, by + bh);
      }

      // lectura bajo el ratón
      if (this.hover) {
        const [hx, hy] = this.hover, u = (hx - cx) / half, v = -(hy - cy) / half;
        if (Math.abs(u) <= 1 && Math.abs(v) <= 1) {
          const [r] = this.phys(u, v), N = this.res;
          const px = clamp(Math.floor(((u + 1) / 2) * N), 0, N - 1), py = clamp(Math.floor(((1 - v) / 2) * N), 0, N - 1);
          const val = this.vals[py * N + px];
          let txt = `r = ${fmtPm(r * A0_PM)} (${r.toPrecision(3)} a₀)`;
          if (sp.type === "atom") txt += sp.qty === "rho" ? ` · ρ = ${val.toExponential(2)} e⁻/a₀³` : ` · 4πr²ρ = ${val.toPrecision(3)} e⁻/a₀`;
          else txt += val >= 0 ? " · fase +" : " · fase −";
          ctx.font = "13px sans-serif";
          const w = ctx.measureText(txt).width + 12;
          ctx.fillStyle = "#161b22ee"; ctx.fillRect(hx + 12, hy - 24, w, 20);
          ctx.fillStyle = "#e6edf3"; ctx.fillText(txt, hx + 18, hy - 10);
          ctx.strokeStyle = "rgba(255,255,255,0.6)";
          ctx.beginPath(); ctx.arc(cx, cy, Math.hypot(hx - cx, hy - cy), 0, 2 * Math.PI); ctx.stroke();
        }
      }
    }
  }

  // =====================================================================
  class RadialPlot {
    /** getRect(W,H) → {x, y, w, h}: área de la gráfica. */
    constructor(canvas, getRect) {
      this.canvas = canvas; this.getRect = getRect; this.hover = null;
      canvas.addEventListener("mousemove", (e) => {
        const r = canvas.getBoundingClientRect(); this.hover = [e.clientX - r.left, e.clientY - r.top]; this.draw();
      });
      canvas.addEventListener("mouseleave", () => { this.hover = null; this.draw(); });
      window.addEventListener("resize", () => this.spec && !canvas.hidden && this.draw());
    }

    /** spec: {curves: [{label, color, dim, P}], E, mapping, total, nodes?} */
    show(spec) {
      this.spec = spec;
      const M = 900, E = spec.E, m = spec.mapping;
      this.s = new Float64Array(M);
      this.ys = spec.curves.map(() => new Float64Array(M));
      this.tot = new Float64Array(M);
      for (let k = 0; k < M; k++) {
        const s = (k + 0.5) / M, r = toR(s, E, m), J = m === "sqrt" ? 2 * s * E : E; // dr/ds: el área se conserva
        this.s[k] = s;
        spec.curves.forEach((c, j) => { const y = c.P(r) * J; this.ys[j][k] = y; this.tot[k] += y; });
      }
      let mx = 0;
      for (let k = 0; k < M; k++) mx = Math.max(mx, spec.total ? this.tot[k] : Math.max(...this.ys.map((y) => y[k])));
      this.ymax = mx * 1.08 || 1;
      this.draw();
    }

    draw() {
      if (!this.spec) return;
      const { ctx, W, H } = fit(this.canvas), R = this.getRect(W, H), sp = this.spec, M = this.s.length;
      const X = (s) => R.x + s * R.w, Y = (y) => R.y + R.h - (y / this.ymax) * R.h;
      // ejes
      ctx.strokeStyle = "#484f58"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(R.x, R.y); ctx.lineTo(R.x, R.y + R.h); ctx.lineTo(R.x + R.w, R.y + R.h); ctx.stroke();
      ctx.fillStyle = "#8b949e"; ctx.font = "11px sans-serif";
      let last = -1e9;
      niceValues(toR(0.03, sp.E, sp.mapping) * A0_PM, sp.E * A0_PM).forEach((pm) => {
        const x = X(toS(pm / A0_PM, sp.E, sp.mapping));
        if (x - last < 46) return;
        last = x;
        ctx.strokeStyle = "#21262d"; ctx.beginPath(); ctx.moveTo(x, R.y); ctx.lineTo(x, R.y + R.h); ctx.stroke();
        ctx.fillText(fmtPm(pm), x - 14, R.y + R.h + 14);
      });
      ctx.fillStyle = "#c9d1d9"; ctx.font = "12px sans-serif";
      ctx.fillText(`distancia al núcleo r ${sp.mapping === "sqrt" ? "(eje comprimido √r)" : "(lineal)"} →`, R.x + R.w - 260, R.y + R.h + 30);
      ctx.save(); ctx.translate(R.x - 12, R.y + R.h / 2); ctx.rotate(-Math.PI / 2);
      ctx.fillText(sp.total ? "electrones (el área de cada curva = sus electrones)" : "probabilidad radial", -140, 0);
      ctx.restore();

      // curvas: primero las atenuadas
      const order = sp.curves.map((c, j) => j).sort((a, b) => (sp.curves[b].dim ? 1 : 0) - (sp.curves[a].dim ? 1 : 0));
      order.forEach((j) => {
        const c = sp.curves[j], y = this.ys[j];
        ctx.beginPath(); ctx.moveTo(X(0), Y(0));
        for (let k = 0; k < M; k++) ctx.lineTo(X(this.s[k]), Y(y[k]));
        ctx.lineTo(X(1), Y(0)); ctx.closePath();
        ctx.globalAlpha = c.dim ? 0.08 : 0.22; ctx.fillStyle = c.color; ctx.fill();
        ctx.globalAlpha = c.dim ? 0.35 : 1; ctx.strokeStyle = c.dim ? "#8b949e" : c.color; ctx.lineWidth = c.dim ? 1 : 1.8; ctx.stroke();
      });
      ctx.globalAlpha = 1;
      if (sp.total) {
        ctx.beginPath();
        for (let k = 0; k < M; k++) (k ? ctx.lineTo : ctx.moveTo).call(ctx, X(this.s[k]), Y(this.tot[k]));
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.stroke();
      }
      // etiquetas en los picos
      ctx.font = "bold 12px sans-serif";
      sp.curves.forEach((c, j) => {
        const y = this.ys[j]; let kb = 0;
        for (let k = 1; k < M; k++) if (y[k] > y[kb]) kb = k;
        ctx.fillStyle = c.dim ? "#8b949e" : c.color;
        ctx.fillText(c.label, X(this.s[kb]) - 8, Math.max(R.y + 12, Y(y[kb]) - 6));
      });
      // nodos (para un orbital)
      if (sp.nodes) {
        ctx.fillStyle = "#ff922b"; ctx.font = "11px sans-serif";
        sp.nodes.forEach((r) => {
          const x = X(toS(r, sp.E, sp.mapping));
          ctx.beginPath(); ctx.arc(x, Y(0), 4, 0, 7); ctx.fill();
          ctx.fillText("nodo", x - 12, Y(0) - 8);
        });
      }
      // lectura
      if (this.hover) {
        const [hx] = this.hover, s = (hx - R.x) / R.w;
        if (s > 0 && s < 1) {
          const r = toR(s, sp.E, sp.mapping);
          ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.beginPath(); ctx.moveTo(hx, R.y); ctx.lineTo(hx, R.y + R.h); ctx.stroke();
          const k = Math.min(M - 1, Math.floor(s * M));
          const top = sp.curves.map((c, j) => [c.label, this.ys[j][k]]).sort((a, b) => b[1] - a[1]).filter((t) => t[1] > 0.02 * this.ymax).slice(0, 3);
          const txt = `r = ${fmtPm(r * A0_PM)}` + (top.length ? " · aquí: " + top.map((t) => t[0]).join(", ") : "");
          ctx.font = "13px sans-serif";
          const w = ctx.measureText(txt).width + 12, bx = Math.min(hx + 10, W - w - 4);
          ctx.fillStyle = "#161b22ee"; ctx.fillRect(bx, R.y + 4, w, 20);
          ctx.fillStyle = "#e6edf3"; ctx.fillText(txt, bx + 6, R.y + 18);
        }
      }
    }
  }

  root.FieldView = FieldView;
  root.RadialPlot = RadialPlot;
})(window);
