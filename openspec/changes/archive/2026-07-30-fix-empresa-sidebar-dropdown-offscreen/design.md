## Context

`EmpresaSidebar` y `JovenSidebar` son componentes casi idénticos que renderizan la navegación lateral en escritorio (≥md). Ambos colocan un `UserButton` al pie del sidebar. El `UserButton` acepta un prop `menuPlacement` que controla hacia dónde abre el dropdown:

- `'bottom-right'` (default): `right-0 top-full mt-2` — abre hacia abajo
- `'top-left'`: `left-0 bottom-full mb-2` — abre hacia arriba

En `JovenSidebar` ya se pasa `menuPlacement="top-left"` porque al estar al pie de un sidebar `fixed inset-y-0`, el dropdown que abre hacia abajo queda fuera del viewport. `EmpresaSidebar` omite este prop, causando que el dropdown sea invisible e inaccesible.

## Goals / Non-Goals

**Goals:**
- Que el dropdown del `UserButton` en `/empresa` sea visible y clickeable, igual que en `/joven`

**Non-Goals:**
- Refactorizar o unificar las sidebars (trabajo futuro)
- Cambiar el comportamiento del `UserButton` en headers/otros contextos
- Modificar el layout o estilos de la sidebar
- Tocar el comportamiento en móvil (donde el `UserButton` está en el header, no en la sidebar)

## Decisions

### Agregar `menuPlacement="top-left"` en EmpresaSidebar

**Alternativa considerada:** modificar el `UserButton` para detectar automáticamente si está al borde del viewport. Descartada: overengineering para un fix de una línea. El prop `menuPlacement` ya existe y está documentado para exactamente este caso.

**Racional:** es un cambio mínimo (1 línea, 1 prop), sin riesgo de regresión, que iguala el comportamiento con `JovenSidebar`. El prop ya está probado en producción en el contexto idéntico del sidebar del joven.

## Risks / Trade-offs

- **Riesgo**: ninguna — el `UserButton` ya maneja ambos placements y `'top-left'` funciona correctamente en `JovenSidebar`
- **Trade-off**: ninguno — no hay comportamiento alternativo que preservar
