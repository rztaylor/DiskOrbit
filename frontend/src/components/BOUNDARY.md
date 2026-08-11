# Frontend component boundary

This directory owns reusable, user-visible DiskOrbit controls, dialogs,
navigation, scan status, and result presentation. Components compose typed API
contracts and callbacks while keeping interaction, accessibility, and local UI
state close to the visible feature.

It does not own authentication, backend filesystem behavior, persisted
preferences, scan orchestration, or D3 hierarchy construction. App-shell
composition, API clients, lifecycle state, settings state, and visualisation
geometry remain with their adjacent owners.
