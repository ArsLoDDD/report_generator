import { useCallback, useEffect, useState } from "react";

type Options<T> = {
  load: () => Promise<T[]>;
  onError?: (error: unknown) => void;
  immediate?: boolean;
};

/** Centralises the loading, error and refresh lifecycle shared by entity registries. */
export function useEntityCollection<T>({ load, onError, immediate = true }: Options<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(immediate);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const next = await load();
      setItems(Array.isArray(next) ? next : []);
      return next;
    } catch (cause) {
      setError(cause);
      onError?.(cause);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [load, onError]);

  useEffect(() => { if (immediate) void reload(); }, [immediate, reload]);

  return { items, setItems, isLoading, error, reload };
}

