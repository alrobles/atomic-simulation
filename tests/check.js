// Pruebas de la física y de los datos, sin navegador ni dependencias: npm test
// (o directamente: node tests/check.js)
//
// Cubre los cuatro módulos que exportan funciones puras para Node:
//   js/physics.js  (orbitales, configuraciones, Slater, muestreo)
//   js/specdata.js (660 líneas NIST de los gases nobles)
//   js/espectro.js (color espectral, niveles, cascada)
//   js/fusion.js   (cadena pp y contabilidad de energía)

const A = require("../js/physics.js");
const S = require("../js/specdata.js");
const E = require("../js/espectro.js");
const F = require("../js/fusion.js");
const W = require("../js/agua.js");
const MW = require("../js/estados-agua.js");

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? "✓ " : "✗ ") + msg); if (!cond) fail++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const rel = (a, b) => Math.abs(a - b) / Math.abs(b || 1);

// Punto medio; los integrandos son suaves y positivos en el rango integrado.
function integ(f, rmax, N) {
  N = N || 20000;
  const dr = rmax / N;
  let acc = 0;
  for (let i = 0; i < N; i++) acc += f((i + 0.5) * dr) * dr;
  return acc;
}

console.log("\n── 1. Configuraciones y tamaños de periodo ──");

// Los totales de cada configuración coinciden con Z de los gases nobles
A.NOBLES.forEach((g, k) => {
  const tot = A.nobleConfig(k).reduce((a, s) => a + s.cap, 0);
  ok(tot === g.Z, `${g.sym}: suma de electrones = ${tot} (esperado ${g.Z})`);
});

// Tamaños de los periodos = 2·n²
const sizes = A.PERIODS.map((row) => row.reduce((a, lab) => a + A.subshell(lab).cap, 0));
ok(JSON.stringify(sizes) === "[2,8,8,18,18,32,32]", `periodos: ${sizes.join(", ")}`);

// Regla de Madelung: n + l no decrece a lo largo de la secuencia de llenado
{
  const seq = A.nobleConfig(6).map((s) => s.n + s.l);
  let mon = true;
  for (let i = 1; i < seq.length; i++) if (seq[i] < seq[i - 1]) mon = false;
  ok(mon, `orden de llenado no decreciente en n+l: ${seq.join(" ")}`);
}

console.log("\n── 2. Reglas de Slater (valores de libro de texto) ──");

const zNe2p = A.zeff(10, A.nobleConfig(1), A.subshell("2p"));
ok(near(zNe2p, 5.85, 1e-9), `Z_ef(Ne 2p) = ${zNe2p.toFixed(2)} (5.85)`);
const zAr3p = A.zeff(18, A.nobleConfig(2), A.subshell("3p"));
ok(near(zAr3p, 6.75, 1e-9), `Z_ef(Ar 3p) = ${zAr3p.toFixed(2)} (6.75)`);
const zKr3d = A.zeff(36, A.nobleConfig(3), A.subshell("3d"));
ok(near(zKr3d, 14.85, 1e-9), `Z_ef(Kr 3d) = ${zKr3d.toFixed(2)} (14.85)`);
{
  // para la misma subcapa, Z_ef crece con Z (apantallamiento incompleto)
  const z3p = [2, 3, 4].map((k) => A.zeff(A.NOBLES[k].Z, A.nobleConfig(k), A.subshell("3p")));
  ok(z3p[0] < z3p[1] && z3p[1] < z3p[2], `Z_ef(3p) crece con Z: ${z3p.map((v) => v.toFixed(2)).join(" < ")}`);
  // dentro del mismo átomo, Z_ef baja al subir n para el mismo l
  const xe = A.nobleConfig(4), zXe = [3, 4, 5].map((n) => A.zeff(54, xe, A.subshell(n + "p")));
  ok(zXe[0] > zXe[1] && zXe[1] > zXe[2], `en Xe, Z_ef(3p) > Z_ef(4p) > Z_ef(5p): ${zXe.map((v) => v.toFixed(2)).join(" > ")}`);
}

