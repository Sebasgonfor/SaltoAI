## Why

El `UserButton` al pie del sidebar de `/empresa` abre su dropdown hacia abajo (`bottom-right` por defecto), quedando fuera del viewport y siendo inaccesible para el usuario. En `/joven` esto ya está corregido con `menuPlacement="top-left"`, pero el fix nunca se aplicó al sidebar de empresa por asimetría de copy-paste.

## What Changes

- Agregar `menuPlacement="top-left"` al `<UserButton>` en `EmpresaSidebar`, igualando el comportamiento con `JovenSidebar`.
- El dropdown de cuenta en `/empresa` abrirá hacia arriba, dentro del área visible del viewport.

## Capabilities

### New Capabilities
- `sidebar-dropdown`: El dropdown de cuenta en la sidebar de empresa abre dentro del viewport visible.

### Modified Capabilities
<!-- No existing specs to modify -->
Ninguno.

## Impact

- **Archivo modificado**: `components/empresa/empresa-sidebar.tsx` (línea 55, agregar prop `menuPlacement`)
- **Componentes afectados**: `UserButton` (sin cambios, solo recibe el prop que ya soporta)
- **Rutas afectadas**: todas bajo `/empresa/*` en desktop (≥md)
- **Regresión**: ninguna. El `UserButton` ya tiene el prop documentado y testeado en el contexto de sidebar.
