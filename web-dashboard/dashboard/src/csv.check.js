// Run: node src/csv.check.js
import assert from 'node:assert/strict';
import { csvCell, toCsv } from './csv.js';

assert.equal(csvCell('plain'), 'plain');
assert.equal(csvCell(null), '');
assert.equal(csvCell('a,b'), '"a,b"');
assert.equal(csvCell('a,b', ';'), 'a,b');            // comma is fine with ; separator
assert.equal(csvCell('1;5', ';'), '"1;5"');
assert.equal(csvCell('say "hi"'), '"say ""hi"""');
assert.equal(csvCell('two\nlines'), '"two\nlines"');
assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
assert.equal(csvCell('-5'), "'-5");
assert.equal(csvCell('@cmd'), "'@cmd");
assert.equal(toCsv([['a', 'b'], ['1', '2']]), '﻿a,b\r\n1,2');

console.log('csv checks passed');
