import './index.css';

import { StrictMode, useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { connectRealtime, context, disconnectRealtime, showToast } from '@devvit/web/client';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../server/trpc';
import {
  applyMove,
  QUICK_MATCH_WAIT_MS,
  SIZES,
  TURN_MS,
  winners,
  type BoardSize,
  type Player,
  type RoomState,
} from '../shared/game';
import { Board } from './Board';
import { trpc } from './trpc';
import { cn, COLORS } from './utils';

type Lobby = inferRouterOutputs<AppRouter>['lobby']['get'];

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
const toastErr = (e: unknown) => showToast(errMsg(e));
const postUrl = () => `https://www.reddit.com/comments/${context.postId?.replace(/^t3_/, '') ?? ''}`;

const useNow = (active: boolean) => {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
};

const Button = ({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    className={cn(
      'cursor-pointer rounded-full bg-[#ff4500] px-5 py-2.5 font-semibold text-white transition hover:bg-[#e03d00] active:scale-95 disabled:cursor-default disabled:opacity-50',
      className
    )}
    {...props}
  />
);

const Avatar = ({ p, idx, active }: { p: Player; idx: number; active?: boolean }) => (
  <span
    className={cn('inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-card-hi', active && 'animate-pulse')}
    style={{ boxShadow: `0 0 0 2px ${COLORS[idx]}` }}
  >
    {p.isBot || !p.avatarUrl ? '🤖' : <img src={p.avatarUrl} alt="" className="h-full w-full object-cover object-top" />}
  </span>
);

const Shell = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-screen flex-col items-center gap-4 bg-bg px-3 py-4 text-fg">{children}</div>
);

export const App = () => {
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [room, setRoomRaw] = useState<RoomState | null>(null);
  const [busy, setBusy] = useState(false);

  // accept a state only if it's for another room or not older than what we have
  const setRoom = useCallback((next: RoomState | null) => {
    setRoomRaw((prev) => (!next || !prev || next.id !== prev.id || next.version >= prev.version ? next : prev));
  }, []);

  const loadLobby = useCallback(async () => {
    try {
      const data = await trpc.lobby.get.query();
      setLobby(data);
      setRoom(data.room);
    } catch (e) {
      toastErr(e);
    }
  }, [setRoom]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLobby();
  }, [loadLobby]);

  const roomId = room?.id;
  useEffect(() => {
    if (!roomId) return;
    const channel = `room_${roomId}`;
    connectRealtime<RoomState>({ channel, onMessage: setRoom });
    return () => disconnectRealtime(channel);
  }, [roomId, setRoom]);

  const run = async (fn: () => Promise<RoomState>) => {
    setBusy(true);
    try {
      setRoom(await fn());
    } catch (e) {
      toastErr(e);
    } finally {
      setBusy(false);
    }
  };

  if (!lobby) {
    return (
      <Shell>
        <p className="m-auto animate-pulse text-muted">Loading…</p>
      </Shell>
    );
  }
  const me = lobby.me;
  const leave = async () => {
    if (room && room.status !== 'finished') {
      try {
        await trpc.room.leave.mutate({ roomId: room.id });
      } catch (e) {
        toastErr(e);
        return;
      }
    }
    setRoomRaw(null);
    void loadLobby();
  };
  if (!room) return <LobbyView lobby={lobby} busy={busy} run={run} />;
  if (room.status === 'waiting')
    return <WaitingView room={room} meId={me.userId} busy={busy} run={run} onLeave={leave} />;
  return (
    <GameView
      room={room}
      meId={me.userId}
      busy={busy}
      run={run}
      setRoom={setRoom}
      onLeave={leave}
    />
  );
};

type Run = (fn: () => Promise<RoomState>) => Promise<void>;

/** Top-left back link. With `confirm`, the first tap only arms it (no window.confirm in Devvit). */
const BackButton = ({ label, confirm, onClick }: { label: string; confirm?: string; onClick: () => void }) => {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={cn('cursor-pointer self-start rounded-full px-3 py-1 text-sm font-semibold text-muted hover:bg-card hover:text-fg', armed && 'bg-[#ff4500]/15 text-[#ff4500]')}
      onClick={() => (confirm && !armed ? setArmed(true) : onClick())}
    >
      ← {armed ? confirm : label}
    </button>
  );
};

