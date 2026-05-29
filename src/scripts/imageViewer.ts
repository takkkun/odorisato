type ImageData = {
  url: string;
  width: number;
  height: number;
};

let activeController: AbortController | null = null;

function parseImages(frame: HTMLElement): ImageData[] {
  const raw = frame.dataset.images;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ImageData[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setupAutoHide(targets: HTMLElement[], signal: AbortSignal): void {
  if (targets.length === 0) return;

  let hideTimer: number | null = null;
  let hovering = false;

  const show = (): void => {
    targets.forEach((el) => el.classList.remove('hidden'));
  };
  const hide = (): void => {
    if (hovering) return;
    targets.forEach((el) => el.classList.add('hidden'));
  };

  const scheduleHide = (delay: number): void => {
    if (hideTimer !== null) clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      hide();
      hideTimer = null;
    }, delay);
  };

  signal.addEventListener('abort', () => {
    if (hideTimer !== null) clearTimeout(hideTimer);
  });

  targets.forEach((el) => {
    el.addEventListener(
      'mouseenter',
      () => {
        hovering = true;
        show();
      },
      { signal }
    );
    el.addEventListener(
      'mouseleave',
      () => {
        hovering = false;
        scheduleHide(1500);
      },
      { signal }
    );
  });

  document.addEventListener(
    'mousemove',
    () => {
      show();
      scheduleHide(1500);
    },
    { signal }
  );

  scheduleHide(4000);
}

function closeViewer(fallbackHref: string): void {
  const hasSameOriginHistory =
    window.history.length > 1 &&
    document.referrer !== '' &&
    new URL(document.referrer).origin === window.location.origin;

  const finish = (): void => {
    if (hasSameOriginHistory) {
      window.history.back();
    } else {
      window.location.href = fallbackHref;
    }
  };

  const post = document.querySelector<HTMLElement>('#post');
  if (post && !post.classList.contains('is-closing')) {
    post.classList.add('is-closing');
    post.addEventListener('animationend', finish, { once: true });
  } else {
    finish();
  }
}

export function initImageViewer(): void {
  activeController?.abort();
  activeController = null;

  const root = document.querySelector<HTMLElement>('#post');
  if (!root) return;

  const frame = root.querySelector<HTMLElement>('.image-frame');
  if (!frame) return;

  const img = frame.querySelector<HTMLImageElement>('img.current-image');
  const prev = frame.querySelector<HTMLAnchorElement>('a.previous');
  const next = frame.querySelector<HTMLAnchorElement>('a.next');
  const original = frame.querySelector<HTMLAnchorElement>('a.original');
  const close = frame.querySelector<HTMLAnchorElement>('a.close');
  const caption = frame.querySelector<HTMLElement>('h2.caption');
  const means = frame.querySelector<HTMLElement>('ul.means');
  const shifts = Array.from(frame.querySelectorAll<HTMLElement>('a.shift'));
  const fallbackHref = root.dataset.closeFallback || '/';

  const images = parseImages(frame);

  activeController = new AbortController();
  const { signal } = activeController;

  let index = 0;

  const markImageLoaded = (): void => {
    frame.classList.add('image-loaded');
    frame.classList.add('controls-ready');
  };

  const SRCSET_WIDTHS = [400, 800, 1200, 1600, 2400];
  const DEFAULT_SRC_WIDTH = 1200;

  const buildSrcset = (url: string, naturalWidth: number): string => {
    const widths = SRCSET_WIDTHS.filter((w) => w < naturalWidth);
    widths.push(naturalWidth);
    return widths.map((w) => `${url}?w=${w} ${w}w`).join(', ');
  };

  const buildDefaultSrc = (url: string, naturalWidth: number): string =>
    `${url}?w=${Math.min(DEFAULT_SRC_WIDTH, naturalWidth)}`;

  const updateState = (): void => {
    if (img && images[index]) {
      const current = images[index];
      const targetSrc = buildDefaultSrc(current.url, current.width);
      frame.style.setProperty('--ar', String(current.width / current.height));
      frame.style.setProperty('--max-w', `${current.width}px`);
      if (original) original.href = current.url;
      if (img.src !== new URL(targetSrc, window.location.href).href) {
        frame.classList.remove('image-loaded');
        img.srcset = buildSrcset(current.url, current.width);
        img.src = targetSrc;
        img.width = current.width;
        img.height = current.height;
      } else if (img.complete && img.naturalWidth > 0) {
        markImageLoaded();
      }
    }
    prev?.classList.toggle('deactive', index <= 0);
    next?.classList.toggle('deactive', index >= images.length - 1);
  };

  const switchTo = (newIndex: number): void => {
    if (newIndex < 0 || newIndex >= images.length) return;
    index = newIndex;
    updateState();
  };

  img?.addEventListener(
    'load',
    () => {
      markImageLoaded();
    },
    { signal }
  );

  if (img?.complete && img.naturalWidth > 0) {
    markImageLoaded();
  }

  updateState();

  prev?.addEventListener(
    'click',
    (e) => {
      e.preventDefault();
      switchTo(index - 1);
    },
    { signal }
  );
  next?.addEventListener(
    'click',
    (e) => {
      e.preventDefault();
      switchTo(index + 1);
    },
    { signal }
  );
  close?.addEventListener(
    'click',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeViewer(fallbackHref);
    },
    { signal }
  );

  root.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('a.shift, a.original, h2.caption')) return;
      if (target.closest('a.close')) return;
      e.preventDefault();
      closeViewer(fallbackHref);
    },
    { signal }
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
      switch (e.key) {
        case 'ArrowLeft':
        case 'h':
          e.preventDefault();
          switchTo(index - 1);
          break;
        case 'ArrowRight':
        case 'l':
          e.preventDefault();
          switchTo(index + 1);
          break;
        case 'Escape':
          e.preventDefault();
          closeViewer(fallbackHref);
          break;
      }
    },
    { signal }
  );

  const fadeTargets = [caption, ...shifts, means].filter(
    (el): el is HTMLElement => el !== null
  );
  setupAutoHide(fadeTargets, signal);
}
