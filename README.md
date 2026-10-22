# Ayaale Hub

Phase 1 homepage built with Next.js App Router, TypeScript, Tailwind CSS 4, and Lucide React. The design follows the supplied `prototype.html`; it is rebuilt with React components, not embedded.

## Local setup

Requires Node.js 22.13 or later (Node.js 24 LTS recommended) and npm. From a terminal:

```sh
cd /Users/asela/Ayaale
npm install
npm run dev
```

Open http://localhost:3000.

## Verification

```sh
npm run lint
npm run typecheck
npm run build
```

The production build writes to `.next/`. Run `npm start` after `npm run build` to serve the production application. The server listens on `0.0.0.0` and uses the `PORT` environment variable supplied by the host (3000 by default).

## Structure

- `src/app`: homepage entry point, metadata, global styling, and Tailwind import.
- `src/components/dashboard.tsx`: responsive shell, reusable project cards, search, summaries, idea preview, and native accessible dialog.
- `src/data/mock.ts`: typed illustrative projects, ideas, and milestones.
- `src/types/index.ts`: shared contracts and allowed categories.

## Behavior and limitations

Search filters project names/descriptions and idea titles/categories/descriptions. Summary counts always reflect all data, independently of filters. Active projects are those marked `in_progress`; upcoming goals exclude `done` milestones. The vault shows the five most recent matching ideas.

Add Idea trims and validates a required title (80 characters maximum), accepts a category and optional description (240 characters maximum), and immediately updates the preview and count. A successful save clears search so the new idea is visible. The native dialog contains keyboard focus, closes with Escape, and restores focus to its trigger. Backdrop and Cancel also close it.

All content and progress indicators are illustrative. Added ideas exist only in React state and disappear on reload. Notifications, settings, and future navigation show coming-soon messages. No database, authentication, extra pages, analytics, paid services, or server integration are included.

## Manual acceptance checks

At 1440px, 768px, and 390px viewport widths: verify no horizontal overflow, readable cards, and usable navigation. Search for a project, an idea category, and a nonexistent term. Add a whitespace-only title and confirm inline validation; then save a valid idea and verify the count increases and search finds it. Reopen the dialog, tab through controls, press Escape, and check focus returns to the opening button. Click future destinations to verify coming-soon feedback. Reload and confirm the session-only idea disappears.

## Verification results

Lint, TypeScript, and production build passed. Browser checks passed for empty-title validation, idea capture and count updates, search for a captured idea, Escape dismissal with focus restoration, and coming-soon feedback. Exact 1440px/768px/390px browser viewport checks were not available in the preview controls; responsive breakpoints are implemented but those three widths still need manual visual review.

## Render Web Service

- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Node.js: 22.13 or later (24 recommended)

This project uses a Next.js production server, not static export mode. After pushing a change, deploy the latest commit on Render if automatic deployment is disabled.
