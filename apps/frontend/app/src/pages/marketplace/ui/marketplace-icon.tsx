import {
  ArrowRight,
  Check,
  ClipboardList,
  Copy,
  FileText,
  Heart,
  House,
  Minus,
  Plus,
  Search,
  Send,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  Tractor,
  TriangleAlert,
  User,
  Wheat,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { SVGProps } from 'react';

export type MarketplaceIconName =
  | 'account'
  | 'alert'
  | 'arrow'
  | 'cart'
  | 'check'
  | 'close'
  | 'contract'
  | 'copy'
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
  | 'spark'
  | 'tune';

/**
 * Marketplace icons resolve to lucide, the single linear set the design
 * reference specifies. Names stay product-domain ("produce", "equipment")
 * rather than lucide-specific so a swapped glyph never ripples through call
 * sites.
 */
const icons: Record<MarketplaceIconName, LucideIcon> = {
  account: User,
  alert: TriangleAlert,
  arrow: ArrowRight,
  cart: ShoppingCart,
  check: Check,
  close: X,
  contract: FileText,
  copy: Copy,
  equipment: Tractor,
  heart: Heart,
  home: House,
  minus: Minus,
  orders: ClipboardList,
  plus: Plus,
  produce: Wheat,
  search: Search,
  seeds: Sprout,
  send: Send,
  shield: ShieldCheck,
  spark: Sparkles,
  tune: SlidersHorizontal,
};

interface MarketplaceIconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'ref'> {
  name: MarketplaceIconName;
}

export function MarketplaceIcon({ name, ...props }: Readonly<MarketplaceIconProps>) {
  const Glyph = icons[name];
  // 1.8px sits inside the reference's 1.5–2px band. Box size stays with the
  // stylesheet, which sizes icons per surface.
  return <Glyph aria-hidden="true" focusable="false" strokeWidth={1.8} {...props} />;
}
