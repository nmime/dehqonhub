import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Locale } from '@app/frontend-runtime';
import { MarketplaceIcon } from './marketplace-icon';
import { SkeletonGrid, SkeletonMedia } from './marketplace-loading';
import { ProductMedia } from './marketplace-product-card';
import { localizedProductName, type MarketplaceListing, type MarketplaceTranslate } from './marketplace-ui';

interface MarketplaceGalleryProps {
  locale: Locale;
  product: MarketplaceListing;
  t: MarketplaceTranslate;
}

/** Horizontal travel, in CSS pixels, before a touch drag counts as a swipe rather than a tap. */
const swipeThreshold = 40;

/**
 * One frame of the gallery. The card's `ProductMedia` already owns the tinted
 * placeholder, the category illustration and the broken-URL fallback, so each
 * frame is that same component pointed at a single source instead of the first.
 */
const framedListing = (product: MarketplaceListing, source?: string): MarketplaceListing => ({
  ...product,
  images: source === undefined ? [] : [source],
});

/** The lightbox only ever contains buttons, so the tab ring is exactly its buttons. */
const focusableSelector = 'button:not([disabled])';

const trapFocus = (dialog: HTMLElement | null, event: KeyboardEvent): void => {
  if (!dialog) {
    return;
  }
  const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)];
  const first = focusable.at(0);
  const last = focusable.at(-1);
  if (!first || !last) {
    return;
  }
  const active = document.activeElement;
  const outside = !dialog.contains(active);
  if (event.shiftKey ? active === first || outside : active === last || outside) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
};

interface GalleryImageProps {
  locale: Locale;
  product: MarketplaceListing;
  source: string;
  t: MarketplaceTranslate;
}

/**
 * The fullscreen frame shows the whole photo instead of cropping it, so it
 * cannot reuse the card's cover-fitted plate directly. A URL that fails still
 * degrades to the same tinted category placeholder.
 */
function GalleryImage({ locale, product, source, t }: Readonly<GalleryImageProps>) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [source]);

  if (failed) {
    return (
      <div className="dh-gallery-lightbox__fallback">
        <ProductMedia locale={locale} product={framedListing(product)} t={t} />
      </div>
    );
  }
  return (
    <img
      alt={localizedProductName(product, locale)}
      className="dh-gallery-lightbox__image"
      onError={() => {
        setFailed(true);
      }}
      src={source}
    />
  );
}

interface GalleryLightboxProps {
  index: number;
  locale: Locale;
  onClose: () => void;
  onSelect: (index: number) => void;
  product: MarketplaceListing;
  t: MarketplaceTranslate;
}

