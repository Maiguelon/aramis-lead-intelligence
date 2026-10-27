# Recovery checkpoints

## After each implementation block

1. Verify the block: run the relevant tests or execute the workflow with fictional records.
2. Save the reviewed workflow export in `n8n/` when its behavior changes. Remove credential references and check that examples are fictional; exported HTTP headers, parameters and pinned data can contain secrets even though n8n credentials are stored separately.
3. Commit the source, reviewed export and documentation together. Inspect `git status` and the staged diff before committing.
4. Push to the existing remote when Miguel chooses. The implementation agent makes local commits; it does not push automatically.

The JSON in `n8n/leadops-demo.json` can be rebuilt with `npm run build:n8n-demo` and imported into a fresh instance. It has no provider credentials or external writes. Do not replace this reviewed export with an unchecked export containing real submissions.

## Back up the private local instance

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backup-n8n.ps1
```

The script briefly stops **only this project's n8n**, copies the entire `.local/n8n` folder, saves the current Compose definition and records file hashes. It restarts n8n if it was running. If n8n was already stopped, it leaves it stopped.

The output is `.local/backups/<UTC timestamp>/`. It includes the database, instance owner and password hash, credential encryption key, encrypted credentials and any retained execution data. When present, `.env`, the mail pilot operations config and the integrated LeadOps config are copied opaquely into `private-config/`. The backup is deliberately excluded from Git. Treat it as sensitive: someone with both the database and key can recover provider credentials.

On 2026-10-05, a full backup of the rebuilt fictional-demo instance was created and all ten file hashes were verified. It contained both `database.sqlite` and `config`. The script restarted the service successfully; the readiness endpoint returned `ok` and the imported demo remained listed after restart. A restore onto a different machine has not yet been tested.

On 2026-10-27, a new full private backup was taken after the successful authenticated CRM pilot and its no-write repeat check. All 45 file hashes matched the manifest. It includes the database, encryption configuration, updated encrypted Bearer credential, workflow snapshots and verification receipts. Both manual write pilots were inactive and in preview before backup; the service restarted healthy. Credential values were not exported or printed. This remains a backup on the same physical disk, not an off-device copy or a tested restore.

Copy that whole timestamped folder to a secure location on another physical disk or machine. Until you do, the script protects against accidental local changes but **not another disk failure**. No remote backup destination has been configured by this project.

## Restore after a disk failure

1. Clone the repository and start Docker Desktop. Use the Compose image version saved in the backup for the first restore.
2. Before launching n8n, place the backed-up `n8n` folder at `.local/n8n`. Restore both `database.sqlite` and `config`, plus the rest of that folder. If an instance already exists there, stop it and preserve its folder separately before replacing anything.
3. Restore optional `private-config/` files to their original locations (`.env` at the repository root; the two JSON operations files under `.local/`), preserving any existing local copies first. Compare restored files with `manifest.json`, then start the service using `scripts/n8n.ps1 Start`.
4. Sign in, verify workflows and credential connections, and run a fictional test. Only then review an image upgrade.

If the private backup is unavailable, rebuild from Git, create a new local owner, import the reviewed workflow JSON files, and reconnect provider credentials. Git does not restore old credentials, execution history or the instance owner.

The full-user-folder approach follows [n8n's backup and restore documentation](https://docs.n8n.io/deploy/host-n8n/keep-n8n-running/backup-and-restore.md). n8n workflow exports alone are insufficient for full instance recovery.
