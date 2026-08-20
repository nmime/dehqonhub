// @requirements REQ-AGRITECH-PUBLIC-018 REQ-AGRITECH-ENGAGEMENT-019
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  throwOnOpenApiErrorData,
  useUserApiClient,
  type MarketplacePublicProfileDto,
} from '@app/frontend-api-client';
import type { Resource } from './use-marketplace-data';

/**
 * Which public identifier the profile is being opened by.
 *
 * `seller` is the address the catalog already prints on every listing, so a card
 * or a product page can link to a profile without learning a second identifier.
 * `profile` is the derived party address a deal screen carries for either
 * counterparty, including a buyer that publishes no catalog at all.
 */
export type PublicProfileAddressKind = 'profile' | 'seller';

/**
 * One other party's public profile.
 *
 * It is fetched here rather than threaded through the marketplace page because
 * the profile is the only consumer: the projection is already final on the wire
 * - identity, reputation counts and the two review lists - and nothing on the
 * page derives a private fact from it. A 404 is a real answer, not a failure:
 * a party with no moderated public presence has no public profile, and the view
 * says so instead of pretending the request broke.
 *
 * The address is taken as two scalars rather than one object so a caller can
 * pass it inline: a fresh object literal on every render would restart the
 * request on every render.
 */
export function usePublicProfile(
  id?: string,
  kind: PublicProfileAddressKind = 'profile',
): Resource<MarketplacePublicProfileDto | null> {
  const { api, requestOptions } = useUserApiClient();
  const epochRef = useRef(0);
  const [profile, setProfile] = useState<Resource<MarketplacePublicProfileDto | null>>({
    data: null,
    status: 'idle',
  });

  const load = useCallback(async () => {
    const epoch = epochRef.current + 1;
    epochRef.current = epoch;
    const current = () => epochRef.current === epoch;
    if (!id) {
      setProfile({ data: null, status: 'idle' });
      return;
    }
    setProfile((resource) => ({ ...resource, status: 'loading' }));
    try {
      const data = await throwOnOpenApiErrorData(
        kind === 'seller'
          ? api.marketplacePublicProfileControllerGetSellerProfile(id, requestOptions)
          : api.marketplacePublicProfileControllerGetProfile(id, requestOptions),
      );
      if (current()) {
        setProfile({ data, status: 'ready' });
      }
    } catch {
      if (current()) {
        setProfile({ data: null, status: 'error' });
      }
    }
  }, [api, id, kind, requestOptions]);

  useEffect(() => {
    void load();
    return () => {
      epochRef.current += 1;
    };
  }, [load]);

  return profile;
}
