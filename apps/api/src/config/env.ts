import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load apps/api/.env first (if present), then the repo-root .env. Existing
// process env vars always win, so production can inject secrets directly.
dotenv.config({
  path: [path.resolve(__dirname, '../../.env'), path.resolve(__dirname, '../../../../.env')],
  quiet: true,
});

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z
    .string()
    .min(1, 'MONGODB_URI is required')
    .refine((v) => /^mongodb(\+srv)?:\/\//.test(v), 'MONGODB_URI must start with mongodb:// or mongodb+srv://'),
  MONGODB_DB_NAME: z.string().min(1).default('website_builder'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Report which keys are wrong, never their values.
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Strip credentials from a Mongo URI so it is safe to log. */
export function redactMongoUri(uri: string): string {
  return uri.replace(/\/\/([^@/]+)@/, '//***:***@');
}
