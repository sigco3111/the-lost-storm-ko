const ARTICLE: RegExp = /^The (?=\S)/;

export function inSentence(name: string): string {
  return name.replace(ARTICLE, 'the ');
}
