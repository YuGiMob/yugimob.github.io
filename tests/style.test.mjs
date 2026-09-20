import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, withRepoCopy } from './helpers.mjs';

const VALIDATOR = join(ROOT, 'scripts', 'validate-style.mjs');

function runStyleValidator(mutate) {
  return withRepoCopy((copy) => spawnSync(process.execPath, [VALIDATOR, copy], { encoding: 'utf8' }), mutate);
}

test('the committed sources pass the style validator', () => {
  const output = execFileSync(process.execPath, [VALIDATOR], { encoding: 'utf8' });
  assert.match(output, /^validate:style: ok \(\d+ files\)/);
});

test('the style validator refuses a comment in a TypeScript file', () => {
  const result = runStyleValidator((copy) => {
    writeFileSync(join(copy, 'tests', 'fixtures', 'refresh', 'probe.ts'), 'const value = 1; // leaked comment\n');
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /probe\.ts:\d+:\d+ has a line comment/);
});

test('the style validator refuses a script comment', () => {
  const line = runStyleValidator((copy) => {
    appendFileSync(join(copy, 'assets', 'js', 'avatar.js'), '\n// leaked comment\n');
  });
  assert.equal(line.status, 1);
  assert.match(line.stderr, /assets\/js\/avatar\.js:\d+:\d+ has a line comment/);

  const block = runStyleValidator((copy) => {
    appendFileSync(join(copy, 'assets', 'js', 'avatar.js'), '\n/* leaked block */\nconst value = 1;\n');
  });
  assert.equal(block.status, 1);
  assert.match(block.stderr, /has a block comment/);
});

test('the style validator does not mistake strings and regexes for comments', () => {
  const result = runStyleValidator((copy) => {
    appendFileSync(join(copy, 'assets', 'js', 'avatar.js'), '\nconst url = "https://example.com/a//b";\nconst re = /^https?:\\/\\//;\nconst text = `a ${1 / 2} b`;\nif (!re.test(url)) console.log(text);\n');
  });
  assert.equal(result.status, 0, result.stderr);
});

test('the style validator does not mistake statement-position regexes for comments', () => {
  const result = runStyleValidator((copy) => {
    appendFileSync(join(copy, 'assets', 'js', 'avatar.js'), '\nconst flag = 1;\nif (flag) /^https?:\\/\\//.test("x");\nfunction check() { return /^https?:\\/\\//.test("x"); }\nthrow /^https?:\\/\\//.test("x");\nconst ratio = flag / 2;\n');
  });
  assert.equal(result.status, 0, result.stderr);
});

test('the style validator scans every text file in the tree, not a fixed list', () => {
  const result = runStyleValidator((copy) => {
    writeFileSync(join(copy, 'NOTES.md'), 'A note.\n<!-- a markup comment -->\n');
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /NOTES\.md:\d+:\d+ has a markup comment/);
});

test('the style validator leaves binary assets alone', () => {
  const result = runStyleValidator((copy) => {
    writeFileSync(join(copy, 'assets', 'probe.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]));
  });
  assert.equal(result.status, 0, result.stderr);
});

test('the style validator refuses YAML comments and leaves quoted hashes alone', () => {
  const quoted = runStyleValidator((copy) => {
    appendFileSync(join(copy, '.github', 'workflows', 'validate.yml'), '\nfragment: "a # inside quotes"\n');
  });
  assert.equal(quoted.status, 0, quoted.stderr);

  const comment = runStyleValidator((copy) => {
    appendFileSync(join(copy, '.github', 'workflows', 'validate.yml'), '\nkey: value # a leaked comment\n');
  });
  assert.equal(comment.status, 1);
  assert.match(comment.stderr, /has a line comment/);
});

test('the style validator still refuses a comment after a division and a call', () => {
  const division = runStyleValidator((copy) => {
    appendFileSync(join(copy, 'assets', 'js', 'avatar.js'), '\nconst flag = 1;\nconst ratio = flag / 2; // leaked comment\n');
  });
  assert.equal(division.status, 1);
  assert.match(division.stderr, /has a line comment/);

  const call = runStyleValidator((copy) => {
    appendFileSync(join(copy, 'assets', 'js', 'avatar.js'), '\ncheck(); // leaked comment\nfunction check() {}\n');
  });
  assert.equal(call.status, 1);
  assert.match(call.stderr, /has a line comment/);
});

test('the style validator refuses CRLF, tabs, trailing whitespace, and a missing final newline', () => {
  const crlf = runStyleValidator((copy) => {
    const path = join(copy, 'data', 'showcase.json');
    writeFileSync(path, readFileSync(path, 'utf8').replace(/\n/g, '\r\n'));
  });
  assert.match(crlf.stderr, /data\/showcase\.json: uses CRLF line endings/);

  const tab = runStyleValidator((copy) => {
    const path = join(copy, 'assets', 'css', 'style.css');
    writeFileSync(path, readFileSync(path, 'utf8').replace('\n  color-scheme: light;', '\n\tcolor-scheme: light;'));
  });
  assert.match(tab.stderr, /assets\/css\/style\.css:\d+:\d+ is indented with a tab/);

  const trailing = runStyleValidator((copy) => {
    appendFileSync(join(copy, 'robots.txt'), '   \n');
  });
  assert.match(trailing.stderr, /robots\.txt:\d+:\d+ has trailing whitespace/);

  const newline = runStyleValidator((copy) => {
    const path = join(copy, 'llms.txt');
    writeFileSync(path, readFileSync(path, 'utf8').trimEnd());
  });
  assert.match(newline.stderr, /llms\.txt: is missing a final newline/);
});

test('the style validator refuses comments in markup, stylesheets, and markdown', () => {
  const markup = runStyleValidator((copy) => {
    appendFileSync(join(copy, 'index.html'), '\n<!-- leaked -->\n');
  });
  assert.equal(markup.status, 1);
  assert.match(markup.stderr, /index\.html:\d+:\d+ has a markup comment/);

  const stylesheet = runStyleValidator((copy) => {
    appendFileSync(join(copy, 'assets', 'css', 'style.css'), '\n/* leaked */\n');
  });
  assert.equal(stylesheet.status, 1);
  assert.match(stylesheet.stderr, /style\.css:\d+:\d+ has a block comment/);

  const markdown = runStyleValidator((copy) => {
    appendFileSync(join(copy, 'CONTRIBUTING.md'), '\n<!-- leaked -->\n');
  });
  assert.equal(markdown.status, 1);
  assert.match(markdown.stderr, /CONTRIBUTING\.md:\d+:\d+ has a markup comment/);
});

test('the style validator reaches comments inside template expressions', () => {
  const result = runStyleValidator((copy) => {
    appendFileSync(join(copy, 'assets', 'js', 'avatar.js'), '\nconst text = `a ${1 // leaked\n} b`;\n');
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /has a line comment/);
});

test('the style validator keeps scanning after a regex inside a template expression', () => {
  const result = runStyleValidator((copy) => {
    appendFileSync(join(copy, 'assets', 'js', 'avatar.js'), '\nconst probe = `a ${/\\}/.test("}")} b`;\nconst ratio = 1 / 2; // leaked comment\n');
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /has a line comment/);
});

test('the style validator reaches a comment inside a nested template expression', () => {
  const result = runStyleValidator((copy) => {
    appendFileSync(join(copy, 'assets', 'js', 'avatar.js'), '\nconst nested = `x ${ `y ${1 // leaked\n} z` } w`;\n');
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /has a line comment/);
});

test('the style validator keeps scanning past a nested template expression', () => {
  const result = runStyleValidator((copy) => {
    appendFileSync(join(copy, 'assets', 'js', 'avatar.js'), '\nconst nested = `x ${ `y ${1\n} z` } w`;\nconst later = 1 / 2; // leaked comment\n');
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /has a line comment/);
});
