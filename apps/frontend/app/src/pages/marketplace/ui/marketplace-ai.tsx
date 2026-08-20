import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import type { Locale } from '@app/frontend-runtime';
import type { MarketplaceAiConsultationDto } from '@app/frontend-api-client';
import { MarketplaceIcon } from './marketplace-icon';
import { MarketplaceBusyButton, SkeletonLine, useDeferredBusy } from './marketplace-loading';
import { ProductMedia } from './marketplace-product-card';
import { localizedProductName, type MarketplaceListing, type MarketplaceTranslate } from './marketplace-ui';

type AiKind = 'find_cheaper' | 'generic' | 'recommendation' | 'season_advice';

const quickPrompts: ReadonlyArray<readonly [AiKind, string]> = [
  ['recommendation', 'agritech.marketplace.ai.q.recommend'],
  ['recommendation', 'agritech.marketplace.ai.q.beginner'],
  ['find_cheaper', 'agritech.marketplace.ai.q.cheaper'],
];

const resultKeys: Record<AiKind, string> = {
  find_cheaper: 'agritech.marketplace.ai.result.findCheaper',
  generic: 'agritech.marketplace.ai.result.generic',
  recommendation: 'agritech.marketplace.ai.result.recommendation',
  season_advice: 'agritech.marketplace.ai.result.seasonAdvice',
};

const ignoreStarterCartConfirmation = () => Promise.resolve(false);

type ChatMessage =
  | { id: string; role: 'user'; text: string }
  | { answer?: MarketplaceAiConsultationDto; id: string; role: 'assistant'; translationKey: string };

interface MarketplaceAiProps {
  canConfirmStarterCart?: boolean;
  locale: Locale;
  onAsk: (question: string, kind: AiKind) => Promise<MarketplaceAiConsultationDto>;
  onConfirmStarterCart?: (consultation: MarketplaceAiConsultationDto) => Promise<boolean>;
  onOpenProduct: (product: MarketplaceListing) => void;
  products: MarketplaceListing[];
  t: MarketplaceTranslate;
}

