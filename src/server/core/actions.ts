import { context, reddit, redis } from '@devvit/web/server';
import { TRPCError } from '@trpc/server';
import {
  applyMove,
  applyTimeout,
  joinRoom,
  leaveRoom,
  makePlayer,
  newRoom,
  QUICK_MATCH_WAIT_MS,
  runBots,
  startGame,
  type BoardSize,
  type RoomState,
} from '../../shared/game';
import {
  codeKey,
  createRoom,
  getRoom,
  mutateRoom,
  newCode,
  newId,
  quickMatchKey,
  setUserRoom,
  userRoomKey,
} from './room';

export type User = { userId: string; username: string };

const MAX_INVITES = 5;

const playerFor = async (user: User) => {
  const avatar = await reddit.getSnoovatarUrl(user.username).catch(() => undefined);
  return makePlayer(user.userId, user.username, avatar ?? '/snoo.png');
};

const seatOf = (s: RoomState, user: User) => {
  const idx = s.players.findIndex((p) => p.userId === user.userId);
  if (idx < 0) throw new TRPCError({ code: 'FORBIDDEN', message: 'You are not in this room' });
  return idx;
};

const open = async (user: User, size: BoardSize, isPrivate: boolean) => {
  const state = newRoom({
    id: newId(),
    code: newCode(),
    size,
    isPrivate,
    host: await playerFor(user),
    now: Date.now(),
  });
  await createRoom(state);
  await redis.set(codeKey(state.code), state.id, { expiration: new Date(Date.now() + 86_400_000) });
  await setUserRoom(user.userId, state.id);
  return state;
};

const enter = async (user: User, roomId: string) => {
  const player = await playerFor(user);
  const room = await mutateRoom(roomId, (s) => joinRoom(s, player, Date.now()));
  await setUserRoom(user.userId, room.id);
  return room;
};

export const activeRoom = async (user: User) => {
  const id = await redis.get(userRoomKey(user.userId));
  const room = id ? await getRoom(id) : null;
  return room && room.status !== 'finished' ? room : null;
};

export const quickMatch = async (user: User, size: BoardSize) => {
  const waitingId = await redis.get(quickMatchKey(size));
  if (waitingId) {
    // full or already started: fall through and open a fresh room
    const joined = await enter(user, waitingId).catch(() => null);
    if (joined) return joined;
  }
  // shortcut: two simultaneous openers each create a room and the later one wins the queue slot; fine at small scale, use a lock if lobbies get busy
  const room = await open(user, size, false);
  await redis.set(quickMatchKey(size), room.id);
  return room;
};

export const createPrivate = (user: User, size: BoardSize) => open(user, size, true);

export const joinByCode = async (user: User, code: string) => {
  const id = await redis.get(codeKey(code.toUpperCase()));
  if (!id) throw new TRPCError({ code: 'NOT_FOUND', message: 'No room with that code' });
  return enter(user, id);
};

export const start = (user: User, roomId: string) =>
  mutateRoom(roomId, (s) => {
    seatOf(s, user);
    if (s.status !== 'waiting') return s;
    const now = Date.now();
    const anyoneMayStart = !s.isPrivate && now >= s.createdAt + QUICK_MATCH_WAIT_MS;
    if (s.hostId !== user.userId && !anyoneMayStart)
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the host can start' });
    return startGame(s, now);
  });

export const move = (user: User, roomId: string, line: string) =>
  mutateRoom(roomId, (s) => {
    const now = Date.now();
    return runBots(applyMove(s, line, seatOf(s, user), now), now);
  });

export const timeout = (user: User, roomId: string) =>
  mutateRoom(roomId, (s) => {
    seatOf(s, user);
    const now = Date.now();
    const next = applyTimeout(s, now);
    return next === s ? s : runBots(next, now);
  });

export const leave = async (user: User, roomId: string) => {
  await mutateRoom(roomId, (s) => leaveRoom(s, user.userId, Date.now())).catch((e) => {
    // room already expired: nothing to leave
    if (!(e instanceof TRPCError && e.code === 'NOT_FOUND')) throw e;
  });
  await redis.del(userRoomKey(user.userId));
  return { ok: true };
};

export const rematch = async (user: User, roomId: string) => {
  const old = await getRoom(roomId);
  if (!old) throw new TRPCError({ code: 'NOT_FOUND', message: 'Room not found' });
  seatOf(old, user);
  if (old.status !== 'finished')
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Game is not over yet' });
  if (!old.rematchId) {
    const now = Date.now();
    const fresh = newRoom({ id: newId(), code: newCode(), size: old.size, isPrivate: old.isPrivate, host: old.players[0]!, now });
    // seats a bot took over go back to their human owner
    const players = old.players.map((p) => ({ ...p, score: 0, missed: 0, isBot: p.userId.startsWith('bot') }));
    const candidate = startGame({ ...fresh, hostId: user.userId, players }, now);
    await createRoom(candidate);
    // if two players clicked at once, the first one to land wins and the other room just expires
    const linked = await mutateRoom(roomId, (s) => (s.rematchId ? s : { ...s, rematchId: candidate.id }));
    old.rematchId = linked.rematchId;
  }
  const next = old.rematchId ? await getRoom(old.rematchId) : null;
  if (!next) throw new TRPCError({ code: 'NOT_FOUND', message: 'Rematch expired' });
  await Promise.all(next.players.filter((p) => !p.isBot).map((p) => setUserRoom(p.userId, next.id)));
  return next;
};

export const invite = async (user: User, roomId: string, username: string) => {
  const room = await mutateRoom(roomId, (s) => {
    seatOf(s, user);
    if (s.invites >= MAX_INVITES)
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: `Max ${MAX_INVITES} invites per room` });
    return { ...s, invites: s.invites + 1 };
  });
  const postId = context.postId?.replace(/^t3_/, '') ?? '';
  await reddit.sendPrivateMessage({
    to: username,
    subject: `u/${user.username} invited you to House of Dots`,
    text:
      `u/${user.username} wants you in a game of House of Dots!\n\n` +
      `1. Open the game: https://www.reddit.com/comments/${postId}\n` +
      `2. Tap **Join with code** and enter **${room.code}**`,
  });
  return { ok: true };
};
