# Private Share for Obsidian

A lightweight Obsidian plugin for sharing a single Markdown note through a self-hosted sharing service.

## Features

- Share the current Markdown note
- Update an existing share while keeping the same public link
- Revoke a share
- Upload referenced Obsidian attachments such as images, PDF, Excel, Word and ZIP files
- Convert ordinary wikilinks to plain text so a shared page does not expose the rest of the vault
- Works on desktop and mobile Obsidian
- Server URL and API token are stored locally in Obsidian plugin data and are not part of this repository

## Installation

This repository is intended for installation through BRAT or manual installation.

Required runtime files:

- main.js
- manifest.json
- styles.css

After installation, open Settings -> Private Share and configure:

- Share server URL
- API token

## Privacy

This repository does not contain any personal server URL, Cloudflare token, API token, vault path, or share history.

Local plugin configuration is stored in .obsidian/plugins/private-share/data.json and data.json is excluded from Git.

## Server

The plugin expects a compatible Private Share server exposing:

- POST /api/publish
- PUT /api/update/:id
- DELETE /api/unpublish/:id

Public pages are served under /s/<random-id>.

## License

MIT
