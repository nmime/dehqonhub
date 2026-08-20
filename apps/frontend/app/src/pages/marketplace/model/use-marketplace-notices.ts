// @requirements REQ-AGRITECH-EXPERIENCE-026 REQ-AGRITECH-WEB-006
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarketplaceNotice } from '../ui/marketplace-ui';

/** Toasts dwell long enough to read, then leave on their own. */
const dwellMs = 4500;
/** Must match the exit animation in marketplace.css. */
const exitMs = 220;
const maximumVisible = 3;

export interface MarketplaceNoticeQueue {
  dismiss: (id: string) => void;
  flash: (message: string, kind?: MarketplaceNotice['kind']) => void;
  notices: readonly MarketplaceNotice[];
}

/**
 * A queue rather than a single slot: the screen fires several confirmations in a
 * row — add to cart, then quantity changed — and one slot made each new message
 * silently replace the previous one, which reads as a toast that never leaves.
 * Every toast owns its dwell timer and a short leaving phase so it animates out
 * instead of vanishing.
 */
export function useMarketplaceNotices(): MarketplaceNoticeQueue {
  const [notices, setNotices] = useState<readonly MarketplaceNotice[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof globalThis.setTimeout>>());
  const sequence = useRef(0);

  const forget = useCallback((id: string) => {
    timers.current.delete(id);
    setNotices((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      const pending = timers.current.get(id);
      if (pending) {
        globalThis.clearTimeout(pending);
      }
      setNotices((current) => current.map((entry) => (entry.id === id ? { ...entry, leaving: true } : entry)));
      timers.current.set(id, globalThis.setTimeout(forget, exitMs, id));
    },
    [forget],
  );

  const flash = useCallback(
    (message: string, kind: MarketplaceNotice['kind'] = 'success') => {
      sequence.current += 1;
      const id = `notice-${sequence.current}`;
      setNotices((current) =>
        [...current.filter((entry) => !entry.leaving), { id, kind, message }].slice(-maximumVisible),
      );
      timers.current.set(id, globalThis.setTimeout(dismiss, dwellMs, id));
    },
    [dismiss],
  );

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) {
        globalThis.clearTimeout(timer);
      }
      timers.current.clear();
    },
    [],
  );

  return { dismiss, flash, notices };
}
