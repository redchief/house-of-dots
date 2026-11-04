import { expect } from 'vitest';
import { test } from '../test';
import { TURN_MS } from '../../shared/game';
import * as actions from './actions';
import { createRoom } from './room';

const alice = { userId: 't2_alice', username: 'alice' };
const bob = { userId: 't2_bob', username: 'bob' };

test('quick match puts the second player in the waiting room', async () => {
  const a = await actions.quickMatch(alice, 4);
  const b = await actions.quickMatch(bob, 4);
  expect(b.id).toBe(a.id);
  expect(b.players.map((p) => p.username)).toEqual(['alice', 'bob']);
  // a different size gets its own room
  const c = await actions.quickMatch(bob, 6);
  expect(c.id).not.toBe(a.id);
});

test('private room: join by code, moves are turn-checked', async () => {
  const room = await actions.createPrivate(alice, 4);
  await actions.joinByCode(bob, room.code.toLowerCase());
  await expect(actions.start(bob, room.id)).rejects.toThrow('Only the host');
  const started = await actions.start(alice, room.id);
  expect(started.status).toBe('playing');
  await expect(actions.move(bob, room.id, 'h:0:0')).rejects.toThrow('Not your turn');
  const after = await actions.move(alice, room.id, 'h:0:0');
  expect(after.turn).toBe(1);
  await expect(actions.move(bob, room.id, 'h:0:0')).rejects.toThrow('already drawn');
});

test('timeout before the deadline is a no-op, after it skips the turn', async () => {
  const room = await actions.createPrivate(alice, 4);
  await actions.joinByCode(bob, room.code);
  const started = await actions.start(alice, room.id);
  expect((await actions.timeout(bob, room.id)).turn).toBe(0);
  const realNow = Date.now;
  Date.now = () => started.turnDeadline + 1;
  try {
    const skipped = await actions.timeout(bob, room.id);
    expect(skipped.turn).toBe(1);
    expect(skipped.turnDeadline).toBe(started.turnDeadline + 1 + TURN_MS);
  } finally {
    Date.now = realNow;
  }
});

test('leaving clears the active room', async () => {
  const room = await actions.createPrivate(alice, 4);
  await actions.joinByCode(bob, room.code);
  await actions.leave(alice, room.id);
  expect(await actions.activeRoom(alice)).toBeNull();
  expect((await actions.activeRoom(bob))?.hostId).toBe(bob.userId);
});

test('solo start fills with a bot; rematch is created once', async () => {
  const room = await actions.createPrivate(alice, 4);
  const started = await actions.start(alice, room.id);
  expect(started.players).toHaveLength(2);
  expect(started.players[1]!.isBot).toBe(true);

  await createRoom({ ...started, status: 'finished' });
  const r1 = await actions.rematch(alice, room.id);
  const r2 = await actions.rematch(alice, room.id);
  expect(r2.id).toBe(r1.id);
  expect(r1.id).not.toBe(room.id);
  expect(r1.status).toBe('playing');
  expect(r1.players.map((p) => p.score)).toEqual([0, 0]);
  expect((await actions.activeRoom(alice))?.id).toBe(r1.id);
});
