import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PREFIX: z.string().default('/api/v1'),
  DATABASE_URL: z.string().default('file:./dev.db'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  JWT_SECRET: z.string().default('enterprise_super_secure_jwt_secret_key_2026_event_booking_system'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  EMAIL_PROVIDER: z.enum(['resend', 'smtp', 'mock']).default('resend'),
  RESEND_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().default('onboarding@resend.dev'),
  CONCURRENCY_MODE: z.enum(['optimized', 'naive']).default('optimized'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
