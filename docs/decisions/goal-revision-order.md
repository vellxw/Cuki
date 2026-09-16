# Manual goal revisions on the same effective day

## Observed defect

The manual editor appends a new goal ID/version 1 to preserve earlier records. `goalAt`
used only effective date and entity version; two saves on the same day therefore
kept the old target active. Two regression tests failed before this repair.

## Decision

Keep effective date as the primary key for choosing a day's target. Within that date,
order by `updatedAt` from the durable command envelope. Entity version is an optimistic
concurrency counter, not chronology across unrelated IDs. Equal timestamps use version
and ID for deterministic resolution across devices; this tie-break is not a claim that
one simultaneous edit occurred later. Older records without a timestamp remain readable
(timestamp 0); their unknown chronology is not fabricated. No existing record is deleted.

The server derives the payload timestamp from the validated operation's `createdAt`,
not HTTP arrival time or a payload-supplied future timestamp. Current future-envelope
limits remain enabled. Delayed synchronization of an older offline goal must not displace
an already saved newer goal. This metadata is not used to authorize health advice,
garden credits or rewards.

## Verification

New tests cover two same-day saves; prior days and food snapshots; SQLite reload;
caller immutability; legacy/tied records; native component form submission; an actual
listening HTTP API with two SQLite devices and an isolated SQL database; and server
rejection of payload timestamp authority. Native Android/iOS suites additionally edit
the target twice, terminate the app and inspect the persisted native input.

Local regression run: 56 core, 29 integration, 26 mobile component tests passed.
Local dependencies were recovered from verified archives; clean install and native
runs are recorded separately by CI. No native approval is implied by this document.
