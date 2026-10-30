# Production Readiness Review

## Purpose and Current Status

This document evaluates the operational readiness of the Promotion Calculation Service and identifies the controls required before production deployment.

The assessment implementation prioritizes correct promotion calculations, deterministic conflict resolution, and durable audit records. It is not presented as a fully production-hardened system.

### Implemented in the assessment

- TypeScript and Express HTTP service.
- Ajv-based request validation with numeric and payload constraints.
- An isolated, unit-tested promotion engine.
- Customer-savings-based conflict resolution.
- PostgreSQL audit persistence with transactional writes.
- Fail-closed behavior when audit persistence fails.
- Structured logging for request failures.
- Automated engine and API tests.
- Docker-based local database setup.

### Production capabilities still required or requiring verification

- Authentication and authorization.
- Centralized log aggregation and distributed tracing.
- Comprehensive application and database metrics.
- Production alerting and on-call procedures.
- Automated production deployment and rollback.
- Database high availability, backups, and tested recovery.
- Rate limiting and abuse protection.
- Idempotency for safe request retries.
- Load testing and defined service-level objectives.
- Complete financial precision and overflow hardening.

Implementation status should be verified against the code and deployment environment before release.

---

## 1. Logging and Tracing

### Current approach

The service uses structured JSON logs for technical failures and PostgreSQL records for business audit outcomes.

These serve different purposes:

**Operational logs** diagnose application and infrastructure behavior.

**Audit records** explain which promotions qualified, which were selected or rejected, and the monetary outcome of a calculation.

A correlation identifier supports investigation of a specific request.

### Production requirements

- Include timestamps, severity, event names, and correlation IDs in logs.
- Propagate correlation identifiers through downstream dependencies.
- Aggregate logs centrally with retention and access controls.
- Avoid logging authorization headers, credentials, payment information, or complete customer/cart payloads.
- Introduce distributed tracing if the service acquires multiple downstream dependencies.

### Trade-off

Detailed logs improve incident investigation but increase storage costs and the risk of exposing sensitive information.

Correlation IDs provide request-level association but do not, by themselves, constitute distributed tracing.

---

## 2. Metrics

The production implementation should instrument:

### API metrics

- Request rate by endpoint and status.
- HTTP 4xx and 5xx rates.
- p50, p95, and p99 request latency.
- Validation failure rate.
- Concurrent and timed-out requests.

### Promotion engine metrics

- Calculation duration.
- Number of promotions evaluated per request.
- Number of promotions applied and rejected.
- Discount calculation failures.
- Monetary invariant violations.

Promotion identifiers should be included in metrics only when their number is bounded. Otherwise, high-cardinality labels can significantly increase monitoring costs.

### Persistence metrics

- Audit transaction success and failure rates.
- Database query and transaction latency.
- PostgreSQL pool utilization and connection wait time.
- Connection errors and transaction rollbacks.

### Runtime metrics

- Node.js event-loop lag.
- CPU and memory utilization.
- Process restarts.
- Container health and resource saturation.

These are proposed production metrics, not a claim that a complete metrics pipeline is already implemented.

---

## 3. Alerting and On-Call

Alert thresholds should be established using load tests, observed production baselines, and agreed service-level objectives.

The following are initial proposals, not validated operational thresholds.

| Condition | Initial response |
|---|---|
| Sustained elevated 5xx rate | Investigate or page depending on error budget and impact |
| p95 latency above 500 ms for 10 minutes | Investigate latency regression |
| Sustained audit transaction failures | Page the service owner |
| Database unavailable | Page when requests are affected |
| DB pool utilization above 80% for 10 minutes | Investigate connection pressure |
| Disk usage above 80% | Capacity warning |
| Disk usage above 90% | Urgent capacity response |
| Monetary invariant violation | Page and investigate financial correctness |

A simple 2% error-rate threshold should not be treated as sufficient for every traffic level. Alerts should consider both error percentage and the number of affected requests.

### Initial incident investigation

1. Identify the affected request or correlation ID.
2. Inspect HTTP status and structured application logs.
3. Check the relevant calculation and promotion evaluation records, if present.
4. Verify database availability, query latency, and connection pool health.
5. Check recent deployments and promotion configuration changes.
6. Determine whether the incident affects availability, discount correctness, or audit integrity.

