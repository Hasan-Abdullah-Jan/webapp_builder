import { Schema, model } from 'mongoose';
import { tenantScopePlugin } from '../db/plugins/tenantScope';

// Per-tenant sequences (e.g. human-friendly order numbers).
const CounterSchema = new Schema({ key: { type: String, required: true }, seq: { type: Number, default: 0 } }, { collection: 'counters' });
CounterSchema.plugin(tenantScopePlugin);
CounterSchema.index({ tenantId: 1, key: 1 }, { unique: true });

export const Counter = model('Counter', CounterSchema);

/** Atomically returns the next value of a per-tenant sequence (requires tenant context). */
export async function nextSequence(key: string): Promise<number> {
  const doc = await Counter.findOneAndUpdate({ key }, { $inc: { seq: 1 } }, { upsert: true, new: true }).lean();
  return doc!.seq;
}
