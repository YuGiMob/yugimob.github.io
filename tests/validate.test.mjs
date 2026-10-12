import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, withRepoCopy } from './helpers.mjs';

function readJson(copy, relativePath) {
  return JSON.parse(readFileSync(join(copy, relativePath), 'utf8'));
}

function writeJson(copy, relativePath, value) {
  writeFileSync(join(copy, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

function patch(copy, relativePath, from, to) {
  const path = join(copy, relativePath);
  const source = readFileSync(path, 'utf8');
  assert.ok(source.includes(from), `expected ${relativePath} to contain ${from}`);
  writeFileSync(path, source.replace(from, to));
}

function schemaMutated(copy) {
  for (const file of ['data/site-data.schema.json', 'data/showcase.schema.json']) {
    if (readFileSync(join(copy, file), 'utf8') !== readFileSync(join(ROOT, file), 'utf8')) return true;
  }
  return false;
}

function runData(copy) {
  const local = schemaMutated(copy);
  const script = local ? join(copy, 'scripts', 'validate-data.mjs') : join(ROOT, 'scripts', 'validate-data.mjs');
  const args = local ? [] : [join(copy, 'data', 'site-data.json'), join(copy, 'data', 'showcase.json')];
  return spawnSync(process.execPath, [script, ...args], { cwd: copy, encoding: 'utf8' });
}

function runSite(copy) {
  return spawnSync(process.execPath, [join(ROOT, 'scripts', 'validate-site.mjs'), copy], { cwd: copy, encoding: 'utf8' });
}

function expectData(mutate, pattern) {
  withRepoCopy((copy) => {
    mutate(copy);
    const result = runData(copy);
    assert.equal(result.status, 1, `expected validate-data to fail\n${result.stdout}`);
    assert.match(result.stderr, pattern);
  });
}

function expectSite(mutate, pattern) {
  withRepoCopy((copy) => {
    mutate(copy);
    const result = runSite(copy);
    assert.equal(result.status, 1, `expected validate-site to fail\n${result.stdout}`);
    assert.match(result.stderr, pattern);
  });
}

test('the committed data files pass the validator', () => {
  const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'validate-data.mjs')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /validate: ok/);
});

test('the committed site structure passes the validator', () => {
  const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'validate-site.mjs')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /validate:site: ok/);
});

test('the data validator refuses a missing required key', () => {
  expectData((copy) => {
    const data = readJson(copy, 'data/site-data.json');
    delete data.identity;
    writeJson(copy, 'data/site-data.json', data);
  }, /missing identity/);
});

test('the data validator refuses an unknown key', () => {
  expectData((copy) => {
    const data = readJson(copy, 'data/site-data.json');
    data.extra = true;
    writeJson(copy, 'data/site-data.json', data);
  }, /unexpected key extra/);
});

test('the data validator refuses a duplicated project and a duplicated npm package', () => {
  expectData((copy) => {
    const data = readJson(copy, 'data/site-data.json');
    data.projects.push({ ...data.projects[0] });
    writeJson(copy, 'data/site-data.json', data);
  }, /project duplicated/);
  expectData((copy) => {
    const data = readJson(copy, 'data/site-data.json');
    data.projects[1].npm = data.projects[0].npm;
    writeJson(copy, 'data/site-data.json', data);
  }, /npm package duplicated/);
});

test('the data validator refuses a showcase name missing from the manifest', () => {
  expectData((copy) => {
    const showcase = readJson(copy, 'data/showcase.json');
    showcase.problems[0].name = 'ghost';
    writeJson(copy, 'data/showcase.json', showcase);
  }, /showcase problem missing from site-data: ghost/);
});

test('the data validator refuses a duplicated showcase name and an unknown demo', () => {
  expectData((copy) => {
    const showcase = readJson(copy, 'data/showcase.json');
    showcase.problems[1].name = showcase.problems[0].name;
    writeJson(copy, 'data/showcase.json', showcase);
  }, /showcase problem duplicated/);
  expectData((copy) => {
    const showcase = readJson(copy, 'data/showcase.json');
    showcase.problems[0].demo = 'ghost';
    writeJson(copy, 'data/showcase.json', showcase);
  }, /demo unknown: ghost/);
});