function GalleryLightbox({ index, locale, onClose, onSelect, product, t }: Readonly<GalleryLightboxProps>) {
  const total = product.images.length;
  const source = product.images[index];
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const touchStart = useRef<number | undefined>(undefined);

  const step = useCallback(
    (delta: number) => {
      onSelect((index + delta + total) % total);
    },
    [index, onSelect, total],
  );

  useEffect(() => {
    close.current?.focus();
  }, []);

  /* The page behind a modal must not scroll, and it must scroll again even when
     the whole product view unmounts while the viewer is still open. */
  useEffect(() => {
    const { body } = document;
    const restored = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = restored;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        step(event.key === 'ArrowLeft' ? -1 : 1);
        return;
      }
      if (event.key === 'Tab') {
        trapFocus(dialog.current, event);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, step]);

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touchStart.current = event.touches[0]?.clientX;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    const end = event.changedTouches[0]?.clientX;
    touchStart.current = undefined;
    if (start === undefined || end === undefined || total < 2) {
      return;
    }
    const travel = end - start;
    if (Math.abs(travel) < swipeThreshold) {
      return;
    }
    step(travel < 0 ? 1 : -1);
  };

  return createPortal(
    <div
      className="dh-gallery-lightbox"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        aria-label={t('agritech.marketplace.product.gallery')}
        aria-modal="true"
        className="dh-gallery-lightbox__panel"
        onTouchEnd={handleTouchEnd}
        onTouchStart={handleTouchStart}
        ref={dialog}
        role="dialog"
      >
        <div className="dh-gallery-lightbox__bar">
          <p aria-live="polite" className="dh-gallery-lightbox__position">
            {t('agritech.marketplace.product.galleryPosition', { index: index + 1, total })}
          </p>
          <button
            aria-label={t('agritech.marketplace.product.galleryClose')}
            className="dh-gallery-lightbox__control"
            onClick={onClose}
            ref={close}
            type="button"
          >
            <MarketplaceIcon name="close" />
          </button>
        </div>
        <div className="dh-gallery-lightbox__stage">
          {source === undefined ? null : <GalleryImage locale={locale} product={product} source={source} t={t} />}
          {total > 1 ? (
            <>
              <button
                aria-label={t('agritech.marketplace.product.galleryPrevious')}
                className="dh-gallery-lightbox__control dh-gallery-lightbox__control--prev"
                onClick={() => {
                  step(-1);
                }}
                type="button"
              >
                <MarketplaceIcon name="arrow" />
              </button>
              <button
                aria-label={t('agritech.marketplace.product.galleryNext')}
                className="dh-gallery-lightbox__control dh-gallery-lightbox__control--next"
                onClick={() => {
                  step(1);
                }}
                type="button"
              >
                <MarketplaceIcon name="arrow" />
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The gallery's own loading shape: the 1.72:1 frame at the frame's 1.5rem radius
 * with a strip of square 4.5rem thumbnails under it, which is the box
 * `MarketplaceGallery` occupies once the listing's images resolve. The thumb
 * count is a placeholder for an unknown number of images, so it stays at the
 * strip's own minimum of two.
 */
export function MarketplaceGallerySkeleton({ thumbs = 3 }: Readonly<{ thumbs?: number }>) {
  return (
    <SkeletonGrid shape="gallery">
      <SkeletonMedia ratio="hero" />
      <span aria-hidden="true" className="dh-sk-strip">
        {Array.from({ length: thumbs }, (_, index) => (
          <SkeletonMedia key={index} ratio="thumb" />
        ))}
      </span>
    </SkeletonGrid>
  );
}

/**
 * The listing's own photography: one main frame, a thumbnail strip once a
 * listing carries more than one image, and a modal fullscreen viewer. A listing
 * without images keeps the tinted category placeholder and offers no viewer.
 */
export function MarketplaceGallery({ locale, product, t }: Readonly<MarketplaceGalleryProps>) {
  const images = product.images;
  const total = images.length;
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setSelected(0);
    setOpen(false);
  }, [product.id]);

  /* Focus returns to the frame that opened the viewer, never to the page top. */
  const closeLightbox = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);

  if (total === 0) {
    return (
      <div className="dh-gallery">
        <ProductMedia locale={locale} product={product} t={t} />
      </div>
    );
  }

  const index = Math.min(selected, total - 1);

  return (
    <div className="dh-gallery">
      <button
        aria-label={t('agritech.marketplace.product.galleryOpen')}
        className="dh-gallery__frame"
        onClick={() => {
          setOpen(true);
        }}
        ref={trigger}
        type="button"
      >
        <ProductMedia locale={locale} product={framedListing(product, images[index])} t={t} />
      </button>
      {total > 1 ? (
        <ul aria-label={t('agritech.marketplace.product.gallery')} className="dh-gallery__strip">
          {images.map((source, position) => (
            <li key={`${position}-${source}`}>
              <button
                aria-current={position === index ? 'true' : undefined}
                aria-label={t('agritech.marketplace.product.galleryThumb', { index: position + 1, total })}
                className={`dh-gallery__thumb${position === index ? ' is-active' : ''}`}
                onClick={() => {
                  setSelected(position);
                }}
                type="button"
              >
                <ProductMedia compact locale={locale} product={framedListing(product, source)} t={t} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <GalleryLightbox
          index={index}
          locale={locale}
          onClose={closeLightbox}
          onSelect={setSelected}
          product={product}
          t={t}
        />
      ) : null}
    </div>
  );
}
