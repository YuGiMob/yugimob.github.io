import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = JSON.parse(readFileSync(join(ROOT, 'data', 'site-data.json'), 'utf8'));
const SHOWCASE = JSON.parse(readFileSync(join(ROOT, 'data', 'showcase.json'), 'utf8'));

function runValidator(data, showcase) {
  const dir = mkdtempSync(join(tmpdir(), 'yugimob-validate-'));
  try {
    const dataPath = join(dir, 'site-data.json');
    const showcasePath = join(dir, 'showcase.json');
    writeFileSync(dataPath, JSON.stringify(data, null, 2));
    writeFileSync(showcasePath, JSON.stringify(showcase, null, 2));
    return spawnSync(process.execPath, [join(ROOT, 'scripts', 'validate-data.mjs'), dataPath, showcasePath], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runSiteValidator(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'yugimob-site-'));
  try {
    const copy = join(dir, 'repo');
    cpSync(ROOT, copy, {
      recursive: true,
      filter: (source) => !['.git', '.omo'].includes(basename(source)),
    });
    if (mutate) mutate(copy);
    return spawnSync(process.execPath, [join(ROOT, 'scripts', 'validate-site.mjs'), copy], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the committed data files pass the validator', () => {
  const output = execFileSync(process.execPath, [join(ROOT, 'scripts', 'validate-data.mjs')], { encoding: 'utf8' });
  assert.equal(output.trim(), 'validate: ok');
});

test('the committed site structure passes the validator', () => {
  const output = execFileSync(process.execPath, [join(ROOT, 'scripts', 'validate-site.mjs')], { encoding: 'utf8' });
  assert.equal(output.trim(), 'validate:site: ok');
});

test('the site validator checks every id the scripts address with setText', () => {
  const healthy = runSiteValidator(null);
  assert.equal(healthy.status, 0, healthy.stderr);
  const broken = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace('id="display-name"', 'id="data-name"'));
  });
  assert.equal(broken.status, 1);
  assert.match(broken.stderr, /missing #display-name referenced by scripts/);
});

test('the validator refuses an unknown demo id', () => {
  const showcase = structuredClone(SHOWCASE);
  showcase.problems[0].demo = 'not-a-demo';
  const result = runValidator(DATA, showcase);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /demo unknown: not-a-demo/);
});

test('the validator refuses a showcase name missing from the manifest', () => {
  const showcase = structuredClone(SHOWCASE);
  showcase.problems[0].name = 'ghost-tool';
  const result = runValidator(DATA, showcase);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /showcase problem missing from site-data: ghost-tool/);
});

test('the validator reports every failure in one run', () => {
  const data = structuredClone(DATA);
  const showcase = structuredClone(SHOWCASE);
  showcase.problems[0].demo = 'not-a-demo';
  data.benchmark.contenderCount = 9;
  const result = runValidator(data, showcase);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /demo unknown: not-a-demo/);
  assert.match(result.stderr, /contenderCount does not match contenders/);
});

test('the validator refuses unsorted history dates', () => {
  const data = structuredClone(DATA);
  data.history[1].date = data.history[0].date;
  const result = runValidator(data, SHOWCASE);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /history dates must be unique and sorted/);
});

test('the validator refuses non-object documents instead of accepting them', () => {
  const nullData = runValidator(null, SHOWCASE);
  assert.equal(nullData.status, 1);
  assert.match(nullData.stderr, /site-data invalid/);
  const primitiveData = runValidator(5, SHOWCASE);
  assert.equal(primitiveData.status, 1);
  assert.match(primitiveData.stderr, /site-data invalid/);
  const nullShowcase = runValidator(DATA, null);
  assert.equal(nullShowcase.status, 1);
  assert.match(nullShowcase.stderr, /showcase invalid/);
});

test('a broken manifest does not cascade invented showcase failures', () => {
  const data = structuredClone(DATA);
  delete data.projects;
  const result = runValidator(data, SHOWCASE);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing projects/);
  assert.doesNotMatch(result.stderr, /showcase problem missing from site-data/);
});

test('cross-references use declared names when a project entry is invalid', () => {
  const data = structuredClone(DATA);
  data.projects[0].url = 'not a uri';
  const result = runValidator(data, SHOWCASE);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /url invalid/);
  assert.doesNotMatch(result.stderr, /showcase problem missing from site-data: pi-hashline-edit-pro/);
});

