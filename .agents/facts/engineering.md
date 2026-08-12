# Engineering facts

- The initial product milestone is feature-complete and has established
  implementation conventions. Treat changes as maintenance or bounded new
  features unless an approved roadmap item explicitly opens broader work.
- Prefer focused standard-library Go packages and explicit TypeScript models.
- Handle realistic filesystem, browser, authentication, cancellation, and
  process-boundary failures without hiding errors or panicking.
- Every change has verifiable acceptance criteria and receives focused checks
  before broader validation.
- Keep queues, concurrency, update payloads, rendered nodes, and resource
  ownership explicitly bounded.
