# Orbitales y gases nobles

Cuatro simulaciones interactivas (HTML + JavaScript, sin dependencias ni build): tres sobre la estructura electrónica de los gases nobles —**por qué tienen 2, 10, 18, 36, 54, 86 y 118 electrones** y **cómo emiten luz**— y dos sobre el destino de la materia: la **fusión nuclear del Sol** y el **ciclo de vida completo de una estrella**.

## Las cinco vistas

| Página | Qué muestra |
|---|---|
| [`index.html`](index.html) | **Llenado electrónico**: el átomo se llena electrónon por electrónon (slider 0–118 e⁻, botones −1/+1, "siguiente gas noble", animación). Tabla de periodos con cajitas de orbitales, configuración con carozo [gas noble], y visor 3D del orbital del último electrón o del átomo completo. Archivo único autocontenido. |
| [`orbitales.html`](orbitales.html) | **Gases nobles por pestañas** (He…Og): nube 3D del átomo, **campo de densidad** 2D (mapa de \|ψ\|² con contornos y escala en pm) y **distribución radial** P(r). Escala didáctica (capas en anillos) o real (Slater), control de giro, "pelar la cebolla" por capas y galería de orbitales del periodo. Usa los módulos de `js/`. |
| [`espectro.html`](espectro.html) | **Espectro de emisión**: líneas espectrales reales del átomo neutro (NIST ASD, 250–1050 nm) sobre el arcoíris del visible, diagrama de niveles tipo Grotrian agrupado por tipo de orbital, y **simulación de excitación/emisión**: se excita un electrón externo y se anima la cascada de fotones emitidos (ΔE = hc/λ). Pestañas He…Og; Og no tiene datos (átomo de vida ~1 ms, espectro solo predicho). |
| [`fusion.html`](fusion.html) | **Fusión nuclear (cadena pp)**: plasma 2D del núcleo solar con p⁺, d, ³He y ⁴He. Las reacciones `p+p→d`, `d+p→³He` y `³He+³He→⁴He` ocurren con probabilidades ∝ exp(−τ·T^−⅓) (ventana de Gamow, cualitativa). Control de temperatura (0.3–5 keV ≈ 3–58 MK), contadores de ⁴He y energía liberada, equivalencia E=mc² y registro de eventos. |
| [`estrella.html`](estrella.html) | **Ciclo de vida estelar**: slider de masa inicial (0.5–30 M☉) que determina el destino. La estrella evoluciona por fases (secuencia principal → gigante → quemado de He → destino) dibujando su trayectoria en el **diagrama H–R** en vivo: color y tamaño reales por T y R. Enanas marrones, enanas blancas, estrellas de neutrones y agujeros negros. |

Las cuatro comparten la misma física: soluciones exactas del hidrógeno, regla de Madelung (*n + l*) y los mismos colores de orbital (s rojo, p amarillo, d azul, f verde); cada una enfatiza una forma distinta de ver el mismo fenómeno. `fusion.html` amplía el proyecto del átomo al núcleo.

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

## index.html en detalle

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
- **Fusión:** cadena pp con energías Q reales (1.44 / 5.49 / 12.86 MeV → 26.73 MeV netos por ⁴He, Δm = 0.0287 u). El positrón se aniquila (~1.02 MeV extra) y el neutrino escapa sin interactuar. Las tasas de reacción son **cualitativas** (forma de Gamow exp(−τ·T^−⅓) calibrada para visualización): la tasa real depende también de densidad y del factor S nuclear; la física de 2 cuerpos y la conservación del momento sí se respetan.
- **Limitaciones:** sin efectos relativistas (importantes en Rn y Og) ni correlación; el orden de llenado es el ideal (Cr, Cu, La… se exceptúan). Oganesón no tiene espectro medido (solo predicciones teóricas); radón tiene pocas líneas confirmadas.

## Estructura

```
index.html        llenado electrónico — autocontenido
orbitales.html    gases nobles — pestañas + 3 vistas
ezpectro.html     espectro de emisión + diagrama de niveles + simulación
fusion.html       cadena pp — plasma, fusiones y balance E=mc²
estrella.html     ciclo de vida estelar — H–R + destinos por masa
css/style.css     estilos de orbitales.html y espectro.html
js/physics.js     orbitales, configuraciones, Slater, muestreo (también corre en Node)
js/viewer.js      visor 3D en canvas 2D
js/field.js       campo de densidad y distribución radial
js/app.js         lógica de la interfaz de orbitales.html
js/specdata.js    líneas espectrales NIST por gas noble
js/espectro.js    espectro, diagrama de niveles y cascada de emisión
                    (funciones puras exportadas para pruebas en Node)
js/fusion.js      cadena pp: plasma, fusiones, balance de energía
                    (funciones puras exportadas para pruebas en Node)
js/estrella.js    fases estelares + diagrama H–R (modelo esquemático)
tests/check.js    pruebas de la física: node tests/check.js
```

## Publicar en la web

En GitHub: *Settings → Pages → Deploy from branch → main / root*. Queda en `https://alrobles.github.io/atomic-simulation/` (y `…/orbitales.html`, `…/espectro.html`, `…/fusion.html`, `…/estrella.html`).
