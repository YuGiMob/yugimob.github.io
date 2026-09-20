export function hydrateAvatar(element, url, displayName) {
  if (!element || !url) return;
  element.src = url;
  if (displayName != null) element.alt = displayName;
}
