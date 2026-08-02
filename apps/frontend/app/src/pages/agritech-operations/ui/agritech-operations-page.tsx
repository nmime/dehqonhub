// @requirements REQ-AGRITECH-WEB-006 REQ-AGRITECH-PARTNER-007 REQ-AGRITECH-OUTPUT-008 REQ-AGRITECH-PAYMENT-004 REQ-AGRITECH-ADVISORY-009
import { useCallback, useEffect, useState, type SubmitEvent } from 'react';
import { observer, useI18n } from '@app/frontend-runtime';
import {
  throwOnOpenApiErrorData,
  useUserApiClient,
  type AdvisoryViewDto,
  type DeliveryViewDto,
  type PartnerViewDto,
  type PriceDiscoveryViewDto,
  type ProduceListingViewDto,
  type SupplierProductViewDto,
} from '@app/frontend-api-client';
import { UiButton, UiCard, UiForm, UiSection, UiTextField } from '../../../shared/ui';

type LoadState = 'loading' | 'ready' | 'error';

function formText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

export const AgriTechOperationsPage = observer(function AgriTechOperationsPage() {
  const { t, locale } = useI18n();
  const { api, requestOptions } = useUserApiClient();
  const [state, setState] = useState<LoadState>('loading');
  const [notice, setNotice] = useState('');
  const [partners, setPartners] = useState<PartnerViewDto[]>([]);
  const [products, setProducts] = useState<SupplierProductViewDto[]>([]);
  const [produce, setProduce] = useState<ProduceListingViewDto[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryViewDto[]>([]);
  const [advisories, setAdvisories] = useState<AdvisoryViewDto[]>([]);
  const [price, setPrice] = useState<PriceDiscoveryViewDto>();
  const [orderId, setOrderId] = useState('');

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [partnerData, productData, produceData, deliveryData] = await Promise.all([
        throwOnOpenApiErrorData(api.agriTechOperationsControllerListPartners(requestOptions)),
        throwOnOpenApiErrorData(api.agriTechOperationsControllerListSupplierProducts(requestOptions)),
        throwOnOpenApiErrorData(api.agriTechOperationsControllerListProduce({}, requestOptions)),
        throwOnOpenApiErrorData(api.agriTechOperationsControllerListDeliveries(requestOptions)),
      ]);
      setPartners(partnerData.items);
      setProducts(productData.items);
      setProduce(produceData.items);
      setDeliveries(deliveryData.items);
      try {
        const advisoryData = await throwOnOpenApiErrorData(
          api.agriTechOperationsControllerListAdvisories(requestOptions),
        );
        setAdvisories(advisoryData.items);
      } catch {
        setAdvisories([]);
      }
      setState('ready');
    } catch {
      setState('error');
    }
  }, [api, requestOptions]);

  useEffect(() => {
    void load();
  }, [load]);

  const complete = async (operation: () => Promise<unknown>) => {
    setNotice('');
    try {
      await operation();
      setNotice(t('agritech.portal.saved'));
      await load();
    } catch {
      setNotice(t('agritech.portal.actionError'));
    }
  };

  const submitPartner = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void complete(() =>
      throwOnOpenApiErrorData(
        api.agriTechOperationsControllerCreatePartner(
          {
            kind: formText(form, 'kind') as 'supplier' | 'buyer',
            legalName: formText(form, 'legalName'),
            taxId: formText(form, 'taxId'),
            phone: formText(form, 'phone'),
            region: formText(form, 'region'),
          },
          requestOptions,
        ),
      ),
    );
  };

  const submitProduct = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const supplier = partners.find((partner) => partner.kind === 'supplier' && partner.status === 'approved');
    if (!supplier) {
      setNotice(t('agritech.portal.approvalRequired'));
      return;
    }
    void complete(() =>
      throwOnOpenApiErrorData(
        api.agriTechOperationsControllerCreateSupplierProduct(
          {
            partnerId: supplier.id,
            name: formText(form, 'name'),
            category: formText(form, 'category') as
              'fertilizer' | 'seed' | 'pesticide' | 'equipment' | 'irrigation' | 'other',
            description: formText(form, 'description'),
            priceUzs: Number(form.get('priceUzs')),
            unit: formText(form, 'unit'),
            stockQuantity: Number(form.get('stockQuantity')),
            region: formText(form, 'region'),
          },
          requestOptions,
        ),
      ),
    );
  };

  const updateProduct = (productId: string, event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void complete(() =>
      throwOnOpenApiErrorData(
        api.agriTechOperationsControllerUpdateSupplierProduct(
          productId,
          {
            priceUzs: Number(form.get('priceUzs')),
            stockQuantity: Number(form.get('stockQuantity')),
            status: formText(form, 'status') as 'active' | 'inactive' | 'out_of_stock',
          },
          requestOptions,
        ),
      ),
    );
  };

  const submitProduce = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void complete(() =>
      throwOnOpenApiErrorData(
        api.agriTechOperationsControllerCreateProduce(
          {
            crop: formText(form, 'crop'),
            grade: formText(form, 'grade') as 'A' | 'B' | 'C',
            quantityKg: Number(form.get('quantityKg')),
            pricePerKgUzs: Number(form.get('pricePerKgUzs')),
            region: formText(form, 'region'),
            availableFrom: new Date().toISOString(),
            availableUntil: formText(form, 'availableUntil'),
          },
          requestOptions,
        ),
      ),
    );
  };

  const reserve = (listing: ProduceListingViewDto, event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const buyer = partners.find((partner) => partner.kind === 'buyer' && partner.status === 'approved');
    if (!buyer) {
      setNotice(t('agritech.portal.approvalRequired'));
      return;
    }
    const form = new FormData(event.currentTarget);
    void complete(async () => {
      const reservation = await throwOnOpenApiErrorData(
        api.agriTechOperationsControllerReserveProduce(
          listing.id,
          {
            partnerId: buyer.id,
            quantityKg: Number(form.get('quantityKg')),
            deliveryAddress: formText(form, 'deliveryAddress'),
          },
          requestOptions,
        ),
      );
      setOrderId(reservation.orderId);
      return reservation;
    });
  };

  const discoverPrice = (listing: ProduceListingViewDto) => {
    void complete(async () => {
      const result = await throwOnOpenApiErrorData(
        api.agriTechOperationsControllerDiscoverPrice(
          { crop: listing.crop, region: listing.region, grade: listing.grade },
          requestOptions,
        ),
      );
      setPrice(result);
      return result;
    });
  };

  const pay = (provider: 'click' | 'payme' | 'bnpl') => {
    void complete(async () => {
      const handoff = await throwOnOpenApiErrorData(
        api.paymentControllerCreate(
          {
            orderId,
            provider,
            returnUrl: `${globalThis.location.origin}/`,
            idempotencyKey: `${provider}:${orderId}`,
            locale,
          },
          requestOptions,
        ),
      );
      globalThis.location.assign(handoff.checkoutUrl);
    });
  };

  return (
    <UiSection eyebrow={t('agritech.brand')} headingLevel={1} title={t('agritech.portal.title')}>
      <p>{t('agritech.portal.description')}</p>
      {state === 'loading' && <p role="status">{t('common.loading')}</p>}
      {state === 'error' && (
        <UiCard>
          <p role="alert">{t('agritech.portal.loadError')}</p>
          <UiButton onClick={() => void load()}>{t('ui.runtime.retry')}</UiButton>
        </UiCard>
      )}
      {notice && <p role="status">{notice}</p>}
      {state === 'ready' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <UiCard title={t('agritech.portal.partners')}>
            <UiForm onSubmit={submitPartner}>
              <select aria-label={t('agritech.portal.kind')} name="kind" required>
                <option value="supplier">{t('agritech.portal.supplier')}</option>
                <option value="buyer">{t('agritech.portal.buyer')}</option>
              </select>
              <UiTextField label={t('agritech.portal.legalName')} name="legalName" required />
              <UiTextField label={t('agritech.portal.taxId')} name="taxId" required />
              <UiTextField label={t('farmer.register.phone')} name="phone" required />
              <UiTextField label={t('farmer.register.region')} name="region" required />
              <UiButton type="submit">{t('agritech.portal.registerPartner')}</UiButton>
            </UiForm>
            {partners.map((partner) => (
              <p key={partner.id}>
                {partner.legalName} · {partner.kind} · {partner.status}
              </p>
            ))}
          </UiCard>

          <UiCard title={t('agritech.portal.inventory')}>
            <UiForm onSubmit={submitProduct}>
              <UiTextField label={t('agritech.portal.productName')} name="name" required />
              <label>
                {t('agritech.portal.category')}
                <select name="category" required>
                  {(['fertilizer', 'seed', 'pesticide', 'equipment', 'irrigation', 'other'] as const).map(
                    (category) => (
                      <option key={category} value={category}>
                        {t(`agritech.portal.category.${category}`)}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <UiTextField label={t('agritech.portal.descriptionField')} name="description" required />
              <UiTextField label={t('product.price')} min={0} name="priceUzs" required type="number" />
              <UiTextField label={t('agritech.portal.unit')} name="unit" required />
              <UiTextField label={t('product.stock')} min={0} name="stockQuantity" required type="number" />
              <UiTextField label={t('farmer.register.region')} name="region" required />
              <UiButton type="submit">{t('agritech.portal.publish')}</UiButton>
            </UiForm>
            {products.map((product) => (
              <div key={product.id}>
                <p>
                  {product.name} · {product.stockQuantity} {product.unit} · {product.priceUzs} UZS · {product.status}
                </p>
                <UiForm
                  onSubmit={(event) => {
                    updateProduct(product.id, event);
                  }}
                >
                  <UiTextField
                    defaultValue={product.priceUzs}
                    label={t('product.price')}
                    min={0}
                    name="priceUzs"
                    required
                    type="number"
                  />
                  <UiTextField
                    defaultValue={product.stockQuantity}
                    label={t('product.stock')}
                    min={0}
                    name="stockQuantity"
                    required
                    type="number"
                  />
                  <label>
                    {t('agritech.portal.inventoryStatus')}
                    <select defaultValue={product.status} name="status" required>
                      {(['active', 'inactive', 'out_of_stock'] as const).map((status) => (
                        <option key={status} value={status}>
                          {t(`agritech.portal.inventoryStatus.${status}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <UiButton type="submit">{t('agritech.portal.updateInventory')}</UiButton>
                </UiForm>
              </div>
            ))}
          </UiCard>

          <UiCard title={t('agritech.portal.produce')}>
            <UiForm onSubmit={submitProduce}>
              <UiTextField label={t('agritech.portal.crop')} name="crop" required />
              <label>
                {t('agritech.portal.grade')}
                <select name="grade" required>
                  {(['A', 'B', 'C'] as const).map((grade) => (
                    <option key={grade} value={grade}>
                      {grade}
                    </option>
                  ))}
                </select>
              </label>
              <UiTextField label={t('agritech.portal.quantityKg')} min={1} name="quantityKg" required type="number" />
              <UiTextField label={t('agritech.portal.priceKg')} min={1} name="pricePerKgUzs" required type="number" />
              <UiTextField label={t('farmer.register.region')} name="region" required />
              <UiTextField
                label={t('agritech.portal.availableUntil')}
                name="availableUntil"
                required
                type="datetime-local"
              />
              <UiButton type="submit">{t('agritech.portal.publish')}</UiButton>
            </UiForm>
            {produce.length === 0 && <p role="status">{t('agritech.portal.empty')}</p>}
            {produce.map((listing) => (
              <div key={listing.id}>
                <p>
                  {listing.crop} · {listing.grade} · {listing.availableQuantityKg} kg · {listing.pricePerKgUzs} UZS
                </p>
                <UiButton
                  onClick={() => {
                    discoverPrice(listing);
                  }}
                >
                  {t('agritech.portal.discoverPrice')}
                </UiButton>
                <UiForm
                  onSubmit={(event) => {
                    reserve(listing, event);
                  }}
                >
                  <UiTextField
                    defaultValue={1}
                    label={t('agritech.portal.reserveQuantityKg')}
                    max={listing.availableQuantityKg}
                    min={1}
                    name="quantityKg"
                    required
                    type="number"
                  />
                  <UiTextField
                    defaultValue={partners.find((partner) => partner.kind === 'buyer')?.region}
                    label={t('agritech.portal.deliveryAddress')}
                    name="deliveryAddress"
                    required
                  />
                  <UiButton type="submit">{t('agritech.portal.reserve')}</UiButton>
                </UiForm>
              </div>
            ))}
            {price && (
              <p>
                {t('agritech.portal.priceRange', {
                  min: price.minimumUzs,
                  median: price.medianUzs,
                  max: price.maximumUzs,
                })}
              </p>
            )}
          </UiCard>

          {orderId && (
            <UiCard title={t('agritech.portal.payment')}>
              <p>
                {t('order.id')}: {orderId}
              </p>
              {(['click', 'payme', 'bnpl'] as const).map((provider) => (
                <UiButton
                  key={provider}
                  onClick={() => {
                    pay(provider);
                  }}
                >
                  {provider}
                </UiButton>
              ))}
            </UiCard>
          )}

          <UiCard title={t('agritech.portal.deliveries')}>
            {deliveries.length === 0 ? (
              <p>{t('agritech.portal.empty')}</p>
            ) : (
              deliveries.map((item) => (
                <p key={item.id}>
                  {item.orderId} · {item.status}
                </p>
              ))
            )}
          </UiCard>
          <UiCard title={t('agritech.portal.advisories')}>
            {advisories.length === 0 ? (
              <p>{t('agritech.portal.empty')}</p>
            ) : (
              advisories.map((item) => (
                <p key={item.id}>
                  {item.kind} · {item.summary} · {item.stale ? t('agritech.portal.stale') : t('common.ready')}
                </p>
              ))
            )}
          </UiCard>
        </div>
      )}
    </UiSection>
  );
});
