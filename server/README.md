# Leaderboard server

A tiny [Cloudflare Worker](https://developers.cloudflare.com/workers/) with a [D1](https://developers.cloudflare.com/d1/) (SQLite) database. It runs free on Cloudflare's free plan.

It stores one row per player: a random id, a nickname and an all-time token total. It never sends anyone's id back out, and it never receives chat text.

| Endpoint | Body | What it does |
|---|---|---|
| `POST /join` | `{ id, nickname, total? }` | Adds you. The nickname must pass `src/nickname.js` and not be taken. `total` is capped at 1,000,000 tokens. At most 5 joins per network per day. |
| `POST /rename` | `{ id, nickname }` | Changes your nickname. |
| `POST /submit` | `{ id, total }` | Moves your total up (never down), at most once a minute, by at most 300,000 tokens an hour. |
| `POST /leave` | `{ id }` | Deletes you. |
| `GET /top?id=` | | The top 20, your own rank, and the number of players. |

## Run it on your computer

```bash
cd server
npm install
npx wrangler d1 execute magtira-leaderboard --local --file=schema.sql
npx wrangler dev --port 8787
```

To use it, set `src/config.js` to `http://localhost:8787` and add `http://localhost:8787/*` to `host_permissions` in `manifest.json` (both point at the live server by default).

## Put it online (your own copy)

1. Make a free account at [cloudflare.com](https://dash.cloudflare.com/sign-up), then sign in from here:
   ```bash
   npx wrangler login
   ```
2. Create the database and copy the `database_id` it prints into `wrangler.toml`:
   ```bash
   npx wrangler d1 create magtira-leaderboard
   ```
3. Create the tables, then deploy:
   ```bash
   npx wrangler d1 execute magtira-leaderboard --remote --file=schema.sql
   npx wrangler deploy
   ```
4. Put the `https://….workers.dev` address it prints into `src/config.js`, and into `host_permissions` in `manifest.json`. Then click ↻ on the extension.

Optional: `npx wrangler secret put IP_SALT` (any random text) makes the hashed network ids harder to guess.

## Remove a nickname

```bash
npx wrangler d1 execute magtira-leaderboard --remote --command "DELETE FROM players WHERE nickname_key = 'the nickname in lowercase'"
```

## Tests

From the project folder, `npm test` runs `tests/leaderboard.test.js` against this exact server code, using Node's built-in SQLite in place of D1.
