# Security policy

DiskOrbit is pre-release software. Security fixes currently target the latest
source on `main`; there are no supported historical release lines yet.

## Report a vulnerability

Please use GitHub's private vulnerability reporting for
[`rztaylor/DiskOrbit`](https://github.com/rztaylor/DiskOrbit/security/advisories/new)
when it is available. Do not open a public issue for an undisclosed
vulnerability.

Include a concise description, affected platform and version or commit,
reproduction steps, likely impact, and any suggested mitigation. Do not send
real Singleserve bootstrap URLs, cookies, filesystem inventories, private
paths, or unredacted debug logs.

If private vulnerability reporting is unavailable, open a minimal public issue
asking for a private contact channel without disclosing vulnerability details.

## Security boundary

DiskOrbit binds to loopback and uses Singleserve's per-launch authenticated
browser session. Filesystem observations remain local to the process. Browser
requests use retained scan and node IDs for native reveal; they cannot request
arbitrary command execution or filesystem mutation.

Delete, trash, move, rename, permission changes, repair, accounts, telemetry,
cloud services, and user-supplied shell execution are outside the product
boundary.
