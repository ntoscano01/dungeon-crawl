# Dungeon Crawl

A text-based dungeon crawler with an LLM dungeon master, randomly generated
each run from author-defined content packs (tiles, items, monsters, NPCs,
events). Players give directional/action commands in natural language;
movement and combat are resolved with real dice rolls.

## Status

Design phase — no application code yet.

## Design docs

- [`docs/content-pack-schema.md`](docs/content-pack-schema.md) — the data
  format for tiles, items, monsters, NPCs, and events that define a world.
- [`docs/engine-llm-contract.md`](docs/engine-llm-contract.md) — the
  tool-calling interface between the deterministic game engine and the LLM
  narrator, and the turn loop that ties them together.

## Planned stack

- Next.js + TypeScript, deployed as a PWA (web + installable mobile)
- Node/TypeScript backend, Postgres for persistence
- Three.js + a physics engine for real-time 3D dice rolls
- Canvas/SVG for the live-building dungeon map
