/**
 * Starter templates (plan §5 step 3). Provisioning clones theme, layout, default features and
 * sample catalogue into the new tenant. Images are left empty so stores never ship stock photos
 * they don't own; the storefront renders tasteful placeholders.
 */
export interface TemplateDef {
  key: string;
  name: string;
  businessTypes: string[];
  description: string;
  theme: Record<string, unknown>;
  layout: Record<string, unknown>;
  sample: {
    categories: { name: string; slug: string }[];
    products: { name: string; slug: string; category: string; basePrice: number; description: string; tags?: string[]; modifiers?: string[] }[];
    modifierGroups: { key: string; name: string; min: number; max: number; options: { name: string; price: number }[] }[];
  };
}

const pizzaSample: TemplateDef['sample'] = {
  categories: [
    { name: 'Deals', slug: 'deals' },
    { name: 'Pizzas', slug: 'pizzas' },
    { name: 'Burgers', slug: 'burgers' },
    { name: 'Sides', slug: 'sides' },
    { name: 'Drinks', slug: 'drinks' },
  ],
  modifierGroups: [
    { key: 'size', name: 'Choose size', min: 1, max: 1, options: [{ name: 'Small', price: 0 }, { name: 'Medium', price: 400 }, { name: 'Large', price: 800 }] },
    { key: 'crust', name: 'Choose crust', min: 1, max: 1, options: [{ name: 'Pan', price: 0 }, { name: 'Thin crust', price: 0 }, { name: 'Stuffed crust', price: 250 }] },
    { key: 'toppings', name: 'Extra toppings', min: 0, max: 4, options: [{ name: 'Extra cheese', price: 150 }, { name: 'Jalapeños', price: 80 }, { name: 'Olives', price: 80 }, { name: 'Mushrooms', price: 100 }] },
    { key: 'meal', name: 'Make it a meal', min: 0, max: 1, options: [{ name: 'Fries + drink', price: 350 }] },
  ],
  products: [
    { name: 'Family Deal', slug: 'family-deal', category: 'deals', basePrice: 2999, description: '2 medium pizzas, 1 garlic bread and a 1.5L drink.', tags: ['popular'] },
    { name: 'Midnight Deal', slug: 'midnight-deal', category: 'deals', basePrice: 1499, description: '1 medium pizza and 2 drinks.' },
    { name: 'Chicken Tikka Pizza', slug: 'chicken-tikka-pizza', category: 'pizzas', basePrice: 1099, description: 'Spicy tikka chicken, onions and green chillies.', tags: ['popular', 'spicy'], modifiers: ['size', 'crust', 'toppings'] },
    { name: 'Fajita Pizza', slug: 'fajita-pizza', category: 'pizzas', basePrice: 1099, description: 'Fajita chicken, capsicum, onions and mozzarella.', modifiers: ['size', 'crust', 'toppings'] },
    { name: 'Margherita', slug: 'margherita', category: 'pizzas', basePrice: 899, description: 'Tomato sauce, mozzarella and basil.', tags: ['vegetarian'], modifiers: ['size', 'crust', 'toppings'] },
    { name: 'Zinger Burger', slug: 'zinger-burger', category: 'burgers', basePrice: 650, description: 'Crispy chicken fillet, lettuce and mayo.', tags: ['popular'], modifiers: ['meal'] },
    { name: 'Beef Smash Burger', slug: 'beef-smash-burger', category: 'burgers', basePrice: 850, description: 'Double smashed patty, cheese and pickles.', modifiers: ['meal'] },
    { name: 'Garlic Bread', slug: 'garlic-bread', category: 'sides', basePrice: 350, description: 'Oven-baked with garlic butter.' },
    { name: 'Loaded Fries', slug: 'loaded-fries', category: 'sides', basePrice: 550, description: 'Fries with cheese sauce and jalapeños.' },
    { name: 'Soft Drink 500ml', slug: 'soft-drink-500ml', category: 'drinks', basePrice: 150, description: 'Chilled.' },
  ],
};

