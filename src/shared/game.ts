export const TURN_MS = 30_000;
export const QUICK_MATCH_WAIT_MS = 20_000;
export const MAX_PLAYERS = 4;
export const MAX_MISSED = 3;
export const SIZES = [4, 6, 8] as const;
export type BoardSize = (typeof SIZES)[number];

export type Player = {
  userId: string;
  username: string;
  avatarUrl: string;
  isBot: boolean;
  score: number;
  missed: number;
};

export type RoomState = {
  id: string;
  code: string;
  size: BoardSize;
  isPrivate: boolean;
  status: 'waiting' | 'playing' | 'finished';
  hostId: string;
  players: Player[];
  /** "h:r:c" | "v:r:c" -> player index */
  lines: Record<string, number>;
  /** "r:c" -> player index */
  boxes: Record<string, number>;
  /** last line drawn, for highlighting */
  lastLine: string | null;
  turn: number;
  turnDeadline: number;
  createdAt: number;
  invites: number;
  rematchId: string | null;
  /** bumped on every save so clients can drop stale realtime messages */
  version: number;
};

export const newRoom = (opts: {
  id: string;
  code: string;
  size: BoardSize;
  isPrivate: boolean;
  host: Player;
  now: number;
}): RoomState => ({
  id: opts.id,
  code: opts.code,
  size: opts.size,
  isPrivate: opts.isPrivate,
  status: 'waiting',
  hostId: opts.host.userId,
  players: [opts.host],
  lines: {},
  boxes: {},
  lastLine: null,
  turn: 0,
  turnDeadline: 0,
  createdAt: opts.now,
  invites: 0,
  rematchId: null,
  version: 0,
});

export const makePlayer = (
  userId: string,
  username: string,
  avatarUrl: string
): Player => ({ userId, username, avatarUrl, isBot: false, score: 0, missed: 0 });

export const makeBot = (n: number): Player => ({
  userId: `bot${n}`,
  username: `DotBot ${n}`,
  avatarUrl: '',
  isBot: true,
  score: 0,
  missed: 0,
});

export const allLines = (size: number): string[] => {
  const out: string[] = [];
  for (let r = 0; r <= size; r++)
    for (let c = 0; c < size; c++) out.push(`h:${r}:${c}`);
  for (let r = 0; r < size; r++)
    for (let c = 0; c <= size; c++) out.push(`v:${r}:${c}`);
  return out;
};

export const isValidLine = (size: number, line: string): boolean => {
  const m = /^([hv]):(\d+):(\d+)$/.exec(line);
  if (!m) return false;
  const r = Number(m[2]);
  const c = Number(m[3]);
  return m[1] === 'h' ? r <= size && c < size : r < size && c <= size;
};

const boxSides = (r: number, c: number) => [
  `h:${r}:${c}`,
  `h:${r + 1}:${c}`,
  `v:${r}:${c}`,
  `v:${r}:${c + 1}`,
];

/** Boxes (as [r, c]) that touch a line. */
const boxesOf = (size: number, line: string): [number, number][] => {
  const [kind, rs, cs] = line.split(':');
  const r = Number(rs);
  const c = Number(cs);
  const cand: [number, number][] =
    kind === 'h' ? [[r - 1, c], [r, c]] : [[r, c - 1], [r, c]];
  return cand.filter(([br, bc]) => br >= 0 && bc >= 0 && br < size && bc < size);
};

const sidesDrawn = (lines: Record<string, number>, r: number, c: number) =>
  boxSides(r, c).filter((s) => s in lines).length;

/** Seat a player. Re-joining is a no-op; a full quick-match room starts itself. */
export const joinRoom = (state: RoomState, player: Player, now: number): RoomState => {
  if (state.players.some((p) => p.userId === player.userId)) return state;
  if (state.status !== 'waiting') throw new Error('Game already started');
  if (state.players.length >= MAX_PLAYERS) throw new Error('Room is full');
  // an emptied room passes host to whoever joins next
  const hostId = state.players.length ? state.hostId : player.userId;
  const next = { ...state, hostId, players: [...state.players, player] };
  return !next.isPrivate && next.players.length === MAX_PLAYERS ? startGame(next, now) : next;
};

