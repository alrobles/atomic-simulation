# Orbitales de los gases nobles

Simulación interactiva (HTML + JavaScript, sin dependencias) para entender **por qué los gases nobles tienen 2, 10, 18, 36, 54, 86 y 118 electrones**.

## Cómo usarla

Abre `index.html` en el navegador con doble clic. No necesita servidor ni internet.

| Elemento | Qué muestra |
|---|---|
| Pestañas He … Og | Elige el gas noble (también funcionan las flechas ← → y los enlaces del tipo `index.html#Kr`) |
| Visor 3D (izquierda) | El átomo completo, con cada subcapa de su color (s rojo, p amarillo, d azul, f verde). Lo heredado del gas noble anterior sale en gris |
| Corte | Muestra una rebanada del átomo para ver las capas como anillos de cebolla |
| Capas | Activa o desactiva subcapas para "pelar" el átomo |
| Escala real (Slater) | Tamaños con la carga nuclear efectiva: las capas internas se encogen |
| Galería (derecha) | **Todos** los orbitales que agrega el periodo (s, p, d, f en todas sus orientaciones). Clic en uno para verlo en grande con sus fases y nodos |
| El patrón | 2, 8, 8, 18, 18, 32, 32 = 2·1², 2·2², 2·2², 2·3², 2·3², 2·4², 2·4² |

## La física

- **Formas de los orbitales:** soluciones exactas del átomo de hidrógeno, ψ = R<sub>nl</sub>(r)·Y<sub>lm</sub>(θ,φ). Se usan armónicos esféricos reales y polinomios de Laguerre. Los puntos se muestrean de |ψ|²: la parte radial por inversión de la CDF y la angular por rechazo.
- **Orden de llenado:** regla de Madelung (*n + l*). Cada periodo empieza con *ns* y termina con *np*.
- **Escala real:** radio hidrogenoide dividido entre Z<sub>ef</sub>, calculado con las reglas de Slater.
- **Limitaciones:** no incluye efectos relativistas, que son importantes en Rn y sobre todo en Og, ni correlación electrónica.

## Estructura

```
index.html        interfaz
css/style.css     estilos
js/physics.js     orbitales, configuraciones, Slater, muestreo (también corre en Node)
js/viewer.js      visor 3D en canvas 2D
js/app.js         lógica de la interfaz
tests/check.js    pruebas: node tests/check.js
```

## Publicar en la web

En GitHub: *Settings → Pages → Deploy from branch → main / root*. Queda en `https://alrobles.github.io/atomic-simulation/`.
