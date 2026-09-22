# Changelog

## 0.3.1

- Fixed mobile/cross-device customer discussion menu visibility
- Customer invitation and discussion actions now appear for every existing share
- Removed reliance on stale local discussionEnabled state
- Server remains the source of truth for whether discussion is enabled
## 0.3.0

- Added optional customer confirmation and discussion mode
- Added per-customer invitation links with secure random invitation tokens
- Added first-visit name and company identification without account registration
- Added Confirmed / Needs changes / Question status events
- Added comments and threaded replies
- Added invitation management and discussion viewer in the Obsidian plugin
- Added revoke support for individual customer invitation links
- Discussion data is stored separately from note content and survives note updates
- Normal share links remain read-only and do not reveal customer discussions
## 0.2.0

- Added optional password protection for shared pages and attachments
- Added optional expiry: 1 hour, 1 day, 7 days, 30 days, or permanent
- Added "Copy current share link"
- Added local share management UI with copy, update and revoke actions
- Added mobile-friendly commands and ribbon entry
- Added note rename tracking so local share records follow renamed notes
- Preserved existing 0.1.x share compatibility

## 0.1.0

- Initial release
- Single-note sharing
- Attachment upload
- Update and revoke
- Desktop and mobile compatibility