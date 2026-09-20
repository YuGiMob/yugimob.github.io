import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, withRepoCopy } from './helpers.mjs';
import { isValidSiteData } from '../assets/js/site-data.js';

const DATA = JSON.parse(readFileSync(join(ROOT, 'data', 'site-data.json'), 'utf8'));
const SHOWCASE = JSON.parse(readFileSync(join(ROOT, 'data', 'showcase.json'), 'utf8'));

function runValidator(data, showcase, matrix = null) {
  const dir = mkdtempSync(join(tmpdir(), 'yugimob-validate-'));
  try {
    const dataPath = join(dir, 'site-data.json');
    const showcasePath = join(dir, 'showcase.json');
    writeFileSync(dataPath, JSON.stringify(data, null, 2));
    writeFileSync(showcasePath, JSON.stringify(showcase, null, 2));
    const args = [join(ROOT, 'scripts', 'validate-data.mjs'), dataPath, showcasePath];
    if (matrix) {
      const matrixPath = join(dir, 'benchmark-matrix.json');
      writeFileSync(matrixPath, JSON.stringify(matrix, null, 2));
      args.push(matrixPath);
    }
    return spawnSync(process.execPath, args, { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runSiteValidator(mutate) {
  return withRepoCopy((copy) => spawnSync(process.execPath, [join(ROOT, 'scripts', 'validate-site.mjs'), copy], { encoding: 'utf8' }), mutate);
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

test('the validator accepts a data file without the optional showEvidence toggle', () => {
  const optional = structuredClone(DATA);
  delete optional.sections.showEvidence;
  const result = runValidator(optional, SHOWCASE);
  assert.equal(result.status, 0, result.stderr);
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

test('the validator re-derives the benchmark cost total from the contenders', () => {
  const drifted = structuredClone(DATA);
  drifted.benchmark.contenders[0].costUsd += 1;
  const result = runValidator(drifted, SHOWCASE);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /costUsd .* does not match the contender total/);
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

test('the validator refuses benchmark history beyond the cap and out of order', () => {
  const day = 86400000;
  const start = Date.parse('2026-01-01');
  const dateAt = (index) => new Date(start + index * day).toISOString().slice(0, 10);
  const snapshot = (index) => ({ date: dateAt(index), overall: 1, safety: null, served: null });
  const longHistory = structuredClone(DATA);
  longHistory.benchmarkHistory = Array.from({ length: 121 }, (unused, index) => snapshot(index));
  assert.match(runValidator(longHistory, SHOWCASE).stderr, /benchmarkHistory has 121 entries; the cap is 120/);
  const unsorted = structuredClone(DATA);
  unsorted.benchmarkHistory = [snapshot(1), snapshot(0)];
  assert.match(runValidator(unsorted, SHOWCASE).stderr, /benchmarkHistory dates must be unique and sorted/);
  const badScore = structuredClone(DATA);
  badScore.benchmarkHistory = [{ date: '2026-01-01', overall: 101, safety: null, served: null }];
  assert.match(runValidator(badScore, SHOWCASE).stderr, /benchmarkHistory\.0\.overall invalid/);
});

test('the validator refuses benchmark history that drifts from the current report', () => {
  const drifted = structuredClone(DATA);
  drifted.benchmarkHistory[drifted.benchmarkHistory.length - 1].overall = 42;
  assert.match(runValidator(drifted, SHOWCASE).stderr, /benchmarkHistory newest entry does not match the highlighted contender/);
  const misdated = structuredClone(DATA);
  misdated.benchmarkHistory[misdated.benchmarkHistory.length - 1].date = '2026-09-19';
  assert.match(runValidator(misdated, SHOWCASE).stderr, /benchmarkHistory newest entry is dated 2026-09-19/);
});

test('the site validator refuses a stale CSP hash and a mis-preloaded module', () => {
  const staleHash = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace(/'sha256-[A-Za-z0-9+/=]+'/, "'sha256-AAAA'"));
  });
  assert.equal(staleHash.status, 1);
  assert.match(staleHash.stderr, /CSP hash for the inline JSON-LD block is stale/);

  const missingPreload = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace('  <link rel="modulepreload" href="assets/js/view-model.js">\n', ''));
  });
  assert.equal(missingPreload.status, 1);
  assert.match(missingPreload.stderr, /assets\/js\/view-model\.js is statically imported but not preloaded/);

  const eagerDynamic = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace(
      '<link rel="modulepreload" href="assets/js/render.js">',
      '<link rel="modulepreload" href="assets/js/render.js">\n  <link rel="modulepreload" href="assets/js/demos.js">',
    ));
  });
  assert.equal(eagerDynamic.status, 1);
  assert.match(eagerDynamic.stderr, /assets\/js\/demos\.js is loaded on demand but preloaded/);
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
    writeFileSync(path, readFileSync(path, 'utf8').replace('target="_blank" rel="me noopener noreferrer" aria-label="YuGiMob on GitHub"', 'target="_blank" aria-label="YuGiMob on GitHub"'));
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

test('the site validator refuses a CSP without Trusted Types and a DOM sink', () => {
  const noTrustedTypes = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace("; require-trusted-types-for 'script'", ''));
  });
  assert.equal(noTrustedTypes.status, 1);
  assert.match(noTrustedTypes.stderr, /CSP is missing require-trusted-types-for 'script'/);

  const noPolicyBan = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace("; trusted-types 'none'", ''));
  });
  assert.equal(noPolicyBan.status, 1);
  assert.match(noPolicyBan.stderr, /CSP is missing trusted-types 'none'/);

  const noFrames = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace("frame-src 'none'; ", ''));
  });
  assert.equal(noFrames.status, 1);
  assert.match(noFrames.stderr, /CSP is missing frame-src 'none'/);

  const sink = runSiteValidator((dir) => {
    const path = join(dir, 'assets', 'js', 'ui.js');
    writeFileSync(path, `${readFileSync(path, 'utf8')}\ndocument.body.innerHTML = 'x';\n`);
  });
  assert.equal(sink.status, 1);
  assert.match(sink.stderr, /uses a DOM sink that Trusted Types forbids/);

  const fragment = runSiteValidator((dir) => {
    const path = join(dir, 'assets', 'js', 'ui.js');
    writeFileSync(path, `${readFileSync(path, 'utf8')}\nrange.createContextualFragment('<b>x</b>');\n`);
  });
  assert.equal(fragment.status, 1);
  assert.match(fragment.stderr, /uses a DOM sink that Trusted Types forbids \(createContextualFragment\)/);

  const handler = runSiteValidator((dir) => {
    const path = join(dir, 'assets', 'js', 'ui.js');
    writeFileSync(path, `${readFileSync(path, 'utf8')}\nnode.setAttribute("onclick", "x");\n`);
  });
  assert.equal(handler.status, 1);
  assert.match(handler.stderr, /uses a DOM sink that Trusted Types forbids \(setAttribute\("onclick"\)/);

  const styleAttribute = runSiteValidator((dir) => {
    const path = join(dir, 'assets', 'js', 'ui.js');
    writeFileSync(path, `${readFileSync(path, 'utf8')}\nnode.setAttribute("style", "color: red");\n`);
  });
  assert.equal(styleAttribute.status, 1);
  assert.match(styleAttribute.stderr, /sets an inline style attribute, which the CSP forbids \(setAttribute\("style"\)/);

  const scriptText = runSiteValidator((dir) => {
    const path = join(dir, 'assets', 'js', 'render.js');
    writeFileSync(path, readFileSync(path, 'utf8').replace(
      'target.replaceChildren(document.createTextNode(JSON.stringify(structuredData(data, showcase, canonical))));',
      'target.textContent = JSON.stringify(structuredData(data, showcase, canonical));',
    ));
  });
  assert.equal(scriptText.status, 1);
  assert.match(scriptText.stderr, /uses a DOM sink that Trusted Types forbids \(target\.textContent\)/);

  const createdScript = runSiteValidator((dir) => {
    const path = join(dir, 'assets', 'js', 'ui.js');
    writeFileSync(path, `${readFileSync(path, 'utf8')}\nconst loader = document.createElement('script');\n`);
  });
  assert.equal(createdScript.status, 1);
  assert.match(createdScript.stderr, /uses a DOM sink that Trusted Types forbids \(createElement\('script'\)\)/);
});

