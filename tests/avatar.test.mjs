import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarSrcSet } from '../assets/js/avatar.js';

test('avatarSrcSet produces 1x and 2x sizes for an absolute avatar URL', () => {
  const url = 'https://avatars.githubusercontent.com/u/110136195?s=216&v=4';
  assert.equal(
    avatarSrcSet(url),
    'https://avatars.githubusercontent.com/u/110136195?s=108&v=4 1x, https://avatars.githubusercontent.com/u/110136195?s=216&v=4 2x',
  );
});

test('avatarSrcSet handles relative URLs and missing sizes', () => {
  assert.equal(avatarSrcSet('avatar.png?s=108'), 'avatar.png?s=108 1x, avatar.png?s=216 2x');
  assert.equal(avatarSrcSet('avatar.png'), null);
});
