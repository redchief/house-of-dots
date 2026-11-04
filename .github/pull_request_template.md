## What and why

<!-- What does this pull request change, and why? Link the issue: Fixes #123 -->

## How I tested it

<!-- e.g. playtested on r/my_test_sub with 2 accounts; 4x4 and 8x8 boards; light and dark mode -->

## Checklist

- [ ] `npm run test` passes (type-check, lint, unit tests, build)
- [ ] Game rule changes are in `src/shared/game.ts` and have unit tests
- [ ] Inputs are validated on the server; the client isn't trusted
- [ ] No type casts, no default exports, no `@devvit/public-api`
- [ ] Checked in light and dark mode, and on a mobile-sized screen
- [ ] `devvit.json` `dev.subreddit` is unchanged