test('the site validator refuses a missing or incomplete llms.txt', () => {
  const missing = runSiteValidator((dir) => {
    rmSync(join(dir, 'llms.txt'));
  });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /llms\.txt unreadable/);

  const stray = runSiteValidator((dir) => {
    const path = join(dir, 'llms.txt');
    writeFileSync(path, readFileSync(path, 'utf8').replaceAll('pi-tor-proxy', 'ghost-tool'));
  });
  assert.equal(stray.status, 1);
  assert.match(stray.stderr, /llms\.txt: missing project pi-tor-proxy/);
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

test('the site validator refuses a robots.txt without content signals', () => {
  const missing = runSiteValidator((dir) => {
    const path = join(dir, 'robots.txt');
    writeFileSync(path, readFileSync(path, 'utf8').replace(/^Content-Signal: .*$/m, ''));
  });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /robots.txt: missing a Content-Signal line/);

  const partial = runSiteValidator((dir) => {
    const path = join(dir, 'robots.txt');
    writeFileSync(path, readFileSync(path, 'utf8').replace('ai-train=yes', 'ai-train'));
  });
  assert.equal(partial.status, 1);
  assert.match(partial.stderr, /the Content-Signal line is missing ai-train=/);
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

function runDataValidatorOnCopy(mutate) {
  return withRepoCopy((copy) => spawnSync(process.execPath, [join(copy, 'scripts', 'validate-data.mjs')], { encoding: 'utf8' }), mutate);
}

test('the data validator refuses schema keywords it cannot enforce', () => {
  const keyword = runDataValidatorOnCopy((dir) => {
    const path = join(dir, 'data', 'site-data.schema.json');
    const schema = JSON.parse(readFileSync(path, 'utf8'));
    schema.properties.identity.properties.displayName.patternProperties = { '^x': { type: 'string' } };
    writeFileSync(path, JSON.stringify(schema, null, 2));
  });
  assert.equal(keyword.status, 1);
  assert.match(keyword.stderr, /identity\.displayName schema uses an unsupported keyword patternProperties/);

  const format = runDataValidatorOnCopy((dir) => {
    const path = join(dir, 'data', 'showcase.schema.json');
    const schema = JSON.parse(readFileSync(path, 'utf8'));
    schema.properties.intro.properties.headline.format = 'slug';
    writeFileSync(path, JSON.stringify(schema, null, 2));
  });
  assert.equal(format.status, 1);
  assert.match(format.stderr, /intro\.headline schema uses an unsupported format slug/);

  const type = runDataValidatorOnCopy((dir) => {
    const path = join(dir, 'data', 'showcase.schema.json');
    const schema = JSON.parse(readFileSync(path, 'utf8'));
    schema.properties.principles.items.type = 'text';
    writeFileSync(path, JSON.stringify(schema, null, 2));
  });
  assert.equal(type.status, 1);
  assert.match(type.stderr, /principles\.items schema uses an unsupported type text/);
});

function rewriteSchema(copy, file, mutate) {
  const path = join(copy, 'data', file);
  const schema = JSON.parse(readFileSync(path, 'utf8'));
  mutate(schema);
  writeFileSync(path, `${JSON.stringify(schema, null, 2)}\n`);
}

test('the data validator enforces const, oneOf, anyOf, not, minProperties, and uniqueItems', () => {
  const constant = runDataValidatorOnCopy((dir) => {
    rewriteSchema(dir, 'site-data.schema.json', (schema) => {
      schema.properties.identity.properties.displayName.const = 'Someone else';
    });
  });
  assert.equal(constant.status, 1);
  assert.match(constant.stderr, /identity\.displayName invalid/);

  const exclusive = runDataValidatorOnCopy((dir) => {
    rewriteSchema(dir, 'site-data.schema.json', (schema) => {
      schema.properties.identity.properties.displayName.oneOf = [{ type: 'string' }, { type: 'string' }];
    });
  });
  assert.equal(exclusive.status, 1);
  assert.match(exclusive.stderr, /identity\.displayName invalid/);

  const permissive = runDataValidatorOnCopy((dir) => {
    rewriteSchema(dir, 'site-data.schema.json', (schema) => {
      schema.properties.identity.properties.displayName.anyOf = [{ type: 'number' }, { type: 'string' }];
    });
  });
  assert.equal(permissive.status, 0, permissive.stderr);

  const negated = runDataValidatorOnCopy((dir) => {
    rewriteSchema(dir, 'site-data.schema.json', (schema) => {
      schema.properties.identity.properties.displayName.not = { type: 'string' };
    });
  });
  assert.equal(negated.status, 1);
  assert.match(negated.stderr, /identity\.displayName invalid/);

  const tooFewKeys = runDataValidatorOnCopy((dir) => {
    rewriteSchema(dir, 'site-data.schema.json', (schema) => {
      schema.properties.stats.minProperties = 5;
    });
  });
  assert.equal(tooFewKeys.status, 1);
  assert.match(tooFewKeys.stderr, /stats invalid/);

  const duplicated = runDataValidatorOnCopy((dir) => {
    rewriteSchema(dir, 'site-data.schema.json', (schema) => {
      schema.properties.activity.properties.highlights.uniqueItems = true;
    });
    const dataPath = join(dir, 'data', 'site-data.json');
    const data = JSON.parse(readFileSync(dataPath, 'utf8'));
    data.activity.highlights[1] = data.activity.highlights[0];
    writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`);
  });
  assert.equal(duplicated.status, 1);
  assert.match(duplicated.stderr, /activity\.highlights\.1 duplicates an earlier item/);
});

test('the data validator resolves $ref definitions and reports a missing one', () => {
  const resolvable = runDataValidatorOnCopy((dir) => {
    rewriteSchema(dir, 'site-data.schema.json', (schema) => {
      schema.definitions = { name: { type: 'string', minLength: 1 } };
      schema.properties.identity.properties.displayName = { $ref: '#/definitions/name' };
    });
  });
  assert.equal(resolvable.status, 0, resolvable.stderr);

  const dangling = runDataValidatorOnCopy((dir) => {
    rewriteSchema(dir, 'site-data.schema.json', (schema) => {
      schema.properties.identity.properties.displayName = { $ref: '#/definitions/missing' };
    });
  });
  assert.equal(dangling.status, 1);
  assert.match(dangling.stderr, /identity\.displayName references the missing schema #\/definitions\/missing/);
});

test('the data validator refuses an interval that is not the Wilson interval', () => {
  const data = structuredClone(DATA);
  data.benchmark.contenders[0].low = 90;
  data.benchmark.contenders[0].high = 100;
  const result = runValidator(data, SHOWCASE);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /interval does not match the Wilson interval for passed\/runs/);
});

test('the site validator refuses static copy that drifts from the data files', () => {
  const title = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace('Coding-agent extensions that fail loudly</title>', 'A stale title</title>'));
  });
  assert.equal(title.status, 1);
  assert.match(title.stderr, /the title should read/);

  const heading = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace('Six things that kept going wrong', 'Five things'));
  });
  assert.equal(heading.status, 1);
  assert.match(heading.stderr, /#problems-heading should read/);

  const inline = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace('<dl class="intro-stats" id="hero-stats">', '<dl class="intro-stats" id="hero-stats" style="color:red">'));
  });
  assert.equal(inline.status, 1);
  assert.match(inline.stderr, /uses an inline style/);
});

test('the site validator refuses a manifest project with no showcase entry', () => {
  const result = runSiteValidator((dir) => {
    const path = join(dir, 'data', 'showcase.json');
    const showcase = JSON.parse(readFileSync(path, 'utf8'));
    showcase.problems = showcase.problems.filter((problem) => problem.name !== 'pi-tor-proxy');
    writeFileSync(path, JSON.stringify(showcase, null, 2));
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no entry for the manifest project pi-tor-proxy/);
});

test('the site validator refuses an expiring security.txt', () => {
  const result = runSiteValidator((dir) => {
    const path = join(dir, '.well-known', 'security.txt');
    writeFileSync(path, readFileSync(path, 'utf8').replace(/^Expires: .*$/m, 'Expires: 2020-01-01T00:00:00.000Z'));
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Expires is less than 60 days away/);
});

test('the site validator refuses a palette pair below the contrast minimum', () => {
  const result = runSiteValidator((dir) => {
    const path = join(dir, 'assets', 'css', 'style.css');
    writeFileSync(path, readFileSync(path, 'utf8').replace('--ink: #1b1814;', '--ink: #b9b3a8;'));
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /light ink on paper is \d+\.\d+:1, below 4\.5:1/);
});

test('the contrast check measures the base palette, not a prefers-contrast override', () => {
  const result = runSiteValidator((dir) => {
    const path = join(dir, 'assets', 'css', 'style.css');
    writeFileSync(path, readFileSync(path, 'utf8').replace('--ink-3: #71695b;', '--ink-3: #b9b3a8;'));
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /light ink-3 on paper is \d+\.\d+:1, below 4\.5:1/);
});

test('the contrast check measures the base dark palette, not the nested prefers-contrast override', () => {
  const result = runSiteValidator((dir) => {
    const path = join(dir, 'assets', 'css', 'style.css');
    writeFileSync(path, readFileSync(path, 'utf8').replace('--ink-3: #9e9484;', '--ink-3: #5a5348;'));
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /dark ink-3 on paper is \d+\.\d+:1, below 4\.5:1/);
});

test('the validator refuses two chart colors that collapse under a dichromacy', () => {
  const result = runSiteValidator((dir) => {
    const path = join(dir, 'assets', 'css', 'style.css');
    writeFileSync(path, readFileSync(path, 'utf8').replace('--red: #8b1a1a;', '--red: #b03d19;'));
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /light accent and red chart colors are \d+\.\d+ apart under normal vision; the minimum is 15/);
});

test('the validator refuses a chart color that cannot be measured', () => {
  const result = runSiteValidator((dir) => {
    const path = join(dir, 'assets', 'css', 'style.css');
    writeFileSync(path, readFileSync(path, 'utf8').replace('  --red: #8b1a1a;\n', ''));
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cannot measure the light accent and red chart colors under normal vision/);
});

test('the validator refuses a palette token that is neither measured nor declared decorative', () => {
  const result = runSiteValidator((dir) => {
    const path = join(dir, 'assets', 'css', 'style.css');
    writeFileSync(path, readFileSync(path, 'utf8').replace('  --ink: #1b1814;\n', '  --ink: #1b1814;\n  --ghost: #123456;\n'));
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /palette token --ghost is neither measured for contrast nor declared decorative/);
});

test('the runtime guard rejects a document missing any schema-required key', () => {
  const schema = JSON.parse(readFileSync(join(ROOT, 'data', 'site-data.schema.json'), 'utf8'));
  const data = JSON.parse(readFileSync(join(ROOT, 'data', 'site-data.json'), 'utf8'));
  assert.equal(isValidSiteData(data), true);
  for (const key of schema.required) {
    const broken = structuredClone(data);
    delete broken[key];
    assert.equal(isValidSiteData(broken), false, `the guard accepted a document without ${key}`);
  }
});

const MATRIX = JSON.parse(readFileSync(join(ROOT, 'data', 'benchmark-matrix.json'), 'utf8'));

test('the data validator re-derives the paired McNemar p-value', () => {
  const drifted = structuredClone(DATA);
  const compared = drifted.benchmark.contenders.find((entry) => entry.vsHighlight != null);
  compared.vsHighlight.p = 0.5;
  const result = runValidator(drifted, SHOWCASE, MATRIX);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /vsHighlight p does not match the exact McNemar test/);
});

test('the data validator re-derives the Holm adjustment across the rivals', () => {
  const drifted = structuredClone(DATA);
  const compared = drifted.benchmark.contenders.find((entry) => entry.vsHighlight != null);
  compared.vsHighlight.pAdjusted = 0.5;
  const result = runValidator(drifted, SHOWCASE, MATRIX);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /vsHighlight pAdjusted does not match the Holm adjustment/);
});

test('the data validator re-derives the paired-difference interval', () => {
  const drifted = structuredClone(DATA);
  const compared = drifted.benchmark.contenders.find((entry) => entry.vsHighlight != null);
  compared.vsHighlight.low = 0;
  const result = runValidator(drifted, SHOWCASE, MATRIX);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /vsHighlight interval does not match the paired-difference interval/);

  const missing = structuredClone(DATA);
  delete missing.benchmark.contenders.find((entry) => entry.vsHighlight != null).vsHighlight.high;
  const missingResult = runValidator(missing, SHOWCASE, MATRIX);
  assert.equal(missingResult.status, 1);
  assert.match(missingResult.stderr, /vsHighlight missing high/);
});

test('the data validator refuses a pair that contradicts the highlight and the run count', () => {
  const highlighted = structuredClone(DATA);
  highlighted.benchmark.contenders.find((entry) => entry.highlight).vsHighlight = { b: 1, c: 1, p: 1, low: -1, high: 1 };
  const highlightResult = runValidator(highlighted, SHOWCASE, MATRIX);
  assert.equal(highlightResult.status, 1);
  assert.match(highlightResult.stderr, /is highlighted and cannot compare itself to the highlight/);

  const oversized = structuredClone(DATA);
  const compared = oversized.benchmark.contenders.find((entry) => entry.vsHighlight != null);
  compared.vsHighlight = { b: compared.runs, c: compared.runs, p: 1, low: -1, high: 1 };
  const oversizedResult = runValidator(oversized, SHOWCASE, MATRIX);
  assert.equal(oversizedResult.status, 1);
  assert.match(oversizedResult.stderr, /vsHighlight exceeds runs/);

  const malformed = structuredClone(DATA);
  malformed.benchmark.contenders.find((entry) => entry.vsHighlight != null).vsHighlight = { b: 'one', c: 0, p: 1, low: -1, high: 1 };
  const malformedResult = runValidator(malformed, SHOWCASE, MATRIX);
  assert.equal(malformedResult.status, 1);
  assert.match(malformedResult.stderr, /vsHighlight invalid/);
});

test('the data validator refuses a scenario matrix that drifted from the benchmark block', () => {
  const cellDrift = structuredClone(MATRIX);
  cellDrift.cells[0][0][1] += 1;
  const cellResult = runValidator(DATA, SHOWCASE, cellDrift);
  assert.equal(cellResult.status, 1);
  assert.match(cellResult.stderr, /benchmark-matrix does not match the benchmark block/);

  const shortScenarios = structuredClone(MATRIX);
  shortScenarios.scenarios = shortScenarios.scenarios.slice(1);
  shortScenarios.cells = shortScenarios.cells.slice(1);
  const shortResult = runValidator(DATA, SHOWCASE, shortScenarios);
  assert.equal(shortResult.status, 1);
  assert.match(shortResult.stderr, /benchmark-matrix does not match the benchmark block/);
});

test('the matrix schema refuses an unknown focus and a malformed cell', () => {
  const badFocus = structuredClone(MATRIX);
  badFocus.scenarios[0].focus = 'speed';
  const focusResult = runValidator(DATA, SHOWCASE, badFocus);
  assert.equal(focusResult.status, 1);
  assert.match(focusResult.stderr, /scenarios\.0\.focus invalid/);

  const badCell = structuredClone(MATRIX);
  badCell.cells[0][0] = [1];
  const cellResult = runValidator(DATA, SHOWCASE, badCell);
  assert.equal(cellResult.status, 1);
  assert.match(cellResult.stderr, /cells\.0\.0 invalid/);

  const badIndex = structuredClone(MATRIX);
  badIndex.cells[0][0] = [['x'], 9];
  const indexResult = runValidator(DATA, SHOWCASE, badIndex);
  assert.equal(indexResult.status, 1);
  assert.match(indexResult.stderr, /cells\.0\.0\.0\.0 invalid/);

  const noModels = structuredClone(MATRIX);
  delete noModels.models;
  const modelsResult = runValidator(DATA, SHOWCASE, noModels);
  assert.equal(modelsResult.status, 1);
  assert.match(modelsResult.stderr, /missing models/);
});

test('the data validator accepts a manifest without a benchmark block', () => {
  const data = structuredClone(DATA);
  delete data.benchmark;
  delete data.benchmarkHistory;
  const result = runValidator(data, SHOWCASE);
  assert.equal(result.status, 0, result.stderr);
});

test('the site validator refuses a missing markdown link and a drifted agent manifest', () => {
  const noAlternate = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace('  <link rel="alternate" type="text/markdown" href="index.md">\n', ''));
  });
  assert.equal(noAlternate.status, 1);
  assert.match(noAlternate.stderr, /missing the rel=alternate link to index\.md/);

  const noIndex = runSiteValidator((dir) => {
    rmSync(join(dir, 'index.md'));
  });
  assert.equal(noIndex.status, 1);
  assert.match(noIndex.stderr, /index\.md unreadable/);

  const strayArtifact = runSiteValidator((dir) => {
    const path = join(dir, 'agent-readability.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    manifest.artifacts.markdown = 'https://yugimob.github.io/ghost.md';
    writeFileSync(path, JSON.stringify(manifest, null, 2));
  });
  assert.equal(strayArtifact.status, 1);
  assert.match(strayArtifact.stderr, /agent-readability\.json: .*ghost\.md does not exist/);

  const missingArtifact = runSiteValidator((dir) => {
    const path = join(dir, 'agent-readability.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    delete manifest.artifacts.sitemap;
    writeFileSync(path, JSON.stringify(manifest, null, 2));
  });
  assert.equal(missingArtifact.status, 1);
  assert.match(missingArtifact.stderr, /agent-readability\.json: does not list sitemap\.xml/);

  const noReadabilityLink = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace('  <link rel="describedby" href="agent-readability.json" type="application/json">\n', ''));
  });
  assert.equal(noReadabilityLink.status, 1);
  assert.match(noReadabilityLink.stderr, /missing the rel=describedby link to agent-readability\.json/);

  const manifestDrift = runSiteValidator((dir) => {
    const path = join(dir, 'agent-readability.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    manifest.repository = 'https://github.com/attacker/evil';
    writeFileSync(path, JSON.stringify(manifest, null, 2));
  });
  assert.equal(manifestDrift.status, 1);
  assert.match(manifestDrift.stderr, /repository is not the site repository/);
});

test('the site validator refuses a hero stat block that drifted from the data', () => {
  const result = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace(/(<dd class="stat-value" aria-hidden="true">)\d+(<\/dd>)/, '$10$2'));
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /the hero stat block does not match the machine data/);
});

test('the site validator refuses intro paragraphs that drifted from the showcase', () => {
  const result = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace(/<p class="intro-paragraph">[^<]*<\/p>/, '<p class="intro-paragraph">drifted</p>'));
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /the intro paragraphs do not match the showcase/);
});

test('the site validator refuses a noscript list missing a project', () => {
  const result = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace(/\s*<li><a href="https:\/\/github\.com\/YuGiMob\/pi-tor-proxy">[\s\S]*?<\/li>/, ''));
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /the noscript list is missing pi-tor-proxy/);
});

test('the site validator refuses a README that does not list a script', () => {
  const result = runSiteValidator((dir) => {
    const path = join(dir, 'README.md');
    writeFileSync(path, readFileSync(path, 'utf8').replace(/scripts\/site-html-lib\.mjs[^\n]*\n/, ''));
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /scripts\/site-html-lib\.mjs is not listed in the Files block/);
});

test('the validator refuses a chart color that collapses with green', () => {
  const result = runSiteValidator((dir) => {
    const path = join(dir, 'assets', 'css', 'style.css');
    writeFileSync(path, readFileSync(path, 'utf8').replace('--green: #92e8a3;', '--green: #e5836a;'));
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /dark accent and green chart colors are [\d.]+ apart/);
});

test('the validator refuses a feed that is not a current JSON feed', () => {
  const version = runSiteValidator((dir) => {
    const path = join(dir, 'feed.json');
    const feed = JSON.parse(readFileSync(path, 'utf8'));
    feed.version = 'https://jsonfeed.org/version/1';
    writeFileSync(path, JSON.stringify(feed, null, 2));
  });
  assert.equal(version.status, 1);
  assert.match(version.stderr, /feed\.json: version is not JSON Feed 1\.1/);

  const broken = runSiteValidator((dir) => {
    const path = join(dir, 'feed.json');
    const feed = JSON.parse(readFileSync(path, 'utf8'));
    delete feed.items[1].content_text;
    feed.items.push(structuredClone(feed.items[0]));
    writeFileSync(path, JSON.stringify(feed, null, 2));
  });
  assert.equal(broken.status, 1);
  assert.match(broken.stderr, /feed\.json: an item is missing id, url, or content_text/);
  assert.match(broken.stderr, /feed\.json: duplicated item id/);
});

test('the validator refuses inline JSON-LD that drifted from the data', () => {
  const result = runSiteValidator((dir) => {
    const path = join(dir, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace('"name":"YuGiMob"', '"name":"Someone Else"'));
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /the JSON-LD name does not match identity\.displayName/);
});