test('the schema drives required keys, types, and unknown keys', () => {
  const missing = structuredClone(DATA);
  delete missing.stats.npmPackages;
  const missingResult = runValidator(missing, SHOWCASE);
  assert.equal(missingResult.status, 1);
  assert.match(missingResult.stderr, /stats missing npmPackages/);

  const wrongType = structuredClone(DATA);
  wrongType.projects[0].stars = '12';
  const wrongTypeResult = runValidator(wrongType, SHOWCASE);
  assert.equal(wrongTypeResult.status, 1);
  assert.match(wrongTypeResult.stderr, /projects\.0\.stars invalid/);

  const extraKey = structuredClone(DATA);
  extraKey.identity.color = 'red';
  const extraKeyResult = runValidator(extraKey, SHOWCASE);
  assert.equal(extraKeyResult.status, 1);
  assert.match(extraKeyResult.stderr, /identity unexpected key color/);
});

test('the validator refuses a benchmark block that contradicts itself', () => {
  const mismatched = structuredClone(DATA);
  mismatched.benchmark.focusCounts.staleness += 1;
  assert.match(runValidator(mismatched, SHOWCASE).stderr, /focusCounts do not sum to scenarios/);

  const badOutcomes = structuredClone(DATA);
  badOutcomes.benchmark.contenders[0].outcomes.applied += 1;
  assert.match(runValidator(badOutcomes, SHOWCASE).stderr, /outcomes do not sum to runs/);

  const badRate = structuredClone(DATA);
  badRate.benchmark.contenders[0].overall = 12;
  assert.match(runValidator(badRate, SHOWCASE).stderr, /overall does not match passed\/runs/);

  const noHighlight = structuredClone(DATA);
  for (const contender of noHighlight.benchmark.contenders) contender.highlight = false;
  assert.match(runValidator(noHighlight, SHOWCASE).stderr, /benchmark has no highlighted contender/);
});

test('the validator refuses a duplicated project and a malformed fetchedAt', () => {
  const duplicate = structuredClone(DATA);
  duplicate.projects.push(structuredClone(duplicate.projects[0]));
  const duplicateResult = runValidator(duplicate, SHOWCASE);
  assert.equal(duplicateResult.status, 1);
  assert.match(duplicateResult.stderr, /project duplicated: pi-hashline-edit-pro/);

  const fetchedAt = structuredClone(DATA);
  fetchedAt.activity.fetchedAt = '2026-9-20';
  const fetchedAtResult = runValidator(fetchedAt, SHOWCASE);
  assert.equal(fetchedAtResult.status, 1);
  assert.match(fetchedAtResult.stderr, /activity\.fetchedAt invalid/);
});

test('the schema walker refuses types, enums, patterns, and nested unknown keys', () => {
  const emptyAvatar = structuredClone(DATA);
  emptyAvatar.identity.avatarUrl = '';
  assert.match(runValidator(emptyAvatar, SHOWCASE).stderr, /identity\.avatarUrl invalid/);

  const emptyName = structuredClone(DATA);
  emptyName.identity.displayName = '';
  assert.match(runValidator(emptyName, SHOWCASE).stderr, /identity\.displayName invalid/);

  const wrongLinksType = structuredClone(DATA);
  wrongLinksType.identity.links = [];
  assert.match(runValidator(wrongLinksType, SHOWCASE).stderr, /identity\.links invalid/);

  const emptyProjects = structuredClone(DATA);
  emptyProjects.projects = [];
  assert.match(runValidator(emptyProjects, SHOWCASE).stderr, /projects invalid/);

  const badDaily = structuredClone(DATA);
  badDaily.activity.daily[0].date = '2026-9-1';
  assert.match(runValidator(badDaily, SHOWCASE).stderr, /activity\.daily\.0\.date invalid/);

  const zeroOutcome = structuredClone(DATA);
  zeroOutcome.benchmark.contenders[0].outcomes.applied = 0;
  assert.match(runValidator(zeroOutcome, SHOWCASE).stderr, /contenders\.0\.outcomes\.applied invalid/);

  const badSize = structuredClone(SHOWCASE);
  badSize.problems[0].size = 'wide';
  assert.match(runValidator(DATA, badSize).stderr, /problems\.0\.size invalid/);

  const badHighlight = structuredClone(SHOWCASE);
  badHighlight.evidence.highlight = true;
  assert.match(runValidator(DATA, badHighlight).stderr, /unexpected key highlight/);
});

