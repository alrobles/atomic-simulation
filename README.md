# Orbitales y gases nobles

Doce visualizaciones interactivas (HTML + JavaScript, sin dependencias ni build) más su portada: sobre la estructura electrónica —**por qué los gases nobles tienen 2, 10, 18, 36, 54, 86 y 118 electrones**, la misma vista abierta a cualquier elemento de la tabla periódica, **cómo emiten luz** y por qué un estado puro no irradia—, sobre el enlace y la materia —hibridación, orbitales moleculares, la molécula de agua y sus fases—, sobre el núcleo (fusión solar y colisionador de elementos superpesados) y las estrellas, y una sobre la historia de los modelos y la ecuación de Dirac.

> **Repositorio hermano (química orgánica):** [molecular-simulation](https://github.com/alrobles/molecular-simulation) ([demo en vivo](https://alrobles.github.io/molecular-simulation/)) continúa la escala desde el enlace covalente hacia reacciones orgánicas, empezando por la combustión del metano en cadena de radicales.

## Las vistas

| Página | Qué muestra |
|---|---|
| [`index.html`](index.html) | **Portada**: el proyecto como una cadena de seis actos (átomo → luz → núcleo y ciclotrón → estrella → química → más allá). Sobre el título gira una nube real de orbital (cicla 1s → 2p → 3d → 4f, calculada con `js/physics.js`), cada tarjeta enseña una pieza, el espectro de emisión se dibuja al vuelo con las líneas del NIST y hay tres rutas de entrada según el tiempo disponible. Enlaza las doce vistas. |
| [`llenado.html`](llenado.html) | **Llenado electrónico**: el átomo se llena electrón por electrón (slider 0–118 e⁻, botones −1/+1, "siguiente gas noble", animación). Tabla de periodos con cajitas de orbitales, configuración con carozo [gas noble], y visor 3D del orbital del último electrón o del átomo completo. Archivo único autocontenido. |
| [`orbitales.html`](orbitales.html) | **Gases nobles por pestañas** (He…Og): nube 3D del átomo, **campo de densidad** 2D (mapa de \|ψ\|² con contornos y escala en pm) y **distribución radial** P(r). Escala didáctica (capas en anillos) o real (Slater), control de giro, "pelar la cebolla" por capas y galería de orbitales del periodo. En la vista por defecto carga una **nube precalculada** de 200k puntos (`data/clouds/`); cualquier cambio de escala/capas/resaltado regenera en vivo vía worker. Usa los módulos de `js/`. |
| [`orbitales_all.html`](orbitales_all.html) | **Cualquier elemento, Z = 1…118**: la misma vista de orbitales con tabla periódica en vez de pestañas fijas — nube 3D, campo de densidad y distribución radial del elemento que elijas, con su configuración electrónica y su Z<sub>ef</sub>. Comparte `css/style.css` con `orbitales.html`. |
| [`espectro.html`](espectro.html) | **Espectro de emisión**: líneas espectrales reales del átomo neutro (NIST ASD, 250–1050 nm) sobre el arcoíris del visible, diagrama de niveles tipo Grotrian agrupado por tipo de orbital, y **simulación de excitación/emisión**: se excita un electrón externo y se anima la cascada de fotones emitidos (ΔE = hc/λ). Pestañas He…Og; Og no tiene datos (átomo de vida ~1 ms, espectro solo predicho). |
| [`fusion.html`](fusion.html) | **Fusión nuclear (cadena pp)**: plasma 2D del núcleo solar con p⁺, d, ³He y ⁴He, repulsión coulombiana suave, pico real de Gamow P(E) (E<sub>G</sub> = 493.1 keV) y tasa vs T. Control de temperatura (0.3–5 keV ≈ 3–58 MK), inyección de combustible, contadores de ⁴He y equivalencia E=mc². |
| [`colisionador.html`](colisionador.html) | **Colisionador de elementos artificiales**: síntesis de elementos superpesados por fusión de iones pesados (Fl 114, Mc 115, Lv 116, Ts 117, **Og 118**, Nh 113 por fusión fría 1n, frontera Z=120 y modo libre haz+blanco). Potencial real de Bass (1980) + Coulomb, trayectorias RK4, cuasifisión vs evaporación xn, función de excitación σ<sub>xn</sub>(E<sub>cm</sub>) en picobarns, detector de silicio con cadenas de desintegración α y mapa (N, Z) de la Isla de Estabilidad. |
| [`estrella.html`](estrella.html) | **Ciclo de vida estelar**: slider de masa inicial (0.5–30 M☉) que determina el destino. La estrella evoluciona por fases (secuencia principal → gigante → quemado de He → destino) dibujando su trayectoria en el **diagrama H–R** en vivo: color y tamaño reales por T y R. Enanas marrones, enanas blancas, estrellas de neutrones y agujeros negros. |
| [`agua.html`](agua.html) | **Molécula de agua**: modelo 3D interactivo con geometría angular (104.5°), enlaces O–H, cargas parciales, dipolo y control para explorar el ángulo. Vista de **densidad electrónica real** (50,000 muestras de ρ(r) calculada con Hartree-Fock/STO-3G en PySCF, `data/h2o_density.bin`; si falta el archivo, cae a un esquema ilustrativo), vista de **orbitales moleculares** con isosuperficies \|ψ\|=const de HOMO-1/HOMO/LUMO (`data/mo_*.bin`, fases azul/naranja) y animación de los tres modos normales de vibración. |
| [`estados-agua.html`](estados-agua.html) | **Agua en varios estados**: dinámica molecular 2D cualitativa de moléculas rígidas H₂O con recuento adaptativo (54–180) y preajustes de sólido, líquido y gas. Interacciones efectivas de corto alcance y puentes de hidrógeno orientacionales; las fases arrancan desde **snapshots equilibrados offline** (400k pasos, `overnight/md/`) y una gráfica muestra la respuesta del modelo a T* (`overnight/md/sweep.json`). |
| [`superposicion.html`](superposicion.html) | **Superposición temporal Ψ(r⃗, t)**: un estado puro es estacionario y no irradia; durante una transición el electrón está en superposición y el término cruzado hace oscilar la nube a la frecuencia de Bohr ω = (E₂−E₁)/ℏ. Corte de la densidad en el plano xz con presets (Lyman α, Balmer, monopolar 1s↔2s), control de mezcla y la flecha del dipolo ⟨z⟩(t). |
| [`quimica.html`](quimica.html) | **Hibridación y enlace (LCAO-MO)**: esquema interactivo de hibridación sp, sp², sp³, sp³d y sp³d² con sus lóbulos direccionales, y orbitales moleculares σ₁ₛ / σ₁ₛ* de H₂⁺ frente a la distancia internuclear R, con la curva de energía y el mínimo de equilibrio. |
| [`dirac.html`](dirac.html) | **De Thomson a Dirac y el Modelo Estándar**: línea del tiempo de los modelos del átomo (qué explicaba cada uno y en qué fallaba) y simulador de Dirac de dos partículas en el espacio de configuración (x₁, x₂) — exclusión de Pauli, positronio y barrera de Klein — con integrador split-step FFT de 4 componentes espinoriales que conserva ∫\|Ψ\|² = 1. |

Las visualizaciones atómicas comparten la física de orbitales y la regla de Madelung (*n + l*). `superposicion.html` explica el mecanismo de la emisión (la nube oscilando entre dos orbitales), `quimica.html` lleva el orbital a la molécula —hibridación y orbitales moleculares— y `dirac.html` cierra el recorrido con la historia de los modelos y la ecuación de Dirac. `agua.html` amplía el tema a una molécula, con un esquema VSEPR claramente distinguido de un cálculo cuántico molecular; `estados-agua.html` muestra cómo las interacciones efectivas entre muchas moléculas producen comportamientos colectivos. `fusion.html` y `estrella.html` conectan la estructura de la materia con el núcleo y la evolución estelar.

## orbitales.html en detalle

| Elemento | Qué muestra |
|---|---|
| Pestañas He … Og | Elige el gas noble (flechas ← → y anclas `orbitales.html#Kr`) |
| ☁ Nube 3D | El átomo completo, cada subcapa de su color (s rojo, p amarillo, d azul, f verde); lo heredado del gas noble anterior en gris |
| ▦ Campo de densidad | Mapa de densidad en un plano (inferno, escala log opcional, contornos, zoom con rueda) |
| 📈 Distribución radial | P(r) = 4πr²ρ por capa u orbital |
| Escala Didáctica/Real | Didáctica: capa *n* en su anillo. Real: tamaño hidrogenoide ÷ Z<sub>ef</sub> (reglas de Slater) |
| Capas | Activa o desactiva subcapas para "pelar" el átomo |
| Galería | Todos los orbitales del periodo (s, p, d, f en todas sus orientaciones); clic para verlo en grande con fases y nodos |

## llenado.html en detalle

| Elemento | Qué muestra |
|---|---|
| Slider / −1 e⁻ / +1 e⁻ | Llena el átomo de 0 a 118 electrones |
| ⏭ siguiente gas noble · ▶ animar | Salta al cierre de capa o llena solo |
| Un orbital / Átomo completo | El orbital del último electrón (con sus nodos) o todas las capas ocupadas |
| Visor 3D | Nube de puntos de \|ψ\|²; arrastra para girar, rueda para zoom |

## La física

- **Formas de los orbitales:** soluciones exactas del hidrógeno, ψ = R<sub>nl</sub>(r)·Y<sub>lm</sub>(θ,φ), con armónicos esféricos reales y polinomios de Laguerre. Muestreo de |ψ|²: radial por inversión de la CDF y angular por rechazo.
- **Llenado:** regla de Madelung (*n + l*). Cada periodo empieza con *ns* y termina con *np*; después de cada p viene un salto de energía que cierra la fila.
- **Cargos nucleares efectivos:** reglas de Slater (solo en `orbitales.html`, escala "real").
- **Espectros:** líneas del átomo neutro tomadas de la base NIST Atomic Spectra Database (Kramida et al., ASD v5.12, DOI 10.18434/T4W30F); energías de nivel en cm⁻¹, ΔE = hc/λ. La excitación/emisión se simula con un modelo simplificado: la cascada sigue la transición más intensa disponible desde cada nivel, sin probabilidades de Einstein ni ensanchamiento.
- **Fusión:** cadena pp con energías Q reales (1.44 / 5.49 / 12.86 MeV → 26.73 MeV netos por ⁴He, Δm = 0.0287 u). El positrón se aniquila (~1.02 MeV extra) y el neutrino escapa sin interactuar — aunque su energía **sí** entra en el balance: el contador suma el Q completo (26.7 MeV) y por eso cuadra con el Δm·c²; lo que calienta el plasma es ~26.2 MeV. Las tasas de reacción son **cualitativas** (forma de Gamow exp(−τ·T^−⅓) calibrada para visualización): la tasa real depende también de densidad y del factor S nuclear; la física de 2 cuerpos y la conservación del momento sí se respetan.
- **Limitaciones:** la tabla periódica completa (`orbitales_all.html`) incluye una corrección relativista aproximada opcional para Z > 70, mientras que `orbitales.html` no la aplica; sin correlación electrónica, y el orden de llenado es el ideal (Cr, Cu, La… se exceptúan). Oganesón no tiene espectro medido (solo predicciones teóricas); radón tiene pocas líneas confirmadas.

## Estructura

```
index.html        portada — la cadena de vistas y por dónde empezar
llenado.html      llenado electrónico paso a paso — autocontenido
orbitales.html    gases nobles — pestañas + 3 vistas
orbitales_all.html  tabla periódica completa — la misma vista para Z = 1…118
espectro.html     espectro de emisión + diagrama de niveles + efecto Zeeman
superposicion.html  superposición temporal Ψ(r,t) — el dipolo que emite
fusion.html       cadena pp — plasma, pico real de Gamow y balance E=mc²
colisionador.html colisionador de superpesados — Bass, cuasifisión, σ(E) en pb y cadenas α
estrella.html     ciclo de vida estelar — H–R + destinos por masa
quimica.html      hibridación (sp…sp³d²) y enlace LCAO-MO
agua.html         molécula de agua — geometría, densidad RHF y orbitales MO
estados-agua.html H₂O en 2D — interacciones, puentes H, estados y temperatura
dirac.html        de Thomson a Dirac — historia + simulador de 2 partículas
css/style.css     estilos de orbitales, orbitales_all, quimica, superposicion y dirac
js/physics.js     orbitales, configuraciones, Slater, muestreo (también corre en Node)
js/viewer.js      visor 3D en canvas 2D
js/field.js       campo de densidad y distribución radial
js/app.js         lógica de la interfaz de orbitales.html
js/app_all.js     lógica de la interfaz de orbitales_all.html
js/specdata.js    líneas espectrales NIST por gas noble
data/             artefactos precalculados: h2o_density.bin (ρ RHF/STO-3G),
                  h2o_info.json, mo_{homo1,homo,lumo}_{pos,neg}.bin
                  (isosuperficies MO, coordenadas en Å) y clouds/ (nubes de
                  átomos uint16)
overnight/         scripts de cómputo local que regeneran los artefactos
js/espectro.js    espectro, diagrama de niveles y cascada de emisión
                    (funciones puras exportadas para pruebas en Node)
js/fusion.js      cadena pp: plasma, pico de Gamow, fusiones y balance de energía
                    (funciones puras exportadas para pruebas en Node)
js/colisionador.js  colisionador de iones pesados: Bass, P_CN, Jackson σ_xn, RK4 y cadenas α
                    (funciones puras exportadas para pruebas en Node)
js/estrella.js    fases estelares + diagrama H–R (modelo esquemático)
js/agua.js        geometría H₂O, modos vibratorios y visor 3D
js/estados-agua.js dinámica H₂O rígida en 2D, con búsqueda local de vecinos
js/chemistry.js   hibridación y orbitales moleculares LCAO
                    (funciones puras exportadas para pruebas en Node)
js/quimica.js     interfaz de la vista de hibridación y LCAO-MO
js/superposicion.js  superposición temporal Ψ(r,t) y dipolo oscilante
                    (funciones puras exportadas para pruebas en Node)
js/dirac.js       historia de los modelos + integrador de Dirac (split-step FFT)
                    (funciones puras exportadas para pruebas en Node)
js/cloud-worker.js  genera las nubes de puntos fuera del hilo principal
tests/check.js    pruebas de la física: npm test (o node tests/check.js)
```

Las páginas de portada, espectro, fusión, estrella y agua llevan su CSS en la propia página; `css/style.css` lo usan `orbitales`, `orbitales_all`, `quimica`, `superposicion` y `dirac`, que además añaden sus propios estilos en la página. La portada usa `js/physics.js` (nube real del hero y de la tarjeta de orbitales) y `js/specdata.js` (líneas del NIST) sin duplicar física.

## Pruebas

`tests/check.js` comprueba, sin dependencias ni navegador, la física de los módulos que exportan funciones puras: configuraciones y tamaños de periodo, reglas de Slater y ⟨r⟩ hidrogenoide, integrales de P(r) = electrones de cada subcapa, coherencia de las 660 líneas NIST (λ = 1e7/ΔE), validez del color espectral fuera del visible, invariancias del diagrama de niveles y de la cascada, y la contabilidad de energía de la cadena pp.

```
npm test          # o: node tests/check.js
```

Se ejecuta en cada push con GitHub Actions (`.github/workflows/test.yml`).

Los módulos que solo corren en el navegador (`viewer.js`, `field.js`, `app.js`, `app_all.js`, `estrella.js`, `agua.js`, `estados-agua.js`, `quimica.js`, `cloud-worker.js`) todavía no tienen pruebas de comportamiento: el CI les comprueba al menos la sintaxis en cada push.

## Licencia

MIT — ver [`LICENSE`](LICENSE). © 2026 Ángel Luis Robles Fernández.

## Publicar en la web

Está publicado con GitHub Pages en `https://alrobles.github.io/atomic-simulation/` (portada) y `…/llenado.html`, `…/orbitales.html`, `…/orbitales_all.html`, `…/espectro.html`, `…/superposicion.html`, `…/fusion.html`, `…/estrella.html`, `…/quimica.html`, `…/agua.html`, `…/estados-agua.html`, `…/dirac.html`, desde la rama `main`, raíz del repositorio (*Settings → Pages → Deploy from branch*).

Para probarlo en local basta un servidor estático: `python3 -m http.server 8080` y abrir `http://localhost:8080/`.
