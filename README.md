public/

index.html                  ← Dev C (Auth page)

board.html                  ← Dev B (Kanban board)

js/

firebase.js               ← Dev A (config/init: exports app/auth/db)

tasks.js                  ← Dev A (CRUD, listeners, ordering helpers)

auth.js                   ← Dev C (login, logout, route guard)

board.js                  ← Dev B (render columns, counts, filters)

dnd.js                    ← Dev B (drag \& drop + ordering)

ui.js                     ← Shared (modal/toasts/loading)

firebase.json



## How We Split Work (Dev A / Dev B / Dev C)

**Dev A – Data & Rules**
- Owns Firestore schema (`tasks`, `meta/board`), security rules, and composite indexes.
- Implements `public/js/firebase.js` (init/exports) and `public/js/tasks.js` (CRUD, listeners, ordering).
- Provides helpers: `listenColumn`, `listenAll`, `createTask`, `updateTask`, `deleteTask`, `moveTask`, `computeOrder`, `getBoardTitle`, `setBoardTitle`.

**Dev B – Board UI**
- Owns `public/board.html`, `public/js/board.js`, `public/js/dnd.js`, shares `public/js/ui.js`.
- Renders 3 columns (To Do / In Progress / Done), task cards, counts, filters/search, responsive layout.
- Wires drag-and-drop to Dev A’s `moveTask` + `computeOrder`.

**Dev C – Auth & UX**
- Owns `public/index.html`, `public/js/auth.js`, shares `public/js/ui.js`.
- Implements login/logout, route guard for `board.html`, task modal (create/edit/delete), toasts, accessibility basics.
- Uses Dev A’s helpers; no second Firebase initialization.

### Dev A API (import from `/public/js/tasks.js`)
### For Dev B & C
- Data streams:
  - `listenColumn(status, cb)` // status: 'todo'|'in_progress'|'done'
  - `listenAll(cb)`
- CRUD:
  - `createTask(data)`, `updateTask(id, updates)`, `deleteTask(id)`
- Drag & drop:
  - `computeOrder(prevOrder, nextOrder)`, `moveTask(id, { newStatus, newOrder })`
- Board title:
  - `getBoardTitle()`, `setBoardTitle(title)`

\## Notes

\- Keep repo \*\*private\*\*. Do \*\*not\*\* commit credentials. Firebase `apiKey` is OK in client code.

\- Stick to MVP scope (no multi-board, roles, comments, uploads, etc.).

