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
    products: { name: string; slug: string; category: string; basePrice: number; description: string; tags?: string[]; modifiers?: string[]; variants?: { name: string; price: number }[]; stock?: number }[];
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

const retailSample: TemplateDef['sample'] = {
  categories: [
    { name: 'New in', slug: 'new-in' },
    { name: 'Women', slug: 'women' },
    { name: 'Men', slug: 'men' },
    { name: 'Accessories', slug: 'accessories' },
  ],
  modifierGroups: [
    { key: 'wrap', name: 'Gift options', min: 0, max: 1, options: [{ name: 'Gift wrap', price: 250 }] },
  ],
  products: [
    { name: 'Linen Summer Shirt', slug: 'linen-summer-shirt', category: 'men', basePrice: 3490, description: 'Breathable pure linen, relaxed fit.', tags: ['popular', 'new'], variants: [{ name: 'S', price: 3490 }, { name: 'M', price: 3490 }, { name: 'L', price: 3490 }, { name: 'XL', price: 3690 }], stock: 40 },
    { name: 'Classic Chino Trousers', slug: 'classic-chino-trousers', category: 'men', basePrice: 4290, description: 'Stretch cotton chinos for every day.', variants: [{ name: '30', price: 4290 }, { name: '32', price: 4290 }, { name: '34', price: 4290 }, { name: '36', price: 4290 }], stock: 30 },
    { name: 'Embroidered Lawn Kurta', slug: 'embroidered-lawn-kurta', category: 'women', basePrice: 4990, description: 'Soft lawn with hand-finished embroidery.', tags: ['popular'], variants: [{ name: 'S', price: 4990 }, { name: 'M', price: 4990 }, { name: 'L', price: 4990 }], stock: 25 },
    { name: 'Printed Silk Scarf', slug: 'printed-silk-scarf', category: 'accessories', basePrice: 1990, description: 'Lightweight silk blend, 90 × 90 cm.', tags: ['new'], modifiers: ['wrap'], stock: 60 },
    { name: 'Leather Card Wallet', slug: 'leather-card-wallet', category: 'accessories', basePrice: 2490, description: 'Slim full-grain leather, six card slots.', tags: ['popular'], modifiers: ['wrap'], variants: [{ name: 'Black', price: 2490 }, { name: 'Tan', price: 2490 }], stock: 50 },
    { name: 'Everyday Tote Bag', slug: 'everyday-tote-bag', category: 'new-in', basePrice: 2990, description: 'Heavy canvas tote with inner pocket.', tags: ['new'], modifiers: ['wrap'], stock: 35 },
  ],
};

const grocerySample: TemplateDef['sample'] = {
  categories: [
    { name: 'Fruits & Vegetables', slug: 'fruits-vegetables' },
    { name: 'Dairy & Eggs', slug: 'dairy-eggs' },
    { name: 'Bakery', slug: 'bakery' },
    { name: 'Pantry', slug: 'pantry' },
    { name: 'Household', slug: 'household' },
  ],
  modifierGroups: [],
  products: [
    { name: 'Bananas', slug: 'bananas', category: 'fruits-vegetables', basePrice: 180, description: 'Per dozen.', tags: ['popular'], variants: [{ name: '1 dozen', price: 180 }, { name: '2 dozen', price: 340 }] },
    { name: 'Tomatoes', slug: 'tomatoes', category: 'fruits-vegetables', basePrice: 160, description: 'Fresh, per kg.', variants: [{ name: '500 g', price: 90 }, { name: '1 kg', price: 160 }] },
    { name: 'Fresh Milk 1L', slug: 'fresh-milk-1l', category: 'dairy-eggs', basePrice: 220, description: 'Pasteurised full-cream milk.', tags: ['popular'] },
    { name: 'Farm Eggs (12)', slug: 'farm-eggs-12', category: 'dairy-eggs', basePrice: 390, description: 'Free-range, one dozen.' },
    { name: 'Whole Wheat Bread', slug: 'whole-wheat-bread', category: 'bakery', basePrice: 210, description: 'Baked fresh every morning.' },
    { name: 'Basmati Rice 5kg', slug: 'basmati-rice-5kg', category: 'pantry', basePrice: 2150, description: 'Aged long-grain basmati.', tags: ['popular'] },
    { name: 'Cooking Oil 3L', slug: 'cooking-oil-3l', category: 'pantry', basePrice: 1650, description: 'Canola blend.' },
    { name: 'Dishwashing Liquid', slug: 'dishwashing-liquid', category: 'household', basePrice: 350, description: 'Lemon fresh, 750 ml.' },
  ],
};