A successful API response without a corresponding durable audit record violates the intended persistence guarantee and requires investigation.

---

## 4. Deployment

The assessment uses a local development workflow rather than a complete production deployment pipeline.

### Production deployment requirements

- Build immutable application artifacts.
- Run TypeScript compilation and automated tests in CI.
- Apply version-controlled database migrations.
- Use backward-compatible schema changes where possible.
- Deploy behind health-checked infrastructure.
- Support rolling or blue/green deployments.
- Provide a documented rollback procedure.
- Store secrets in a managed secret store.
- Use separate least-privilege database identities for application runtime and migrations.

### Migration strategy

Database migrations should be compatible with both the current and incoming application versions during rolling deployment.

Destructive schema changes should be separated from releases that still depend on the old schema.

### Release verification

After deployment, verify:

- Health checks and startup.
- Database connectivity.
- Successful calculations.
- Audit record persistence.
- Error rates and latency.
- Promotion configuration version.

---

## 5. Disaster Recovery and Data Retention

PostgreSQL stores business audit records that may be needed for customer support, disputes, and operational investigations.

### Production requirements

- Automated database backups.
- Point-in-time recovery where supported.
- Regular restore testing.
- Documented recovery procedures.
- Agreed recovery point objective (RPO).
- Agreed recovery time objective (RTO).
- Audit retention and archival policies.
- Restricted access to sensitive audit information.

### Important distinction

Backups protect against data loss but do not automatically provide high availability.

High availability requires additional measures such as replication, failover planning, and operational monitoring.

RPO and RTO must be selected with business stakeholders rather than assumed by engineering.

Retention also requires agreement with legal, compliance, and privacy stakeholders where applicable.

---

## 6. Rate Limiting and Abuse Prevention

The current request schema limits cart size, quantities, prices, and unexpected input properties.

Production protection should additionally include:

- Per-client rate limiting at the API gateway.
- Optional per-customer or tenant quotas.
- Request timeouts.
- Connection and concurrency limits.
- Bounded database connection pools.
- Payload size limits.
- Monitoring of repeated invalid requests.

These controls reduce the risk of abusive or accidental traffic overwhelming application and database capacity.

### Idempotency and retries

The service writes an audit record as part of processing a calculation.

A request can commit its audit record while the client fails to receive the response.

An automatic retry could then create an additional audit record.

Before enabling automatic retries, introduce an idempotency strategy, such as a caller-supplied key scoped to a request identity, with a clearly defined retention period.

Retries must not assume that a timeout means the original database transaction failed.

---

## 7. Secrets, Identity, and Access Control

The assessment assumes authentication and authorization are handled upstream.

This is an explicit scope limitation and must not be treated as an acceptable assumption for every production deployment.

### Production requirements

- Authenticate service callers using an appropriate mechanism, such as JWT/OAuth2 or mTLS.
- Authorize access to relevant customer or tenant data.
- Inject database credentials through a secret manager.
- Rotate credentials and support revocation.
- Use least-privilege PostgreSQL roles.
- Encrypt traffic in transit.
- Apply appropriate encryption and access controls to stored data.
- Avoid committing secrets or local environment files to source control.

The service should minimize stored customer attributes and avoid unnecessary duplication of sensitive cart data.

---

## 8. Performance and Capacity Planning

### Initial deployment: approximately 100 requests/minute

The proposed starting architecture is:

- A stateless API instance.
- In-memory promotion configuration.
- PostgreSQL audit storage.
- A bounded database connection pool.

This is a deployment hypothesis, not a measured capacity guarantee.

Promotion evaluation is expected to be relatively inexpensive for small carts and a limited promotion set, while synchronous database writes may contribute significantly to latency.

Both assumptions require benchmarking.

### Growth toward 1,000 requests/minute

Collect measurements for:

- p95/p99 end-to-end latency.
- CPU and event-loop utilization.
- Database connection wait time.
- Transaction latency.
- Audit write throughput.
- Contention and lock waits.

Potential improvements include horizontal API replicas, query optimization, indexing, and pool tuning.

