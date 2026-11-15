/* app.js — Interfaz: pestañas de gases nobles, visor principal, galería de orbitales y patrón. */
(function () {
  "use strict";
  const A = window.Atom;
  const $ = (id) => document.getElementById(id);
  const ROOT = [1, 2, 2, 3, 3, 4, 4]; // tamaño del periodo = 2 × ROOT²

  const state = { k: 0, scale: "didactic", highlight: true, slice: true, visible: new Set(), orbital: null };
  const mainV = new Viewer($("main"), { fill: 0.38 });

  // ---------- Pestañas ----------
  function renderTabs() {
    let h = "";
    A.NOBLES.forEach((g, k) => {
      if (k) h += `<span class="step">+${g.Z - A.NOBLES[k - 1].Z}→</span>`;
      h += `<button class="tab ${k === state.k ? "on" : ""}" data-k="${k}"><b>${g.sym}</b><small>${g.Z} · ${g.name}</small></button>`;
    });
    $("tabs").innerHTML = h;
  }
  $("tabs").addEventListener("click", (e) => {
    const b = e.target.closest(".tab");
    if (b) selectNoble(+b.dataset.k);
  });

  // ---------- Capas ----------
  function renderLayers() {
    const g = A.NOBLES[state.k], conf = A.nobleConfig(state.k);
    $("layers").innerHTML = conf.map((s) => {
      const z = state.scale === "real" ? ` <small>Z<sub>ef</sub>=${A.zeff(g.Z, conf, s).toFixed(1)}</small>` : "";
      return `<label style="border-color:${A.LCOLOR[s.l]}"><input type="checkbox" data-lab="${s.lab}" ${state.visible.has(s.lab) ? "checked" : ""}> ${s.lab}${A.sup(s.cap)}${z}</label>`;
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
    const conf = A.nobleConfig(state.k);
    state.visible = new Set(conf.filter((s) => m === "all" || (m === "new") === (s.period === state.k)).map((s) => s.lab));
    if (state.visible.size === 0) state.visible = new Set(conf.map((s) => s.lab)); // He no tiene carozo
    state.orbital = null;
    renderLayers(); renderMain();
  });
  $("optSlice").addEventListener("change", (e) => { state.slice = e.target.checked; renderMain(); });
  $("optNew").addEventListener("change", (e) => { state.highlight = e.target.checked; renderMain(); });
  $("optReal").addEventListener("change", (e) => { state.scale = e.target.checked ? "real" : "didactic"; renderLayers(); renderMain(); });

  // ---------- Visor principal ----------
  function renderMain() {
    const g = A.NOBLES[state.k];
    const o = state.orbital;
    $("back").hidden = !o;
    document.querySelectorAll(".mini").forEach((m) => {
      m.classList.toggle("on", !!o && +m.dataset.n === o.n && +m.dataset.l === o.l && +m.dataset.i === o.i);
    });
    if (o) {
      mainV.slice = 0;
      mainV.setCloud(A.genOrbital(o.n, o.l, o.i, 30000));
      $("info").innerHTML = `<div class="big">${o.n}${A.ANGNAME[o.l][o.i]}</div>
        n = ${o.n} (capa) · l = ${o.l} (tipo ${A.LCH[o.l]}) · uno de ${2 * o.l + 1} orbitales ${o.n}${A.LCH[o.l]} · cabe(n) 2 e⁻<br>
        Nodos radiales (cáscaras vacías): <b>${o.n - o.l - 1}</b> · Superficies nodales angulares: <b>${o.l}</b><br>
        <span class="legend"><i style="background:#4dabf7"></i>fase + <i style="background:#ff922b"></i>fase −</span>`;
      return;
    }
    mainV.slice = state.slice ? 0.06 : 0;
    mainV.setCloud(A.genAtom(state.k, { scale: state.scale, visible: state.visible, highlightNew: state.highlight, points: state.slice ? 160000 : 40000 }));
    const prev = state.k ? A.NOBLES[state.k - 1] : null;
    $("info").innerHTML = `<div class="big">${g.name} (${g.sym}) · Z = ${g.Z}</div>
      <div class="conf">${A.configString(state.k, true)}</div>
      <div class="dim">${A.configString(state.k)}</div>
      <span class="legend"><i style="background:${A.LCOLOR[0]}"></i>s <i style="background:${A.LCOLOR[1]}"></i>p <i style="background:${A.LCOLOR[2]}"></i>d <i style="background:${A.LCOLOR[3]}"></i>f
      ${state.highlight && prev ? `<i style="background:#8b949e"></i>carozo de ${prev.sym}` : ""}</span>
      <span class="dim"> · ${state.scale === "real" ? "escala real (Slater)" : "escala didáctica: cada capa n en su propio anillo"}</span>`;
  }
  $("back").addEventListener("click", () => { state.orbital = null; renderMain(); });

  // ---------- Galería: lo que agrega este gas noble ----------
  function renderGallery() {
    const k = state.k, g = A.NOBLES[k], prev = k ? A.NOBLES[k - 1] : null;
    const subs = A.nobleConfig(k).filter((s) => s.period === k);
    const add = subs.reduce((a, s) => a + s.cap, 0);
    let h = `<h2>Periodo ${k + 1}: lo que agrega ${g.sym}</h2>
      <div class="formula">${subs.map((s) => `${s.lab}<sub>(${s.cap})</sub>`).join(" + ")} = ${subs.map((s) => s.cap).join(" + ")} = <b>${add}</b> electrones<br>
      ${prev ? `${prev.Z} (${prev.sym}) + ${add} = <b>${g.Z} (${g.sym})</b>` : `<b>2 (He)</b>: la primera capa solo tiene un orbital`}</div>`;
    subs.forEach((s) => {
      h += `<div class="sub" style="border-color:${A.LCOLOR[s.l]}"><h3>${s.lab} <span>· ${s.norb} orbital${s.norb > 1 ? "es" : ""} × 2 e⁻ = ${s.cap} electrones</span></h3><div class="gallery">`;
      for (let i = 0; i < s.norb; i++)
        h += `<div class="mini" data-n="${s.n}" data-l="${s.l}" data-i="${i}"><canvas></canvas>${s.n}${A.ANGNAME[s.l][i]}</div>`;
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

  // ---------- Patrón 2, 8, 8, 18, 18, 32, 32 ----------
  function renderPattern() {
    let h = `<h2>El patrón completo</h2>`;
    A.NOBLES.forEach((g, p) => {
      const subs = A.nobleConfig(p).filter((s) => s.period === p);
      const add = subs.reduce((a, s) => a + s.cap, 0);
      const cells = subs.map((s) => `<span class="blk" title="${s.lab}">${`<i class="c" style="background:${A.LCOLOR[s.l]}"></i>`.repeat(s.cap)}</span>`).join("");
      h += `<div class="prow ${p <= state.k ? "done" : ""} ${p === state.k ? "cur" : ""}" data-k="${p}">
        <span class="lab">${g.sym}</span><span class="cells">${cells}</span>
        <span class="sum"><b>+${add}</b> = 2×${ROOT[p]}² → <b>${g.Z}</b></span></div>`;
    });
    $("pattern").innerHTML = h;
  }
  $("pattern").addEventListener("click", (e) => {
    const r = e.target.closest(".prow");
    if (r) selectNoble(+r.dataset.k);
  });

  // ---------- Selección ----------
  function selectNoble(k) {
    state.k = Math.max(0, Math.min(A.NOBLES.length - 1, k));
    state.orbital = null;
    state.visible = new Set(A.nobleConfig(state.k).map((s) => s.lab));
    history.replaceState(null, "", "#" + A.NOBLES[state.k].sym);
    renderTabs(); renderLayers(); renderGallery(); renderPattern(); renderMain();
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") selectNoble(state.k + 1);
    if (e.key === "ArrowLeft") selectNoble(state.k - 1);
  });

  const fromHash = A.NOBLES.findIndex((g) => "#" + g.sym === location.hash);
  selectNoble(fromHash >= 0 ? fromHash : 0);
})();
