const SCRIPT_SRC = /(^|;\s*)(script-src(?![\w-])\s*)([^;]*)/;
const HASH = /'sha256-([A-Za-z0-9+/=]+)'/;

export function scriptSrcHash(policy) {
  const directive = String(policy).match(SCRIPT_SRC);
  return directive ? directive[3].match(HASH)?.[1] ?? null : null;
}

export function withScriptSrcHash(policy, hash) {
  const source = String(policy);
  const directive = source.match(SCRIPT_SRC);
  if (!directive) return null;
  const token = `'sha256-${hash}'`;
  const body = HASH.test(directive[3])
    ? directive[3].replace(HASH, token)
    : [directive[3].trimEnd(), token].filter(Boolean).join(' ');
  return source.replace(SCRIPT_SRC, (match, prefix, name) => `${prefix}${name}${/\s$/.test(name) ? '' : ' '}${body}`);
}
