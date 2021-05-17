import express, { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { query, param, body } from 'express-validator';

import db from '../../db';
import {
  skipTimesInsertQuery,
  skipTimesSelectQuery,
  skipTimesUpvoteQuery,
  skipTimesDownvoteQuery,
} from '../../db/queries';
import {
  SkipTimesDatabaseType,
  SkipTimesInsertQueryResponseType,
} from '../../types/db/db_types';
import { getStore, handler } from '../../rate_limit';
import autoVote from './auto_vote';
import { validationHandler } from '../../middlewares';

const router = express.Router();

/**
 * @openapi
 *
 * /skip-times/vote/{skip_id}:
 *   post:
 *     description: Upvotes or downvotes the skip time
 *     tags:
 *       - skip-times
 *     parameters:
 *       - name: skip_id
 *         in: path
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: Skip time UUID
 *     requestBody:
 *       description: An object containing the skip time parameters
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               vote_type:
 *                 type: string
 *                 enum: [upvote, downvote]
 *     responses:
 *       '200':
 *         description: Success message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   enum: [success]
 */
router.post(
  '/vote/:skip_id',
  rateLimit({
    windowMs: 1000 * 60 * 60, // 1 hour
    max: 4,
    store: getStore('post-vote:', 60 * 60),
    keyGenerator: (req) => `${req.ip}${req.params.skip_id}`,
    handler,
  }),
  param('skip_id').isUUID(),
  body('vote_type').isIn(['upvote', 'downvote']),
  validationHandler,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { skip_id: skipId } = req.params;
      const { vote_type: voteType } = req.body;

      const { rowCount } = await db.query(
        voteType === 'upvote' ? skipTimesUpvoteQuery : skipTimesDownvoteQuery,
        [skipId]
      );

      if (rowCount === 0) {
        res.status(404);
        return res.json({
          error: [
            {
              value: skipId,
              msg: 'Skip time not found',
              param: 'skip_id',
              location: 'params',
            },
          ],
        });
      }

      res.status(200);
      return res.json({ message: 'success' });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * @openapi
 *
 * /skip-times/{anime_id}/{episode_number}:
 *   get:
 *     description: Retrieves the opening or ending skip times for a specific anime episode
 *     tags:
 *       - skip-times
 *     parameters:
 *       - name: anime_id
 *         in: path
 *         schema:
 *           type: integer
 *           format: int64
 *           minimum: 1
 *         required: true
 *         description: MAL id of the anime to get
 *       - name: episode_number
 *         in: path
 *         schema:
 *           type: number
 *           format: double
 *           minimum: 0.5
 *         required: true
 *         description: Episode number to get
 *       - name: types
 *         in: query
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *             enum: [op, ed]
 *         style: form
 *         explode: true
 *         required: true
 *         description: Type of skip time to get
 *     responses:
 *       '200':
 *         description: Skip times object(s)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 found:
 *                   type: boolean
 *                   enum: [true]
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       interval:
 *                         type: object
 *                         properties:
 *                           start_time:
 *                             type: number
 *                             format: double
 *                             minimum: 0
 *                           end_time:
 *                             type: number
 *                             format: double
 *                             minimum: 0
 *                       skip_type:
 *                         type: string
 *                         enum: [op, ed]
 *                       skip_id:
 *                         type: string
 *                         format: uuid
 *                       episode_length:
 *                         type: number
 *                         format: double
 *                         minimum: 0
 */
router.get(
  '/:anime_id/:episode_number',
  rateLimit({
    windowMs: 1000 * 60, // 1 min
    max: 120,
    store: getStore('get-skipTime:', 60),
    handler,
  }),
  param('anime_id').isInt({ min: 1 }),
  param('episode_number').isFloat({ min: 0.5 }),
  query('types')
    .customSanitizer((typeOrTypes: string | string[]) =>
      typeof typeOrTypes === 'string' ? [typeOrTypes] : typeOrTypes
    )
    .custom((types: string[] | undefined) => {
      if (!types) {
        throw new Error('Invalid value');
      }

      const validTypes = ['op', 'ed'];
      if (new Set(types).size !== types.length) {
        throw new Error('Duplicate types');
      }

      const invalidValues = types.filter((type) => !validTypes.includes(type));
      if (invalidValues.length !== 0) {
        throw new Error(`Invalid values '${invalidValues}'`);
      }

      return true;
    }),
  validationHandler,
  async (req: Request, res: Response, next: NextFunction) => {
    const { anime_id: animeId, episode_number: episodeNumber } = req.params;
    const types = req.query.types as string[];
    try {
      const skipTimes = (
        await Promise.all(
          types.map(async (type) => {
            const { rows } = await db.query<SkipTimesDatabaseType>(
              skipTimesSelectQuery,
              [animeId, episodeNumber, type]
            );
            if (rows.length > 0) {
              const {
                skip_id: skipId,
                start_time: startTime,
                end_time: endTime,
                episode_length: episodeLength,
              } = rows[0];
              return {
                interval: {
                  start_time: startTime,
                  end_time: endTime,
                },
                skip_type: type,
                skip_id: skipId,
                episode_length: episodeLength,
              };
            }

            return null;
          })
        )
      ).filter((skipTime) => skipTime !== null);
      res.status(200);
      return res.json({ found: skipTimes.length !== 0, results: skipTimes });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * @openapi
 *
 * /skip-times/{anime_id}/{episode_number}:
 *   post:
 *     description: Creates the opening or ending skip times for a specific anime episode
 *     tags:
 *       - skip-times
 *     parameters:
 *       - name: anime_id
 *         in: path
 *         schema:
 *           type: integer
 *           format: int64
 *           minimum: 1
 *         required: true
 *         description: MAL id of the anime to create a new skip time for
 *       - name: episode_number
 *         in: path
 *         schema:
 *           type: number
 *           format: double
 *           minimum: 0.5
 *         required: true
 *         description: Episode number of the anime to to create a new skip time for
 *     requestBody:
 *       description: An object containing the skip time parameters
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               skip_type:
 *                 type: string
 *                 enum: [op, ed]
 *               provider_name:
 *                 type: string
 *               start_time:
 *                 type: number
 *                 format: double
 *                 minimum: 0
 *               end_time:
 *                 type: number
 *                 format: double
 *                 minimum: 0
 *               episode_length:
 *                 type: number
 *                 format: double
 *                 minimum: 0
 *               submitter_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       '200':
 *         description: Success message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   enum: [success]
 *                 skip_id:
 *                   type: string
 *                   format: uuid
 */
router.post(
  '/:anime_id/:episode_number',
  rateLimit({
    windowMs: 1000 * 60 * 60 * 24, // 1 day
    max: 10,
    store: getStore('post-skipTime:', 60 * 60 * 24),
    keyGenerator: (req) =>
      `${req.ip}${req.params.anime_id}${req.params.episode_number}`,
    handler,
  }),
  param('anime_id').isInt({ min: 1 }),
  param('episode_number').isFloat({ min: 0.5 }),
  body('skip_type').isIn(['op', 'ed']),
  body('provider_name').isString(),
  body('start_time').isFloat({ min: 0 }),
  body('end_time').isFloat({ min: 0 }),
  body('episode_length').isFloat({ min: 0 }),
  body('submitter_id').isUUID(),
  validationHandler,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { anime_id: animeId, episode_number: episodeNumber } = req.params;
      const {
        provider_name: providerName,
        skip_type: skipType,
        start_time: startTime,
        end_time: endTime,
        episode_length: episodeLength,
        submitter_id: submittedId,
      } = req.body;

      const votes = await autoVote(
        startTime,
        endTime,
        episodeLength,
        submittedId
      );

      const { rows } = await db.query<SkipTimesInsertQueryResponseType>(
        skipTimesInsertQuery,
        [
          animeId,
          episodeNumber,
          providerName,
          skipType,
          votes,
          startTime,
          endTime,
          episodeLength,
          submittedId,
        ]
      );

      res.status(200);
      return res.json({ message: 'success', skip_id: rows[0].skip_id });
    } catch (err) {
      if (err.constraint) {
        res.status(400);
      }
      return next(err);
    }
  }
);

export default router;