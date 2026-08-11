# Engineering facts

- Work mode is greenfield until established implementation conventions exist;
  make coherent low-risk decisions but avoid speculative abstractions.
- Prefer focused standard-library Go packages and explicit TypeScript models.
- Handle realistic filesystem, browser, authentication, cancellation, and
  process-boundary failures without hiding errors or panicking.
- Every change has verifiable acceptance criteria and receives focused checks
  before broader validation.
- Keep queues, concurrency, update payloads, rendered nodes, and resource
  ownership explicitly bounded.

