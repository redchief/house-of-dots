import { describe, expect, it } from 'vitest';
import {
  allLines,
  applyMove,
  applyTimeout,
  botMove,
  joinRoom,
  leaveRoom,
  makePlayer,
  MAX_MISSED,
  newRoom,
  runBots,
  startGame,
  TURN_MS,
  winners,
  type RoomState,
} from './game';

const twoPlayer = (): RoomState => {
  const room = newRoom({
    id: 'r',
    code: 'ABC123',
    size: 4,
    isPrivate: true,
    host: makePlayer('t2_a', 'alice', ''),
    now: 0,
  });
  room.players.push(makePlayer('t2_b', 'bob', ''));
  return startGame(room, 0);
};

describe('game', () => {
  it('passes the turn when no box is closed', () => {
    const s = applyMove(twoPlayer(), 'h:0:0', 0, 0);
    expect(s.turn).toBe(1);
  });

  it('closing a box scores and keeps the turn', () => {
    let s = twoPlayer();
    s = applyMove(s, 'h:0:0', 0, 0);
    s = applyMove(s, 'h:1:0', 1, 0);
    s = applyMove(s, 'v:0:0', 0, 0);
    s = applyMove(s, 'v:0:1', 1, 0);
    expect(s.boxes['0:0']).toBe(1);
    expect(s.players[1]!.score).toBe(1);
    expect(s.turn).toBe(1);
  });

  it('one line can close two boxes', () => {
    let s = twoPlayer();
    // two adjacent boxes with the shared middle line left open
    s = { ...s, lines: Object.fromEntries(['h:0:0', 'h:1:0', 'v:0:0', 'h:0:1', 'h:1:1', 'v:0:2'].map((l) => [l, 0])) };
    s = applyMove(s, 'v:0:1', 0, 0);
    expect(s.players[0]!.score).toBe(2);
    expect(s.turn).toBe(0);
  });

  it('rejects illegal moves', () => {
    const s = twoPlayer();
    expect(() => applyMove(s, 'h:0:0', 1, 0)).toThrow('Not your turn');
    expect(() => applyMove(s, 'h:9:0', 0, 0)).toThrow('Invalid line');
    expect(() => applyMove(s, 'x', 0, 0)).toThrow('Invalid line');
    const s2 = applyMove(s, 'h:0:0', 0, 0);
    expect(() => applyMove(s2, 'h:0:0', 1, 0)).toThrow('Line already drawn');
  });

  it('bot takes an available box and avoids third sides', () => {
    const s = { ...twoPlayer(), lines: { 'h:0:0': 0, 'h:1:0': 0, 'v:0:0': 0 } };
    expect(botMove(s)).toBe('v:0:1');
    const fresh = { ...twoPlayer(), lines: { 'h:0:0': 0, 'h:1:0': 0 } };
    for (let i = 0; i < 20; i++) expect(['v:0:0', 'v:0:1']).not.toContain(botMove(fresh));
  });

  it('timeout skips and eventually hands the seat to a bot', () => {
    let s = twoPlayer();
    expect(applyTimeout(s, TURN_MS - 1)).toBe(s);
    let now = 0;
    for (let i = 0; i < MAX_MISSED; i++) {
      // alice times out, bob plays
      now += TURN_MS;
      s = applyTimeout(s, now);
      if (s.status !== 'playing' || s.players[0]!.isBot) break;
      s = applyMove(s, allLines(4).find((l) => !(l in s.lines))!, 1, now);
    }
    expect(s.players[0]!.isBot).toBe(true);
  });

  it('leaving a waiting room frees the seat and passes host', () => {
    const room = newRoom({ id: 'r', code: 'X', size: 4, isPrivate: true, host: makePlayer('t2_a', 'a', ''), now: 0 });
    const withB = joinRoom(room, makePlayer('t2_b', 'b', ''), 0);
    const left = leaveRoom(withB, 't2_a', 0);
    expect(left.players.map((p) => p.userId)).toEqual(['t2_b']);
    expect(left.hostId).toBe('t2_b');
    const empty = leaveRoom(left, 't2_b', 0);
    expect(joinRoom(empty, makePlayer('t2_c', 'c', ''), 0).hostId).toBe('t2_c');
  });

  it('leaving mid-game hands the seat to a bot that plays on', () => {
    const s = leaveRoom(twoPlayer(), 't2_a', 0);
    expect(s.players[0]!.isBot).toBe(true);
    expect(s.turn).toBe(1);
  });

  it('bots play a full game to the end', () => {
    const room = newRoom({ id: 'r', code: 'X', size: 6, isPrivate: false, host: makePlayer('t2_a', 'a', ''), now: 0 });
    room.players[0]!.isBot = true;
    const s = runBots(startGame(room, 0, 3), 0);
    expect(s.status).toBe('finished');
    const total = s.players.reduce((n, p) => n + p.score, 0);
    expect(total).toBe(36);
    expect(winners(s).length).toBeGreaterThan(0);
  });
});
