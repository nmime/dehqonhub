import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import type { Locale } from '@app/frontend-runtime';
import type { AiConsultationViewDto, ProductViewDto } from '@app/frontend-api-client';
import { MarketplaceIcon } from './marketplace-icon';
import { ProductMedia } from './marketplace-product-card';
import { localizedProductName, type MarketplaceTranslate } from './marketplace-ui';

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

type ChatMessage =
  | { id: string; role: 'user'; text: string }
  | { answer?: AiConsultationViewDto; id: string; role: 'assistant'; translationKey: string };

interface MarketplaceAiProps {
  locale: Locale;
  onAsk: (question: string, kind: AiKind) => Promise<AiConsultationViewDto>;
  onOpenProduct: (product: ProductViewDto) => void;
  products: ProductViewDto[];
  t: MarketplaceTranslate;
}

export function MarketplaceAi({ locale, onAsk, onOpenProduct, products, t }: Readonly<MarketplaceAiProps>) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setOpen(false);
    globalThis.setTimeout(() => buttonRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    globalThis.addEventListener('keydown', onKeyDown);
    return () => {
      globalThis.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

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
        answer.productIds.length === 0 ? 'agritech.marketplace.ai.noMatch' : resultKeys[answer.kind];
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
        <aside aria-label={t('agritech.marketplace.ai.title')} aria-modal="false" className="dh-ai-panel" role="dialog">
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
                <h2>{t('agritech.marketplace.ai.welcome')}</h2>
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
              const referenced =
                (message.role === 'assistant' ? message.answer?.productIds : undefined)
                  ?.map((id) => products.find((product) => product.id === id))
                  .filter((product): product is ProductViewDto => Boolean(product)) ?? [];
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
                </div>
              );
            })}
            {pending && (
              <div className="dh-ai-typing">
                <span />
                <span />
                <span />
                <em>{t('agritech.marketplace.ai.loading')}</em>
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
            <button
              aria-label={t('agritech.marketplace.ai.send')}
              className="dh-icon-button dh-icon-button--primary"
              disabled={!question.trim() || pending}
              type="submit"
            >
              <MarketplaceIcon name="send" />
            </button>
          </form>
          <p className="dh-ai-panel__fine-print">{t('agritech.marketplace.ai.noAutonomousActions')}</p>
        </aside>
      )}
    </>
  );
}
