/**
 * Wording per business type, so a fashion store never sees "Menu" or "Add-ons" and a salon
 * sees "Services". Sent to the admin (/me) and the storefront (/config).
 */
export interface Vocab {
  catalog: string; // nav label for the catalogue: Menu / Shop / Services
  item: string; // singular: Item / Product / Service
  items: string;
  category: string;
  categories: string;
  options: string; // add-on groups: Add-ons / Options / Extras
  cta: string; // primary call to action
  pickup: string; // pickup / in-store
  orderVerb: string; // "Order" / "Buy" / "Book"
  emptyCatalog: string;
}

const FOOD: Vocab = {
  catalog: 'Menu', item: 'Item', items: 'Items', category: 'Category', categories: 'Categories',
  options: 'Add-ons', cta: 'Order now', pickup: 'Pickup', orderVerb: 'Order',
  emptyCatalog: 'Add your first dish to start taking orders.',
};
const RETAIL: Vocab = {
  catalog: 'Shop', item: 'Product', items: 'Products', category: 'Collection', categories: 'Collections',
  options: 'Options', cta: 'Shop now', pickup: 'Store pickup', orderVerb: 'Buy',
  emptyCatalog: 'Add your first product to start selling.',
};
const GROCERY: Vocab = {
  ...RETAIL, category: 'Aisle', categories: 'Aisles', cta: 'Start shopping',
  emptyCatalog: 'Add your first product so customers can fill their basket.',
};
const SERVICES: Vocab = {
  catalog: 'Services', item: 'Service', items: 'Services', category: 'Category', categories: 'Categories',
  options: 'Extras', cta: 'Book now', pickup: 'At our studio', orderVerb: 'Book',
  emptyCatalog: 'Add your first service so clients can book.',
};

export function vocabFor(businessType?: string | null): Vocab {
  switch (businessType) {
    case 'restaurant': case 'cafe': case 'bakery': return FOOD;
    case 'grocery': case 'pharmacy': return GROCERY;
    case 'salon': return SERVICES;
    default: return RETAIL;
  }
}

export const FOOD_TYPES = new Set(['restaurant', 'cafe', 'bakery']);
