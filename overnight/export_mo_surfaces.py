#!/usr/bin/env python3
"""export_mo_surfaces.py — isosuperficies |ψ|=iso de los MOs de H2O (RHF/STO-3G).

Re-evalúa los orbitales moleculares HOMO-1 (i=3), HOMO (i=4) y LUMO (i=5)
en una retícula 3D y muestrea la envolvente isosuperficial como puntos:
voxels con |ψ| dentro de una banda alrededor de iso aportan puntos
uniformes con jitter; el signo de ψ separa fase + / fase −.

OJO unidades: eval_gto trabaja en BOHR. La malla es [-LIM,LIM] bohr
(±6.1 Å con LIM=11.5) y las coordenadas exportadas se convierten a Å.

Salida en data/:
  mo_{homo1,homo,lumo}_{pos,neg}.bin — Float32 [x,y,z]*N (coords agua.js, Å)
  mo_surfaces.json — iso, conteos, método

Mapeo de ejes HF→agua.js: (x,y,z)_agua = (z_hf, -x_hf, y_hf)
"""
import json, os
import numpy as np
from pyscf import gto, scf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data")
os.makedirs(OUT, exist_ok=True)

# --- mismo sistema que h2o_hf.py ---
d = 0.9584
half = np.radians(104.5 / 2)
H1 = (d * np.cos(half), 0.0,  d * np.sin(half))
H2 = (d * np.cos(half), 0.0, -d * np.sin(half))
atom = f"O 0 0 0; H {H1[0]:.6f} {H1[1]:.6f} {H1[2]:.6f}; H {H2[0]:.6f} {H2[1]:.6f} {H2[2]:.6f}"
mol = gto.M(atom=atom, basis="sto-3g", unit="Å", spin=0, verbose=0)
mf = scf.RHF(mol)
mf.kernel()
print("E_RHF:", mf.e_tot, flush=True)

N, LIM = 160, 11.5                     # bohr → ±6.09 Å
BOHR2A = 0.529177210903
MO_IDX = [(3, "homo1"), (4, "homo"), (5, "lumo")]
ISO_FRAC = 0.10                        # iso = 10% del máximo |ψ| de cada MO
BAND = 0.35                            # banda relativa: |ψ| ∈ iso·(1±BAND)
PTS_PER_VOX = 8
MAX_PTS = 320000                       # tope de puntos por MO (pos+neg)
rng = np.random.default_rng(7)

xs = np.linspace(-LIM, LIM, N)
dg = xs[1] - xs[0]
gx, gy = np.meshgrid(xs, xs, indexing="ij")
gx = gx.ravel(); gy = gy.ravel()

meta = {"method": "RHF/STO-3G (PySCF)", "iso_frac_of_max": ISO_FRAC,
        "grid": {"n": N, "lim_bohr": LIM, "lim_angstrom": LIM * BOHR2A},
        "unit_export": "Angstrom", "mos": {}}

for midx, tag in MO_IDX:
    psi = np.zeros((N, N, N), np.float32)
    c = mf.mo_coeff[:, midx]
    for k, z in enumerate(xs):
        coords = np.stack([gx, gy, np.full(gx.size, z)], axis=1)
        ao = mol.eval_gto("GTOval_sph", coords)
        psi[:, :, k] = (ao @ c).reshape(N, N)
        if k % 40 == 0:
            print(f"  {tag} z {k}/{N}", flush=True)

    amax = float(np.abs(psi).max())
    iso = ISO_FRAC * amax
    lo_b, hi_b = iso * (1 - BAND), iso * (1 + BAND)
    mask = (np.abs(psi) >= lo_b) & (np.abs(psi) <= hi_b)
    vox = np.argwhere(mask)                      # (nv,3) índices i,j,k = x,y,z
    nv = len(vox)
    # ¿toca el borde de la malla? (orbital recortado)
    edge = int(((vox == 0) | (vox == N - 1)).any(axis=1).sum())
    print(f"{tag}: |ψ|max={amax:.4f} iso={iso:.4f} voxels={nv} edge={edge}", flush=True)

    # subsample de voxels si hace falta, PTS_PER_VOX puntos c/u con jitter
    n_vox = min(nv, MAX_PTS // PTS_PER_VOX)
    sel = vox[rng.choice(nv, size=n_vox, replace=False)] if n_vox < nv else vox
    m = len(sel) * PTS_PER_VOX
    base = np.repeat(xs[0] + sel * dg, PTS_PER_VOX, axis=0)
    jit = (rng.random((m, 3)) - 0.5) * dg
    px = base[:, 0] + jit[:, 0]
    py = base[:, 1] + jit[:, 1]
    pz = base[:, 2] + jit[:, 2]
    sgn = np.repeat(np.sign(psi[sel[:, 0], sel[:, 1], sel[:, 2]]), PTS_PER_VOX)
    sgn[sgn == 0] = 1

    # ejes HF→agua.js + bohr→Å: (x,y,z)_a = (z,-x,y) en Å
    ax, ay, az = pz * BOHR2A, -px * BOHR2A, py * BOHR2A
    counts = {}
    for sign, name in [(1.0, "pos"), (-1.0, "neg")]:
        m2 = sgn == sign
        arr = np.stack([ax[m2], ay[m2], az[m2]], axis=1).astype(np.float32)
        arr.tofile(os.path.join(OUT, f"mo_{tag}_{name}.bin"))
        counts[name] = int(m2.sum())
    meta["mos"][tag] = {"iso_au": iso, "psi_max_au": amax, "voxels": int(nv),
                        "edge_voxels": edge, **counts}
    print(f"  → pos={counts['pos']} neg={counts['neg']} pts={counts['pos']+counts['neg']}", flush=True)
    del psi

json.dump(meta, open(os.path.join(OUT, "mo_surfaces.json"), "w"), indent=1)
print("LISTO →", OUT)
