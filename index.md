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

Install: `pi install npm:pi-hashline-edit-pro`. Stars 102, 4,528 npm installs per week.

### 02. Web access costs a key and returns soup

Almost every way to give an agent the web wants an API key, a paid tier, or a browser farm. When it finally fetches something, it hands the model a wall of navigation, cookie banners, and tracking scripts, and calls that reading.

**Built:** [pi-unsloth-webtools](https://github.com/YuGiMob/pi-unsloth-webtools) — One tool for search, one for fetch, one for pages that need JavaScript. Search fans out across seven engines and dedupes and ranks what comes back, with no key. Fetch normalizes the URL, blocks private addresses, and turns HTML or PDF text into Markdown. Render falls back to Jina Reader when the page only exists after JavaScript runs.

- Seven search engines behind one tool
- HTML-to-Markdown and PDF extraction
- SSRF guard and a 512 KiB cap
- Jina Reader fallback for JavaScript pages

Install: `pi install npm:pi-unsloth-webtools`. Stars 2, 596 npm installs per week.

### 03. Agent traffic leaks where it comes from

The moment an agent fetches a URL, your IP and your resolver are part of the request. Setting one proxy variable is not a privacy story, and a shared circuit links every request back to the same exit, which is its own kind of fingerprint.

**Built:** [pi-tor-proxy](https://github.com/YuGiMob/pi-tor-proxy) — The extension downloads its own Tor binary, verifies it against a SHA-256 hash, and routes every request through it. Each pi instance gets its own circuit via IsolateSOCKSAuth, and the exit IP is checked against check.torproject.org so you can see that the route is actually Tor.

- Self-managed, hash-verified Tor binary
- Per-instance circuit via IsolateSOCKSAuth
- Exit IP checked against check.torproject.org
- Nothing to configure in your other tools

Install: `pi install npm:pi-tor-proxy`. Stars 3, 74 npm installs per week.

### 04. Long runs forget the plan

Ask an agent to review a change in three passes and the original plan, the corrections, and the review comments all dissolve into one context window. By the last round it is negotiating with a summary of a summary, and the thing you asked for first is somewhere in the middle.

**Built:** [pi-msg-workflow](https://github.com/YuGiMob/pi-msg-workflow) — Numbered message and command stores keep the plan outside the conversation, where you can edit it. A workflow is a start phase, one or more rounds that reset the context between passes, and a final commit or summary. Each round sees the messages it needs, not the entire history.

- /msg, /cmd, and /workflow
- Numbered, editable message stores
- Rounds reset the context between passes
- Start, loop, and finish as configuration

Install: `pi install npm:pi-msg-workflow`. Stars 1, 165 npm installs per week.

### 05. The agent commits like it owns the repo

An agent with shell access will eventually run git commit -am "fix", or stage a file you never looked at. A rule in a prompt is not a guardrail; it is a wish with good manners.

**Built:** [pi-git-commit](https://github.com/YuGiMob/pi-git-commit) — The bash guard blocks mutative git commands before they run. Commits go through a structured git_commit tool with a type (FIX, IMPROVE, NEW) and a message, and the flow only opens after a human runs /commit. The agent can prepare the commit; it cannot decide to make it.

- Mutative git commands in bash are blocked
- FIX, IMPROVE, and NEW typed commits
- The flow opens only after /commit
- One guard instead of prompt heroics

Install: `pi install npm:pi-git-commit`. Stars 1, 132 npm installs per week.

## Evidence

### One benchmark I did not write, one I did

Editing-tool READMEs ship with a demo GIF and a claim, and almost none of them publish the runs where they lose. If the only evidence is a highlight reel, it is not evidence; it is marketing with extra steps.

**Third-party check:** [Explicit Edit Benchmark](https://huggingface.co/spaces/alexshpunt/benchmark-explorer?card=harness%3Api-hashline-edit-pro%40latest) scores pi-hashline-edit-pro at 98.7% median quality over 15 complete model-route configurations, with 98.2% first exact and 100% final exact across 226 byte-exact tasks. Maintained by alexshpunt.

**Built:** [pi-edit-benchmark](https://github.com/YuGiMob/pi-edit-benchmark) — pi-edit-benchmark drives real models through each tool's own tools and scores correctness, safety, and robustness. The headline number is a pass rate; the staleness split is scored separately, where a silent mis-edit is worse than a refusal. Every contender links to a committed trace, including the runs my own tool fails.

I wrote pi-edit-benchmark, so read it as a regression suite with receipts, not neutral evidence.

- Stale scenarios are scored separately
- Every contender links to a committed trace
- Confidence intervals on every pass rate
- The losses are published too

9 contenders over 10 models × 34 scenarios, 340 runs each (3,060 total).

| tool | version | overall | staleness | 95% interval | vs the highlighted tool | runs | passed | API cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **hashline-edit-pro** | v4.4.1 | 99.4% | 100.0% | 97.9–99.8 | — | 340 | 338 | $0.36 |
| builtin-bash | v0.87.0 | 92.9% | 90.9% | 89.7–95.2 | -9.7 to -3.7 points, Holm-adjusted p=< 0.001 | 340 | 316 | $0.33 |
| pix-edit | v0.2.5 | 91.8% | 86.4% | 88.4–94.2 | -11.1 to -4.7 points, Holm-adjusted p=< 0.001 | 340 | 312 | $0.37 |
| built-in edit | v0.87.0 | 90.3% | 80.9% | 86.7–93.0 | -12.8 to -6.0 points, Holm-adjusted p=< 0.001 | 340 | 307 | $0.34 |
| semantic-edit | v0.4.0 | 87.9% | 70.0% | 84.0–91.0 | -15.4 to -8.0 points, Holm-adjusted p=< 0.001 | 340 | 299 | $0.25 |
| aft-pi | v0.57.1 | 87.6% | 91.8% | 83.7–90.7 | -15.7 to -8.4 points, Holm-adjusted p=< 0.001 | 340 | 298 | $0.55 |
| doompi-edit | v0.0.1-alpha.52 | 87.4% | 87.3% | 83.4–90.5 | -16.0 to -8.5 points, Holm-adjusted p=< 0.001 | 340 | 297 | $0.36 |
| hashline-readmap | v0.14.0 | 87.1% | 86.4% | 83.1–90.2 | -16.4 to -8.8 points, Holm-adjusted p=< 0.001 | 340 | 296 | $0.33 |
| edit-guard | v0.1.5 | 86.8% | 73.6% | 82.7–90.0 | -16.7 to -9.2 points, Holm-adjusted p=< 0.001 | 340 | 295 | $0.33 |

Every rate is a pass rate over the shared model × scenario grid, the interval is a 95% Wilson interval, and the comparison column pairs each rival with the highlighted tool: the exact two-sided McNemar test, Holm-adjusted across rivals, with an unadjusted 95% Newcombe score interval for the difference.

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
