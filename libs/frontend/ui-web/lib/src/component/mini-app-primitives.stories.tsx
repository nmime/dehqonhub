import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { UiVerifiedBadge } from '../asset/status-badge';
import { UiEquipmentMark, UiProduceMark, UiSeedsMark } from '../asset/category-mark';
import { UiEmptyOrdersArt } from '../asset/empty-illustration';
import { UiNavLeadersIcon, UiNavMarketIcon, UiNavOrdersIcon, UiNavProfileIcon } from '../asset/nav-icon';
import { UiBottomNav } from './bottom-nav';
import { UiCard } from './card';
import { UiListRow, UiListRows } from './list-row';
import { UiPageHeader } from './page-header';
import { UiStatChip, UiStatChipRow } from './stat-chip';
import { UiStatWells } from './stat-wells';

// Story copy is assembled rather than inlined to match the convention the other
// story files in this package use.
const t = (...parts: string[]) => parts.join(' ');

const meta = {
  title: 'Components/MiniAppPrimitives',
  component: UiPageHeader,
  tags: ['visual'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof UiPageHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

const chevron = (
  <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
    <path d="m6 3.5 5 4.5-5 4.5" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
  </svg>
);

/**
 * The full mini-app screen composition: header, stat chips, a well grid, list
 * rows, and the floating nav island — the five shapes every product page is
 * assembled from.
 */
export const Screen: Story = {
  args: {
    title: t('Marketplace'),
  },
  render: () => (
    <div style={{ minHeight: '100vh', paddingBottom: '7rem' }}>
      <UiPageHeader subtitle={t('Verified', 'suppliers', 'near', 'you')} title={t('Marketplace')}>
        <UiStatChipRow>
          <UiStatChip
            actionLabel={t('Top', 'up', 'balance')}
            icon={<UiVerifiedBadge size={20} />}
            label={t('Balance')}
            onAction={() => undefined}
            value="12 500 000"
          />
          <UiStatChip label={t('Open', 'orders')} value="4" />
        </UiStatChipRow>
      </UiPageHeader>

      <div style={{ display: 'grid', gap: '1rem', padding: '0 1rem' }}>
        <UiCard title={t('Settlement', 'window')}>
          <UiStatWells
            caption={t('Time', 'until', 'settlement')}
            items={[
              { id: 'd', label: t('days'), value: '2' },
              { id: 'h', label: t('hours'), value: '9' },
              { id: 'm', label: t('minutes'), value: '44' },
              { id: 's', label: t('seconds'), tone: 'accent', value: '55' },
            ]}
          />
        </UiCard>

        <UiCard title={t('Catalogue')}>
          <UiListRows>
            <UiListRow
              href="#equipment"
              icon={<UiEquipmentMark size={28} />}
              meta={t('318', 'listings')}
              title={t('Equipment')}
              tone="accent"
              trailing={chevron}
            />
            <UiListRow
              href="#seeds"
              icon={<UiSeedsMark size={28} />}
              meta={t('1', '204', 'listings')}
              title={t('Seeds')}
              tone="success"
              trailing={chevron}
            />
            <UiListRow
              href="#produce"
              icon={<UiProduceMark size={28} />}
              meta={t('872', 'listings')}
              title={t('Produce')}
              trailing={chevron}
            />
          </UiListRows>
        </UiCard>

        <UiCard title={t('Your', 'orders')}>
          <div style={{ display: 'grid', gap: '0.75rem', justifyItems: 'center', padding: '1rem 0' }}>
            <UiEmptyOrdersArt size={96} />
            <p style={{ color: 'var(--xr-color-muted)', margin: 0 }}>{t('No', 'orders', 'yet')}</p>
          </div>
        </UiCard>
      </div>

      <UiBottomNav
        ariaLabel={t('Marketplace', 'bottom', 'navigation')}
        items={[
          { href: '#market', icon: <UiNavMarketIcon />, isCurrent: true, label: t('Market') },
          { href: '#orders', icon: <UiNavOrdersIcon />, label: t('Orders') },
          { href: '#leaders', icon: <UiNavLeadersIcon />, label: t('Ratings') },
          { href: '#profile', icon: <UiNavProfileIcon />, label: t('Profile') },
        ]}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('navigation', { name: t('Marketplace', 'bottom', 'navigation') })).toBeVisible();
    // The active item must be identifiable without relying on its fill colour.
    await expect(canvas.getByRole('link', { name: t('Market') })).toHaveAttribute('aria-current', 'page');
    await expect(canvas.getByRole('group', { name: `${t('Balance')}: 12 500 000` })).toBeInTheDocument();
    document.documentElement.setAttribute('data-visual-ready', 'true');
  },
};

/** Light theme parity check — the derived counterpart, not a second design. */
export const LightTheme: Story = {
  args: {
    title: t('Marketplace'),
  },
  render: () => (
    <div className="xr-shell" data-theme="light" style={{ minHeight: '100vh', padding: '1rem' }}>
      <UiPageHeader subtitle={t('Verified', 'suppliers', 'near', 'you')} title={t('Marketplace')}>
        <UiStatChipRow>
          <UiStatChip icon={<UiVerifiedBadge size={20} />} label={t('Balance')} value="12 500 000" />
        </UiStatChipRow>
      </UiPageHeader>
      <UiCard title={t('Catalogue')}>
        <UiListRows>
          <UiListRow
            icon={<UiSeedsMark size={28} />}
            meta={t('1', '204', 'listings')}
            title={t('Seeds')}
            tone="success"
            trailing={chevron}
          />
        </UiListRows>
      </UiCard>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { name: t('Marketplace') })).toBeVisible();
    document.documentElement.setAttribute('data-visual-ready', 'true');
  },
};
