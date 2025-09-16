import { useCallback, useEffect, useRef, useState } from 'react';
import { callEdgeFunction } from '../api/edgeFunctions';

export function useUsersPagination({ pageSize = 20, permissionsChecker, filters, debounceMs = 450 }) {
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef(null);
  const retryRef = useRef(0);

  const resetRetry = () => { retryRef.current = 0; };

  const fetchPage = useCallback(async (pageToLoad = 0, append = false) => {
    // Limpiar error salvo que sea un intento intermedio
    if (pageToLoad === 0 && !append) setError('');
    if (pageToLoad === 0) setLoading(true);
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let scheduledRetry = false;
    try {
      const offset = pageToLoad * pageSize;
      const json = await callEdgeFunction('list-users', {
        method: 'GET',
        query: {
          offset,
            limit: pageSize,
          search: filters.search,
          role: filters.role,
          is_active: filters.active,
        },
      });
      const newUsers = Array.isArray(json.users) ? json.users : [];
      setUsers((prev) => (append ? [...prev, ...newUsers] : newUsers));
      setHasMore(!!json.has_more);
      setTotal(typeof json.total === 'number' ? json.total : (append ? newUsers.length : newUsers.length));
      setPage(pageToLoad);
      resetRetry();
    } catch (e) {
      // Reintentar silenciosamente si sesión aún no lista
      if (e.message === 'Sesión no válida' && retryRef.current < 3) {
        retryRef.current += 1;
        scheduledRetry = true;
        setTimeout(() => fetchPage(pageToLoad, append), 600);
      } else if (e.message !== 'Tiempo de espera agotado') {
        // Evitar mostrar errores que sean solo '{' u otros restos parciales
        if (e.message && e.message.trim() === '{') {
          // Ignoramos y no mostramos
        } else {
          setError(e.message);
        }
      }
    }
    if (!scheduledRetry) setLoading(false);
  }, [pageSize, filters.search, filters.role, filters.active]);

  // Efecto inicial inmediato
  useEffect(() => { fetchPage(0, false); }, []);

  // Debounce solo cuando cambian filtros (búsqueda / role / active)
  const filtersKey = `${filters.search}|${filters.role}|${filters.active}`;
  useEffect(() => {
    const t = setTimeout(() => { fetchPage(0, false); }, debounceMs);
    return () => clearTimeout(t);
  }, [filtersKey, fetchPage, debounceMs]);

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    fetchPage(page + 1, true);
  }, [loading, hasMore, page, fetchPage]);

  return {
    users,
    page,
    hasMore,
    total,
    loading,
    error,
    refresh: () => fetchPage(0, false),
    loadMore,
  };
}
