const LOADER_REMOVAL_DELAY_MS = 240;

export function revealApplication(root: HTMLElement): void {
  root.removeAttribute('aria-busy');
  document.documentElement.classList.remove('is-app-loading');

  const loader = document.querySelector<HTMLElement>('[data-app-loader]');
  if (loader === null) return;

  loader.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => {
    loader.remove();
  }, LOADER_REMOVAL_DELAY_MS);
}