console.log("\n── 3. Radial hidrogenoidea: <r> = (3n² − l(l+1))/2 ──");

[[1, 0], [2, 1], [3, 2], [4, 3]].forEach(([n, l]) => {
  const rad = A.radial(n, l);
  let m = 0;
  for (let k = 0; k < rad.rs.length; k++) m += rad.rs[k] * (rad.cdf[k] - (k ? rad.cdf[k - 1] : 0));
  const exp = (3 * n * n - l * (l + 1)) / 2;
  ok(rel(m, exp) < 0.01, `<r>(${n}${A.LCH[l]}) = ${m.toFixed(2)} (${exp})`);
});
{
  const rad = A.radial(3, 2);
  ok(near(rad.cdf[rad.cdf.length - 1], 1, 1e-6), `CDF(3d) termina en ${rad.cdf[rad.cdf.length - 1].toFixed(6)}`);
  ok(rad.r99 > 0 && rad.r99 < rad.rs[rad.rs.length - 1], `r99(3d) = ${rad.r99.toFixed(2)} a₀ queda dentro de la tabla`);
}

console.log("\n── 4. Generación de nubes de puntos ──");

// NOTA: genAtom/atomShells esperan un número atómico Z (la firma pasó de "índice de gas
// noble" a Z al añadirse el soporte de los 118 elementos); de ahí A.NOBLES[k].Z.
const g = A.genAtom(A.NOBLES[6].Z, { points: 40000 });
ok(g.reduce((a, x) => a + x.c, 0) > 30000, "genAtom(Og) genera puntos");
ok(g.every((x) => x.c <= x.x.length), "genAtom nunca escribe fuera de los búferes");
// el carozo (atenuado) se dibuja primero: los grupos van de menor a mayor alfa
for (const k of [3, 6]) {
  const gg = A.genAtom(A.NOBLES[k].Z, { points: 40000, highlightNew: true });
  let ord = true;
  for (let i = 1; i < gg.length; i++) if (gg[i].alpha < gg[i - 1].alpha) ord = false;
  ok(ord, `genAtom(${A.NOBLES[k].sym}): carozo antes que lo nuevo`);
}
{
  // 1s no tiene nodo radial: una sola fase. 2s sí (una cáscara vacía en r = 2 a₀): dos.
  const s = A.genOrbital(1, 0, 0, 2000);
  ok(s[0].c === 2000 && s[1].c === 0, `genOrbital(1s): todos los puntos en fase + (${s[0].c}/${s[1].c})`);
  const s2 = A.genOrbital(2, 0, 0, 2000);
  // el lóbulo interior del 2s (r < 2 a₀) guarda el 5.27 % de la probabilidad
  const frac2s = s2[0].c / (s2[0].c + s2[1].c);
  ok(rel(frac2s, 0.0527) < 0.3, `genOrbital(2s): el nodo radial deja ${(100 * frac2s).toFixed(1)} % dentro (analítico 5.3 %)`);
  const p = A.genOrbital(2, 1, 2, 4000);
  ok(p[0].c > 400 && p[1].c > 400, `genOrbital(2p_z): las dos fases presentes (${p[0].c}/${p[1].c})`);
  ok(p.reduce((a, x) => a + x.c, 0) === 4000, "genOrbital respeta el número de puntos");
}
{
  // la escala "real" comprime las capas internas por Z_ef (Slater), no por n
  const gmax = (gr) => {
    let m = 0;
    for (let i = 0; i < gr.c; i++) m = Math.max(m, Math.hypot(gr.x[i], gr.y[i], gr.z[i]));
    return m;
  };
  const real = A.genAtom(A.NOBLES[6].Z, { points: 20000, scale: "real" });
  const did = A.genAtom(A.NOBLES[6].Z, { points: 20000, scale: "didactic" });
  const rReal = gmax(real[0]) / gmax(real[real.length - 1]);   // 1s frente a 7p (grupos en orden de configuración)
  const rDid = gmax(did[0]) / gmax(did[did.length - 1]);
  ok(rReal < 0.05, `escala real: el 1s ocupa ${(100 * rReal).toFixed(1)} % del radio externo (Slater)`);
  ok(rDid > 0.1, `escala didáctica: el 1s ocupa ${(100 * rDid).toFixed(1)} % (un anillo por capa n)`);
}

