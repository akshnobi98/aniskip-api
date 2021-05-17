import fs from 'fs';
import path from 'path';

import { RuleType, SectionType } from '../../types/rule_types';

class Rules {
  rules: Record<number, RuleType[]>;

  version: string;

  lastModified: Date;

  constructor() {
    this.rules = {};
    this.version = '';
    this.lastModified = new Date();
  }

  /**
   * Read and parse anime-relations rules
   */
  async readRelations() {
    const animeRelationsFilePath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'deps',
      'anime-relations',
      'anime-relations.txt'
    );
    const animeRelations = await fs.promises.readFile(
      animeRelationsFilePath,
      'utf-8'
    );

    let section: SectionType = 'unknown';
    animeRelations.split('\n').forEach((line) => {
      if (line.startsWith('#') || line === '') {
        return;
      }

      if (line.startsWith('::meta')) {
        section = 'meta';
      } else if (line.startsWith('::rules')) {
        section = 'rules';
      }

      switch (section) {
        case 'meta': {
          const matches = line.match(/([a-z_]+): ([0-9.-]+)/);
          if (!matches) {
            break;
          }

          const label = matches[1];
          const value = matches[2];
          switch (label) {
            case 'version':
              this.version = value;
              break;
            case 'last_modified':
              this.lastModified = new Date(value);
              break;
            default:
          }
          break;
        }
        case 'rules':
          this.parseRule(line.replace('- ', ''));
          break;
        default:
      }
    });
  }

  /**
   * Parses a rule and adds it the rules table
   * @param ruleString Rule as a string to parse
   */
  parseRule(ruleString: string) {
    const idsPattern = /(\d+|[?~])\|(\d+|[?~])\|(\d+|[?~])/;
    const episodePattern = /(\d+|[?])(?:-(\d+|[?]))?/;
    const rulePattern = new RegExp(
      `${idsPattern.source}:${episodePattern.source} -> ${idsPattern.source}:${episodePattern.source}(!)?`
    );

    const matches = ruleString.match(rulePattern);
    if (!matches) {
      return;
    }

    const getRange = (firstIndex: number, secondIndex: number) => {
      const start = parseInt(matches[firstIndex], 10);
      let end: number | null;

      if (matches[secondIndex]) {
        if (matches[secondIndex] !== '?') {
          end = parseInt(matches[secondIndex], 10);
        } else {
          // Unknown range end (airing series)
          end = null;
        }
      } else {
        // Singular episode
        end = start;
      }

      return { start, ...(end && { end }) };
    };

    const fromMalId = parseInt(matches[1], 10);
    if (!fromMalId) {
      return;
    }

    let rules = this.rules[fromMalId] || [];
    const toMalId = matches[6] === '~' ? fromMalId : parseInt(matches[6], 10);
    const from = getRange(4, 5);
    const toRange = getRange(9, 10);
    const to = { malId: toMalId, ...toRange };
    const rule = { from, to };
    rules.push(rule);
    this.rules[fromMalId] = rules;

    if (matches[11] === '!') {
      rules = this.rules[toMalId] || [];
      rules.push(rule);
      this.rules[toMalId] = rules;
    }
  }

  /**
   * Get the rules for the given MAL id
   * @param animeId MAL id of the anime to retrieve the rules of
   */
  get(animeId: number) {
    return this.rules[animeId] || [];
  }
}

const rules = new Rules();
rules.readRelations();

export default rules;