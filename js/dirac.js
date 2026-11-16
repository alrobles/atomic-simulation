/* dirac.js — Línea del tiempo histórica (1904 → Modelo Estándar)
 * y simulador unitario Split-Step FFT de la ecuación de Dirac (1+1)D para 2 partículas.
 * Funciones puras y motor numérico arriba → también corre en Node.js para pruebas.
 */
(function (root) {
  "use strict";

  const MODELS = [
    {
      year: "1904",
      title: "Budín de pasas (Thomson)",
      eq: "∑ qᵢ + Q₊ = 0  (equilibrio electrostático)",
      explains: "Existencia del electrón (descubierto en 1897) dentro de un átomo neutro.",
      fails: "No explica la dispersión de partículas α a grandes ángulos observada por Geiger, Marsden y Rutherford.",
      kind: "thomson",
    },
    {
      year: "1911",
      title: "Átomo nuclear (Rutherford)",
      eq: "F = k·Ze² / r² = m·v² / r",
      explains: "Núcleo diminuto, masivo y positivo rodeado por electrones.",
      fails: "Según Maxwell, toda carga acelerada irradia energía: el electrón colapsaría al núcleo en ~10⁻¹¹ s.",
      kind: "rutherford",
    },
    {
      year: "1913–16",
      title: "Bohr–Sommerfeld",
      eq: "L = nℏ,   Eₙ = −13.6 eV · Z² / n²",
      explains: "Estabilidad atómica, líneas espectrales del hidrógeno y elipses relativistas (estructura fina parcial).",
      fails: "Falla en átomos con ≥ 2 electrones (He), no predice intensidades ni explica el enlace químico.",
      kind: "bohr",
    },
    {
      year: "1924",
      title: "Ondas de materia (De Broglie)",
      eq: "λ = h / p,   2πr = nλ",
      explains: "Justifica geométricamente la cuantización L = nℏ como ondas estacionarias que no se auto-cancelan.",
      fails: "Es un argumento 1D; falta una ecuación diferencial ondulatoria en 3D.",
      kind: "debroglie",
    },
    {
      year: "1926",
      title: "Ecuación de Schrödinger",
      eq: "iℏ ∂ₜΨ = [ −(ℏ² / 2m)∇² + V(r) ] Ψ",
      explains: "Orbitales 3D exactos (s, p, d, f), enlaces químicos y química cuántica no relativista.",
      fails: "No es invariante de Lorentz, ignora el espín del electrón y falla en estructura fina y átomos pesados (Z > 70).",
      kind: "schrodinger",
    },
    {
      year: "1926",
      title: "Ecuación de Klein–Gordon",
      eq: "( □ + m²c² / ℏ² ) φ = 0   (E² = p²c² + m²c⁴)",
      explains: "Primera ecuación de onda relativista covariante.",
      fails: "Permite densidades de probabilidad negativas y no describe partículas con espín 1/2 (solo espín 0).",
      kind: "kleingordon",
    },
    {
      year: "1927",
      title: "Ecuación de Pauli",
      eq: "iℏ ∂ₜχ = [ (σ⃗·p̂)² / 2m + V − μ_B σ⃗·B⃗ ] χ",
      explains: "Espinor de 2 componentes (↑, ↓) y efecto Zeeman anómalo en campos magnéticos.",
      fails: "Introduce el espín y el factor g = 2 de forma ad hoc; sigue siendo no relativista.",
      kind: "pauli",
    },
    {
      year: "1928",
      title: "Ecuación de Dirac",
      eq: "iℏ ∂ₜψ = ( c α⃗·p̂ + β mc² + V ) ψ   ≡   (iℏ γᵘ∂_μ − mc)ψ = 0",
      explains: "Deduce automáticamente el espín 1/2, g = 2, la estructura fina, la contracción relativista (Au, Hg) y predice la antimateria (positrón e⁺).",
      fails: "Es una teoría de una partícula en potencial externo: no incluye creación/destrucción de fotones (desplazamiento de Lamb).",
      kind: "dirac",
    },
    {
      year: "1948",
      title: "QED y Diagramas de Feynman",
      eq: "ℒ_QED = ψ̄(iγᵘD_μ − m)ψ − ¼ F_μν F^μν",
      explains: "Cuantiza los campos de Dirac y electromagnético: intercambio de fotones virtuales, desplazamiento de Lamb y momento magnético anómalo (g − 2) con precisión de 12 decimales.",
      fails: "Solo describe interacciones electromagnéticas; no incluye las fuerzas nuclear fuerte ni débil.",
      kind: "qed",
    },
    {
      year: "1973–Hoy",
      title: "Modelo Estándar (Tabla de Partículas)",
      eq: "SU(3)_C × SU(2)_L × U(1)_Y  +  Campo de Higgs",
      explains: "Unifica quarks, leptones (fermiones de Dirac/Weyl), bosones gauge (γ, g, W±, Z⁰) y el bosón de Higgs.",
      fails: "No incluye la gravedad cuántica ni explica la materia oscura, energía oscura o la masa de los neutrinos.",
      kind: "sm",
    },
  ];

  const STANDARD_MODEL = [
    { sym: "u", name: "Up", cat: "quark", mass: "2.2 MeV", q: "+⅔", spin: "½" },
    { sym: "c", name: "Charm", cat: "quark", mass: "1.27 GeV", q: "+⅔", spin: "½" },
    { sym: "t", name: "Top", cat: "quark", mass: "173 GeV", q: "+⅔", spin: "½" },
    { sym: "g", name: "Gluón", cat: "gauge", mass: "0", q: "0", spin: "1" },
    { sym: "H", name: "Higgs", cat: "higgs", mass: "125 GeV", q: "0", spin: "0" },

    { sym: "d", name: "Down", cat: "quark", mass: "4.7 MeV", q: "−⅓", spin: "½" },
    { sym: "s", name: "Strange", cat: "quark", mass: "93 MeV", q: "−⅓", spin: "½" },
    { sym: "b", name: "Bottom", cat: "quark", mass: "4.18 GeV", q: "−⅓", spin: "½" },
    { sym: "γ", name: "Fotón", cat: "gauge", mass: "0", q: "0", spin: "1" },
    null,

    { sym: "e", name: "Electrón", cat: "lepton", mass: "0.511 MeV", q: "−1", spin: "½" },
    { sym: "μ", name: "Muon", cat: "lepton", mass: "105.7 MeV", q: "−1", spin: "½" },
    { sym: "τ", name: "Tau", cat: "lepton", mass: "1.78 GeV", q: "−1", spin: "½" },
    { sym: "Z⁰", name: "Bosón Z", cat: "gauge", mass: "91.2 GeV", q: "0", spin: "1" },
    null,

    { sym: "νₑ", name: "Neutrino e", cat: "lepton", mass: "< 0.8 eV", q: "0", spin: "½" },
    { sym: "ν_μ", name: "Neutrino μ", cat: "lepton", mass: "< 0.17 MeV", q: "0", spin: "½" },
    { sym: "ν_τ", name: "Neutrino τ", cat: "lepton", mass: "< 18 MeV", q: "0", spin: "½" },
    { sym: "W±", name: "Bosón W", cat: "gauge", mass: "80.4 GeV", q: "±1", spin: "1" },
    null,
  ];

  // ---------- Simulador Dirac (1+1)D para 2 partículas vía Split-Step FFT ----------
  // FFT 1D radix-2 in-place sobre arreglos Float64Array (re, im) de longitud N potencia de 2.
  function fft1d(re, im, invert) {
    const N = re.length;
    for (let i = 1, j = 0; i < N; i++) {
      let bit = N >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= N; len <<= 1) {
      const ang = (2 * Math.PI / len) * (invert ? 1 : -1);
      const wlenRe = Math.cos(ang), wlenIm = Math.sin(ang);
      for (let i = 0; i < N; i += len) {
        let wRe = 1, wIm = 0;
        const half = len >> 1;
        for (let j = 0; j < half; j++) {
          const uRe = re[i + j], uIm = im[i + j];
          const vRe = re[i + j + half] * wRe - im[i + j + half] * wIm;
          const vIm = re[i + j + half] * wIm + im[i + j + half] * wRe;
          re[i + j] = uRe + vRe; im[i + j] = uIm + vIm;
          re[i + j + half] = uRe - vRe; im[i + j + half] = uIm - vIm;
          const nwRe = wRe * wlenRe - wIm * wlenIm;
          wIm = wRe * wlenIm + wIm * wlenRe;
          wRe = nwRe;
        }
      }
    }
    if (invert) {
      const inv = 1 / N;
      for (let i = 0; i < N; i++) { re[i] *= inv; im[i] *= inv; }
    }
  }

  class Dirac2P {
    constructor(N, L) {
      this.N = N || 64;
      this.L = L || 16.0;
      this.dx = this.L / this.N;
      this.dk = (2 * Math.PI) / this.L;
      const M = this.N * this.N;
      // 4 componentes espinoriales (++, +-, -+, --), cada una (re, im)
      this.re = [new Float64Array(M), new Float64Array(M), new Float64Array(M), new Float64Array(M)];
      this.im = [new Float64Array(M), new Float64Array(M), new Float64Array(M), new Float64Array(M)];
      this.V = new Float64Array(M);
      this.rowRe = new Float64Array(this.N);
      this.rowIm = new Float64Array(this.N);
      this.c = 1.0;
      this.m = 1.0;
      this.time = 0;
    }

    xAt(i) { return (i - this.N / 2) * this.dx; }
    kAt(i) { return (i <= this.N / 2 ? i : i - this.N) * this.dk; }

    /** Inicializa paquete de 2 partículas (simétrico, antisimétrico o distinguible) + potencial. */
    initScenario(opts) {
      opts = opts || {};
      const N = this.N;
      this.c = opts.c ?? 1.2;
      this.m = opts.m ?? 0.8;
      this.time = 0;
      const x1_0 = opts.x1 ?? -3.2, x2_0 = opts.x2 ?? 3.2;
      const k1_0 = opts.k1 ?? 1.8,  k2_0 = opts.k2 ?? -1.8;
      const sig = opts.sigma ?? 1.1;
      const sym = opts.symmetry ?? "anti"; // "anti" (fermiones), "sym" (bosones), "dist" (distinguibles)
      const gCoupling = opts.coupling ?? 1.5; // >0 repulsivo, <0 atractivo
      const barrierV = opts.barrier ?? 0;

      // Espinor positivo-energía aproximado (1, (ck)/(E+mc²)) para momento k0
      const spinor = (k0) => {
        const E = Math.sqrt((this.c * k0) ** 2 + (this.m * this.c * this.c) ** 2);
        const a = 1, b = (this.c * k0) / (E + this.m * this.c * this.c + 1e-9);
        const nrm = Math.hypot(a, b);
        return [a / nrm, b / nrm];
      };
      const sA = spinor(k1_0), sB = spinor(k2_0);

      for (let i = 0; i < N; i++) {
        const x1 = this.xAt(i);
        const g1A = Math.exp(-((x1 - x1_0) ** 2) / (2 * sig * sig));
        const g1B = Math.exp(-((x1 - x2_0) ** 2) / (2 * sig * sig));
        for (let j = 0; j < N; j++) {
          const x2 = this.xAt(j);
          const idx = i * N + j;
          const g2B = Math.exp(-((x2 - x2_0) ** 2) / (2 * sig * sig));
          const g2A = Math.exp(-((x2 - x1_0) ** 2) / (2 * sig * sig));

          // Término directo A(x1) B(x2)
          const ph1 = k1_0 * x1 + k2_0 * x2;
          const dRe = g1A * g2B * Math.cos(ph1), dIm = g1A * g2B * Math.sin(ph1);

          // Término de intercambio B(x1) A(x2)
          const ph2 = k2_0 * x1 + k1_0 * x2;
          const eRe = g1B * g2A * Math.cos(ph2), eIm = g1B * g2A * Math.sin(ph2);
          const sign = sym === "anti" ? -1 : sym === "sym" ? 1 : 0;

          for (let a = 0; a < 2; a++) {
            for (let b = 0; b < 2; b++) {
              const comp = a * 2 + b;
              const wDir = sA[a] * sB[b];
              const wExc = sB[a] * sA[b];
              this.re[comp][idx] = wDir * dRe + sign * wExc * eRe;
              this.im[comp][idx] = wDir * dIm + sign * wExc * eIm;
            }
          }

          // Potencial suavizado Coulomb/Yukawa + barrera central opcional
          const r = Math.sqrt((x1 - x2) ** 2 + 0.64);
          let v = gCoupling / r;
          if (barrierV !== 0 && (Math.abs(x1) < 0.7 || Math.abs(x2) < 0.7)) v += barrierV;
          this.V[idx] = v;
        }
      }
      this.normalize();
    }

    norm() {
      let s = 0;
      const M = this.N * this.N;
      for (let c = 0; c < 4; c++) {
        const rr = this.re[c], ii = this.im[c];
        for (let k = 0; k < M; k++) s += rr[k] * rr[k] + ii[k] * ii[k];
      }
      return s;
    }

    normalize() {
      const n = Math.sqrt(this.norm());
      if (n <= 0) return;
      const inv = 1 / n, M = this.N * this.N;
      for (let c = 0; c < 4; c++) {
        const rr = this.re[c], ii = this.im[c];
        for (let k = 0; k < M; k++) { rr[k] *= inv; ii[k] *= inv; }
      }
    }

    _fft2d(comp, invert) {
      const N = this.N, rr = this.re[comp], ii = this.im[comp];
      const rowR = this.rowRe, rowI = this.rowIm;
      for (let i = 0; i < N; i++) {
        const off = i * N;
        for (let j = 0; j < N; j++) { rowR[j] = rr[off + j]; rowI[j] = ii[off + j]; }
        fft1d(rowR, rowI, invert);
        for (let j = 0; j < N; j++) { rr[off + j] = rowR[j]; ii[off + j] = rowI[j]; }
      }
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) { rowR[i] = rr[i * N + j]; rowI[i] = ii[i * N + j]; }
        fft1d(rowR, rowI, invert);
        for (let i = 0; i < N; i++) { rr[i * N + j] = rowR[i]; ii[i * N + j] = rowI[i]; }
      }
    }

    _applyV(halfDt) {
      const M = this.N * this.N;
      for (let k = 0; k < M; k++) {
        const ang = -this.V[k] * halfDt;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        for (let c = 0; c < 4; c++) {
          const r = this.re[c][k], im = this.im[c][k];
          this.re[c][k] = r * ca - im * sa;
          this.im[c][k] = r * sa + im * ca;
        }
      }
    }

    /** Un paso temporal unitario (Strang splitting). */
    step(dt) {
      const N = this.N, c = this.c, mc2 = this.m * c * c;
      this._applyV(dt * 0.5);
      for (let comp = 0; comp < 4; comp++) this._fft2d(comp, false);

      // Matriz unitaria 2x2 de Dirac 1D: U(k) = cos(E dt) I - i sin(E dt)/E * (ck σ_z + mc² σ_x)
      const u1Cache = new Float64Array(N * 8);
      for (let i = 0; i < N; i++) {
        const ck = c * this.kAt(i);
        const E = Math.sqrt(ck * ck + mc2 * mc2);
        const cs = Math.cos(E * dt), sn = E > 1e-12 ? Math.sin(E * dt) / E : dt;
        const off = i * 8;
        // u00, u01, u10, u11 (re, im)
        u1Cache[off + 0] = cs;            u1Cache[off + 1] = -sn * ck;
        u1Cache[off + 2] = 0;             u1Cache[off + 3] = -sn * mc2;
        u1Cache[off + 4] = 0;             u1Cache[off + 5] = -sn * mc2;
        u1Cache[off + 6] = cs;            u1Cache[off + 7] = sn * ck;
      }

      const [r0, r1, r2, r3] = this.re;
      const [i0, i1, i2, i3] = this.im;

      for (let i = 0; i < N; i++) {
        const o1 = i * 8;
        const a00r = u1Cache[o1],     a00i = u1Cache[o1 + 1];
        const a01r = u1Cache[o1 + 2], a01i = u1Cache[o1 + 3];
        const a10r = u1Cache[o1 + 4], a10i = u1Cache[o1 + 5];
        const a11r = u1Cache[o1 + 6], a11i = u1Cache[o1 + 7];

        for (let j = 0; j < N; j++) {
          const idx = i * N + j, o2 = j * 8;
          const b00r = u1Cache[o2],     b00i = u1Cache[o2 + 1];
          const b01r = u1Cache[o2 + 2], b01i = u1Cache[o2 + 3];
          const b10r = u1Cache[o2 + 4], b10i = u1Cache[o2 + 5];
          const b11r = u1Cache[o2 + 6], b11i = u1Cache[o2 + 7];

          // Primero aplicar U2 sobre índice 2: (0,1) y (2,3)
          const x0r = r0[idx], x0i = i0[idx], x1r = r1[idx], x1i = i1[idx];
          const x2r = r2[idx], x2i = i2[idx], x3r = r3[idx], x3i = i3[idx];

          const t0r = b00r * x0r - b00i * x0i + b01r * x1r - b01i * x1i;
          const t0i = b00r * x0i + b00i * x0r + b01r * x1i + b01i * x1r;
          const t1r = b10r * x0r - b10i * x0i + b11r * x1r - b11i * x1i;
          const t1i = b10r * x0i + b10i * x0r + b11r * x1i + b11i * x1r;

          const t2r = b00r * x2r - b00i * x2i + b01r * x3r - b01i * x3i;
          const t2i = b00r * x2i + b00i * x2r + b01r * x3i + b01i * x3r;
          const t3r = b10r * x2r - b10i * x2i + b11r * x3r - b11i * x3i;
          const t3i = b10r * x2i + b10i * x2r + b11r * x3i + b11i * x3r;

          // Luego aplicar U1 sobre índice 1: (0,2) y (1,3)
          r0[idx] = a00r * t0r - a00i * t0i + a01r * t2r - a01i * t2i;
          i0[idx] = a00r * t0i + a00i * t0r + a01r * t2i + a01i * t2r;
          r2[idx] = a10r * t0r - a10i * t0i + a11r * t2r - a11i * t2i;
          i2[idx] = a10r * t0i + a10i * t0r + a11r * t2i + a11i * t2r;

          r1[idx] = a00r * t1r - a00i * t1i + a01r * t3r - a01i * t3i;
          i1[idx] = a00r * t1i + a00i * t1r + a01r * t3i + a01i * t3r;
          r3[idx] = a10r * t1r - a10i * t1i + a11r * t3r - a11i * t3i;
          i3[idx] = a10r * t1i + a10i * t1r + a11r * t3i + a11i * t3r;
        }
      }

      for (let comp = 0; comp < 4; comp++) this._fft2d(comp, true);
      this._applyV(dt * 0.5);
      this.time += dt;
    }

    /** Densidad total ρ(i, j) = ∑ |ψ_c|² y marginales ρ₁(i), ρ₂(j). */
    density() {
      const N = this.N, M = N * N;
      const rho = new Float64Array(M);
      const m1 = new Float64Array(N), m2 = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const idx = i * N + j;
          let s = 0;
          for (let c = 0; c < 4; c++) {
            s += this.re[c][idx] ** 2 + this.im[c][idx] ** 2;
          }
          rho[idx] = s;
          m1[i] += s;
          m2[j] += s;
        }
      }
      return { rho, m1, m2 };
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { MODELS, STANDARD_MODEL, Dirac2P };
    return;
  }

  // ---------- Interfaz del navegador ----------
  const $ = (id) => document.getElementById(id);
  let activeTab = "history";
  let modelIdx = 7; // Inicia en Dirac (1928) o deslizable desde 0..9
  let histT = 0;

  const hCv = $("histCanvas"), hCtx = hCv.getContext("2d");
  const dCv = $("diracCanvas"), dCtx = dCv.getContext("2d");

  function renderModelCard() {
    const m = MODELS[modelIdx];
    $("histYear").textContent = m.year;
    $("histTitle").textContent = m.title;
    $("histEq").textContent = m.eq;
    $("histExplains").textContent = m.explains;
    $("histFails").textContent = m.fails;
    $("histSlider").value = modelIdx;

    const smWrap = $("smTableWrap");
    if (m.kind === "sm") {
      smWrap.hidden = false;
      smWrap.innerHTML = `<div class="sm-grid">` + STANDARD_MODEL.map((p) => {
        if (!p) return `<div class="sm-empty"></div>`;
        return `<div class="sm-cell sm-${p.cat}" title="${p.name} · masa ${p.mass} · carga ${p.q} · espín ${p.spin}">
          <b>${p.sym}</b><small>${p.name}</small><span>${p.mass}</span>
        </div>`;
      }).join("") + `</div>`;
    } else {
      smWrap.hidden = true;
    }
  }

  function drawHistoryCanvas(dt) {
    histT += dt;
    const dpr = window.devicePixelRatio || 1;
    const W = hCv.clientWidth, H = hCv.clientHeight;
    if (!W || !H) return;
    if (hCv.width !== Math.round(W * dpr) || hCv.height !== Math.round(H * dpr)) {
      hCv.width = Math.round(W * dpr); hCv.height = Math.round(H * dpr);
    }
    const c = hCtx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = "#0d1117"; c.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.32;
    const kind = MODELS[modelIdx].kind;

    if (kind === "thomson") {
      const grad = c.createRadialGradient(cx, cy, 10, cx, cy, R);
      grad.addColorStop(0, "rgba(255,107,107,0.45)");
      grad.addColorStop(1, "rgba(255,107,107,0.08)");
      c.fillStyle = grad; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "#ff6b6b"; c.stroke();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.sin(histT * 3 + k) * 0.1;
        const rr = R * (k % 2 === 0 ? 0.45 : 0.72);
        c.fillStyle = "#4dabf7";
        c.beginPath(); c.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 6, 0, Math.PI * 2); c.fill();
      }
    } else if (kind === "rutherford") {
      c.fillStyle = "#ff6b6b"; c.beginPath(); c.arc(cx, cy, 7, 0, Math.PI * 2); c.fill();
      const prog = (histT * 0.35) % 1;
      c.strokeStyle = "rgba(77,171,247,0.4)"; c.beginPath();
      for (let s = 0; s <= 120; s++) {
        const u = s / 120, r = R * (1 - u * 0.92), ang = u * Math.PI * 8;
        const px = cx + Math.cos(ang) * r, py = cy + Math.sin(ang) * r;
        if (s === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.stroke();
      const r = R * (1 - prog * 0.92), ang = prog * Math.PI * 8;
      c.fillStyle = "#4dabf7"; c.beginPath(); c.arc(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, 5.5, 0, Math.PI * 2); c.fill();
    } else if (kind === "bohr") {
      c.fillStyle = "#ff6b6b"; c.beginPath(); c.arc(cx, cy, 7, 0, Math.PI * 2); c.fill();
      [0.35, 0.65, 1.0].forEach((f, idx) => {
        c.strokeStyle = "#30363d"; c.beginPath(); c.arc(cx, cy, R * f, 0, Math.PI * 2); c.stroke();
        const a = histT * (2.2 - idx * 0.5);
        c.fillStyle = "#4dabf7"; c.beginPath(); c.arc(cx + Math.cos(a) * R * f, cy + Math.sin(a) * R * f, 5, 0, Math.PI * 2); c.fill();
      });
    } else if (kind === "debroglie") {
      const n = 4, rr = R * 0.78;
      c.strokeStyle = "#30363d"; c.beginPath(); c.arc(cx, cy, rr, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = "#69db7c"; c.lineWidth = 2.2; c.beginPath();
      for (let k = 0; k <= 180; k++) {
        const a = (k / 180) * Math.PI * 2;
        const dr = 16 * Math.sin(n * a) * Math.cos(histT * 4);
        const px = cx + Math.cos(a) * (rr + dr), py = cy + Math.sin(a) * (rr + dr);
        if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.stroke(); c.lineWidth = 1;
    } else if (kind === "schrodinger" || kind === "pauli" || kind === "dirac") {
      // Nube 2p_z / contracción relativista ilustrativa
      const shrink = kind === "dirac" ? 0.78 : 1.0;
      const lobes = kind === "dirac" ? [-1, 1] : [-1, 1];
      lobes.forEach((s) => {
        const grad = c.createRadialGradient(cx, cy + s * R * 0.42 * shrink, 4, cx, cy + s * R * 0.42 * shrink, R * 0.55 * shrink);
        grad.addColorStop(0, s > 0 ? "rgba(77,171,247,0.8)" : "rgba(255,146,43,0.8)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = grad; c.beginPath(); c.arc(cx, cy + s * R * 0.42 * shrink, R * 0.55 * shrink, 0, Math.PI * 2); c.fill();
      });
      if (kind === "pauli" || kind === "dirac") {
        // Flecha de espín precesando
        const px = cx + Math.sin(histT * 3) * 16, py = cy - 42;
        c.strokeStyle = "#f0c000"; c.lineWidth = 2.5;
        c.beginPath(); c.moveTo(cx, cy + 20); c.lineTo(px, py); c.stroke();
        c.fillStyle = "#f0c000"; c.font = "12px sans-serif";
        c.fillText(kind === "dirac" ? "espín ½ + ψ_B (v/c)" : "espín ½ (↑/↓)", cx + 18, cy - 28);
        c.lineWidth = 1;
      }
    } else if (kind === "kleingordon") {
      // Cono de dispersión E = ±√(p²c² + m²c⁴)
      c.strokeStyle = "#30363d";
      c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.stroke();
      const drawBranch = (sign, col) => {
        c.strokeStyle = col; c.lineWidth = 2.2; c.beginPath();
        for (let k = -40; k <= 40; k++) {
          const p = k / 40, E = sign * Math.sqrt(p * p * 0.8 + 0.12);
          const px = cx + p * R, py = cy - E * R;
          if (k === -40) c.moveTo(px, py); else c.lineTo(px, py);
        }
        c.stroke();
      };
      drawBranch(1, "#4dabf7");
      drawBranch(-1, "#ff6b6b");
      c.fillStyle = "#4dabf7"; c.fillText("E > 0 (partícula)", cx + 12, cy - R * 0.7);
      c.fillStyle = "#ff6b6b"; c.fillText("E < 0", cx + 12, cy + R * 0.7);
      c.lineWidth = 1;
    } else if (kind === "qed") {
      // Diagrama de Feynman animado: e⁻ + e⁻ → e⁻ + e⁻ intercambiando γ
      c.strokeStyle = "#4dabf7"; c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(cx - R, cy - R * 0.6); c.lineTo(cx - R * 0.35, cy); c.lineTo(cx - R, cy + R * 0.6);
      c.moveTo(cx + R, cy - R * 0.6); c.lineTo(cx + R * 0.35, cy); c.lineTo(cx + R, cy + R * 0.6);
      c.stroke();
      c.strokeStyle = "#f0c000"; c.beginPath();
      for (let k = 0; k <= 60; k++) {
        const u = k / 60, px = cx - R * 0.35 + u * R * 0.7;
        const py = cy + Math.sin(u * Math.PI * 6 - histT * 8) * 7;
        if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.stroke();
      c.fillStyle = "#f0c000"; c.font = "13px sans-serif"; c.fillText("γ (fotón virtual)", cx - 44, cy - 16);
      c.fillStyle = "#4dabf7"; c.fillText("e⁻", cx - R - 18, cy - R * 0.6); c.fillText("e⁻", cx + R + 6, cy - R * 0.6);
      c.lineWidth = 1;
    } else if (kind === "sm") {
      c.fillStyle = "#8b949e"; c.font = "14px sans-serif"; c.textAlign = "center";
      c.fillText("17 partículas elementales · Campos cuánticos relativistas", cx, cy - 10);
      c.fillStyle = "#f0c000"; c.font = "12px sans-serif";
      c.fillText("Explora la tabla en el panel lateral →", cx, cy + 16);
      c.textAlign = "left";
    }
  }

  // ---------- Controlador Dirac 2P ----------
  const sim = new Dirac2P(64, 16.0);
  let simPlaying = true, simPreset = "ee-pauli", simC = 1.2, simSym = "anti";
  let imgData = null;

  function resetSim() {
    if (simPreset === "ee-pauli") {
      sim.initScenario({ symmetry: simSym, coupling: 1.8, c: simC, x1: -3.2, x2: 3.2, k1: 1.8, k2: -1.8 });
    } else if (simPreset === "ep-bound") {
      sim.initScenario({ symmetry: "dist", coupling: -2.6, c: simC, x1: -2.2, x2: 2.2, k1: 0.9, k2: -0.9 });
    } else if (simPreset === "klein") {
      sim.initScenario({ symmetry: simSym, coupling: 0.4, barrier: 3.2, c: simC, x1: -3.8, x2: 3.8, k1: 2.2, k2: -2.2 });
    }
  }

  function heatRGB(t) {
    const v = Math.pow(Math.min(1, Math.max(0, t)), 0.45);
    return [
      Math.min(255, Math.round(255 * Math.min(1, Math.max(0, 1.8 * v - 0.55)))),
      Math.min(255, Math.round(255 * Math.min(1, Math.max(0, 1.4 * v - 0.15)))),
      Math.min(255, Math.round(255 * Math.sin(Math.PI * Math.min(1, v * 1.15)) * 0.9 + 255 * Math.max(0, v - 0.75) * 2)),
    ];
  }

  function drawDirac2P() {
    const dpr = window.devicePixelRatio || 1;
    const W = dCv.clientWidth, H = dCv.clientHeight;
    if (!W || !H) return;
    if (dCv.width !== Math.round(W * dpr) || dCv.height !== Math.round(H * dpr)) {
      dCv.width = Math.round(W * dpr); dCv.height = Math.round(H * dpr);
    }
    dCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dCtx.fillStyle = "#0d1117"; dCtx.fillRect(0, 0, W, H);

    const size = Math.max(120, Math.min(W - 80, H - 80));
    const ox = (W - size) / 2, oy = (H - size) / 2 + 12;
    const N = sim.N;
    const { rho, m1, m2 } = sim.density();

    let maxR = 1e-9;
    for (let k = 0; k < rho.length; k++) if (rho[k] > maxR) maxR = rho[k];

    if (!imgData) imgData = dCtx.createImageData(N, N);
    const data = imgData.data;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const v = rho[i * N + j] / maxR;
        const [r, g, b] = heatRGB(v);
        const p = ((N - 1 - j) * N + i) * 4;
        data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
      }
    }
    const off = drawDirac2P._off || (drawDirac2P._off = document.createElement("canvas"));
    if (off.width !== N) { off.width = N; off.height = N; }
    off.getContext("2d").putImageData(imgData, 0, 0);

    dCtx.imageSmoothingEnabled = true;
    dCtx.drawImage(off, ox, oy, size, size);
    dCtx.strokeStyle = "#30363d"; dCtx.strokeRect(ox, oy, size, size);

    // Diagonal x1 = x2 (línea de exclusión de Pauli)
    dCtx.strokeStyle = "rgba(255,255,255,0.2)"; dCtx.setLineDash([4, 4]);
    dCtx.beginPath(); dCtx.moveTo(ox, oy + size); dCtx.lineTo(ox + size, oy); dCtx.stroke();
    dCtx.setLineDash([]);

    // Marginal ρ₁(x₁) arriba
    let maxM = 1e-9;
    for (let i = 0; i < N; i++) maxM = Math.max(maxM, m1[i], m2[i]);
    dCtx.strokeStyle = "#4dabf7"; dCtx.lineWidth = 1.6; dCtx.beginPath();
    for (let i = 0; i < N; i++) {
      const px = ox + ((i + 0.5) / N) * size, py = oy - 4 - (m1[i] / maxM) * 24;
      if (i === 0) dCtx.moveTo(px, py); else dCtx.lineTo(px, py);
    }
    dCtx.stroke();

    dCtx.fillStyle = "#8b949e"; dCtx.font = "11px sans-serif";
    dCtx.fillText("x₁ (partícula 1) →", ox + size / 2 - 42, oy + size + 16);
    dCtx.fillText(`t = ${sim.time.toFixed(2)} · ∫|Ψ|² = ${sim.norm().toFixed(4)}`, ox, oy + size + 16);
  }

  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    if (activeTab === "history") drawHistoryCanvas(dt);
    else {
      if (simPlaying) sim.step(0.035);
      drawDirac2P();
    }
    requestAnimationFrame(frame);
  }

  $("tabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (!t) return;
    activeTab = t.dataset.tab;
    document.querySelectorAll("#tabs .tab").forEach((el) => el.classList.toggle("on", el === t));
    $("viewHistory").hidden = activeTab !== "history";
    $("viewDirac2P").hidden = activeTab !== "dirac2p";
    $("sideHistory").hidden = activeTab !== "history";
    $("sideDirac2P").hidden = activeTab !== "dirac2p";
  });

  $("histSlider").addEventListener("input", (e) => { modelIdx = +e.target.value; renderModelCard(); });
  $("histPrev").addEventListener("click", () => { modelIdx = Math.max(0, modelIdx - 1); renderModelCard(); });
  $("histNext").addEventListener("click", () => { modelIdx = Math.min(MODELS.length - 1, modelIdx + 1); renderModelCard(); });

  $("simPresets").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    simPreset = b.dataset.p;
    document.querySelectorAll("#simPresets button").forEach((el) => el.classList.toggle("on", el === b));
    resetSim();
  });
  $("symBtns").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    simSym = b.dataset.s;
    document.querySelectorAll("#symBtns button").forEach((el) => el.classList.toggle("on", el === b));
    resetSim();
  });
  $("cSlider").addEventListener("input", (e) => {
    simC = +e.target.value;
    $("cVal").textContent = simC.toFixed(1);
    resetSim();
  });
  $("btnSimPlay").addEventListener("click", () => {
    simPlaying = !simPlaying;
    $("btnSimPlay").textContent = simPlaying ? "⏸ Pausar" : "▶ Reanudar";
  });
  $("btnSimReset").addEventListener("click", resetSim);
  $("btnExportPNG").addEventListener("click", () => {
    const a = document.createElement("a");
    a.download = `dirac_2p_${simPreset}.png`;
    a.href = dCv.toDataURL("image/png");
    a.click();
  });

  renderModelCard();
  resetSim();
  requestAnimationFrame(frame);
})(typeof window !== "undefined" ? window : globalThis);
