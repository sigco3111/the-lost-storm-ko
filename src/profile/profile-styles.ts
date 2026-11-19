import profileCss from './profile.css?inline';

const STYLE_ID: string = 'profile-styles';

export function ensureProfileStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) return;
  const style: HTMLStyleElement = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = profileCss;
  document.head.appendChild(style);
}
