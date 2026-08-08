// REQ-AGRITECH-WEB-006: enrollment renders real request loading, failure, and success states.
import { useState, type SubmitEvent } from 'react';
import { observer, useI18n } from '@app/frontend-runtime';
import { throwOnOpenApiErrorData, useUserApiClient, type CreateFarmerDto } from '@app/frontend-api-client';
import { UiButton, UiCard, UiSection, UiTextField } from '../../../shared/ui';

const REGIONS = [
  'Toshkent shahri',
  'Toshkent viloyati',
  'Samarqand viloyati',
  'Andijon viloyati',
  "Farg'ona viloyati",
  'Namangan viloyati',
  'Buxoro viloyati',
  'Qashqadaryo viloyati',
  'Surxondaryo viloyati',
  'Xorazm viloyati',
  'Navoiy viloyati',
  'Jizzax viloyati',
  'Sirdaryo viloyati',
  "Qoraqalpog'iston Respublikasi",
] as const;
const CROPS = ['cotton', 'wheat', 'fruit', 'vegetable', 'potato', 'rice', 'other'] as const;

export const FarmerRegisterPage = observer(function FarmerRegisterPage() {
  const { t } = useI18n();
  const { api, requestOptions } = useUserApiClient();
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [formData, setFormData] = useState({
    phone: '',
    firstName: '',
    lastName: '',
    region: '',
    district: '',
    village: '',
    farmSizeHectares: '',
    crops: [] as CreateFarmerDto['crops'],
    telegramId: '',
  });

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('loading');
    const body: CreateFarmerDto = {
      phone: formData.phone,
      firstName: formData.firstName,
      lastName: formData.lastName,
      region: formData.region as CreateFarmerDto['region'],
      farmSizeHectares: Number(formData.farmSizeHectares),
      crops: formData.crops,
      district: formData.district || undefined,
      village: formData.village || undefined,
      telegramId: formData.telegramId || undefined,
    };
    try {
      await throwOnOpenApiErrorData(api.farmerControllerCreate(body, requestOptions));
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  const toggleCrop = (crop: CreateFarmerDto['crops'][number]) => {
    setFormData((previous) => ({
      ...previous,
      crops: previous.crops.includes(crop) ? previous.crops.filter((item) => item !== crop) : [...previous.crops, crop],
    }));
  };

  if (status === 'success') {
    return (
      <UiSection className="farmer-register" title={t('farmer.register.title')}>
        <UiCard>
          <p role="status">{t('farmer.register.success')}</p>
          <UiButton href="/dashboard" variant="primary">
            {t('farmer.register.dashboard')}
          </UiButton>
        </UiCard>
      </UiSection>
    );
  }

  return (
    <UiSection className="farmer-register" title={t('farmer.register.title')}>
      <UiCard>
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          {status === 'error' && <p role="alert">{t('farmer.register.error')}</p>}
          <UiTextField
            label={t('farmer.register.phone')}
            name="phone"
            type="tel"
            placeholder="+998901234567"
            required
            value={formData.phone}
            onChange={(event) => {
              setFormData({ ...formData, phone: event.target.value });
            }}
          />
          <UiTextField
            label={t('farmer.register.firstName')}
            name="firstName"
            required
            value={formData.firstName}
            onChange={(event) => {
              setFormData({ ...formData, firstName: event.target.value });
            }}
          />
          <UiTextField
            label={t('farmer.register.lastName')}
            name="lastName"
            required
            value={formData.lastName}
            onChange={(event) => {
              setFormData({ ...formData, lastName: event.target.value });
            }}
          />
          <label>
            {t('farmer.register.region')}
            <select
              required
              value={formData.region}
              onChange={(event) => {
                setFormData({ ...formData, region: event.target.value });
              }}
            >
              <option value="">{t('farmer.register.selectRegion')}</option>
              {REGIONS.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </label>
          <UiTextField
            label={t('farmer.register.district')}
            name="district"
            value={formData.district}
            onChange={(event) => {
              setFormData({ ...formData, district: event.target.value });
            }}
          />
          <UiTextField
            label={t('farmer.register.village')}
            name="village"
            value={formData.village}
            onChange={(event) => {
              setFormData({ ...formData, village: event.target.value });
            }}
          />
          <UiTextField
            label={t('farmer.register.farmSize')}
            name="farmSizeHectares"
            type="number"
            step="0.01"
            min="0.01"
            required
            value={formData.farmSizeHectares}
            onChange={(event) => {
              setFormData({ ...formData, farmSizeHectares: event.target.value });
            }}
          />
          <fieldset>
            <legend>{t('farmer.register.crops')}</legend>
            {CROPS.map((crop) => (
              <label key={crop} style={{ marginRight: '1rem' }}>
                <input
                  type="checkbox"
                  checked={formData.crops.includes(crop)}
                  onChange={() => {
                    toggleCrop(crop);
                  }}
                />{' '}
                {crop}
              </label>
            ))}
          </fieldset>
          <UiTextField
            label={t('farmer.register.telegram')}
            name="telegramId"
            value={formData.telegramId}
            onChange={(event) => {
              setFormData({ ...formData, telegramId: event.target.value });
            }}
          />
          <UiButton type="submit" variant="primary" disabled={status === 'loading'}>
            {status === 'loading' ? t('common.loading') : t('farmer.register.submit')}
          </UiButton>
        </form>
      </UiCard>
    </UiSection>
  );
});