Pool sizes must be coordinated across replicas to avoid exceeding PostgreSQL connection limits.

### Growth toward 10,000 requests/minute

Evaluate based on observed bottlenecks:

- Horizontal API scaling.
- Versioned promotion configuration caching.
- Audit table partitioning.
- Database capacity and high availability.
- Read/write workload separation where useful.
- Asynchronous audit or event pipelines if business guarantees permit.

### Consistency consequence

Moving audit persistence to an asynchronous queue would change the current fail-closed contract.

Such a change must explicitly define when a calculation is considered successful, what has been durably stored, and how failed or duplicate deliveries are handled.

An outbox does not automatically eliminate those design questions.

---

## 9. Financial Correctness and Promotion Risk

Financial correctness is a production concern, not only a unit-testing concern.

The engine currently uses integer cents and applies explicit promotion rules.

Our selected business policies include:

- Maximizing customer savings for competing promotions targeting the same SKU.
- Allowing independent promotions on different target SKUs.
- Repeatable same-SKU Buy X, Get One Free promotions.
- Combining quantities across duplicate-SKU cart lines.
- Discounting the highest-priced eligible units first.
- Capping discounts at eligible item values.

### Risks

**Unsafe arithmetic:** JavaScript numbers can lose integer precision outside the safe integer range.

**Rounding discrepancies:** Percentage discounts require a consistent, tested rounding policy.

**Incorrect rule configuration:** A syntactically valid promotion can still cause an unintended financial outcome.

**Unexpected stacking:** New promotion types may interact in ways the current per-target selection strategy does not support.

**Historical reproducibility:** Without immutable promotion configuration versions, future investigations may be unable to reconstruct the exact rules applied at calculation time.

### Recommended controls

- Verify safe-integer handling and arithmetic bounds.
- Test subtotal and final-total invariants.
- Add boundary tests for quantities, prices, and percentages.
- Validate promotion configurations before publication.
- Introduce immutable configuration versions.
- Support controlled rollout and rollback of new promotions.
- Alert on impossible or unexpectedly large discount outcomes.
- Consider shadow calculations or dry-run evaluation for complex new promotion rules.

The current implementation should not claim complete financial precision hardening until the additional safety checks have been implemented and verified.

---

## 10. Operational Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| PostgreSQL outage | Calculations fail by design | High availability, alerting, recovery procedures |
| Audit commit succeeds but response is lost | Duplicate records on retry | Idempotency and reconciliation |
| Incorrect promotion configuration | Incorrect customer discounts | Config validation, versioning, rollback |
| Promotion interaction bug | Unexpected discount stacking or rejection | Engine tests, explicit policy, configuration review |
| Unsafe monetary arithmetic | Financial inaccuracy | Safe-integer checks and boundary tests |
| Sensitive data exposure | Privacy or security incident | Data minimization, redaction, access control |
| Unbounded audit growth | Storage and query degradation | Retention, partitioning, archival |
| Database connection exhaustion | Increased latency and failures | Pool monitoring and capacity planning |
| Unverified scaling assumptions | Degraded service under load | Representative performance testing |

---

## 11. Production Release Criteria

Before a production release, require evidence that:

- Automated tests and TypeScript compilation pass.
- Monetary invariants and arithmetic boundaries have been verified.
- Authentication and authorization requirements are satisfied.
- Database migrations and rollback procedures are tested.
- Audit persistence remains consistent during failures.
- Retry behavior is safe and documented.
- Application health, metrics, and alerts are configured.
- Backup restoration has been tested.
- Expected peak traffic has been load tested.
- Operational ownership and incident response procedures are defined.

These are release criteria, not claims that the assessment implementation already satisfies all of them.

---

## Conclusion

The Promotion Calculation Service demonstrates a clear separation between business logic and infrastructure, deterministic promotion behavior, and transactional audit persistence.

The most significant operational trade-off is its synchronous, fail-closed dependency on PostgreSQL.

The most significant remaining production work concerns operational instrumentation, authentication, idempotent retries, database resilience, configuration governance, and complete financial correctness hardening.

The service should advance toward production based on verified requirements and measured behavior, rather than by introducing infrastructure complexity preemptively.
