# CargoApp Web (React)

Esta carpeta contiene la versión web en React (pensada para navegador) para migrar gradualmente la app Expo.

## Requisitos
- Node.js 18+ (ideal 20+)

## Configuración
1. Crea un archivo `.env` basado en `.env.example`.
2. Instala dependencias:

```bash
cd "Pagina React"
npm install
```

## Desarrollo
```bash
npm run dev
```

## Nota sobre código compartido
- Se reutilizan tokens desde `../theme/colors.js` y validaciones desde `../utils/validation.js`.
- En web se usa un `supabaseClient` propio (variables `VITE_...`).