console.log("\n── 5. P(r) y ψ de las subcapas ocupadas ──");

// P(r) = 4πr²ρ integra exactamente los electrones de la subcapa
for (const k of [1, 3, 6]) {
  const sh = A.atomShells(A.NOBLES[k].Z);
  const ints = sh.map((s) => integ(s.P, s.rmax * 1.5));
  const worst = Math.max(...ints.map((v, i) => rel(v, sh[i].s.cap)));
  ok(worst < 2e-3, `P(r) de ${A.NOBLES[k].sym}: mayor error ${(worst * 100).toFixed(3)} % en ${sh.length} subcapas`);
  const tot = ints.reduce((a, v) => a + v, 0);
  ok(rel(tot, A.NOBLES[k].Z) < 2e-3, `${A.NOBLES[k].sym}: ∫ΣP = ${tot.toFixed(3)} electrones (Z = ${A.NOBLES[k].Z})`);
}
{
  const sh = A.atomShells(A.NOBLES[4].Z)[0], r = 1.5;
  ok(near(sh.P(r), 4 * Math.PI * r * r * sh.rho(r), 1e-9), "P(r) = 4πr²ρ(r) en cada punto");
}
// un orbital suelto integra 1
[[1, 0], [2, 1], [3, 2], [5, 0]].forEach(([n, l]) => {
  const rad = A.radial(n, l);
  const v = integ(A.orbitalP(n, l), rad.rs[rad.rs.length - 1] + rad.dr);
  ok(rel(v, 1) < 2e-3, `∫P(r)dr de un orbital ${n}${A.LCH[l]} = ${v.toFixed(4)} (1)`);
});
{
  // ψ: decae con r, es 0 en el origen salvo para l = 0, y cambia de signo entre lóbulos
  ok(A.psi(1, 0, 0, 0, 0, 0) > 0, "ψ(1s) > 0 en el núcleo");
  ok(A.psi(1, 0, 0, 3, 0, 0) < A.psi(1, 0, 0, 0, 0, 0), "ψ(1s) decrece hacia fuera");
  ok(A.psi(2, 1, 2, 0, 0, 0) === 0 && A.psi(3, 2, 0, 0, 0, 0) === 0, "ψ = 0 en el origen para l > 0");
  const sign = Math.sign(A.psi(2, 1, 2, 0, 0, 1)) * Math.sign(A.psi(2, 1, 2, 0, 0, -1));
  ok(sign === -1, "ψ(2p_z) tiene fases opuestas en los dos lóbulos");
  ok(A.psi(3, 0, 0, 0, 0, 2) !== A.psi(3, 0, 0, 0, 0, 0), "ψ(3s) depende del radio");
}
ok(A.bestPlane(2, 0) === "xy", `bestPlane(d_xy) = ${A.bestPlane(2, 0)} (xy)`);
ok(A.bestPlane(1, 2) !== "xy", `bestPlane(p_z) = ${A.bestPlane(1, 2)} (contiene el eje z)`);
ok(["xz", "xy", "yz"].includes(A.bestPlane(3, 3)), "bestPlane devuelve siempre un plano válido");

console.log("\n── 6. Datos espectrales NIST (coherencia interna) ──");