const LobbyView = ({ lobby, busy, run }: { lobby: Lobby; busy: boolean; run: Run }) => {
  const [size, setSize] = useState<BoardSize>(4);
  const [code, setCode] = useState('');

  return (
    <Shell>
      <img src="/logo.svg" alt="" className="mt-2 w-16 drop-shadow" />
      <h1 className="text-3xl font-black tracking-tight">
        House of <span className="text-[#ff4500]">Dots</span>
      </h1>
      <p className="max-w-xs text-center text-sm text-muted">
        Take turns drawing lines. Close a box to claim it with your avatar and go again. Most boxes wins.
      </p>

      <div className="flex gap-1 rounded-full bg-card p-1" role="radiogroup" aria-label="Board size">
        {SIZES.map((s) => (
          <button
            key={s}
            role="radio"
            aria-checked={size === s}
            onClick={() => setSize(s)}
            className={cn('cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold', size === s ? 'bg-fg text-bg' : 'text-muted')}
          >
            {s}×{s}
          </button>
        ))}
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2">
        <Button disabled={busy} onClick={() => run(() => trpc.room.quickMatch.mutate({ size }))}>
          ⚡ Quick match
        </Button>
        <Button disabled={busy} className="bg-card-hi text-fg hover:brightness-95" onClick={() => run(() => trpc.room.create.mutate({ size }))}>
          🔒 Private room with friends
        </Button>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => trpc.room.join.mutate({ code }));
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="ROOM CODE"
            aria-label="Room code"
            className="min-w-0 flex-1 rounded-full bg-card px-4 text-center font-mono tracking-widest uppercase outline-none focus:ring-2 focus:ring-[#ff4500]"
          />
          <Button disabled={busy || code.length !== 6} className="bg-card-hi text-fg hover:brightness-95">
            Join
          </Button>
        </form>
      </div>

      <div className="mt-2 grid w-full max-w-sm grid-cols-2 gap-3">
        <Ranking title="🏆 Wins" rows={lobby.leaderboard.wins} />
        <Ranking title="🟧 Boxes" rows={lobby.leaderboard.boxes} />
      </div>
    </Shell>
  );
};

const Ranking = ({ title, rows }: { title: string; rows: { member: string; score: number }[] }) => (
  <div className="rounded-xl bg-card p-3">
    <h2 className="mb-1 text-sm font-bold text-muted">{title}</h2>
    {rows.length === 0 && <p className="text-xs text-muted">No games yet</p>}
    <ol className="space-y-0.5 text-sm">
      {rows.map((r, i) => (
        <li key={r.member} className="flex justify-between gap-2">
          <span className="truncate">
            {i + 1}. u/{r.member}
          </span>
          <span className="font-mono text-muted">{r.score}</span>
        </li>
      ))}
    </ol>
  </div>
);

type WaitingProps = { room: RoomState; meId: string; busy: boolean; run: Run; onLeave: () => void };

