export function avatarSrcSet(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has('s')) return null;
    parsed.searchParams.set('s', '108');
    const one = parsed.toString();
    parsed.searchParams.set('s', '216');
    const two = parsed.toString();
    return `${one} 1x, ${two} 2x`;
  } catch {
    if (url.includes('s=216')) return `${url.replace('s=216', 's=108')} 1x, ${url} 2x`;
    return null;
  }
}
