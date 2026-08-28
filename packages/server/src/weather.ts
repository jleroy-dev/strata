import { eventOf, type AgentSignal, type StrataEvent } from '@strata/core';

export interface Weather {
  receive(signal: AgentSignal): void;
  heard(): boolean;
}

/** Turns signals into facts and hands them to the stream. */
export function openWeather(
  known: (path: string) => boolean,
  broadcast: (events: StrataEvent[]) => void,
): Weather {
  let heard = false;
  return {
    receive(signal) {
      heard = true;
      const event = eventOf(signal, known);
      if (event) broadcast([{ ...event, at: signal.at }]);
    },
    heard: () => heard,
  };
}