ok(S.SPEC_ORDER.length === A.NOBLES.length, `SPEC_ORDER: ${S.SPEC_ORDER.length} gases nobles, igual que en physics.js`);
S.SPEC_ORDER.forEach((el, i) => {
  const d = S.SPEC[el];
  ok(!!d && d.z === A.NOBLES[i].Z && !!d.name && !!d.conf && d.ie > 0,
    `${el}: metadatos completos y Z = ${d && d.z} coincide con physics.js`);
});
{
  let n = 0, badLam = 0, badEk = 0, outWin = 0, badMeta = 0, worst = 0;
  // los orbitales vienen etiquetados con su capa ("2p", "6s", "10d"): la letra es la última
  const isOrb = (o) => "spdf".indexOf(String(o).slice(-1).toLowerCase()) >= 0;
  for (const el of S.SPEC_ORDER) for (const L of S.SPEC[el].lines) {
    const [lam, inten, ei, ek, lorb, , uorb] = L;
    n++;
    const calc = 1e7 / (ek - ei);
    if (rel(calc, lam) > 0.002) badLam++;
    worst = Math.max(worst, rel(calc, lam));
    if (!(ek > ei)) badEk++;
    if (lam < 250 || lam > 1050) outWin++;
    if (!(inten > 0) || !isOrb(lorb) || !isOrb(uorb)) badMeta++;
  }
  ok(badLam === 0, `${n} líneas: λ = 1e7/(Ek−Ei) en todas (peor desvío ${(worst * 100).toFixed(3)} %)`);
  ok(badEk === 0, "todas las líneas tienen Ek > Ei");
  ok(badMeta === 0, "todas las líneas traen intensidad positiva y orbitales s/p/d/f válidos");
  ok(outWin === 0, "todas las líneas caen dentro de la ventana del visor (250–1050 nm)");
}

console.log("\n── 7. Color espectral (wave2rgb) ──");

{
  let out = 0, worstOut = 0;
  for (let w = 250; w <= 1050; w += 1) {
    for (const v of E.wave2rgb(w)) {
      if (!(v >= 0 && v <= 1)) out++;
      worstOut = Math.max(worstOut, Math.max(v - 1, -v));
    }
  }
  ok(out === 0, `rgb dentro de [0,1] en las 801 longitudes de la ventana (peor exceso ${worstOut.toFixed(3)})`);
}
{
  // fuera del visible no hay color: gris neutro (antes salían UV verdes e IR negras, invisibles)
  let bad = 0;
  for (let w = 250; w <= 1050; w += 1) {
    const c = E.wave2rgb(w);
    const grey = Math.max(...c) - Math.min(...c);
    if ((w < 380 || w > 780) && grey > 1e-9) bad++;
    if (w >= 400 && w <= 700 && grey < 0.2) bad++;
  }
  ok(bad === 0, "gris neutro fuera del visible y color saturado dentro");
}
{
  const [r1, g1, b1] = E.wave2rgb(650);          // rojo
  const [r2, g2, b2] = E.wave2rgb(520);          // verde
  const [r3, g3, b3] = E.wave2rgb(440);          // azul
  ok(r1 > 0.9 && g1 < 0.05 && b1 < 0.05, `650 nm → rgb(${[r1, g1, b1].map((v) => v.toFixed(2)).join(",")}) rojo`);
  ok(g2 > 0.9 && r2 > 0.1 && b2 < 0.05, `520 nm → rgb(${[r2, g2, b2].map((v) => v.toFixed(2)).join(",")}) verde`);
  ok(b3 > 0.9 && r3 < 0.05, `440 nm → rgb(${[r3, g3, b3].map((v) => v.toFixed(2)).join(",")}) azul`);
  ok(E.wave2rgb(380).every((v) => v >= 0 && v <= 1) && E.wave2rgb(780).every((v) => v >= 0 && v <= 1),
    "los bordes del visible (380 y 780 nm) se atenúan sin salirse de rango");
}

console.log("\n── 8. Diagrama de niveles y cascada ──");

const asLines = (el) => S.SPEC[el].lines.map((a) => ({
  lam: a[0], rel: a[1], ei: a[2], ek: a[3], lorb: a[4], lterm: a[5], uorb: a[6], uterm: a[7],
}));

