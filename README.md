# Cozy Canvas 🎨

Cozy Canvas is a responsive, real-time multiplayer drawing competition web app designed for couples and friends (specifically optimized for long-distance connection). Players join a room via a 4-letter code, draw on a smooth vector-like canvas following matching prompts, and reveal their creations side-by-side to exchange ratings and reactions.

Built with **Next.js 16 (App Router)**, **TypeScript**, **Tailwind CSS 4**, and **Supabase (Realtime, Postgres & Storage)**.

---

## ✨ Features

- **Smooth Freehand Drawing:** Powered by `perfect-freehand` for pressure-sensitive, calligraphic strokes.
- **Unified Toolset:** Pen, Eraser, Flood Fill (Scanline algorithm), Lines, Rectangles, Circles, and text insertions.
- **Canvas Layers:** Three composited layers — Background, Sketch, and Details — each with independent opacity and visibility controls.
- **Canvas Navigation:** Viewport panning (Spacebar + drag / dual-finger drag) and zoom (scroll wheel / pinch-to-zoom).
- **Lobby Presence:** Real-time online participant lists showing active drawing indicator animations and completed checkmarks.
- **Reveal Mode:** Hidden drawing boards during rounds, with side-by-side reveals once both players click "Done" or time expires.
- **Reactions & Rating:** Mutual star, heart, and crown rankings that auto-tally scores to announce a round winner.
- **Session Gallery:** Historic cards showing drawings and reactions from all rounds in the current session.
- **Prompt Categories:** Five themed drawing prompt packs — Animals, Objects, Relationship, Fantasy & Adventure, and Silly & Absurd.
- **Synth Audio Feedback:** Mellow synthesized pops, chimes, fanfares, and warning countdown sound effects built on the native Web Audio API (completely asset-free, toggleable).
- **Responsive Layout:** Tailored with a cozy warm clay-cream layout matching touch viewports perfectly.

---

## 🚀 Getting Started

### 1. Prerequisites
Ensure you have **Node.js 18+** installed.

### 2. Set Up Supabase
1. Create a new project on [Supabase](https://supabase.com/).
2. Open the **SQL Editor** in your Supabase dashboard and run the contents of the `schema.sql` file (found at the root of this project). This creates the `rooms`, `rounds`, and `drawings` tables, sets up Row-Level Security (RLS) policies, and configures the Realtime publication.
3. Go to **Storage** in Supabase and create a new bucket named `drawings`. Ensure its access level is set to **Public** so that players can fetch drawings.

### 3. Environment Variables
Create a `.env.local` file at the root of this project and configure your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```
*(Refer to `.env.local.example` for details.)*

### 4. Run Locally
Install dependencies:
```bash
npm install
```

Start the development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🛠️ Project Structure

- `src/app/` - App router structure. Includes root landing (`page.tsx`) and dynamic lobbies (`room/[code]/page.tsx`).
- `src/components/` - React components:
  - `DrawingCanvas.tsx` - Canvas capture, pointer handlers, zoom/pan operations.
  - `DrawingToolbar.tsx` - Color pickers, opacity, brush dimensions, clear/undo/redo.
  - `GameController.tsx` - Tickers, prompts, state loaders, scoring, reveal screens.
  - `RoomPresence.tsx` - Player details and status indicators.
  - `Gallery.tsx` - Historic drawing cards.
- `src/hooks/` - `useRoomRealtime.ts` presence tracker and channel event subscriber.
- `src/lib/` - Helpers for perfect-freehand math, Web Audio synthesis, and Supabase client definitions.
- `schema.sql` - Database migrations script.

---

## 🔮 Stretch Goals & Future Ideas

- **Live Collaboration Mode:** A shared board allowing players to draw simultaneously on a single canvas in real time. (The `useRoomRealtime` hook already implements `broadcastStroke` and `onDrawingReceived` wrappers to support this!).
- ~~**Custom Prompt Packs:** Allow players to upload or customize their own banks of text prompts.~~ ✅ *Done — five themed categories now ship with the app.*
- ~~**Layers support:** Implement background, sketch, and detailing layers on the canvas.~~ ✅ *Done — Background, Sketch, and Details layers are fully implemented.*
- **Cross-device History:** Lightweight magic-link authentication to store a persistent gallery profile.
- **Collab Drawing Cursor Sync:** Render the partner's stylus/cursor coordinate indicators in real-time.
