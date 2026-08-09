import type { ReactNode, SVGProps } from 'react';

export type MarketplaceIconName =
  | 'account'
  | 'arrow'
  | 'cart'
  | 'check'
  | 'chevron'
  | 'close'
  | 'contract'
  | 'equipment'
  | 'heart'
  | 'home'
  | 'minus'
  | 'orders'
  | 'plus'
  | 'produce'
  | 'search'
  | 'seeds'
  | 'send'
  | 'shield'
  | 'spark';

const paths: Record<MarketplaceIconName, ReactNode> = {
  account: (
    <>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 20c.45-4 2.6-6 6.5-6s6.05 2 6.5 6" />
    </>
  ),
  arrow: <path d="m5 12 14 0m-5-5 5 5-5 5" />,
  cart: (
    <>
      <path d="M3 4h2l1.8 10.2a2 2 0 0 0 2 1.7h7.7a2 2 0 0 0 1.9-1.4L21 7H6" />
      <circle cx="9" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  chevron: <path d="m8 10 4 4 4-4" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  contract: (
    <>
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M14 3v4h4M9 11h6M9 15h6" />
    </>
  ),
  equipment: (
    <>
      <circle cx="7" cy="17" r="3" />
      <circle cx="18" cy="17" r="2" />
      <path d="M4 14V9h7l3 5h6M11 9V5h4l2 5" />
    </>
  ),
  heart: (
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
  ),
  home: (
    <>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v11h14V10M9 21v-7h6v7" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  orders: (
    <>
      <path d="M6 3h12v18H6z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  produce: (
    <>
      <path d="M12 21c-4-2-7-5-7-9a7 7 0 0 1 14 0c0 4-3 7-7 9Z" />
      <path d="M12 19V8m0 2c-2-2-4-2-5-2m5 5c2-2 4-2 5-2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  seeds: (
    <>
      <path d="M12 21V9" />
      <path d="M12 13c-4 0-7-2-7-6 4 0 7 2 7 6Zm0 4c4 0 7-2 7-6-4 0-7 2-7 6Z" />
    </>
  ),
  send: <path d="m22 2-9 20-3-8-8-3Zm-12 12 4-4" />,
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-5" />
    </>
  ),
  spark: (
    <path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7Zm7 13 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7Z" />
  ),
};

export interface MarketplaceIconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: MarketplaceIconName;
}

export function MarketplaceIcon({ name, ...props }: Readonly<MarketplaceIconProps>) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
