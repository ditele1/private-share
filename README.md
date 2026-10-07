# Private Share for Obsidian

> Version 0.6.2: Only desktop uploads attachments, through a configured LAN AList endpoint backed by R2. Mobile keeps files local for Vault synchronization. Desktop checks referenced local files at startup, after synchronization and every five minutes, waiting while the home endpoint is unavailable. Successful automatic uploads update stable short links and existing shares. Earlier cutover exclusions no longer apply. Existing public links remain compatible.


[中文说明](README.zh-CN.md)

A lightweight Obsidian plugin for sharing a single Markdown note through a self-hosted sharing service.

## Repository description

Share a single Obsidian note through a private random link, with update, revoke, attachment upload, desktop and mobile support.

## Features

- Share the current Markdown note
- Update an existing share while keeping the same public link
- Revoke a share
- Upload referenced Obsidian attachments such as images, PDF, Excel, Word and ZIP files
- Convert ordinary wikilinks to plain text so a shared page does not expose the rest of the vault
- Works on desktop and mobile Obsidian
- Optional customer confirmation and discussion
- Customer invitation links with separate random tokens
- Visitors can identify themselves without creating an account
- Confirmation states: Confirmed, Needs changes, Question
- Comments and threaded replies are stored on the server separately from note content
- Updating a note from Obsidian preserves customer discussion
- Normal share links remain read-only and do not expose customer discussion
- Server URL and API token are stored locally in Obsidian plugin data and are not part of this repository

## Typical workflow

1. Open a note in Obsidian
2. Run `Share current note`
3. The plugin uploads the note and referenced attachments
4. The server returns a long random URL
5. The URL is copied to the clipboard
6. Share only that page with the recipient

Existing shares can be updated while keeping the same URL, or revoked at any time.

## Installation

This repository is intended for installation through BRAT or manual installation.

Required runtime files:

- `main.js`
- `manifest.json`
- `styles.css`

After installation, open:

`Settings -> Private Share`

and configure:

- Share server URL
- API token

## Privacy

This repository does not contain any personal server URL, Cloudflare token, API token, vault path, or share history.

Local plugin configuration is stored in:

`.obsidian/plugins/private-share/data.json`

and `data.json` is excluded from Git.

Public pages are designed to expose only the explicitly shared note. Ordinary Obsidian wikilinks are converted to plain text instead of automatically exposing other notes.

## Server

The plugin expects a compatible Private Share server exposing:

- `POST /api/publish`
- `PUT /api/update/:id`
- `DELETE /api/unpublish/:id`

Public pages are served under:

`/s/<random-id>`

## License

MIT

## Media delivery and compatibility

Version 0.5.8 requires Private Share server 0.8.1 and media Worker 1.0.0 for stable media links and reference-aware cleanup. Configure the media edge URL explicitly on the server and store the signing key as a Worker secret. New uploads require a verified `/m/<16-character-code>` URL; registration failures retain the local link and an upload retry record. Existing signed `/f/` URLs remain supported.

Share state refreshes on startup, focus/resume, and every 30 seconds while visible. Passive refresh does not claim a management token. Both devices must use the same server and matching vault-relative note paths.

Remote cleanup checks current vault references and published content, and preserves files when verification fails or another ownership record remains. Copied links are checked even without local upload bookkeeping. Offline device edits cannot be observed until synchronized; a server-side ownership ledger is the next step for stronger multi-device guarantees. Use the retry cleanup command for pending deletions.

Run regression checks with `node --check main.js` and `node --test tests/plugin.test.cjs`.

## Configuration transfer and share management (0.5.9)

Open **Settings → Private Share → Configuration import/export**. Export a password-encrypted file (at least 8 characters), save it in the vault or copy the encrypted text, and import it on the new device. Preview the destination addresses before applying. Local attachment records, pending uploads and management tokens are preserved. Use **Restore previous configuration** with the import password to undo an import. Importing a different backend over existing ownership records is rejected.

The share manager provides **Change expiry** (permanent, relative duration or a local date/time) and confirmed **Delete share** on every row, including remote-only notes and shares with discussion disabled. Expiry changes preserve the published note, attachments, password and discussion; deletion revokes all historical shares for the selected note path and their customer discussions. It leaves the vault note and AList-uploaded originals intact.

Server **0.8.3+** is required for expiry changes and Excel preview. Spreadsheet links in shared pages open a self-hosted preview with worksheet selection and an original-download link. XLSX, XLS (Excel 97+), and XLSM cell values and saved formula results are supported; macros are never executed. Charts, images and complex formatting require the original file. Preview is bounded to 8 MiB input, 500 rows, 64 columns and 16,000 cells, with time and concurrency limits.

Configuration export uses Web Crypto AES-256-GCM and PBKDF2-SHA256. The password is not stored. Unsupported runtime cryptography or damaged files fail without applying configuration.

New-device exports omit LAN addresses by default. With no AList LAN URL, login, uploads and cleanup use the public URL. Explicitly configured AList tokens are encrypted and preserved during transfer.