for (const el of S.SPEC_ORDER) {
  const d = S.SPEC[el];
  if (!d.lines.length) continue;
  const bl = E.buildLevels(asLines(el), 44, d.ie * 8065.54);
  let ord = true, above = true;
  for (let i = 1; i < bl.levels.length; i++) if (bl.levels[i].e < bl.levels[i - 1].e) ord = false;
  for (const L of bl.top) if (L.ek <= L.ei) above = false;
  ok(ord && above, `${el}: ${bl.levels.length} niveles ordenados por energía, ${bl.top.length} transiciones subiendo`);
  ok(bl.top.length <= 44, `${el}: no se dibujan más transiciones que el máximo (44)`);
  ok(bl.levels.some((l) => l.e === 0), `${el}: el diagrama incluye el nivel fundamental`);
  // la columna es la del orbital de nivel: los datos lo etiquetan "2p", "6s", "10d"…
  const colOf = (orb) => "spdf".indexOf(String(orb).slice(-1).toLowerCase());
  ok(bl.levels.every((l) => l.col === colOf(l.orb)),
    `${el}: cada nivel cae en su columna s/p/d/f según el orbital`);
  ok(new Set(bl.levels.map((l) => l.col)).size >= 2,
    `${el}: el diagrama usa ${new Set(bl.levels.map((l) => l.col)).size} columnas distintas (s/p/d/f)`);
  ok(bl.levels.every((l) => l.e <= d.ie * 8065.54 + 1), `${el}: ningún nivel por encima de la energía de ionización`);
}
{
  // la cascada es monótona: una emisión siempre baja de energía, y solo usa líneas reales
  let bad = 0, ran = 0;
  const maxSteps = 4;
  for (let t = 0; t < 300; t++) {
    const el = S.SPEC_ORDER[t % S.SPEC_ORDER.length];
    const d = S.SPEC[el];
    if (!d.lines.length) continue;
    const lines = asLines(el);
    const path = E.buildCascade(lines, maxSteps);
    ran++;
    if (!path.length || path.length > maxSteps) bad++;
    for (let i = 0; i < path.length; i++) {
      const L = path[i];
      if (lines.indexOf(L) < 0) bad++;                    // solo líneas reales del gas
      if (!(L.ek > L.ei)) bad++;
      if (i && !(L.ek <= path[i - 1].ek)) bad++;          // no sube de energía
    }
  }
  ok(bad === 0, `${ran} cascadas simuladas: siempre 1–${maxSteps} fotones, energías decrecientes y líneas reales`);
}

console.log("\n── 9. Cadena pp: energía y masa ──");

