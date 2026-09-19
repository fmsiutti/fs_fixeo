# apps/web — React PWA

Complementa el `CLAUDE.md` de la raíz. Pantallas en `docs/pantallas.md`, reglas en `docs/dominio.md`.

## Estructura

```
src/
  features/<feature>/     # pedidos, postulaciones, perfil, auth, resenias, admin, ...
    api.ts                # funciones fetch tipadas + query keys
    components/  hooks/  pages/
  components/ui/          # primitivas chicas y reutilizadas (Button, Field, Sheet, EmptyState, ...)
  lib/                    # cliente http, formato de fechas y montos, utilidades
  routes.tsx              # rutas y guards por rol
  main.tsx
```

Organizado por feature, no por tipo de archivo. Un componente se mueve a `components/ui` recién cuando se usa en dos features.

## Reglas de código

- Servidor: **TanStack Query** para todo dato remoto. Sin Redux ni Zustand. Estado local con `useState`; contexto solo para sesión y rol activo.
- Formularios: `react-hook-form` + `zodResolver` con los schemas de `packages/shared`. No redefinir validaciones.
- Cliente http: un wrapper `fetch` chico en `lib/http.ts` con el access token en memoria, refresh automático y errores tipados por `code` (`packages/shared`). Los mensajes al usuario se deciden en el front a partir del `code`.
- Rutas con React Router. Guards por rol: `/admin/*` exige moderador o soporte; las rutas de profesional exigen `rol_activo = profesional`.
- Estilos con Tailwind y componentes propios en `components/ui`. Sin UI kit pesado. Si se adopta un sistema de diseño, se mapea a los tokens del tema de Tailwind.
- Textos en español rioplatense (vos), literales en el componente. Sin librería de i18n.
- Sin `any`. Sin `useEffect` para derivar estado ni para pedir datos.

## Cada pantalla (obligatorio)

1. Implementá la ficha completa de `docs/pantallas.md`: contenido, acciones, estados y reglas.
2. Cubrí **vacío, carga y error** (el documento los considera la mitad de la experiencia). Esqueletos en carga, reintento en error.
3. **Mobile-first a 360 px**, acción principal al alcance del pulgar, áreas táctiles de 44 px como mínimo.
4. Accesibilidad: labels asociados, foco visible, contraste AA, navegación por teclado, texto alternativo en imágenes.
5. Vocabulario del producto: *pedido*, *postulación*, *estimación*, *elegir*. Nunca «presupuesto», «contratar» ni «orden».

## Comportamientos que hay que respetar

- **Asistente de publicación** (CL-02 a CL-06): el borrador se guarda localmente (IndexedDB o `localStorage` con try/catch) y se convierte en pedido al verificar el teléfono; la cuenta se pide al final, no antes.
- **Fotos**: comprimir en el dispositivo (canvas) antes de subir, progreso por foto, reintento por foto sin perder las demás. La API vuelve a quitar los metadatos.
- **Ubicación**: `navigator.geolocation` pedido en contexto; si se deniega, búsqueda manual sin insistir.
- **Teléfono y código OTP**: autocompletado con `autocomplete="one-time-code"`, reenvío a los 30 s, alternativa por llamada.
- **WhatsApp**: enlace `https://wa.me/<E164>?text=<mensaje prellenado>` con el resumen del pedido.
- **Reveal simultáneo**: la pantalla de contacto muestra teléfono y botones solo si la API devolvió el dato; nunca ocultar con CSS lo que ya llegó al cliente.

## PWA

- `vite-plugin-pwa` con manifest e instalación. Service worker mínimo: assets, push y una página offline simple. Sin sincronización offline compleja.
- Web Push en iOS solo funciona con la PWA instalada. Los eventos clave también salen por WhatsApp; no diseñar flujos que dependan solo de push.

## Tests

- Vitest + Testing Library para lógica con reglas (asistente, ordenamiento, guards, formularios con validaciones propias). No testear estilos ni componentes triviales.
- Playwright para 2 o 3 flujos: publicar un pedido; postularse y ser elegido; alta de profesional hasta la verificación.
