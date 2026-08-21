import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import type { MarketplacePublicSuggestionDto } from '@app/frontend-api-client';
import { LanguageSwitcher } from '../../../shared/ui';
import type { Resource } from '../model/use-marketplace-data';
import { MarketplaceIcon } from './marketplace-icon';
import type { MarketplaceNavigate, MarketplaceSection, MarketplaceTranslate } from './marketplace-ui';

/**
 * The width at which the header stops carrying navigation. It is the same step
 * the stylesheet uses to drop `.dh-header__nav`, so the markup and the layout
 * change together instead of one breakpoint apart.
 */
export const compactShellQuery = '(max-width: 56rem)';

/**
 * True while the shell is narrow enough that the header carries only the brand
 * lockup and the burger. The search field, the navigation entries and the
 * preference controls are then rendered by the drawer alone rather than hidden
 * with CSS, so nothing is present twice and no `id` is duplicated.
 */
export function useCompactShell(): boolean {
  /* Read on the first render, not in an effect: a narrow visitor would otherwise
     see one frame of the wide header — search field and all — before it left. */
  const [compact, setCompact] = useState(
    () => typeof globalThis.matchMedia === 'function' && globalThis.matchMedia(compactShellQuery).matches,
  );

  useEffect(() => {
    if (typeof globalThis.matchMedia !== 'function') {
      return undefined;
    }
    const viewport = globalThis.matchMedia(compactShellQuery);
    const update = () => {
      setCompact(viewport.matches);
    };
    update();
    viewport.addEventListener('change', update);
    return () => {
      viewport.removeEventListener('change', update);
    };
  }, []);

  return compact;
}

/** The glyphs the marketplace navigation entries are allowed to carry. */
export type MarketplaceNavIcon =
  'account' | 'cart' | 'contract' | 'heart' | 'home' | 'orders' | 'plus' | 'produce' | 'shield';

/**
 * One navigation destination, derived once so the header row and the drawer
 * offer exactly the same set under exactly the same conditions. An entry that
 * the header would hide — a create-listing entry for a buyer, deals for a
 * signed-out visitor — is absent from this list and therefore absent from both.
 */
export interface MarketplaceNavEntry {
  active: boolean;
  badge?: number;
  /** What the badge counts, said in words, because the glyph and the digit cannot. */
  badgeLabel?: string;
  /**
   * The complete wording, for an action whose name does not fit the header's
   * caption budget. The drawer has the width for it and always prints it.
   */
  fullLabel?: string;
  icon: MarketplaceNavIcon;
  label: string;
  /** The address the entry opens, and its stable key. */
  path: string;
}

export interface MarketplaceSearchProps {
  /**
   * The control's own id. Only one search field is ever mounted — the header's
   * above the breakpoint, the drawer's below it — but each names its own label
   * and suggestion list rather than borrowing the other's.
   */
  inputId?: string;
  onSearch: (event: SyntheticEvent<HTMLFormElement>) => void;
  onSelectSuggestion: (suggestion: MarketplacePublicSuggestionDto) => void;
  search: string;
  setSearch: (value: string) => void;
  suggestions: Resource<MarketplacePublicSuggestionDto[]>;
  t: MarketplaceTranslate;
}

/**
 * The marketplace search: the field, its submit action, its loading and
 * unavailable states, and the suggestion list. The header and the drawer render
 * this same component, so the drawer's search is the search rather than a
 * reduced copy of it.
 */
