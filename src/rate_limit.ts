import { Request, Response } from 'express';
import RedisStore from 'rate-limit-redis';

import redisClient from './redis';

/**
 * Returns redis store
 * @param expiry Number of seconds the store is valid for
 */
export const getStore = (prefix?: string, expiry?: number) =>
  process.env.NODE_ENV === 'test'
    ? undefined
    : new RedisStore({ client: redisClient, prefix, expiry });

/**
 * Handles rate limit response
 * @param _req Request object
 * @param res Response object
 * @param next Next middleware function
 */
export const handler = (
  _req: Request,
  res: Response,
  next: CallableFunction
) => {
  const error = new Error('Too many requests, please try again later');

  res.status(429);
  next(error);
};