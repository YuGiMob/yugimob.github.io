# YuGiMob

> Extensions for the pi coding agent: anchored edits, keyless web tools, Tor routing, review workflows, and a human gate in front of every commit.

Data refreshed 2026-10-13.

I build extensions for pi, the terminal coding agent. Each one takes a class of mistake that instructions alone cannot reliably prevent and moves it into the tool, where it is impossible, refused, or visible.

Five tools, five rules: edit by identity, fetch without a key, hide the origin, keep the plan outside the conversation, and put a human in front of the commit.

The source is on GitHub, the page is hand-written and static, and the numbers refresh daily from the GitHub and npm APIs.

## Tools

### 01. The edit lands on the wrong line

**Rule:** Edit by identity

Line numbers shift the moment anything above them changes, and fuzzy matching can silently pick a similar block somewhere else. The agent reports success, the diff looks plausible, and the mistake surfaces three edits later.

**Built:** [pi-hashline-edit-pro](https://github.com/YuGiMob/pi-hashline-edit-pro) — Every line a tool serves gets its own four-letter anchor. An edit names anchors, never positions or guessed text, so untouched lines keep their addresses through inserts and deletes. A line that changed on disk is refused with [E_RANGE_STALE] and the current range is re-served, and the last change is undoable per file, restarts included.

- Edit by anchor, never by line number
- Stale edits are refused, not guessed
- copy and move work across files
- Same-message edits batch into one undoable change

Install: `pi install npm:pi-hashline-edit-pro`. Stars 109, 4,506 npm installs per week.

### 02. Web access costs a key and returns soup

**Rule:** Fetch without a key

Almost every way to give an agent the web wants an API key, a paid tier, or a browser farm. What comes back is a wall of navigation, cookie banners, and tracking scripts, handed to the model as reading.

**Built:** [pi-unsloth-webtools](https://github.com/YuGiMob/pi-unsloth-webtools) — Two keyless tools: web_search sweeps DuckDuckGo and Startpage by default and fuses their rankings; web_fetch normalizes a URL, extracts HTML or PDF text to Markdown with page metadata, and retries a refusal through a browser-fingerprint transport. Pages that only exist after JavaScript runs are rendered locally with Lightpanda; nothing is sent to a third-party renderer.

- DuckDuckGo and Startpage by default, Yandex opt-in
- HTML-to-Markdown, PDF text, and page metadata
- Browser-fingerprint transport for refused pages
- Local rendering; no third-party service

Install: `pi install npm:pi-unsloth-webtools`. Stars 2, 343 npm installs per week.

### 03. Agent traffic leaks where it comes from

**Rule:** Hide the origin

The moment an agent fetches a URL, your IP and resolver travel with the request. One proxy variable is not a privacy story, and a shared circuit links every request back to the same exit.

**Built:** [pi-tor-proxy](https://github.com/YuGiMob/pi-tor-proxy) — The extension manages its own Tor binary and routes every request through it. Each pi instance authenticates with its own SOCKS username, so its circuit and exit IP are its own; the exit is verified against check.torproject.org. /tor-cycle swaps the exit, /tor-country and /tor-exclude constrain where traffic goes, and loopback stays out of the proxy so local tooling keeps working.

- Self-managed, hash-verified Tor binary
- Per-instance circuit via IsolateSOCKSAuth
- Exit IP verified against check.torproject.org
- /tor-cycle, /tor-country, /tor-exclude

Install: `pi install npm:pi-tor-proxy`. Stars 3, 15 npm installs per week.

### 04. Long runs forget the plan

**Rule:** Keep the plan outside the conversation

Ask for a review in three passes and the original plan, the corrections, and the comments all dissolve into one context window. By the last round the agent is negotiating with a summary of a summary.

**Built:** [pi-msg-workflow](https://github.com/YuGiMob/pi-msg-workflow) — Numbered message and command stores live in editable files, so the plan does not depend on the context window. A workflow is a start phase, review rounds that reset the context between passes, and a final commit or summary; rounds can retry, skip when nothing changed, and stop early once a review converges.

- Numbered, editable message and command stores
- Rounds reset the context between passes
- /workflow-edit edits the plan in place
- Six workflows ship by default

Install: `pi install npm:pi-msg-workflow`. Stars 1, 9 npm installs per week.

### 05. The agent commits like it owns the repo

**Rule:** Gate the commit

An agent with shell access will eventually run git commit -am "fix", or stage a file you never looked at. A rule in a prompt is not a guardrail.

**Built:** [pi-git-commit](https://github.com/YuGiMob/pi-git-commit) — The bash guard blocks mutative git commands before they run. Commits go through git_commit with a type and a message, and only after a human runs /commit; /amend folds the current changes into the last commit and rewrites its message through git_amend, and /stop-commit closes either flow. The tools stay listed all session, so the gate never invalidates the provider's prompt cache.

- Mutative git commands in bash are blocked
- FIX, IMPROVE, and NEW typed commits
- The flow opens only after /commit or /amend
- The tool set never changes mid-session

Install: `pi install npm:pi-git-commit`. Stars 2, 539 npm installs per week.

## Principles

- Make the wrong operation impossible, not merely discouraged.
- Refuse instead of guessing.
- Show the model exactly what it sees.
- Put a human gate in front of anything destructive.
- Measure before claiming.
- Keep the site static; let a scheduled job refresh the numbers.

## About

Each tool starts from the same question: what failure should be impossible, not merely discouraged? Anchors make a wrong-line edit impossible; the commit gate makes an unreviewed commit impossible; the proxy makes a direct request the exception, not the default.

The tools are hand-written TypeScript, published on npm under MIT (the web tools are AGPL). The numbers on this page are pulled from the GitHub and npm APIs every day by a scheduled workflow, so they are measured, not maintained.

No framework, no build step, no runtime dependencies. Plain HTML, CSS, and JavaScript, served from GitHub Pages.

## Data

- [Machine data](https://yugimob.github.io/data/site-data.json): stars, downloads, activity, and history, refreshed daily
- [Curated showcase](https://yugimob.github.io/data/showcase.json): the rules behind every tool, one entry per extension
- [Agent index](https://yugimob.github.io/llms.txt): the short index of this site for language models
- [Feed](https://yugimob.github.io/feed.json): a JSON Feed of the daily install and star snapshots
- [Sitemap](https://yugimob.github.io/sitemap.xml): the single canonical page
