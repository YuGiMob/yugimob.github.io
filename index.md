# YuGiMob

> Extensions for the pi coding agent: anchored edits, keyless web tools, Tor routing, guarded commits, and a benchmark that publishes the traces.

I'm YuGiMob. I build extensions for pi, the terminal coding agent, and publish them on npm. This page is where they live, each with a demo you can run.

The pattern behind all of them is the same. An agent changes a file that looks right and is subtly wrong, or runs a command a human would have paused on. Most fixes are better prompts and good intentions. I would rather move the failure into the tool, where it can be refused, caught, or made impossible.

If you run coding agents against real repositories, you have watched at least one of these failures happen. Each tool below starts with the problem it exists to kill; the benchmark at the end is how I check my own work, including the runs I lose.

## Problems

### 01. The edit lands on the wrong line

Line numbers shift the moment anything above them changes, and fuzzy matching will happily edit a similar block somewhere else. The agent reports success, the diff looks plausible, and the mistake surfaces three edits later.

**Built:** [pi-hashline-edit-pro](https://github.com/YuGiMob/pi-hashline-edit-pro) — Every served line gets its own four-letter anchor. An edit may only name anchors, so inserting or deleting lines never renumbers what you did not touch. If the file changed underneath, the tool refuses with [E_RANGE_STALE] instead of guessing, and the last edit can be undone byte-for-byte, line endings included.

- Anchors survive inserts, deletes, and re-reads
- Stale edits are refused, not guessed
- Undo restores the exact bytes
- Edits to one file land as a single atomic batch

Install: `npm i pi-hashline-edit-pro`. Stars 88, 4,285 npm installs per week.

### 02. Web access costs a key and returns soup

Almost every way to give an agent the web wants an API key, a paid tier, or a browser farm. When it finally fetches something, it hands the model a wall of navigation, cookie banners, and tracking scripts, and calls that reading.

**Built:** [pi-unsloth-webtools](https://github.com/YuGiMob/pi-unsloth-webtools) — One tool for search, one for fetch, one for pages that need JavaScript. Search fans out across seven engines and dedupes and ranks what comes back, with no key. Fetch normalizes the URL, blocks private addresses, and turns HTML or PDF text into Markdown. Render falls back to Jina Reader when the page only exists after JavaScript runs.

- Seven search engines behind one tool
- HTML-to-Markdown and PDF extraction
- SSRF guard and a 512 KiB cap
- Jina Reader fallback for JavaScript pages

Install: `npm i pi-unsloth-webtools`. Stars 2, 801 npm installs per week.

### 03. Agent traffic leaks where it comes from

The moment an agent fetches a URL, your IP and your resolver are part of the request. Setting one proxy variable is not a privacy story, and a shared circuit links every request back to the same exit, which is its own kind of fingerprint.

**Built:** [pi-tor-proxy](https://github.com/YuGiMob/pi-tor-proxy) — The extension downloads its own Tor binary, verifies it against a SHA-256 hash, and routes every request through it. Each pi instance gets its own circuit via IsolateSOCKSAuth, and the exit IP is checked against check.torproject.org so you can see that the route is actually Tor.

- Self-managed, hash-verified Tor binary
- Per-instance circuit via IsolateSOCKSAuth
- Exit IP checked against check.torproject.org
- Nothing to configure in your other tools

Install: `npm i pi-tor-proxy`. Stars 3, 39 npm installs per week.

### 04. Long runs forget the plan

Ask an agent to review a change in three passes and the original plan, the corrections, and the review comments all dissolve into one context window. By the last round it is negotiating with a summary of a summary, and the thing you asked for first is somewhere in the middle.

**Built:** [pi-msg-workflow](https://github.com/YuGiMob/pi-msg-workflow) — Numbered message and command stores keep the plan outside the conversation, where you can edit it. A workflow is a start phase, one or more rounds that reset the context between passes, and a final commit or summary. Each round sees the messages it needs, not the entire history.

- /msg, /cmd, and /workflow
- Numbered, editable message stores
- Rounds reset the context between passes
- Start, loop, and finish as configuration

Install: `npm i pi-msg-workflow`. Stars 1, 110 npm installs per week.

### 05. The agent commits like it owns the repo

An agent with shell access will eventually run git commit -am "fix", or stage a file you never looked at. A rule in a prompt is not a guardrail; it is a wish with good manners.

**Built:** [pi-git-commit](https://github.com/YuGiMob/pi-git-commit) — The bash guard blocks mutative git commands before they run. Commits go through a structured git_commit tool with a type (FIX, IMPROVE, NEW) and a message, and the flow only opens after a human runs /commit. The agent can prepare the commit; it cannot decide to make it.

- Mutative git commands in bash are blocked
- FIX, IMPROVE, and NEW typed commits
- The flow opens only after /commit
- One guard instead of prompt heroics

Install: `npm i pi-git-commit`. Stars 1, 168 npm installs per week.

## Evidence

### Everyone claims their tool is better

Editing-tool READMEs ship with a demo GIF and a claim, and almost none of them publish the runs where they lose. If the only evidence is a highlight reel, it is not evidence; it is marketing with extra steps.

**Built:** [pi-edit-benchmark](https://github.com/YuGiMob/pi-edit-benchmark) — pi-edit-benchmark drives real models through each tool's own tools and scores correctness, safety, and robustness. The headline number is a pass rate; the next two split out staleness and served state, where a silent mis-edit is worse than a refusal. Every contender links to a committed trace, including the runs my own tool fails.

- Stale and served-state scenarios are scored separately
- Every contender links to a committed trace
- Confidence intervals on every pass rate
- The losses are published too

11 contenders over 9 models × 35 scenarios, 315 runs each (3,465 total).
hashline-edit-pro: 97.8% overall, 98.9% staleness, 92.1% served state across 315 runs

- [Run report](https://github.com/YuGiMob/pi-edit-benchmark/blob/main/results/llm-report.json): the committed JSON every figure comes from
- [Committed traces](https://github.com/YuGiMob/pi-edit-benchmark/tree/main/results/traces): one trace per scored run
- [Scenario matrix](https://yugimob.github.io/data/benchmark-matrix.json): pass counts per scenario and contender

## Principles

- Make the wrong operation impossible, not merely discouraged.
- Fail loudly; never guess.
- Show the model exactly what it sees.
- Put a human gate in front of anything destructive.
- Measure before claiming, and publish the traces.
- Keep the site static; let a scheduled job refresh the numbers.

## About

I started building these because I kept watching agents do plausible-looking damage. Not crashes; worse. A rename that missed one call site, a commit nobody reviewed, a fetch that sent my address to a stranger. Each extension closes one of those holes in a way a prompt cannot.

The tools are hand-written TypeScript, published on npm under MIT (the web tools are AGPL). The numbers on this page are pulled from the GitHub and npm APIs every day by a scheduled workflow, so the stars and downloads are measured, not maintained.

No framework, no build step, no runtime dependencies. Plain HTML, CSS, and JavaScript, served straight from GitHub Pages.

## Data

- [Machine data](https://yugimob.github.io/data/site-data.json): stars, downloads, activity, history, and benchmark numbers, refreshed daily
- [Curated showcase](https://yugimob.github.io/data/showcase.json): the narrative behind every tool, one entry per problem
- [Agent index](https://yugimob.github.io/llms.txt): the short index of this site for language models
- [Feed](https://yugimob.github.io/feed.json): a JSON Feed of the daily benchmark and install snapshots
- [Sitemap](https://yugimob.github.io/sitemap.xml): the single canonical page
