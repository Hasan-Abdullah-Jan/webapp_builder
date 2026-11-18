import { Schema, model } from 'mongoose';

// Append-only audit trail of sensitive actions (platform staff actions, destructive tenant actions).
const AuditLogSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
    actorType: { type: String, enum: ['staff', 'platform', 'system'], required: true },
    actorId: { type: Schema.Types.ObjectId },
    action: { type: String, required: true, maxlength: 80 },
    target: { type: String, maxlength: 200 },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'auditLogs' },
);
AuditLogSchema.index({ tenantId: 1, createdAt: -1 });
AuditLogSchema.index({ actorType: 1, createdAt: -1 });

export const AuditLog = model('AuditLog', AuditLogSchema);

export async function audit(entry: {
  tenantId?: unknown;
  actorType: 'staff' | 'platform' | 'system';
  actorId?: unknown;
  action: string;
  target?: string;
  meta?: unknown;
}) {
  await AuditLog.create(entry).catch((err) => console.error('[audit] failed', err.message));
}
