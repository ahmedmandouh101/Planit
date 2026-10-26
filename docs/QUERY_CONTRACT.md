# Legacy list and account validation

Generic list endpoints accept filters only on real schema paths available to
clients. Hidden fields, internal version fields, password/session internals,
unknown paths, arrays, and arbitrary nested query objects are rejected with 400.
Comparison objects support only gt/gte/lt/lte with string operands. Literal
values such as a tour named `gte` remain unchanged; operators are not converted
by rewriting serialized JSON. Up to 20 filters are accepted.

Sorting supports up to 10 comma-separated schema paths, optionally prefixed
with `-`. Projection supports up to 20 available paths, with inclusion or
exclusion, not both except for `_id`. `+password` and hidden-field overrides are
not accepted. Pagination remains page 1–10000, limit 1–100. These restrictions
are a deliberate compatibility change for previously unrestricted list queries.
They do not apply to custom endpoints unless those use the generic list helper.

Nested review list and detail reads remain scoped to their URL's tour; query
parameters cannot replace that scope. Review ownership remains enforced on
mutations. Public tour list/detail reads, saved-tour population, and public
aggregates exclude secret tours; adding a secret tour to favorites returns 404.
Monthly plans validate
years 2000–2100 and include the full last day using an exclusive next-year bound.

Signup validates a bounded text name and email, and normalizes email whitespace
and casing. Login rejects non-scalar credentials before database access. New
passwords on signup, reset, and authenticated change require at least eight
characters, matching confirmation, and at most 72 UTF-8 bytes to avoid bcrypt
truncation. Existing hashes are not rewritten; legacy passwords up to the previous
128-character login bound can still be supplied. This is not a password-hash
migration or a token/session revocation redesign.

Test coverage: query shape/privacy, nested scopes, aggregate boundaries, invalid
HTTP inputs without DB access, and exact UTF-8 password byte boundaries. Existing
MongoDB/authentication/SMTP integration tests verify the common valid flows.
