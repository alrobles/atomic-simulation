/* gen-clouds-viewer.js — nubes de átomo precalculadas para orbitales.html.
 * Genera la config EXACTA de la vista por defecto del visor:
 *   genAtom(k, {isNobleIndex:true, highlightNew:true, visible:all, scale:didactic})
 * para k = 0..6 (He..Og). Solo aplican cuando el usuario no cambia escala,
 * resaltado ni capas; si no, la página sigue generando en vivo.
 *
 * Salida: data/clouds/atom_k{k}.bin + data/clouds/manifest.json
 * Formato bin v2 (uint16 cuantizado):
 *   u32 nGroups; por grupo: u32 count + count×3 uint16 (x,y,z)
 *   cuantización: v = lo + q/65535·(hi−lo), bbox por eje en el manifest.
 */
"use strict";
const fs = require("fs"), path = require("path");
const Atom = require("../js/physics.js");

const OUT = path.join(__dirname, "..", "data", "clouds");
fs.mkdirSync(OUT, { recursive: true });

const POINTS = 200000;
const manifest = { format: "uint16xyz", points: POINTS, assets: {} };

for (let k = 0; k <= 6; k++) {
  const conf = Atom.nobleConfig(k);
  const visible = new Set(conf.map(s => s.lab));
  const groups = Atom.genAtom(k, {
    isNobleIndex: true, highlightNew: true,
    visible, points: POINTS,
  });

  // bbox global por eje para cuantizar
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const g of groups) for (let i = 0; i < g.c; i++) {
    for (let a = 0; a < 3; a++) {
      const v = a === 0 ? g.x[i] : a === 1 ? g.y[i] : g.z[i];
      if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v;
    }
  }
  const span = hi.map((h, a) => Math.max(1e-6, h - lo[a]));

  // bin: u32 nGroups; por grupo u32 count + count×3 uint16
  const total = groups.reduce((s, g) => s + g.c, 0);
  const buf = Buffer.alloc(4 + groups.length * 4 + total * 6);
  let o = 0;
  buf.writeUInt32LE(groups.length, o); o += 4;
  const meta = [];
  for (const g of groups) {
    buf.writeUInt32LE(g.c, o); o += 4;
    meta.push({ color: g.color, alpha: g.alpha, count: g.c });
    for (let i = 0; i < g.c; i++) {
      const q = [
        Math.round((g.x[i] - lo[0]) / span[0] * 65535),
        Math.round((g.y[i] - lo[1]) / span[1] * 65535),
        Math.round((g.z[i] - lo[2]) / span[2] * 65535),
      ];
      for (const v of q) { buf.writeUInt16LE(Math.max(0, Math.min(65535, v)), o); o += 2; }
    }
  }
  const name = `atom_k${k}`;
  fs.writeFileSync(path.join(OUT, name + ".bin"), buf);
  manifest.assets[name] = {
    file: name + ".bin", nobleIndex: k, Z: Atom.NOBLES[k].Z,
    groups: meta, bbox: { lo, hi }, bytes: buf.length,
  };
  console.log(`${name} (Z=${Atom.NOBLES[k].Z}): ${total} pts → ${(buf.length / 1e6).toFixed(2)} MB`);
}
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest));
console.log("LISTO →", OUT);
