import { el, append, observeVisibility } from './ui.js';

export function lazyMount(container, load) {
  let mounted = null;
  let settled = false;
  let observer = null;

  const showFailure = () => {
    container.classList.remove('is-loading');
    if (!container.querySelector('.chart-note')) {
      container.appendChild(el('p', 'chart-note', 'This panel could not be loaded from the data.'));
    }
  };

  const use = (value) => {
    container.classList.remove('is-loading');
    mounted = value ?? null;
    if (!mounted) {
      showFailure();
      return;
    }
    append(container, mounted.node, mounted.caption);
    observeVisibility(mounted.node, () => mounted.start(), () => mounted.stop());
  };

  const mount = () => {
    if (settled) return;
    settled = true;
    window.removeEventListener('beforeprint', mount);
    if (observer) observer.disconnect();
    let result;
    try {
      result = load();
    } catch (error) {
      console.warn('YuGiMob:', error);
      showFailure();
      return;
    }
    if (result && typeof result.then === 'function') {
      result.then(use).catch((error) => {
        console.warn('YuGiMob:', error);
        showFailure();
      });
      return;
    }
    use(result);
  };

  container.classList.add('is-loading');
  if (typeof IntersectionObserver !== 'function') {
    mount();
    return;
  }
  window.addEventListener('beforeprint', mount);
  observer = new IntersectionObserver((entries, self) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    self.disconnect();
    mount();
  }, { rootMargin: '200px 0px' });
  observer.observe(container);
}
