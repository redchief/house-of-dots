# House of Dots

The classic pen-and-paper game of dots and boxes, played live with other redditors.

Take turns drawing a line between two neighbouring dots, horizontally or vertically. Draw the fourth side of a box and it's yours: your Reddit avatar is stamped inside it and you get to go again. When every line is drawn, the player with the most boxes wins.

## How to play

- **Quick match:** jump into a game with random redditors. If not enough people join within 20 seconds, bots fill the empty seats so you never wait long.
- **Private room:** create a room and share its 6-letter code, or invite friends by username and they get a Reddit message with the code.
- **Board sizes:** 4×4, 6×6 or 8×8 boxes, for 2 to 4 players.
- **Turn timer:** you have 30 seconds per turn. Miss three turns in a row and a bot takes over your seat so the game keeps moving.
- **Rematch:** play again with the same group in one tap.
- **Leaderboard:** each community has its own leaderboard for wins and for boxes captured.

## For moderators

Installing the app creates a House of Dots post in your community automatically. To add another one, open the subreddit's mod menu and choose **Create a new post**. A single post holds all games: every match and private room runs inside it, so your feed stays clean.

## What the app does with Reddit data

- **Your username and avatar** are shown to the other players in your game.
- **Game state** (players, lines and boxes) is stored for 24 hours, then deleted automatically.
- **Leaderboard scores** are stored per community and keyed by username.
- **Invites:** when a player invites someone, the app sends that user one Reddit private message with the room code. The recipient must be a username the player typed in, and each room can send at most 5 invites.
- **Posts:** the app only creates a post when it's installed or when a moderator uses the menu action.

No data leaves Reddit, and the app has no ads and no tracking.

## Development

Built with [Devvit](https://developers.reddit.com/), React, Tailwind, Hono and tRPC. Requires Node 24 (`nvm use`).

- `npm run dev`: playtest on your dev subreddit
- `npm run test`: types, lint, unit tests and build
- `npm run deploy`: upload a new version
- `npm run launch`: publish for review

Game rules live in `src/shared/game.ts`, and the server actions in `src/server/core/`.

## License

BSD-3-Clause
