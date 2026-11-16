# Orbitales y gases nobles

Tres simulaciones interactivas (HTML + JavaScript, sin dependencias ni build) para entender **por qué los gases nobles tienen 2, 10, 18, 36, 54, 86 y 118 electrones** y **cómo sus electrones externos emiten luz**.

## Las tres vistas

| Página | Qué muestra |
|---|---|
| [`index.html`](index.html) | **Llenado electrónico**: el átomo se llena electrónon por electrónon (slider 0–118 e⁻, botones −1/+1, "siguiente gas noble", animación). Tabla de periodos con cajitas de orbitales, configuración con carozo [gas noble], y visor 3D del orbital del último electrón o del átomo completo. Archivo único autocontenido. |
| [`orbitales.html`](orbitales.html) | **Gases nobles por pestañas** (He…Og): nube 3D del átomo, **campo de densidad** 2D (mapa de \|ψ\|² con contornos y escala en pm) y **distribución radial** P(r). Escala didáctica (capas en anillos) o real (Slater), control de giro, "pelar la cebolla" por capas y galería de orbitales del periodo. Usa los módulos de `js/`. |
| [`espectro.html`](espectro.html) | **Espectro de emisión**: líneas espectrales reales del átomo neutro (NIST ASD, 250–1050 nm) sobre el arcoíris del visible, diagrama de niveles tipo Grotrian agrupado por tipo de orbital, y **simulación de excitación/emisión**: se excita un electrón externo y se anima la cascada de fotones emitidos (ΔE = hc/λ). Pestañas He…Og; Og no tiene datos (átomo de vida ~1 ms, espectro solo predicho). |

Las tres comparten la misma física: soluciones exactas del hidrógeno, regla de Madelung (*n + l*) y los mismos colores de orbital (s rojo, p amarillo, d azul, f verde); cada una enfatiza una forma distinta de ver el mismo fenómeno.

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
- **Limitaciones:** sin efectos relativistas (importantes en Rn y Og) ni correlación; el orden de llenado es el ideal (Cr, Cu, La… se exceptúan). Oganesón no tiene espectro medido (solo predicciones teóricas); radón tiene pocas líneas confirmadas.

## Estructura

```
index.html        llenado electrónico — autocontenido
orbitales.html    gases nobles — pestañas + 3 vistas
espectro.html     espectro de emisión + diagrama de niveles + simulación
css/style.css     estilos de orbitales.html y espectro.html
js/physics.js     orbitales, configuraciones, Slater, muestreo (también corre en Node)
js/viewer.js      visor 3D en canvas 2D
js/field.js       campo de densidad y distribución radial
js/app.js         lógica de la interfaz de orbitales.html
js/specdata.js    líneas espectrales NIST por gas noble
js/espectro.js    espectro, diagrama de niveles y cascada de emisión
                    (funciones puras exportadas para pruebas en Node)
tests/check.js    pruebas de la física: node tests/check.js
```

## Publicar en la web

En GitHub: *Settings → Pages → Deploy from branch → main / root*. Queda en `https://alrobles.github.io/atomic-simulation/` (y `…/orbitales.html`, `…/espectro.html`).
