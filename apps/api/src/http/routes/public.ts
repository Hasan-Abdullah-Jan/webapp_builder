import { Router } from 'express';
import { TEMPLATES, templatesFor } from '../../catalog/templates';
import { THEME_PRESETS, FONT_PAIRS } from '../../catalog/themes';
import { FEATURES } from '../../catalog/features';
import { BUSINESS_TYPES } from '../../models/Tenant';
import { wrap } from '../wrap';

/** Unauthenticated catalogue data for the signup wizard. */
export function publicRouter() {
  const r = Router();
  r.get('/templates', wrap((req) => {
    const type = typeof req.query.businessType === 'string' ? req.query.businessType : undefined;
    const list = type ? templatesFor(type) : TEMPLATES;
    return list.map(({ sample, ...t }) => ({ ...t, sampleItems: sample.products.length }));
  }));
  r.get('/wizard-options', wrap(() => ({
    businessTypes: BUSINESS_TYPES,
    presets: THEME_PRESETS,
    fonts: FONT_PAIRS,
    features: FEATURES.filter((f) => f.available).map(({ key, name, description, minPlan }) => ({ key, name, description, minPlan })),
  })));
  return r;
}
