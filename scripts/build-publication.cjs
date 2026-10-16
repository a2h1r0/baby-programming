/* Publication adds search/sharing metadata and assets without changing the offline game. */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_URL = 'https://atsuhi.ro/apps/baby-programming/';
const TITLE = '4〜6歳向け無料プログラミングゲーム｜はちさんと おはな';
const DESCRIPTION = '4〜6歳の幼児が、矢印をタップしてハチをお花へ導く無料のプログラミング体験ゲーム。前進と左右の回転で命令の順番を学べます。年齢別2モード・全8課題。登録不要で、HTMLを保存してオフラインでも遊べます。';

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderPublication(sourceHtml) {
  if (typeof sourceHtml !== 'string') throw new TypeError('HTML text is required.');
  const heads = sourceHtml.match(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi) || [];
  if (heads.length !== 1 || !/<body\b[^>]*>[\s\S]*<\/body\s*>/i.test(sourceHtml)) {
    throw new Error('The game must contain exactly one head and a body.');
  }
  const titles = heads[0].match(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi) || [];
  if (titles.length !== 1) throw new Error('The game must contain exactly one title.');

  let head = heads[0].replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/i, '<title>' + escapeHtml(TITLE) + '</title>');
  head = head.replace(/<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>\s*/gi, '');
  head = head.replace(/<link\b[^>]*\brel\s*=\s*["'](?:shortcut\s+)?icon["'][^>]*>\s*/gi, '');
  head = head.replace(/<meta\b[^>]*(?:\bname\s*=\s*["'](?:description|robots|twitter:[^"']+)["']|\bproperty\s*=\s*["']og:[^"']+["'])[^>]*>\s*/gi, '');
  const metadata = [
    '<link rel="canonical" href="' + escapeHtml(PUBLIC_URL) + '">',
    '<link rel="icon" href="favicon.ico" type="image/x-icon">',
    '<meta name="description" content="' + escapeHtml(DESCRIPTION) + '">',
    '<meta name="robots" content="index, follow">',
    '<meta property="og:type" content="website">',
    '<meta property="og:title" content="' + escapeHtml(TITLE) + '">',
    '<meta property="og:description" content="' + escapeHtml(DESCRIPTION) + '">',
    '<meta property="og:url" content="' + escapeHtml(PUBLIC_URL) + '">',
    '<meta property="og:image" content="' + escapeHtml(PUBLIC_URL + 'image.png') + '">',
    '<meta property="og:image:type" content="image/png">',
    '<meta property="og:image:width" content="1731">',
    '<meta property="og:image:height" content="909">',
    '<meta property="og:image:alt" content="はちさんと おはな | はじめてのプログラミング">',
    '<meta property="og:locale" content="ja_JP">',
    '<meta property="og:site_name" content="Atsuhiro Fujii">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:image" content="' + escapeHtml(PUBLIC_URL + 'image.png') + '">'
  ].join('\n');
  head = head.replace(/\s*<\/head\s*>/i, '\n' + metadata + '\n</head>');
  return sourceHtml.replace(heads[0], () => head);
}

function buildPublication(outputDirectory) {
  if (typeof outputDirectory !== 'string' || !outputDirectory.trim()) {
    throw new TypeError('An output directory is required.');
  }
  const destination = path.resolve(outputDirectory);
  if (destination === ROOT) throw new Error('Choose an output directory other than the offline source directory.');
  const sourceHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const html = renderPublication(sourceHtml);
  fs.mkdirSync(destination, { recursive: true });
  const outputPath = path.join(destination, 'index.html');
  fs.writeFileSync(outputPath, html, 'utf8');
  for (const asset of ['favicon.ico', 'image.png']) {
    fs.copyFileSync(path.join(ROOT, asset), path.join(destination, asset));
  }
  return outputPath;
}

if (require.main === module) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/build-publication.cjs <output-directory>');
    console.log(buildPublication(process.argv[2]));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { PUBLIC_URL, TITLE, DESCRIPTION, renderPublication, buildPublication };
