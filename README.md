# Private Share for Obsidian

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
