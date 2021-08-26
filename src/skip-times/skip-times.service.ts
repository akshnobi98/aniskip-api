import { Injectable } from '@nestjs/common';
import { SkipTimesRepository } from '../repositories';
import {
  InternalSkipTime,
  SkipTime,
  SkipType,
  VoteType,
} from './skip-times.types';

@Injectable()
export class SkipTimesService {
  constructor(private skipTimesRepository: SkipTimesRepository) {}

  /**
   * Vote on a skip time.
   *
   * @param voteType Voting type, can be upvote or downvote.
   * @param skipId Skip Id to upvote or downvote.
   */
  async voteSkipTime(voteType: VoteType, skipId: string): Promise<boolean> {
    let voteSuccessful = false;

    switch (voteType) {
      case 'upvote':
        voteSuccessful = await this.skipTimesRepository.upvoteSkipTime(skipId);
        break;
      case 'downvote':
        voteSuccessful = await this.skipTimesRepository.downvoteSkipTime(
          skipId
        );
        break;
      default:
    }

    return voteSuccessful;
  }

  /**
   * Create a new skip time entry.
   *
   * @param skipTime Skip time to create.
   */
  async createSkipTime(
    skipTime: Omit<InternalSkipTime, 'skip_id' | 'submit_date' | 'votes'>
  ): Promise<string> {
    const votes = 0; // TODO: Add voting service.

    const skipTimeWithVotes = {
      ...skipTime,
      votes,
    };

    return this.skipTimesRepository.createSkipTime(skipTimeWithVotes);
  }

  /**
   * Finds one skip time of each skip type passed.
   *
   * @param animeId MAL id filter.
   * @param episodeNumber Episode number filter.
   * @param skipTypes Skip types to filter, should be unique.
   */
  async findSkipTimes(
    animeId: number,
    episodeNumber: number,
    skipTypes: SkipType[]
  ): Promise<SkipTime[]> {
    const result: SkipTime[] = (
      await Promise.all(
        skipTypes.map(async (skipType) => {
          const skipTimes = await this.skipTimesRepository.findSkipTimes(
            animeId,
            episodeNumber,
            skipType
          );

          if (skipTimes.length === 0) {
            return null;
          }

          return skipTimes[0];
        })
      )
    ).filter((skipTime): skipTime is SkipTime => skipTime !== null);

    return result;
  }
}