test('the data validator refuses unsorted history and history beyond the cap', () => {
  expectData((copy) => {
    const data = readJson(copy, 'data/site-data.json');
    data.history = [
      { date: '2026-09-20', totalStars: 1, totalDownloads: 1 },
      { date: '2026-09-19', totalStars: 1, totalDownloads: 1 },
    ];
    writeJson(copy, 'data/site-data.json', data);
  }, /history dates must be unique and sorted/);
  expectData((copy) => {
    const data = readJson(copy, 'data/site-data.json');
    data.history = Array.from({ length: 121 }, (unused, index) => ({
      date: new Date(Date.UTC(2025, 0, 1) + index * 86400000).toISOString().slice(0, 10),
      totalStars: 1,
      totalDownloads: 1,
    }));
    writeJson(copy, 'data/site-data.json', data);
  }, /history has 121 entries; the cap is 120/);
});

test('the data validator refuses daily and highlight lists beyond the caps', () => {
  expectData((copy) => {
    const data = readJson(copy, 'data/site-data.json');
    data.activity.daily = Array.from({ length: 121 }, (unused, index) => ({
      date: new Date(Date.UTC(2025, 0, 1) + index * 86400000).toISOString().slice(0, 10),
      events: 0,
      pushes: 0,
    }));
    writeJson(copy, 'data/site-data.json', data);
  }, /activity\.daily has 121 entries; the cap is 120/);
  expectData((copy) => {
    const data = readJson(copy, 'data/site-data.json');
    data.activity.highlights = ['a', 'b', 'c', 'd', 'e', 'f'];
    writeJson(copy, 'data/site-data.json', data);
  }, /activity\.highlights has 6 entries; the cap is 5/);
});

test('the data validator refuses non-object documents instead of accepting them', () => {
  expectData((copy) => {
    writeFileSync(join(copy, 'data/site-data.json'), '[]\n');
  }, /invalid|missing/);
  expectData((copy) => {
    writeFileSync(join(copy, 'data/showcase.json'), '"nope"\n');
  }, /invalid|missing/);
});

test('the data validator reports unreadable and unparsable input files', () => {
  expectData((copy) => {
    writeFileSync(join(copy, 'data/site-data.json'), '{ nope');
  }, /unparsable/);
});

test('the schema walker refuses a keyword it cannot enforce', () => {
  expectData((copy) => {
    const schema = readJson(copy, 'data/site-data.schema.json');
    schema.properties.identity.properties.displayName.minContains = 1;
    writeJson(copy, 'data/site-data.schema.json', schema);
  }, /unsupported keyword minContains/);
});

test('the schema walker refuses an unsupported type and format', () => {
  expectData((copy) => {
    const schema = readJson(copy, 'data/site-data.schema.json');
    schema.properties.identity.properties.displayName.type = 'float';
    writeJson(copy, 'data/site-data.schema.json', schema);
  }, /unsupported type float/);
  expectData((copy) => {
    const schema = readJson(copy, 'data/site-data.schema.json');
    schema.properties.identity.properties.displayName.format = 'phone';
    writeJson(copy, 'data/site-data.schema.json', schema);
  }, /unsupported format phone/);
});

test('the schema walker enforces const, oneOf, not, and uniqueItems', () => {
  expectData((copy) => {
    const schema = readJson(copy, 'data/site-data.schema.json');
    schema.properties.identity.properties.displayName = { type: 'string', const: 'Nobody' };
    writeJson(copy, 'data/site-data.schema.json', schema);
  }, /identity\.displayName invalid/);
  expectData((copy) => {
    const schema = readJson(copy, 'data/site-data.schema.json');
    schema.properties.identity.properties.displayName = { oneOf: [{ type: 'number' }, { type: 'boolean' }] };
    writeJson(copy, 'data/site-data.schema.json', schema);
  }, /identity\.displayName invalid/);
  expectData((copy) => {
    const schema = readJson(copy, 'data/site-data.schema.json');
    schema.properties.identity.properties.displayName = { not: { type: 'string' } };
    writeJson(copy, 'data/site-data.schema.json', schema);
  }, /identity\.displayName invalid/);
  expectData((copy) => {
    const showcase = readJson(copy, 'data/showcase.json');
    showcase.principles.push(showcase.principles[0]);
    writeJson(copy, 'data/showcase.json', showcase);
    const schema = readJson(copy, 'data/showcase.schema.json');
    schema.properties.principles.uniqueItems = true;
    writeJson(copy, 'data/showcase.schema.json', schema);
  }, /duplicates an earlier item/);
});