test('the validator reports unreadable and unparsable input files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yugimob-broken-'));
  try {
    const dataPath = join(dir, 'site-data.json');
    const showcasePath = join(dir, 'showcase.json');
    writeFileSync(dataPath, '{ not json');
    writeFileSync(showcasePath, '{ not json');
    const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'validate-data.mjs'), dataPath, showcasePath], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /site-data\.json unparsable/);
    assert.match(result.stderr, /showcase\.json unparsable/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the validator refuses benchmark totals that contradict each other', () => {
  const badRate = structuredClone(DATA);
  badRate.benchmark.runsPerContender += 1;
  assert.match(runValidator(badRate, SHOWCASE).stderr, /runsPerContender does not match models × scenarios/);

  const badTotal = structuredClone(DATA);
  badTotal.benchmark.totalRuns += 1;
  assert.match(runValidator(badTotal, SHOWCASE).stderr, /totalRuns does not match contenderCount × runsPerContender/);

  const passedExceeds = structuredClone(DATA);
  passedExceeds.benchmark.contenders[0].passed = passedExceeds.benchmark.contenders[0].runs + 1;
  assert.match(runValidator(passedExceeds, SHOWCASE).stderr, /passed exceeds runs/);

  const badInterval = structuredClone(DATA);
  badInterval.benchmark.contenders[0].low = 99;
  badInterval.benchmark.contenders[0].high = 99;
  assert.match(runValidator(badInterval, SHOWCASE).stderr, /interval does not bracket the pass rate/);

  const badFocus = structuredClone(DATA);
  badFocus.benchmark.focusCounts = 5;
  assert.match(runValidator(badFocus, SHOWCASE).stderr, /benchmark focusCounts invalid/);
});

test('the validator refuses history, daily, and highlight counts beyond the caps', () => {
  const day = 86400000;
  const start = Date.parse('2026-01-01');
  const dateAt = (index) => new Date(start + index * day).toISOString().slice(0, 10);
  const longHistory = structuredClone(DATA);
  longHistory.history = Array.from({ length: 121 }, (unused, index) => ({ date: dateAt(index), totalStars: 1, totalDownloads: 1 }));
  assert.match(runValidator(longHistory, SHOWCASE).stderr, /history has 121 entries; the cap is 120/);

  const longDaily = structuredClone(DATA);
  longDaily.activity.daily = Array.from({ length: 121 }, (unused, index) => ({ date: dateAt(index), events: 1, pushes: 1 }));
  assert.match(runValidator(longDaily, SHOWCASE).stderr, /activity\.daily has 121 entries; the cap is 120/);

  const manyHighlights = structuredClone(DATA);
  manyHighlights.activity.highlights = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.match(runValidator(manyHighlights, SHOWCASE).stderr, /activity\.highlights has 6 entries; the cap is 5/);
});

test('the site validator refuses a stale CSP hash and an un-preloaded module', () => {
  const staleHash = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace(/'sha256-[A-Za-z0-9+/=]+'/, "'sha256-AAAA'"));
  });
  assert.equal(staleHash.status, 1);
  assert.match(staleHash.stderr, /CSP hash for the inline JSON-LD block is stale/);

  const missingPreload = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace('  <link rel="modulepreload" href="assets/js/charts.js">\n', ''));
  });
  assert.equal(missingPreload.status, 1);
  assert.match(missingPreload.stderr, /assets\/js\/charts\.js is not preloaded/);
});

