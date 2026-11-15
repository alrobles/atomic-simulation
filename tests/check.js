// Pruebas rápidas de la física: node tests/check.js
const A = require("../js/physics.js");
let fail = 0;
const ok = (cond, msg) => { console.log((cond ? "✓ " : "✗ ") + msg); if (!cond) fail++; };

// 1. Los totales de cada configuración coinciden con Z de los gases nobles
A.NOBLES.forEach((g, k) => {
  const tot = A.nobleConfig(k).reduce((a, s) => a + s.cap, 0);
  ok(tot === g.Z, `${g.sym}: suma de electrones = ${tot} (esperado ${g.Z})`);
});

// 2. Tamaños de los periodos = 2·n²
const sizes = A.PERIODS.map((row) => row.reduce((a, lab) => a + A.subshell(lab).cap, 0));
ok(JSON.stringify(sizes) === "[2,8,8,18,18,32,32]", `periodos: ${sizes.join(", ")}`);

// 3. Reglas de Slater: valores de libro de texto
const zNe2p = A.zeff(10, A.nobleConfig(1), A.subshell("2p"));
ok(Math.abs(zNe2p - 5.85) < 1e-9, `Z_ef(Ne 2p) = ${zNe2p.toFixed(2)} (5.85)`);
const zAr3p = A.zeff(18, A.nobleConfig(2), A.subshell("3p"));
ok(Math.abs(zAr3p - 6.75) < 1e-9, `Z_ef(Ar 3p) = ${zAr3p.toFixed(2)} (6.75)`);
const zKr3d = A.zeff(36, A.nobleConfig(3), A.subshell("3d"));
ok(Math.abs(zKr3d - 14.85) < 1e-9, `Z_ef(Kr 3d) = ${zKr3d.toFixed(2)} (14.85)`);

// 4. <r> hidrogenoide = (3n² − l(l+1))/2
[[1, 0], [2, 1], [3, 2], [4, 3]].forEach(([n, l]) => {
  const rad = A.radial(n, l);
  let m = 0;
  for (let k = 0; k < rad.rs.length; k++) m += rad.rs[k] * (rad.cdf[k] - (k ? rad.cdf[k - 1] : 0));
  const exp = (3 * n * n - l * (l + 1)) / 2;
  ok(Math.abs(m - exp) / exp < 0.01, `<r>(${n}${A.LCH[l]}) = ${m.toFixed(2)} (${exp})`);
});

// 5. Generación de nubes
const g = A.genAtom(6, { points: 40000 });
ok(g.reduce((a, x) => a + x.c, 0) > 30000, "genAtom(Og) genera puntos");

process.exit(fail ? 1 : 0);
