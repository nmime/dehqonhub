import {
  ArrowRight,
  Check,
  ClipboardList,
  Copy,
  FileText,
  Heart,
  House,
  Leaf,
  Minus,
  PackageOpen,
  Plus,
  Search,
  Send,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  SprayCan,
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
  | 'fertilizer'
  | 'heart'
  | 'home'
  | 'input'
  | 'minus'
  | 'orders'
  | 'pesticide'
  | 'plus'
  | 'produce'
  | 'search'
  | 'seeds'
  | 'send'
  | 'shield'
  | 'spark'
  | 'tune';

/** Product names stay stable while every glyph comes from one linear icon set. */
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
  fertilizer: Leaf,
  heart: Heart,
  home: House,
  input: PackageOpen,
  minus: Minus,
  orders: ClipboardList,
  pesticide: SprayCan,
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
  return <Glyph aria-hidden="true" data-marketplace-icon={name} focusable="false" strokeWidth={1.8} {...props} />;
}
