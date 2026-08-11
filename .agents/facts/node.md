# Node and frontend-tooling facts

- Build-time runtime: Node.js 22 or newer; running DiskOrbit requires no Node
  installation.
- Package root and lockfile: `frontend/package.json` and
  `frontend/package-lock.json`; use `npm ci` for deterministic installs.
- TypeScript is strict and currently uses the 7.x toolchain.
- Frontend validation is Biome lint, Vitest, TypeScript/Vite production build,
  and the separately declared Playwright lifecycle gate.
- Compiled assets are generated under
  `internal/webui/assets/generated/` and remain untracked.