const WaitingView = ({ room, meId, busy, run, onLeave }: WaitingProps) => {
  const now = useNow(!room.isPrivate);
  const [invitee, setInvitee] = useState('');
  const isHost = room.hostId === meId;
  const autoStartAt = room.createdAt + QUICK_MATCH_WAIT_MS;
  const fired = useRef(false);

  useEffect(() => {
    if (room.isPrivate || now < autoStartAt || fired.current) return;
    fired.current = true;
    void run(() => trpc.room.start.mutate({ roomId: room.id }));
  }, [now, autoStartAt, room.isPrivate, room.id, run]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Join my House of Dots game! Code ${room.code} — ${postUrl()}`);
      showToast('Invite link copied');
    } catch {
      showToast(`Code: ${room.code}`);
    }
  };

  const sendInvite = async () => {
    try {
      await trpc.room.invite.mutate({ roomId: room.id, username: invitee });
      showToast(`Invite sent to u/${invitee.replace(/^u\//, '')}`);
      setInvitee('');
    } catch (e) {
      toastErr(e);
    }
  };

  return (
    <Shell>
      <BackButton label="Leave room" onClick={onLeave} />
      <h1 className="text-2xl font-black">{room.isPrivate ? 'Private room' : 'Finding players…'}</h1>
      <p className="text-sm text-muted">
        {room.size}×{room.size} board · {room.players.length}/4 players
      </p>

      <ul className="flex w-full max-w-xs flex-col gap-2">
        {room.players.map((p, i) => (
          <li key={p.userId} className="flex items-center gap-3 rounded-xl bg-card px-3 py-2">
            <Avatar p={p} idx={i} />
            <span className="truncate">u/{p.username}</span>
            {p.userId === room.hostId && <span className="ml-auto text-xs text-muted">host</span>}
          </li>
        ))}
      </ul>

      {room.isPrivate ? (
        <>
          <button onClick={copy} className="cursor-pointer rounded-xl bg-card px-6 py-3 text-center" aria-label="Copy invite">
            <div className="text-xs text-muted">Room code · tap to copy</div>
            <div className="font-mono text-3xl tracking-[0.3em]">{room.code}</div>
          </button>
          <form
            className="flex w-full max-w-xs gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void sendInvite();
            }}
          >
            <input
              value={invitee}
              onChange={(e) => setInvitee(e.target.value)}
              placeholder="u/username"
              aria-label="Reddit username to invite"
              className="min-w-0 flex-1 rounded-full bg-card px-4 outline-none focus:ring-2 focus:ring-[#ff4500]"
            />
            <Button disabled={invitee.length < 3} className="bg-card-hi text-fg hover:brightness-95">
              Invite
            </Button>
          </form>
          {isHost ? (
            <Button disabled={busy} onClick={() => run(() => trpc.room.start.mutate({ roomId: room.id }))}>
              Start game{room.players.length < 2 ? ' vs bot' : ''}
            </Button>
          ) : (
            <p className="text-sm text-muted">Waiting for the host to start…</p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">
          Starting in {Math.max(0, Math.ceil((autoStartAt - now) / 1000))}s — bots fill empty seats
        </p>
      )}
    </Shell>
  );
};

type GameProps = {
  room: RoomState;
  meId: string;
  busy: boolean;
  run: Run;
  setRoom: (s: RoomState) => void;
  onLeave: () => void;
};

const GameView = ({ room, meId, busy, run, setRoom, onLeave }: GameProps) => {
  const playing = room.status === 'playing';
  const now = useNow(playing);
  const myIdx = room.players.findIndex((p) => p.userId === meId);
  const myTurn = playing && room.turn === myIdx && !room.players[myIdx]?.isBot;
  const left = Math.max(0, room.turnDeadline - now);
  const firedFor = useRef(0);

  // anyone watching reports an expired turn; the server re-checks the clock
  useEffect(() => {
    if (!playing || now < room.turnDeadline + 1000 || firedFor.current === room.turnDeadline) return;
    firedFor.current = room.turnDeadline;
    trpc.room.timeout.mutate({ roomId: room.id }).then(setRoom).catch(() => {});
  }, [now, playing, room.turnDeadline, room.id, setRoom]);

  const move = (line: string) => {
    if (!myTurn || busy) return;
    try {
      setRoom({ ...applyMove(room, line, myIdx, Date.now()), version: room.version });
    } catch {
      return;
    }
    void run(() => trpc.room.move.mutate({ roomId: room.id, line }));
  };

  const top = winners(room);
  const current = room.players[room.turn];

  return (
    <Shell>
      {playing && <BackButton label="Leave game" confirm="Tap again — a bot takes your seat" onClick={onLeave} />}
      <div className="flex w-full max-w-md flex-wrap justify-center gap-2">
        {room.players.map((p, i) => (
          <div
            key={p.userId}
            className={cn('flex items-center gap-2 rounded-full bg-card py-1 pr-3 pl-1 transition', playing && i === room.turn && 'bg-card-hi')}
            style={playing && i === room.turn ? { boxShadow: `0 0 0 2px ${COLORS[i]}` } : undefined}
          >
            <Avatar p={p} idx={i} active={playing && i === room.turn} />
            <span className="max-w-20 truncate text-xs">{p.userId === meId ? 'You' : p.username}</span>
            <span className="font-mono text-lg font-bold">{p.score}</span>
          </div>
        ))}
      </div>

      {playing ? (
        <div className="w-full max-w-md text-center">
          <p className={cn('font-semibold', myTurn ? 'text-[#ff4500]' : 'text-muted')} aria-live="polite">
            {myTurn ? 'Your turn — draw a line!' : `${current?.isBot ? '🤖 ' : ''}u/${current?.username} is thinking…`}
          </p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-card">
            <div className="h-full transition-[width] duration-200" style={{ width: `${(left / TURN_MS) * 100}%`, background: COLORS[room.turn] }} />
          </div>
        </div>
      ) : (
        <div className="text-center" aria-live="polite">
          <p className="text-2xl font-black">
            {top.length > 1 ? "🤝 It's a tie!" : top[0]?.userId === meId ? '🎉 You win!' : `🏆 u/${top[0]?.username} wins`}
          </p>
        </div>
      )}

      <Board room={room} canMove={myTurn && !busy} onMove={move} />

      {!playing && (
        <div className="flex gap-2">
          <Button disabled={busy} onClick={() => run(() => trpc.room.rematch.mutate({ roomId: room.id }))}>
            {room.rematchId ? 'Join rematch' : 'Rematch'}
          </Button>
          <Button className="bg-card-hi text-fg hover:brightness-95" onClick={onLeave}>
            Lobby
          </Button>
        </div>
      )}
    </Shell>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
