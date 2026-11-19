import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inSentence } from './name-text.ts';

void test('a name that opens with its article reads with a small article inside a sentence, and any other name is left alone', (): void => {
  assert.equal(inSentence('The Reckoner'), 'the Reckoner');
  assert.equal(inSentence('The Hall of Time'), 'the Hall of Time');
  assert.equal(inSentence('Warden Guide'), 'Warden Guide');
  assert.equal(inSentence('Theodric'), 'Theodric');
  assert.equal(inSentence('Hammer of The Vigil'), 'Hammer of The Vigil');
  assert.equal(inSentence(''), '');
});