export function MarketplaceAi({
  canConfirmStarterCart = true,
  locale,
  onAsk,
  onConfirmStarterCart = ignoreStarterCartConfirmation,
  onOpenProduct,
  products,
  t,
}: Readonly<MarketplaceAiProps>) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [confirmedConsultations, setConfirmedConsultations] = useState<ReadonlySet<string>>(new Set());
  const [confirmingConsultationId, setConfirmingConsultationId] = useState<string>();
  /*
   * The panel's own anti-flicker gate. A grounded answer that returns from cache
   * inside a frame or two used to paint the typing row and remove it again, which
   * reads as a rendering fault rather than as work; the default policy holds the
   * row back for 120 ms and then keeps it for at least 320 ms.
   */
  const working = useDeferredBusy(pending);
  const [mobileModal, setMobileModal] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    globalThis.setTimeout(() => buttonRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (typeof globalThis.matchMedia !== 'function') {
      return undefined;
    }
    const mobileViewport = globalThis.matchMedia('(max-width: 48rem)');
    const updateModalMode = () => {
      setMobileModal(mobileViewport.matches);
    };
    updateModalMode();
    mobileViewport.addEventListener('change', updateModalMode);
    return () => {
      mobileViewport.removeEventListener('change', updateModalMode);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        return;
      }
      if (event.key !== 'Tab' || !mobileModal) {
        return;
      }
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && (document.activeElement === first || !panelRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    globalThis.addEventListener('keydown', onKeyDown);
    return () => {
      globalThis.removeEventListener('keydown', onKeyDown);
    };
  }, [close, mobileModal, open]);

  const ask = async (text: string, kind: AiKind) => {
    const normalized = text.trim();
    if (!normalized || pending) {
      return;
    }
    setMessages((value) => [...value, { id: `user-${Date.now()}`, role: 'user', text: normalized }]);
    setQuestion('');
    setPending(true);
    try {
      const answer = await onAsk(normalized, kind);
      const translationKey =
        answer.response.recommendations.length === 0 ? 'agritech.marketplace.ai.noMatch' : resultKeys[answer.kind];
      setMessages((value) => [...value, { answer, id: answer.id, role: 'assistant', translationKey }]);
    } catch {
      setMessages((value) => [
        ...value,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          translationKey: 'agritech.marketplace.ai.unavailable',
        },
      ]);
    } finally {
      setPending(false);
    }
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    void ask(question, 'generic');
  };

  const confirmStarterCart = useCallback(
    async (answer: MarketplaceAiConsultationDto) => {
      setPending(true);
      setConfirmingConsultationId(answer.id);
      const confirmed = await onConfirmStarterCart(answer);
      if (confirmed) {
        setConfirmedConsultations((value) => new Set([...value, answer.id]));
      }
      setConfirmingConsultationId(undefined);
      setPending(false);
    },
    [onConfirmStarterCart],
  );

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={open ? t('agritech.marketplace.ai.close') : t('agritech.marketplace.ai.open')}
        className="dh-ai-fab"
        onClick={() => {
          setOpen((value) => !value);
        }}
        ref={buttonRef}
        type="button"
      >
        <MarketplaceIcon name={open ? 'close' : 'spark'} />
        <span>{t('agritech.marketplace.ai.shortTitle')}</span>
      </button>
      {open && (
        <>
          {mobileModal && (
            <button
              aria-label={t('agritech.marketplace.ai.close')}
              className="dh-ai-backdrop"
              onClick={close}
              tabIndex={-1}
              type="button"
            />
          )}
          <aside
            aria-label={t('agritech.marketplace.ai.title')}
            aria-modal={mobileModal ? 'true' : 'false'}
            className="dh-ai-panel"
            ref={panelRef}
            role="dialog"
          >
            <header>
              <span className="dh-ai-panel__mark">
                <MarketplaceIcon name="spark" />
              </span>
              <div>
                <strong>{t('agritech.marketplace.ai.title')}</strong>
                <small>{t('agritech.marketplace.ai.grounded')}</small>
              </div>
              <button
                aria-label={t('agritech.marketplace.ai.close')}
                className="dh-icon-button"
                onClick={close}
                type="button"
              >
                <MarketplaceIcon name="close" />
              </button>
            </header>
            <div aria-live="polite" className="dh-ai-panel__body">
              {messages.length === 0 && (
                <div className="dh-ai-welcome">
                  <span>
                    <MarketplaceIcon name="seeds" />
                  </span>
                  {/* Prose, not a heading: the panel is already titled in its header,
                      and an <h2> here inherited the page heading scale, so the opening
                      sentence rendered at 30px inside a 13px bubble. */}
                  <p className="dh-ai-welcome__lead">{t('agritech.marketplace.ai.welcome')}</p>
                  <p>{t('agritech.marketplace.ai.disclosure')}</p>
                </div>
              )}
              <div aria-label={t('agritech.marketplace.ai.quickPrompts')} className="dh-ai-prompts">
                {quickPrompts.map(([kind, key]) => (
                  <button disabled={pending} key={key} onClick={() => void ask(t(key), kind)} type="button">
                    {t(key)}
                  </button>
                ))}
              </div>
              {messages.map((message) => {
                const answer = message.role === 'assistant' ? message.answer : undefined;
                const referenced =
                  answer?.listingPublicationIds
                    .map((id) => products.find((product) => product.id === id))
                    .filter((product): product is MarketplaceListing => Boolean(product)) ?? [];
                const showStarterCartConfirmation =
                  canConfirmStarterCart &&
                  answer?.response.starterCartPreview.status === 'requires_confirmation' &&
                  !answer.confirmedAt;
                const starterCartConfirmed = answer !== undefined && confirmedConsultations.has(answer.id);
                return (
                  <div className={`dh-ai-message dh-ai-message--${message.role}`} key={message.id}>
                    <p>{message.role === 'assistant' ? t(message.translationKey) : message.text}</p>
                    {referenced.length > 0 && (
                      <div className="dh-ai-products">
                        {referenced.map((product) => (
                          <button
                            key={product.id}
                            onClick={() => {
                              onOpenProduct(product);
                            }}
                            type="button"
                          >
                            <ProductMedia compact locale={locale} product={product} t={t} />
                            <span>
                              <strong>{localizedProductName(product, locale)}</strong>
                              <small>{product.supplierName}</small>
                            </span>
                            <MarketplaceIcon name="arrow" />
                          </button>
                        ))}
                      </div>
                    )}
                    {showStarterCartConfirmation && (
                      <MarketplaceBusyButton
                        busy={confirmingConsultationId === answer.id}
                        className="dh-button dh-button--secondary dh-button--block"
                        disabled={pending || starterCartConfirmed}
                        icon="cart"
                        onClick={() => {
                          void confirmStarterCart(answer);
                        }}
                        type="button"
                      >
                        {starterCartConfirmed
                          ? t('agritech.marketplace.ai.starterCart.confirmed')
                          : t('agritech.marketplace.ai.starterCart.confirm')}
                      </MarketplaceBusyButton>
                    )}
                  </div>
                );
              })}
              {working && (
                <div aria-busy="true" className="dh-ai-pending">
                  <div className="dh-ai-typing">
                    <span />
                    <span />
                    <span />
                    <em>{t('agritech.marketplace.ai.loading')}</em>
                  </div>
                  {/* The reply that is coming is a paragraph in an assistant bubble,
                      so the placeholder is that bubble at that height. */}
                  <div aria-hidden="true" className="dh-ai-message dh-ai-message--assistant dh-sk-reply">
                    <SkeletonLine />
                    <SkeletonLine width="wide" />
                    <SkeletonLine width="half" />
                  </div>
                </div>
              )}
            </div>
            <form className="dh-ai-panel__composer" onSubmit={submit}>
              <label className="dh-sr-only" htmlFor="dh-ai-question">
                {t('agritech.marketplace.ai.placeholder')}
              </label>
              <input
                id="dh-ai-question"
                onChange={(event) => {
                  setQuestion(event.target.value);
                }}
                placeholder={t('agritech.marketplace.ai.placeholder')}
                ref={inputRef}
                value={question}
              />
              {/* The panel body is already a polite live region that narrates the
                  request, so this control carries no second announcement. */}
              <MarketplaceBusyButton
                aria-label={t('agritech.marketplace.ai.send')}
                busy={pending}
                className="dh-icon-button dh-icon-button--primary"
                disabled={!question.trim()}
                icon="send"
                type="submit"
              />
            </form>
            <p className="dh-ai-panel__fine-print">{t('agritech.marketplace.ai.noAutonomousActions')}</p>
          </aside>
        </>
      )}
    </>
  );
}