{
  const sum = 2 * (F.REACTIONS.pp.qPrompt + F.REACTIONS.pp.qAnni) + 2 * F.REACTIONS.pd.Q + F.REACTIONS.hh.Q;
  // Convención declarada del modelo: se contabiliza el Q completo, incluida la energía
  // que se llevan los νₑ (por eso qPrompt = Q − qAnni). No "corregirlo" sin actualizar
  // la etiqueta del contador y el README.
  ok(near(F.REACTIONS.pp.qPrompt + F.REACTIONS.pp.qAnni, F.REACTIONS.pp.Q, 0.03),
    `p+p: prompt (${F.REACTIONS.pp.qPrompt}) + aniquilación (${F.REACTIONS.pp.qAnni}) = Q completo (${F.REACTIONS.pp.Q} MeV), νₑ incluido`);
  ok(near(sum, F.NET_Q, 0.05), `2·(0.42+1.02) + 2·5.49 + 12.86 = ${sum.toFixed(2)} MeV (NET_Q = ${F.NET_Q})`);
  ok(near(F.massU(F.NET_Q), 0.0287, 1e-4), `Δm = ${F.massU(F.NET_Q).toFixed(4)} u (0.0287)`);
  ok(near(F.massU(F.NET_Q) / 4.002603, 0.0071, 2e-4), `Δm/m(⁴He) = ${(100 * F.massU(F.NET_Q) / 4.002603).toFixed(2)} % (0.71 %)`);
  ok(near(F.kgOf(1), 1.7827e-30, 1e-33), `E = mc²: 1 MeV = ${F.kgOf(1).toExponential(3)} kg (1.783e-30)`);
  ok(near(F.kgOf(F.NET_Q), 4.765e-29, 1e-31), `26.73 MeV = ${F.kgOf(F.NET_Q).toExponential(3)} kg`);
  ok(near(F.keVtoMK(1), 11.6045, 1e-3), `1 keV = ${F.keVtoMK(1).toFixed(4)} MK`);
  ok(near(F.keVtoMK(1.3), 15.09, 0.01), `T por defecto 1.30 keV ≈ ${F.keVtoMK(1.3).toFixed(1)} MK (el núcleo solar es ~15 MK)`);
  ok(near(F.keVtoMK(5), 58.02, 0.05), `máximo del control 5 keV ≈ ${F.keVtoMK(5).toFixed(1)} MK (el texto dice 58 MK)`);
}
{
  // ventana de Gamow: la tasa crece con T, es finita, y p+p es siempre el cuello de botella
  let mono = true, fin = true, bottleneck = true;
  const Ts = [0.3, 0.5, 1, 1.3, 2, 3, 4, 5];
  for (const key of Object.keys(F.REACTIONS)) {
    let prev = -1;
    for (const T of Ts) {
      const v = F.fusionRate(F.REACTIONS[key], T);
      if (!(v > 0) || !isFinite(v)) fin = false;
      if (v < prev) mono = false;
      prev = v;
    }
  }
  for (const T of Ts) {
    const pp = F.fusionRate(F.REACTIONS.pp, T);
    if (!(pp < F.fusionRate(F.REACTIONS.pd, T) && pp < F.fusionRate(F.REACTIONS.hh, T))) bottleneck = false;
  }
  ok(mono, "la tasa de fusión crece con T en las tres reacciones");
  ok(fin, "la tasa es positiva y finita en todo el rango del control (0.3–5 keV)");
  ok(bottleneck, "p+p es el paso más lento en todo el rango (el cuello de botella que describe la página)");
  const r = F.fusionRate(F.REACTIONS.pp, 1.3);
  ok(r > 1e-3 && r < 1, `tasa p+p a 1.3 keV = ${r.toFixed(4)} s⁻¹ mientras dos iones están en contacto`);
}

console.log("\n── 10. Muestreo angular y recuento de subcapas ──");

{
  // la subcapa llena es esférica (Unsöld) y el número de orientaciones es 2l+1
  let okOrb = true, okCount = true;
  A.nobleConfig(6).forEach((s) => {
    if (s.norb !== 2 * s.l + 1 || s.cap !== 2 * (2 * s.l + 1)) okOrb = false;
  });
  for (let k = 0; k < A.NOBLES.length; k++) {
    const sh = A.atomShells(A.NOBLES[k].Z);
    if (sh.length !== A.nobleConfig(k).length) okCount = false;
  }
  ok(okOrb, "cada subcapa tiene 2l+1 orientaciones y 2(2l+1) electrones");
  ok(okCount, "atomShells devuelve todas las subcapas ocupadas del gas noble");
}
{
  // el muestreo angular respeta la forma: para 2p_z, |Y|² ∝ cos²θ, así que la fracción
  // de puntos con |cosθ| > 0.8 debe ser 1 − 0.8³ = 0.488 (valor analítico)
  const pz = A.genOrbital(2, 1, 2, 8000);
  let nearAxis = 0, tot = 0;
  for (const gr of pz) for (let i = 0; i < gr.c; i++) {
    const cos = gr.z[i] / (Math.hypot(gr.x[i], gr.y[i], gr.z[i]) || 1);
    if (Math.abs(cos) > 0.8) nearAxis++;
    tot++;
  }
  const frac = nearAxis / tot;
  ok(near(frac, 0.488, 0.02),
    `2p_z: ${(100 * frac).toFixed(1)} % de los puntos a menos de 37° del eje z (analítico 48.8 %)`);
}

