# Local n8n on Windows

This repository runs one local n8n service for fictional LeadOps development. Docker Desktop must be running. The Compose project is `aramis-leadops`; it is separate from the containers used by other Aramis projects.

The image is pinned to **2.41.7**, the stable release checked on 2026-10-05. SQLite is sufficient for this small local pilot. The Windows bind mount keeps all project data inside the requested workspace; this trades some performance and Linux permission guarantees for a visible, recoverable data location. A future always-on deployment should review storage, database and hosting separately.

## Start and stop

From the repository directory:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/n8n.ps1 Start
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/n8n.ps1 Status
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/n8n.ps1 Stop
```

Open [localhost:5678](http://localhost:5678). On first launch, create the local instance owner in the browser using your own email and password. This is separate from a n8n Cloud account. Enter provider secrets only in n8n credentials, never in workflow parameters or chat.

To restore the credential-free portfolio demo into a fresh instance:

```powershell
docker compose exec -T n8n n8n import:workflow --input=/opt/leadops/workflows/leadops-demo.json
```

This imports the reviewed export with ID `aramis-leadops-demo`. On an existing instance, that command replaces the workflow with that same ID, so back up any local edits first. The fresh instance rebuilt on 2026-10-05 already has this workflow imported.

The service binds to `127.0.0.1`, so it is reachable only from this computer. It uses local HTTP and restarts with Docker unless explicitly stopped. This is a development instance; external forms cannot deliver webhooks to it from the internet.

The bundled JavaScript task runner is sufficient for the demo. n8n currently logs a warning that its optional Python runner is unavailable and that internal runner mode is deprecated. LeadOps uses JavaScript, so neither warning prevents this local test. Review external runners before deploying an always-on production instance.

## What is saved where

| Location | Contents | Git |
| --- | --- | --- |
| `compose.yaml`, `scripts/`, `docs/` | Rebuild instructions | Commit and push |
| `n8n/` | Reviewed workflow exports using fictional examples | Commit and push |
| `.local/n8n/` | SQLite database, instance owner, encrypted credentials, encryption key and execution data | Ignored; private backup required |

n8n generates the encryption key on first launch and saves it in `.local/n8n/config`. Keep that file with the database. Recreating a container preserves the bind-mounted data; deleting `.local/n8n` loses it. Successful and failed execution data is retained for up to seven days, subject to a 1,000-execution limit.

Pushing the repository lets you reconstruct the automation, but does not back up the private instance. A backup on the same disk also does not protect against disk failure. Keep a private copy of the complete instance backup on another disk or a secure remote location.

Use `scripts/backup-n8n.ps1` for that private snapshot. See the [backup and commit procedure](06-backup-and-commits.md) for what it includes and how to restore it.

## Verification

```powershell
docker compose ps
Invoke-RestMethod http://localhost:5678/healthz/readiness
```

On 2026-10-05, the pinned container started successfully on Docker Desktop 29.5.2, reported version 2.41.7, and returned `status: ok` from its readiness endpoint. The container exposes only `127.0.0.1:5678`; the generated database and config are Git-ignored.

Do not change the image tag without first taking a full instance backup and checking the release notes. Do not use Docker cleanup commands against other Aramis containers or volumes.

Sources: [n8n Docker guide](https://docs.n8n.io/deploy/host-n8n/install-options/install-with-docker.md), [Compose guide](https://docs.n8n.io/deploy/host-n8n/install-options/install-using-docker-compose.md), [backup and restore](https://docs.n8n.io/deploy/host-n8n/keep-n8n-running/backup-and-restore.md), [2.41.7 release](https://github.com/n8n-io/n8n/releases/tag/n8n%402.41.7).
