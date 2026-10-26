import { GreedyAi } from './greedy';
import type { AiController } from './types';

export type { AiController } from './types';
export { GreedyAi } from './greedy';

export type AiKind = 'greedy' | 'cautious' | 'reckless';

export function createAi(kind: AiKind = 'greedy'): AiController {
  switch (kind) {
    case 'cautious':
      return new GreedyAi({ caution: 1.6 });
    case 'reckless':
      return new GreedyAi({ caution: 0.3 });
    default:
      return new GreedyAi();
  }
}
