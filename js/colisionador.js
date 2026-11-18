/* colisionador.js — Simulador de colisiones de iones pesados y síntesis de elementos superpesados.
 * Física real en 3 etapas:
 *   1) Potencial de Bass (1980) + Coulomb + barrera centrífuga → captura T_ℓ(E) (Hill-Wheeler + distribución de barrera)
 *   2) Dinámica dinuclear → probabilidad de núcleo compuesto P_CN(E*, ℓ) frente a cuasifisión (fisilidad efectiva)
 *   3) Evaporación estadística de neutrones (Jackson P_xn) × competencia Γ_n/(Γ_n + Γ_f) con barrera de fisión de capa
 *      amortiguada térmicamente B_f(E*) = B_f^LD + B_f^shell·exp(−E* / E_d) → σ_xn(E_cm) en picobarns (pb).
 * Funciones puras exportadas para verificación en Node (tests/check.js). */
(function () {
"use strict";

// ==================== CONSTANTES FÍSICAS ====================
const E2 = 1.4399645;        // e² / (4πε₀) en MeV·fm
const HBARC = 197.32698;     // ħc en MeV·fm
const UMEV = 931.4941;       // 1 u en MeV/c²
const MN_EX = 8.071318;      // exceso de masa del neutrón (MeV)
const MH_EX = 7.288971;      // exceso de masa de ¹H (MeV)
const MHE4_EX = 2.424916;    // exceso de masa de ⁴He (MeV)
const FM2_TO_PB = 1e10;      // 1 fm² = 10 mb = 10¹⁰ pb
const ED_SHELL = 18.5;       // energía de amortiguamiento térmico de capas (MeV)

// ==================== NOMBRES Y SÍMBOLOS IUPAC ====================
const ELEM_SYM = {
  1:"H",2:"He",3:"Li",4:"Be",5:"B",6:"C",7:"N",8:"O",9:"F",10:"Ne",
  11:"Na",12:"Mg",13:"Al",14:"Si",15:"P",16:"S",17:"Cl",18:"Ar",19:"K",20:"Ca",
  21:"Sc",22:"Ti",23:"V",24:"Cr",25:"Mn",26:"Fe",27:"Co",28:"Ni",29:"Cu",30:"Zn",
  80:"Hg",81:"Tl",82:"Pb",83:"Bi",84:"Po",85:"At",86:"Rn",87:"Fr",88:"Ra",89:"Ac",
  90:"Th",91:"Pa",92:"U",93:"Np",94:"Pu",95:"Am",96:"Cm",97:"Bk",98:"Cf",99:"Es",
  100:"Fm",101:"Md",102:"No",103:"Lr",104:"Rf",105:"Db",106:"Sg",107:"Bh",108:"Hs",109:"Mt",
  110:"Ds",111:"Rg",112:"Cn",113:"Nh",114:"Fl",115:"Mc",116:"Lv",117:"Ts",118:"Og"
};
const ELEM_NAME = {
  2:"Helio",6:"Carbono",8:"Oxígeno",10:"Neón",18:"Argón",20:"Calcio",22:"Titanio",
  24:"Cromo",26:"Hierro",30:"Zinc",82:"Plomo",83:"Bismuto",84:"Polonio",85:"Astato",
  86:"Radón",87:"Francio",88:"Radio",89:"Actinio",90:"Torio",91:"Protactinio",92:"Uranio",
  93:"Neptunio",94:"Plutonio",95:"Americio",96:"Curio",97:"Berkelio",98:"Californio",
  99:"Einstenio",100:"Fermio",101:"Mendelevio",102:"Nobelio",103:"Lawrencio",
  104:"Rutherfordio",105:"Dubnio",106:"Seaborgio",107:"Bohrio",108:"Hassio",109:"Meitnerio",
  110:"Darmstatio",111:"Roentgenio",112:"Copernicio",113:"Nihonio",114:"Flerovio",
  115:"Moscovio",116:"Livermorio",117:"Teneso",118:"Oganesón"
};
const IUPAC_ROOTS = ["nil","un","bi","tri","quad","pent","hex","sept","oct","enn"];
const IUPAC_SYM = ["n","u","b","t","q","p","h","s","o","e"];

function elementInfo(Z) {
  if (ELEM_SYM[Z]) return { Z, sym: ELEM_SYM[Z], name: ELEM_NAME[Z] || ELEM_SYM[Z] };
  const digs = String(Z).split("").map(Number);
  const sym = digs.map((d, i) => i === 0 ? IUPAC_SYM[d].toUpperCase() : IUPAC_SYM[d]).join("");
  let raw = digs.map(d => IUPAC_ROOTS[d]).join("");
  raw = raw.replace(/ii/g, "i").replace(/nnn/g, "nn");
  const name = raw.charAt(0).toUpperCase() + raw.slice(1) + "io";
  return { Z, sym, name };
}

// ==================== CATÁLOGO DE HACES Y BLANCOS (AME2020) ====================
const BEAMS = [
  { id:"He4",  sym:"He", Z:2,  A:4,  dM: 2.425,   name:"Helio-4 (α)",  note:"núcleo doblemente mágico ligero" },
  { id:"C12",  sym:"C",  Z:6,  A:12, dM: 0.000,   name:"Carbono-12",   note:"ion ligero de referencia" },
  { id:"O16",  sym:"O",  Z:8,  A:16, dM:-4.737,   name:"Oxígeno-16",   note:"doblemente mágico (Z=8, N=8)" },
  { id:"Ne22", sym:"Ne", Z:10, A:22, dM:-8.025,   name:"Neón-22",      note:"rico en neutrones" },
  { id:"Ar40", sym:"Ar", Z:18, A:40, dM:-35.040,  name:"Argón-40",     note:"gas noble pesado" },
  { id:"Ca48", sym:"Ca", Z:20, A:48, dM:-44.225,  name:"Calcio-48",    note:"doblemente mágico (Z=20, N=28), estrella de la fusión caliente" },
  { id:"Ti50", sym:"Ti", Z:22, A:50, dM:-51.431,  name:"Titanio-50",   note:"N=28 mágico · clave para la búsqueda de Z=119 y Z=120" },
  { id:"Cr54", sym:"Cr", Z:24, A:54, dM:-56.934,  name:"Cromo-54",     note:"alternativa para Z=120 sobre ²⁴⁸Cm" },
  { id:"Fe58", sym:"Fe", Z:26, A:58, dM:-62.155,  name:"Hierro-58",    note:"fusión fría hacia Hs y Mt" },
  { id:"Zn70", sym:"Zn", Z:30, A:70, dM:-69.564,  name:"Zinc-70",      note:"fusión fría de copernicio (GSI) y nihonio (RIKEN)" }
];
const TARGETS = [
  { id:"Pb208", sym:"Pb", Z:82, A:208, dM:-21.749, beta2:0.00, name:"Plomo-208",     note:"doblemente mágico esférico (Z=82, N=126)" },
  { id:"Bi209", sym:"Bi", Z:83, A:209, dM:-18.259, beta2:0.00, name:"Bismuto-209",   note:"blanco de fusión fría (Z=83, N=126)" },
  { id:"U238",  sym:"U",  Z:92, A:238, dM: 47.309, beta2:0.24, name:"Uranio-238",    note:"actínido prolato deformado" },
  { id:"Pu242", sym:"Pu", Z:94, A:242, dM: 54.718, beta2:0.25, name:"Plutonio-242",  note:"blanco de Flerovio (Z=114)" },
  { id:"Am243", sym:"Am", Z:95, A:243, dM: 57.175, beta2:0.25, name:"Americio-243",  note:"blanco de Moscovio (Z=115)" },
  { id:"Cm248", sym:"Cm", Z:96, A:248, dM: 67.392, beta2:0.26, name:"Curio-248",     note:"blanco de Livermorio (Z=116)" },
  { id:"Bk249", sym:"Bk", Z:97, A:249, dM: 69.848, beta2:0.26, name:"Berkelio-249",  note:"blanco radiactivo (T½ = 330 d) para Teneso" },
  { id:"Cf249", sym:"Cf", Z:98, A:249, dM: 69.725, beta2:0.26, name:"Californio-249",note:"el blanco más pesado fabricable en mg (Og y Z=120)" }
];
const BEAM_MAP = Object.fromEntries(BEAMS.map(b => [b.id, b]));
const TARGET_MAP = Object.fromEntries(TARGETS.map(t => [t.id, t]));

const PRESETS = [
  { id:"Og",  beam:"Ca48", target:"Cf249", Z:118, tag:"Fusión caliente",
    lab:"JINR Dubna / LLNL", year:"2002–2006", expSigma:"0.5 pb (3n)",
    desc:"Así se fabricó el oganesón, el último gas noble de la tabla periódica: ⁴⁸Ca acelerado en ciclotrón sobre un blanco de ²⁴⁹Cf de pocos miligramos. Solo se confirmaron unos pocos átomos tras meses de haz." },
  { id:"Ts",  beam:"Ca48", target:"Bk249", Z:117, tag:"Fusión caliente",
    lab:"JINR Dubna / ORNL", year:"2010", expSigma:"1–2.4 pb (3n/4n)",
    desc:"El blanco de ²⁴⁹Bk (semivida T½ = 330 días) se produjo en el reactor HFIR de Oak Ridge y viajó contrarreloj a Dubna para sintetizar teneso." },
  { id:"Lv",  beam:"Ca48", target:"Cm248", Z:116, tag:"Fusión caliente",
    lab:"JINR Dubna / LLNL", year:"2000", expSigma:"3.3 pb (3n)",
    desc:"El livermorio-293 se identifica por su cadena α que atraviesa ²⁸⁹Fl (flerovio), con semividas crecientes a medida que desciende la energía Eα de cada desintegración." },
  { id:"Mc",  beam:"Ca48", target:"Am243", Z:115, tag:"Fusión caliente",
    lab:"JINR Dubna / LLNL", year:"2003", expSigma:"8.5 pb (hist.) / ~17 pb (2022, 3n)",
    desc:"Una de las reacciones superpesadas más productivas (~10–17 pb en 3n): produce una cadena de 5 desintegraciones α seguidas antes de fisionar." },
  { id:"Fl",  beam:"Ca48", target:"Pu242", Z:114, tag:"Fusión caliente",
    lab:"JINR Dubna / LLNL", year:"1999–2003", expSigma:"4.5 pb (hist.) / ~10 pb (2022, 3n)",
    desc:"Puerta de la Isla de Estabilidad (Z=114 predicho como cierre de capa de protones). El haz de ⁴⁸Ca aporta 28 neutrones para acercarse a N=184." },
  { id:"Nh",  beam:"Zn70", target:"Bi209", Z:113, tag:"Fusión fría (1n)",
    lab:"RIKEN (Japón, acelerador lineal RILAC)", year:"2004–2012", expSigma:"0.022 pb (1n)",
    desc:"Fusión fría sobre ²⁰⁹Bi (casi doblemente mágico): el núcleo compuesto nace tan frío (E* ≈ 15 MeV) que basta evaporar 1 neutrón, pero la cuasifisión aplasta P_CN. RIKEN tardó 9 años en observar 3 átomos." },
  { id:"Ubn", beam:"Ti50", target:"Cf249", Z:120, tag:"Frontera (sin descubrir)",
    lab:"LBNL / JINR / GSI", year:"En curso", expSigma:"pred. ~1–50 fb (3n/4n, según modelo)",
    desc:"Más allá de Z=118 ya no existen blancos macroscópicos (Es/Fm) para usar ⁴⁸Ca: hay que cambiar a un haz de ⁵⁰Ti (Z=22), disparando Z₁Z₂ y haciendo la cuasifisión aún más feroz." }
];

// Cadenas de desintegración α experimentales reales (y predicción teórica para Z=120)
// Cada paso: { Z, A, mode: "α"|"SF", Ealpha: energía cinética de la partícula α (MeV), hl: semivida (s), hlTxt }
const KNOWN_CHAINS = {
  "118-294": [
    { Z:118, A:294, mode:"α", Ealpha:11.65, hl:0.0007, hlTxt:"0.7 ms" },
    { Z:116, A:290, mode:"α", Ealpha:10.84, hl:0.008,  hlTxt:"8 ms" },
    { Z:114, A:286, mode:"α", Ealpha:10.19, hl:0.13,   hlTxt:"130 ms" },
    { Z:112, A:282, mode:"SF", Ealpha:0,    hl:0.0008, hlTxt:"0.8 ms" }
  ],
  "117-294": [
    { Z:117, A:294, mode:"α", Ealpha:10.81, hl:0.051,  hlTxt:"51 ms" },
    { Z:115, A:290, mode:"α", Ealpha:9.95,  hl:0.65,   hlTxt:"650 ms" },
    { Z:113, A:286, mode:"α", Ealpha:9.63,  hl:9.5,    hlTxt:"9.5 s" },
    { Z:111, A:282, mode:"α", Ealpha:9.00,  hl:100,    hlTxt:"1.7 min" },
    { Z:109, A:278, mode:"α", Ealpha:9.55,  hl:4.5,    hlTxt:"4.5 s" },
    { Z:107, A:274, mode:"α", Ealpha:8.80,  hl:44,     hlTxt:"44 s" },
    { Z:105, A:270, mode:"SF", Ealpha:0,    hl:3600,   hlTxt:"1.0 h" }
  ],
  "117-293": [
    { Z:117, A:293, mode:"α", Ealpha:11.03, hl:0.022,  hlTxt:"22 ms" },
    { Z:115, A:289, mode:"α", Ealpha:10.31, hl:0.33,   hlTxt:"330 ms" },
    { Z:113, A:285, mode:"α", Ealpha:9.48,  hl:4.2,    hlTxt:"4.2 s" },
    { Z:111, A:281, mode:"SF", Ealpha:0,    hl:17,     hlTxt:"17 s" }
  ],
  "116-293": [
    { Z:116, A:293, mode:"α", Ealpha:10.54, hl:0.053,  hlTxt:"53 ms" },
    { Z:114, A:289, mode:"α", Ealpha:9.82,  hl:2.1,    hlTxt:"2.1 s" },
    { Z:112, A:285, mode:"α", Ealpha:9.15,  hl:29,     hlTxt:"29 s" },
    { Z:110, A:281, mode:"SF", Ealpha:0,    hl:11,     hlTxt:"11 s" }
  ],
  "116-292": [
    { Z:116, A:292, mode:"α", Ealpha:10.66, hl:0.018,  hlTxt:"18 ms" },
    { Z:114, A:288, mode:"α", Ealpha:9.94,  hl:0.66,   hlTxt:"660 ms" },
    { Z:112, A:284, mode:"SF", Ealpha:0,    hl:0.098,  hlTxt:"98 ms" }
  ],
  "115-288": [
    { Z:115, A:288, mode:"α", Ealpha:10.46, hl:0.164,  hlTxt:"164 ms" },
    { Z:113, A:284, mode:"α", Ealpha:10.00, hl:0.91,   hlTxt:"0.91 s" },
    { Z:111, A:280, mode:"α", Ealpha:9.75,  hl:4.6,    hlTxt:"4.6 s" },
    { Z:109, A:276, mode:"α", Ealpha:9.71,  hl:0.62,   hlTxt:"0.62 s" },
    { Z:107, A:272, mode:"α", Ealpha:9.02,  hl:10,     hlTxt:"10 s" },
    { Z:105, A:268, mode:"SF", Ealpha:0,    hl:97200,  hlTxt:"27 h" }
  ],
  "114-287": [
    { Z:114, A:287, mode:"α", Ealpha:10.02, hl:0.48,   hlTxt:"480 ms" },
    { Z:112, A:283, mode:"α", Ealpha:9.54,  hl:4.0,    hlTxt:"4.0 s" },
    { Z:110, A:279, mode:"SF", Ealpha:0,    hl:0.20,   hlTxt:"200 ms" }
  ],
  "114-288": [
    { Z:114, A:288, mode:"α", Ealpha:9.94,  hl:0.66,   hlTxt:"660 ms" },
    { Z:112, A:284, mode:"SF", Ealpha:0,    hl:0.098,  hlTxt:"98 ms" }
  ],
  "113-278": [
    { Z:113, A:278, mode:"α", Ealpha:11.68, hl:0.0014, hlTxt:"1.4 ms" },
    { Z:111, A:274, mode:"α", Ealpha:11.15, hl:0.0064, hlTxt:"6.4 ms" },
    { Z:109, A:270, mode:"α", Ealpha:10.03, hl:0.005,  hlTxt:"5.0 ms" },
    { Z:107, A:266, mode:"α", Ealpha:9.08,  hl:1.7,    hlTxt:"1.7 s" },
    { Z:105, A:262, mode:"SF", Ealpha:0,    hl:34,     hlTxt:"34 s" }
  ],
  "120-296": [
    { Z:120, A:296, mode:"α", Ealpha:13.1,  hl:0.00004, hlTxt:"~40 µs (pred.)" },
    { Z:118, A:292, mode:"α", Ealpha:12.2,  hl:0.0006,  hlTxt:"~0.6 ms (pred.)" },
    { Z:116, A:288, mode:"α", Ealpha:11.2,  hl:0.004,   hlTxt:"~4 ms (pred.)" },
    { Z:114, A:284, mode:"SF", Ealpha:0,    hl:0.0025,  hlTxt:"2.5 ms (exp.)" }
  ],
  "120-297": [
    { Z:120, A:297, mode:"α", Ealpha:12.8,  hl:0.00015, hlTxt:"~150 µs (pred.)" },
    { Z:118, A:293, mode:"α", Ealpha:11.9,  hl:0.0015,  hlTxt:"~1.5 ms (pred.)" },
    { Z:116, A:289, mode:"α", Ealpha:10.9,  hl:0.015,   hlTxt:"~15 ms (pred.)" },
    { Z:114, A:285, mode:"α", Ealpha:10.4,  hl:0.15,    hlTxt:"150 ms (exp.)" },
    { Z:112, A:281, mode:"α", Ealpha:10.3,  hl:0.13,    hlTxt:"130 ms (exp.)" },
    { Z:110, A:277, mode:"α", Ealpha:10.55, hl:0.004,   hlTxt:"4 ms (exp.)" },
    { Z:108, A:273, mode:"α", Ealpha:9.53,  hl:0.76,    hlTxt:"760 ms (exp.)" },
    { Z:106, A:269, mode:"α", Ealpha:8.56,  hl:180,     hlTxt:"3 min (exp.)" },
    { Z:104, A:265, mode:"SF", Ealpha:0,    hl:60,      hlTxt:"1 min (exp.)" }
  ]
};

// Isótopos superpesados conocidos para contexto en la Carta de Nuclidos (Z -> [A_min, A_max])
const KNOWN_SH_ISOTOPES = [
  [104,253,268],[105,255,270],[106,258,271],[107,260,275],[108,263,277],[109,265,279],
  [110,267,281],[111,272,282],[112,277,285],[113,278,286],[114,284,290],[115,287,290],
  [116,289,293],[117,293,294],[118,294,294]
];

// ==================== MODELO DE MASAS Y CAPAS (ISLA DE ESTABILIDAD) ====================
/** Corrección de capa E_shell(Z, N) en MeV (negativa = estabilización cuántica) */
function shellCorr(Z, N) {
  let e = 0;
  // Capa doblemente mágica esférica Z=82, N=126 (²⁰⁸Pb)
  e += -12.6 * Math.exp(-((Z - 82) ** 2) / 24 - ((N - 126) ** 2) / 40);
  // Capa deformada Z=108, N=162 (²⁷⁰Hs)
  e += -6.8 * Math.exp(-((Z - 108) ** 2) / 34 - ((N - 162) ** 2) / 65);
  // Isla de Estabilidad centrada en Z≈114–120, N=184
  e += -9.2 * Math.exp(-((Z - 114.6) ** 2) / 44 - ((N - 184) ** 2) / 155);
  return e;
}

/** Exceso de masa ΔM(Z, A) en MeV (gota líquida Myers-Swiatecki + emparejamiento + capas) */
function massExcess(Z, A) {
  const N = A - Z;
  if (Z <= 0 || N <= 0 || A <= 1) return 0;
  const I = (N - Z) / A;
  const a13 = Math.cbrt(A);
  const a23 = a13 * a13;
  const Bv = 15.677 * (1 - 1.79 * I * I) * A;
  const Bs = -18.56 * (1 - 1.79 * I * I) * a23;
  const Bc = -0.717 * Z * Z / a13 + 1.21129 * Z * Z / A;
  const pair = (Z % 2 === 0 && N % 2 === 0) ? 11 / Math.sqrt(A)
             : (Z % 2 === 1 && N % 2 === 1) ? -11 / Math.sqrt(A) : 0;
  const B = Bv + Bs + Bc + pair - shellCorr(Z, N);
  return Z * MH_EX + N * MN_EX - B;
}

/** Barrera de fisión macroscópica de gota líquida (MeV); cae a ~0 para Z > 106 */
function fissionBarrierLD(Z, A) {
  const N = A - Z, I = (N - Z) / A;
  const x = (Z * Z / A) / (50.883 * (1 - 1.7826 * I * I));
  if (x >= 1) return 0;
  return 0.83 * Math.pow(1 - x, 3) * 18.56 * Math.pow(A, 2 / 3);
}

/** Valor Q de fusión completa Q = ΔM_p + ΔM_t − ΔM_CN (MeV; negativo = endotérmica) */
function reactionQ(p, t) {
  return p.dM + t.dM - massExcess(p.Z + t.Z, p.A + t.A);
}

/** Energía en el laboratorio correspondiente a E_cm (MeV) */
function labEnergy(Ecm, p, t) {
  return Ecm * (p.A + t.A) / t.A;
}

function fmtHalfLife(s) {
  if (s < 1e-6) return (s * 1e9).toFixed(0) + " ns";
  if (s < 1e-3) return (s * 1e6).toFixed(0) + " µs";
  if (s < 1)    return (s * 1e3).toFixed(s < 0.01 ? 1 : 0) + " ms";
  if (s < 60)   return s.toFixed(s < 10 ? 2 : 0) + " s";
  if (s < 3600) return (s / 60).toFixed(1) + " min";
  if (s < 86400) return (s / 3600).toFixed(1) + " h";
  if (s < 3.156e7) return (s / 86400).toFixed(1) + " d";
  return (s / 3.156e7).toExponential(1) + " años";
}

/** Genera la cadena de desintegración α real (si se conoce) o vía Viola-Seaborg */
function buildDecayChain(Z, A) {
  const key = `${Z}-${A}`;
  if (KNOWN_CHAINS[key]) return KNOWN_CHAINS[key].map(s => ({ ...s, approx: Z >= 119 }));
  const chain = [];
  let z = Z, a = A;
  for (let step = 0; step < 6; step++) {
    const qA = massExcess(z, a) - massExcess(z - 2, a - 4) - MHE4_EX;
    if (!(qA > 4.2) || z <= 82) {
      chain.push({ Z: z, A: a, mode: "larga", Ealpha: 0, hl: 1e12, hlTxt: "larga vida / β", approx: true });
      break;
    }
    const eAlpha = qA * (a - 4) / a;
    const hOdd = (z % 2) && ((a - z) % 2) ? 1.11 : (z % 2) ? 0.77 : ((a - z) % 2) ? 1.07 : 0;
    const logT = (1.66175 * z - 8.5166) / Math.sqrt(qA) + (-0.20228 * z - 33.9069) + hOdd;
    const hl = Math.pow(10, Math.max(-9, Math.min(12, logT)));
    const bf = fissionBarrierLD(z, a) + Math.max(0, -shellCorr(z, a - z));
    // Termina en fisión espontánea si la barrera de fisión cae en la zona de Db/Rf/Cn
    if (step >= 2 && z <= 112 && bf < 5.4) {
      chain.push({ Z: z, A: a, mode: "SF", Ealpha: 0, hl: Math.min(hl, 12), hlTxt: "orden de mag.", approx: true });
      break;
    }
    chain.push({ Z: z, A: a, mode: "α", Ealpha: +eAlpha.toFixed(2), Q: +qA.toFixed(2), hl, hlTxt: fmtHalfLife(hl), approx: true });
    z -= 2; a -= 4;
    if (step === 5) chain[chain.length - 1].truncated = true;
  }
  return chain;
}

// ==================== ETAPA 1: POTENCIAL DE BASS (1980) + COULOMB ====================
function sharpRadius(A) {
  const a13 = Math.cbrt(A);
  return 1.16 * a13 - 1.39 / a13;
}

/** Potencial efectivo V(r, ℓ) = V_Coul + V_Bass + V_cent en MeV (r en fm) */
function bassPotential(r, p, t, ell = 0) {
  const R1 = sharpRadius(p.A), R2 = sharpRadius(t.A);
  const Rc = R1 + R2;
  const red = (R1 * R2) / Rc;
  const mu = (p.A * t.A) / (p.A + t.A) * UMEV;
  const rr = Math.max(r, 1.0);
  // Coulomb suavizado dentro del radio de contacto Rc
  const Vc = rr >= Rc
    ? (p.Z * t.Z * E2) / rr
    : (p.Z * t.Z * E2 / (2 * Rc)) * (3 - (rr * rr) / (Rc * Rc));
  // Potencial nuclear de proximidad Bass (1980), saturado dentro del bolsillo
  const s = Math.max(rr - Rc, -1.6);
  const Vn = -red / (0.030 * Math.exp(s / 3.30) + 0.0061 * Math.exp(s / 0.65));
  const Vcent = ell > 0 ? (HBARC * HBARC * ell * (ell + 1)) / (2 * mu * rr * rr) : 0;
  return { Vc, Vn, Vcent, Vtot: Vc + Vn + Vcent };
}

/** Encuentra la altura V_B (MeV), radio R_B (fm) y curvatura ħω (MeV) de la barrera */
function findBarrier(p, t, ell = 0) {
  const R1 = sharpRadius(p.A), R2 = sharpRadius(t.A);
  const Rc = R1 + R2;
  const mu = (p.A * t.A) / (p.A + t.A) * UMEV;
  let vmax = -1e9, rmax = Rc + 2.2;
  for (let r = Rc - 0.4; r <= Rc + 8.0; r += 0.025) {
    const v = bassPotential(r, p, t, ell).Vtot;
    if (v > vmax) { vmax = v; rmax = r; }
  }
  const dr = 0.05;
  const vp = bassPotential(rmax + dr, p, t, ell).Vtot;
  const vm = bassPotential(rmax - dr, p, t, ell).Vtot;
  const d2v = (vp - 2 * vmax + vm) / (dr * dr);
  const hw = HBARC * Math.sqrt(Math.max(0.15, -d2v) / mu);
  return { Vb: vmax, Rb: rmax, hw, mu, R1, R2, Rc };
}

// ==================== ETAPA 2 & 3: P_CN, JACKSON Y SECCIÓN EFICAZ σ_xn ====================
/** Probabilidad de formación del núcleo compuesto P_CN (frente a cuasifisión) */
function calcPCN(p, t, Estar, EstarB, ell) {
  const Z = p.Z + t.Z, A = p.A + t.A, N = A - Z, I = (N - Z) / A;
  const denom = 50.883 * (1 - 1.7826 * I * I);
  const xCN = (Z * Z / A) / denom;
  const a1 = Math.cbrt(p.A), a2 = Math.cbrt(t.A);
  const xEff = (4 * p.Z * t.Z / (a1 * a2 * (a1 + a2))) / denom;
  const xm = 0.75 * xEff + 0.25 * xCN; // fisilidad media de Blocki-Swiatecki
  const dx = Math.max(0, xm - 0.715);
  const P0 = Math.pow(10, -47 * dx);
  const fE = 1 / (1 + Math.exp((EstarB - Estar) / 4.0));
  const fL = Math.exp(-(ell * ell) / (2 * 22 * 22));
  return Math.min(1, P0 * (0.15 + 0.85 * fE) * fL);
}

function gammaRegP(k, z) {
  if (z <= 0) return 0;
  if (k <= 0) return 1;
  let term = 1, sum = 1;
  for (let m = 1; m < k; m++) { term *= z / m; sum += term; }
  return Math.max(0, 1 - Math.exp(-z) * sum);
}

/** Probabilidad estadística telescópica exacta de Jackson (1956) P_xn(E*):
 *  Σ_{x=1}^N P_xn(E*) = 1 − γ_reg(2N, Δ_{N+1}) ≤ 1 para todo E* y cualquier núcleo. */
function jacksonPxn(Estar, x, Bns, T) {
  let sumB = 0;
  for (let i = 0; i < x; i++) sumB += Bns[i];
  const Erem = Estar - sumB;
  if (Erem <= 0) return 0;
  const d1 = Erem / Math.max(0.25, T);
  const d2 = Math.max(0, Erem - (Bns[x] || 6.8)) / Math.max(0.25, T);
  return Math.max(0, gammaRegP(2 * x - 2, d1) - gammaRegP(2 * x, d2));
}

/** Calcula secciones eficaces σ_1n..σ_5n (en pb) y desglose físico en E_cm (MeV) y opcionalmente ℓ de inspección */
function crossSections(p, t, Ecm, inspectEll = 0) {
  const Zcn = p.Z + t.Z, Acn = p.A + t.A;
  const bar = findBarrier(p, t, 0);
  const Q = reactionQ(p, t);
  const Elab = labEnergy(Ecm, p, t);
  const Estar = Ecm + Q;
  const EstarB = bar.Vb + Q;
  const aLev = Acn / 12;
  const Bns = [], Bf0s = [], BfShs = [];
  for (let i = 0; i < 7; i++) {
    const A = Acn - i;
    Bns.push(massExcess(Zcn, A - 1) + MN_EX - massExcess(Zcn, A));
    Bf0s.push(fissionBarrierLD(Zcn, A));
    BfShs.push(Math.max(0, -shellCorr(Zcn, A - Zcn)));
  }

  const sig = [0, 0, 0, 0, 0]; // 1n..5n en pb
  const sigB = t.beta2 > 0.1 ? 3.2 : 1.5; // anchura por deformación del blanco
  const gh = [[-1.224745, 1 / 6], [0, 2 / 3], [1.224745, 1 / 6]];

  const calcTcap = ell => {
    const Vc = (HBARC * HBARC * ell * (ell + 1)) / (2 * bar.mu * bar.Rb * bar.Rb);
    let tc = 0;
    for (const [z, w] of gh) tc += w / (1 + Math.exp(2 * Math.PI * (bar.Vb + z * sigB + Vc - Ecm) / bar.hw));
    return tc;
  };
  const Tcap0 = calcTcap(0);
  const Pcn0 = Estar > 1 ? calcPCN(p, t, Estar, EstarB, 0) : 0;
  const BfDamped0 = Bf0s[0] + BfShs[0] * Math.exp(-Math.max(0, Estar) / ED_SHELL);

  if (Estar <= 1 || Ecm <= 1) {
    return {
      Ecm, Elab, Estar, Vb: bar.Vb, Rb: bar.Rb, hw: bar.hw, Q,
      sig, tot: 0, dominantX: 3,
      Tcap0, Pcn0, WsurBest: 0,
      TcapL: calcTcap(inspectEll), PcnL: 0, WsurL: 0,
      Bns, BfShell0: BfShs[0], BfLD0: Bf0s[0], BfDamped0
    };
  }

  const Tmean = 0.80 * Math.sqrt(Math.max(0.2, Estar) / aLev); // temperatura media de la cascada
  const k2 = (2 * bar.mu * Ecm) / (HBARC * HBARC);
  const prefPb = (Math.PI / k2) * FM2_TO_PB;
  const Irot = 0.4 * Acn * UMEV * Math.pow(1.2 * Math.cbrt(Acn), 2);

  const evalSurvival = ell => {
    const Erot = (HBARC * HBARC * ell * (ell + 1)) / (2 * Irot);
    let survProd = 1, Ecur = Estar;
    const w = [0, 0, 0, 0, 0];
    for (let x = 1; x <= 5; x++) {
      const idx = x - 1;
      const Ti = Math.sqrt(Math.max(0.25, Ecur) / aLev);
      const Bf = Bf0s[idx] + BfShs[idx] * Math.exp(-Ecur / ED_SHELL) - 0.35 * Erot;
      const gn_gf = 0.085 * Math.pow(Acn - idx, 2 / 3) * Ti * Math.exp((Bf - Bns[idx]) / Ti);
      survProd *= gn_gf / (1 + gn_gf);
      w[idx] = jacksonPxn(Estar, x, Bns, Tmean) * survProd;
      Ecur = Math.max(0.5, Ecur - Bns[idx] - 2 * Ti);
    }
    return w;
  };

  let Wsur0 = [0, 0, 0, 0, 0];
  for (let ell = 0; ell <= 70; ell++) {
    const Tcap = calcTcap(ell);
    if (Tcap < 1e-7) break;
    const Pcn = calcPCN(p, t, Estar, EstarB, ell);
    const wArr = evalSurvival(ell);
    if (ell === 0) Wsur0 = wArr;
    for (let i = 0; i < 5; i++) sig[i] += prefPb * (2 * ell + 1) * Tcap * Pcn * wArr[i];
  }

  let tot = 0, bestX = 1, bestV = -1;
  for (let i = 0; i < 5; i++) {
    tot += sig[i];
    if (sig[i] > bestV) { bestV = sig[i]; bestX = i + 1; }
  }
  const WsurBest = Math.min(1, Wsur0.reduce((a, b) => a + b, 0));
  const wL = inspectEll > 0 ? evalSurvival(inspectEll) : Wsur0;
  return {
    Ecm, Elab, Estar, Vb: bar.Vb, Rb: bar.Rb, hw: bar.hw, Q,
    sig, tot, dominantX: bestX,
    Tcap0, Pcn0, WsurBest,
    TcapL: calcTcap(inspectEll), PcnL: calcPCN(p, t, Estar, EstarB, inspectEll),
    WsurL: Math.min(1, wL.reduce((a, b) => a + b, 0)),
    Bns, BfShell0: BfShs[0], BfLD0: Bf0s[0], BfDamped0
  };
}

/** Curva completa de excitación σ_xn(E_cm) alrededor de la barrera de Bass */
function excitationCurve(p, t, nPts = 56) {
  const bar = findBarrier(p, t, 0);
  const eMin = Math.max(10, Math.floor(bar.Vb - 14));
  const eMax = Math.ceil(bar.Vb + 28);
  const pts = [];
  let peakE = bar.Vb, peakSig = 0, peakX = 3;
  for (let i = 0; i <= nPts; i++) {
    const E = eMin + (i / nPts) * (eMax - eMin);
    const r = crossSections(p, t, E);
    pts.push(r);
    if (r.tot > peakSig) { peakSig = r.tot; peakE = E; peakX = r.dominantX; }
  }
  return { eMin, eMax, bar, pts, peakE, peakSig, peakX };
}

/** Momento angular orbital ℓ en unidades de ħ para parámetro de impacto b (fm) */
function impactToEll(bFm, Ecm, p, t) {
  const mu = (p.A * t.A) / (p.A + t.A) * UMEV;
  const k = Math.sqrt(Math.max(0, 2 * mu * Ecm)) / HBARC;
  return Math.max(0, bFm * k);
}

/** Integrador RK4 en 2D de la trayectoria relativa (r en fm) bajo V_Coul + V_Bass */
function integrateTrajectory(p, t, Ecm, bFm) {
  const bar = findBarrier(p, t, 0);
  const ell = impactToEll(bFm, Ecm, p, t);
  const barL = findBarrier(p, t, ell);
  const mu = bar.mu;
  const v0 = Math.sqrt((2 * Math.max(Ecm, 1)) / mu); // en unidades de c
  const xStart = -38;
  const yStart = bFm;
  // Velocidad inicial corregida por energía potencial a distancia finita
  const rStart = Math.hypot(xStart, yStart);
  const vStartPot = bassPotential(rStart, p, t, 0).Vtot;
  const vInit = Math.sqrt((2 * Math.max(0.5, Ecm - vStartPot)) / mu);
  let x = xStart, y = yStart, vx = vInit, vy = 0;

  const accel = (rx, ry) => {
    const r = Math.hypot(rx, ry);
    const dr = 0.04;
    const dV = (bassPotential(r + dr, p, t, 0).Vtot - bassPotential(Math.max(1.0, r - dr), p, t, 0).Vtot) / (2 * dr);
    const aMag = -dV / mu;
    return [aMag * rx / r, aMag * ry / r];
  };

  const dt = 0.36 / Math.max(v0, 0.03); // paso adaptativo (~0.36 fm/paso en cualquier haz)
  const pts = [{ x, y }];
  let rMin = rStart, captured = false;
  const rCap = bar.Rb + 0.25;

  for (let s = 0; s < 420; s++) {
    const [ax1, ay1] = accel(x, y);
    const [ax2, ay2] = accel(x + 0.5 * dt * vx, y + 0.5 * dt * vy);
    const vx2 = vx + 0.5 * dt * ax1, vy2 = vy + 0.5 * dt * ay1;
    const [ax3, ay3] = accel(x + 0.5 * dt * vx2, y + 0.5 * dt * vy2);
    const vx3 = vx + 0.5 * dt * ax2, vy3 = vy + 0.5 * dt * ay2;
    const [ax4, ay4] = accel(x + dt * vx3, y + dt * vy3);
    const vx4 = vx + dt * ax3, vy4 = vy + dt * ay3;

    x += (dt / 6) * (vx + 2 * vx2 + 2 * vx3 + vx4);
    y += (dt / 6) * (vy + 2 * vy2 + 2 * vy3 + vy4);
    vx += (dt / 6) * (ax1 + 2 * ax2 + 2 * ax3 + ax4);
    vy += (dt / 6) * (ay1 + 2 * ay2 + 2 * ay3 + ay4);

    const r = Math.hypot(x, y);
    if (r < rMin) rMin = r;
    pts.push({ x, y });
    if (r <= rCap) { captured = true; break; }
    if (r > 42 && (x * vx + y * vy) > 0) break;
  }

  const thetaScatter = Math.atan2(vy, vx);
  // Error relativo de conservación de energía (en dispersión)
  const rEnd = Math.hypot(x, y);
  const Eend = 0.5 * mu * (vx * vx + vy * vy) + bassPotential(rEnd, p, t, 0).Vtot;
  return { points: pts, rMin, captured, thetaScatter, ell, VbEll: barL.Vb, E0: Ecm, Eend, v0 };
}

/** Clasifica un evento estocástico según (T_cap, P_CN, W_sur) en (E_cm, b) */
function classifyCollision(p, t, Ecm, bFm, rng = Math.random) {
  const ell = impactToEll(bFm, Ecm, p, t);
  const cs = crossSections(p, t, Ecm, ell);
  const Tcap = cs.TcapL, Pcn = cs.PcnL, Wsur = cs.WsurL;

  if (rng() > Tcap) return { outcome: "rutherford", Tcap, Pcn, Wsur: 0, ell, x: 0, cs };
  if (rng() > Pcn)  return { outcome: "quasifission", Tcap, Pcn, Wsur: 0, ell, x: 0, cs };
  if (rng() > Wsur) return { outcome: "fusion-fission", Tcap, Pcn, Wsur, ell, x: 0, cs };

  // Elige canal xn proporcional a σ_xn
  let pick = rng() * Math.max(cs.tot, 1e-30), acc = 0, ch = cs.dominantX;
  for (let i = 0; i < 5; i++) {
    acc += cs.sig[i];
    if (pick <= acc) { ch = i + 1; break; }
  }
  return { outcome: "evaporation", Tcap, Pcn, Wsur, ell, x: ch, Z: p.Z + t.Z, A: p.A + t.A - ch, cs };
}

/** Formatea sección eficaz en fb, pb, nb, µb o mb */
function fmtSigma(pb) {
  if (!(pb > 0)) return "< 10⁻⁶ pb";
  if (pb >= 1e9) return (pb / 1e9).toFixed(2) + " mb";
  if (pb >= 1e6) return (pb / 1e6).toFixed(2) + " µb";
  if (pb >= 1e3) return (pb / 1e3).toFixed(2) + " nb";
  if (pb >= 1)   return pb.toFixed(2) + " pb";
  if (pb >= 1e-3) return (pb * 1e3).toFixed(1) + " fb";
  return pb.toExponential(1) + " pb";
}

/** Tiempo medio real por 1 átomo en un acelerador típico (1 pµA = 6.24×10¹² iones/s, blanco 0.3 mg/cm²) */
function fmtCyclotronRate(pb, A_target) {
  if (!(pb > 1e-12)) return "improbable (> edad del universo)";
  const I_beam = 6.24e12; // iones/s (1 pµA)
  const n_target = (0.3e-3 / A_target) * 6.022e23; // átomos/cm²
  const sigma_cm2 = pb * 1e-36; // 1 pb = 10⁻³⁶ cm²
  const rate = I_beam * n_target * sigma_cm2; // eventos/s
  const sec = 1 / rate;
  if (sec < 1) return `~${rate.toFixed(0)} átomos/s`;
  if (sec < 60) return `~1 átomo / ${sec.toFixed(1)} s`;
  if (sec < 3600) return `~1 átomo / ${(sec / 60).toFixed(1)} min`;
  if (sec < 86400) return `~1 átomo / ${(sec / 3600).toFixed(1)} h`;
  if (sec < 3.156e7) return `~1 átomo / ${(sec / 86400).toFixed(1)} días`;
  return `~1 átomo / ${(sec / 3.156e7).toFixed(1)} años`;
}

// ==================== INTERFAZ DE NAVEGADOR ====================
if (typeof document !== "undefined") (function () {
const $ = id => document.getElementById(id);

const cvChamber = $("chamber"), ctxC = cvChamber.getContext("2d");
const cvPot = $("potCanvas"), ctxP = cvPot.getContext("2d");
const cvExc = $("excCanvas"), ctxE = cvExc.getContext("2d");
const cvMap = $("mapCanvas"), ctxM = cvMap.getContext("2d");

const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let chamberDirty = true;
let detSeq = 0;

function roundRectPath(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === "function") { ctx.roundRect(x, y, w, h, r); return; }
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const state = {
  presetId: "Og",
  beam: BEAM_MAP.Ca48,
  target: TARGET_MAP.Cf249,
  Ecm: 205,
  bFm: 1.4,
  randB: false,
  speed: reducedMotion ? 0.5 : 1,
  paused: false,
  beamOn: false,
  curve: null,
  cs: null,
  previewTraj: null,
  // estadísticas de sesión
  stats: { shots: 0, ruth: 0, qf: 0, ff: 0, er: 0, erDemo: 0, erHits: [] },
  // animación de colisión activa
  ev: null,
  // nube de nucleones pre-generada (posiciones relativas)
  projNucs: [],
  targNucs: [],
  // detector de silicio
  detections: [],
  activeChain: null,
  chainStep: -1
};

// Genera empaquetado determinista de nucleones (Z protones, N neutrones)
function packNucleons(Z, A, beta2 = 0) {
  const nucs = [];
  const R = 1.15 * Math.cbrt(A);
  const phi = Math.PI * (3 - Math.sqrt(5));
  const count = Math.min(A, 96); // representación visual nítida sin saturar
  const zFrac = Z / A;
  for (let i = 0; i < count; i++) {
    const u = (i + 0.15) / count;
    const rad = R * Math.sqrt(u) * 0.92;
    const theta = i * phi;
    // deformación prolata para actínidos (eje mayor inclinado 22°)
    const sx = 1 + 0.65 * beta2;
    const sy = 1 - 0.32 * beta2;
    const lx = rad * Math.cos(theta) * sx;
    const ly = rad * Math.sin(theta) * sy;
    const ang = 0.35;
    const x = lx * Math.cos(ang) - ly * Math.sin(ang);
    const y = lx * Math.sin(ang) + ly * Math.cos(ang);
    // alterna protones y neutrones proporcionalmente a Z/A
    const isP = ((i * 7 + 3) % count) / count < zFrac;
    nucs.push({ x, y, isP, phase: i * 1.7 });
  }
  return nucs;
}

function fitCanvas(cv, ctx) {
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return { W: 0, H: 0 };
  const rw = Math.round(W * dpr), rh = Math.round(H * dpr);
  if (cv.width !== rw || cv.height !== rh) { cv.width = rw; cv.height = rh; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { W, H };
}

// ---------- Selección de sistema / preset ----------
function setPaused(p) {
  state.paused = !!p;
  const b = $("btnPause");
  b.textContent = state.paused ? "▶ Reanudar" : "⏸ Pausa";
  b.setAttribute("aria-pressed", String(state.paused));
}

function selectReaction(beamId, targetId, presetId, customE) {
  state.beamOn = false;
  updateBeamButton();
  setPaused(false);
  state.presetId = presetId;
  state.beam = BEAM_MAP[beamId];
  state.target = TARGET_MAP[targetId];
  state.curve = excitationCurve(state.beam, state.target, 56);
  const E = customE != null ? customE : Math.round(state.curve.peakE * 2) / 2;
  state.Ecm = Math.max(state.curve.eMin, Math.min(state.curve.eMax, E));
  state.projNucs = packNucleons(state.beam.Z, state.beam.A, 0);
  state.targNucs = packNucleons(state.target.Z, state.target.A, state.target.beta2);
  state.ev = null;
  state.activeChain = null;
  state.chainStep = -1;
  state.stats = { shots: 0, ruth: 0, qf: 0, ff: 0, er: 0, erDemo: 0, erHits: [] };
  state.detections = [];
  detSeq = 0;

  // Sincroniza sliders, ARIA y selects
  const sE = $("ecmSlider");
  sE.min = state.curve.eMin; sE.max = state.curve.eMax; sE.step = "0.5"; sE.value = state.Ecm;
  cvExc.setAttribute("aria-valuemin", String(state.curve.eMin));
  cvExc.setAttribute("aria-valuemax", String(state.curve.eMax));
  $("selBeam").value = state.beam.id;
  $("selTarget").value = state.target.id;
  $("freeBox").hidden = (presetId !== "free");

  // Marca pestaña activa
  document.querySelectorAll("#tabs .tab").forEach(el => {
    const active = el.dataset.id === presetId;
    el.classList.toggle("on", active);
    el.setAttribute("aria-pressed", String(active));
  });
  if (presetId !== "free") history.replaceState(null, "", "#" + presetId);

  recomputeEnergy();
  renderDetectorLog();
}

function recomputeEnergy() {
  const inspEll = state.randB ? 0 : impactToEll(state.bFm, state.Ecm, state.beam, state.target);
  state.cs = crossSections(state.beam, state.target, state.Ecm, inspEll);
  state.previewTraj = integrateTrajectory(state.beam, state.target, state.Ecm, state.bFm);
  cvExc.setAttribute("aria-valuenow", state.Ecm.toFixed(1));
  chamberDirty = true;
  updateSidePanel();
  updateStatsUI();
  drawPotential();
  drawExcitation();
  drawNuclideMap();
}

// ---------- Lanzamiento de colisiones ----------
function launchEvent(forcedOutcome, source = "manual") {
  setPaused(false);
  const b = state.randB ? Math.sqrt(Math.random()) * 9.5 : state.bFm;
  const traj = integrateTrajectory(state.beam, state.target, state.Ecm, b);
  let res, trajAdjusted = false;
  if (forcedOutcome === "evaporation") {
    const cs = state.cs;
    const ch = cs.tot > 0 ? cs.dominantX : Math.max(1, Math.min(4, Math.round(Math.max(8, cs.Estar) / 11)));
    res = { outcome: "evaporation", Tcap: cs.TcapL, Pcn: cs.PcnL, Wsur: cs.WsurL, ell: traj.ell, x: ch, Z: state.beam.Z + state.target.Z, A: state.beam.A + state.target.A - ch, cs };
    if (!traj.captured) {
      const headTraj = integrateTrajectory(state.beam, state.target, Math.max(state.Ecm, cs.Vb + 2), Math.min(b, 2.5));
      traj.points = headTraj.points;
      traj.captured = true;
      trajAdjusted = true;
    }
  } else {
    res = classifyCollision(state.beam, state.target, state.Ecm, b);
    if (res.outcome !== "rutherford" && !traj.captured) {
      const t2 = integrateTrajectory(state.beam, state.target, Math.max(state.Ecm, state.cs.Vb + 1.5), Math.min(b, 4.0));
      traj.points = t2.points;
      traj.captured = true;
      trajAdjusted = true;
    }
    if (res.outcome === "rutherford" && traj.captured) {
      const t2 = integrateTrajectory(state.beam, state.target, Math.max(10, state.cs.Vb - 8), Math.max(b, 4.0));
      traj.points = t2.points;
      traj.captured = false;
      trajAdjusted = true;
    }
  }

  const isDemoForced = forcedOutcome === "evaporation" && source === "demo";
  state.stats.shots++;
  if (res.outcome === "rutherford") state.stats.ruth++;
  else if (res.outcome === "quasifission") state.stats.qf++;
  else if (res.outcome === "fusion-fission") state.stats.ff++;
  else if (res.outcome === "evaporation") {
    if (isDemoForced) state.stats.erDemo++;
    else state.stats.er++;
    state.stats.erHits.push({ E: state.Ecm, x: res.x, Z: res.Z, A: res.A, demo: isDemoForced });
  }

  const chain = res.outcome === "evaporation" ? buildDecayChain(res.Z, res.A) : null;
  const neutrons = [];
  if (res.outcome === "evaporation") {
    for (let i = 0; i < res.x; i++) {
      const ang = -Math.PI * 0.75 + (i + 0.5) * (Math.PI * 1.5 / Math.max(1, res.x)) + (Math.random() - 0.5) * 0.4;
      neutrons.push({ tEmit: 0.35 + i * 0.36, ang, emitted: false, x: 0, y: 0, vx: Math.cos(ang) * 26, vy: Math.sin(ang) * 26 });
    }
  } else if (res.outcome === "fusion-fission") {
    for (let i = 0; i < 3; i++) {
      const ang = Math.random() * Math.PI * 2;
      neutrons.push({ tEmit: 0.72 + i * 0.08, ang, emitted: false, x: 0, y: 0, vx: Math.cos(ang) * 24, vy: Math.sin(ang) * 24 });
    }
  }

  const splitAng = (res.outcome === "quasifission" ? (0.4 + Math.random() * 1.3) : (0.3 + Math.random() * 2.5)) * (Math.random() < 0.5 ? 1 : -1);
  const asym = res.outcome === "quasifission" ? 0.30 : 0.48;

  state.ev = {
    res, traj, b, chain, neutrons, splitAng, asym, trajAdjusted,
    phase: "approach",
    t: 0,
    approachIdx: 0,
    alphaParticles: [],
    chainIdx: -1,
    nextAlphaT: 0,
    logged: false,
    forced: isDemoForced,
    fromBeam: source === "beam"
  };
  chamberDirty = true;

  if (chain) {
    state.activeChain = { Z: res.Z, A: res.A, x: res.x, chain, Ecm: state.Ecm };
    state.chainStep = -1;
  }
  updateStatsUI();
  drawExcitation();
  drawNuclideMap();
}

// ---------- Actualización de animación ----------
let beamAccum = 0;
function stepSim(dt) {
  if (state.beamOn && (!state.ev || state.ev.phase === "done" || (state.ev.res.outcome !== "evaporation" && state.ev.t > 0.65))) {
    const sigPb = state.cs.tot;
    // Probabilidad visual acelerada proporcional a σ(E)/σ_pico para mostrar dónde funciona la sintonización
    const peak = Math.max(state.curve.peakSig, 1e-4);
    const relYield = sigPb / peak;
    beamAccum += dt * (0.04 + 0.38 * relYield);
    if (sigPb > 1e-6 && Math.random() < dt * (0.08 + 0.32 * relYield)) {
      state.beamOn = false;
      updateBeamButton();
      launchEvent("evaporation", "beam");
      return;
    }
    if (beamAccum > 0.42) {
      beamAccum = 0;
      const oldRand = state.randB;
      state.randB = true;
      launchEvent(null, "beam");
      state.randB = oldRand;
      if (state.ev && state.ev.res.outcome === "evaporation") {
        state.beamOn = false;
        updateBeamButton();
      }
    }
    chamberDirty = true;
  }

  const ev = state.ev;
  if (!ev || ev.phase === "done") return;
  chamberDirty = true;
  ev.t += dt;

  if (ev.phase === "approach") {
    const pts = ev.traj.points;
    const rate = state.beamOn ? 150 : 72;
    ev.approachIdx += dt * rate;
    if (ev.approachIdx >= pts.length - 1) {
      ev.approachIdx = pts.length - 1;
      if (ev.res.outcome === "rutherford") {
        ev.phase = "done";
      } else {
        ev.phase = "contact";
        ev.t = 0;
      }
    }
  } else if (ev.phase === "contact") {
    for (const n of ev.neutrons) {
      if (!n.emitted && ev.t >= n.tEmit) n.emitted = true;
      if (n.emitted) { n.x += n.vx * dt; n.y += n.vy * dt; }
    }
    const dur = ev.res.outcome === "quasifission" ? 1.55
              : ev.res.outcome === "fusion-fission" ? 1.85
              : 0.55 + ev.res.x * 0.42;
    if (ev.t >= dur) {
      if (ev.res.outcome === "evaporation") {
        ev.phase = "recoil";
        ev.t = 0;
      } else {
        ev.phase = "done";
      }
    }
  } else if (ev.phase === "recoil") {
    for (const n of ev.neutrons) if (n.emitted) { n.x += n.vx * dt; n.y += n.vy * dt; }
    if (ev.t >= 0.95) {
      ev.phase = "detect";
      ev.t = 0;
      ev.chainIdx = -1;
      ev.nextAlphaT = 0.35;
      if (!ev.logged) {
        ev.logged = true;
        const info = elementInfo(ev.res.Z);
        state.detections.unshift({
          id: ++detSeq,
          Z: ev.res.Z, A: ev.res.A, sym: info.sym, name: info.name,
          x: ev.res.x, Ecm: state.Ecm, chain: ev.chain, forced: ev.forced, fromBeam: ev.fromBeam
        });
        if (state.detections.length > 8) state.detections.pop();
        renderDetectorLog();
      }
    }
  } else if (ev.phase === "detect") {
    for (const n of ev.neutrons) if (n.emitted) { n.x += n.vx * dt; n.y += n.vy * dt; }
    for (const a of ev.alphaParticles) { a.x += a.vx * dt; a.y += a.vy * dt; a.age += dt; }
    if (ev.chain && ev.t >= ev.nextAlphaT) {
      ev.chainIdx++;
      state.chainStep = ev.chainIdx;
      drawNuclideMap();
      highlightDetectorStep(ev.chainIdx);
      if (ev.chainIdx < ev.chain.length) {
        const st = ev.chain[ev.chainIdx];
        if (st.mode === "α") {
          const ang = -Math.PI * 0.55 + (ev.chainIdx % 3 - 1) * 0.55 + (Math.random() - 0.5) * 0.25;
          ev.alphaParticles.push({
            x: 0, y: 0, vx: Math.cos(ang) * 44, vy: Math.sin(ang) * 44,
            age: 0, label: `Eα ${st.Ealpha} MeV`, hlTxt: st.hlTxt
          });
        } else if (st.mode === "SF") {
          ev.sfTime = ev.t;
        }
        ev.nextAlphaT = ev.t + 0.72;
      } else {
        ev.phase = "done";
      }
    }
  }
}

// ---------- Dibujo de la Cámara de Colisiones ----------
function drawNucleusCluster(ctx, cx, cy, nucs, scale, glowCol, stretch = 1, rot = 0, alpha = 1) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  if (glowCol) {
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, Math.max(18, 9 * scale));
    g.addColorStop(0, glowCol);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, Math.max(18, 9 * scale), 0, Math.PI * 2); ctx.fill();
  }
  const rN = Math.max(2.1, Math.min(4.2, 0.92 * scale));
  for (let i = 0; i < nucs.length; i++) {
    const n = nucs[i];
    const nx = n.x * scale * stretch;
    const ny = n.y * scale / Math.sqrt(Math.max(0.5, stretch));
    ctx.fillStyle = n.isP ? "#f85149" : "#79c0ff";
    ctx.beginPath(); ctx.arc(nx, ny, rN, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.beginPath(); ctx.arc(nx - rN * 0.28, ny - rN * 0.28, rN * 0.35, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawChamber() {
  const { W, H } = fitCanvas(cvChamber, ctxC);
  if (!W || !H) return;
  ctxC.fillStyle = "#0a0e14";
  ctxC.fillRect(0, 0, W, H);

  // Coordenadas: origen (blanco) ligeramente a la izquierda del centro para dejar espacio al detector derecho
  const cx = W * 0.44, cy = H * 0.52;
  const fmScale = Math.min(W / 86, H / 44);
  const toX = fx => cx + fx * fmScale;
  const toY = fy => cy - fy * fmScale;

  // Rejilla sutil en fm
  ctxC.strokeStyle = "#161d27";
  ctxC.lineWidth = 1;
  const stepFm = 10;
  for (let gx = -40; gx <= 45; gx += stepFm) {
    const px = toX(gx);
    ctxC.beginPath(); ctxC.moveTo(px, 0); ctxC.lineTo(px, H); ctxC.stroke();
  }
  for (let gy = -20; gy <= 20; gy += stepFm) {
    const py = toY(gy);
    ctxC.beginPath(); ctxC.moveTo(0, py); ctxC.lineTo(W, py); ctxC.stroke();
  }

  // Línea del haz del ciclotrón (izquierda → blanco)
  ctxC.strokeStyle = "rgba(88,166,255,0.16)";
  ctxC.setLineDash([6, 5]);
  ctxC.beginPath(); ctxC.moveTo(0, cy); ctxC.lineTo(W - 64, cy); ctxC.stroke();
  ctxC.setLineDash([]);

  // Boquilla del acelerador a la izquierda
  ctxC.fillStyle = "#161b22";
  ctxC.strokeStyle = "#30363d";
  ctxC.fillRect(0, cy - 18, 22, 36);
  ctxC.strokeRect(0, cy - 18, 22, 36);
  ctxC.fillStyle = "#8b949e"; ctxC.font = "10px ui-monospace,monospace"; ctxC.textAlign = "left";
  ctxC.fillText("HAZ", 4, cy - 23);

  // Detector de silicio (DSSD) a la derecha
  const detX = W - 54;
  ctxC.fillStyle = "#121a24";
  ctxC.strokeStyle = state.ev && state.ev.phase === "detect" ? "#f0c000" : "#30363d";
  ctxC.lineWidth = state.ev && state.ev.phase === "detect" ? 2 : 1;
  ctxC.fillRect(detX, cy - 66, 36, 132);
  ctxC.strokeRect(detX, cy - 66, 36, 132);
  ctxC.strokeStyle = "#21262d"; ctxC.lineWidth = 1;
  for (let sy = cy - 54; sy <= cy + 54; sy += 12) {
    ctxC.beginPath(); ctxC.moveTo(detX + 3, sy); ctxC.lineTo(detX + 33, sy); ctxC.stroke();
  }
  ctxC.save();
  ctxC.translate(detX + 18, cy - 72);
  ctxC.fillStyle = "#8b949e"; ctxC.font = "10px ui-monospace,monospace"; ctxC.textAlign = "center";
  ctxC.fillText("DETECTOR Si", 0, 0);
  ctxC.restore();

  // Círculo de la barrera de Bass R_B alrededor del blanco
  const RbPx = state.cs.Rb * fmScale;
  ctxC.strokeStyle = "rgba(240,192,0,0.22)";
  ctxC.setLineDash([4, 4]);
  ctxC.beginPath(); ctxC.arc(cx, cy, RbPx, 0, Math.PI * 2); ctxC.stroke();
  ctxC.setLineDash([]);
  ctxC.fillStyle = "rgba(240,192,0,0.55)";
  ctxC.font = "10px ui-monospace,monospace"; ctxC.textAlign = "center";
  ctxC.fillText(`R_B = ${state.cs.Rb.toFixed(1)} fm`, cx, cy + RbPx + 13);

  // Vista previa de la trayectoria RK4
  if (state.previewTraj && (!state.ev || state.ev.phase === "done")) {
    const pts = state.previewTraj.points;
    ctxC.strokeStyle = state.previewTraj.captured ? "rgba(63,185,80,0.45)" : "rgba(248,81,73,0.4)";
    ctxC.lineWidth = 1.6;
    ctxC.setLineDash([4, 4]);
    ctxC.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const px = toX(pts[i].x), py = toY(pts[i].y);
      i === 0 ? ctxC.moveTo(px, py) : ctxC.lineTo(px, py);
    }
    ctxC.stroke();
    ctxC.setLineDash([]);
    // Dibuja el proyectil listo en el inicio del haz (evitando la boquilla HAZ en móvil)
    const projX = Math.max(62, toX(-30));
    drawNucleusCluster(ctxC, projX, toY(state.bFm), state.projNucs, fmScale * 0.72, "rgba(88,166,255,0.28)");
    drawNucleusCluster(ctxC, cx, cy, state.targNucs, fmScale * 0.72, "rgba(240,192,0,0.18)");
    // Etiquetas
    ctxC.fillStyle = "#79c0ff"; ctxC.font = "bold 11px system-ui,sans-serif"; ctxC.textAlign = "center";
    ctxC.fillText(`${state.beam.A}${state.beam.sym}`, projX, toY(state.bFm) - state.cs.Rb * fmScale * 0.35 - 12);
    ctxC.fillStyle = "#e6edf3";
    ctxC.fillText(`${state.target.A}${state.target.sym}`, cx, cy - RbPx * 0.62 - 8);
  }

  // Escala en fm (abajo izquierda)
  const barPx = 10 * fmScale;
  ctxC.strokeStyle = "#8b949e"; ctxC.lineWidth = 1.5;
  ctxC.beginPath(); ctxC.moveTo(14, H - 14); ctxC.lineTo(14 + barPx, H - 14); ctxC.stroke();
  ctxC.fillStyle = "#8b949e"; ctxC.font = "10px ui-monospace,monospace"; ctxC.textAlign = "left";
  ctxC.fillText("10 fm (10⁻¹⁴ m)", 14, H - 20);

  // Evento activo
  const ev = state.ev;
  if (!ev) return;

  const badge = (text, col) => {
    ctxC.save();
    ctxC.font = "bold 11.5px system-ui,sans-serif";
    const maxW = W - 24;
    let label = text;
    while (label.length > 20 && ctxC.measureText(label).width + 18 > maxW) label = label.slice(0, -4) + "…";
    const tw = Math.min(maxW, ctxC.measureText(label).width + 18);
    const infoH = $("chamberInfo").offsetHeight || 16;
    const bx = Math.max(12, W / 2 - tw / 2), by = Math.max(28, infoH + 12);
    ctxC.fillStyle = "#0d1117e6";
    ctxC.strokeStyle = col;
    ctxC.lineWidth = 1.5;
    ctxC.beginPath();
    roundRectPath(ctxC, bx, by, tw, 23, 11.5);
    ctxC.fill(); ctxC.stroke();
    ctxC.fillStyle = col; ctxC.textAlign = "center";
    ctxC.fillText(label, bx + tw / 2, by + 15.5);
    ctxC.restore();
  };

  if (ev.phase === "approach" || (ev.phase === "done" && ev.res.outcome === "rutherford")) {
    const pts = ev.traj.points;
    const idx = Math.min(pts.length - 1, Math.floor(ev.approachIdx));
    ctxC.strokeStyle = ev.res.outcome === "rutherford" ? "#f85149aa" : "#58a6ffaa";
    ctxC.lineWidth = 2;
    ctxC.beginPath();
    for (let i = 0; i <= idx; i++) {
      const px = toX(pts[i].x), py = toY(pts[i].y);
      i === 0 ? ctxC.moveTo(px, py) : ctxC.lineTo(px, py);
    }
    ctxC.stroke();
    const cur = pts[idx];
    drawNucleusCluster(ctxC, cx, cy, state.targNucs, fmScale * 0.72, "rgba(240,192,0,0.22)");
    drawNucleusCluster(ctxC, toX(cur.x), toY(cur.y), state.projNucs, fmScale * 0.72, "rgba(88,166,255,0.45)");
    const adjNote = ev.trajAdjusted ? " · trayectoria ilustrativa" : "";
    if (ev.res.outcome === "rutherford" && idx > pts.length * 0.55) {
      const deg = Math.abs(ev.traj.thetaScatter * 180 / Math.PI).toFixed(0);
      badge(`Dispersión de Rutherford (rebote, θ = ${deg}°${adjNote})`, "#f85149");
    } else {
      badge(`Aproximación · E_cm = ${state.Ecm.toFixed(1)} MeV · b = ${ev.b.toFixed(1)} fm${adjNote}`, "#58a6ff");
    }
    return;
  }

  if (ev.phase === "contact") {
    const t = ev.t;
    if (ev.res.outcome === "quasifission") {
      badge("Cuasifisión (QF): el sistema dinuclear se rompe antes de fusionarse", "#ffa657");
      // 0..0.55s: cuello girando; 0.55..1.55s: ruptura en dos fragmentos desiguales
      if (t < 0.58) {
        const rot = t * 1.9 * (ev.b >= 0 ? -1 : 1);
        const sep = 4.6 * fmScale;
        const x1 = cx - Math.cos(rot) * sep * 0.72, y1 = cy - Math.sin(rot) * sep * 0.72;
        const x2 = cx + Math.cos(rot) * sep * 0.28, y2 = cy + Math.sin(rot) * sep * 0.28;
        // Cuello dinuclear brillante
        ctxC.strokeStyle = "rgba(255,166,87,0.75)";
        ctxC.lineWidth = Math.max(8, 3.2 * fmScale);
        ctxC.lineCap = "round";
        ctxC.beginPath(); ctxC.moveTo(x1, y1); ctxC.lineTo(x2, y2); ctxC.stroke();
        drawNucleusCluster(ctxC, x1, y1, state.projNucs, fmScale * 0.74, "rgba(255,166,87,0.5)", 1.18, rot);
        drawNucleusCluster(ctxC, x2, y2, state.targNucs, fmScale * 0.74, "rgba(255,166,87,0.45)", 1.12, rot);
      } else {
        const dt2 = t - 0.58;
        const sep = (4.6 + dt2 * 26) * fmScale;
        const x1 = cx + Math.cos(ev.splitAng) * sep * 0.65, y1 = cy + Math.sin(ev.splitAng) * sep * 0.65;
        const x2 = cx - Math.cos(ev.splitAng) * sep * 0.35, y2 = cy - Math.sin(ev.splitAng) * sep * 0.35;
        drawNucleusCluster(ctxC, x1, y1, state.projNucs, fmScale * 0.76, "rgba(255,166,87,0.35)");
        drawNucleusCluster(ctxC, x2, y2, state.targNucs, fmScale * 0.70, "rgba(255,166,87,0.35)");
      }
      return;
    }

    if (ev.res.outcome === "fusion-fission") {
      badge(`Fusión-fisión (FF): E* = ${ev.res.cs.Estar.toFixed(1)} MeV lava la barrera de capa`, "#f85149");
      const allNucs = state.targNucs;
      if (t < 0.72) {
        // Núcleo compuesto caliente vibrando y estirándose en maní
        const stretch = 1 + 0.85 * Math.pow(t / 0.72, 2) + 0.08 * Math.sin(t * 28);
        drawNucleusCluster(ctxC, cx, cy, allNucs, fmScale * 0.84, "rgba(248,81,73,0.65)", stretch, ev.splitAng);
      } else {
        const dt2 = t - 0.72;
        const sep = (5.0 + dt2 * 25) * fmScale;
        const x1 = cx + Math.cos(ev.splitAng) * sep * 0.5, y1 = cy + Math.sin(ev.splitAng) * sep * 0.5;
        const x2 = cx - Math.cos(ev.splitAng) * sep * 0.5, y2 = cy - Math.sin(ev.splitAng) * sep * 0.5;
        const half1 = allNucs.slice(0, Math.floor(allNucs.length / 2));
        const half2 = allNucs.slice(Math.floor(allNucs.length / 2));
        drawNucleusCluster(ctxC, x1, y1, half1, fmScale * 0.74, "rgba(248,81,73,0.45)");
        drawNucleusCluster(ctxC, x2, y2, half2, fmScale * 0.74, "rgba(248,81,73,0.45)");
      }
      drawNeutrons(ctxC, cx, cy, ev.neutrons, fmScale);
      return;
    }

    // ¡Evaporación xn (Éxito)!
    const emittedCount = ev.neutrons.filter(n => n.emitted).length;
    const cnInfo = elementInfo(ev.res.Z);
    badge(`¡Núcleo compuesto ${ev.res.A + ev.res.x}${cnInfo.sym}* enfriándose: −${emittedCount}n de ${ev.res.x}n!`, "#3fb950");
    const cool = emittedCount / Math.max(1, ev.res.x);
    const vib = 1 + (1 - cool) * 0.14 * Math.sin(t * 26);
    const glow = cool > 0.7 ? "rgba(240,192,0,0.62)" : "rgba(63,185,80,0.55)";
    drawNucleusCluster(ctxC, cx, cy, state.targNucs, fmScale * 0.86, glow, vib, 0);
    drawNeutrons(ctxC, cx, cy, ev.neutrons, fmScale);
    return;
  }

  if (ev.phase === "recoil") {
    const info = elementInfo(ev.res.Z);
    badge(`¡Residuo de evaporación ${ev.res.A}${info.sym} (Z=${ev.res.Z}) hacia el detector de silicio!`, "#f0c000");
    const u = Math.min(1, ev.t / 0.95);
    const rx = cx + u * (detX + 14 - cx);
    // Estela dorada de retroceso
    ctxC.strokeStyle = "rgba(240,192,0,0.55)";
    ctxC.lineWidth = 2.5;
    ctxC.beginPath(); ctxC.moveTo(cx, cy); ctxC.lineTo(rx, cy); ctxC.stroke();
    drawNucleusCluster(ctxC, rx, cy, state.targNucs, fmScale * 0.78, "rgba(240,192,0,0.7)");
    drawNeutrons(ctxC, cx, cy, ev.neutrons, fmScale);
    return;
  }

  if (ev.phase === "detect" || (ev.phase === "done" && ev.res.outcome === "evaporation")) {
    const info = elementInfo(ev.res.Z);
    const impX = detX + 16, impY = cy;
    const step = ev.chain && ev.chain[Math.min(Math.max(0, ev.chainIdx), ev.chain.length - 1)];
    const curInfo = step ? elementInfo(step.Z) : info;
    if (step && step.mode === "SF" && ev.chainIdx >= ev.chain.length - 1) {
      badge(`Detector Si: ${ev.res.A}${info.sym} → cadena α confirmada → Fisión espontánea (${step.A}${curInfo.sym})`, "#f0c000");
      // Dos fragmentos de SF en el detector
      const sAge = Math.min(1.2, ev.t - (ev.sfTime || ev.t));
      const d = 10 + sAge * 26;
      ctxC.fillStyle = "#f85149";
      ctxC.beginPath(); ctxC.arc(impX - d * 0.5, impY - d * 0.7, 5, 0, Math.PI * 2); ctxC.fill();
      ctxC.beginPath(); ctxC.arc(impX - d * 0.5, impY + d * 0.7, 5, 0, Math.PI * 2); ctxC.fill();
    } else {
      badge(`¡IMPLANTE ${ev.res.A}${info.sym}! Cadena α en curso (${Math.max(0, ev.chainIdx + 1)}/${ev.chain ? ev.chain.length : 0})`, "#f0c000");
      drawNucleusCluster(ctxC, impX, impY, state.targNucs.slice(0, 32), fmScale * 0.52, "rgba(240,192,0,0.85)");
    }
    // Partículas α saliendo del detector
    for (const a of ev.alphaParticles) {
      const ax = impX - Math.abs(a.x) * 2.2;
      const ay = impY + a.y * 1.8;
      const fade = Math.max(0.15, 1 - a.age * 0.32);
      ctxC.strokeStyle = `rgba(240,192,0,${fade * 0.7})`;
      ctxC.lineWidth = 1.6;
      ctxC.beginPath(); ctxC.moveTo(impX, impY); ctxC.lineTo(ax, ay); ctxC.stroke();
      ctxC.fillStyle = `rgba(255,212,59,${fade})`;
      ctxC.beginPath(); ctxC.arc(ax, ay, 4.2, 0, Math.PI * 2); ctxC.fill();
      ctxC.fillStyle = `rgba(240,192,0,${fade})`;
      ctxC.font = "bold 10px ui-monospace,monospace"; ctxC.textAlign = "right";
      ctxC.fillText(a.label, ax - 7, ay + 3);
    }
    drawNeutrons(ctxC, cx, cy, ev.neutrons, fmScale);
  }
}

function drawNeutrons(ctx, cx, cy, neutrons, fmScale) {
  for (const n of neutrons) {
    if (!n.emitted) continue;
    const nx = cx + n.x * fmScale * 0.85;
    const ny = cy + n.y * fmScale * 0.85;
    ctx.strokeStyle = "rgba(121,192,255,0.45)"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(nx - n.vx * 0.45, ny - n.vy * 0.45); ctx.lineTo(nx, ny); ctx.stroke();
    ctx.fillStyle = "#79c0ff";
    ctx.beginPath(); ctx.arc(nx, ny, 3.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#a5d6ff"; ctx.font = "bold 10px ui-monospace,monospace"; ctx.textAlign = "center";
    ctx.fillText("n", nx, ny - 6);
  }
}

// ---------- Gráfica 1: Potencial efectivo V(r) ----------
function drawPotential() {
  const { W, H } = fitCanvas(cvPot, ctxP);
  if (!W || !H) return;
  ctxP.fillStyle = "#0d1117"; ctxP.fillRect(0, 0, W, H);
  const padL = 36, padR = 10, padT = 20, padB = 22;
  const pW = W - padL - padR, pH = H - padT - padB;
  const p = state.beam, t = state.target;
  const ell = impactToEll(state.bFm, state.Ecm, p, t);
  const bar0 = findBarrier(p, t, 0);
  const barL = findBarrier(p, t, ell);
  const rMin = Math.max(5, bar0.Rc - 2.2), rMax = bar0.Rc + 13;
  const vMax = Math.max(barL.Vb, state.Ecm) * 1.18;
  const vMin = Math.min(-15, bassPotential(bar0.Rc - 1.0, p, t, 0).Vtot * 1.15);

  const X = r => padL + ((r - rMin) / (rMax - rMin)) * pW;
  const Y = v => padT + (1 - (v - vMin) / (vMax - vMin)) * pH;

  // Línea cero
  ctxP.strokeStyle = "#21262d"; ctxP.lineWidth = 1;
  ctxP.beginPath(); ctxP.moveTo(padL, Y(0)); ctxP.lineTo(W - padR, Y(0)); ctxP.stroke();

  // Zona de túnel si E_cm < V_B(ℓ)
  if (state.Ecm < barL.Vb) {
    let rIn = null, rOut = null;
    for (let r = rMin; r <= rMax; r += 0.1) {
      const v = bassPotential(r, p, t, ell).Vtot;
      if (v >= state.Ecm) { if (rIn === null) rIn = r; rOut = r; }
    }
    if (rIn !== null && rOut !== null && rOut > rIn) {
      ctxP.fillStyle = "rgba(88,166,255,0.18)";
      ctxP.beginPath();
      ctxP.moveTo(X(rIn), Y(state.Ecm));
      for (let r = rIn; r <= rOut; r += 0.15) ctxP.lineTo(X(r), Y(bassPotential(r, p, t, ell).Vtot));
      ctxP.lineTo(X(rOut), Y(state.Ecm)); ctxP.closePath(); ctxP.fill();
    }
  }

  // V_Coul (rojo punteado) y V_Bass (cian punteado)
  const plotCurve = (fn, col, dash, lw) => {
    ctxP.save();
    if (dash) ctxP.setLineDash(dash);
    ctxP.strokeStyle = col; ctxP.lineWidth = lw;
    ctxP.beginPath();
    for (let i = 0; i <= 100; i++) {
      const r = rMin + (i / 100) * (rMax - rMin);
      const y = Math.max(padT, Math.min(H - padB, Y(fn(r))));
      i === 0 ? ctxP.moveTo(X(r), y) : ctxP.lineTo(X(r), y);
    }
    ctxP.stroke(); ctxP.restore();
  };
  plotCurve(r => bassPotential(r, p, t, 0).Vc, "#f8514977", [3, 3], 1.1);
  plotCurve(r => bassPotential(r, p, t, 0).Vn, "#58a6ff77", [3, 3], 1.1);
  if (ell > 2) plotCurve(r => bassPotential(r, p, t, 0).Vtot, "#f0c00055", [2, 2], 1.1);
  plotCurve(r => bassPotential(r, p, t, ell).Vtot, "#f0c000", null, 1.9);

  // Línea de energía del haz E_cm
  const yE = Math.max(padT, Math.min(H - padB, Y(state.Ecm)));
  ctxP.strokeStyle = "#3fb950"; ctxP.lineWidth = 1.4;
  ctxP.setLineDash([5, 3]);
  ctxP.beginPath(); ctxP.moveTo(padL, yE); ctxP.lineTo(W - padR, yE); ctxP.stroke();
  ctxP.setLineDash([]);

  // Punto de la barrera V_B(ℓ)
  ctxP.fillStyle = "#f0c000";
  ctxP.beginPath(); ctxP.arc(X(barL.Rb), Y(barL.Vb), 3.2, 0, Math.PI * 2); ctxP.fill();

  // Ejes y etiquetas
  ctxP.strokeStyle = "#30363d";
  ctxP.beginPath(); ctxP.moveTo(padL, padT); ctxP.lineTo(padL, H - padB); ctxP.lineTo(W - padR, H - padB); ctxP.stroke();
  ctxP.fillStyle = "#8b949e"; ctxP.font = "9px ui-monospace,monospace";
  ctxP.textAlign = "right";
  ctxP.fillText(Math.round(barL.Vb) + "", padL - 4, Y(barL.Vb) + 3);
  ctxP.fillText("0", padL - 4, Y(0) + 3);
  ctxP.textAlign = "center";
  ctxP.fillText("r (fm)", padL + pW / 2, H - 5);
  ctxP.textAlign = "left";
  ctxP.fillStyle = "#e6edf3"; ctxP.font = "bold 10px system-ui,sans-serif";
  const vbLab = ell >= 1 ? `V_B(ℓ=${Math.round(ell)})` : "V_B";
  ctxP.fillText(`Potencial V(r) · ${vbLab} = ${barL.Vb.toFixed(1)} MeV`, padL + 2, 13);
  ctxP.textAlign = "right"; ctxP.fillStyle = "#3fb950";
  ctxP.fillText(`E_cm=${state.Ecm.toFixed(0)}`, W - padR, 13);
}

// ---------- Gráfica 2: Función de excitación σ_xn(E_cm) [clic para sintonizar] ----------
const CH_COLS = ["#58a6ff", "#3fb950", "#f0c000", "#ffa657", "#b197fc"];
function drawExcitation() {
  const { W, H } = fitCanvas(cvExc, ctxE);
  if (!W || !H) return;
  ctxE.fillStyle = "#0d1117"; ctxE.fillRect(0, 0, W, H);
  const padL = 40, padR = 10, padT = 22, padB = 22;
  const pW = W - padL - padR, pH = H - padT - padB;
  const { eMin, eMax, pts, peakSig } = state.curve;

  const logMax = Math.ceil(Math.log10(Math.max(peakSig * 4, 1e-2)));
  const logMin = logMax - 5;
  const X = E => padL + ((E - eMin) / (eMax - eMin)) * pW;
  const Y = v => {
    const lv = Math.log10(Math.max(v, Math.pow(10, logMin - 1)));
    return padT + (1 - Math.max(0, Math.min(1, (lv - logMin) / (logMax - logMin)))) * pH;
  };

  // Rejilla log horizontal (siempre en pb para coherencia con el título)
  ctxE.strokeStyle = "#1a2029"; ctxE.lineWidth = 1;
  ctxE.fillStyle = "#6e7681"; ctxE.font = "8.5px ui-monospace,monospace"; ctxE.textAlign = "right";
  for (let d = logMin; d <= logMax; d++) {
    const y = padT + (1 - (d - logMin) / (logMax - logMin)) * pH;
    ctxE.beginPath(); ctxE.moveTo(padL, y); ctxE.lineTo(W - padR, y); ctxE.stroke();
    const lab = d === 0 ? "1" : `10^${d}`;
    ctxE.fillText(lab, padL - 3, y + 3);
  }

  // Curvas 1n..5n
  for (let ch = 0; ch < 5; ch++) {
    let any = false;
    ctxE.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const v = pts[i].sig[ch];
      const x = X(pts[i].Ecm), y = Y(v);
      if (v > Math.pow(10, logMin)) any = true;
      i === 0 ? ctxE.moveTo(x, y) : ctxE.lineTo(x, y);
    }
    if (!any) continue;
    ctxE.strokeStyle = CH_COLS[ch]; ctxE.lineWidth = 1.65; ctxE.stroke();
  }

  // Cursor vertical de energía actual E_cm
  const cx = X(state.Ecm);
  ctxE.strokeStyle = "#ffffffaa"; ctxE.lineWidth = 1.3;
  ctxE.setLineDash([3, 3]);
  ctxE.beginPath(); ctxE.moveTo(cx, padT); ctxE.lineTo(cx, H - padB); ctxE.stroke();
  ctxE.setLineDash([]);

  // Puntos de átomos sintetizados por el usuario
  for (const h of state.stats.erHits) {
    const hx = X(h.E);
    const r = crossSections(state.beam, state.target, h.E);
    const hy = Y(r.sig[h.x - 1] || r.tot);
    ctxE.fillStyle = "#f0c000";
    ctxE.beginPath(); ctxE.arc(hx, hy, 4, 0, Math.PI * 2); ctxE.fill();
    ctxE.strokeStyle = "#0d1117"; ctxE.lineWidth = 1; ctxE.stroke();
  }

  // Ejes y leyenda de canales
  ctxE.strokeStyle = "#30363d"; ctxE.lineWidth = 1;
  ctxE.beginPath(); ctxE.moveTo(padL, padT); ctxE.lineTo(padL, H - padB); ctxE.lineTo(W - padR, H - padB); ctxE.stroke();
  ctxE.fillStyle = "#8b949e"; ctxE.font = "9px ui-monospace,monospace"; ctxE.textAlign = "center";
  ctxE.fillText(`${eMin}`, padL, H - 6);
  ctxE.fillText("E_cm (MeV) · clic para sintonizar", padL + pW / 2, H - 6);
  ctxE.fillText(`${eMax}`, W - padR - 8, H - 6);
  ctxE.textAlign = "left";
  ctxE.fillStyle = "#e6edf3"; ctxE.font = "bold 10px system-ui,sans-serif";
  ctxE.fillText("σ_xn(E) [pb]", padL + 2, 13);
  let lx = W - padR;
  ctxE.textAlign = "right"; ctxE.font = "bold 9px ui-monospace,monospace";
  for (let ch = 4; ch >= 0; ch--) {
    ctxE.fillStyle = CH_COLS[ch];
    ctxE.fillText(`${ch + 1}n`, lx, 13);
    lx -= 20;
  }
}

// ---------- Gráfica 3: Carta (N, Z) de la Isla de Estabilidad ----------
function drawNuclideMap() {
  const { W, H } = fitCanvas(cvMap, ctxM);
  if (!W || !H) return;
  ctxM.fillStyle = "#0d1117"; ctxM.fillRect(0, 0, W, H);
  const padL = 30, padR = 8, padT = 20, padB = 20;
  const pW = W - padL - padR, pH = H - padT - padB;

  const Zcn = state.beam.Z + state.target.Z;
  const Ncn = state.beam.A + state.target.A - Zcn;
  // Ventana adaptativa centrada en la Isla de Estabilidad (o ampliada si es modo libre ligero)
  const zMin = Math.min(102, Zcn - 12), zMax = Math.max(122, Zcn + 3);
  const nMin = Math.min(152, Ncn - 18), nMax = Math.max(188, Ncn + 6);

  const X = n => padL + ((n - nMin) / (nMax - nMin)) * pW;
  const Y = z => padT + (1 - (z - zMin) / (zMax - zMin)) * pH;
  const cw = Math.max(2, pW / (nMax - nMin));
  const ch = Math.max(2, pH / (zMax - zMin));

  // Mapa de calor de estabilización de capa −E_shell(Z, N) (Isla de Estabilidad)
  for (let z = zMin; z <= zMax; z++) {
    for (let n = nMin; n <= nMax; n++) {
      const sh = Math.max(0, -shellCorr(z, n));
      if (sh < 1.2) continue;
      const t = Math.min(1, (sh - 1.2) / 7.8);
      ctxM.fillStyle = `rgba(${Math.round(30 + 60 * t)},${Math.round(130 + 95 * t)},${Math.round(190 + 65 * t)},${(0.08 + 0.48 * t * t).toFixed(2)})`;
      ctxM.fillRect(X(n) - cw / 2, Y(z) - ch / 2, cw + 0.6, ch + 0.6);
    }
  }

  // Líneas mágicas predichas Z=114, Z=120 y N=184
  ctxM.strokeStyle = "rgba(88,166,255,0.35)"; ctxM.lineWidth = 1; ctxM.setLineDash([3, 3]);
  for (const zm of [114, 120]) {
    if (zm >= zMin && zm <= zMax) {
      ctxM.beginPath(); ctxM.moveTo(padL, Y(zm)); ctxM.lineTo(W - padR, Y(zm)); ctxM.stroke();
    }
  }
  if (184 >= nMin && 184 <= nMax) {
    ctxM.beginPath(); ctxM.moveTo(X(184), padT); ctxM.lineTo(X(184), H - padB); ctxM.stroke();
  }
  ctxM.setLineDash([]);

  // Isótopos superpesados conocidos (cuadritos sutiles)
  ctxM.fillStyle = "rgba(230,237,243,0.22)";
  for (const [z, aMin, aMax] of KNOWN_SH_ISOTOPES) {
    if (z < zMin || z > zMax) continue;
    for (let a = aMin; a <= aMax; a++) {
      const n = a - z;
      if (n < nMin || n > nMax) continue;
      ctxM.fillRect(X(n) - cw * 0.36, Y(z) - ch * 0.36, cw * 0.72, ch * 0.72);
    }
  }

  // Etiqueta "Isla de Estabilidad" cerca de (184, 114)
  if (184 >= nMin && 184 <= nMax && 114 >= zMin && 114 <= zMax) {
    ctxM.fillStyle = "rgba(165,243,252,0.75)";
    ctxM.font = "italic 8.5px system-ui,sans-serif"; ctxM.textAlign = "right";
    ctxM.fillText("Isla (N=184)", X(184) - 3, Y(114) - 4);
  }

  // Trayectoria del residuo de evaporación y su cadena α
  const xDom = state.activeChain ? state.activeChain.x : state.cs.dominantX;
  const Ner = Ncn - xDom;
  // CN* → ER (flecha horizontal izquierda de evaporación -xn)
  ctxM.strokeStyle = "#79c0ff"; ctxM.lineWidth = 1.6;
  ctxM.beginPath(); ctxM.moveTo(X(Ncn), Y(Zcn)); ctxM.lineTo(X(Ner), Y(Zcn)); ctxM.stroke();
  ctxM.fillStyle = "#58a6ff";
  ctxM.beginPath(); ctxM.arc(X(Ncn), Y(Zcn), 3, 0, Math.PI * 2); ctxM.fill();

  // Cadena α diagonal (−2Z, −2N)
  const chain = state.activeChain ? state.activeChain.chain : buildDecayChain(Zcn, Zcn + Ner);
  ctxM.strokeStyle = "#f0c000aa"; ctxM.lineWidth = 1.6;
  ctxM.beginPath();
  chain.forEach((st, i) => {
    const sx = X(st.A - st.Z), sy = Y(st.Z);
    i === 0 ? ctxM.moveTo(sx, sy) : ctxM.lineTo(sx, sy);
  });
  ctxM.stroke();

  chain.forEach((st, i) => {
    const sx = X(st.A - st.Z), sy = Y(st.Z);
    const active = state.activeChain && i <= state.chainStep;
    ctxM.fillStyle = st.mode === "SF" ? "#f85149" : (active ? "#f0c000" : "#ffd43b88");
    ctxM.beginPath(); ctxM.arc(sx, sy, active ? 3.8 : 2.5, 0, Math.PI * 2); ctxM.fill();
  });

  // Punto principal del ER sintetizado
  ctxM.fillStyle = "#f0c000";
  ctxM.beginPath(); ctxM.arc(X(Ner), Y(Zcn), 4.2, 0, Math.PI * 2); ctxM.fill();
  ctxM.strokeStyle = "#0d1117"; ctxM.lineWidth = 1; ctxM.stroke();

  // Ejes y título
  ctxM.strokeStyle = "#30363d";
  ctxM.beginPath(); ctxM.moveTo(padL, padT); ctxM.lineTo(padL, H - padB); ctxM.lineTo(W - padR, H - padB); ctxM.stroke();
  ctxM.fillStyle = "#8b949e"; ctxM.font = "9px ui-monospace,monospace";
  ctxM.textAlign = "right";
  ctxM.fillText("114", padL - 3, Y(114) + 3);
  ctxM.fillText("120", padL - 3, Y(120) + 3);
  ctxM.textAlign = "center";
  ctxM.fillText("Neutrones N", padL + pW / 2, H - 5);
  ctxM.textAlign = "left";
  ctxM.fillStyle = "#e6edf3"; ctxM.font = "bold 10px system-ui,sans-serif";
  ctxM.fillText("Mapa (N, Z) · Isla de Estabilidad", padL + 2, 13);
}

// ---------- Actualización del Panel Lateral ----------
function updateSidePanel() {
  const p = state.beam, t = state.target, cs = state.cs;
  const Zcn = p.Z + t.Z, Acn = p.A + t.A;
  const cn = elementInfo(Zcn);
  const erA = Acn - cs.dominantX;
  const preset = PRESETS.find(pr => pr.id === state.presetId);

  $("rxnEq").innerHTML = `<sup>${p.A}</sup>${p.sym} + <sup>${t.A}</sup>${t.sym} → <sup>${Acn}</sup>${cn.sym}* → <b><sup>${erA}</sup>${cn.sym}</b> + ${cs.dominantX}n`;
  $("rxnSub").textContent = preset
    ? `${cn.name} (Z=${Zcn}) · ${preset.tag} · ${preset.lab} (${preset.year}) · exp: ${preset.expSigma}`
    : `${cn.name} (Z=${Zcn}) · Modo laboratorio libre (cálculo continuo Bass + gota líquida/capas)`;
  $("rxnDesc").textContent = preset ? preset.desc : `${p.name} (${p.note}) sobre ${t.name} (${t.note}).`;

  $("ecmVal").textContent = `${state.Ecm.toFixed(1)} MeV`;
  const ellNow = Math.round(impactToEll(state.bFm, state.Ecm, p, t));
  $("bVal").textContent = state.randB ? "aleatorio (barras a ℓ=0)" : `${state.bFm.toFixed(1)} fm (ℓ≈${ellNow}ħ)`;
  $("f3Head").textContent = state.randB
    ? "Las tres barreras (ℓ = 0): σ_ER = σ_cap · P_CN · W_sur"
    : `Las tres barreras (b = ${state.bFm.toFixed(1)} fm, ℓ ≈ ${ellNow}ħ)`;

  $("kvElab").textContent = `${cs.Elab.toFixed(1)} MeV`;
  $("kvVb").textContent = `${cs.Vb.toFixed(1)} MeV (R_B = ${cs.Rb.toFixed(1)} fm, ℓ=0)`;
  $("kvQ").textContent = `${cs.Q.toFixed(1)} MeV`;
  $("kvEstar").textContent = `${cs.Estar.toFixed(1)} MeV`;
  $("kvBf").textContent = `${cs.BfDamped0.toFixed(1)} MeV a E* (${(cs.BfLD0 + cs.BfShell0).toFixed(1)} a E*=0)`;
  $("kvSig").textContent = `${fmtSigma(cs.tot)} (canal ${cs.dominantX}n)`;
  $("kvTime").textContent = fmtCyclotronRate(cs.tot, t.A);

  // Barras logarítmicas de los 3 factores (escala log₁₀ de 10⁻⁸ a 1) para el ℓ activo
  const setBar = (idBar, idVal, prob) => {
    const pct = prob <= 1e-10 ? 0 : Math.max(3, Math.min(100, ((Math.log10(prob) + 8) / 8) * 100));
    $(idBar).style.width = pct.toFixed(1) + "%";
    $(idVal).textContent = prob >= 0.01 ? (prob * 100).toFixed(1) + "%" : (prob > 0 ? prob.toExponential(1) : "0");
  };
  setBar("barCap", "valCap", cs.TcapL);
  setBar("barPcn", "valPcn", cs.PcnL);
  setBar("barSur", "valSur", cs.WsurL);
}

function updateStatsUI() {
  const s = state.stats;
  $("stRuth").textContent = s.ruth;
  $("stQF").textContent = s.qf;
  $("stFF").textContent = s.ff;
  $("stER").textContent = s.erDemo > 0 ? `${s.er} (+${s.erDemo})` : String(s.er);
  $("chamberInfo").textContent =
    `E_cm = ${state.Ecm.toFixed(1)} MeV · E* = ${state.cs.Estar.toFixed(1)} MeV · σ = ${fmtSigma(state.cs.tot)} · haz: ${s.er}${s.erDemo ? ` (+${s.erDemo} demo)` : ""}`;
}

function renderDetectorLog() {
  const el = $("detLog");
  el.textContent = "";
  if (!state.detections.length) {
    const note = document.createElement("div");
    note.className = "note";
    note.textContent = "Sin detecciones todavía. Sintoniza E_cm al pico de σ(E) y dispara el haz, o pulsa ✨ Forzar evento ER para inspeccionar la cadena α.";
    el.appendChild(note);
    return;
  }
  state.detections.forEach((d, idx) => {
    const item = document.createElement("div");
    item.className = "det-item";

    const head = document.createElement("div");
    head.className = "det-head";
    const b = document.createElement("b");
    b.append(`#${d.id} · `);
    const sup = document.createElement("sup");
    sup.textContent = String(d.A);
    b.append(sup, d.sym);
    const meta = document.createElement("span");
    const isApprox = d.chain.some(st => st.approx);
    const srcTag = d.forced ? " · demo forzado" : d.fromBeam ? " · haz acelerado" : "";
    meta.textContent = ` (${d.x}n a ${d.Ecm.toFixed(1)} MeV${srcTag}${isApprox ? " · ≈ modelo" : ""})`;
    head.append(b, meta);

    const chainEl = document.createElement("div");
    chainEl.className = "det-chain";
    d.chain.forEach((st, si) => {
      if (si > 0) chainEl.append(" → ");
      const info = elementInfo(st.Z);
      const sp = document.createElement("span");
      sp.className = st.mode === "SF" ? "cstep sf" : "cstep";
      if (idx === 0) sp.dataset.step = String(si);
      const sSup = document.createElement("sup");
      sSup.textContent = String(st.A);
      sp.append(sSup, info.sym);
      if (st.mode === "SF") {
        sp.append(` → SF (${st.hlTxt})`);
      } else if (st.mode === "larga") {
        sp.append(` (${st.hlTxt})`);
      } else {
        const it = document.createElement("i");
        it.textContent = ` Eα ${st.Ealpha} MeV · T½ ${st.hlTxt}`;
        sp.append(it);
      }
      if (st.truncated) sp.append(" …");
      chainEl.append(sp);
    });

    item.append(head, chainEl);
    el.append(item);
  });
}

function highlightDetectorStep(stepIdx) {
  document.querySelectorAll("#detLog .cstep").forEach(el => {
    el.classList.toggle("lit", Number(el.dataset.step) <= stepIdx);
  });
}

function updateBeamButton() {
  const b = $("btnBeam");
  b.classList.toggle("on", state.beamOn);
  b.setAttribute("aria-pressed", String(state.beamOn));
  b.textContent = state.beamOn ? "⏹ Detener haz" : "☢ Haz continuo";
}

// ---------- Construcción inicial de pestañas y controles ----------
function buildUI() {
  const tabs = $("tabs");
  PRESETS.forEach(pr => {
    const btn = document.createElement("button");
    btn.className = "tab";
    btn.dataset.id = pr.id;
    btn.innerHTML = `<b>${pr.id === "Ubn" ? "120" : pr.id}</b><small>Z=${pr.Z}</small>`;
    btn.onclick = () => selectReaction(pr.beam, pr.target, pr.id);
    tabs.appendChild(btn);
  });
  const freeBtn = document.createElement("button");
  freeBtn.className = "tab";
  freeBtn.dataset.id = "free";
  freeBtn.innerHTML = `<b>⚗ Libre</b><small>haz + blanco</small>`;
  freeBtn.onclick = () => selectReaction($("selBeam").value, $("selTarget").value, "free");
  tabs.appendChild(freeBtn);

  // Rellena selects del modo libre
  BEAMS.forEach(b => {
    const o = document.createElement("option");
    o.value = b.id; o.textContent = `${b.A}${b.sym} (Z=${b.Z}) — ${b.name}`;
    $("selBeam").appendChild(o);
  });
  TARGETS.forEach(t => {
    const o = document.createElement("option");
    o.value = t.id; o.textContent = `${t.A}${t.sym} (Z=${t.Z}) — ${t.name}`;
    $("selTarget").appendChild(o);
  });

  $("selBeam").onchange = () => selectReaction($("selBeam").value, $("selTarget").value, "free");
  $("selTarget").onchange = () => selectReaction($("selBeam").value, $("selTarget").value, "free");

  $("ecmSlider").oninput = e => {
    state.Ecm = parseFloat(e.target.value);
    recomputeEnergy();
  };
  $("bSlider").oninput = e => {
    state.bFm = parseFloat(e.target.value);
    state.randB = false;
    $("chkRandB").checked = false;
    recomputeEnergy();
  };
  $("chkRandB").onchange = e => {
    state.randB = e.target.checked;
    recomputeEnergy();
  };
  $("btnTune").onclick = () => {
    state.Ecm = Math.round(state.curve.peakE * 2) / 2;
    $("ecmSlider").value = state.Ecm;
    recomputeEnergy();
  };
  $("btnFire").onclick = () => { state.beamOn = false; updateBeamButton(); launchEvent(null, "manual"); };
  $("btnForceER").onclick = () => { state.beamOn = false; updateBeamButton(); launchEvent("evaporation", "demo"); };
  $("btnBeam").onclick = () => {
    if (!state.beamOn) setPaused(false);
    state.beamOn = !state.beamOn;
    updateBeamButton();
    chamberDirty = true;
  };
  $("btnPause").onclick = () => setPaused(!state.paused);
  $("btnReset").onclick = () => selectReaction(state.beam.id, state.target.id, state.presetId, state.Ecm);

  document.querySelectorAll(".spd").forEach(b => {
    const isInit = parseFloat(b.dataset.s) === state.speed;
    b.classList.toggle("on", isInit);
    b.setAttribute("aria-pressed", String(isInit));
    b.onclick = () => {
      document.querySelectorAll(".spd").forEach(x => { x.classList.remove("on"); x.setAttribute("aria-pressed", "false"); });
      b.classList.add("on");
      b.setAttribute("aria-pressed", "true");
      state.speed = parseFloat(b.dataset.s);
    };
  });

  // Clic/arrastre y teclado sobre la función de excitación para sintonizar E_cm
  let draggingExc = false;
  const tuneFromExc = ev => {
    const rect = cvExc.getBoundingClientRect();
    const padL = 40, padR = 10;
    const u = Math.max(0, Math.min(1, (ev.clientX - rect.left - padL) / (rect.width - padL - padR)));
    const E = state.curve.eMin + u * (state.curve.eMax - state.curve.eMin);
    state.Ecm = Math.round(E * 2) / 2;
    $("ecmSlider").value = state.Ecm;
    recomputeEnergy();
  };
  cvExc.addEventListener("pointerdown", e => { draggingExc = true; cvExc.setPointerCapture(e.pointerId); tuneFromExc(e); });
  cvExc.addEventListener("pointermove", e => { if (draggingExc) tuneFromExc(e); });
  cvExc.addEventListener("pointerup", () => { draggingExc = false; });
  cvExc.addEventListener("pointercancel", () => { draggingExc = false; });
  cvExc.addEventListener("keydown", e => {
    const step = e.shiftKey ? 2.0 : 0.5;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      state.Ecm = Math.min(state.curve.eMax, Math.round((state.Ecm + step) * 2) / 2);
      $("ecmSlider").value = state.Ecm; recomputeEnergy();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      state.Ecm = Math.max(state.curve.eMin, Math.round((state.Ecm - step) * 2) / 2);
      $("ecmSlider").value = state.Ecm; recomputeEnergy();
    }
  });

  window.addEventListener("resize", () => { chamberDirty = true; drawChamber(); drawPotential(); drawExcitation(); drawNuclideMap(); });
  window.addEventListener("hashchange", initFromHash);
}

function initFromHash() {
  const h = (location.hash || "").replace(/^#/, "");
  const pr = PRESETS.find(p => p.id.toLowerCase() === h.toLowerCase() || String(p.Z) === h);
  if (pr) selectReaction(pr.beam, pr.target, pr.id);
  else if (!state.curve) selectReaction("Ca48", "Cf249", "Og");
}

// ---------- Bucle de animación (sin consumo en reposo) ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * state.speed;
  last = now;
  const active = !state.paused && (state.beamOn || (state.ev && state.ev.phase !== "done"));
  if (active) stepSim(dt);
  if (chamberDirty || active) {
    drawChamber();
    chamberDirty = false;
  }
  requestAnimationFrame(loop);
}

buildUI();
initFromHash();
requestAnimationFrame(loop);
})();

// ==================== EXPORTS PARA PRUEBAS EN NODE ====================
if (typeof module !== "undefined") {
  module.exports = {
    BEAMS, TARGETS, PRESETS, KNOWN_CHAINS,
    elementInfo, shellCorr, massExcess, fissionBarrierLD,
    reactionQ, labEnergy, buildDecayChain,
    bassPotential, findBarrier, calcPCN, jacksonPxn,
    crossSections, excitationCurve, impactToEll,
    integrateTrajectory, classifyCollision, fmtSigma
  };
}
})();