const cafeSample: TemplateDef['sample'] = {
  categories: [
    { name: 'Coffee', slug: 'coffee' },
    { name: 'Tea', slug: 'tea' },
    { name: 'Bakery', slug: 'bakery' },
    { name: 'Breakfast', slug: 'breakfast' },
  ],
  modifierGroups: [
    { key: 'cup', name: 'Cup size', min: 1, max: 1, options: [{ name: 'Regular', price: 0 }, { name: 'Large', price: 150 }] },
    { key: 'milk', name: 'Milk', min: 0, max: 1, options: [{ name: 'Oat milk', price: 120 }, { name: 'Almond milk', price: 120 }] },
    { key: 'shot', name: 'Extras', min: 0, max: 2, options: [{ name: 'Extra shot', price: 150 }, { name: 'Caramel syrup', price: 100 }] },
  ],
  products: [
    { name: 'Cappuccino', slug: 'cappuccino', category: 'coffee', basePrice: 550, description: 'Espresso with steamed milk foam.', tags: ['popular'], modifiers: ['cup', 'milk', 'shot'] },
    { name: 'Latte', slug: 'latte', category: 'coffee', basePrice: 600, description: 'Smooth espresso and milk.', modifiers: ['cup', 'milk', 'shot'] },
    { name: 'Americano', slug: 'americano', category: 'coffee', basePrice: 450, description: 'Espresso and hot water.', modifiers: ['cup', 'shot'] },
    { name: 'Karak Chai', slug: 'karak-chai', category: 'tea', basePrice: 250, description: 'Strong, spiced milk tea.', tags: ['popular'], modifiers: ['cup'] },
    { name: 'Croissant', slug: 'croissant', category: 'bakery', basePrice: 400, description: 'Buttery and flaky.' },
    { name: 'Chocolate Brownie', slug: 'chocolate-brownie', category: 'bakery', basePrice: 450, description: 'Fudgy, with walnuts.' },
    { name: 'Desi Breakfast', slug: 'desi-breakfast', category: 'breakfast', basePrice: 950, description: 'Paratha, omelette, chana and chai.' },
  ],
};

export const TEMPLATES: TemplateDef[] = [
  {
    key: 'bold-fast-food',
    name: 'Bold Fast-Food',
    businessTypes: ['restaurant', 'other'],
    description: 'Big hero, deals up front, bright colours. Built for pizza and burger brands.',
    theme: {
      colors: { primary: '#E31837', secondary: '#FFC72C', background: '#FFFFFF', surface: '#FFF7F2', text: '#1A1A1A' },
      fonts: { heading: 'Poppins', body: 'Inter' }, radius: 'lg', buttonStyle: 'pill', mode: 'light',
    },
    layout: {
      header: { variant: 'left-logo', sticky: true },
      footer: { variant: 'simple' },
      productCard: { imageRatio: 'square', showDescription: true },
      home: [
        { type: 'announcement', props: { text: 'Free delivery on orders above Rs. 2,000' } },
        { type: 'heroBanner', props: { title: 'Hot, fresh and fast', subtitle: 'Order online for delivery or pickup', cta: 'Order now' } },
        { type: 'categoryStrip', props: {} },
        { type: 'featuredProducts', props: { title: 'Hot Deals', tag: 'popular' } },
        { type: 'menuGrid', props: { columns: 3 } },
      ],
    },
    sample: pizzaSample,
  },
  {
    key: 'elegant-dine-in',
    name: 'Elegant Dine-In',
    businessTypes: ['restaurant'],
    description: 'Serif headings, calm colours and a story section. For sit-down restaurants.',
    theme: {
      colors: { primary: '#1F3A2E', secondary: '#C9A227', background: '#FBFAF6', surface: '#F1EEE4', text: '#1B1B18' },
      fonts: { heading: 'Playfair Display', body: 'Lato' }, radius: 'sm', buttonStyle: 'solid', mode: 'light',
    },
    layout: {
      header: { variant: 'centered-logo', sticky: true },
      footer: { variant: 'simple' },
      productCard: { imageRatio: 'landscape', showDescription: true },
      home: [
        { type: 'heroBanner', props: { title: 'A table worth sharing', subtitle: 'Seasonal plates, cooked with care', cta: 'See the menu' } },
        { type: 'about', props: { title: 'Our story', body: 'Tell your guests who you are, where your recipes come from and what makes your kitchen special.' } },
        { type: 'menuGrid', props: { columns: 2 } },
        { type: 'branchList', props: { title: 'Visit us' } },
      ],
    },
    sample: pizzaSample,
  },
  {
    key: 'minimal-cafe',
    name: 'Minimal Café',
    businessTypes: ['cafe', 'bakery', 'restaurant', 'other'],
    description: 'Clean, airy and warm. For coffee shops and bakeries.',
    theme: {
      colors: { primary: '#6F4E37', secondary: '#D9A441', background: '#FFFBF5', surface: '#F5ECE1', text: '#2B1D14' },
      fonts: { heading: 'DM Serif Display', body: 'DM Sans' }, radius: 'md', buttonStyle: 'solid', mode: 'light',
    },
    layout: {
      header: { variant: 'left-logo', sticky: false },
      footer: { variant: 'simple' },
      productCard: { imageRatio: 'square', showDescription: false },
      home: [
        { type: 'heroBanner', props: { title: 'Good coffee, slow mornings', subtitle: 'Order ahead and skip the queue', cta: 'Order ahead' } },
        { type: 'featuredProducts', props: { title: 'Favourites', tag: 'popular' } },
        { type: 'menuGrid', props: { columns: 2 } },
      ],
    },
    sample: cafeSample,
  },
];

export const TEMPLATE_MAP = new Map(TEMPLATES.map((t) => [t.key, t]));

export function templatesFor(businessType: string) {
  return TEMPLATES.filter((t) => t.businessTypes.includes(businessType) || t.businessTypes.includes('other'));
}
