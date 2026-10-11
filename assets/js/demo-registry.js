export function loadDemo(id) {
  return import('./demos.js').then((module) => module.buildDemo(id));
}
