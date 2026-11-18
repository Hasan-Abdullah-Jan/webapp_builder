import { Schema, model, type InferSchemaType } from 'mongoose';
import { tenantScopePlugin } from '../db/plugins/tenantScope';

// e.g. "Choose crust" (min 1, max 1) or "Extra toppings" (min 0, max 5).
const ModifierGroupSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    min: { type: Number, default: 0, min: 0 },
    max: { type: Number, default: 1, min: 1 },
    options: [
      {
        name: { type: String, required: true, maxlength: 80 },
        price: { type: Number, default: 0, min: 0 },
        available: { type: Boolean, default: true },
      },
    ],
  },
  { timestamps: true, collection: 'modifierGroups' },
);
ModifierGroupSchema.plugin(tenantScopePlugin);
ModifierGroupSchema.index({ tenantId: 1, name: 1 });

export type ModifierGroupAttrs = InferSchemaType<typeof ModifierGroupSchema>;
export const ModifierGroup = model('ModifierGroup', ModifierGroupSchema);
