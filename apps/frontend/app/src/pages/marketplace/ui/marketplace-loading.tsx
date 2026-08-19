import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react';
import { MarketplaceIcon, type MarketplaceIconName } from './marketplace-icon';
import type { MarketplaceTranslate } from './marketplace-ui';

/*
 * The marketplace loading kit.
 *
 * One shimmer treatment (`.dh-sk`, sharing `@keyframes dh-shimmer` with the
 * legacy `.dh-skeleton` plate) is reused by every primitive here, so a screen
 * that is still loading reads as the same material everywhere. Each primitive
 * declares the geometry of the real element it stands in for — the numbers in
 * the stylesheet are copied from that element's own rule and the source rule is
 * named in a comment beside them — so a skeleton occupies the box its content
 * will occupy and the page does not jump when data lands.
 *
 * Every skeleton is decorative: it carries `aria-hidden="true"` and its
 * container carries `aria-busy="true"` plus a screen-reader-only status that
 * announces the region as loading and then as ready.
 */

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

/** How much of the line's track the placeholder fills, mirroring real copy lengths. */
export type SkeletonLineWidth = 'full' | 'half' | 'quarter' | 'third' | 'wide';

/** Which type size the line stands in for: body copy, a heading, or a display figure. */
export type SkeletonLineSize = 'body' | 'lead' | 'title';

/** A single line of text. */
export function SkeletonLine({
  size = 'body',
  width = 'full',
}: Readonly<{ size?: SkeletonLineSize; width?: SkeletonLineWidth }>) {
  return <span aria-hidden="true" className={`dh-sk dh-sk--line dh-sk--line-${width} dh-sk--${size}`} />;
}

/** Which real plate the media block stands in for. */
export type SkeletonMediaRatio = 'card' | 'hero' | 'thumb';

/** An image plate. `card` and `hero` share the catalog plate's 1.72:1 ratio; `thumb` is the square compact plate. */
export function SkeletonMedia({ ratio = 'card' }: Readonly<{ ratio?: SkeletonMediaRatio }>) {
  return <span aria-hidden="true" className={`dh-sk dh-sk--media dh-sk--media-${ratio}`} />;
}

/** Which pill-shaped control the block stands in for. */
export type SkeletonPillVariant = 'action' | 'badge' | 'card-action';

/** A pill control: a button, a compact card button, or a badge. */
export function SkeletonPill({ variant = 'action' }: Readonly<{ variant?: SkeletonPillVariant }>) {
  return <span aria-hidden="true" className={`dh-sk dh-sk--pill dh-sk--pill-${variant}`} />;
}

/** One label/value row of a definition list, shaped like a `.dh-facts` row. */
export function SkeletonFactRow() {
  return (
    <span aria-hidden="true" className="dh-sk-fact">
      <SkeletonLine width="third" />
      <SkeletonLine width="quarter" />
    </span>
  );
}

/**
 * Which real row the placeholder stands in for: the tinted management row
 * (`soft`), the plain bordered review or offer card (`plain`), or the flush
 * rule-separated cart line (`flush`).
 */
export type SkeletonRowTone = 'flush' | 'plain' | 'soft';

/** One row of a vertical list: a copy block, an optional trailing badge and an action. */
export function SkeletonListRow({
  lines = 2,
  tone = 'soft',
  trailing = true,
}: Readonly<{ lines?: number; tone?: SkeletonRowTone; trailing?: boolean }>) {
  return (
    <span aria-hidden="true" className={`dh-sk-row dh-sk-row--${tone}`}>
      <span className="dh-sk-row__copy">
        <SkeletonLine width="wide" />
        {Array.from({ length: Math.max(0, lines - 1) }, (_, index) => (
          <SkeletonLine key={index} width="half" />
        ))}
      </span>
      {trailing ? (
        <span className="dh-sk-row__trail">
          <SkeletonPill variant="badge" />
          <SkeletonPill />
        </span>
      ) : null}
    </span>
  );
}

/** One catalog card: the tinted plate, the tag row, the price, a two-line title, the seller and the action. */
export function SkeletonCard() {
  return (
    <span aria-hidden="true" className="dh-sk-card">
      <SkeletonMedia />
      <span className="dh-sk-card__body">
        <SkeletonPill variant="badge" />
        <SkeletonLine size="lead" width="half" />
        <span className="dh-sk-card__title">
          <SkeletonLine />
          <SkeletonLine width="wide" />
        </span>
        <SkeletonLine width="half" />
        <SkeletonPill variant="card-action" />
      </span>
    </span>
  );
}

/** One dashboard stat tile: the figure and its label. */
export function SkeletonStat() {
  return (
    <span aria-hidden="true" className="dh-sk-stat">
      <SkeletonLine size="title" width="half" />
      <SkeletonLine width="wide" />
    </span>
  );
}

/** Which content shape the skeleton container lays its children out as. */
export type SkeletonShape = 'cards' | 'detail' | 'facts' | 'gallery' | 'plain' | 'rows' | 'stats';

