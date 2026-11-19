const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (char: string): string => ESCAPES[char] ?? char);
}

export function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

export function signedPercent(share: number): string {
  return `${share < 0 ? '−' : '+'}${Math.abs(Math.round(share * 1000) / 10)}%`;
}

export function decimal(value: number, digits: number): string {
  const scale: number = Math.pow(10, digits);
  return String(Math.round(value * scale) / scale);
}

export function seconds(value: number): string {
  const rounded: number = Math.round(value * 10) / 10;
  return `${rounded}초`;
}

export function minutes(value: number): string {
  const whole: number = Math.round(value);
  if (whole < 60) return `${whole}분`;
  const hours: number = Math.floor(whole / 60);
  const rest: number = whole % 60;
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

export function josa(word: string, withBatchim: string, withoutBatchim: string): string {
  const code: number = word.charCodeAt(word.length - 1);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 === 0 ? withoutBatchim : withBatchim;
  return withoutBatchim;
}

export function list(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  const last: string = parts[parts.length - 1] ?? '';
  const beforeLast: string = parts[parts.length - 2] ?? '';
  return `${parts.slice(0, -1).join(', ')}${josa(beforeLast, '와', '과')} ${last}`;
}

export function para(...lines: readonly string[]): string {
  return lines.map((line: string): string => `<p>${line}</p>`).join('\n');
}

export function section(id: string, title: string, body: string): string {
  return `<section id="${esc(id)}" aria-labelledby="${esc(id)}-title">\n<h2 id="${esc(id)}-title">${esc(title)}</h2>\n${body}\n</section>`;
}

export function subsection(title: string, body: string): string {
  return `<h3>${esc(title)}</h3>\n${body}`;
}

export function bullets(items: readonly string[]): string {
  return `<ul>\n${items.map((item: string): string => `<li>${item}</li>`).join('\n')}\n</ul>`;
}

export interface Table {
  readonly head: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly caption?: string;
  readonly className?: string;
}

export function table(spec: Table): string {
  const head: string = spec.head.map((cell: string, index: number): string => `<th scope="col"${index === 0 ? '' : ' class="num"'}>${cell}</th>`).join('');
  const rows: string = spec.rows.map((row: readonly string[]): string => `<tr>${row.map((cell: string, index: number): string => (index === 0 ? `<th scope="row">${cell}</th>` : `<td class="num">${cell}</td>`)).join('')}</tr>`).join('\n');
  const caption: string = spec.caption === undefined ? '' : `<caption>${spec.caption}</caption>`;
  return `<div class="table${spec.className === undefined ? '' : ` ${esc(spec.className)}`}"><table>${caption}<thead><tr>${head}</tr></thead>\n<tbody>\n${rows}\n</tbody></table></div>`;
}

export function terms(items: readonly (readonly [string, string])[]): string {
  return `<dl class="terms">\n${items.map(([term, body]: readonly [string, string]): string => `<dt>${term}</dt><dd>${body}</dd>`).join('\n')}\n</dl>`;
}

export function note(body: string): string {
  return `<aside class="note">${body}</aside>`;
}

export function link(href: string, text: string): string {
  return `<a href="${esc(href)}">${text}</a>`;
}

export function kbd(key: string): string {
  return `<kbd>${esc(key)}</kbd>`;
}
