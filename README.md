# Private Share for Obsidian

Version 0.7.2. Publish notes through a self-hosted share service.

[中文说明](README.zh-CN.md)

## Features

- Publish, update, copy and revoke shares; synchronize share state between devices.
- Set access passwords, expiry dates, discussion and visitor confirmation.
- Import and export encrypted connection profiles.
- Reuse verified historical attachment links when the local file is unchanged.
- Display other local attachments as text placeholders without reading or uploading their bytes.
- Manually inspect and clean historical remote copies with confirmation and reference checks.

## Setup

Install `main.js`, `manifest.json` and `styles.css` in the `private-share` plugin directory. Enable the plugin and configure the share address and connection key supplied by your compatible authenticated share API. This repository contains the plugin, not the server.

## Upgrade from 0.7.1

Local attachment uploads, background backups, manual upload/retry commands and publication-time image uploads have been removed on both desktop and mobile. Local files and note references remain unchanged. Publishing and updating send note text and existing remote links, with an empty attachment payload. New local attachments appear as text rather than embedded files on the shared page.

Existing share identities and historical attachment records are retained. Obsolete upload queues are discarded. Historical remote copies are not deleted automatically. Cleanup requires manual confirmation and checks for local and published references; failed verification retains the records. Deleting a remote copy can invalidate links to it.

Old encrypted profiles remain readable; only the share address and connection key are imported. Keep exported profiles and their passwords private.

## Validation

Run `node --check main.js` and `node --test tests/*.cjs`.
