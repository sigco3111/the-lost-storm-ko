import links from '../../data/links.json' with { type: 'json' };
import { outboundLinks, readLinks } from './links.ts';
import type { Links, OutboundLink } from './links.ts';

export interface LinkSet {
  readonly outbound: readonly OutboundLink[];
  readonly share: string | null;
}

const LINKS: Links = readLinks(links);

export const LINK_SET: LinkSet = { outbound: outboundLinks(LINKS), share: LINKS.site };
