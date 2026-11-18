export interface Theme {
  colors?: Partial<Record<'primary' | 'secondary' | 'background' | 'surface' | 'text', string>>;
  fonts?: { heading?: string; body?: string };
  radius?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  buttonStyle?: 'solid' | 'outline' | 'pill';
  mode?: 'light' | 'dark';
  logo?: string;
  favicon?: string;
  customCss?: string;
}

export interface Section {
  type: string;
  props: Record<string, string | number | boolean | string[]>;
}

export interface Layout {
  header?: { variant?: 'left-logo' | 'centered-logo'; sticky?: boolean };
  footer?: { variant?: 'simple' | 'minimal'; text?: string };
  productCard?: { imageRatio?: 'square' | 'landscape'; showDescription?: boolean };
  home?: Section[];
}

export interface SiteConfig {
  version: number;
  theme: Theme;
  layout: Layout;
  features: Record<string, { enabled?: boolean }>;
  seo: { title?: string; description?: string; ogImage?: string };
  settings: {
    taxPercent?: number;
    freeDeliveryAbove?: number;
    phone?: string;
    whatsapp?: string;
    instagram?: string;
    facebook?: string;
    aboutText?: string;
  };
}

export interface Branch {
  _id: string;
  name: string;
  address?: string;
  phone?: string;
  isOpen?: boolean;
  openNow: boolean;
  deliveryFee?: number;
  minOrder?: number;
  prepTimeMins?: number;
  hours?: Record<string, { open: string; close: string; closed?: boolean }>;
}

export interface StoreData {
  store: { name: string; slug: string; currency: string; timezone: string; acceptingOrders: boolean };
  config: SiteConfig;
  branches: Branch[];
  preview: boolean;
}

export interface ModifierOption {
  _id: string;
  name: string;
  price: number;
}

export interface ModifierGroup {
  _id: string;
  name: string;
  min: number;
  max: number;
  options: ModifierOption[];
}

export interface MenuItem {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  categoryId?: string;
  images?: string[];
  price: number;
  variants?: { _id: string; name: string; price: number }[];
  tags?: string[];
  available: boolean;
  soldOut: boolean;
  modifierGroups: ModifierGroup[];
}

export interface Category {
  _id: string;
  name: string;
  slug: string;
  image?: string;
}

export interface Menu {
  categories: Category[];
  items: MenuItem[];
}
