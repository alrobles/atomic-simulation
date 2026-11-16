/* gen-clouds.js — genera nubes de puntos densas precalculadas para las vistas.
 * Uso: node overnight/gen-clouds.js
 * Salida: overnight/clouds/<nombre>.bin (Float32 x,y,z por punto) + manifest.json
 * Formato bin por activo: grupos [{color,alpha,count,x,y,z(Float32Array)}]
 */
"use strict";
const fs = require("fs"), path = require("path");
const Atom = require("../js/physics.js");

const OUT = path.join(__dirname, "clouds");
fs.mkdirSync(OUT, { recursive: true });

// Orbitales del héroe de la portada y tarjetas, y gases nobles completos.
const JOBS = [];
for (const [n, l, i, tag] of [[1,0,0,"1s"],[2,1,0,"2p"],[3,2,0,"3d"],[4,3,0,"4f"],[2,0,0,"2s"],[3,1,0,"3p"],[4,2,0,"4d"],[5,3,0,"5f"],[2,1,1,"2p1"],[3,2,1,"3d1"],[3,2,2,"3d2"]])
  JOBS.push({ kind: "orbital", n, l, i, name: `orb_${tag}`, pts: 400000 });
for (const z of [2,10,18,36,54,86])
  JOBS.push({ kind: "atom", z, name: `atom_Z${z}`, pts: 250000 });

const manifest = {};
for (const job of JOBS) {
  const t0 = Date.now();
  const groups = job.kind === "orbital"
    ? Atom.genOrbital(job.n, job.l, job.i, job.pts)
    : Atom.genAtom(job.z, { points: job.pts, isNobleIndex: false });
  // bin: uint32 nGroups; por grupo: uint32 count, 3×float32[count]
  const counts = groups.map(g => g.c || g.x.length);
  const total = counts.reduce((a,b)=>a+b,0);
  const buf = Buffer.alloc(4 + groups.length * 4 + total * 12);
  let o = 0;
  buf.writeUInt32LE(groups.length, o); o += 4;
  for (const g of groups) { buf.writeUInt32LE(g.c, o); o += 4; }
  for (const g of groups) for (let k = 0; k < g.c; k++) {
    buf.writeFloatLE(g.x[k], o); o += 4;
    buf.writeFloatLE(g.y[k], o); o += 4;
    buf.writeFloatLE(g.z[k], o); o += 4;
  }
  const file = path.join(OUT, job.name + ".bin");
  fs.writeFileSync(file, buf);
  manifest[job.name] = { file: job.name + ".bin", groups: groups.map(g => ({ color: g.color, alpha: g.alpha, count: g.c })), bytes: buf.length };
  console.log(`${job.name}: ${total} pts en ${((Date.now()-t0)/1000).toFixed(1)}s → ${(buf.length/1e6).toFixed(1)} MB`);
}
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("LISTO:", Object.keys(manifest).length, "activos en", OUT);
