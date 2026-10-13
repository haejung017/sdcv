import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { isCounted, parseNumstat, countLoc, countSince, lastCommit } from '../scripts/count-lib.mjs';

test('isCounted keeps code files and drops excluded ones', () => {
  assert.equal(isCounted('R/app.R'), true);
  assert.equal(isCounted('src/App.jsx'), true);
  assert.equal(isCounted('report.Rmd'), true);
  assert.equal(isCounted('README.md'), false);
  assert.equal(isCounted('data/program.json'), false);
  assert.equal(isCounted('package-lock.json'), false);
  assert.equal(isCounted('node_modules/x/index.js'), false);
  assert.equal(isCounted('www/lib/pdf.min.js'), false);
  assert.equal(isCounted('www/pdfjs/pdf.min.mjs'), false);
  assert.equal(isCounted('renv/activate.R'), false);
  assert.equal(isCounted('python/.venv/lib/a.py'), false);
  assert.equal(isCounted('www/pdfjs/pdf.js', ['www/pdfjs']), false);
  assert.equal(isCounted('www/pdfjs2/a.js', ['www/pdfjs']), true);
  assert.equal(isCounted('one-off.js', ['one-off.js']), false);
});

test('parseNumstat sums additions of counted files, resolving renames', () => {
  const out = [
    '3\t1\tsrc/a.js',
    '-\t-\timg/logo.png',
    '2\t0\tsrc/{old => new}/b.js',
    '1\t1\told.js => new.js',
    '9\t0\tpackage-lock.json',
    '',
  ].join('\n');
  assert.equal(parseNumstat(out), 6);
  assert.equal(parseNumstat(out, ['src/new']), 4);
});

test('parseNumstat skips commits authored before the start date', () => {
  const out = [
    '@2026-10-13T11:00:00-04:00', '', '5\t0\tnew.js',
    '@2026-10-10T15:00:00-04:00', '', '7\t0\told.js',
    '',
  ].join('\n');
  const start = new Date('2026-10-13T10:30:00-04:00');
  assert.equal(parseNumstat(out, [], start), 5);
  assert.equal(parseNumstat(out), 12);
});

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'sdcv-test-'));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir, encoding: 'utf8' }).trim();
  const write = (path, text) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); };
  git('init', '-q', '-b', 'main');
  return { dir, git, write, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('countLoc counts non-blank lines in counted files only', () => {
  const r = makeRepo();
  try {
    r.write('app.R', 'x <- 1\n\n  \ny <- 2\nz <- 3\n');
    r.write('node_modules/dep/index.js', 'a\nb\n');
    r.write('lib.min.js', 'a\n');
    r.write('data.json', '{\n}\n');
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'init');
    assert.equal(countLoc(r.dir), 3);
  } finally { r.cleanup(); }
});

test('countSince sums additions after the baseline commit', () => {
  const r = makeRepo();
  try {
    r.write('app.R', 'x <- 1\n');
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'base');
    const baseline = r.git('rev-parse', 'HEAD');
    r.write('app.R', 'x <- 1\ny <- 2\nz <- 3\n');
    r.write('b.js', '1\n2\n3\n4\n');
    r.write('notes.json', '{}\n');
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'work');
    assert.equal(countSince(r.dir, baseline), 6);
    assert.equal(countSince(r.dir, r.git('rev-parse', 'HEAD')), 0);
    assert.throws(() => countSince(r.dir, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'));
    assert.equal(countSince(r.dir, baseline, [], new Date(Date.now() + 86400000)), 0);
  } finally { r.cleanup(); }
});

test('lastCommit returns an ISO timestamp', () => {
  const r = makeRepo();
  try {
    r.write('a.js', '1\n');
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'one');
    assert.match(lastCommit(r.dir), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  } finally { r.cleanup(); }
});
