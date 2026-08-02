import { observer, useI18n } from '@app/frontend-runtime';
import { UiButton, UiCard, UiSection, UiTextField } from '../../../shared/ui';
import { useState } from 'react';

const REGIONS = [
  "Toshkent shahri", "Toshkent viloyati", "Samarqand viloyati",
  "Andijon viloyati", "Farg'ona viloyati", "Namangan viloyati",
  "Buxoro viloyati", "Qashqadaryo viloyati", "Surxondaryo viloyati",
  "Xorazm viloyati", "Navoiy viloyati", "Jizzax viloyati",
  "Sirdaryo viloyati", "Qoraqalpog'iston Respublikasi"
];

const CROPS = ['cotton', 'wheat', 'fruit', 'vegetable', 'potato', 'rice', 'other'];

export const FarmerRegisterPage = observer(function FarmerRegisterPage() {
  const { t } = useI18n();
  const [formData, setFormData] = useState({
    phone: '', firstName: '', lastName: '', region: '', district: '',
    village: '', farmSizeHectares: '', crops: [] as string[], telegramId: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Call API when backend is running
    setSubmitted(true);
  };

  const toggleCrop = (crop: string) => {
    setFormData(prev => ({
      ...prev,
      crops: prev.crops.includes(crop)
        ? prev.crops.filter(c => c !== crop)
        : [...prev.crops, crop]
    }));
  };

  if (submitted) {
    return (
      <UiSection className="farmer-register" title={t('farmer.register.title')}>
        <UiCard>
          <p style={{ color: '#22c55e', fontWeight: 600 }}>Registration submitted! We will verify your account shortly.</p>
          <UiButton href="/dashboard" variant="primary" style={{ marginTop: '1rem' }}>Go to Dashboard</UiButton>
        </UiCard>
      </UiSection>
    );
  }

  return (
    <UiSection className="farmer-register" title={t('farmer.register.title')}>
      <UiCard>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <UiTextField label={t('farmer.register.phone')} name="phone" type="tel" placeholder="+998901234567" required
            value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <UiTextField label={t('farmer.register.firstName')} name="firstName" required
              value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} />
            <UiTextField label={t('farmer.register.lastName')} name="lastName" required
              value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })} />
          </div>
          <select required value={formData.region} onChange={e => setFormData({ ...formData, region: e.target.value })}
            style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #334155', background: '#0f172a', color: '#e5e7eb' }}>
            <option value="">Select Region</option>
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <UiTextField label={t('farmer.register.district')} name="district"
              value={formData.district} onChange={e => setFormData({ ...formData, district: e.target.value })} />
            <UiTextField label={t('farmer.register.village')} name="village"
              value={formData.village} onChange={e => setFormData({ ...formData, village: e.target.value })} />
          </div>
          <UiTextField label={t('farmer.register.farmSize')} name="farmSizeHectares" type="number" step="0.01" min="0.01" required
            value={formData.farmSizeHectares} onChange={e => setFormData({ ...formData, farmSizeHectares: e.target.value })} />
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#94a3b8' }}>{t('farmer.register.crops')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {CROPS.map(crop => (
                <button key={crop} type="button" onClick={() => toggleCrop(crop)}
                  style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', border: 'none', cursor: 'pointer',
                    background: formData.crops.includes(crop) ? '#22c55e' : '#1e293b',
                    color: formData.crops.includes(crop) ? '#000' : '#e5e7eb' }}>
                  {crop}
                </button>
              ))}
            </div>
          </div>
          <UiTextField label="Telegram ID (optional)" name="telegramId" placeholder="@username or numeric ID"
            value={formData.telegramId} onChange={e => setFormData({ ...formData, telegramId: e.target.value })} />
          <UiButton type="submit" variant="primary">{t('farmer.register.submit')}</UiButton>
        </form>
      </UiCard>
    </UiSection>
  );
});
