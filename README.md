# Puluc: The Obsidian Path

A complete single-player web implementation of the project-defined Puluc variant. The human plays from the south (`0`) toward the north (`10`) against an authoritative server-controlled bot.

## Stack and architecture

- Node.js 20+, TypeScript strict mode, Express, native WebSocket protocol via `ws`, Zod validation, Vitest.
- `src/shared/engine.ts`: pure rules engine, persistent outbound/return direction, state validation, serialization, deterministic RNG injection.
- `src/server`: authoritative sessions, idempotent/versioned commands, bot decisions, reconnection snapshots.
- `src/client`: dependency-free responsive interface with keyboard controls, reduced motion support, history, pause, restart, settings, and rules.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. For production:

```bash
npm run build
npm start
```

Run tests with `npm test`.

## Deploy

The repository includes `render.yaml` for one-click deployment as a Render Blueprint. Connect the GitHub repository in Render, create a new Blueprint, and select this repository. Render runs `npm ci && npm run build`, starts the authoritative Node/WebSocket server with `npm start`, and checks `/health`.

## Implemented variant

- Eleven occupied board spaces, 4–6 pieces per player, four binary casting sticks (`0 painted = 5`).
- Reserve entry only with `1`; exact linear movement; reversal at the enemy endpoint.
- Ordered stack capture and recapture; the top layer controls movement.
- Returning a controlled stack to its own base frees friendly pieces and eliminates enemy pieces.
- A legal move after rolling `1` or `5` earns an extra cast. No legal move forfeits it.
- Win by eliminating all living enemy pieces. Draw by threefold repetition, 200 rounds, or 500 half-moves.

## Protocol and operational notes

Commands contain `gameId`, unique `commandId`, and `expectedVersion`. The server rejects malformed, stale, illegal, out-of-turn, and client-authored roll/result data. Sessions live in memory and reconnect through the saved game ID; restarting the server clears them. The default `PORT` is `3000` and can be overridden with the environment.

The visual direction is an original, locally rendered obsidian/jade scene. It makes no claim of being a precise historical reconstruction.
