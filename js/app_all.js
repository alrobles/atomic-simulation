/* app_all.js — Interfaz para los 118 elementos de la tabla periódica:
 * selector completo con mini tabla periódica, selector numérico/búsqueda,
 * nube 3D, campo de densidad, distribución radial y desglose de capas.
 */
(function () {
  "use strict";
  const A = window.Atom;
  const $ = (id) => document.getElementById(id);

  // Periodos estándar (conteo acumulativo para saber qué subcapas son de qué periodo)
  const state = {
    Z: 2, // por defecto Helio (o tomado del hash)
    view: "cloud",
    scale: "didactic",
    highlight: true,
    slice: true,
    qty: "P",
    contours: true,
    visible: new Set(),
    orbital: null,
    heat: "category",
    relativistic: true,
  };

  const mainV = new Viewer($("main"), { fill: 0.38, spin: 0.0012 });

  const margins = (H) => ({
    top: Math.min(H * 0.35, $("info").offsetHeight + 22),
    bottom: 24,
  });

  const fieldV = new FieldView($("field"), (W, H) => {
    const m = margins(H), panelW = $("panel").offsetWidth || 340;
    const availW = Math.max(120, W - panelW - 40);
    const size = Math.max(120, Math.min(availW, H - m.top - m.bottom));
    return { x: 40 + Math.max(0, (availW - size) / 2), y: m.top + Math.max(0, (H - m.top - m.bottom - size) / 2), size };
  });

  const radialP = new RadialPlot($("radial"), (W, H) => {
    const m = margins(H), panelW = $("panel").offsetWidth || 340;
    return { x: 60, y: m.top + 10, w: Math.max(140, W - panelW - 90), h: Math.max(100, H - m.top - m.bottom - 40) };
  });

  // ---------- Posiciones en la tabla periódica (columnas 1..18, filas 1..7) ----------
  // Mapeo estándar de fila y columna para los 118 elementos
  function getGridPos(Z) {
    // Casos especiales periodo 1
    if (Z === 1) return { r: 1, c: 1 };
    if (Z === 2) return { r: 1, c: 18 };
    // Periodo 2: Li(3)..Ne(10)
    if (Z >= 3 && Z <= 4) return { r: 2, c: Z - 2 };
    if (Z >= 5 && Z <= 10) return { r: 2, c: Z + 8 };
    // Periodo 3: Na(11)..Ar(18)
    if (Z >= 11 && Z <= 12) return { r: 3, c: Z - 10 };
    if (Z >= 13 && Z <= 18) return { r: 3, c: Z };
    // Periodo 4: K(19)..Kr(36)
    if (Z >= 19 && Z <= 36) return { r: 4, c: Z - 18 };
    // Periodo 5: Rb(37)..Xe(54)
    if (Z >= 37 && Z <= 54) return { r: 5, c: Z - 36 };
    // Periodo 6: Cs(55), Ba(56)
    if (Z >= 55 && Z <= 56) return { r: 6, c: Z - 54 };
    // Lantánidos: La(57)..Lu(71) -> fila 8.5 (abajo) o fila 9
    if (Z >= 57 && Z <= 71) return { r: 9, c: Z - 57 + 3 };
    // Hf(72)..Rn(86)
    if (Z >= 72 && Z <= 86) return { r: 6, c: Z - 72 + 4 };
    // Periodo 7: Fr(87), Ra(88)
    if (Z >= 87 && Z <= 88) return { r: 7, c: Z - 86 };
    // Actínidos: Ac(89)..Lr(103) -> fila 10
    if (Z >= 89 && Z <= 103) return { r: 10, c: Z - 89 + 3 };
    // Rf(104)..Og(118)
    if (Z >= 104 && Z <= 118) return { r: 7, c: Z - 104 + 4 };
    return { r: 1, c: 1 };
  }

  // Categorías químicas aproximadas para coloración didáctica
  function getCategory(Z) {
    if ([2, 10, 18, 36, 54, 86, 118].includes(Z)) return "noble";
    if ([1, 6, 7, 8, 15, 16, 34].includes(Z)) return "nonmetal";
    if ([9, 17, 35, 53, 85, 117].includes(Z)) return "halogen";
    if ([3, 11, 19, 37, 55, 87].includes(Z)) return "alkali";
    if ([4, 12, 20, 38, 56, 88].includes(Z)) return "alkaline-earth";
    if (Z >= 57 && Z <= 71) return "lanthanide";
    if (Z >= 89 && Z <= 103) return "actinide";
    if ((Z >= 21 && Z <= 30) || (Z >= 39 && Z <= 48) || (Z >= 72 && Z <= 80) || (Z >= 104 && Z <= 112)) return "transition";
    if ([5, 14, 32, 33, 51, 52].includes(Z)) return "metalloid";
    return "post-transition";
  }

  function heatColor(t) {
    // Escala azul -> cian -> amarillo -> rojo (0..1)
    const c = Math.max(0, Math.min(1, t));
    const r = Math.round(255 * Math.min(1, Math.max(0, 1.5 * c - 0.1)));
    const g = Math.round(255 * Math.sin(Math.PI * Math.pow(c, 0.85)));
    const b = Math.round(255 * Math.max(0, 1 - 1.5 * c));
    return `rgba(${r},${g},${b},0.42)`;
  }

  function propValue(Z, mode) {
    if (mode === "radius") return A.slaterRadius(Z, { relativistic: state.relativistic }).rAngstrom;
    if (mode === "ie1") return A.IE1[Z - 1];
    if (mode === "en") return A.PAULING_EN[Z - 1];
    return null;
  }

  // ---------- Renderizado de la Mini Tabla Periódica ----------
  function renderPeriodicTable() {
    const mode = state.heat;
    let minV = Infinity, maxV = -Infinity;
    if (mode !== "category") {
      for (let z = 1; z <= 118; z++) {
        const v = propValue(z, mode);
        if (v !== null && v !== undefined) {
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
        }
      }
      const unit = mode === "radius" ? "Å" : mode === "ie1" ? "eV" : "";
      $("ptLegend").innerHTML = `<span style="display:inline-block;width:64px;height:8px;vertical-align:middle;border-radius:3px;background:linear-gradient(90deg,rgba(0,0,255,.5),rgba(0,255,150,.5),rgba(255,220,0,.5),rgba(255,40,0,.5));margin-right:4px"></span>${minV.toFixed(2)}–${maxV.toFixed(2)} ${unit}`;
    } else {
      $("ptLegend").textContent = "Haz clic en cualquier elemento o usa ←/→";
    }

    let h = '<div class="ptable-grid">';
    A.ELEMENTS.forEach((el) => {
      const pos = getGridPos(el.Z);
      const cat = getCategory(el.Z);
      const isSel = el.Z === state.Z;
      let bgStyle = "", extraTitle = "";
      if (mode !== "category") {
        const v = propValue(el.Z, mode);
        if (v !== null && v !== undefined && maxV > minV) {
          bgStyle = `background:${heatColor((v - minV) / (maxV - minV))};`;
          extraTitle = ` · ${v.toFixed(2)}`;
        } else {
          bgStyle = "background:#161b22;opacity:0.55;";
          extraTitle = " · N/D";
        }
      }
      h += `<button class="pt-cell ${isSel ? "on" : ""} cat-${cat}"
              data-z="${el.Z}"
              title="Z=${el.Z} ${el.sym} · ${el.name}${extraTitle}"
              style="grid-row:${pos.r}; grid-column:${pos.c}; ${bgStyle}">
              <span class="pt-z">${el.Z}</span>
              <span class="pt-sym">${el.sym}</span>
            </button>`;
    });
    // Etiquetas para lantánidos / actínidos
    h += `<div class="pt-tag" style="grid-row:9; grid-column:1/3;">57-71 La-Lu</div>`;
    h += `<div class="pt-tag" style="grid-row:10; grid-column:1/3;">89-103 Ac-Lr</div>`;
    h += '</div>';
    $("ptable-container").innerHTML = h;

    // Poblar también el select desplegable
    let selH = "";
    A.ELEMENTS.forEach((el) => {
      selH += `<option value="${el.Z}" ${el.Z === state.Z ? "selected" : ""}>${el.Z}. ${el.sym} - ${el.name}${el.isNoble ? " (Gas noble)" : ""}</option>`;
    });
    $("elemSelect").innerHTML = selH;
  }

  $("ptable-container").addEventListener("click", (e) => {
    const b = e.target.closest(".pt-cell");
    if (b) selectElement(+b.dataset.z);
  });

  $("elemSelect").addEventListener("change", (e) => {
    selectElement(+e.target.value);
  });

  $("sliderZ").addEventListener("input", (e) => {
    selectElement(+e.target.value);
  });

  $("btnPrev").addEventListener("click", () => selectElement(state.Z - 1));
  $("btnNext").addEventListener("click", () => selectElement(state.Z + 1));

  // ---------- Capas (Checkboxes del átomo actual) ----------
  function renderLayers() {
    const Z = state.Z;
    const conf = A.elementConfig(Z);
    $("layers").innerHTML = conf.map((s) => {
      const z = state.scale === "real" || state.view !== "cloud" ? ` <small>Z<sub>ef</sub>=${A.zeff(Z, conf, s).toFixed(1)}</small>` : "";
      return `<label style="border-color:${A.LCOLOR[s.l]}">
        <input type="checkbox" data-lab="${s.lab}" ${state.visible.has(s.lab) ? "checked" : ""}>
        ${s.lab}${A.sup(s.occ)}${z}
      </label>`;
    }).join("");
  }

  $("layers").addEventListener("change", (e) => {
    const lab = e.target.dataset.lab;
    if (!lab) return;
    e.target.checked ? state.visible.add(lab) : state.visible.delete(lab);
    state.orbital = null;
    renderMain();
  });

  document.querySelector(".lbtns").addEventListener("click", (e) => {
    const m = e.target.dataset.show;
    if (!m) return;
    const conf = A.elementConfig(state.Z);
    let coreZ = 0;
    for (const nz of [2, 10, 18, 36, 54, 86, 118]) { if (nz < state.Z) coreZ = nz; }

    if (m === "all") {
      state.visible = new Set(conf.map((s) => s.lab));
    } else if (m === "new") {
      state.visible = new Set(conf.filter((s) => s.start + s.occ > coreZ).map((s) => s.lab));
    } else if (m === "core") {
      state.visible = new Set(conf.filter((s) => s.start + s.occ <= coreZ).map((s) => s.lab));
    }
    if (state.visible.size === 0) state.visible = new Set(conf.map((s) => s.lab));
    state.orbital = null;
    renderLayers();
    renderMain();
  });

  $("optSlice").addEventListener("change", (e) => { state.slice = e.target.checked; renderMain(); });
  $("optNew").addEventListener("change", (e) => { state.highlight = e.target.checked; renderMain(); });
  $("optRel").addEventListener("change", (e) => {
    state.relativistic = e.target.checked;
    if (state.heat === "radius") renderPeriodicTable();
    renderLayers();
    renderGallery();
    renderMain();
  });
  $("ptHeat").addEventListener("change", (e) => {
    state.heat = e.target.value;
    renderPeriodicTable();
  });
  $("btnExportPNG").addEventListener("click", () => {
    const el = A.ELEMENTS[state.Z - 1];
    const name = state.orbital
      ? `${el.sym}_${state.orbital.n}${A.LCH[state.orbital.l]}.png`
      : `${el.sym}_Z${state.Z}.png`;
    mainV.exportPNG(name, { transparent: true, scale: 2 });
  });
  $("optQty").addEventListener("change", (e) => { state.qty = e.target.value; renderMain(); });
  $("optContour").addEventListener("change", (e) => { state.contours = e.target.checked; renderMain(); });

  // ---------- Barra de herramientas de vistas y escala ----------
  function segOn(id, attr, val) {
    document.querySelectorAll(`#${id} button`).forEach((b) => b.classList.toggle("on", b.dataset[attr] === val));
  }

  $("segView").addEventListener("click", (e) => {
    const v = e.target.closest("button")?.dataset.v;
    if (!v) return;
    state.view = v; $("stage").dataset.view = v; segOn("segView", "v", v);
    renderLayers(); renderMain();
  });

  $("segScale").addEventListener("click", (e) => {
    const s = e.target.closest("button")?.dataset.s;
    if (!s) return;
    state.scale = s; segOn("segScale", "s", s);
    renderLayers(); renderMain();
  });

  $("spin").addEventListener("input", (e) => { Viewer.speed = +e.target.value; });
  $("pause").addEventListener("click", () => {
    Viewer.paused = !Viewer.paused; $("pause").textContent = Viewer.paused ? "▶" : "⏸";
  });

  // ---------- Visor principal (3D / Field / Radial) ----------
  function renderMain() {
    const el = A.ELEMENTS[state.Z - 1];
    const o = state.orbital;
    $("back").hidden = !o;

    document.querySelectorAll(".mini").forEach((m) => {
      m.classList.toggle("on", !!o && +m.dataset.n === o.n && +m.dataset.l === o.l && +m.dataset.i === o.i);
    });

    $("main").hidden = state.view !== "cloud";
    $("field").hidden = state.view !== "field";
    $("radial").hidden = state.view !== "radial";

    if (o) {
      if (state.view === "cloud") {
        mainV.slice = 0;
        const req = Viewer.genCloudAsync(
          { type: "orbital", n: o.n, l: o.l, i: o.i, N: 30000 },
          () => A.genOrbital(o.n, o.l, o.i, 30000),
          (groups, id, latest) => { if (id === latest && state.view === "cloud" && state.orbital) mainV.setCloud(groups); }
        );
      } else if (state.view === "field") {
        const pl = A.bestPlane(o.l, o.i);
        const rad = A.radial(o.n, o.l);
        fieldV.show({
          key: `orb_${o.n}_${o.l}_${o.i}`,
          type: "orbital",
          n: o.n, l: o.l, i: o.i,
          plane: pl,
          E: rad.r99 * 1.1,
          contours: state.contours
        });
      } else if (state.view === "radial") {
        const rad = A.radial(o.n, o.l);
        radialP.show({
          curves: [{
            label: `${o.n}${A.LCH[o.l]}`,
            color: A.LCOLOR[o.l],
            dim: false,
            P: A.orbitalP(o.n, o.l)
          }],
          E: rad.r99 * 1.05,
          mapping: "linear",
          total: false
        });
      }

      $("info").innerHTML = `<div class="big">${o.n}${A.ANGNAME[o.l][o.i]}</div>
        n = ${o.n} (capa) · l = ${o.l} (tipo ${A.LCH[o.l]}) · uno de ${2 * o.l + 1} orbitales ${o.n}${A.LCH[o.l]} · cabe(n) 2 e⁻<br>
        Nodos radiales: <b>${o.n - o.l - 1}</b> · Superficies nodales angulares: <b>${o.l}</b><br>
        <span class="legend"><i style="background:#4dabf7"></i>fase + <i style="background:#ff922b"></i>fase −</span>`;
      return;
    }

    if (state.view === "cloud") {
      mainV.slice = state.slice ? 0.06 : 0;
      const pts = state.slice ? 160000 : 40000;
      const atomOpts = {
        scale: state.scale,
        visible: Array.from(state.visible),
        highlightNew: state.highlight,
        relativistic: state.relativistic,
        points: pts,
      };
      Viewer.genCloudAsync(
        { type: "atom", kOrZ: state.Z, opts: atomOpts },
        () => A.genAtom(state.Z, { ...atomOpts, visible: state.visible }),
        (groups, id, latest) => { if (id === latest && state.view === "cloud" && !state.orbital) mainV.setCloud(groups); }
      );
    } else if (state.view === "field") {
      const shells = A.atomShells(state.Z, state.visible, { relativistic: state.relativistic });
      const maxR = Math.max(...shells.map(s => s.rmax), 5);
      fieldV.show({
        key: `atom_${state.Z}_${state.scale}_${state.qty}_${state.relativistic ? 1 : 0}_${Array.from(state.visible).join("-")}`,
        type: "atom",
        shells: shells,
        qty: state.qty,
        mapping: state.scale === "real" ? "linear" : "sqrt",
        E: maxR * 1.05,
        contours: state.contours
      });
    } else if (state.view === "radial") {
      const shells = A.atomShells(state.Z, state.visible, { relativistic: state.relativistic });
      const maxR = Math.max(...shells.map(s => s.rmax), 5);
      radialP.show({
        curves: shells.map(s => ({
          label: s.s.lab,
          color: A.LCOLOR[s.s.l],
          dim: state.highlight && s.core,
          P: s.P
        })),
        E: maxR * 1.05,
        mapping: state.scale === "real" ? "linear" : "sqrt",
        total: true
      });
    }

    let coreZ = 0;
    for (const nz of [2, 10, 18, 36, 54, 86, 118]) { if (nz < state.Z) coreZ = nz; }
    const coreSym = coreZ ? A.ELEMENTS[coreZ - 1].sym : null;

    $("info").innerHTML = `<div class="big">${el.name} (${el.sym}) · Z = ${el.Z} ${el.isNoble ? '<span class="noble-badge">Gas Noble</span>' : ""}</div>
      <div class="conf">${A.elementConfigString(state.Z, true)}</div>
      <div class="dim">${A.elementConfigString(state.Z, false)}</div>
      <span class="legend"><i style="background:${A.LCOLOR[0]}"></i>s <i style="background:${A.LCOLOR[1]}"></i>p <i style="background:${A.LCOLOR[2]}"></i>d <i style="background:${A.LCOLOR[3]}"></i>f
      ${state.highlight && coreSym ? `<i style="background:#8b949e"></i>carozo de [${coreSym}]` : ""}</span>
      <span class="dim"> · ${state.scale === "real" ? "escala real (Slater)" : "escala didáctica: capas en anillos separados"}</span>`;
  }

  $("back").addEventListener("click", () => { state.orbital = null; renderMain(); });

  // ---------- Galería: subcapas de valencia / activas del elemento ----------
  function renderGallery() {
    const Z = state.Z, el = A.ELEMENTS[Z - 1];
    let coreZ = 0;
    for (const nz of [2, 10, 18, 36, 54, 86, 118]) { if (nz < Z) coreZ = nz; }
    const conf = A.elementConfig(Z);
    const valenceSubs = conf.filter((s) => s.start + s.occ > coreZ);
    const prevSym = coreZ ? A.ELEMENTS[coreZ - 1].sym : null;
    const valElectrons = valenceSubs.reduce((a, s) => a + s.occ, 0);

    const rad = A.slaterRadius(Z, { relativistic: state.relativistic });
    const ie1 = A.IE1[Z - 1];
    const en = A.PAULING_EN[Z - 1];
    let relNote = "";
    if (Z > 70) {
      const sFac = (A.relFactor(Z, 0) * 100 - 100).toFixed(0);
      const dFac = (A.relFactor(Z, 2) * 100 - 100).toFixed(0);
      const extra = Z === 79
        ? " En el <b>oro (Au)</b>, la contracción del 6s y expansión del 5d estrechan la brecha 5d→6s hasta el azul (~2.4 eV), ¡por eso absorbe azul y refleja amarillo dorado!"
        : Z === 80
        ? " En el <b>mercurio (Hg)</b>, el par 6s² se contrae y estabiliza tanto que apenas forma enlaces metálicos: por eso es líquido a temperatura ambiente."
        : "";
      relNote = `<div class="formula" style="border-left:3px solid #f0c000; padding-left:8px; margin-top:6px;">
        <b>Efectos relativistas (Z=${Z} &gt; 70):</b> orbitales <i>s</i> ${sFac}% (contracción directa, v/c ≈ ${(Z/137.036).toFixed(2)}); <i>d</i> +${dFac}% (expansión indirecta).${extra}
      </div>`;
    }

    let h = `<h2>Electrones de valencia de ${el.name} (${el.sym})</h2>
      <div class="formula">
        ${prevSym ? `[${prevSym}] (${coreZ} e⁻) + <b>${valElectrons} e⁻</b> = <b>${Z} e⁻</b> total` : `<b>${Z} e⁻</b> (capa 1)`}<br>
        Configuración externa: ${valenceSubs.map((s) => `<b>${s.lab}<sup>${s.occ}</sup></b>`).join(" ")}<br>
        <small>Radio Slater: <b>${rad.rAngstrom.toFixed(2)} Å</b> · IE₁: <b>${ie1.toFixed(2)} eV</b> · χ Pauling: <b>${en !== null ? en.toFixed(2) : "—"}</b></small>
      </div>${relNote}`;

    valenceSubs.forEach((s) => {
      h += `<div class="sub" style="border-color:${A.LCOLOR[s.l]}">
        <h3>${s.lab} <span>· ocupación: ${s.occ} / ${s.cap} electrones (${s.norb} orbitales)</span></h3>
        <div class="gallery">`;
      for (let i = 0; i < s.norb; i++) {
        const occThisOrb = (s.occ > i ? 1 : 0) + (s.occ > s.norb + i ? 1 : 0);
        h += `<div class="mini" data-n="${s.n}" data-l="${s.l}" data-i="${i}">
          <canvas></canvas>
          <div class="mini-label">${s.n}${A.ANGNAME[s.l][i]}</div>
          <div class="mini-occ">${occThisOrb === 2 ? "↑↓" : occThisOrb === 1 ? "↑" : "—"}</div>
        </div>`;
      }
      h += `</div></div>`;
    });

    $("newcard").innerHTML = h;

    document.querySelectorAll(".mini").forEach((m) => {
      const v = new Viewer(m.querySelector("canvas"), { interactive: false, axes: false, fill: 0.42, spin: 0.006, pointSize: 1.3 });
      v.setCloud(A.genOrbital(+m.dataset.n, +m.dataset.l, +m.dataset.i, 3500));
      m.addEventListener("click", () => {
        state.orbital = { n: +m.dataset.n, l: +m.dataset.l, i: +m.dataset.i };
        renderMain();
      });
    });
  }

  // ---------- Selección de Elemento ----------
  function selectElement(z) {
    state.Z = Math.max(1, Math.min(118, z));
    state.orbital = null;
    const conf = A.elementConfig(state.Z);
    state.visible = new Set(conf.map((s) => s.lab));

    const el = A.ELEMENTS[state.Z - 1];
    history.replaceState(null, "", "#" + el.sym);

    $("sliderZ").value = state.Z;
    $("elemSelect").value = state.Z;

    // Resaltar celda en la tabla periódica
    document.querySelectorAll(".pt-cell").forEach((b) => {
      b.classList.toggle("on", +b.dataset.z === state.Z);
    });

    renderLayers();
    renderGallery();
    renderMain();
  }

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (e.key === "ArrowRight") selectElement(state.Z + 1);
    if (e.key === "ArrowLeft") selectElement(state.Z - 1);
  });

  // Lectura del hash (#He, #Fe, #Au, #118...)
  function initFromHash() {
    renderPeriodicTable();
    let initialZ = 2; // Default Helio
    const hash = location.hash.replace("#", "").trim();
    if (hash) {
      const bySym = A.ELEMENTS.findIndex((el) => el.sym.toLowerCase() === hash.toLowerCase());
      if (bySym >= 0) initialZ = bySym + 1;
      else if (!isNaN(+hash) && +hash >= 1 && +hash <= 118) initialZ = +hash;
    }
    selectElement(initialZ);
  }

  window.addEventListener("hashchange", () => {
    const hash = location.hash.replace("#", "").trim();
    const bySym = A.ELEMENTS.findIndex((el) => el.sym.toLowerCase() === hash.toLowerCase());
    if (bySym >= 0 && bySym + 1 !== state.Z) selectElement(bySym + 1);
  });

  initFromHash();
})();
