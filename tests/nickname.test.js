const test = require('node:test');
const assert = require('node:assert/strict');

const nickname = require('../src/nickname.js');

const reason = (raw) => {
  const r = nickname.check(raw);
  return r.ok ? 'ok' : r.reason;
};

test('good nicknames pass, with spaces tidied', () => {
  for (const name of ['Migs', 'Kalamansi 482', 'Ana_Banana', 'Maria Clara', 'Ñoño', 'juan.dela-cruz']) {
    assert.equal(reason(name), 'ok', name);
  }
  assert.deepEqual(nickname.check('  Migs   Cruz '), { ok: true, nickname: 'Migs Cruz', key: 'migs cruz' });
});

test('length: 3 to 20 characters', () => {
  assert.equal(reason(''), 'too_short');
  assert.equal(reason('ab'), 'too_short');
  assert.equal(reason('abc'), 'ok');
  assert.equal(reason('a'.repeat(20)), 'ok');
  assert.equal(reason('a'.repeat(21)), 'too_long');
  assert.equal(reason(null), 'too_short');
  assert.equal(reason(12345), 'too_short');
});

test('only letters, numbers, spaces and _ - .', () => {
  assert.equal(reason('a<b>c'), 'bad_chars');
  assert.equal(reason('Ana😀'), 'bad_chars');
  assert.equal(reason('x@y.com'), 'bad_chars');
  assert.equal(reason('semi;colon'), 'bad_chars');
  assert.equal(reason('two\nlines'), 'ok'); // line breaks become a space
});

test('bad words are caught, even stretched, spaced or written with look-alike digits', () => {
  const blocked = [
    'fuck', 'FUCK', 'fuuuck', 'fvck', 'xxFuckxx', 'sh1t', 'shiiit', 'b1tch', 'f u c k', 'f.u.c.k', 'f_u-c_k',
    'Hitler', 'Pussycat', 'Cunts', 'Ass', 'assss', 'Dick', 'Nazi',
    'Putangina', 'tang1na', 'p u t a', 'puta', 'Bobo', 'b0b0', 'Gago', 'Ulol', 'Kupal', 'Pakyu',
  ];
  for (const name of blocked) assert.equal(reason(name), 'not_allowed', name);
});

test('innocent names that only contain a short bad word are fine', () => {
  const fine = [
    'Scunthorpe', 'Dickson', 'Peacock', 'Hancock', 'Grape', 'Class Mass', 'Assassin', 'Sussex', 'Essex',
    'Reputation', 'Batangas', 'Nigeria', 'Titan', 'Analyst', 'Bobby',
  ];
  for (const name of fine) assert.equal(reason(name), 'ok', name);
});

test('the key used for "already taken" ignores capitals and extra spaces', () => {
  assert.equal(nickname.check('MIGS  Cruz').key, nickname.check('migs cruz').key);
});
