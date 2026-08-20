// @requirements REQ-AGRITECH-ENGAGEMENT-019
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  throwOnOpenApiErrorData,
  useUserApiClient,
  type MarketplaceOwnReviewsDto,
  type MarketplaceReviewDto,
} from '@app/frontend-api-client';
import type { Resource } from './use-marketplace-data';

/**
 * The caller's own review record for the cabinet, read from
 * `GET /marketplace/reviews/mine`.
 *
 * This is a separate read from `useMarketplaceData` rather than another field on
 * it. The cabinet's other resources are loaded once for the whole marketplace
 * shell and handed down as props; reviews are needed by exactly one section of
 * one screen, and a review history is the one thing on that screen that has to
 * be re-read after a reply is published rather than after the next full refresh.
 * `enabled` keeps it from firing at all while the section is not on screen, or
 * while a caller supplies the resource directly.
 */
export interface MarketplaceCabinetReviews {
  /** Re-reads the record. Called after a published reply so the row shows it. */
  reload: () => void;
  /** The busy key of the reply in flight, matching `review-reply:<reviewId>`. */
  replyPending?: string;
  replyToReview: (review: MarketplaceReviewDto, comment: string) => Promise<boolean>;
  resource: Resource<MarketplaceOwnReviewsDto | null>;
}

const emptyRecord: MarketplaceOwnReviewsDto = { awaitingReview: [], received: [], written: [] };

export function useMarketplaceCabinetReviews(enabled: boolean): MarketplaceCabinetReviews {
  const { api, requestOptions } = useUserApiClient();
  const [resource, setResource] = useState<Resource<MarketplaceOwnReviewsDto | null>>({ data: null, status: 'idle' });
  const [replyPending, setReplyPending] = useState<string>();
  const [revision, setRevision] = useState(0);
  // Guards a response that arrives after the section unmounted or after a newer
  // read started, which would otherwise overwrite fresher state with older rows.
  const epochRef = useRef(0);
  const commandKeysRef = useRef(new Map<string, string>());

  const reload = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const epoch = epochRef.current + 1;
    epochRef.current = epoch;
    let active = true;
    setResource((current) => ({ ...current, status: 'loading' }));
    void throwOnOpenApiErrorData(api.marketplaceControllerListOwnReviews(requestOptions))
      .then((data) => {
        if (active && epochRef.current === epoch) {
          setResource({ data, status: 'ready' });
        }
      })
      .catch(() => {
        if (active && epochRef.current === epoch) {
          // A failed read is reported as a failure. An empty record would claim
          // this account has no reviews, which is a different fact entirely.
          setResource({ data: null, status: 'error' });
        }
      });
    return () => {
      active = false;
    };
  }, [api, enabled, requestOptions, revision]);

  const replyToReview = useCallback(
    async (review: MarketplaceReviewDto, comment: string): Promise<boolean> => {
      const pendingKey = `review-reply:${review.id}`;
      // One key per review, revision and body, so a retry after a timeout replays
      // the original command instead of racing a second reply the server would
      // answer with a conflict.
      const identity = `${pendingKey}:${review.revision}:${comment}`;
      const idempotencyKey = commandKeysRef.current.get(identity) ?? globalThis.crypto.randomUUID();
      commandKeysRef.current.set(identity, idempotencyKey);
      setReplyPending(pendingKey);
      try {
        await throwOnOpenApiErrorData(
          api.marketplaceControllerReplyToReview(
            review.id,
            { comment, expectedRevision: review.revision },
            idempotencyKey,
            requestOptions,
          ),
        );
        commandKeysRef.current.delete(identity);
        reload();
        return true;
      } catch {
        return false;
      } finally {
        setReplyPending(undefined);
      }
    },
    [api, reload, requestOptions],
  );

  return {
    reload,
    ...(replyPending === undefined ? {} : { replyPending }),
    replyToReview,
    resource: enabled ? resource : { data: emptyRecord, status: 'idle' },
  };
}
