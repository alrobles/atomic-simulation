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

  const SYM = "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og".split(" ");
  const NAMES = ["Hidrógeno","Helio","Litio","Berilio","Boro","Carbono","Nitrógeno","Oxígeno","Flúor","Neón","Sodio","Magnesio","Aluminio","Silicio","Fósforo","Azufre","Cloro","Argón","Potasio","Calcio","Escandio","Titanio","Vanadio","Cromo","Manganeso","Hierro","Cobalto","Níquel","Cobre","Zinc","Galio","Germanio","Arsénico","Selenio","Bromo","Kriptón","Rubidio","Estroncio","Itrio","Circonio","Niobio","Molibdeno","Tecnecio","Rutenio","Rodio","Paladio","Plata","Cadmio","Indio","Estaño","Antimonio","Telurio","Yodo","Xenón","Cesio","Bario","Lantano","Cerio","Praseodimio","Neodimio","Prometio","Samario","Europio","Gadolinio","Terbio","Disprosio","Holmio","Erbio","Tulio","Iterbio","Lutecio","Hafnio","Tántalo","Wolframio","Renio","Osmio","Iridio","Platino","Oro","Mercurio","Talio","Plomo","Bismuto","Polonio","Ástato","Radón","Francio","Radio","Actinio","Torio","Protactinio","Uranio","Neptunio","Plutonio","Americio","Curio","Berkelio","Californio","Einstenio","Fermio","Mendelevio","Nobelio","Laurencio","Rutherfordio","Dubnio","Seaborgio","Bohrio","Hassio","Meitnerio","Darmstatio","Roentgenio","Copernicio","Nihonio","Flerovio","Moscovio","Livermorio","Tenesino","Oganesón"];

  const ELEMENTS = SYM.map((sym, i) => ({
    Z: i + 1,
    sym,
    name: NAMES[i],
    isNoble: [2, 10, 18, 36, 54, 86, 118].includes(i + 1),
  }));

  const SUBS = [];
  {
    let c = 0;
    PERIODS.forEach((row, pi) => {
      row.forEach((lab) => {
        const n = +lab[0], l = LCH.indexOf(lab[1]), cap = 2 * (2 * l + 1);
        SUBS.push({ lab, n, l, norb: 2 * l + 1, cap, start: c, period: pi });
        c += cap;
      });
    });
  }

  function subshell(lab, period) {
    const n = +lab[0], l = LCH.indexOf(lab[1]);
    return { lab, n, l, norb: 2 * l + 1, cap: 2 * (2 * l + 1), period };
  }

  /** Configuración electrónica de cualquier elemento Z (1..118). */
  function elementConfig(Z) {
    const out = [];
    for (const s of SUBS) {
      const occ = Math.max(0, Math.min(s.cap, Z - s.start));
      if (occ > 0) out.push({ ...s, occ, full: occ === s.cap });
    }
    return out;
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
    // norm2: factor para que ∫ r² (norm2·Rnl²) dr = 1
    return (radCache[key] = { rs, cdf, sg, dr, r99, norm2: 1 / (acc * dr) });
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
    config.forEach((s) => {
      const h = sgroup(s);
      const occ = s.occ !== undefined ? s.occ : s.cap;
      count[h] = (count[h] || 0) + occ;
    });
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
    return Math.max(0.5, Z - S);
  }

  /**
   * Factor relativista cualitativo sobre el radio orbital para átomos pesados (Z > 70):
   * < 1 contracción directa (s, p); > 1 expansión indirecta por apantallamiento (d, f).
   */
  function relFactor(Z, l) {
    if (Z <= 70) return 1;
    const x = Z / 137.036;
    const g = Math.sqrt(Math.max(0.25, 1 - x * x));
    const w = Math.min(1, (Z - 70) / 10);
    if (l === 0) return 1 - w * (1 - g) * 0.9;
    if (l === 1) return 1 - w * (1 - g) * 0.55;
    if (l === 2) return 1 + w * (1 - g) * 0.65;
    return 1 + w * (1 - g) * 0.85;
  }

  // Primera energía de ionización (eV, NIST ASD / estimaciones Z>103) para Z = 1..118
  const IE1 = [
    13.598, 24.587, 5.392, 9.323, 8.298, 11.260, 14.534, 13.618, 17.423, 21.565,
    5.139, 7.646, 5.986, 8.152, 10.487, 10.360, 12.968, 15.760, 4.341, 6.113,
    6.561, 6.828, 6.746, 6.767, 7.434, 7.902, 7.881, 7.640, 7.726, 9.394,
    5.999, 7.899, 9.789, 9.752, 11.814, 14.000, 4.177, 5.695, 6.217, 6.634,
    6.759, 7.092, 7.280, 7.361, 7.459, 7.576, 8.337, 8.994, 5.786, 7.344,
    8.608, 9.010, 10.451, 12.130, 3.894, 5.212, 5.577, 5.539, 5.473, 5.525,
    5.582, 5.644, 5.670, 6.150, 5.864, 5.939, 6.022, 6.108, 6.184, 6.254,
    5.426, 6.825, 7.550, 7.864, 7.833, 8.438, 8.967, 8.959, 9.226, 10.438,
    6.108, 7.417, 7.286, 8.417, 9.318, 10.748, 4.073, 5.278, 5.170, 6.307,
    5.890, 6.194, 6.266, 6.026, 5.974, 5.992, 6.198, 6.282, 6.420, 6.500,
    6.580, 6.650, 4.900, 6.010, 6.800, 7.800, 7.700, 7.600, 8.200, 9.000,
    10.60, 11.97, 7.310, 8.540, 5.580, 6.600, 7.650, 8.914
  ];

  // Electronegatividad de Pauling para Z = 1..118 (null donde no aplica)
  const PAULING_EN = [
    2.20, null, 0.98, 1.57, 2.04, 2.55, 3.04, 3.44, 3.98, null,
    0.93, 1.31, 1.61, 1.90, 2.19, 2.58, 3.16, null, 0.82, 1.00,
    1.36, 1.54, 1.63, 1.66, 1.55, 1.83, 1.88, 1.91, 1.90, 1.65,
    1.81, 2.01, 2.18, 2.55, 2.96, 3.00, 0.82, 0.95, 1.22, 1.33,
    1.60, 2.16, 1.90, 2.20, 2.28, 2.20, 1.93, 1.69, 1.78, 1.96,
    2.05, 2.10, 2.66, 2.60, 0.79, 0.89, 1.10, 1.12, 1.13, 1.14,
    1.13, 1.17, 1.20, 1.20, 1.22, 1.23, 1.24, 1.25, 1.25, 1.10,
    1.27, 1.30, 1.50, 2.36, 1.90, 2.20, 2.20, 2.28, 2.54, 2.00,
    1.62, 2.33, 2.02, 2.00, 2.20, 2.20, 0.70, 0.90, 1.10, 1.30,
    1.50, 1.38, 1.36, 1.28, 1.13, 1.28, 1.30, 1.30, 1.30, 1.30,
    1.30, 1.30, 1.30, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null
  ];

  /** Radio atómico estimado por reglas de Slater (en Å y radios de Bohr). */
  function slaterRadius(Z, opts) {
    opts = opts || {};
    const config = elementConfig(Z);
    let maxBohr = 0;
    for (const s of config) {
      const rf = opts.relativistic ? relFactor(Z, s.l) : 1;
      const z = zeff(Z, config, s) / rf;
      const rBohr = (s.n * s.n) / z;
      if (rBohr > maxBohr) maxBohr = rBohr;
    }
    return { rBohr: maxBohr, rAngstrom: maxBohr * 0.529177 };
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
   * Átomo completo para cualquier elemento Z (1..118) o índice de gas noble k.
   */
  function genAtom(kOrZ, opts) {
    opts = opts || {};
    const isGasIndex = typeof kOrZ === "number" && kOrZ >= 0 && kOrZ <= 6 && opts.isNobleIndex;
    const Z = isGasIndex ? NOBLES[kOrZ].Z : kOrZ;
    const config = elementConfig(Z);
    const visible = opts.visible || new Set(config.map((s) => s.lab));
    const total = opts.points || 40000;
    const per = Math.max(120, Math.floor(total / Math.max(1, Z)));
    const vis = config.filter((s) => visible.has(s.lab));
    const real = opts.scale === "real";
    const nmax = Math.max(...vis.map((s) => s.n), 1);
    const effZ = (s) => zeff(Z, config, s) / (opts.relativistic ? relFactor(Z, s.l) : 1);
    let maxR = 0;
    if (real) vis.forEach((s) => { maxR = Math.max(maxR, radial(s.n, s.l).r99 / effZ(s)); });
    let coreZ = 0;
    for (const nz of [2, 10, 18, 36, 54, 86, 118]) { if (nz < Z) coreZ = nz; }

    const groups = [];
    vis.forEach((s) => {
      const isCore = opts.highlightNew && s.start + (s.occ || s.cap) <= coreZ;
      const occ = s.occ !== undefined ? s.occ : s.cap;
      const g = makeGroup(isCore ? "#8b949e" : LCOLOR[s.l], isCore ? 0.14 : 0.42, occ * per);
      const rad = radial(s.n, s.l), f = real ? 1 / effZ(s) / maxR : 0;
      for (let i = 0; i < s.norb; i++) {
        const occOrb = (occ > i ? 1 : 0) + (occ > s.norb + i ? 1 : 0);
        for (let e = 0; e < occOrb * per; e++) {
          const a = s.n - 0.92, b = s.n - 0.08;
          const rr = real ? sampleR(rad)[0] * f : Math.cbrt(a * a * a + Math.random() * (b * b * b - a * a * a)) / nmax;
          const [d] = sampleDir(s.l, i);
          push(g, d[0] * rr, d[1] * rr, d[2] * rr);
        }
      }
      groups.push(g);
    });
    groups.sort((a, b) => a.alpha - b.alpha);
    return groups;
  }

  const sup = (s) => String(s).split("").map((c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[c]).join("");

  // ---------- Densidades (campo y distribución radial) ----------
  function atomShells(kOrZ, visible, opts) {
    opts = opts || {};
    const isGasIndex = typeof kOrZ === "number" && kOrZ >= 0 && kOrZ <= 6 && opts.isNobleIndex;
    const Z = isGasIndex ? NOBLES[kOrZ].Z : kOrZ;
    const config = elementConfig(Z);
    let coreZ = 0;
    for (const nz of [2, 10, 18, 36, 54, 86, 118]) { if (nz < Z) coreZ = nz; }

    return config
      .filter((s) => !visible || visible.has(s.lab))
      .map((s) => {
        const occ = s.occ !== undefined ? s.occ : s.cap;
        const rf = opts.relativistic ? relFactor(Z, s.l) : 1;
        const z = zeff(Z, config, s) / rf, rad = radial(s.n, s.l), c = occ * z * z * z * rad.norm2;
        return {
          s, z, occ, core: s.start + occ <= coreZ, rmax: rad.r99 / z,
          P: (r) => { const R = Rnl(s.n, s.l, z * r); return c * r * r * R * R; },
          rho: (r) => { const R = Rnl(s.n, s.l, z * r); return (c * R * R) / (4 * Math.PI); },
        };
      });
  }

  /** ψ (sin normalizar) de un orbital del hidrógeno en el punto (x,y,z). */
  function psi(n, l, i, x, y, z) {
    const r = Math.sqrt(x * x + y * y + z * z);
    if (r < 1e-12) return l === 0 ? Rnl(n, 0, 0) : 0;
    return Rnl(n, l, r) * ANG[l][i](x / r, y / r, z / r);
  }

  /** P(r) normalizada de un solo orbital del hidrógeno. */
  function orbitalP(n, l) {
    const rad = radial(n, l);
    return (r) => { const R = Rnl(n, l, r); return rad.norm2 * r * r * R * R; };
  }

  /** Plano (xz, xy, yz) donde el orbital se ve mejor: el que contiene más |Y|². */
  function bestPlane(l, i) {
    const f = ANG[l][i], planes = { xz: [], xy: [], yz: [] };
    let best = "xz", bv = -1;
    for (const p in planes) {
      let s = 0;
      for (let k = 0; k < 360; k++) {
        const a = (k / 360) * 2 * Math.PI, c = Math.cos(a), d = Math.sin(a);
        const v = p === "xz" ? f(c, 0, d) : p === "xy" ? f(c, d, 0) : f(0, c, d);
        s += v * v;
      }
      if (s > bv + 1e-9) { bv = s; best = p; }
    }
    return best;
  }

  function configString(k, short) {
    const conf = nobleConfig(k);
    if (short && k > 0) {
      return `[${NOBLES[k - 1].sym}] ` + conf.filter((s) => s.period === k).map((s) => s.lab + sup(s.cap)).join(" ");
    }
    return conf.map((s) => s.lab + sup(s.cap)).join(" ");
  }

  const NOBLE_MAP = { 2: "He", 10: "Ne", 18: "Ar", 36: "Kr", 54: "Xe", 86: "Rn", 118: "Og" };

  function elementConfigString(Z, short) {
    const conf = elementConfig(Z);
    let coreZ = 0;
    for (const nz of [2, 10, 18, 36, 54, 86, 118]) { if (nz < Z) coreZ = nz; }
    if (short && coreZ > 0) {
      const valence = conf.filter((s) => s.start >= coreZ);
      return `[${NOBLE_MAP[coreZ]}] ` + valence.map((s) => s.lab + sup(s.occ)).join(" ");
    }
    return conf.map((s) => s.lab + sup(s.occ)).join(" ");
  }

  const Atom = {
    LCH, LCOLOR, PERIODS, NOBLES, ANG, ANGNAME,
    SYM, NAMES, ELEMENTS, SUBS,
    subshell, nobleConfig, elementConfig, configString, elementConfigString,
    zeff, relFactor, IE1, PAULING_EN, slaterRadius,
    radial, Rnl, laguerre,
    sampleDir, sampleR, genOrbital, genAtom, sup,
    atomShells, psi, orbitalP, bestPlane,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = Atom;
  else root.Atom = Atom;
})(typeof window !== "undefined" ? window : globalThis);
