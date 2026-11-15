import { useEffect, useState } from 'react';
import { fetchHealth } from '../api/client.js';

/** Which model the server is using (or that it's unreachable). */
export function useHealth() {
  const [health, setHealth] = useState({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth({ signal: controller.signal })
      .then((data) => setHealth({ status: 'ok', ...data }))
      .catch((err) => {
        if (err.name !== 'AbortError') setHealth({ status: 'down' });
      });
    return () => controller.abort();
  }, []);

  return health;
}
