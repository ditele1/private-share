# Changelog

## 0.3.8

- Switched large attachment chunks from binary HTTP bodies to small Base64 JSON chunks
- Reduced chunk size to 512 KB for better stability through Obsidian and Cloudflare Tunnel
- Kept resumable upload status checks, timeout handling, and automatic retries
- Avoids repeated HTTP/2 binary transport failures observed during large PDF sharing
## 0.3.7

- Reduced attachment chunks from 4 MB to 1 MB
- Added per-chunk timeout and automatic retries
- Added upload-status checks for resumable uploads
- Repeated chunks are idempotent and overwrite at the same offset
- Large PDF uploads no longer stay stuck indefinitely at one percentage
## 0.3.6

- Changed large attachment uploads to 4 MB chunks
- Added upload progress percentages for PDF and other attachments
- Server writes chunks to temporary .part files and finalizes atomically
- Avoids large single HTTP/2 uploads that could stall behind Cloudflare Tunnel
## 0.3.5

- Added short URLs for normal note shares
- New and updated shares now use /p/<short-code>
- Copy Share Link refreshes old share URLs and copies the short form
- Legacy /s/<share-id> URLs remain compatible
## 0.3.4

- Switched attachments to direct binary uploads instead of Base64 JSON
- Raised the per-attachment upload limit to 80 MB
- Fixed large PDF sharing failures such as ERR_HTTP2_PROTOCOL_ERROR
- Kept legacy attachment payload compatibility on the server
## 0.3.3

- Added three-state discussion management in Obsidian
- Discussion records now show Unresolved, Needs changes, or Resolved
- Added Needs changes and Resolved quick actions
- Renamed Reopen to Modify again
## 0.3.2

- Fixed mobile discussion records not loading when local share metadata was stale
- Mobile now resolves the authoritative share by note path before loading customer links or discussion
- Improved cross-device reliability for customer discussion management
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