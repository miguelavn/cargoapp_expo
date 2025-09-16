import React, { createContext, useContext, useMemo, useState } from 'react';

// Contexto de permisos unificado.
// Shape: { permissions: Array<Perm>, setPermissions: fn }
// Perm puede ser string o { id, permission_name, description }
export const PermissionsContext = createContext({
	permissions: [],
	// eslint-disable-next-line @typescript-eslint/no-empty-function
	setPermissions: () => {},
});

export function PermissionsProvider({ children }) {
	const [permissions, setPermissions] = useState([]);
	const value = useMemo(() => ({ permissions, setPermissions }), [permissions]);
	return (
		<PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
	);
}

export const usePermissions = () => useContext(PermissionsContext);
