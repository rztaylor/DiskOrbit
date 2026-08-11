# Frontend UI facts

- Framework: React with strict TypeScript, built by Vite into static assets.
- Root: `frontend/`; application source: `frontend/src/`.
- Dependency direction: tokens/theme -> primitives and shared patterns ->
  feature components -> app-shell composition. Shared layers never import the
  shell or feature owners.
- The foundation shell owns lifecycle orchestration and page composition.
  `src/api/` owns typed backend requests; `src/lifecycle/` owns Singleserve
  session state; `src/components/` owns reusable visible contracts.
- CSS custom properties in `src/styles.css` own colour, spacing, typography,
  focus, and responsive decisions. No component framework or CSS-in-JS system.
- API calls use the single Singleserve session's `session.fetch`; raw backend
  fetches, credentials in JavaScript, Web Storage, permissive CORS, and control
  routes under `/_singleserve/` are prohibited.
- Healthy connection state is visually quiet. Visible lifecycle states are
  limited to actionable startup loading, unavailable/API error recovery,
  shutdown denial, and terminal stopped instructions.
- The app shell has no persistent footer; essential actions and current scan
  context belong with the feature that owns them.
- Terminal scan results use a chart-first, viewport-sized workspace without a
  duplicate metric strip. The centred header context owns the exact scan root,
  successful completion stays visually quiet, and Chart, exact Contents, and
  Insights are peer full-area workspace tabs. Chart is the default and Escape
  returns to it from either data view.
- Active scans remain unmistakable through an inside-out centre-chart pulse
  synchronized to refreshed visual-tree data, a persistent Stop action,
  animated indeterminate header line, live header counters, and scanning
  document title. The root stays fixed at the header centre while live counters
  grow to its left and coverage details grow to its right; Stop is a distinct
  icon button in the right-hand action cluster. The UI never invents a percent
  complete because scan work is not known in advance; reduced-motion users
  retain the centre status without the pulse.
- Header actions use compact accessible icon controls. The settings action opens
  an in-shell five-category vertical-tab page that shows one group at a time;
  theme and all display preferences are persisted through the authenticated
  backend API, never Web Storage.
- The header brand returns a terminal scan workspace to the startup launcher
  without reloading. It remains disabled while a scan is active so Stop stays
  available and a running scan cannot be hidden accidentally.
- A compact header warning appears only for partial or failed coverage and
  toggles a responsive, independently scrollable coverage drawer with exact
  issue groups, bounded examples, and any fatal error. The drawer is modeless
  beside the desktop workspace and modal at narrow widths.
- Desktop is primary. Narrow layouts must preserve the main content and allow
  dense data regions to collapse or scroll without clipping controls.
- Validation: TypeScript build, Vitest unit tests, production asset build, and
  Playwright browser lifecycle/screenshots at desktop and narrow widths when
  visible UI changes. Browser binaries stay in the ignored workspace cache.
- D3 owns radial hierarchy layout and arc geometry only. API fetching, scan
  state, selection, report state, and DOM composition remain React-owned.
- `internal/settings.Defaults` is the sole production application-default
  table. `GET /api/settings` returns both the saved value and those defaults so
  the browser can implement Restore defaults without maintaining a second copy.
- The radial view refreshes during active scans without navigation and uses
  authoritative completion colour. Persisted defaults allow 2–12 rings (seven
  by default), a 200–4,000 item budget (4,000 by default), per-ring directory
  expansion, per-directory segment limits, a whole-chart minimum visible angle,
  file visibility with count/size policies, geometry/order/gap choices, five
  colour encodings including focus-stable hierarchical branch hues,
  authoritative logical-byte file-type dominance, and optional capacity wedges. The depth-aware
  loader reserves item budget for later rings instead of exhausting it at the
  broadest early level. Omitted bytes either remain in `Other` or stop at their
  exact parent ring as intentional spiky gaps. Limited-access hatching covers
  only unresolved angular intervals and follows the centre circumference when
  the focused root itself has no outward continuation there.
- The radial hover inspector is permanently visible on desktop and follows the
  hovered segment before falling back to a pinned segment or current root. It
  uses a primary measurement card and compact metric cards rather than a
  definition table; narrow layouts move the inspector below the chart.
- Chart segments provide an accessible context menu through right click,
  Shift+F10/Context Menu, and the inspector action button. Actions are limited
  to focus, pinned details, adding retained nodes to the Review list, reveal in
  the native file manager, copy path, and opening bounded reports; terminal or
  arbitrary-execution actions are absent.
- Allocated size is the default display metric because the primary workflow is
  finding consumed storage capacity; Allocated or Logical can be persisted as
  the startup choice and still changed in the current workspace.
- Exact volume-root scans may offer a persisted capacity toggle at the chart
  root in Allocated mode. Measured entries retain their observed weights, a
  separate unaccounted-used wedge reconciles host-used capacity, and a neutral
  free wedge shows availability; ordinary folders and Logical mode never imply
  drive capacity.
- Startup uses authenticated backend-discovered scan cards for familiar places
  and deduplicated mounted volumes. Cards start scans directly; “Another
  folder” opens an accessible modal with quick roots, bounded lazy directory
  navigation, opt-in hidden folders (off by default), breadcrumbs, and manual
  path recovery. Browse loading, empty, inaccessible, and truncation states remain inside the modal;
  paths and listings are never persisted.
- The directory tree is a dense, independently scrolling, horizontally
  resizable desktop rail with bounded deep indentation. It can collapse to a
  narrow control and starts collapsed on narrow layouts so it does not displace
  the chart.
- Browse owns a bottom Review-list shelf that expands upward with a pointer- and
  keyboard-resizable separator. The bounded collection is transient to one
  scan, accepts retained nodes from Chart, tree, Contents, and Insights through
  drag-and-drop or named actions, consolidates ancestor/descendant overlap, and
  labels totals as measured rather than reclaimable. It offers select, reveal,
  remove-from-list, and clear-list actions only; it never mutates files or uses
  browser storage.
- Item-level View in DiskOrbit, Add to Review list, and Reveal in file manager
  affordances use the shared action-icon component across result surfaces;
  visible labels, tooltips, and accessible names remain action-specific.
- Biome is the frontend linter because the current typescript-eslint release
  does not support the project's TypeScript 7 toolchain.
