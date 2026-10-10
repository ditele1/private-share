# Private Share for Obsidian

Version 0.7.0. Share notes through a self-hosted service while keeping attachments local and backing them up to a VPS.

[中文说明](README.zh-CN.md)

## What it does

- Publish, update, copy and revoke note shares; synchronize share state between devices.
- Manage expiry, access passwords, comments and visitor confirmation.
- Automatically back up referenced desktop images, audio, video and documents directly to the configured VPS over HTTPS.
- Keep Vault files and local references unchanged. Published pages use verified remote attachment links.
- Resume server-confirmed upload chunks after interruption and show progress.
- Preview images, audio, video and Excel through the compatible share/file services.
- Import and export encrypted connection profiles.
- Clean unused remote copies only after an explicit manual confirmation and reference checks.

Mobile does not upload attachments. Synchronize Vault files to a desktop for backup. A mobile share can copy an unbacked image to the share service; other unbacked attachments remain pending until desktop backup.

## Setup

Install main.js, manifest.json and styles.css in the private-share plugin directory and enable it. Configure only:

1. Share address, for example https://share.example.com.
2. Connection key supplied by your share service.

There are no AList, LAN fallback, storage backend, upload directory or automatic deletion settings. Desktop backups run on startup, synchronization and periodic checks. Use “Check attachment backups and retry” to retry manually.

Passwords, expiry and discussion controls belong to the share dialog. Use share management to change expiry or revoke a published note.

## Requirements

A compatible authenticated share API and signed VPS upload/file service are required. This repository contains the Obsidian plugin, not a standalone storage server. Current uploads use 8 MiB chunks and support files up to 2 GiB; server disk-space limits also apply.

## Upgrade and cleanup

Existing share identities, attachment ownership and pending jobs are migrated locally. Obsolete connection fields are discarded. Old encrypted profiles remain readable; only the share address and connection key are imported.

Manual cleanup checks local references, references in other notes and published shares. Verification failures retain records for retry. Historical VPS objects require registered mappings and server-side ownership authorization. A VPS copy is not an immutable historical archive.

Encrypted profiles contain authentication information: keep both the file and password private. Runtime share management tokens and attachment records are not exported.
