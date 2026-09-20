import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrateAvatar } from '../assets/js/avatar.js';
import { register, withDom } from './dom.mjs';

test('hydrateAvatar fills src and alt', () => {
  withDom((dom) => {
    const avatar = register(dom.document, 'avatar');
    hydrateAvatar(avatar, 'assets/avatar.png', 'Tester');
    assert.equal(avatar.getAttribute('src'), 'assets/avatar.png');
    assert.equal(avatar.getAttribute('alt'), 'Tester');
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
