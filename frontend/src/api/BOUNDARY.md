# Frontend API boundary

This directory owns typed requests to DiskOrbit's authenticated local API and
runtime validation of its responses. Callers supply the active Singleserve
fetch function; this layer never acquires or stores credentials itself.

It does not own React state, user-facing error presentation, backend behavior,
or persistence. Components and feature hooks consume these contracts rather
than issuing raw application requests.
