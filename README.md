# Exquisite Snake

Exquisite Snake is a Next.js App Router project configured for static export.

## Install

```bash
npm ci
```

## Run in Development

```bash
npm run dev
```

Open `http://localhost:3000`.

## Static Export Workflow

Static export is configured in `next.config.ts` with `output: "export"`.

Build the production export:

```bash
npm run export
```

This generates static files in `out/`.

Notes:
- `npm run build` also runs `next build` and produces the same static-export output in `out/`.
- Deploy the contents of `out/` to any static hosting provider.

## Local Preview of the Export

After building/exporting, serve the generated `out/` directory locally:

```bash
npm run start
```

`npm run start` runs `npx --yes serve out`, which previews the exported site locally (default `http://localhost:3000`).
