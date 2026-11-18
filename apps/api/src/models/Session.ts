import { Schema, model } from 'mongoose';

// Refresh-token sessions (rotating). Platform-level collection: looked up by token hash
// before any tenant is known. Only hashes are stored.
const SessionSchema = new Schema(
  {
    kind: { type: String, enum: ['staff', 'platform'], required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    tenantId: { type: Schema.Types.ObjectId },
    family: { type: String, required: true }, // all rotations of one login share a family
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: true, collection: 'sessions' },
);
SessionSchema.index({ tokenHash: 1 }, { unique: true });
SessionSchema.index({ family: 1 });
SessionSchema.index({ userId: 1, kind: 1 });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model('Session', SessionSchema);
