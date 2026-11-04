import { initTRPC, TRPCError } from '@trpc/server';
import { context, reddit } from '@devvit/web/server';
import { z } from 'zod';
import { transformer } from '../shared/transformer';
import { Context } from './context';
import { SIZES } from '../shared/game';
import * as actions from './core/actions';
import { getLeaderboard } from './core/leaderboard';

const t = initTRPC.context<Context>().create({ transformer });

export const router = t.router;
export const publicProcedure = t.procedure;

/** Logged-in Reddit user; anonymous viewers can't play. */
const authed = t.procedure.use(async ({ next }) => {
  const { userId } = context;
  const username = context.username ?? (await reddit.getCurrentUsername());
  if (!userId || !username)
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Log in to Reddit to play' });
  return next({ ctx: { user: { userId, username } } });
});

const size = z.object({ size: z.union(SIZES.map((s) => z.literal(s))) });
const roomId = z.object({ roomId: z.string().regex(/^[a-f0-9]{16}$/) });

export const appRouter = t.router({
  lobby: t.router({
    get: authed.query(async ({ ctx }) => {
      const [room, leaderboard] = await Promise.all([
        actions.activeRoom(ctx.user),
        getLeaderboard(),
      ]);
      return { me: ctx.user, room, leaderboard };
    }),
  }),
  room: t.router({
    quickMatch: authed.input(size).mutation(({ ctx, input }) => actions.quickMatch(ctx.user, input.size)),
    create: authed.input(size).mutation(({ ctx, input }) => actions.createPrivate(ctx.user, input.size)),
    join: authed
      .input(z.object({ code: z.string().trim().regex(/^[A-Za-z0-9]{6}$/) }))
      .mutation(({ ctx, input }) => actions.joinByCode(ctx.user, input.code)),
    start: authed.input(roomId).mutation(({ ctx, input }) => actions.start(ctx.user, input.roomId)),
    move: authed
      .input(roomId.extend({ line: z.string().max(12) }))
      .mutation(({ ctx, input }) => actions.move(ctx.user, input.roomId, input.line)),
    timeout: authed.input(roomId).mutation(({ ctx, input }) => actions.timeout(ctx.user, input.roomId)),
    leave: authed.input(roomId).mutation(({ ctx, input }) => actions.leave(ctx.user, input.roomId)),
    rematch: authed.input(roomId).mutation(({ ctx, input }) => actions.rematch(ctx.user, input.roomId)),
    invite: authed
      .input(roomId.extend({ username: z.string().trim().transform((s) => s.replace(/^u\//, '')).pipe(z.string().regex(/^[A-Za-z0-9_-]{3,20}$/)) }))
      .mutation(({ ctx, input }) => actions.invite(ctx.user, input.roomId, input.username)),
  }),
});

export type AppRouter = typeof appRouter;
