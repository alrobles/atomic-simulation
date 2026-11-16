/* chemistry.js — Hibridación de orbitales (sp, sp², sp³, sp³d, sp³d²)
 * y orbitales moleculares LCAO-MO (σ₁ₛ, σ₁ₛ* para H₂⁺ / H₂).
 * Funciona en el navegador (window.Chem) y en Node (module.exports).
 */
(function (root) {
  "use strict";

  const A = (typeof Atom !== "undefined") ? Atom : require("./physics.js");

  // Factores de normalización angular para ANG[l][i] sobre la esfera unitaria
  const ANG_NORM = [
    [1 / Math.sqrt(4 * Math.PI)],
    [
      Math.sqrt(3 / (4 * Math.PI)),
      Math.sqrt(3 / (4 * Math.PI)),
      Math.sqrt(3 / (4 * Math.PI)),
    ],
    [
      Math.sqrt(15 / (4 * Math.PI)),
      Math.sqrt(15 / (4 * Math.PI)),
      Math.sqrt(5 / (16 * Math.PI)),
      Math.sqrt(15 / (4 * Math.PI)),
      Math.sqrt(15 / (16 * Math.PI)),
    ],
  ];

  /** Función de onda hidrogenoide normalizada ψ_{n,l,i}(x,y,z). */
  function psiNorm(n, l, i, x, y, z) {
    const rad = A.radial(n, l);
    return Math.sqrt(rad.norm2) * ANG_NORM[l][i] * A.psi(n, l, i, x, y, z);
  }

  // Definición exacta y ortonormal de cada esquema de hibridación
  // Cada término: [n, l, i, coef]
  const HYBRIDS = {
    sp: {
      name: "sp (Lineal · 180°)",
      n: 2,
      angle: "180°",
      geom: "Lineal (ej. BeCl₂, C₂H₂)",
      desc: "Combinación de un orbital 2s y un 2p_z. La interferencia constructiva refuerza un lóbulo y la destructiva encoge el opuesto.",
      lobes: [
        { label: "sp (1)", color: "#4dabf7", terms: [[2, 0, 0, Math.SQRT1_2], [2, 1, 2, Math.SQRT1_2]] },
        { label: "sp (2)", color: "#69db7c", terms: [[2, 0, 0, Math.SQRT1_2], [2, 1, 2, -Math.SQRT1_2]] },
      ],
    },
    sp2: {
      name: "sp² (Trigonal plana · 120°)",
      n: 2,
      angle: "120°",
      geom: "Trigonal plana (ej. BF₃, C₂H₄)",
      desc: "Mezcla de 2s + 2p_x + 2p_z en el plano xz formando tres lóbulos coplanares a 120°.",
      lobes: [0, 1, 2].map((k) => {
        const th = (k * 2 * Math.PI) / 3;
        const colors = ["#4dabf7", "#69db7c", "#ffd43b"];
        return {
          label: `sp² (${k + 1})`,
          color: colors[k],
          terms: [
            [2, 0, 0, Math.sqrt(1 / 3)],
            [2, 1, 2, Math.sqrt(2 / 3) * Math.cos(th)],
            [2, 1, 0, Math.sqrt(2 / 3) * Math.sin(th)],
          ],
        };
      }),
    },
    sp3: {
      name: "sp³ (Tetraédrica · 109.5°)",
      n: 2,
      angle: "109.5°",
      geom: "Tetraédrica (ej. CH₄, NH₃, H₂O)",
      desc: "Combinación simétrica ¼(ψ₂ₛ ± ψ₂pₓ ± ψ₂p_y ± ψ₂p_z) dirigida hacia los cuatro vértices de un tetraedro regular.",
      lobes: [
        { label: "sp³ (1)", color: "#4dabf7", terms: [[2,0,0,0.5],[2,1,0,0.5],[2,1,1,0.5],[2,1,2,0.5]] },
        { label: "sp³ (2)", color: "#69db7c", terms: [[2,0,0,0.5],[2,1,0,0.5],[2,1,1,-0.5],[2,1,2,-0.5]] },
        { label: "sp³ (3)", color: "#ffd43b", terms: [[2,0,0,0.5],[2,1,0,-0.5],[2,1,1,0.5],[2,1,2,-0.5]] },
        { label: "sp³ (4)", color: "#ff6b6b", terms: [[2,0,0,0.5],[2,1,0,-0.5],[2,1,1,-0.5],[2,1,2,0.5]] },
      ],
    },
    sp3d: {
      name: "sp³d (Bipiramidal trigonal · 90°/120°)",
      n: 3,
      angle: "90° / 120°",
      geom: "Bipiramidal trigonal (ej. PCl₅)",
      desc: "Mezcla 3s + 3p + 3d_z²: dos lóbulos axiales (±z) y tres ecuatoriales en el plano xy separados 120°.",
      lobes: [
        { label: "axial +z", color: "#4dabf7", terms: [[3,0,0,Math.sqrt(1/6)],[3,1,2,Math.SQRT1_2],[3,2,2,Math.sqrt(1/3)]] },
        { label: "axial −z", color: "#74c0fc", terms: [[3,0,0,Math.sqrt(1/6)],[3,1,2,-Math.SQRT1_2],[3,2,2,Math.sqrt(1/3)]] },
        ...[0, 1, 2].map((k) => {
          const ph = (k * 2 * Math.PI) / 3;
          const colors = ["#69db7c", "#ffd43b", "#ff6b6b"];
          return {
            label: `ecuat. ${k + 1}`,
            color: colors[k],
            terms: [
              [3, 0, 0, Math.sqrt(2) / 3],
              [3, 2, 2, -1 / 3],
              [3, 1, 0, Math.sqrt(2 / 3) * Math.cos(ph)],
              [3, 1, 1, Math.sqrt(2 / 3) * Math.sin(ph)],
            ],
          };
        }),
      ],
    },
    sp3d2: {
      name: "sp³d² (Octaédrica · 90°)",
      n: 3,
      angle: "90°",
      geom: "Octaédrica (ej. SF₆)",
      desc: "Mezcla 3s + 3p + 3d_z² + 3d_x²−y² generando seis lóbulos equivalentes a lo largo de los ejes ±x, ±y, ±z.",
      lobes: [
        { label: "+z", color: "#4dabf7", terms: [[3,0,0,Math.sqrt(1/6)],[3,1,2,Math.SQRT1_2],[3,2,2,Math.sqrt(1/3)]] },
        { label: "−z", color: "#74c0fc", terms: [[3,0,0,Math.sqrt(1/6)],[3,1,2,-Math.SQRT1_2],[3,2,2,Math.sqrt(1/3)]] },
        { label: "+x", color: "#69db7c", terms: [[3,0,0,Math.sqrt(1/6)],[3,1,0,Math.SQRT1_2],[3,2,2,-Math.sqrt(1/12)],[3,2,4,0.5]] },
        { label: "−x", color: "#38d9a9", terms: [[3,0,0,Math.sqrt(1/6)],[3,1,0,-Math.SQRT1_2],[3,2,2,-Math.sqrt(1/12)],[3,2,4,0.5]] },
        { label: "+y", color: "#ffd43b", terms: [[3,0,0,Math.sqrt(1/6)],[3,1,1,Math.SQRT1_2],[3,2,2,-Math.sqrt(1/12)],[3,2,4,-0.5]] },
        { label: "−y", color: "#ff6b6b", terms: [[3,0,0,Math.sqrt(1/6)],[3,1,1,-Math.SQRT1_2],[3,2,2,-Math.sqrt(1/12)],[3,2,4,-0.5]] },
      ],
    },
  };

  /** Evalúa un orbital híbrido en (x, y, z) dado su arreglo de términos [n, l, i, coef]. */
  function evalHybrid(terms, x, y, z) {
    let sum = 0;
    for (let k = 0; k < terms.length; k++) {
      const [n, l, i, c] = terms[k];
      sum += c * psiNorm(n, l, i, x, y, z);
    }
    return sum;
  }

  /** Muestrea por rechazo la nube 3D de un lóbulo híbrido (o todos los lóbulos). */
  function genHybrid(type, lobeIdx, N) {
    const h = HYBRIDS[type];
    if (!h) return [];
    N = N || 24000;
    const rad = A.radial(h.n, 0);
    const Rmax = rad.r99 * 1.15;
    const S = 1 / rad.r99;

    if (lobeIdx >= 0 && lobeIdx < h.lobes.length) {
      const lobe = h.lobes[lobeIdx];
      const pos = { color: "#4dabf7", alpha: 0.48, x: new Float32Array(N), y: new Float32Array(N), z: new Float32Array(N), c: 0 };
      const neg = { color: "#ff922b", alpha: 0.42, x: new Float32Array(N), y: new Float32Array(N), z: new Float32Array(N), c: 0 };
      let maxP = 0;
      for (let k = 0; k < 4000; k++) {
        const [d] = [A.sampleDir(0, 0)[0]];
        const r = Rmax * Math.cbrt(Math.random());
        const v = evalHybrid(lobe.terms, d[0] * r, d[1] * r, d[2] * r);
        if (v * v > maxP) maxP = v * v;
      }
      maxP *= 1.25;
      let tries = 0;
      while (pos.c + neg.c < N && tries < N * 45) {
        tries++;
        const r = Rmax * Math.cbrt(Math.random());
        const z = 2 * Math.random() - 1, p = 2 * Math.PI * Math.random(), s = Math.sqrt(1 - z * z);
        const x = s * Math.cos(p) * r, y = s * Math.sin(p) * r, zz = z * r;
        const v = evalHybrid(lobe.terms, x, y, zz);
        if (Math.random() * maxP < v * v) {
          const g = v >= 0 ? pos : neg;
          g.x[g.c] = x * S; g.y[g.c] = y * S; g.z[g.c] = zz * S; g.c++;
        }
      }
      return [pos, neg];
    }

    // Todos los lóbulos a la vez (coloreados por lóbulo para apreciar la geometría)
    const perLobe = Math.floor(N / h.lobes.length);
    return h.lobes.map((lobe) => {
      const g = { color: lobe.color, alpha: 0.45, x: new Float32Array(perLobe), y: new Float32Array(perLobe), z: new Float32Array(perLobe), c: 0 };
      let maxP = 0;
      for (let k = 0; k < 2500; k++) {
        const r = Rmax * Math.cbrt(Math.random());
        const z = 2 * Math.random() - 1, p = 2 * Math.PI * Math.random(), s = Math.sqrt(1 - z * z);
        const v = evalHybrid(lobe.terms, s * Math.cos(p) * r, s * Math.sin(p) * r, z * r);
        if (v * v > maxP) maxP = v * v;
      }
      maxP *= 1.25;
      let tries = 0;
      while (g.c < perLobe && tries < perLobe * 45) {
        tries++;
        const r = Rmax * Math.cbrt(Math.random());
        const z = 2 * Math.random() - 1, p = 2 * Math.PI * Math.random(), s = Math.sqrt(1 - z * z);
        const x = s * Math.cos(p) * r, y = s * Math.sin(p) * r, zz = z * r;
        const v = evalHybrid(lobe.terms, x, y, zz);
        if (Math.random() * maxP < v * v) {
          g.x[g.c] = x * S; g.y[g.c] = y * S; g.z[g.c] = zz * S; g.c++;
        }
      }
      return g;
    });
  }

  // ---------- Orbitales moleculares LCAO-MO (H₂⁺ / H₂) ----------
  const HARTREE_EV = 27.211386;

  /** Integral de solapamiento S(R) = ⟨1s_A | 1s_B⟩ para H₂⁺ (R en radios de Bohr). */
  function moOverlap(R) {
    return Math.exp(-R) * (1 + R + (R * R) / 3);
  }

  /**
   * Energías de enlace ΔE(R) (en eV, relativas a H + H⁺) para σ₁ₛ y σ₁ₛ* en el modelo LCAO-MO.
   */
  function moEnergy(R) {
    const S = moOverlap(R);
    const J = Math.exp(-2 * R) * (1 + 1 / R) - 1 / R;
    const K = -Math.exp(-R) * (1 + R);
    const dE_bond = (1 / R + (J + K) / (1 + S)) * HARTREE_EV;
    const dE_anti = (1 / R + (J - K) / (1 - S)) * HARTREE_EV;
    return { R, S, dE_bond, dE_anti };
  }

  /** Evalúa ψ_σ(x,y,z; R) o ψ_σ*(x,y,z; R) con núcleos en (0, 0, ±R/2). */
  function evalMO(mode, R, x, y, z) {
    const rA = Math.sqrt(x * x + y * y + (z + R / 2) * (z + R / 2));
    const rB = Math.sqrt(x * x + y * y + (z - R / 2) * (z - R / 2));
    const psiA = Math.exp(-rA) / Math.sqrt(Math.PI);
    const psiB = Math.exp(-rB) / Math.sqrt(Math.PI);
    const S = moOverlap(R);
    if (mode === "anti") return (psiA - psiB) / Math.sqrt(2 * Math.max(1e-6, 1 - S));
    return (psiA + psiB) / Math.sqrt(2 * (1 + S));
  }

  /** Nube 3D de σ₁ₛ o σ₁ₛ* para distancia internuclear R (a₀). */
  function genMO(mode, R, N) {
    N = N || 24000;
    const boxR = Math.max(4.5, R / 2 + 3.5);
    const scale = 1 / 4.8;
    const pos = { color: "#4dabf7", alpha: 0.48, x: new Float32Array(N), y: new Float32Array(N), z: new Float32Array(N), c: 0 };
    const neg = { color: "#ff922b", alpha: 0.48, x: new Float32Array(N), y: new Float32Array(N), z: new Float32Array(N), c: 0 };
    const maxP = Math.pow(evalMO(mode, R, 0, 0, R / 2), 2) * 1.15;
    let tries = 0;
    while (pos.c + neg.c < N && tries < N * 60) {
      tries++;
      const x = (Math.random() * 2 - 1) * boxR;
      const y = (Math.random() * 2 - 1) * boxR;
      const z = (Math.random() * 2 - 1) * boxR;
      const v = evalMO(mode, R, x, y, z);
      if (Math.random() * maxP < v * v) {
        const g = v >= 0 ? pos : neg;
        g.x[g.c] = x * scale; g.y[g.c] = y * scale; g.z[g.c] = z * scale; g.c++;
      }
    }
    return [pos, neg];
  }

  const Chem = { HYBRIDS, psiNorm, evalHybrid, genHybrid, moOverlap, moEnergy, evalMO, genMO };
  if (typeof module !== "undefined" && module.exports) module.exports = Chem;
  else root.Chem = Chem;
})(typeof window !== "undefined" ? window : globalThis);
