import { isValidObjectId } from 'mongoose';
import { z } from 'zod';

// Request-body schemas. All are `.strict()` so tenantId/_id/unknown keys are rejected.
const objectId = z.string().refine(isValidObjectId, 'invalid id');
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,80}$/);
const url = z.string().url().max(2048).refine((u) => /^https?:\/\//i.test(u), 'must be http(s)');
const money = z.number().finite().min(0).max(10_000_000);

export const CategoryCreate = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug,
    image: url.optional(),
    sort: z.number().int().optional(),
    visible: z.boolean().optional(),
    branchIds: z.array(objectId).max(200).optional(),
  })
  .strict();
export const CategoryUpdate = CategoryCreate.partial().strict();

export const ProductCreate = z
  .object({
    name: z.string().trim().min(1).max(160),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,120}$/),
    description: z.string().max(4000).optional(),
    categoryId: objectId.optional(),
    images: z.array(url).max(20).optional(),
    basePrice: money,
    variants: z.array(z.object({ name: z.string().min(1).max(80), price: money }).strict()).max(50).optional(),
    tags: z.array(z.string().trim().max(40)).max(30).optional(),
    branchOverrides: z
      .array(z.object({ branchId: objectId, price: money.optional(), available: z.boolean().optional() }).strict())
      .max(200)
      .optional(),
    stock: z.number().int().min(0).optional(),
    active: z.boolean().optional(),
    sort: z.number().int().optional(),
  })
  .strict();
export const ProductUpdate = ProductCreate.partial().strict();

const point = z.object({ type: z.literal('Point'), coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]) }).strict();
const polygon = z
  .object({ type: z.enum(['Polygon', 'MultiPolygon']), coordinates: z.array(z.any()).min(1) })
  .strict();

export const BranchCreate = z
  .object({
    name: z.string().trim().min(1).max(120),
    address: z.string().max(500).optional(),
    phone: z.string().max(20).optional(),
    geo: point.optional(),
    deliveryZones: polygon.optional(),
    hours: z.record(z.string(), z.any()).optional(),
    isOpen: z.boolean().optional(),
  })
  .strict();
export const BranchUpdate = BranchCreate.partial().strict();

export const CustomerCreate = z
  .object({
    phone: z.string().trim().regex(/^\+?[0-9]{7,15}$/),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
    name: z.string().trim().max(120).optional(),
    addresses: z
      .array(z.object({ label: z.string().max(40).optional(), line1: z.string().min(1).max(300), city: z.string().max(80).optional() }).strict())
      .max(20)
      .optional(),
    marketingOptIn: z.boolean().optional(),
  })
  .strict();
// loyaltyPoints is server-managed, never client-writable.
export const CustomerUpdate = CustomerCreate.partial().strict();

// Site config: shapes from plan §4.3. Extensible objects, but size-capped and
// with custom CSS sanitised (no <script>, no javascript: urls, no expression()).
const safeCss = z
  .string()
  .max(20_000)
  .refine((css) => !/<\s*\/?\s*script|javascript:|expression\s*\(|@import/i.test(css), 'unsafe CSS');
const hex = z.string().regex(/^#[0-9a-fA-F]{3,8}$/);

export const SiteConfigPatch = z
  .object({
    theme: z
      .object({
        colors: z.record(z.string().max(40), hex).optional(),
        fonts: z.object({ heading: z.string().max(60), body: z.string().max(60) }).partial().strict().optional(),
        radius: z.enum(['none', 'sm', 'md', 'lg', 'full']).optional(),
        buttonStyle: z.enum(['solid', 'outline', 'pill']).optional(),
        mode: z.enum(['light', 'dark', 'both']).optional(),
        logo: url.optional(),
        favicon: url.optional(),
        customCss: safeCss.optional(),
      })
      .strict()
      .optional(),
    layout: z
      .object({
        header: z.record(z.string(), z.any()).optional(),
        footer: z.record(z.string(), z.any()).optional(),
        productCard: z.record(z.string(), z.any()).optional(),
        home: z
          .array(z.object({ type: z.string().regex(/^[a-zA-Z0-9]{1,40}$/), props: z.record(z.string(), z.any()).default({}) }).strict())
          .max(40)
          .optional(),
      })
      .strict()
      .optional(),
    features: z.record(z.string().regex(/^[a-zA-Z0-9_]{1,40}$/), z.object({ enabled: z.boolean() }).passthrough()).optional(),
    seo: z.object({ title: z.string().max(70), description: z.string().max(200), ogImage: url }).partial().strict().optional(),
    settings: z.record(z.string(), z.any()).optional(),
  })
  .strict()
  .refine((v) => JSON.stringify(v).length < 200_000, 'config too large');

export const OrderStatusPatch = z.object({ status: z.string() }).strict();