test('the site validator refuses third-party assets, README ghosts, and noscript strays', () => {
  const thirdParty = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace('<link rel="stylesheet" href="assets/css/style.css">', '<link rel="stylesheet" href="https://cdn.example.com/x.css">'));
  });
  assert.equal(thirdParty.status, 1);
  assert.match(thirdParty.stderr, /third-party stylesheet/);

  const readme = runSiteValidator((dir) => {
    const path = join(dir, 'README.md');
    writeFileSync(path, readFileSync(path, 'utf8').replace('assets/js/main.js               boot', 'assets/js/ghost.js              boot'));
  });
  assert.equal(readme.status, 1);
  assert.match(readme.stderr, /listed path assets\/js\/ghost\.js does not exist/);

  const noscript = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace('github.com/YuGiMob/pi-tor-proxy', 'github.com/YuGiMob/pi-ghost'));
  });
  assert.equal(noscript.status, 1);
  assert.match(noscript.stderr, /noscript link pi-ghost is not in site-data\.json/);
});

test('the site validator refuses an image without alt text', () => {
  const noAlt = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace(' alt="YuGiMob" width="72"', ' width="72"'));
  });
  assert.equal(noAlt.status, 1);
  assert.match(noAlt.stderr, /<img> is missing an alt attribute/);
});

test('the site validator refuses a jumped heading order and a broken aria reference', () => {
  const jump = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    const source = readFileSync(path, 'utf8');
    writeFileSync(path, source.replace('<section id="problems"', '<h3>jump</h3><section id="problems"'));
  });
  assert.equal(jump.status, 1);
  assert.match(jump.stderr, /heading level jumps from h1 to h3/);

  const aria = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace('aria-labelledby="problems-heading"', 'aria-labelledby="problems-ghost"'));
  });
  assert.equal(aria.status, 1);
  assert.match(aria.stderr, /aria reference to missing id problems-ghost/);
});

test('the site validator refuses a target=_blank link without rel and a missing lang', () => {
  const blank = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace('target="_blank" rel="noopener noreferrer" aria-label="YuGiMob on GitHub"', 'target="_blank" aria-label="YuGiMob on GitHub"'));
  });
  assert.equal(blank.status, 1);
  assert.match(blank.stderr, /target="_blank" link has no rel=noopener/);

  const lang = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace('<html lang="en">', '<html>'));
  });
  assert.equal(lang.status, 1);
  assert.match(lang.stderr, /<html> is missing a lang attribute/);
});

test('the site validator refuses a title and description outside their length limits', () => {
  const short = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    const source = readFileSync(path, 'utf8');
    writeFileSync(path, source.replace('<title>YuGiMob · Coding-agent extensions that fail loudly</title>', '<title>x</title>').replace(/content="Extensions for the pi coding agent[^"]*"/, 'content="short"'));
  });
  assert.equal(short.status, 1);
  assert.match(short.stderr, /title length 1 is outside 5-70/);
  assert.match(short.stderr, /meta description length 5 is outside 50-200/);
});

test('the site validator refuses a drifted sitemap lastmod and a missing avatar file', () => {
  const sitemap = runSiteValidator((dir) => {
    const path = join(dir, 'sitemap.xml');
    const source = readFileSync(path, 'utf8');
    writeFileSync(path, source.replace(new RegExp('<lastmod>[^<]*</lastmod>'), '<lastmod>2020-01-01</lastmod>'));
  });
  assert.equal(sitemap.status, 1);
  assert.match(sitemap.stderr, /does not match the newest history date/);

  const avatar = runSiteValidator((dir) => {
    const path = join(dir, 'data', 'site-data.json');
    const data = JSON.parse(readFileSync(path, 'utf8'));
    data.identity.avatarUrl = 'assets/ghost.png';
    writeFileSync(path, JSON.stringify(data, null, 2));
  });
  assert.equal(avatar.status, 1);
  assert.match(avatar.stderr, /points at a missing file/);
});

test('the site validator refuses a nav order that does not match the section order', () => {
  const nav = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    const source = readFileSync(path, 'utf8');
    writeFileSync(path, source
      .replace('<a href="#problems" data-nav="problems">The problems</a>', '<a href="#swap" data-nav="swap">swap</a>')
      .replace('<a href="#evidence" data-nav="evidence">The evidence</a>', '<a href="#problems" data-nav="problems">The problems</a>')
      .replace('<a href="#swap" data-nav="swap">swap</a>', '<a href="#evidence" data-nav="evidence">The evidence</a>'));
  });
  assert.equal(nav.status, 1);
  assert.match(nav.stderr, /nav order does not match the section order/);
});
