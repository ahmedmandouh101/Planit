# Continuous integration

The API checks workflow runs unit tests, then authentication/saved-tour and SMTP integration tests against disposable MongoDB and Mailpit containers. It does not use a developer's database or secrets.
It also verifies booking and seat-inventory behavior. MongoDB runs on port 27018 as the single-node `planit-rs` replica set; CI initializes it and waits for a writable primary before integration tests, so transaction behavior is exercised rather than mocked.

CI pins MongoDB to `mongo:7.0.45`. The previous `mongo:8.0` container exited before any integration test ran, reporting a Linux kernel incompatibility (MongoDB [SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912)). Docker shares the runner host's kernel, so choosing an Ubuntu container image does not fix that incompatibility. See the [MongoDB 8.0 release notes](https://www.mongodb.com/docs/v8.0/release-notes/8.0/).

MongoDB 7.0 avoids the affected MongoDB 8 allocator path. This changes only the disposable CI database; the local MongoDB 8 installation and its data stay unchanged. CI currently verifies MongoDB 7.0 compatibility, while local integration tests also run against MongoDB 8. Revisit the CI pin once a compatible MongoDB 8 image is available for the runner kernel.

Readiness checks have bounded command timeouts and stop immediately if a container exits. Failure diagnostics include container state and MongoDB startup logs in GitHub annotations. Containers are removed even when tests fail.
