export function hasPermission(perms = [], needle) {
  if (!Array.isArray(perms) || perms.length === 0) return false;
  const n = String(needle || '').toLowerCase();
  if (!n) return false;

  return perms.some((p) => {
    if (typeof p === 'string') return p.toLowerCase() === n;
    const name = p?.permission_name ?? p?.name ?? '';
    return String(name).toLowerCase() === n;
  });
}
