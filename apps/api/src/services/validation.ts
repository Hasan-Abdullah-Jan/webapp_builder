import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { ALLOWED_FONTS, SECTION_TYPES } from '../catalog/themes';

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
    modifierGroupIds: z.array(objectId).max(20).optional(),
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
    hours: z
      .record(
        z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
        z.object({ open: z.string().regex(/^\d{2}:\d{2}$/), close: z.string().regex(/^\d{2}:\d{2}$/), closed: z.boolean().optional() }).strict(),
      )
      .optional(),
    isOpen: z.boolean().optional(),
    deliveryFee: money.optional(),
    minOrder: money.optional(),
    deliveryRadiusKm: z.number().min(0).max(200).optional(),
    prepTimeMins: z.number().int().min(0).max(600).optional(),
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

// Site config: shapes from plan §4.3. Fonts and section types come from curated lists;
// custom CSS is sanitised (no <script>, no javascript: urls, no expression(), no @import).
// Feature flags are NOT patchable here: they go through /features/:key so plan and
// dependency rules can't be bypassed.
const safeCss = z
  .string()
  .max(20_000)
  .refine((css) => !/<\s*\/?\s*(script|style)|javascript:|expression\s*\(|@import|behavior\s*:/i.test(css), 'unsafe CSS');
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'use a colour like #E31837');
const font = z.string().refine((f) => ALLOWED_FONTS.has(f), 'choose one of the offered fonts');
const props = z.record(z.string().max(40), z.union([z.string().max(2000), z.number(), z.boolean(), z.array(z.string().max(2048)).max(20)]));

export const SiteConfigPatch = z
  .object({
    theme: z
      .object({
        colors: z.object({ primary: hex, secondary: hex, background: hex, surface: hex, text: hex }).partial().strict().optional(),
        fonts: z.object({ heading: font, body: font }).partial().strict().optional(),
        radius: z.enum(['none', 'sm', 'md', 'lg', 'full']).optional(),
        buttonStyle: z.enum(['solid', 'outline', 'pill']).optional(),
        mode: z.enum(['light', 'dark']).optional(),
        logo: url.or(z.literal('')).optional(),
        favicon: url.or(z.literal('')).optional(),
        customCss: safeCss.optional(),
      })
      .strict()
      .optional(),
    layout: z
      .object({
        header: z.object({ variant: z.enum(['left-logo', 'centered-logo']), sticky: z.boolean() }).partial().strict().optional(),
        footer: z.object({ variant: z.enum(['simple', 'minimal']), text: z.string().max(300) }).partial().strict().optional(),
        productCard: z
          .object({ imageRatio: z.enum(['square', 'landscape']), showDescription: z.boolean() })
          .partial()
          .strict()
          .optional(),
        home: z
          .array(z.object({ type: z.enum(SECTION_TYPES), props: props.default({}) }).strict())
          .max(30)
          .optional(),
      })
      .strict()
      .optional(),
    seo: z.object({ title: z.string().max(70), description: z.string().max(200), ogImage: url.or(z.literal('')) }).partial().strict().optional(),
    settings: z
      .object({
        taxPercent: z.number().min(0).max(50),
        freeDeliveryAbove: z.number().min(0).max(1_000_000),
        phone: z.string().max(20),
        whatsapp: z.string().max(20),
        instagram: url.or(z.literal('')),
        facebook: url.or(z.literal('')),
        aboutText: z.string().max(2000),
      })
      .partial()
      .strict()
      .optional(),
  })
  .strict();

export const ModifierGroupCreate = z
  .object({
    name: z.string().trim().min(1).max(80),
    min: z.number().int().min(0).max(20),
    max: z.number().int().min(1).max(20),
    options: z
      .array(z.object({ name: z.string().trim().min(1).max(80), price: money, available: z.boolean().optional() }).strict())
      .min(1)
      .max(30),
  })
  .strict()
  .refine((g) => g.min <= g.max && g.min <= g.options.length, 'min must be ≤ max and ≤ number of options');
export const ModifierGroupUpdate = z
  .object({
    name: z.string().trim().min(1).max(80),
    min: z.number().int().min(0).max(20),
    max: z.number().int().min(1).max(20),
    options: z
      .array(z.object({ name: z.string().trim().min(1).max(80), price: money, available: z.boolean().optional() }).strict())
      .min(1)
      .max(30),
  })
  .partial()
  .strict();

