#!/usr/bin/env python3
"""h2o_hf.py — densidad electrónica REAL de H2O por RHF/STO-3G con PySCF.
Geometría: d(O-H)=0.9584 Å, ángulo HOH=104.5° (los valores de agua.js).
Salidas en overnight/h2o/:
  rho.npy + grid.json      — densidad ρ(r) en retícula 3D (e/Å³)
  slice_xy.png, proj_y.png — cortes/proyecciones con mapa inferno
  mo_slices.png            — HOMO-1, HOMO, LUMO en el plano molecular
  data.json                — energías MO, dipolo, cargas de Mulliken, contornos
"""
import json, os
import numpy as np
from pyscf import gto, scf

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "h2o")
os.makedirs(OUT, exist_ok=True)

# O en el origen, bisectriz +x, molécula en el plano xz.
d = 0.9584
half = np.radians(104.5 / 2)
H1 = (d * np.cos(half), 0.0,  d * np.sin(half))
H2 = (d * np.cos(half), 0.0, -d * np.sin(half))
atom = f"O 0 0 0; H {H1[0]:.6f} {H1[1]:.6f} {H1[2]:.6f}; H {H2[0]:.6f} {H2[1]:.6f} {H2[2]:.6f}"

mol = gto.M(atom=atom, basis="sto-3g", unit="Å", spin=0, verbose=0)
mf = scf.RHF(mol)
mf.kernel()
print("E_RHF (Hartree):", mf.e_tot)

# Retícula de evaluación por rebanadas z (memoria acotada):
# [-6,6] Å por lado, N=200 → ~0.06 Å de resolución
N = 200
lim = 6.0
xs = np.linspace(-lim, lim, N)
gx, gy = np.meshgrid(xs, xs, indexing="ij")
gx = gx.ravel(); gy = gy.ravel()
rho = np.zeros((N, N, N), np.float32)
mo_keep = {i: np.zeros((N, N, N), np.float32) for i in (3, 4, 5)}  # HOMO-1, HOMO, LUMO
occ = mf.mo_occ.astype(bool)
for k, z in enumerate(xs):
    coords = np.stack([gx, gy, np.full(gx.size, z)], axis=1)
    ao = mol.eval_gto("GTOval_sph", coords)          # (N*N, nAO)
    mo = ao @ mf.mo_coeff                           # (N*N, nMO)
    rho[:, :, k] = (2.0 * (mo[:, occ] ** 2).sum(axis=1)).reshape(N, N)
    for i in mo_keep:
        mo_keep[i][:, :, k] = mo[:, i].reshape(N, N)
    if k % 50 == 0:
        print(f"  z-slice {k}/{N}", flush=True)

np.save(os.path.join(OUT, "rho.npy"), rho)
json.dump({"axes": "ij (x,y,z)", "n": N, "lim": lim, "unit": "e/bohr^3",
           "note": "densidad RHF/sto-3g"}, open(os.path.join(OUT, "grid.json"), "w"))

# ---- datos didácticos ----
# convierte densidad de atómicas (e/bohr³) a e/Å³
BOHR3 = 0.529177 ** 3
rho_eA3 = rho / BOHR3
levels = [float(np.quantile(rho_eA3, q)) for q in (0.90, 0.97, 0.995, 0.999)]
# niveles tipo "contorno": percentiles altos = regiones de alta densidad
# Mulliken por átomo: q_A = Σ_{i∈A} diag(P·S)_i ; aoslice_by_atom → [bas0,bas1,ao0,ao1]
S = mol.intor("int1e_ovlp")
C = mf.mo_coeff[:, occ]
P = 2.0 * (C @ C.T)
dpop = np.diag(P @ S)
pops = [float(dpop[s[2]:s[3]].sum()) for s in mol.aoslice_by_atom()]
dip_d = mf.dip_moment()                       # ya en Debye
data = {
  "E_hf_hartree": float(mf.e_tot),
  "E_hf_ev": float(mf.e_tot * 27.211386),
  "mo_energies_ev": [float(e * 27.211386) for e in mf.mo_energy],
  "occ": mf.mo_occ.tolist(),
  "dipole_debye": [float(x) for x in dip_d],
  "mulliken_pops": pops,
  "mulliken_charges": [z - p for z, p in zip([8.0, 1.0, 1.0], pops)],
  "density_max_eA3": float(rho_eA3.max()),
  "contour_levels_eA3": levels,
}
json.dump(data, open(os.path.join(OUT, "data.json"), "w"), indent=1)
print("MO energies (eV):", [round(e*27.211386,3) for e in mf.mo_energy])
print("dipolo (D):", data["dipole_debye"], " max ρ:", round(data["density_max_eA3"],3))

# ---- imágenes ----
from PIL import Image
def inferno(t):
    t = np.clip(t, 0, 1)
    # mapa inferno aproximado (3 tramos)
    r = np.clip(1.5*t - 0.2, 0, 1); g = np.clip(1.8*t*t - 0.4*t, 0, 1); b = np.clip(2.2*t**3 - 0.5, 0, 1)
    return np.stack([r, g, b], -1)

def save_png(arr, path):
    a = (np.clip(arr, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(a).save(path)

# proyección máxima a lo largo de y (la molécula está en xz → vista de cara)
proj = rho_eA3.max(axis=1)                      # (x,z)
lo, hi = np.percentile(proj, [50, 99.9])
save_png(inferno((np.log10(proj + 1e-4) - np.log10(lo + 1e-4)) / (np.log10(hi + 1e-4) - np.log10(lo + 1e-4))),
         os.path.join(OUT, "proj_y.png"))
# corte y=0 (plano molecular)
sl = rho_eA3[:, N // 2, :]
save_png(inferno((np.log10(sl + 1e-4) - np.log10(lo + 1e-4)) / (np.log10(hi + 1e-4) - np.log10(lo + 1e-4))),
         os.path.join(OUT, "slice_y0.png"))
# HOMO-1 (i=3), HOMO (i=4), LUMO (i=5) en el plano molecular
for idx, tag in [(3, "homo1"), (4, "homo"), (5, "lumo")]:
    psi = mo_keep[idx][:, N // 2, :]               # plano xz a y=0 → (x,z)
    psi2 = psi ** 2
    pm = psi2 / psi2.max()
    rgb = inferno(pm) * 0.85
    # fase: ψ>0 cálido, ψ<0 azul
    rgb[..., 2] = np.where(psi > 0, rgb[..., 2], rgb[..., 0] * 0.4)
    rgb[..., 0] = np.where(psi > 0, rgb[..., 0], rgb[..., 2] * 0.9)
    Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, f"mo_{tag}.png"))
print("LISTO →", OUT)
