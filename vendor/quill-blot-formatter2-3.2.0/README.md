# Quill Blot Formatter 2 · 3.2.0

Source: https://github.com/enzedonline/quill-blot-formatter2
Pinned source commit: 2dfb87a21ebe17525f2c3d7fbc31161840a0840f
Package: https://www.npmjs.com/package/@enzedonline/quill-blot-formatter2/v/3.2.0
License: Apache-2.0 (see LICENSE).

The upstream browser UMD bundle and CSS are checked in and included by
scripts/build.js. No CDN or runtime package resolution is required. The bundle
includes its deepmerge dependency (MIT); see DEEPMERGE-LICENSE for its notice.

Our adapter uses only the image resize action, disables alignment, title/link
editing and compression, and supplies the existing viewer. A toolbar cleanup
wrapper handles upstream 3.2.0's unconditional removeChild before the first
selection. Upstream assets are otherwise unchanged. The unavailable source map
comment is removed to avoid a dangling development-only request.
