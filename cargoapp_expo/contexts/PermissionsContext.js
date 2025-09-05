import { createContext } from 'react';

// Contexto simple para exponer permisos a la jerarquía de Inicio.
// El value recomendado es un array de strings con nombres de permisos
// o un array de objetos { id, permission_name, description }.
export const PermissionsContext = createContext([]);
