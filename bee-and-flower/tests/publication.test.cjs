/* Check sharing metadata directly in the page, with no build step. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const applicationRoot = path.join(__dirname, '..');
const sourcePath = path.join(applicationRoot, 'index.html');
const publicUrl = 'https://atsuhi.ro/apps/baby-programming/bee-and-flower/';

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

test('published HTML identifies one canonical public URL and complete Japanese sharing metadata', () => {
  const rendered = fs.readFileSync(sourcePath, 'utf8');
  const titles = rendered.match(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi) || [];
  assert.equal(titles.length, 1);
  const title = decodeEntities(titles[0].replace(/^<title\b[^>]*>|<\/title\s*>$/gi, ''));
  assert.ok(title.length > 0);
  const description = metadata(rendered, 'description');
  assert.equal(description.length, 1);
  assert.ok(description[0].content.length > 0);
  const canonical = tags(rendered, 'link').map(attributes).filter(tag => tag.rel === 'canonical');
  assert.equal(canonical.length, 1);
  assert.equal(canonical[0].href, publicUrl);
  const expected = {
    description: description[0].content,
    'og:url': publicUrl,
    'og:title': title,
    'og:description': description[0].content,
    'og:type': 'website',
    'og:locale': 'ja_JP',
    'og:image': publicUrl + 'image.png',
    'og:image:type': 'image/png',
    'og:image:width': '1731',
    'og:image:height': '909',
    'og:image:alt': 'はちさんと おはな | はじめてのプログラミング',
    'twitter:card': 'summary_large_image',
    'twitter:image': publicUrl + 'image.png'
  };
  for (const [key, value] of Object.entries(expected)) {
    const matches = metadata(rendered, key);
    assert.equal(matches.length, 1, key + ' must occur exactly once');
    assert.equal(matches[0].content, value, key + ' must survive HTML attribute decoding');
  }
  const siteName = metadata(rendered, 'og:site_name');
  assert.equal(siteName.length, 1);
  assert.ok(siteName[0].content.length > 0);
  const icons = tags(rendered, 'link').map(attributes).filter(tag => tag.rel === 'icon');
  assert.equal(icons.length, 1);
  assert.equal(icons[0].href, 'favicon.ico');
  assert.equal(icons[0].type, 'image/x-icon');
  const image = fs.readFileSync(path.join(applicationRoot, 'image.png'));
  assert.equal(Number(metadata(rendered, 'og:image:width')[0].content), image.readUInt32BE(16));
  assert.equal(Number(metadata(rendered, 'og:image:height')[0].content), image.readUInt32BE(20));
  for (const tag of tags(rendered, 'meta')) {
    assert.doesNotMatch(tag, /&(?!#\d+;|#x[\da-f]+;|amp;|quot;|apos;|lt;|gt;)/i,
      'metadata must escape HTML entities');
  }
});