console.log("\n── 11. Geometría molecular del agua ──");
{
  const g = W.waterGeometry();
  ok(near(W.angleBetweenBonds(g), 104.5, 1e-9), `ángulo H–O–H = ${W.angleBetweenBonds(g).toFixed(1)}°`);
  ok(near(Math.hypot(...g.H1), 0.9584, 1e-9) && near(Math.hypot(...g.H2), 0.9584, 1e-9),
    "ambos enlaces O–H miden 0.9584 Å");
  ok(W.DENSITY_POINTS >= 5000, `nube de densidad contiene ${W.DENSITY_POINTS.toLocaleString("es")} muestras ilustrativas`);
}

console.log("\n── 12. Interacciones reducidas entre moléculas de agua ──");
{
  const atMinimum = MW.ljPotential(Math.pow(2, 1 / 6));
  ok(MW.ljPotential(0.8) > atMinimum && atMinimum < MW.ljPotential(1.7),
    "Lennard-Jones tiene repulsión de núcleo y mínimo atractivo");
  const aligned = MW.donorAlignment(0, 52.25 * Math.PI / 180).sum;
  const misaligned = MW.donorAlignment(Math.PI, 52.25 * Math.PI / 180).sum;
  ok(aligned > 0.99 && misaligned < 0.01, "la atracción direccional favorece la orientación O–H alineada");
  ok(MW.PHASES.solid.target < MW.PHASES.liquid.target &&
     MW.PHASES.liquid.target < MW.PHASES.gas.target,
    "los preajustes tienen temperatura reducida creciente: sólido < líquido < gas");
}

console.log("\n── 13. Propiedades periódicas y efectos relativistas (Z > 70) ──");
{
  ok(A.IE1.length === 118 && A.PAULING_EN.length === 118, "IE1 y PAULING_EN cubren los 118 elementos");
  ok(A.IE1[1] > A.IE1[2], `He (${A.IE1[1]} eV) tiene mayor IE₁ que Li (${A.IE1[2]} eV)`);
  ok(A.slaterRadius(19).rAngstrom > A.slaterRadius(1).rAngstrom, "radio de Slater crece de H a K");
  ok(A.relFactor(26, 0) === 1 && A.relFactor(79, 0) < 0.9 && A.relFactor(79, 2) > 1.05,
    "efectos relativistas: sin cambio para Z≤70, contracción s y expansión d en Au (Z=79)");
}

console.log("\n── 14. Efecto Zeeman en espectro.js ──");
{
  const z0 = E.zeemanSplit(585.25, 0, 1.0);
  const z2 = E.zeemanSplit(585.25, 2.0, 1.0);
  ok(z0.dE_eV === 0 && z0.dLam_nm === 0, "sin campo B=0 no hay desdoblamiento");
  ok(z2.components.length === 3 && z2.components[0].lam < 585.25 && z2.components[2].lam > 585.25,
    `B=2 T desdobla 585.25 nm en triplete (±${(z2.dLam_nm * 1000).toFixed(1)} pm)`);
}

