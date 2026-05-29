import { initImageViewer } from './imageViewer';

// Matches /posts/X and /[category]/posts/X (zero or one prefix segment).
const POST_PATH_RE = /^(?:\/[\w-]+)?\/posts\/[\w-]+\/?$/;

function isModifierClick(e: MouseEvent): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
}

function updateBodyScrollLock(): void {
  // Touch / pointer scroll while the overlay is open is suppressed via
  // CSS (`touch-action: none` on #post) — touching the overlay never
  // reaches the underlying body. No html-level overflow change is
  // applied, which was breaking iOS Safari's safe-area canvas paint.
}

function removeOverlay(animated: boolean = true): void {
  const post = document.querySelector<HTMLElement>('#post');
  if (!post) {
    updateBodyScrollLock();
    return;
  }
  const finish = (): void => {
    post.remove();
    updateBodyScrollLock();
  };
  if (!animated || post.classList.contains('is-closing')) {
    finish();
    return;
  }
  post.classList.add('is-closing');
  post.addEventListener('animationend', finish, { once: true });
}

async function openOverlay(href: string): Promise<void> {
  let html: string;
  try {
    const res = await fetch(href, { credentials: 'same-origin' });
    if (!res.ok) {
      window.location.href = href;
      return;
    }
    html = await res.text();
  } catch {
    window.location.href = href;
    return;
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const post = doc.querySelector('#post');
  if (!post) {
    window.location.href = href;
    return;
  }

  // Replace any existing overlay without animation (rapid switch).
  removeOverlay(false);
  const bodyContainer = document.querySelector('#body') ?? document.body;
  bodyContainer.appendChild(post);
  window.history.pushState({ overlay: true }, '', href);
  updateBodyScrollLock();
  initImageViewer();
}

function shouldInterceptLeavingLink(link: HTMLAnchorElement): boolean {
  if (link.matches('a.thumbnail, a.thumbnail-for-smartphone')) return false;
  if (link.target && link.target !== '_self') return false;
  // Links inside the overlay (shift / original / close) are owned by
  // imageViewer; don't treat them as "navigating away from detail".
  if (link.closest('#post')) return false;
  try {
    const url = new URL(link.href);
    if (url.origin !== window.location.origin) return false;
  } catch {
    return false;
  }
  return true;
}

export function initOverlayRouter(): void {
  document.addEventListener('click', (e) => {
    if (isModifierClick(e)) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // Open overlay on thumbnail click.
    const thumbnail = target.closest<HTMLAnchorElement>(
      'a.thumbnail, a.thumbnail-for-smartphone'
    );
    if (thumbnail) {
      e.preventDefault();
      void openOverlay(thumbnail.href);
      return;
    }

    // For any other in-site link click while a post overlay is shown
    // (e.g. header nav, pagination, in-overlay close button on direct
    // landing), play the fade-out then navigate.
    if (!document.querySelector('#post')) return;
    const link = target.closest<HTMLAnchorElement>('a[href]');
    if (!link || !shouldInterceptLeavingLink(link)) return;
    const post = document.querySelector<HTMLElement>('#post');
    if (!post || post.classList.contains('is-closing')) return;

    e.preventDefault();
    post.classList.add('is-closing');
    post.addEventListener(
      'animationend',
      () => {
        window.location.href = link.href;
      },
      { once: true }
    );
  });

  window.addEventListener('popstate', () => {
    const path = window.location.pathname;
    if (POST_PATH_RE.test(path)) {
      void openOverlay(path);
    } else {
      removeOverlay();
    }
  });

  updateBodyScrollLock();
}
