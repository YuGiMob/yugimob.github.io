export const PLAYGROUND_ID = 'hashline';

export function loadDemo(id) {
  if (id === PLAYGROUND_ID) return import('./playground.js').then((module) => module.buildPlayground());
  return import('./demos.js').then((module) => module.buildDemo(id));
}
