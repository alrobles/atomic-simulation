#!/usr/bin/env python3
"""export_density.py — muestrea la densidad RHF/sto-3g de H2O (overnight/h2o/rho.npy)
y exporta un cloud de puntos para el navegador.

Salida: data/h2o_density.bin  — Float32 [x,y,z,w]*N en coordenadas de agua.js
                               (O en el origen, enlaces en el plano xy, H abajo)
        data/h2o_info.json    — metadatos del cálculo (método, energías, dipolo)

Conversión de ejes HF→agua.js: (x,y,z)_agua = (z_hf, -x_hf, y_hf)
"""
import json, os
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RHO = os.path.join(ROOT, "overnight", "h2o", "rho.npy")
DATA = json.load(open(os.path.join(ROOT, "overnight", "h2o", "data.json")))
OUT = os.path.join(ROOT, "data")
os.makedirs(OUT, exist_ok=True)

NPTS = 50000
rho = np.load(RHO)                      # (200,200,200) e/bohr³, ejes x,y,z
n = rho.shape[0]
lim = 6.0

# Pesos ∝ ρ (dV constante se cancela). Muestreo sistemático sobre la CDF.
w = rho.astype(np.float64).ravel()
cdf = np.cumsum(w)
cdf /= cdf[-1]
rng = np.random.default_rng(20261116)
u = (np.arange(NPTS) + rng.random(NPTS)) / NPTS
idx = np.searchsorted(cdf, u)

# Índice plano C-order de rho[ix,iy,iz]: ix lento, iz rápido.
xs = np.linspace(-lim, lim, n)
dh = xs[1] - xs[0]
ix, rem = np.divmod(idx, n * n)
iy, iz = np.divmod(rem, n)
jx = rng.random(NPTS) - 0.5
jy = rng.random(NPTS) - 0.5
jz = rng.random(NPTS) - 0.5
px = xs[ix] + jx * dh
py = xs[iy] + jy * dh
pz = xs[iz] + jz * dh

# Conversión de ejes al sistema de agua.js: molécula en el plano xy, H hacia -y.
ax, ay, az = pz, -px, py

# Peso visual: densidad local normalizada por percentil alto + raíz (comprime rango).
wv = w[idx]
scale = np.percentile(wv, 99.9)
wn = np.clip(np.sqrt(wv / max(scale, 1e-12)), 0, 1).astype(np.float32)

out = np.empty((NPTS, 4), np.float32)
out[:, 0] = ax; out[:, 1] = ay; out[:, 2] = az; out[:, 3] = wn
out.tofile(os.path.join(OUT, "h2o_density.bin"))

info = {
    "method": "RHF / STO-3G (PySCF 2.15)",
    "geometry": "d(O-H)=0.9584 Å, ángulo HOH=104.5°",
    "E_hartree": DATA["E_hf_hartree"],
    "dipole_debye": DATA["dipole_debye"][0],
    "mulliken_charges": {"O": DATA["mulliken_charges"][0],
                         "H": DATA["mulliken_charges"][1]},
    "HOMO_eV": DATA["mo_energies_ev"][4],
    "LUMO_eV": DATA["mo_energies_ev"][5],
    "n_points": NPTS,
    "format": "Float32 [x,y,z,w]; w = peso visual 0..1",
    "note": "Muestras ∝ ρ(r) de la retícula 200³; no son electrones individuales.",
}
json.dump(info, open(os.path.join(OUT, "h2o_info.json"), "w"), indent=1)
print(f"{NPTS} puntos → data/h2o_density.bin ({out.nbytes/1024:.0f} KiB)")
print("rango x,y,z:", [round(float(v),2) for v in (ax.min(),ay.min(),az.min())],
      [round(float(v),2) for v in (ax.max(),ay.max(),az.max())])
print("w media:", round(float(wn.mean()),3), "max:", round(float(wn.max()),3))
