/* viewer.js — Visor 3D de nubes de puntos con canvas 2D (sin dependencias).
 * Todas las instancias comparten un único bucle requestAnimationFrame.
 */
(function (root) {
  "use strict";

  const viewers = [];
  let running = false;

  class Viewer {
    constructor(canvas, opts) {
      opts = opts || {};
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.cloud = [];
      this.az = opts.az ?? 0.6;
      this.el = opts.el ?? 0.35;
      this.zoom = 1;
      this.spin = opts.spin ?? 0.003;
      this.axes = opts.axes ?? true;
      this.fill = opts.fill ?? 0.4;
      this.bg = opts.bg ?? "#0d1117";
      this.pointSize = opts.pointSize ?? 1.6;
      this.drag = null;
      if (opts.interactive !== false) this._bind();
      viewers.push(this);
      if (!running) { running = true; requestAnimationFrame(loop); }
    }

    setCloud(groups) { this.cloud = groups || []; }

    _bind() {
      const c = this.canvas;
      c.style.cursor = "grab";
      c.addEventListener("pointerdown", (e) => {
        this.drag = [e.clientX, e.clientY]; c.setPointerCapture(e.pointerId); c.style.cursor = "grabbing";
      });
      c.addEventListener("pointerup", () => { this.drag = null; c.style.cursor = "grab"; });
      c.addEventListener("pointermove", (e) => {
        if (!this.drag) return;
        this.az += (e.clientX - this.drag[0]) * 0.01;
        this.el = Math.max(-1.5, Math.min(1.5, this.el + (e.clientY - this.drag[1]) * 0.01));
        this.drag = [e.clientX, e.clientY];
      });
      c.addEventListener("wheel", (e) => {
        e.preventDefault();
        this.zoom = Math.max(0.3, Math.min(8, this.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
      }, { passive: false });
    }

    render(opts) {
      opts = opts || {};
      const c = opts.canvas || this.canvas, ctx = opts.ctx || this.ctx;
      const dpr = opts.dpr || window.devicePixelRatio || 1;
      const W = opts.W || c.clientWidth, H = opts.H || c.clientHeight;
      if (!W || !H) return;
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
        c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
      if (opts.transparent) {
        ctx.clearRect(0, 0, W, H);
      } else {
        ctx.fillStyle = this.bg;
        ctx.fillRect(0, 0, W, H);
      }
      if (!opts.static && !this.drag && !Viewer.paused) this.az += this.spin * Viewer.speed;

      const ca = Math.cos(this.az), sa = Math.sin(this.az), ce = Math.cos(this.el), se = Math.sin(this.el);
      const cx = W / 2, cy = H / 2, S = Math.min(W, H) * this.fill * this.zoom;
      const proj = (x, y, z) => {
        const vx = x * ca - y * sa, d0 = x * sa + y * ca, up = z * ce - d0 * se, dep = z * se + d0 * ce;
        const p = 1 / (1 + dep * 0.25);
        return [cx + vx * S * p, cy - up * S * p];
      };

      if (this.axes) {
        ctx.strokeStyle = "#30363d"; ctx.fillStyle = "#6e7681"; ctx.font = "12px sans-serif"; ctx.lineWidth = 1;
        [[1, 0, 0, "x"], [0, 1, 0, "y"], [0, 0, 1, "z"]].forEach(([a, b, d, t]) => {
          const p1 = proj(-a * 1.1, -b * 1.1, -d * 1.1), p2 = proj(a * 1.1, b * 1.1, d * 1.1);
          ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
          ctx.fillText(t, p2[0] + 4, p2[1]);
        });
      }
      const n0 = proj(0, 0, 0);
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(n0[0], n0[1], 2.2, 0, 7); ctx.fill();

      const sz = Math.max(1, this.pointSize * Math.sqrt(this.zoom));
      const slice = this.slice || 0; // >0: solo una rebanada de grosor 2·slice frente a la cámara
      for (const g of this.cloud) {
        ctx.fillStyle = g.color; ctx.globalAlpha = slice ? Math.min(0.9, g.alpha * 1.8) : g.alpha;
        const X = g.x, Y = g.y, Zs = g.z;
        for (let k = 0; k < g.c; k++) {
          const x = X[k], y = Y[k], z = Zs[k];
          const vx = x * ca - y * sa, d0 = x * sa + y * ca, up = z * ce - d0 * se, dep = z * se + d0 * ce;
          if (slice && (dep > slice || dep < -slice)) continue;
          const p = 1 / (1 + dep * 0.25);
          ctx.fillRect(cx + vx * S * p, cy - up * S * p, sz, sz);
        }
      }
    }

    /** Exporta el frame actual a PNG (por defecto con fondo transparente y 2x resolución). */
    exportPNG(filename, opts) {
      opts = opts || {};
      const W = this.canvas.clientWidth || 800;
      const H = this.canvas.clientHeight || 600;
      const scale = opts.scale || 2;
      const off = document.createElement("canvas");
      const ctx = off.getContext("2d");
      this.render({
        canvas: off,
        ctx,
        W,
        H,
        dpr: scale,
        transparent: opts.transparent !== false,
        static: true,
      });
      const a = document.createElement("a");
      a.download = filename || "orbital.png";
      a.href = off.toDataURL("image/png");
      a.click();
    }
  }

  function loop() {
    for (let i = viewers.length - 1; i >= 0; i--) {
      if (!viewers[i].canvas.isConnected) viewers.splice(i, 1);
    }
    viewers.forEach((v) => v.render());
    requestAnimationFrame(loop);
  }

  Viewer.speed = 1;     // multiplicador global de giro
  Viewer.paused = false;

  // Cliente compartido para Web Worker de nubes densas (con fallback síncrono)
  let _worker = null, _workerBroken = false, _reqId = 0;
  const _pending = new Map();

  Viewer.genCloudAsync = function (payload, fallbackFn, onDone) {
    const id = ++_reqId;
    if (_workerBroken || typeof Worker === "undefined") {
      onDone(fallbackFn(), id, _reqId);
      return id;
    }
    try {
      if (!_worker) {
        _worker = new Worker("js/cloud-worker.js");
        _worker.onmessage = (e) => {
          const cb = _pending.get(e.data.id);
          _pending.delete(e.data.id);
          if (!cb) return;
          if (e.data.error) cb.onDone(cb.fallbackFn(), e.data.id, _reqId);
          else cb.onDone(e.data.groups, e.data.id, _reqId);
        };
        _worker.onerror = () => {
          _workerBroken = true;
          for (const [pid, cb] of _pending.entries()) {
            cb.onDone(cb.fallbackFn(), pid, _reqId);
          }
          _pending.clear();
        };
      }
      _pending.set(id, { fallbackFn, onDone });
      _worker.postMessage(Object.assign({ id }, payload));
    } catch (_) {
      _workerBroken = true;
      onDone(fallbackFn(), id, _reqId);
    }
    return id;
  };
  Viewer.latestCloudReq = () => _reqId;

  // ---------- Nubes precalculadas (data/clouds/, uint16 cuantizado) ----------
  // manifest.assets[name] = {file, groups:[{color,alpha,count}], bbox:{lo,hi}}
  const _binCache = new Map();   // url -> Promise<groups>
  Viewer.loadCloudManifest = function () {
    return fetch("data/clouds/manifest.json")
      .then(r => (r.ok ? r.json() : null)).catch(() => null);
  };
  Viewer.loadCloudBin = function (asset) {
    const url = "data/clouds/" + asset.file;
    if (!_binCache.has(url)) {
      _binCache.set(url, fetch(url).then(r => {
        if (!r.ok) throw new Error("cloud bin " + r.status);
        return r.arrayBuffer();
      }).then(buf => {
        const dv = new DataView(buf);
        const { lo, hi } = asset.bbox;
        const span = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
        let o = 4; // salta nGroups
        const groups = [];
        for (let gi = 0; gi < asset.groups.length; gi++) {
          const meta = asset.groups[gi];
          const c = dv.getUint32(o, true); o += 4;
          const x = new Float32Array(c), y = new Float32Array(c), z = new Float32Array(c);
          for (let i = 0; i < c; i++) {
            x[i] = lo[0] + dv.getUint16(o, true) / 65535 * span[0]; o += 2;
            y[i] = lo[1] + dv.getUint16(o, true) / 65535 * span[1]; o += 2;
            z[i] = lo[2] + dv.getUint16(o, true) / 65535 * span[2]; o += 2;
          }
          groups.push({ color: meta.color, alpha: meta.alpha, c, x, y, z });
        }
        return groups;
      }));
    }
    return _binCache.get(url);
  };

  root.Viewer = Viewer;
})(window);
