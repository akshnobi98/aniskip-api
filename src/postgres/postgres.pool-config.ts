import { PoolConfig } from 'pg';

/**
 * Pool config used to connect to the Postgres database.
 */
export const poolConfig: PoolConfig = {
  user: 'postgres',
  host: process.env.POSTGRES_HOST,
  database: 'db',
  password: process.env.POSTGRES_PASSWORD,
  port: 5432,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};