console.log("\n── 15. Hibridación y orbitales moleculares LCAO-MO ──");
{
  const Chem = require("../js/chemistry.js");
  // Ortogonalidad de los coeficientes de sp3, sp3d y sp3d2
  const dot = (a, b) => {
    let s = 0;
    for (const [n1, l1, i1, c1] of a.terms)
      for (const [n2, l2, i2, c2] of b.terms)
        if (n1 === n2 && l1 === l2 && i1 === i2) s += c1 * c2;
    return s;
  };
  for (const key of ["sp", "sp2", "sp3", "sp3d", "sp3d2"]) {
    const lobes = Chem.HYBRIDS[key].lobes;
    let ortho = true;
    for (let i = 0; i < lobes.length; i++) {
      if (!near(dot(lobes[i], lobes[i]), 1, 1e-9)) ortho = false;
      for (let j = i + 1; j < lobes.length; j++) {
        if (!near(dot(lobes[i], lobes[j]), 0, 1e-9)) ortho = false;
      }
    }
    ok(ortho, `hibridación ${key} es ortonormal (${lobes.length} lóbulos)`);
  }
  ok(near(Chem.moOverlap(0), 1, 1e-12) && Chem.moOverlap(2.5) > 0.4, "solapamiento S(0)=1 y S(2.5)>0.4");
  ok(Chem.moEnergy(2.5).dE_bond < 0 && Chem.moEnergy(2.5).dE_anti > 0, "σ₁ₛ es enlazante (ΔE<0) y σ₁ₛ* antienlazante (ΔE>0)");
  ok(near(Chem.evalMO("anti", 2.5, 0.7, -0.4, 0), 0, 1e-12), "σ₁ₛ* tiene plano nodal exacto en z = 0");
  ok(Chem.vseprBondSCharacter(109.47122) > Chem.vseprBondSCharacter(107.0) &&
     Chem.vseprBondSCharacter(107.0) > Chem.vseprBondSCharacter(104.5),
     "teorema de Coulson: el carácter s del enlace disminuye CH₄ > NH₃ > H₂O");
  const h2oCloud = Chem.genVSEPR("H2O", 1600);
  ok(h2oCloud.length === 4 && h2oCloud.every(g => g.c > 0),
     "genVSEPR('H2O') genera 4 lóbulos (2 enlaces σ + 2 pares solitarios)");
}

console.log("\n── 16. Superposición temporal Ψ(r, t) ──");
{
  const Sup = require("../js/superposicion.js");
  const d0 = Sup.superpositionDensity(1, 1, Math.SQRT1_2, Math.SQRT1_2, 0);
  const dpi = Sup.superpositionDensity(1, 1, Math.SQRT1_2, Math.SQRT1_2, Math.PI);
  ok(near(d0, 2, 1e-9) && near(dpi, 0, 1e-9), "interferencia constructiva en fase 0 y destructiva en fase π");
  ok(near(Sup.bohrEnergyEv(2) - Sup.bohrEnergyEv(1), 10.204, 0.01), "transición 1s↔2p tiene ΔE ≈ 10.20 eV");
}

console.log("\n── 17. Historia de modelos y simulador Dirac 2P ──");
{
  const D = require("../js/dirac.js");
  ok(D.MODELS.length === 10 && D.MODELS[7].kind === "dirac" && D.MODELS[9].kind === "sm",
    "línea del tiempo cubre 10 hitos desde Thomson (1904) hasta el Modelo Estándar");
  const sim = new D.Dirac2P(32, 12.0);
  sim.initScenario({ symmetry: "anti", coupling: 1.5, c: 1.2 });
  const n0 = sim.norm();
  for (let s = 0; s < 5; s++) sim.step(0.03);
  const n1 = sim.norm();
  ok(near(n0, 1, 1e-10) && near(n1, 1, 1e-10),
    `evolución Split-Step FFT conserva la norma (${n0.toFixed(6)} → ${n1.toFixed(6)})`);
  const { rho } = sim.density();
  let sameSpinDiag = 0, exchErr = 0;
  for (let i = 0; i < sim.N; i++) {
    const idx = i * sim.N + i;
    sameSpinDiag = Math.max(sameSpinDiag,
      sim.re[0][idx] ** 2 + sim.im[0][idx] ** 2,
      sim.re[3][idx] ** 2 + sim.im[3][idx] ** 2);
    for (let j = 0; j < sim.N; j++) {
      const a = i * sim.N + j, b = j * sim.N + i;
      exchErr = Math.max(exchErr,
        Math.abs(sim.re[1][a] + sim.re[2][b]),
        Math.abs(sim.im[1][a] + sim.im[2][b]));
    }
  }
  ok(sameSpinDiag < 1e-12 && exchErr < 1e-12,
    "fermiones conservan antisimetría de intercambio Ψ_{ab}(x₁,x₂) = −Ψ_{ba}(x₂,x₁) y cero en diagonal mismo espín");
}

console.log(fail ? `\n${fail} prueba(s) fallaron\n` : "\ntodas las pruebas pasaron\n");
process.exit(fail ? 1 : 0);