export function MarketplaceSearch({
  inputId = 'dh-search',
  onSearch,
  onSelectSuggestion,
  search,
  setSearch,
  suggestions,
  t,
}: Readonly<MarketplaceSearchProps>) {
  return (
    <div className="dh-search-shell">
      <form className="dh-search" onSubmit={onSearch} role="search">
        <label className="dh-sr-only" htmlFor={inputId}>
          {t('agritech.marketplace.search')}
        </label>
        <input
          autoComplete="off"
          id={inputId}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
          placeholder={t('agritech.marketplace.search')}
          type="search"
          value={search}
        />
        <button aria-label={t('agritech.marketplace.search')} type="submit">
          <MarketplaceIcon name="search" />
        </button>
      </form>
      {suggestions.status === 'loading' ? (
        <span aria-live="polite" className="dh-search-state" role="status">
          {t('agritech.marketplace.search.loading')}
        </span>
      ) : null}
      {suggestions.status === 'error' ? (
        <span aria-live="polite" className="dh-search-state dh-search-state--error" role="status">
          {t('agritech.marketplace.search.unavailable')}
        </span>
      ) : null}
      {suggestions.status === 'ready' ? (
        <ul
          aria-label={t('agritech.marketplace.search.suggestions')}
          aria-live="polite"
          className="dh-search-suggestions"
          id={`${inputId}-suggestions`}
        >
          {suggestions.data.map((suggestion) => (
            <li key={`${suggestion.kind}:${suggestion.id}`}>
              <button
                onClick={() => {
                  onSelectSuggestion(suggestion);
                }}
                type="button"
              >
                <span>{suggestion.label}</span>
                <small>{t(`agritech.marketplace.search.kind.${suggestion.kind}`)}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The drawer only ever contains focusable controls of these kinds. */
const focusableSelector =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/*
 * The panel's own elements in document order, then filtered. A comma-separated
 * selector is not guaranteed to come back in document order — nwsapi returns it
 * grouped by branch, which puts the search field at the end of the ring instead
 * of second — so the walk asks for every element and tests each one.
 */
const focusableWithin = (panel: HTMLElement | null): HTMLElement[] =>
  [...(panel?.querySelectorAll<HTMLElement>('*') ?? [])].filter(
    (element) =>
      element.matches(focusableSelector) && !element.hidden && element.getAttribute('aria-hidden') !== 'true',
  );

/**
 * Keeps Tab inside the open drawer. Follows the AI panel's own trap rather than
 * introducing a second pattern: focus that has escaped the panel is pulled back
 * to whichever end the direction of travel implies.
 */
const trapFocus = (panel: HTMLElement | null, event: KeyboardEvent): void => {
  const focusable = focusableWithin(panel);
  const first = focusable.at(0);
  const last = focusable.at(-1);
  if (!first || !last) {
    event.preventDefault();
    return;
  }
  const active = document.activeElement;
  const outside = !panel?.contains(active);
  if (event.shiftKey ? active === first || outside : active === last || outside) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
};

/*
 * Where the panel is mounted. The header is a sticky, z-indexed stacking
 * context, so a panel left inside it could not paint above the toasts or the AI
 * panel that sit beside the header. It moves up to the marketplace root — a
 * sibling of the header rather than a descendant — because that root is also
 * where the palette custom properties are declared; mounting on the document
 * body instead would leave every colour token undefined.
 */
const portalTarget = (burger: HTMLElement | null): HTMLElement =>
  burger?.closest<HTMLElement>('.dh-marketplace') ?? document.body;

/** A counter names what it counts when the entry says what that is. */
const badgeAttributes = (badgeLabel?: string) => (badgeLabel ? { 'aria-label': badgeLabel } : {});

interface MarketplaceMobileDrawerProps {
  activeSection: MarketplaceSection;
  /** True while the catalog route is open, so a section chip can mark itself current. */
  catalogView: boolean;
  entries: readonly MarketplaceNavEntry[];
  navigate: MarketplaceNavigate;
  search: MarketplaceSearchProps;
  t: MarketplaceTranslate;
}

/**
 * The narrow-viewport header's second half: a burger beside the brand lockup,
 * and the panel it opens. The panel is a modal dialog — it is named, it traps
 * Tab, Escape and a tap outside dismiss it, focus returns to the burger, and the
 * page behind it does not scroll — because that is what the AI panel and the
 * image viewer already are on this product.
 */
export function MarketplaceMobileDrawer({
  activeSection,
  catalogView,
  entries,
  navigate,
  search,
  t,
}: Readonly<MarketplaceMobileDrawerProps>) {
  const [open, setOpen] = useState(false);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    globalThis.setTimeout(() => burgerRef.current?.focus(), 0);
  }, []);

  /* Navigating dismisses the panel: a visitor who taps Cart lands on the cart
     with the drawer gone and the page scrolling again. */
  const go = useCallback(
    (to: string) => {
      close();
      navigate(to);
    },
    [close, navigate],
  );

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    /* The close control, not the search field: opening a navigation panel must
       not summon the on-screen keyboard before the visitor has asked to type. */
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === 'Tab') {
        trapFocus(panelRef.current, event);
      }
    };
    globalThis.addEventListener('keydown', onKeyDown);
    return () => {
      globalThis.removeEventListener('keydown', onKeyDown);
    };
  }, [close, open]);

  /* The page behind the panel must not scroll, and it must scroll again even
     when a navigation unmounts the whole shell while the panel is still open. */
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const { body } = document;
    const restored = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = restored;
    };
  }, [open]);

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={open ? t('agritech.marketplace.menu.close') : t('agritech.marketplace.menu.open')}
        className="dh-burger"
        onClick={() => {
          setOpen((value) => !value);
        }}
        ref={burgerRef}
        type="button"
      >
        <MarketplaceIcon name={open ? 'close' : 'menu'} />
      </button>
      {open &&
        createPortal(
          <>
            <button
              aria-label={t('agritech.marketplace.menu.close')}
              className="dh-drawer-backdrop"
              onClick={close}
              tabIndex={-1}
              type="button"
            />
            <aside
              aria-label={t('agritech.marketplace.menu.title')}
              aria-modal="true"
              className="dh-drawer"
              ref={panelRef}
              role="dialog"
            >
              <header className="dh-drawer__head">
                <strong>{t('agritech.marketplace.menu.title')}</strong>
                <button
                  aria-label={t('agritech.marketplace.menu.close')}
                  className="dh-icon-button"
                  onClick={close}
                  ref={closeRef}
                  type="button"
                >
                  <MarketplaceIcon name="close" />
                </button>
              </header>
              <div className="dh-drawer__body">
                <MarketplaceSearch {...search} inputId="dh-drawer-search" />
                <nav aria-label={t('agritech.marketplace.accessibility.mobileNavigation')} className="dh-drawer__nav">
                  {entries.map((entry) => (
                    <button
                      aria-current={entry.active ? 'page' : undefined}
                      className={entry.active ? 'is-active' : undefined}
                      key={entry.path}
                      onClick={() => {
                        go(entry.path);
                      }}
                      type="button"
                    >
                      <span>
                        <MarketplaceIcon name={entry.icon} />
                      </span>
                      <small>{entry.fullLabel ?? entry.label}</small>
                      {entry.badge ? <em {...badgeAttributes(entry.badgeLabel)}>{entry.badge}</em> : null}
                    </button>
                  ))}
                </nav>
                <nav aria-label={t('agritech.marketplace.catalog.categories')} className="dh-drawer__sections">
                  {(['all', 'equipment', 'seeds', 'produce'] as const).map((section) => (
                    <button
                      aria-current={catalogView && activeSection === section}
                      key={section}
                      onClick={() => {
                        go(section === 'all' ? '/catalog' : `/catalog?section=${section}`);
                      }}
                      type="button"
                    >
                      {t(`agritech.marketplace.section.${section}`)}
                    </button>
                  ))}
                </nav>
                {/* The language control has nowhere else to live once the header
                  keeps only the lockup and the burger, so the drawer keeps it. */}
                <div className="dh-drawer__preferences">
                  <LanguageSwitcher compact variant="menu" />
                </div>
              </div>
            </aside>
          </>,
          portalTarget(burgerRef.current),
        )}
    </>
  );
}
