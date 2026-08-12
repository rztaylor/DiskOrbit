# Repository setup facts

- Repository: `https://github.com/rztaylor/DiskOrbit`; Git remote: `origin`.
- The repository is public and uses `main` as its default branch.
- The standard project foundation is established through `AGENTS.md`,
  `.agents/facts/`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`,
  `SECURITY.md`, `docs/`, `scripts/`, and `.github/`.
- Dependabot checks Go modules, frontend npm dependencies, and GitHub Actions
  weekly with at most five open pull requests per ecosystem.
- GitHub Actions is the hosted validation and release platform. Workflow-token
  permissions remain read-only except for the final release publishing job.
- Repository settings should delete merged branches, keep Actions enabled with
  read-only workflow permissions, enable vulnerability alerts and security
  updates, and protect `main` through pull requests once the initial branch
  exists and stable required checks are visible.
