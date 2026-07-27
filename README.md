# Dungeon Crawl

A text-based dungeon crawler with an LLM dungeon master, randomly generated
each run from author-defined content packs (tiles, items, monsters, NPCs,
events). Players give directional/action commands in natural language;
movement and combat are resolved with real dice rolls.

## Status

Early scaffold, but the full turn loop is real. All nine engine tools
(`move`, `attack`, `use_item`, `interact`, `search`, `rest`, `roll_check`,
`inspect`, `party_status`) are implemented against an in-memory session
store and one starter content pack — including monsters with persistent
per-instance HP (tracked across attacks, not re-rolled each hit) and
one-shot tile events (traps, discoveries) resolved through a weighted
outcome table. The LLM narrator/intent-parser makes real Claude API
tool-use calls, with an offline keyword-parser/template fallback covering
the same nine tools when no API key is configured. Not yet wired: Postgres
persistence (schema exists, engine doesn't use it yet), and the 3D dice
animation / real map renderer.

## Design docs

- [`docs/content-pack-schema.md`](docs/content-pack-schema.md) — the data
  format for tiles, items, monsters, NPCs, and events that define a world.
- [`docs/engine-llm-contract.md`](docs/engine-llm-contract.md) — the
  tool-calling interface between the deterministic game engine and the LLM
  narrator, and the turn loop that ties them together.
- [`docs/data-model.md`](docs/data-model.md) — character/party, map graph,
  and session/save state, and how the four UI panels read from it.

## Stack

- Next.js (App Router) + TypeScript, deployed as a PWA (web + installable
  mobile)
- Node/TypeScript backend (Next.js route handlers), Postgres via Prisma for
  persistence
- Three.js + a physics engine for real-time 3D dice rolls (not added yet)
- Canvas/SVG for the live-building dungeon map (current `MapPanel` is a
  placeholder grid, not the real renderer)

## Running locally

```bash
npm install
npm run dev
```

Opens the game shell at `http://localhost:3000`. A session is created
automatically on load, generated from `src/lib/content-packs/base/base.pack.json`.
Try commands like "go north" or "attack rat_swarm" in the narration panel.

Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY` to use the real
LLM narrator/intent-parser — without it, `src/lib/llm/` falls back to a
keyword parser and template narration so the app still runs (a failed or
missing-credential API call is caught and logged, not fatal). `DATABASE_URL`
isn't needed yet — Prisma persistence isn't wired into the engine.

## Code layout

- `src/lib/types/` — shared TypeScript types mirroring the design docs
  (`content-pack.ts`, `state.ts`, `engine.ts`, `ui.ts`)
- `src/lib/engine/` — the deterministic game engine: `rng.ts` (seeded PRNG),
  `dice.ts`, `generation.ts` (map generation, incl. rolling monster
  instance HP), `events.ts` (resolves a tile event's weighted outcome
  table and applies its effect), `tools.ts` (handlers for all nine
  `EngineTool`s), `session.ts` (in-memory session store), `context.ts`
  (builds the bounded `TurnContext` handed to the LLM)
- `src/lib/content-packs/` — pack loader + the `base` starter pack
- `src/lib/llm/` — `client.ts` (Anthropic SDK client), `parse-intent.ts`
  (tool-use call mapping player text to one `EngineTool`), `narrate.ts`
  (turns an `EngineToolResult` into prose, constrained to given facts).
  Both fall back to a keyword parser / template strings if the API call
  fails, so a missing key or transient error doesn't break a turn.
- `src/app/api/session`, `src/app/api/turn` — route handlers implementing
  the turn loop
- `src/components/` — the four UI panels (`NarrationPanel`, `MapPanel`,
  `CharacterPanel`, `InventoryPanel`) plus `src/app/page.tsx`, which lays
  them out (grid on desktop, tabs on mobile)
- `prisma/schema.prisma` — persistence schema matching `docs/data-model.md`
  (not yet connected to the engine)

## Known gaps / next steps

- Swap the in-memory session store for Prisma-backed persistence (the
  schema's `MapNodeContent` model needs `instanceId`/`hpCurrent`/`hpMax`
  wired up to match `MonsterInstance` once this happens)
- `reveal_tile` event effects are a no-op — the content-pack schema
  doesn't yet identify which tile to reveal
- All actions currently act on `party.members[0]`; no turn-order UI or
  per-character targeting yet (`rest` is the exception — it heals the
  whole party)
- Real map renderer (canvas/SVG with connections) and 3D dice roll
  animation (Three.js)
- App icons for `public/manifest.json` (`icon-192.png`, `icon-512.png`
  referenced but not present yet)
- Party support beyond a single character (data model is ready; UI/engine
  currently only creates one)
