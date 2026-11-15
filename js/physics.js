/* physics.js — Orbitales hidrogenoides, configuración de gases nobles y reglas de Slater.
 * Funciona en el navegador (window.Atom) y en Node (module.exports) para pruebas.
 */
(function (root) {
  "use strict";

  const LCH = "spdf";
  const LCOLOR = ["#ff6b6b", "#ffd43b", "#4dabf7", "#69db7c"]; // s p d f

  // Cada periodo empieza con ns y termina con np: al cerrarse el np aparece un gas noble.
  const PERIODS = [
    ["1s"],
    ["2s", "2p"],
    ["3s", "3p"],
    ["4s", "3d", "4p"],
    ["5s", "4d", "5p"],
    ["6s", "4f", "5d", "6p"],
    ["7s", "5f", "6d", "7p"],
  ];

  const NOBLES = [
    { Z: 2, sym: "He", name: "Helio" },
    { Z: 10, sym: "Ne", name: "Neón" },
    { Z: 18, sym: "Ar", name: "Argón" },
    { Z: 36, sym: "Kr", name: "Kriptón" },
    { Z: 54, sym: "Xe", name: "Xenón" },
    { Z: 86, sym: "Rn", name: "Radón" },
    { Z: 118, sym: "Og", name: "Oganesón" },
  ];

  function subshell(lab, period) {
    const n = +lab[0], l = LCH.indexOf(lab[1]);
    return { lab, n, l, norb: 2 * l + 1, cap: 2 * (2 * l + 1), period };
  }

  /** Configuración completa del gas noble k (0 = He … 6 = Og). */
  function nobleConfig(k) {
    const out = [];
    for (let p = 0; p <= k; p++) PERIODS[p].forEach((lab) => out.push(subshell(lab, p)));
    return out;
  }

  // ---------- Armónicos esféricos reales (forma cartesiana, dirección unitaria) ----------
  const ANG = [
    [() => 1],
    [(x) => x, (x, y) => y, (x, y, z) => z],
    [
      (x, y) => x * y,
      (x, y, z) => y * z,
      (x, y, z) => 3 * z * z - 1,
      (x, y, z) => x * z,
      (x, y) => x * x - y * y,
    ],
    [
      (x, y) => y * (3 * x * x - y * y),
      (x, y, z) => x * y * z,
      (x, y, z) => y * (5 * z * z - 1),
      (x, y, z) => z * (5 * z * z - 3),
      (x, y, z) => x * (5 * z * z - 1),
      (x, y, z) => z * (x * x - y * y),
      (x, y) => x * (x * x - 3 * y * y),
    ],
  ];
  const ANGNAME = [
    ["s"],
    ["pₓ", "p_y", "p_z"],
    ["d_xy", "d_yz", "d_z²", "d_xz", "d_x²−y²"],
    ["f_y(3x²−y²)", "f_xyz", "f_yz²", "f_z³", "f_xz²", "f_z(x²−y²)", "f_x(x²−3y²)"],
  ];

  function randDir() {
    const z = 2 * Math.random() - 1, p = 2 * Math.PI * Math.random(), s = Math.sqrt(1 - z * z);
    return [s * Math.cos(p), s * Math.sin(p), z];
  }

  let ANGMAX = null;
  function angMax() {
    if (!ANGMAX)
      ANGMAX = ANG.map((L) =>
        L.map((f) => {
          let m = 0;
          for (let k = 0; k < 20000; k++) m = Math.max(m, Math.abs(f(...randDir())));
          return m * 1.02;
        })
      );
    return ANGMAX;
  }

  /** Dirección muestreada de |Y_lm|² por rechazo; devuelve [dir, signo]. */
  function sampleDir(l, i) {
    const f = ANG[l][i], M = angMax()[l][i];
    for (;;) {
      const d = randDir(), v = f(d[0], d[1], d[2]);
      if (Math.random() * M * M < v * v) return [d, v >= 0 ? 1 : -1];
    }
  }

  // ---------- Parte radial (hidrógeno, Z = 1, radios de Bohr) ----------
  function laguerre(k, a, x) {
    if (k === 0) return 1;
    let L0 = 1, L1 = 1 + a - x;
    for (let i = 1; i < k; i++) {
      const L2 = ((2 * i + 1 + a - x) * L1 - (i + a) * L0) / (i + 1);
      L0 = L1; L1 = L2;
    }
    return L1;
  }
  function Rnl(n, l, r) {
    const rho = (2 * r) / n;
    return Math.pow(rho, l) * Math.exp(-rho / 2) * laguerre(n - l - 1, 2 * l + 1, rho);
  }

  const radCache = {};
  /** CDF tabulada de P(r) = r² R², para muestreo por inversión. */
  function radial(n, l) {
    const key = n + "," + l;
    if (radCache[key]) return radCache[key];
    const G = 4000, rmax = 3 * n * n + 12, dr = rmax / G;
    const rs = new Float64Array(G), cdf = new Float64Array(G), sg = new Int8Array(G);
    let acc = 0;
    for (let k = 0; k < G; k++) {
      const r = (k + 0.5) * dr, R = Rnl(n, l, r);
      rs[k] = r; sg[k] = R >= 0 ? 1 : -1; acc += r * r * R * R; cdf[k] = acc;
    }
    let r99 = rmax;
    for (let k = 0; k < G; k++) {
      cdf[k] /= acc;
      if (cdf[k] > 0.99 && r99 === rmax) r99 = rs[k];
    }
    return (radCache[key] = { rs, cdf, sg, dr, r99 });
  }
  function sampleR(rad) {
    const u = Math.random();
    let lo = 0, hi = rad.cdf.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (rad.cdf[m] < u) lo = m + 1; else hi = m;
    }
    return [rad.rs[lo] + (Math.random() - 0.5) * rad.dr, rad.sg[lo]];
  }

  // ---------- Reglas de Slater (carga nuclear efectiva) ----------
  const SLATER_ORDER = ["1sp", "2sp", "3sp", "3d", "4sp", "4d", "4f", "5sp", "5d", "5f", "6sp", "6d", "7sp"];
  const sgroup = (s) => s.n + (s.l <= 1 ? "sp" : LCH[s.l]);

  function zeff(Z, config, sub) {
    const g = sgroup(sub), gi = SLATER_ORDER.indexOf(g);
    const count = {};
    config.forEach((s) => { const h = sgroup(s); count[h] = (count[h] || 0) + s.cap; });
    let S = 0;
    for (const h in count) {
      const e = count[h], hi = SLATER_ORDER.indexOf(h);
      if (h === g) S += (e - 1) * (g === "1sp" ? 0.3 : 0.35);
      else if (hi < gi) {
        if (sub.l <= 1) {
          const nh = parseInt(h, 10);
          S += e * (nh === sub.n - 1 ? 0.85 : nh < sub.n - 1 ? 1.0 : 0);
        } else S += e;
      }
    }
    return Z - S;
  }

  // ---------- Nubes de puntos ----------
  function makeGroup(color, alpha, N) {
    return { color, alpha, x: new Float32Array(N), y: new Float32Array(N), z: new Float32Array(N), c: 0 };
  }
  function push(g, x, y, z) {
    if (g.c >= g.x.length) return;
    g.x[g.c] = x; g.y[g.c] = y; g.z[g.c] = z; g.c++;
  }

  /** Un orbital (n,l,i) coloreado por fase, normalizado a radio ~1. */
  function genOrbital(n, l, i, N) {
    N = N || 24000;
    const rad = radial(n, l), S = 1 / rad.r99;
    const pos = makeGroup("#4dabf7", 0.45, N), neg = makeGroup("#ff922b", 0.45, N);
    for (let k = 0; k < N; k++) {
      const [r, sr] = sampleR(rad), [d, sa] = sampleDir(l, i);
      push(sr * sa > 0 ? pos : neg, d[0] * r * S, d[1] * r * S, d[2] * r * S);
    }
    return [pos, neg];
  }

  /**
   * Átomo completo del gas noble k.
   * opts.scale: "didactic" (radio ∝ n) | "real" (hidrogenoide con Z_ef de Slater)
   * opts.visible: Set de etiquetas de subcapa visibles
   * opts.highlightNew: atenúa el "carozo" del gas noble anterior
   */
  function genAtom(k, opts) {
    opts = opts || {};
    const Z = NOBLES[k].Z, config = nobleConfig(k);
    const visible = opts.visible || new Set(config.map((s) => s.lab));
    const total = opts.points || 40000;
    const per = Math.max(140, Math.floor(total / Z));
    const vis = config.filter((s) => visible.has(s.lab));
    const real = opts.scale === "real";
    const nmax = Math.max(...vis.map((s) => s.n), 1);
    let maxR = 0;
    if (real) vis.forEach((s) => { maxR = Math.max(maxR, radial(s.n, s.l).r99 / zeff(Z, config, s)); });
    const groups = [];
    vis.forEach((s) => {
      const core = opts.highlightNew && s.period < k;
      const g = makeGroup(core ? "#8b949e" : LCOLOR[s.l], core ? 0.14 : 0.42, s.cap * per);
      const rad = radial(s.n, s.l), f = real ? 1 / zeff(Z, config, s) / maxR : 0;
      for (let i = 0; i < s.norb; i++)
        for (let e = 0; e < 2 * per; e++) {
          // didáctica: la capa n ocupa su propio anillo [n−0.92, n−0.08], densidad uniforme en volumen
          const a = s.n - 0.92, b = s.n - 0.08;
          const rr = real ? sampleR(rad)[0] * f : Math.cbrt(a * a * a + Math.random() * (b * b * b - a * a * a)) / nmax;
          const [d] = sampleDir(s.l, i);
          push(g, d[0] * rr, d[1] * rr, d[2] * rr);
        }
      groups.push(g);
    });
    // dibuja primero el carozo (gris) y luego lo nuevo encima
    groups.sort((a, b) => a.alpha - b.alpha);
    return groups;
  }

  const sup = (s) => String(s).split("").map((c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[c]).join("");
  function configString(k, short) {
    const conf = nobleConfig(k);
    if (short && k > 0) {
      return `[${NOBLES[k - 1].sym}] ` + conf.filter((s) => s.period === k).map((s) => s.lab + sup(s.cap)).join(" ");
    }
    return conf.map((s) => s.lab + sup(s.cap)).join(" ");
  }

  const Atom = {
    LCH, LCOLOR, PERIODS, NOBLES, ANG, ANGNAME,
    subshell, nobleConfig, configString, zeff, radial, Rnl, laguerre,
    sampleDir, sampleR, genOrbital, genAtom, sup,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = Atom;
  else root.Atom = Atom;
})(typeof window !== "undefined" ? window : globalThis);