test('the schema walker resolves a missing $ref and reports it', () => {
  expectData((copy) => {
    const schema = readJson(copy, 'data/site-data.schema.json');
    schema.properties.identity.properties.displayName = { $ref: '#/definitions/nope' };
    writeJson(copy, 'data/site-data.schema.json', schema);
  }, /references the missing schema #\/definitions\/nope/);
});

test('the site validator refuses a duplicate id and a missing fragment target', () => {
  expectSite((copy) => {
    patch(copy, 'index.html', '<p class="intro-handle" id="display-name">', '<div id="avatar"></div><p class="intro-handle" id="display-name">');
  }, /duplicate id avatar/);
  expectSite((copy) => {
    patch(copy, 'index.html', 'href="#colophon" data-nav="colophon"', 'href="#ghost" data-nav="colophon"');
  }, /missing fragment target #ghost/);
});

test('the site validator refuses a missing nav target and a missing local file', () => {
  expectSite((copy) => {
    patch(copy, 'index.html', 'data-nav="problems"', 'data-nav="ghost"');
  }, /missing nav target ghost/);
  expectSite((copy) => {
    patch(copy, 'index.html', 'href="llms.txt"', 'href="missing.txt"');
  }, /missing local file missing\.txt/);
});

test('the site validator refuses third-party assets', () => {
  expectSite((copy) => {
    patch(copy, 'index.html', '</head>', '<script src="https://evil.test/x.js"></script></head>');
  }, /third-party script/);
  expectSite((copy) => {
    patch(copy, 'index.html', '</head>', '<link rel="stylesheet" href="https://evil.test/x.css"></head>');
  }, /third-party stylesheet/);
});

test('the site validator refuses a stale CSP hash and a missing directive', () => {
  expectSite((copy) => {
    patch(copy, 'index.html', "script-src 'self' ", "script-src 'self' 'sha256-OLD=' ");
  }, /CSP hash for the inline JSON-LD block is stale/);
  expectSite((copy) => {
    patch(copy, 'index.html', "require-trusted-types-for 'script'; trusted-types 'none'", "trusted-types 'none'");
  }, /CSP is missing require-trusted-types-for 'script'/);
});

test('the site validator refuses a DOM sink and a mis-preloaded module', () => {
  expectSite((copy) => {
    patch(copy, 'assets/js/render.js', 'export function renderIdentity', 'function sink(node) { node.innerHTML = "<b>x</b>"; }\nexport function renderIdentity');
  }, /DOM sink that Trusted Types forbids/);
  expectSite((copy) => {
    patch(copy, 'index.html', '<link rel="modulepreload" href="assets/js/ui.js">', '');
  }, /ui\.js is statically imported but not preloaded/);
  expectSite((copy) => {
    patch(copy, 'index.html', '<link rel="modulepreload" href="assets/js/ui.js">', '<link rel="modulepreload" href="assets/js/ui.js"><link rel="modulepreload" href="assets/js/demos.js">');
  }, /demos\.js is loaded on demand but preloaded/);
});

test('the site validator refuses a missing runtime preload', () => {
  expectSite((copy) => {
    patch(copy, 'index.html', '<link rel="preload" as="fetch" href="data/site-data.json" crossorigin>', '');
  }, /data\/site-data\.json is fetched at runtime but not preloaded/);
});

test('the site validator refuses README ghosts and missing entries', () => {
  expectSite((copy) => {
    patch(copy, 'README.md', 'assets/js/demos.js', 'assets/js/ghost.js');
  }, /listed path assets\/js\/ghost\.js does not exist/);
  expectSite((copy) => {
    patch(copy, 'README.md', 'scripts/serve.mjs', 'scripts/ghost.mjs');
  }, /scripts\/serve\.mjs is not listed in the Files block/);
});

test('the site validator refuses a noscript list missing a project and a stray', () => {
  expectSite((copy) => {
    patch(copy, 'index.html', '<li><a href="https://github.com/YuGiMob/pi-git-commit">pi-git-commit</a> <code>pi install npm:pi-git-commit</code></li>', '');
  }, /noscript list is missing pi-git-commit/);
  expectSite((copy) => {
    patch(copy, 'index.html', '<li>Read the page as', '<li><a href="https://github.com/YuGiMob/ghost">ghost</a></li><li>Read the page as');
  }, /noscript link ghost is not in site-data\.json/);
});

test('the site validator refuses a missing image alt and a jumped heading order', () => {
  expectSite((copy) => {
    patch(copy, 'index.html', 'id="avatar" src="assets/avatar.png" alt="YuGiMob"', 'id="avatar" src="assets/avatar.png"');
  }, /<img> is missing an alt attribute/);
  expectSite((copy) => {
    patch(copy, 'index.html', '<h2 class="section-title" id="problems-heading">', '<h4 class="section-title" id="problems-heading">');
  }, /heading level jumps/);
});

test('the site validator refuses a missing lang and a missing main', () => {
  expectSite((copy) => {
    patch(copy, 'index.html', '<html lang="en">', '<html>');
  }, /<html> is missing a lang attribute/);
  expectSite((copy) => {
    patch(copy, 'index.html', '<main id="main-content"', '<div id="main-content"');
  }, /expected exactly one <main>/);
});

test('the site validator refuses a broken aria reference and an unrel blank link', () => {
  expectSite((copy) => {
    patch(copy, 'index.html', 'aria-labelledby="problems-heading"', 'aria-labelledby="ghost"');
  }, /aria reference to missing id ghost/);
  expectSite((copy) => {
    patch(copy, 'index.html', '</main>', '<a href="https://x.test" target="_blank">x</a></main>');
  }, /target="_blank" link has no rel=noopener/);
});

test('the site validator refuses inline styles and event handlers', () => {
  expectSite((copy) => {
    patch(copy, 'index.html', '</main>', '<p style="color:red">x</p></main>');
  }, /uses an inline style/);
  expectSite((copy) => {
    patch(copy, 'index.html', '</main>', '<p onclick="x()">x</p></main>');
  }, /uses an inline event handler/);
});

test('the site validator refuses a title or description outside its length limits', () => {
  expectSite((copy) => {
    patch(copy, 'index.html', '<title>YuGiMob · Extensions for the pi coding agent</title>', '<title>x</title>');
  }, /title length 1 is outside 5-70/);
  expectSite((copy) => {
    patch(copy, 'index.html', 'content="Extensions for the pi coding agent: anchored edits, keyless web tools, Tor routing, review workflows, and a human gate in front of every commit."', 'content="short"');
  }, /meta description length 5 is outside 50-200/);
});

test('the site validator refuses a nav order that does not match the section order', () => {
  expectSite((copy) => {
    patch(copy, 'index.html', '<a href="#problems" data-nav="problems">The tools</a>\n        <a href="#colophon" data-nav="colophon">About</a>', '<a href="#colophon" data-nav="colophon">About</a>\n        <a href="#problems" data-nav="problems">The tools</a>');
  }, /nav order does not match the section order/);
});

test('the site validator refuses a drifted sitemap lastmod', () => {
  expectSite((copy) => {
    patch(copy, 'sitemap.xml', /<lastmod>[^<]+<\/lastmod>/.exec(readFileSync(join(copy, 'sitemap.xml'), 'utf8'))[0], '<lastmod>2026-01-01</lastmod>');
  }, /does not match the newest history date/);
});

test('the site validator refuses a robots.txt without content signals', () => {
  expectSite((copy) => {
    patch(copy, 'robots.txt', 'Content-Signal: search=yes, ai-input=yes, ai-train=yes', '');
  }, /missing a Content-Signal line/);
});

test('the site validator refuses an expiring security.txt', () => {
  expectSite((copy) => {
    patch(copy, '.well-known/security.txt', /Expires: \S+/.exec(readFileSync(join(copy, '.well-known/security.txt'), 'utf8'))[0], 'Expires: 2026-10-12T00:00:00.000Z');
  }, /Expires is less than 60 days away/);
});

test('the site validator refuses a missing avatar and a CSP that does not allow its origin', () => {
  expectSite((copy) => {
    const data = readJson(copy, 'data/site-data.json');
    data.identity.avatarUrl = 'assets/nope.png';
    writeJson(copy, 'data/site-data.json', data);
  }, /points at a missing file assets\/nope\.png/);
  expectSite((copy) => {
    const data = readJson(copy, 'data/site-data.json');
    data.identity.avatarUrl = 'https://cdn.test/avatar.png';
    writeJson(copy, 'data/site-data.json', data);
  }, /CSP img-src does not allow the avatar origin https:\/\/cdn\.test/);
});

test('the site validator refuses an incomplete llms.txt and a drifted agent manifest', () => {
  expectSite((copy) => {
    patch(copy, 'llms.txt', '- [pi-hashline-edit-pro]', '- [pi-hashline-edit-pro] (broken)');
  }, /link line is not in the spec form/);
  expectSite((copy) => {
    const path = join(copy, 'llms.txt');
    writeFileSync(path, readFileSync(path, 'utf8').split('pi-hashline-edit-pro').join('ghost-tool'));
  }, /missing project pi-hashline-edit-pro/);
  expectSite((copy) => {
    patch(copy, 'agent-readability.json', '"name": "YuGiMob"', '"name": "Nobody"');
  }, /name does not match the display name/);
});

test('the site validator refuses a feed that is not a current JSON feed', () => {
  expectSite((copy) => {
    patch(copy, 'feed.json', '"version": "https://jsonfeed.org/version/1.1"', '"version": "https://jsonfeed.org/version/1"');
  }, /version is not JSON Feed 1\.1/);
});

test('the site validator refuses a markdown mirror missing a project', () => {
  expectSite((copy) => {
    const path = join(copy, 'index.md');
    writeFileSync(path, readFileSync(path, 'utf8').split('pi-hashline-edit-pro').join('ghost-tool'));
  }, /index\.md: missing project pi-hashline-edit-pro/);
});

test('the site validator refuses a drifted hero stat block', () => {
  expectSite((copy) => {
    patch(copy, 'index.html', '<dd class="stat-value" aria-hidden="true">118</dd>', '<dd class="stat-value" aria-hidden="true">0</dd>');
  }, /hero stat block does not match the machine data/);
});

test('the site validator refuses intro paragraphs that drifted from the showcase', () => {
  expectSite((copy) => {
    patch(copy, 'index.html', 'I build extensions for pi', 'Someone else writes here');
  }, /intro paragraphs do not match the showcase/);
});

test('the site validator refuses a drifted problem block and static copy', () => {
  expectSite((copy) => {
    patch(copy, 'index.html', 'Every line a tool serves gets its own four-letter anchor.', 'A different answer.');
  }, /#problem-list block does not match the data files/);
  expectSite((copy) => {
    patch(copy, 'index.html', '<p class="intro-handle" id="display-name">YuGiMob</p>', '<p class="intro-handle" id="display-name">Nobody</p>');
  }, /#display-name does not match identity\.displayName/);
});

test('the site validator refuses inline JSON-LD that drifted from the data', () => {
  expectSite((copy) => {
    patch(copy, 'index.html', '"@type":"ProfilePage"', '"@type":"Thing"');
  }, /inline JSON-LD block does not match the data files/);
});

test('the site validator refuses a drifted hidden state and a missing scroll padding', () => {
  expectSite((copy) => {
    patch(copy, 'index.html', '<section id="problems" class="section"', '<section id="problems" class="section" hidden');
  }, /#problems hidden state does not match the data sections/);
  expectSite((copy) => {
    patch(copy, 'assets/css/style.css', 'scroll-padding-top: 92px;', '');
  }, /has no scroll-padding-top/);
});

test('the site validator refuses a palette pair below the contrast minimum', () => {
  expectSite((copy) => {
    patch(copy, 'assets/css/style.css', '--ink: #1b1814;', '--ink: #c9c9c9;');
  }, /below 4\.5:1/);
});

test('the site validator refuses an unmeasured palette token', () => {
  expectSite((copy) => {
    patch(copy, 'assets/css/style.css', '--shadow:', '--mystery: #123456;\n  --shadow:');
  }, /--mystery is neither measured for contrast nor declared decorative/);
});

test('the site validator refuses chart colors that collapse under a dichromacy', () => {
  expectSite((copy) => {
    patch(copy, 'assets/css/style.css', '--green: #2f7d46;', '--green: #8b1a1a;');
  }, /chart colors are 0\.0 apart under normal vision|chart colors are .* apart under/);
});

test('the site validator refuses an image whose declared size is wrong', () => {
  expectSite((copy) => {
    patch(copy, 'index.html', 'property="og:image:width" content="1200"', 'property="og:image:width" content="100"');
  }, /is 1200×630 but the page declares 100×630/);
});

test('the site validator refuses a stylesheet reference to a missing file', () => {
  expectSite((copy) => {
    patch(copy, 'assets/css/style.css', "url('../fonts/cY9AfjOCX1hbuyalUrK4397yjA.woff2')", "url('../fonts/ghost.woff2')");
  }, /missing file \.\.\/fonts\/ghost\.woff2/);
});

test('the site validator refuses a JSON-LD person that drifts from the identity', () => {
  expectSite((copy) => {
    patch(copy, 'index.html', '"name":"YuGiMob"', '"name":"Nobody"');
  }, /JSON-LD name does not match identity\.displayName|inline JSON-LD block does not match the data files/);
});

test('the site validator checks every id the scripts address', () => {
  expectSite((copy) => {
    patch(copy, 'index.html', '<div id="live-region"', '<div id="ghost-region"');
  }, /missing #live-region referenced by scripts/);
});

test('the schema walker covers every supported type and format', () => {
  expectData((copy) => {
    const schema = readJson(copy, 'data/site-data.schema.json');
    schema.properties.identity.properties.displayName = { type: ['string', 'null'], format: 'uri' };
    writeJson(copy, 'data/site-data.schema.json', schema);
  }, /identity\.displayName invalid/);
  expectData((copy) => {
    const schema = readJson(copy, 'data/site-data.schema.json');
    schema.properties.identity.properties.displayName = { type: 'null' };
    writeJson(copy, 'data/site-data.schema.json', schema);
  }, /identity\.displayName invalid/);
  expectData((copy) => {
    const schema = readJson(copy, 'data/site-data.schema.json');
    schema.properties.identity.properties.displayName = { type: 'string', format: 'email' };
    writeJson(copy, 'data/site-data.schema.json', schema);
  }, /identity\.displayName invalid/);
  expectData((copy) => {
    const schema = readJson(copy, 'data/site-data.schema.json');
    schema.properties.identity.properties.displayName = { type: 'boolean' };
    writeJson(copy, 'data/site-data.schema.json', schema);
  }, /identity\.displayName invalid/);
  expectData((copy) => {
    const schema = readJson(copy, 'data/site-data.schema.json');
    schema.properties.identity.properties.displayName = { type: 'number' };
    writeJson(copy, 'data/site-data.schema.json', schema);
  }, /identity\.displayName invalid/);
});

test('the schema walker enforces string, number, and array limits', () => {
  expectData((copy) => {
    const schema = readJson(copy, 'data/site-data.schema.json');
    schema.properties.identity.properties.displayName = { type: 'string', minLength: 100, pattern: '^Z' };
    writeJson(copy, 'data/site-data.schema.json', schema);
  }, /identity\.displayName invalid/);
  expectData((copy) => {
    const data = readJson(copy, 'data/site-data.json');
    data.stats.totalStars = 1000;
    writeJson(copy, 'data/site-data.json', data);
    const schema = readJson(copy, 'data/site-data.schema.json');
    schema.properties.stats.properties.totalStars.maximum = 10;
    writeJson(copy, 'data/site-data.schema.json', schema);
  }, /stats\.totalStars invalid/);
  expectData((copy) => {
    const schema = readJson(copy, 'data/site-data.schema.json');
    schema.properties.projects.maxItems = 1;
    writeJson(copy, 'data/site-data.schema.json', schema);
  }, /projects invalid/);
  expectData((copy) => {
    const schema = readJson(copy, 'data/site-data.schema.json');
    schema.properties.identity.minProperties = 10;
    writeJson(copy, 'data/site-data.schema.json', schema);
  }, /identity invalid/);
  expectData((copy) => {
    const schema = readJson(copy, 'data/site-data.schema.json');
    schema.properties.identity.maxProperties = 1;
    writeJson(copy, 'data/site-data.schema.json', schema);
  }, /identity invalid/);
});

test('the schema walker enforces allOf, anyOf, and enum', () => {
  expectData((copy) => {
    const schema = readJson(copy, 'data/site-data.schema.json');
    schema.properties.identity.properties.displayName = { allOf: [{ type: 'number' }] };
    writeJson(copy, 'data/site-data.schema.json', schema);
  }, /identity\.displayName invalid/);
  expectData((copy) => {
    const schema = readJson(copy, 'data/site-data.schema.json');
    schema.properties.identity.properties.displayName = { anyOf: [{ type: 'number' }, { type: 'boolean' }] };
    writeJson(copy, 'data/site-data.schema.json', schema);
  }, /identity\.displayName invalid/);
  expectData((copy) => {
    const schema = readJson(copy, 'data/site-data.schema.json');
    schema.properties.identity.properties.displayName = { type: 'string', enum: ['Nobody'] };
    writeJson(copy, 'data/site-data.schema.json', schema);
  }, /identity\.displayName invalid/);
});

test('the schema walker resolves definitions and validates object additional properties', () => {
  expectData((copy) => {
    const schema = readJson(copy, 'data/site-data.schema.json');
    schema.definitions = { name: { type: 'string', const: 'Nobody' } };
    schema.properties.identity.properties.displayName = { $ref: '#/definitions/name' };
    writeJson(copy, 'data/site-data.schema.json', schema);
  }, /identity\.displayName invalid/);
  expectData((copy) => {
    const schema = readJson(copy, 'data/site-data.schema.json');
    schema.properties.identity.properties.extra = { type: 'string' };
    schema.properties.identity.additionalProperties = { type: 'string' };
    writeJson(copy, 'data/site-data.schema.json', schema);
    const data = readJson(copy, 'data/site-data.json');
    data.identity.extra = 42;
    writeJson(copy, 'data/site-data.json', data);
  }, /identity\.extra invalid/);
});

test('the schema walker validates an array-form items list', () => {
  expectData((copy) => {
    const schema = readJson(copy, 'data/showcase.schema.json');
    schema.properties.principles.items = [{ type: 'string', const: 'Nobody' }];
    writeJson(copy, 'data/showcase.schema.json', schema);
  }, /principles\.0 invalid/);
});

test('the site validator refuses a robots sitemap on another origin and a future lastmod', () => {
  expectSite((copy) => {
    patch(copy, 'robots.txt', 'Sitemap: https://yugimob.github.io/sitemap.xml', 'Sitemap: https://example.com/sitemap.xml');
  }, /is not on the canonical origin/);
  expectSite((copy) => {
    patch(copy, 'sitemap.xml', /<lastmod>[^<]+<\/lastmod>/.exec(readFileSync(join(copy, 'sitemap.xml'), 'utf8'))[0], '<lastmod>2099-01-01</lastmod>');
  }, /is in the future/);
});

test('the site validator refuses a security.txt without a usable Expires', () => {
  expectSite((copy) => {
    patch(copy, '.well-known/security.txt', /Expires: \S+\n/.exec(readFileSync(join(copy, '.well-known/security.txt'), 'utf8'))[0], '');
  }, /missing or unparsable Expires/);
});

test('the site validator refuses a feed without items and an item missing its fields', () => {
  expectSite((copy) => {
    const feed = readJson(copy, 'feed.json');
    feed.items = [];
    writeJson(copy, 'feed.json', feed);
  }, /has no items/);
  expectSite((copy) => {
    patch(copy, 'feed.json', '"content_text":', '"content_text_x":');
  }, /missing id, url, or content_text/);
});

test('the site validator refuses a drifted agent manifest', () => {
  expectSite((copy) => {
    patch(copy, 'agent-readability.json', '"feed": "https://yugimob.github.io/feed.json"', '"feed": "https://yugimob.github.io/ghost.json"');
  }, /does not exist/);
  expectSite((copy) => {
    patch(copy, 'agent-readability.json', '"site": "https://yugimob.github.io"', '"site": "https://example.com"');
  }, /site is not the canonical URL/);
});

test('the site validator refuses an llms.txt and a markdown mirror without a title', () => {
  expectSite((copy) => {
    patch(copy, 'llms.txt', '# YuGiMob', 'YuGiMob');
  }, /missing an H1 title/);
  expectSite((copy) => {
    patch(copy, 'index.md', '# YuGiMob', 'YuGiMob');
  }, /index\.md: missing an H1 title/);
});

test('the site validator refuses a missing inline JSON-LD block and a drifted title', () => {
  expectSite((copy) => {
    const path = join(copy, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, ''));
  }, /missing the inline JSON-LD block/);
  expectSite((copy) => {
    patch(copy, 'index.html', '<title>YuGiMob · Extensions for the pi coding agent</title>', '<title>A different page title entirely</title>');
  }, /title does not contain the display name/);
});

test('the site validator refuses drifted social tags and JSON-LD identity fields', () => {
  expectSite((copy) => {
    patch(copy, 'index.html', 'property="og:title" content="YuGiMob · Extensions for the pi coding agent"', 'property="og:title" content="Something else"');
  }, /social titles do not match/);
  expectSite((copy) => {
    patch(copy, 'index.html', '"sameAs":["https://github.com/YuGiMob"]', '"sameAs":["https://github.com/other"]');
  }, /sameAs does not include identity\.links\.github|inline JSON-LD block does not match/);
});

test('the site validator refuses a missing avatar URL and an invalid one', () => {
  expectSite((copy) => {
    const data = readJson(copy, 'data/site-data.json');
    data.identity.avatarUrl = 'not a url';
    writeJson(copy, 'data/site-data.json', data);
  }, /is not a URL|points at a missing file/);
});

test('the site validator refuses a manifest project with no showcase entry and a jumped first heading', () => {
  expectSite((copy) => {
    const showcase = readJson(copy, 'data/showcase.json');
    showcase.problems[0].name = 'ghost';
    writeJson(copy, 'data/showcase.json', showcase);
  }, /no entry for the manifest project pi-hashline-edit-pro/);
  expectSite((copy) => {
    patch(copy, 'index.html', '<h1 class="intro-headline">', '<h2 class="intro-headline">');
  }, /first heading is h2, not h1/);
});

test('the site validator refuses a script sink and a JS inline style sink', () => {
  expectSite((copy) => {
    patch(copy, 'assets/js/render.js', 'export function renderIdentity', 'function sink() { const node = document.createElement("script"); return node; }\nexport function renderIdentity');
  }, /DOM sink that Trusted Types forbids/);
  expectSite((copy) => {
    patch(copy, 'assets/js/render.js', 'export function renderIdentity', 'function sink(node) { node.setAttribute("style", "color: red"); }\nexport function renderIdentity');
  }, /sets an inline style attribute/);
});

test('the site validator refuses a CSP without a script hash', () => {
  expectSite((copy) => {
    const path = join(copy, 'index.html');
    writeFileSync(path, readFileSync(path, 'utf8').replace(/'sha256-[A-Za-z0-9+/=]+'/, ''));
  }, /has no sha256 hash/);
});

test('the data validator refuses manifest totals that drift', () => {
  expectData((copy) => {
    const data = readJson(copy, 'data/site-data.json');
    data.stats.npmPackages = 99;
    writeJson(copy, 'data/site-data.json', data);
  }, /stats\.npmPackages is 99; the manifest lists \d+ npm packages/);
  expectData((copy) => {
    const data = readJson(copy, 'data/site-data.json');
    data.history[data.history.length - 1].totalStars = 1;
    writeJson(copy, 'data/site-data.json', data);
  }, /newest history snapshot has 1 stars; stats\.totalStars is \d+/);
  expectData((copy) => {
    const data = readJson(copy, 'data/site-data.json');
    data.activity.pushes = 999;
    writeJson(copy, 'data/site-data.json', data);
  }, /activity\.pushes is 999; the daily entries sum to \d+/);
});

test('the site validator refuses an extra inline script', () => {
  expectSite((copy) => {
    patch(copy, 'index.html', '</head>', '<script>console.log(1)</script></head>');
  }, /only inline script allowed/);
});

test('the site validator keeps the README Demos table in step', () => {
  expectSite((copy) => {
    patch(copy, 'README.md', '| `hashline` | assets/js/demos.js |', '| `ghost` | assets/js/demos.js |');
  }, /Demos table is missing hashline/);
  expectSite((copy) => {
    patch(copy, 'README.md', '| `git` | assets/js/demos.js |', '| `git` | assets/js/demos.js |\n| `ghost` | assets/js/demos.js |');
  }, /Demos table lists the unknown demo ghost/);
});

test('the site validator checks the noscript install commands', () => {
  expectSite((copy) => {
    patch(copy, 'index.html', '<code>pi install npm:pi-git-commit</code>', '<code>pi install npm:ghost</code>');
  }, /missing the install command for pi-git-commit/);
});

test('the site validator refuses an rgba palette token it cannot account for', () => {
  expectSite((copy) => {
    patch(copy, 'assets/css/style.css', '--accent-soft:', '--mystery-soft: rgba(1, 2, 3, 0.4);\n  --accent-soft:');
  }, /--mystery-soft is neither measured for contrast nor declared decorative/);
});

test('the site validator measures the prefers-contrast palette overrides', () => {
  expectSite((copy) => {
    patch(copy, 'assets/css/style.css', '--ink-2: #322d26;', '--ink-2: #c9c9c9;');
  }, /light high contrast ink-2 on paper is .* below 4\.5:1/);
});

test('the site validator measures the default palettes, not only the high-contrast overrides', () => {
  expectSite((copy) => {
    patch(copy, 'assets/css/style.css', '--ink-3: #71695b;', '--ink-3: #cfcfcf;');
  }, /light ink-3 on paper is .* below 4\.5:1/);
  expectSite((copy) => {
    patch(copy, 'assets/css/style.css', '--ink-2: #c8bfae;', '--ink-2: #2a2a2a;');
  }, /dark ink-2 on paper is .* below 4\.5:1/);
});
