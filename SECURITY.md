# Security policy

## Supported versions
Only the most recent release is supported. Please update before reporting.

## Reporting a vulnerability
Report privately, not in a public issue:

- GitHub private vulnerability reporting: use **Report a vulnerability** on the
  [Security tab](https://github.com/kamahei/manual-video-zoom/security), or
- email **kk@nekoreset.com**.

Please include the extension version, your Chrome version, the site or page
shape that triggers it, and the smallest reproduction you have. Expect an
acknowledgement within about a week. There is no bug bounty.

## Scope notes
This extension makes no network requests, loads no remote code, has no
dependencies and no build step. It stores one integer per site origin in
`chrome.storage.local`. The most security-relevant surfaces are the message
handler in `content.js`, which validates the sender and the action list, and
the dynamic content-script registration in `background.js`, which reconciles
against `chrome.permissions.getAll()`.
