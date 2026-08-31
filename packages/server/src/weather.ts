import {
  eventOf,
  type AgentSignal,
  type BlockId,
  type RepoId,
  type StrataEvent,
} from '@strata/core';

/** What has arrived from a repo, as opposed to what its settings file promises. */
export interface Heard {
  ever: boolean;
  lastAt: number | null;
  count: number;
}

export interface Weather {
  receive(signal: AgentSignal): void;
  /** Whether any post has arrived for this repo, or for any repo when none is given. */
  heard(repo?: RepoId): boolean;
  statsOf(repo: RepoId): Heard;
}

/** Turns signals into facts and hands them to the stream. */
export function openWeather(
  known: (id: BlockId) => boolean,
  broadcast: (events: StrataEvent[]) => void,
): Weather {
  const heard = new Map<RepoId, { lastAt: number; count: number }>();
  return {
    receive(signal) {
      const seen = heard.get(signal.repo);
      if (seen) {
        seen.lastAt = signal.at;
        seen.count++;
      } else heard.set(signal.repo, { lastAt: signal.at, count: 1 });
      const event = eventOf(signal, known);
      if (event) broadcast([{ ...event, at: signal.at }]);
    },
    heard: (repo) => (repo === undefined ? heard.size > 0 : heard.has(repo)),
    statsOf: (repo) => {
      const seen = heard.get(repo);
      return seen
        ? { ever: true, lastAt: seen.lastAt, count: seen.count }
        : { ever: false, lastAt: null, count: 0 };
    },
  };
}
