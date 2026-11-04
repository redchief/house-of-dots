# Contributing to House of Dots

Thanks for helping out! This guide covers how to report problems, set up the project, and get a pull request merged.

By taking part, you agree to keep things friendly and respectful, on GitHub and in [r/house_of_dots](https://www.reddit.com/r/house_of_dots/). Harassment or personal attacks get you removed from both.

## Ways to help

- **Report a bug.** Open a [GitHub issue](https://github.com/redchief/house-of-dots/issues) and include:
  - what you did
  - what you expected to happen
  - what actually happened
  - your device (desktop, iOS or Android app, or mobile web)
  - a screenshot, if you can
- **Suggest a feature.** Open an issue that describes the problem it solves before you write any code, so we can agree on the approach first.
- **Gameplay feedback** (balance, the bots, the timer and so on): post in [r/house_of_dots](https://www.reddit.com/r/house_of_dots/).
- **Security problems:** please **don't** open a public issue. Use GitHub's [private vulnerability reporting](https://github.com/redchief/house-of-dots/security/advisories/new) or [message the r/house_of_dots mods](https://www.reddit.com/message/compose?to=/r/house_of_dots).

## Setup

You need:

- **Node 24.18.0**: run `nvm use`, which reads the version from `.nvmrc`
- A Reddit account
- A **small private subreddit of your own** for playtesting

```bash
git clone https://github.com/<you>/house-of-dots.git
cd house-of-dots
nvm use
npm install
npm run login
```

### Playtesting

`npm run dev` installs your local build into a subreddit and reloads it as you edit. The `dev.subreddit` setting in `devvit.json` points at the maintainer's test subreddit (`house_of_dots_dev`), which you can't use. Pass your own subreddit instead:

```bash
npx devvit playtest your_test_subreddit
```

Please **don't commit** a change to `dev.subreddit`.

To test multiplayer, open the post in two browsers, or in a normal window plus a private window, logged in to two different Reddit accounts.

> Only maintainers upload and publish the app (`npm run deploy` / `npm run launch`). You never need to run them.

## Making a change

1. **Branch from `main`:** `feat/short-description`, `fix/short-description` or `chore/...`.
2. **Keep the pull request small and focused,** one change per pull request. Discuss large changes in an issue first.
3. **Run the full check before you push.** CI runs the same thing, and pull requests must pass:
   ```bash
   npm run test   # type-check + lint + unit tests + build
   ```
4. **Open a pull request** and fill in the template.

### Code rules

These rules come from [AGENTS.md](AGENTS.md) and how the code is built:

- **Game rules live in `src/shared/game.ts`** as pure functions, with no Redis or network calls. Rule changes need unit tests in `src/shared/game.test.ts`.
- **The server decides every move.** Never trust the client: check turns, inputs and permissions on the server, and validate inputs with `zod` in `src/server/trpc.ts`.
- **Change room state only through `mutateRoom()`** in `src/server/core/room.ts`. It handles locking and broadcasts updates to players.
- **TypeScript:** use `type` aliases instead of `interface`, named exports instead of default exports, and **no type casts** (`as X`).
- **Devvit Web only:** don't use `@devvit/public-api` or Blocks code.
- **Client restrictions:** don't use `window.location` (use `navigateTo`), `window.alert` or `window.confirm` (use `showToast` or an in-app confirm), or inline `<script>` tags.
- **Keep the splash screen light.** `splash.tsx` shows in the Reddit feed, so heavy code belongs in `game.tsx`.
- **Accessibility:** interactive elements need a label and keyboard support. Check both light and dark mode.
- **No new dependencies** unless they're really needed. Explain why in the pull request.

### Commit messages

Use short, imperative commit messages, for example `Fix timer skipping two players` or `Add 10x10 board for private rooms`. Reference the issue when there is one (`Fixes #12`).

### Art and promo assets

The logo, banners and promo art in `assets/reddit/` are built from the SVG files and `promo.html` next to them. Edit those source files and run `./assets/reddit/render-promo.sh` (it needs Chrome and ffmpeg); don't edit the PNG files directly. Don't use Reddit's branding, such as the Snoo, in promotional art.

## Review and release

- A maintainer reviews every pull request. Expect a reply within a few days.
- Merged changes go out in the next release. Every release goes through Reddit's app review before players see it, so a merge isn't live immediately.

## License

By contributing, you agree that your contributions are licensed under the project's [BSD-3-Clause license](LICENSE).
