# mana-vault
A self-hosted, local-first Magic: The Gathering collection manager with deck building as the main focus.

## Status

Early planning. No application code yet.

## Planned first release

- Card search by standard fields (Scryfall-style syntax, a subset at first)
- Collection tracking with quantities, per printing
- Deck building with two modes:
  - **Normal mode**: any printing of a card
  - **Theme mode**: one specific printing per card, chosen for its art
- Import and export: plain-text decklists and CSV (Moxfield, Archidekt, Deckbox, ManaBox styles)
- Local SQLite database, kept outside the container
- Docker deployment on a private server
- Backup and restore guidance

## Later

- Art-theme search (find cards by what the art shows, such as cats or forests)
- Camera card scanning
- Android enhancements

## Planned stack

TypeScript, Node.js, Fastify, SQLite (Drizzle ORM), React + Vite as a PWA, Docker.

## Data and secrets

Collection data lives in a persistent volume on the server, never in this repository.
Do not commit `.env` files, credentials, or data exports.
