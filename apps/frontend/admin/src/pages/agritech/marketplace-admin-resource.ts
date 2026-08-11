import { useCallback, useEffect, useState } from 'react';

export type ResourceState<T> = { status: 'error' } | { status: 'loading' } | { data: T; status: 'ready' };

export function useResource<T>(loader: () => Promise<T>): [ResourceState<T>, () => void] {
  const [state, setState] = useState<ResourceState<T>>({ status: 'loading' });
  const load = useCallback(() => {
    setState({ status: 'loading' });
    void loader()
      .then((data) => {
        setState({ data, status: 'ready' });
      })
      .catch(() => {
        setState({ status: 'error' });
      });
  }, [loader]);

  useEffect(() => {
    load();
  }, [load]);

  return [state, load];
}
