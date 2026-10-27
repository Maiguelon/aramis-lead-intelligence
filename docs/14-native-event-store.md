# Native event store

The local MVP uses a project-scoped n8n Data Table named `aramis_leadops_events_v1` for technical checkpoints. HubSpot remains the commercial record. The table stores event hashes, bounded status/source categories, confirmed provider IDs, analysis mode and receipt time. It contains no person's name, email, message or AI output.

Import `n8n/leadops-ledger-setup.json` into the intended personal project and execute it **from the n8n editor**. It creates the table only when absent and checks its 14 column names/types. An existing incompatible schema requires review; the setup never silently migrates or deletes it.

Verified on n8n 2.41.7: the server's manual execution created the table and completed successfully. The native `n8n execute` CLI does not initialize the Data Table module in this installed release; that attempt stopped before creating a table. Use server executions for Data Table workflows.

A Data Table is not a uniqueness lock. The integrated demo must serialize production executions and block manual/CLI effects before treating lookup + upsert as a single local claim. Distributed workers and additional writers require an atomic unique constraint or equivalent queue design. The setup workflow alone provides no duplicate-delivery guarantee.

Before each external write, record an uncertain checkpoint. After a confirmed response, preserve its ID at the next checkpoint. A crash between a provider accepting a request and saving its ID requires human reconciliation. Never claim exactly-once external side effects.
