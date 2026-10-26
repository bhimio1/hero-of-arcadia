import type { Action, GameState } from '../types';

/**
 * An AI opponent. It is handed the game as its player sees it (enemy units hidden by fog
 * are removed) and returns one action at a time; it is asked again after every action,
 * so it can react to what happened (deaths, ambushes, ...).
 *
 * Implementations must only return actions that are legal in `view`, and must use the
 * same rules functions as the player. Swap in a smarter AI by implementing this interface.
 */
export interface AiController {
  readonly name: string;
  nextAction(view: GameState): Action;
}
