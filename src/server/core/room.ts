import { randomBytes } from 'node:crypto';
import { realtime, redis } from '@devvit/web/server';
import { TRPCError } from '@trpc/server';
import type { RoomState } from '../../shared/game';
import { recordResult } from './leaderboard';

const TTL_S = 60 * 60 * 24;
const roomKey = (id: string) => `room:${id}`;
export const codeKey = (code: string) => `code:${code}`;
export const quickMatchKey = (size: number) => `qm:${size}`;
export const userRoomKey = (userId: string) => `user:${userId}:room`;
export const channelOf = (id: string) => `room_${id}`;

export const newId = () => randomBytes(8).toString('hex');
// no 0/O/1/I so codes are easy to read aloud
export const newCode = () =>
  Array.from(randomBytes(6), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');

const expiry = () => ({ expiration: new Date(Date.now() + TTL_S * 1000) });

export const getRoom = async (id: string): Promise<RoomState | null> => {
  const raw = await redis.get(roomKey(id));
  return raw ? JSON.parse(raw) : null;
};

export const createRoom = async (state: RoomState) => {
  await redis.set(roomKey(state.id), JSON.stringify(state), expiry());
  await afterChange(null, state);
};

export const setUserRoom = (userId: string, roomId: string) =>
  redis.set(userRoomKey(userId), roomId, expiry());

/** Optimistic-locked read-modify-write. `fn` may throw to reject; returning the same object is a no-op. */
export const mutateRoom = async (
  id: string,
  fn: (s: RoomState) => RoomState
): Promise<RoomState> => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const txn = await redis.watch(roomKey(id));
    const raw = await redis.get(roomKey(id));
    if (!raw) {
      await txn.unwatch();
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Room not found' });
    }
    const cur: RoomState = JSON.parse(raw);
    let changed: RoomState;
    try {
      changed = fn(cur);
    } catch (e) {
      await txn.unwatch();
      if (e instanceof Error && !(e instanceof TRPCError))
        throw new TRPCError({ code: 'BAD_REQUEST', message: e.message });
      throw e;
    }
    if (changed === cur) {
      await txn.unwatch();
      return cur;
    }
    const next = { ...changed, version: cur.version + 1 };
    await txn.multi();
    await txn.set(roomKey(id), JSON.stringify(next), expiry());
    // an aborted EXEC (key changed since WATCH) yields no results
    const res = await txn.exec().catch(() => null);
    if (res && res.length > 0) {
      await afterChange(cur, next);
      return next;
    }
  }
  throw new TRPCError({ code: 'CONFLICT', message: 'Busy, try again' });
};

const afterChange = async (prev: RoomState | null, next: RoomState) => {
  if (next.status !== 'waiting' && !next.isPrivate) {
    const qmKey = quickMatchKey(next.size);
    if ((await redis.get(qmKey)) === next.id) await redis.del(qmKey);
  }
  if (prev?.status !== 'finished' && next.status === 'finished') await recordResult(next);
  await realtime.send(channelOf(next.id), next);
};
