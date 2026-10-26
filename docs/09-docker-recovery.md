# Docker runtime recovery — 2026-10-26

## Outcome

Docker Desktop and the existing n8n instance started successfully after quarantining two stale runtime directories. Docker Desktop stayed on 4.76.0 with Engine 29.5.2; no reinstall, upgrade, factory reset, prune or data-disk replacement was required.

Miguel explicitly authorized this Docker repair outside the repository. Other Aramis source projects were not edited. The original workspace-only write rule continues to apply to ordinary LeadOps work.

## Observed failure

The backend aborted while trying to replace `dockerInference` under Docker's local runtime directory. The affected runtime entries were zero-byte Windows reparse points. The error and attributes matched the stale-socket failure class documented in [Docker's issue tracker](https://github.com/docker/desktop-feedback/issues/625). This evidence supports the recovery attempt; it does not establish the underlying Windows defect or guarantee that it cannot recur.

## Recovery performed

1. Stopped Docker Desktop with its CLI, then terminated only the `docker-desktop` WSL distribution. Confirmed no Docker processes or running WSL distributions remained.
2. Created a private checkpoint under `.local/recovery/docker-<UTC timestamp>/`: Docker's `docker_data.vhdx`, its auxiliary `ext4.vhdx`, `settings-store.json`, and the complete `.local/n8n` folder.
3. Verified both VHDX files, settings, the n8n database and its encryption config against their originals using SHA-256. The first auxiliary-disk copy did not match; it was retained separately, the source was checked for stability, and a replacement copy matched. `integrity.json` identifies the verified copies.
4. Checked exact absolute source/destination paths and renamed only these runtime directories, keeping them in place with timestamped sibling names:

   | Original | Preserved sibling |
   | --- | --- |
   | `%LOCALAPPDATA%\Docker\run` | `run.leadops-stale-<timestamp>` |
   | `%LOCALAPPDATA%\docker-secrets-engine` | `docker-secrets-engine.leadops-stale-<timestamp>` |

   Their contents were preserved, not deleted. Docker's data disks, volumes, images and configuration were not renamed or replaced. The private checkpoint contains `runtime-quarantine.json` with the exact paths.
5. Started Docker Desktop through its CLI and started/checked n8n using `scripts/n8n.ps1 Start`.
6. Confirmed the existing demo remained present, then imported the new, inactive `aramis-hubspot-preflight` workflow. No existing workflow was overwritten. This import configures neither a HubSpot credential nor a CRM write.

## Verification

| Check | Result |
| --- | --- |
| Docker Engine API | Responded, Server 29.5.2 |
| Existing Docker inventory | Previously known Aramis containers and all six existing volumes present |
| n8n runtime | 2.41.7, healthy, bound to `127.0.0.1:5678` |
| n8n readiness endpoint | `status: ok` |
| n8n encryption config | SHA-256 unchanged from the pre-repair copy |
| Workflow preservation | Existing fictional demo listed after recovery |
| HubSpot check workflow | Native import succeeded in the recovered 2.41.7 instance; credential and authenticated execution pending |
| Local n8n owner | Setup was still required when checked |

The n8n operating helper now checks the actual Docker Engine with a ten-second bound before calling Compose. Its stopped-engine error path and recovered-engine `Start`/`Status` path were checked. It launches the Windows `docker.exe` explicitly and stops only its own CLI probe if that probe times out.

## Retained private recovery material

The checkpoint is Git-ignored and contains sensitive instance material, including encryption keys and Docker data. Its directory is a local recovery copy, not protection against another physical disk failure. Keep any off-device copy private. The quarantined runtime directories also remain on the machine for inspection; restoring them can reintroduce the startup fault.

No diagnostic bundle was uploaded, no Windows reboot was triggered, and no other project's Compose configuration was changed. The recovery restores this startup; recurrence and a future Docker upgrade remain separate maintenance work. For full VM backup/restore context, see [Docker's backup documentation](https://docs.docker.com/desktop/settings-and-maintenance/backup-and-restore/).
