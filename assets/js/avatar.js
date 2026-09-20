const SIZE_PATTERN = /([?&]s=)\d+/;

export function avatarSrcSet(url) {
  if (!SIZE_PATTERN.test(url)) return null;
  const withSize = (size) => url.replace(SIZE_PATTERN, (match, prefix) => `${prefix}${size}`);
  return `${withSize(108)} 1x, ${withSize(216)} 2x`;
}

export function hydrateAvatar(element, url, displayName) {
  if (!element || !url) return;
  element.src = url;
  const srcSet = avatarSrcSet(url);
  if (srcSet) element.srcset = srcSet;
  else element.removeAttribute('srcset');
  if (displayName != null) element.alt = displayName;
}
