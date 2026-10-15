/* Publication checks use Node.js built-ins only; the game keeps working offline. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const publication = require('../scripts/build-publication.cjs');

const repositoryRoot = path.join(__dirname, '..');
const sourcePath = path.join(repositoryRoot, 'index.html');
const scriptPath = path.join(repositoryRoot, 'scripts', 'build-publication.cjs');
const publicUrl = 'https://atsuhi.ro/apps/baby-programming/';

function decodeEntities(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (_, entity) => {
    if (entity[0] === '#') {
      return String.fromCodePoint(entity[1].toLowerCase() === 'x'
        ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10));
    }
    return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }[entity.toLowerCase()];
  });
}

function attributes(tag) {
  const result = {};
  const expression = /([^\s"'<>/=]+)\s*=\s*(["'])([\s\S]*?)\2/g;
  let match;
  while ((match = expression.exec(tag))) result[match[1].toLowerCase()] = decodeEntities(match[3]);
  return result;
}

function tags(html, name) {
  return html.match(new RegExp('<' + name + '\\b[^>]*>', 'gi')) || [];
}

function metadata(html, key) {
  return tags(html, 'meta').map(attributes)
    .filter(tag => tag.name === key || tag.property === key);
}

function body(html) {
  const match = html.match(/<body\b[^>]*>[\s\S]*<\/body\s*>/i);
  assert.ok(match, 'the published game must retain its body');
  return match[0];
}

function scripts(html) {
  return html.match(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi) || [];
}

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bee-publication-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('bee-publication-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

test('published HTML identifies one canonical public URL and complete Japanese sharing metadata', () => {
  const rendered = publication.renderPublication(fs.readFileSync(sourcePath, 'utf8'));
  assert.equal(publication.PUBLIC_URL, publicUrl);
  assert.ok(publication.TITLE.length > 0);
  assert.ok(publication.DESCRIPTION.length > 0);
  const titles = rendered.match(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi) || [];
  assert.equal(titles.length, 1);
  assert.equal(decodeEntities(titles[0].replace(/^<title\b[^>]*>|<\/title\s*>$/gi, '')), publication.TITLE);
  const canonical = tags(rendered, 'link').map(attributes).filter(tag => tag.rel === 'canonical');
  assert.equal(canonical.length, 1);
  assert.equal(canonical[0].href, publicUrl);
  const expected = {
    description: publication.DESCRIPTION,
    'og:url': publicUrl,
    'og:title': publication.TITLE,
    'og:description': publication.DESCRIPTION,
    'og:type': 'website',
    'og:locale': 'ja_JP'
  };
  for (const [key, value] of Object.entries(expected)) {
    const matches = metadata(rendered, key);
    assert.equal(matches.length, 1, key + ' must occur exactly once');
    assert.equal(matches[0].content, value, key + ' must survive HTML attribute decoding');
  }
  const siteName = metadata(rendered, 'og:site_name');
  assert.equal(siteName.length, 1);
  assert.ok(siteName[0].content.length > 0);
  for (const tag of tags(rendered, 'meta')) {
    assert.doesNotMatch(tag, /&(?!#\d+;|#x[\da-f]+;|amp;|quot;|apos;|lt;|gt;)/i,
      'metadata must escape HTML entities');
  }
});

test('publication replaces the source title while preserving body and script bytes', () => {
  const fixture = '<!DOCTYPE html>\r\n<html lang="ja">\r\n<head>\r\n' +
    '<title>Old &amp; &quot;title&quot;</title>\r\n</head>\r\n' +
    '<body data-example="&quot;&amp;">\r\n<p>はち &amp; おはな</p>\r\n' +
    '<script>var example = "a < b & c";\r\n// Keep spaces and CRLF.\r\n</script>\r\n' +
    '</body>\r\n</html>\r\n';
  const rendered = publication.renderPublication(fixture);
  assert.doesNotMatch(rendered, /Old &amp; &quot;title&quot;/);
  assert.equal(body(rendered), body(fixture));
  assert.deepEqual(scripts(rendered), scripts(fixture));
});

test('rebuilding publication replaces inherited search metadata and is idempotent', () => {
  const fixture = '<!DOCTYPE html><html lang="ja"><head><title>Old title</title>' +
    '<link rel="canonical" href="https://old.example/">' +
    '<meta name="description" content="Obsolete description">' +
    '<meta name="robots" content="noindex">' +
    '<meta property="og:title" content="Obsolete sharing title">' +
    '<meta property="og:url" content="https://old.example/">' +
    '</head><body><p>Keep this game.</p></body></html>';
  const rendered = publication.renderPublication(fixture);
  assert.doesNotMatch(rendered, /old\.example|Obsolete|noindex/);
  assert.equal(tags(rendered, 'link').map(attributes).filter(tag => tag.rel === 'canonical').length, 1);
  for (const key of ['description', 'robots', 'og:title', 'og:url']) {
    assert.equal(metadata(rendered, key).length, 1, key + ' must not be duplicated');
  }
  assert.equal(publication.renderPublication(rendered), rendered);
  assert.equal(body(rendered), body(fixture));
});

test('the real published game keeps every game script and body byte without changing its offline source', () => {
  const original = fs.readFileSync(sourcePath);
  const source = original.toString('utf8');
  const rendered = publication.renderPublication(source);
  assert.equal(body(rendered), body(source));
  assert.deepEqual(scripts(rendered), scripts(source));
  assert.deepEqual(fs.readFileSync(sourcePath), original);
});

test('publication metadata introduces no external runtime assets or network dependency', () => {
  const rendered = publication.renderPublication(fs.readFileSync(sourcePath, 'utf8'));
  for (const name of ['script', 'img', 'iframe', 'audio', 'video', 'source', 'embed', 'object']) {
    for (const tag of tags(rendered, name)) {
      const values = attributes(tag);
      for (const key of ['src', 'srcset', 'data', 'poster']) {
        assert.doesNotMatch(values[key] || '', /(?:https?:)?\/\//i, name + ' must not fetch a remote asset');
      }
    }
  }
  for (const tag of tags(rendered, 'link').map(attributes)) {
    if (tag.rel !== 'canonical') assert.doesNotMatch(tag.href || '', /(?:https?:)?\/\//i);
  }
  assert.doesNotMatch(rendered, /@import\s|url\(\s*["']?(?:https?:)?\/\//i);
  assert.doesNotMatch(scripts(rendered).join('\n'), /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/);
});

test('the build function creates a nested output directory with exactly the published HTML', t => {
  const directory = temporaryDirectory(t);
  const outputDirectory = path.join(directory, 'apps', 'baby-programming');
  const original = fs.readFileSync(sourcePath);
  const result = publication.buildPublication(outputDirectory);
  assert.equal(result, path.join(outputDirectory, 'index.html'));
  assert.deepEqual(fs.readdirSync(outputDirectory), ['index.html']);
  assert.equal(fs.readFileSync(result, 'utf8'), publication.renderPublication(original.toString('utf8')));
  assert.deepEqual(fs.readFileSync(sourcePath), original);
});

test('the command line builds from an unrelated working directory and leaves the source untouched', t => {
  const directory = temporaryDirectory(t);
  const outputDirectory = path.join(directory, 'published');
  const original = fs.readFileSync(sourcePath);
  const result = spawnSync(process.execPath, [scriptPath, outputDirectory], {
    cwd: directory,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(fs.readdirSync(directory), ['published']);
  assert.deepEqual(fs.readdirSync(outputDirectory), ['index.html']);
  assert.equal(fs.readFileSync(path.join(outputDirectory, 'index.html'), 'utf8'),
    publication.renderPublication(original.toString('utf8')));
  assert.deepEqual(fs.readFileSync(sourcePath), original);
});

test('a missing command line destination fails without writing files', t => {
  const directory = temporaryDirectory(t);
  const original = fs.readFileSync(sourcePath);
  const result = spawnSync(process.execPath, [scriptPath], { cwd: directory, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.ok((result.stderr + result.stdout).trim().length > 0, 'failure must explain the missing argument');
  assert.deepEqual(fs.readdirSync(directory), []);
  assert.deepEqual(fs.readFileSync(sourcePath), original);
});

test('the build function refuses to overwrite the offline source in the repository root', () => {
  const original = fs.readFileSync(sourcePath);
  assert.throws(() => publication.buildPublication(repositoryRoot));
  assert.deepEqual(fs.readFileSync(sourcePath), original);
});

test('malformed publication input fails rather than publishing an HTML document without metadata', () => {
  for (const fixture of [
    '<!DOCTYPE html><html><head></head><body>Missing title</body></html>',
    '<!DOCTYPE html><html><title>Missing head</title><body>Game</body></html>',
    '<!DOCTYPE html><html><head><title>Unclosed head</title><body>Game</body></html>'
  ]) {
    assert.throws(() => publication.renderPublication(fixture));
  }
});