/**
 * The container every skeleton sits in. It keeps the historical
 * `.dh-skeleton-grid` class so the marketplace has exactly one skeleton
 * container selector, and adds the shape that decides the track geometry.
 */
export function SkeletonGrid({ children, shape = 'plain' }: Readonly<{ children: ReactNode; shape?: SkeletonShape }>) {
  return (
    <div aria-busy="true" className={`dh-skeleton-grid dh-skeleton-grid--${shape}`}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Common compositions                                                 */
/* ------------------------------------------------------------------ */

/** A catalog or shelf grid of cards. */
export function MarketplaceProductGridSkeleton({ count = 4 }: Readonly<{ count?: number }>) {
  return (
    <SkeletonGrid shape="cards">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </SkeletonGrid>
  );
}

/** A vertical list of rows: cart lines, offers, publications, samples, notifications, reviews. */
export function MarketplaceListSkeleton({
  count = 2,
  lines = 2,
  tone = 'soft',
  trailing = true,
}: Readonly<{ count?: number; lines?: number; tone?: SkeletonRowTone; trailing?: boolean }>) {
  return (
    <SkeletonGrid shape="rows">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonListRow key={index} lines={lines} tone={tone} trailing={trailing} />
      ))}
    </SkeletonGrid>
  );
}

/** A definition list of label/value rows. */
export function MarketplaceFactsSkeleton({ rows = 3 }: Readonly<{ rows?: number }>) {
  return (
    <SkeletonGrid shape="facts">
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonFactRow key={index} />
      ))}
    </SkeletonGrid>
  );
}

/** A row of dashboard stat tiles. */
export function MarketplaceStatsSkeleton({ count = 3 }: Readonly<{ count?: number }>) {
  return (
    <SkeletonGrid shape="stats">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonStat key={index} />
      ))}
    </SkeletonGrid>
  );
}

/* ------------------------------------------------------------------ */
/* Spinner and busy controls                                           */
/* ------------------------------------------------------------------ */

/**
 * The one spinner in the product. It is decorative: the busy state it belongs
 * to is carried by `aria-busy` and by a live status, never by the glyph.
 */
export function MarketplaceSpinner({ size = 'md' }: Readonly<{ size?: 'md' | 'sm' }>) {
  return <span aria-hidden="true" className={`dh-spinner dh-spinner--${size}`} />;
}

/** The one glyph the affordance slot holds: the spinner while busy, otherwise the control's own icon. */
function BusyButtonAffordance({ busy, icon }: Readonly<{ busy: boolean; icon?: MarketplaceIconName }>) {
  if (busy) {
    return <MarketplaceSpinner size="sm" />;
  }
  return icon ? <MarketplaceIcon name={icon} /> : null;
}

export interface MarketplaceBusyButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-busy'> {
  /** True while the action this control submitted is still in flight. */
  busy: boolean;
  /**
   * Localized sentence announced to assistive technology while the action is in
   * flight. Omit it only when the control already sits inside a live region that
   * narrates the same action, so the state is not announced twice.
   */
  busyLabel?: string;
  /** The glyph the control carries when idle; the spinner takes its slot while busy. */
  icon?: MarketplaceIconName;
  /** Forwarded to the button, so a caller that focuses its own control keeps doing so. */
  ref?: Ref<HTMLButtonElement>;
}

/**
 * A control that says it is working.
 *
 * The affordance slot is reserved in both states, so entering the busy state
 * swaps a glyph for the spinner and never changes the control's box. The
 * visible label is unchanged, which keeps the control's accessible name stable
 * while `aria-busy` and the adjacent status carry the state change. A busy
 * control is also disabled, so it cannot be submitted twice.
 */
