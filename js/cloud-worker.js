/* cloud-worker.js — Web Worker para muestreo Monte Carlo de nubes densas (hasta 160k+ puntos)
 * sin bloquear el hilo principal ni la rotación 3D.
 */
/* global importScripts, self, Atom */
importScripts("physics.js");

self.onmessage = function (e) {
  const { id, type, kOrZ, opts, n, l, i, N } = e.data;
  try {
    let groups;
    if (type === "atom") {
      const safeOpts = Object.assign({}, opts, {
        visible: opts && opts.visible ? new Set(opts.visible) : undefined,
      });
      groups = Atom.genAtom(kOrZ, safeOpts);
    } else if (type === "orbital") {
      groups = Atom.genOrbital(n, l, i, N);
    } else {
      self.postMessage({ id, error: "Tipo desconocido: " + type });
      return;
    }
    const transfers = [];
    for (const g of groups) {
      transfers.push(g.x.buffer, g.y.buffer, g.z.buffer);
    }
    self.postMessage({ id, groups }, transfers);
  } catch (err) {
    self.postMessage({ id, error: err && err.message ? err.message : String(err) });
  }
};