const salonSample: TemplateDef['sample'] = {
  categories: [
    { name: 'Hair', slug: 'hair' },
    { name: 'Skin', slug: 'skin' },
    { name: 'Nails', slug: 'nails' },
  ],
  modifierGroups: [
    { key: 'length', name: 'Hair length', min: 1, max: 1, options: [{ name: 'Short', price: 0 }, { name: 'Medium', price: 500 }, { name: 'Long', price: 1000 }] },
    { key: 'extras', name: 'Extras', min: 0, max: 2, options: [{ name: 'Head massage', price: 600 }, { name: 'Deep conditioning', price: 900 }] },
  ],
  products: [
    { name: 'Haircut & Style', slug: 'haircut-style', category: 'hair', basePrice: 1800, description: 'Consultation, wash, cut and blow-dry. 45 min.', tags: ['popular'], modifiers: ['length', 'extras'] },
    { name: 'Hair Colour', slug: 'hair-colour', category: 'hair', basePrice: 5500, description: 'Full colour with premium products. 2 hrs.', modifiers: ['length'] },
    { name: 'Signature Facial', slug: 'signature-facial', category: 'skin', basePrice: 3500, description: 'Deep cleanse, exfoliation and mask. 60 min.', tags: ['popular'], modifiers: ['extras'] },
    { name: 'Manicure', slug: 'manicure', category: 'nails', basePrice: 1500, description: 'Shape, cuticle care and polish. 40 min.' },
    { name: 'Pedicure', slug: 'pedicure', category: 'nails', basePrice: 2000, description: 'Soak, scrub and polish. 50 min.' },
  ],
};

export const TEMPLATES: TemplateDef[] = [
  {
    key: 'modern-retail',
    name: 'Modern Retail',
    businessTypes: ['fashion', 'electronics', 'other'],
    description: 'Clean, image-first layout with collections and new arrivals.',
    theme: {
      colors: { primary: '#111827', secondary: '#E11D48', background: '#FFFFFF', surface: '#F5F5F4', text: '#111827' },
      fonts: { heading: 'Montserrat', body: 'Open Sans' }, radius: 'sm', buttonStyle: 'solid', mode: 'light',
    },
    layout: {
      header: { variant: 'centered-logo', sticky: true },
      footer: { variant: 'simple' },
      productCard: { imageRatio: 'square', showDescription: false },
      home: [
        { type: 'announcement', props: { text: 'Free delivery on orders over Rs. 5,000 · Easy 7-day exchanges' } },
        { type: 'heroBanner', props: { title: 'The new season is here', subtitle: 'Thoughtfully made essentials, delivered to your door', cta: 'Shop the collection' } },
        { type: 'categoryStrip', props: { title: 'Shop by collection' } },
        { type: 'featuredProducts', props: { title: 'New arrivals', tag: 'new', limit: 8 } },
        { type: 'featuredProducts', props: { title: 'Best sellers', tag: 'popular', limit: 8 } },
      ],
    },
    sample: retailSample,
  },
  {
    key: 'fresh-market',
    name: 'Fresh Market',
    businessTypes: ['grocery', 'pharmacy', 'other'],
    description: 'Bright and practical, built for quick repeat baskets.',
    theme: {
      colors: { primary: '#15803D', secondary: '#F59E0B', background: '#FFFFFF', surface: '#F0FDF4', text: '#14211A' },
      fonts: { heading: 'Nunito', body: 'Nunito' }, radius: 'lg', buttonStyle: 'pill', mode: 'light',
    },
    layout: {
      header: { variant: 'left-logo', sticky: true },
      footer: { variant: 'simple' },
      productCard: { imageRatio: 'square', showDescription: true },
      home: [
        { type: 'announcement', props: { text: 'Same-day delivery on orders placed before 6 pm' } },
        { type: 'heroBanner', props: { title: 'Groceries at your door', subtitle: 'Fresh produce and daily essentials in one basket', cta: 'Start shopping' } },
        { type: 'categoryStrip', props: {} },
        { type: 'featuredProducts', props: { title: 'Everyday favourites', tag: 'popular' } },
        { type: 'menuGrid', props: { title: 'Shop by aisle', columns: 4, categories: 5 } },
      ],
    },
    sample: grocerySample,
  },
  {
    key: 'beauty-studio',
    name: 'Beauty Studio',
    businessTypes: ['salon', 'other'],
    description: 'Elegant and calm, made for services and bookings.',
    theme: {
      colors: { primary: '#9D174D', secondary: '#D4A373', background: '#FFFBFA', surface: '#FCEFF3', text: '#2A1B21' },
      fonts: { heading: 'Playfair Display', body: 'Lato' }, radius: 'lg', buttonStyle: 'pill', mode: 'light',
    },
    layout: {
      header: { variant: 'centered-logo', sticky: true },
      footer: { variant: 'simple' },
      productCard: { imageRatio: 'landscape', showDescription: true },
      home: [
        { type: 'heroBanner', props: { title: 'Look good, feel better', subtitle: 'Book your next appointment in seconds', cta: 'See services' } },
        { type: 'featuredProducts', props: { title: 'Most booked', tag: 'popular' } },
        { type: 'menuGrid', props: { title: 'Our services', columns: 2, categories: 3 } },
        { type: 'about', props: { title: 'About the studio', body: 'Tell clients about your team, your products and what makes a visit special.' } },
        { type: 'branchList', props: { title: 'Visit us' } },
      ],
    },
    sample: salonSample,
  },

  {
    key: 'bold-fast-food',
    name: 'Bold Fast-Food',
    businessTypes: ['restaurant'],
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
    businessTypes: ['cafe', 'bakery', 'restaurant'],
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

/** Templates made for this business type; falls back to the general ones. */
export function templatesFor(businessType: string) {
  const exact = TEMPLATES.filter((t) => t.businessTypes.includes(businessType));
  return exact.length ? exact : TEMPLATES.filter((t) => t.businessTypes.includes('other'));
}
