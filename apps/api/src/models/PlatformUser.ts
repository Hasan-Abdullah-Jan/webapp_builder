import { Schema, model, type InferSchemaType } from 'mongoose';

export const PLATFORM_ROLES = ['owner', 'support', 'finance'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

// Platform staff (Super Admin portal). Not tenant-scoped.
const PlatformUserSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    name: { type: String, required: true, maxlength: 120 },
    role: { type: String, enum: PLATFORM_ROLES, required: true },
    passwordHash: { type: String, required: true, select: false },
    totpSecret: { type: String, required: true, select: false }, // 2FA is mandatory
    active: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  { timestamps: true, collection: 'platformUsers' },
);
PlatformUserSchema.index({ email: 1 }, { unique: true });

export type PlatformUserAttrs = InferSchemaType<typeof PlatformUserSchema>;
export const PlatformUser = model('PlatformUser', PlatformUserSchema);