/** Waiting: free the seat (host passes on). Playing: a bot takes over the seat. */
export const leaveRoom = (state: RoomState, userId: string, now: number): RoomState => {
  const idx = state.players.findIndex((p) => p.userId === userId);
  if (idx < 0 || state.status === 'finished') return state;
  if (state.status === 'waiting') {
    const players = state.players.filter((_, i) => i !== idx);
    const hostId = state.hostId === userId ? (players[0]?.userId ?? '') : state.hostId;
    return { ...state, players, hostId };
  }
  const players = state.players.map((p, i) => (i === idx ? { ...p, isBot: true } : p));
  return runBots({ ...state, players }, now);
};

/** Start a waiting room: optionally top up with bots to `minPlayers`. */
export const startGame = (state: RoomState, now: number, minPlayers = 2): RoomState => {
  const players = [...state.players];
  for (let n = 1; players.length < minPlayers; n++) players.push(makeBot(n));
  return runBots({ ...state, players, status: 'playing', turn: 0, turnDeadline: now + TURN_MS }, now);
};

/** Apply a line for the current player. Throws on illegal moves. */
export const applyMove = (state: RoomState, line: string, playerIdx: number, now: number): RoomState => {
  if (state.status !== 'playing') throw new Error('Game is not in progress');
  if (playerIdx !== state.turn) throw new Error('Not your turn');
  if (!isValidLine(state.size, line)) throw new Error('Invalid line');
  if (line in state.lines) throw new Error('Line already drawn');

  const lines = { ...state.lines, [line]: playerIdx };
  const boxes = { ...state.boxes };
  let closed = 0;
  for (const [r, c] of boxesOf(state.size, line)) {
    if (sidesDrawn(lines, r, c) === 4) {
      boxes[`${r}:${c}`] = playerIdx;
      closed++;
    }
  }
  const players = state.players.map((p, i) =>
    i === playerIdx ? { ...p, score: p.score + closed, missed: 0 } : p
  );
  const finished = Object.keys(lines).length === allLines(state.size).length;
  return {
    ...state,
    lines,
    boxes,
    players,
    lastLine: line,
    status: finished ? 'finished' : 'playing',
    // classic rule: closing a box earns another turn
    turn: closed > 0 ? state.turn : (state.turn + 1) % players.length,
    turnDeadline: now + TURN_MS,
  };
};

/** Current player ran out of time: skip them; after MAX_MISSED a bot takes the seat. */
export const applyTimeout = (state: RoomState, now: number): RoomState => {
  if (state.status !== 'playing' || now < state.turnDeadline) return state;
  const players = state.players.map((p, i) => {
    if (i !== state.turn) return p;
    const missed = p.missed + 1;
    return { ...p, missed, isBot: p.isBot || missed >= MAX_MISSED };
  });
  return {
    ...state,
    players,
    turn: (state.turn + 1) % players.length,
    turnDeadline: now + TURN_MS,
  };
};

/** Greedy bot: take a box, else avoid giving one away, else anything. */
export const botMove = (state: RoomState, rand = Math.random): string => {
  const free = allLines(state.size).filter((l) => !(l in state.lines));
  const sidesAfter = (l: string) =>
    boxesOf(state.size, l).map(([r, c]) => sidesDrawn(state.lines, r, c) + 1);
  const pick = (ls: string[]) => ls[Math.floor(rand() * ls.length)];
  const scoring = free.filter((l) => sidesAfter(l).includes(4));
  if (scoring.length) return pick(scoring)!;
  const safe = free.filter((l) => !sidesAfter(l).includes(3));
  return pick(safe.length ? safe : free)!;
};

/** Play bot turns until a human is up or the game ends. */
export const runBots = (state: RoomState, now: number, rand = Math.random): RoomState => {
  let s = state;
  while (s.status === 'playing' && s.players[s.turn]?.isBot) {
    s = applyMove(s, botMove(s, rand), s.turn, now);
  }
  return s;
};

export const winners = (state: RoomState): Player[] => {
  const top = Math.max(...state.players.map((p) => p.score));
  return state.players.filter((p) => p.score === top);
};
