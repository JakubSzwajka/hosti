# Security policy

## Supported versions

Only the latest release gets security fixes. Upgrade to it before you report a
problem. Releases are listed at
[github.com/JakubSzwajka/hosti/releases](https://github.com/JakubSzwajka/hosti/releases).

## Report a vulnerability

Report it privately. Never open a public issue or pull request for it.

1. Open <https://github.com/JakubSzwajka/hosti/security>.
2. Choose **Report a vulnerability**. This is GitHub's private vulnerability
   reporting. Only the maintainer can read the report.

Please include:

- What the problem is and which part of Hosti it affects.
- The Hosti version, or the image tag, and how you run it.
- Steps to reproduce it, or a small proof of concept.
- What an attacker gains, and what they need first, such as a logged-in owner or
  a push token.
- Any fix you suggest.

Do not include real secrets, owner passwords or live push tokens. If a report
needs a credential to make sense, use a throwaway instance.

## Known and accepted

A bundle's JavaScript runs on the same origin as the catalog. While the owner is
logged in, a script in a bundle can read an admin page, take its mutation token
and make catalog changes, such as approving an agent connection. The maintainer
has accepted this risk. The planned fix is to serve `/v/` from a second origin.
See [The origin risk](./README.md#the-origin-risk) in the README for the full
description. A report that only restates this is already known. A way to make it
worse, or a way around the push token and scope checks, is not.
