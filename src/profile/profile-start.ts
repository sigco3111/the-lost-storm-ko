import type { Content } from '../../sim/content/types.ts';
import { createProfileApi } from '../backend/profile-api.ts';
import type { HudApi } from '../hud/hud-api.ts';
import type { Lobby } from '../lobby/compact.ts';
import type { Pictures } from '../render/item-pictures-start.ts';
import type { Turntable } from '../render/item-thumbnails.ts';
import { TITLE_SCREEN } from '../title-screen.ts';
import { createProfilePanel } from './profile-panel.ts';
import type { ProfileHosts, ProfilePanel } from './profile-panel.ts';

export interface ProfileStart {
  readonly api: HudApi;
  readonly content: Content;
  readonly pictures: Pictures;
  readonly hosts: ProfileHosts;
}

export function startProfile(lobby: Lobby | null, start: ProfileStart): ProfilePanel | null {
  if (lobby === null) return null;
  const panel: ProfilePanel = createProfilePanel({
    api: start.api,
    content: start.content,
    profiles: createProfileApi(start.content, lobby.serverUrl, (url: string, init: RequestInit): Promise<Response> => fetch(url, init)),
    pictures: start.pictures.items,
    turntable: (figure): Promise<Turntable | null> => start.pictures.turntable(figure),
    hosts: start.hosts,
    playing: (): boolean => document.body.classList.contains(TITLE_SCREEN.playingClass),
  });
  lobby.profiles.bind((name: string): void => panel.open(name));
  return panel;
}
