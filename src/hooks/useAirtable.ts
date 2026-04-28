import { useCallback, useEffect, useRef, useState } from "react";

export type AirtableRecord = {
  id: string;
  fields: Record<string, unknown>;
  createdTime?: string;
};

export type UseAirtableOptions = {
  filterByFormula?: string;
  maxRecords?: number;
  fields?: string[];
};

type CacheEntry = { records: AirtableRecord[] };

// Module-level in-memory cache shared across hook instances
const cache = new Map<string, CacheEntry>();

function buildCacheKey(tableId: string, options: UseAirtableOptions) {
  return `${tableId}::${JSON.stringify(options)}`;
}

function buildUrl(tableId: string, options: UseAirtableOptions) {
  const params = new URLSearchParams();
  params.set("tableId", tableId);
  if (options.filterByFormula) params.set("filterByFormula", options.filterByFormula);
  if (options.maxRecords !== undefined) params.set("maxRecords", String(options.maxRecords));
  if (options.fields) for (const f of options.fields) params.append("fields[]", f);
  return `/api/airtable?${params.toString()}`;
}

export function useAirtable(tableId: string, options: UseAirtableOptions = {}) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const cacheKey = buildCacheKey(tableId, options);
  const [data, setData] = useState<AirtableRecord[] | null>(() => cache.get(cacheKey)?.records ?? null);
  const [loading, setLoading] = useState<boolean>(!cache.has(cacheKey));
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(
    async (force = false) => {
      const key = buildCacheKey(tableId, optionsRef.current);
      if (!force && cache.has(key)) {
        setData(cache.get(key)!.records);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(buildUrl(tableId, optionsRef.current));
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Request failed (${res.status}): ${body}`);
        }
        const json = (await res.json()) as { records: AirtableRecord[] };
        cache.set(key, { records: json.records });
        setData(json.records);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    },
    [tableId],
  );

  useEffect(() => {
    if (cache.has(cacheKey)) {
      setData(cache.get(cacheKey)!.records);
      setLoading(false);
      return;
    }
    void fetchData(false);
  }, [cacheKey, fetchData]);

  const refetch = useCallback(() => {
    cache.delete(buildCacheKey(tableId, optionsRef.current));
    return fetchData(true);
  }, [tableId, fetchData]);

  return { data, loading, error, refetch };
}
