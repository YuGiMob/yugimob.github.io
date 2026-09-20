# Security policy

This repository is a static site. It serves committed HTML, CSS, JavaScript, JSON, fonts, and images from GitHub Pages, with no server, no build step, and no runtime dependencies.

GitHub Pages serves these files without custom response headers, so header-only protections such as `Content-Security-Policy: frame-ancestors` cannot be delivered. The policies that can be expressed in a `<meta>` tag are, and directives that a meta-tag policy would ignore are not used.

## Reporting a vulnerability

Report privately through GitHub's vulnerability reporting form:

https://github.com/YuGiMob/yugimob.github.io/security/advisories/new

Please include the affected file or URL, the impact, and the steps to reproduce. Do not open a public issue for a suspected vulnerability.

## Scope

In scope:

- The page's Content Security Policy and the inline JSON-LD hash
- The rendering code in `assets/js/` and anything it trusts from `data/`
- The refresh pipeline in `scripts/` and the data it writes
- The GitHub Actions workflows in `.github/workflows/`

Out of scope:

- The content of the linked projects, which have their own repositories
- Findings that require a compromised GitHub account, browser extension, or network path
- Reports produced only by an automated scanner with no reproducible impact

## Supported versions

Only the `main` branch is served. There are no older supported versions.
