import React, { createContext, useContext, useMemo, useState } from 'react';

const PermissionsContext = createContext({
  permissions: [],
  setPermissions: () => {},
});

export function PermissionsProvider({ children }) {
  const [permissions, setPermissions] = useState([]);
  const value = useMemo(() => ({ permissions, setPermissions }), [permissions]);
  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
