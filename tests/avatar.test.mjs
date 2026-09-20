import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarSrcSet, hydrateAvatar } from '../assets/js/avatar.js';
import { register, withDom } from './dom.mjs';

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

test('hydrateAvatar fills src, srcset, and alt and drops a stale srcset', () => {
  withDom((dom) => {
    const avatar = register(dom.document, 'avatar');
    hydrateAvatar(avatar, 'avatar.png?s=108', 'Tester');
    assert.equal(avatar.getAttribute('src'), 'avatar.png?s=108');
    assert.equal(avatar.getAttribute('srcset'), 'avatar.png?s=108 1x, avatar.png?s=216 2x');
    assert.equal(avatar.getAttribute('alt'), 'Tester');

    hydrateAvatar(avatar, 'avatar.png', 'Tester');
    assert.equal(avatar.hasAttribute('srcset'), false);
  });
});

test('hydrateAvatar skips a missing element or URL and an absent display name', () => {
  withDom((dom) => {
    hydrateAvatar(null, 'avatar.png', 'Tester');
    const avatar = register(dom.document, 'avatar');
    hydrateAvatar(avatar, '', 'Tester');
    assert.equal(avatar.hasAttribute('src'), false);

    hydrateAvatar(avatar, 'avatar.png');
    assert.equal(avatar.getAttribute('src'), 'avatar.png');
    assert.equal(avatar.hasAttribute('alt'), false);
  });
});
