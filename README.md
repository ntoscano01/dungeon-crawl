# Dungeon Crawl

A text-based dungeon crawler with an LLM dungeon master, randomly generated
each run from author-defined content packs (tiles, items, monsters, NPCs,
events). Players give directional/action commands in natural language;
movement and combat are resolved with real dice rolls.

## Status

Early scaffold. The deterministic engine (generation, movement, attack,
dice), the four-panel UI shell, and the LLM narrator/intent-parser (real
Claude API tool-use calls, with an offline fallback when no API key is
configured) all work end-to-end against an in-memory session store and one
starter content pack. Not yet wired: Postgres persistence (schema exists,
engine doesn't use it yet), and the 3D dice animation / real map renderer.

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
  `dice.ts`, `generation.ts` (map generation), `tools.ts` (tool-call
  handlers: move, attack, ...), `session.ts` (in-memory session store),
  `context.ts` (builds the bounded `TurnContext` handed to the LLM)
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

- Only `move`, `attack`, and `party_status` are implemented in
  `tools.ts`; `search`, `use_item`, `interact`, `rest`, `roll_check`,
  `inspect` throw `EngineValidationError("not implemented yet")`
- Swap the in-memory session store for Prisma-backed persistence
- Real map renderer (canvas/SVG with connections) and 3D dice roll
  animation (Three.js)
- App icons for `public/manifest.json` (`icon-192.png`, `icon-512.png`
  referenced but not present yet)
- Party support beyond a single character (data model is ready; UI/engine
  currently only creates one)
