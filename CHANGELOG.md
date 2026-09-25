# Changelog

## 0.5.5

- Added full cross-device share-state synchronization from the Private Share server
- Obsidian now syncs all shares after layout startup and refreshes the active note share state
- Share Manager now refreshes from the server before rendering
- Server-side shares created on another device are added to the local device automatically
- Stale local mappings are removed when they no longer exist on the server
- Passive state sync no longer rotates edit tokens; management tokens are only claimed when modifying a share
## 0.5.4

- Fixed media-link requests so the AList remote path is actually sent to the Private Share server
- Fixed attachment upload flow so new links can use the configured Cloudflare/R2 edge media domain instead of always falling back to the legacy /media proxy
## 0.5.3

- Added Cloudflare Worker + R2 direct media delivery support
- New attachments can use a custom Cloudflare media domain instead of routing file traffic through the home Private Share server
- Preserved the existing /media proxy as a compatibility fallback for older links
- Added remotePath to media-link generation so the server can map AList paths directly to R2 object keys
- Video/audio/PDF and other large attachments can bypass the home uplink while retaining signed URLs and Range support
## 0.5.2

- Added cross-device management-token synchronization for existing shares
- Update and unshare now claim a fresh management token from the server before modifying a share
- Mobile and desktop can manage shares created on another device without copying local data.json state
- Stale local share mappings are cleared automatically when the server no longer has the share
- Update, copy, customer-link management, discussion, and unshare commands no longer require a pre-existing local share mapping
- Invite/discussion managers refresh management credentials before use
## 0.5.1

- Public AList/R2 attachment URLs are now wrapped by a signed Private Share media proxy
- Notes no longer receive direct R2/S3-facing download URLs for new uploads
- Media proxy hides the R2 account host from browsers and download prompts
- Range requests are forwarded for video and audio seeking
- Excel previews continue to use the self-hosted preview page
- Media proxy is restricted to the configured AList public host
## 0.5.0

- Added inline HTML5 video players for AList/R2 video attachments
- Added inline HTML5 audio players for AList/R2 audio attachments
- Added self-hosted Excel preview integration for .xls and .xlsx files
- Excel previews no longer depend on Microsoft Office Online
- Excel files keep a direct original-file link below the preview
- Share pages recognize media and Excel links and render them inline
## 0.4.6

- Added inline HTML5 video playback for AList/R2 video attachments
- Added inline HTML5 audio playback for AList/R2 audio attachments
- Added embedded Excel preview for .xls and .xlsx files with the original download link kept below
- Existing image, PDF, Word, ZIP and other attachment behavior remains unchanged
## 0.4.5

- Fixed automatic upload failures caused by stale AList file cache
- Signed URL lookup now falls back to a refreshed parent-directory listing
- Rapid consecutive pastes are queued instead of skipped while an upload is already running
## 0.4.4

- Improved automatic attachment upload reliability
- Automatic scans retry when Obsidian metadata is not ready yet
- AList file-sign lookup retries while the R2-backed file is still becoming available
- Increased automatic upload debounce to reduce races after paste or drag-and-drop
## 0.4.3

- Added automatic AList/R2 attachment upload for modified Markdown notes
- Dragged or pasted local attachments are detected after a short debounce
- Local attachment references are automatically replaced with signed public AList URLs
- Automatic mode keeps the manual upload command as a fallback
- Automatic scans stay silent when a note has no local attachments
- Added a settings toggle to enable or disable automatic attachment upload
## 0.4.2

- Tracks AList/R2 attachments uploaded by each Obsidian note
- Note rename now moves the remote-attachment bookkeeping with the note
- Deleting a note can also delete only the remote attachments uploaded and recorded by this plugin
- Added an optional confirmation prompt before remote AList/R2 deletion
- Failed remote deletions stay in local bookkeeping for later recovery instead of being silently forgotten
## 0.4.1

- Fixed AList public attachment links when download signing is enabled
- Plugin now reads the AList file sign after upload and writes a signed /d/ URL into the note
- Avoids broken images caused by unsigned public AList download URLs
## 0.4.0

- Added direct AList attachment uploads from the current Obsidian note
- Uploads use the LAN AList address while note links use the public AList address
- AList stores the files in the configured R2-backed mount
- Local Obsidian embeds and Markdown attachment links can be replaced with public URLs
- Images stay embedded while PDF, Word, Excel, ZIP and other files become normal links
- Optional YYYY/MM remote folders are created automatically
- Unique remote filenames avoid accidental overwrites
- AList Token authentication is supported, with username/password login as a fallback
- AList credentials and private URLs remain local in plugin data.json and are not included in the public repository
- Existing Private Share publishing, customer links and discussions remain unchanged
## 0.3.9

- Added a dedicated LAN upload URL for attachments
- Large attachments upload directly to OpenWrt over the local network when available
- LAN uploads use the original binary file without Base64 or Cloudflare Tunnel
- Public HTTPS sharing remains unchanged
- Automatic fallback keeps the public resumable uploader when LAN upload is unavailable
- Normal and customer share links remain short-link compatible
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