export function MarketplaceBusyButton({
  busy,
  busyLabel,
  children,
  className,
  disabled,
  icon,
  ...rest
}: Readonly<MarketplaceBusyButtonProps>) {
  return (
    <>
      <button
        {...rest}
        aria-busy={busy ? 'true' : undefined}
        className={className ? `${className} dh-busy-button` : 'dh-busy-button'}
        disabled={disabled === true || busy}
      >
        <span aria-hidden="true" className="dh-busy-button__slot">
          <BusyButtonAffordance busy={busy} {...(icon ? { icon } : {})} />
        </span>
        {children}
      </button>
      {busy && busyLabel ? (
        <span aria-live="polite" className="dh-sr-only" role="status">
          {busyLabel}
        </span>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Anti-flicker policy                                                 */
/* ------------------------------------------------------------------ */

export interface DeferredBusyOptions {
  /**
   * How long a skeleton stays on screen once it has appeared, even if the data
   * has already landed. 320 ms is twice the 160 ms transition the marketplace
   * already uses for buttons, cards and thumbnails, so a loading state lives at
   * least as long as one complete in-and-out of the product's own motion
   * vocabulary and reads as a state change rather than a glitch.
   */
  minVisibleMs?: number;
  /**
   * How long a request may take before a skeleton appears at all. 120 ms is the
   * rounded 0.1 s "feels instantaneous" threshold plus a frame of slack at
   * 60 Hz: anything that resolves inside it never needed a placeholder, and
   * painting one would be a pure flash.
   */
  showDelayMs?: number;
}

const defaultMinVisibleMs = 320;
const defaultShowDelayMs = 120;

/**
 * The minimum visible duration used when the visitor asks for reduced motion.
 * The reduced treatment replaces the travelling shimmer with one flat fill, so
 * nothing on screen moves to say the region is still working; the placeholder
 * has to stand still for longer to be read at all. 480 ms is half a second
 * rounded to the 160 ms transition grid.
 */
const reducedMotionMinVisibleMs = 480;

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

/**
 * Whether this visitor has asked the platform for reduced motion. The stylesheet
 * owns the visual substitution; this hook exists for the one consequence CSS
 * cannot express, which is how long a motionless placeholder has to stay.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof globalThis.matchMedia !== 'function') {
      return undefined;
    }
    const query = globalThis.matchMedia(reducedMotionQuery);
    const update = () => {
      setReduced(query.matches);
    };
    update();
    query.addEventListener('change', update);
    return () => {
      query.removeEventListener('change', update);
    };
  }, []);

  return reduced;
}

/**
 * Turns a raw in-flight flag into a flicker-free visibility flag.
 *
 * Passing `{ minVisibleMs: 0, showDelayMs: 0 }` disables the policy and makes
 * the hook a synchronous pass-through, which is what a caller wants when the
 * surrounding state machine is already the single source of truth for the frame
 * being rendered.
 */
export function useDeferredBusy(busy: boolean, options: DeferredBusyOptions = {}): boolean {
  const { minVisibleMs = defaultMinVisibleMs, showDelayMs = defaultShowDelayMs } = options;
  const reducedMotion = usePrefersReducedMotion();
  const holdMs = minVisibleMs > 0 && reducedMotion ? Math.max(minVisibleMs, reducedMotionMinVisibleMs) : minVisibleMs;
  const disabled = showDelayMs <= 0 && holdMs <= 0;
  const [visible, setVisible] = useState(busy && showDelayMs <= 0);
  const shownAt = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (disabled) {
      return undefined;
    }
    if (busy) {
      if (visible) {
        shownAt.current ??= Date.now();
        return undefined;
      }
      if (showDelayMs <= 0) {
        shownAt.current = Date.now();
        setVisible(true);
        return undefined;
      }
      const timer = globalThis.setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, showDelayMs);
      return () => {
        globalThis.clearTimeout(timer);
      };
    }
    if (!visible) {
      return undefined;
    }
    const remaining = holdMs - (Date.now() - (shownAt.current ?? Date.now()));
    if (remaining <= 0) {
      shownAt.current = undefined;
      setVisible(false);
      return undefined;
    }
    const timer = globalThis.setTimeout(() => {
      shownAt.current = undefined;
      setVisible(false);
    }, remaining);
    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [busy, disabled, holdMs, showDelayMs, visible]);

  return disabled ? busy : visible;
}

/* ------------------------------------------------------------------ */
/* Accessible loading regions                                          */
/* ------------------------------------------------------------------ */

/**
 * The screen-reader account of one region's loading lifecycle. Nothing is
 * announced for a region that was already settled when it mounted; once a
 * region has been busy, settling announces the region by name as ready.
 */
export function MarketplaceLoadingStatus({
  busy,
  label,
  t,
}: Readonly<{ busy: boolean; label: string; t: MarketplaceTranslate }>) {
  const [everBusy, setEverBusy] = useState(busy);

  useEffect(() => {
    if (busy) {
      setEverBusy(true);
    }
  }, [busy]);

  if (!busy && !everBusy) {
    return null;
  }
  return (
    <span aria-live="polite" className="dh-sr-only" role="status">
      {busy ? t('agritech.marketplace.loading') : t('user.state.ready', { subject: label })}
    </span>
  );
}

/**
 * One loading region: the skeleton while busy, the content once settled, and
 * the status that narrates the switch. `deferred` opts the region into the
 * anti-flicker policy; without it the region follows its resource status
 * frame-for-frame, which is what the marketplace's resource state machine
 * already guarantees.
 *
 * The region is a fragment rather than a wrapper element on purpose. The
 * stylesheet addresses several of these grids through direct-child selectors —
 * `.dh-section > .dh-product-grid`, `.dh-page-stack > section` — and inserting a
 * div would silently break them. `aria-busy` therefore belongs to the skeleton
 * container itself, which `SkeletonGrid` already sets, and the status is
 * absolutely positioned so it occupies no track in a grid or flex parent.
 */
export function MarketplaceLoadingRegion({
  busy,
  children,
  deferred = false,
  label,
  skeleton,
  t,
}: Readonly<{
  busy: boolean;
  children: ReactNode;
  deferred?: boolean;
  label: string;
  skeleton: ReactNode;
  t: MarketplaceTranslate;
}>) {
  const visible = useDeferredBusy(busy, deferred ? {} : { minVisibleMs: 0, showDelayMs: 0 });
  return (
    <>
      <MarketplaceLoadingStatus busy={visible} label={label} t={t} />
      {visible ? skeleton : children}
    </>
  );
}
