function decodeEmail(): string {
  const parts: Array<string | number> = [
    'odori',
    (7 * 3 + 10) * 10,
    `&#x${Math.pow(2, 6).toString(16)};`,
    'liamg'.split('').reverse().join(''),
    '&#x2e;',
    'chill-out me'
      .split(/\W+/)
      .map((v) => v.charAt(0))
      .join(''),
  ];
  return parts.join('');
}

export function renderEmails(): void {
  const html = decodeEmail();
  document.querySelectorAll<HTMLElement>('#profile span.email').forEach((el) => {
    if (el.dataset.rendered === 'true') return;
    el.innerHTML = html;
    el.dataset.rendered = 'true';
  });
}
