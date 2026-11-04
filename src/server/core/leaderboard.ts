import { redis } from '@devvit/web/server';
import { winners, type RoomState } from '../../shared/game';

// Redis is already scoped per installation, i.e. per subreddit.
const WINS = 'lb:wins';
const BOXES = 'lb:boxes';

export const recordResult = async (state: RoomState) => {
  const top = winners(state);
  // ties don't count as wins
  const winner = top.length === 1 ? top[0] : undefined;
  if (winner && !winner.isBot) await redis.zIncrBy(WINS, winner.username, 1);
  for (const p of state.players) {
    if (!p.isBot && p.score > 0) await redis.zIncrBy(BOXES, p.username, p.score);
  }
};

export const getLeaderboard = async () => {
  const top = (key: string) => redis.zRange(key, 0, 9, { by: 'rank', reverse: true });
  const [wins, boxes] = await Promise.all([top(WINS), top(BOXES)]);
  return { wins, boxes };
};
