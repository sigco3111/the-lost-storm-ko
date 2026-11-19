import type { Fields } from './read.ts';
import { byId, ContentError, each, fields, numeric, positive, text } from './read.ts';
import type { TunnelPoint, TunnelRoof, ZoneTunnel } from './tunnel-types.ts';

function tunnelPoint(value: unknown, where: string): TunnelPoint {
  const source: Fields = fields(value, where);
  return { x: numeric(source, 'x', where), z: numeric(source, 'z', where) };
}

function tunnelRoof(value: unknown, where: string): TunnelRoof {
  const source: Fields = fields(value, where);
  return {
    prop: text(source, 'prop', where),
    x: numeric(source, 'x', where),
    z: numeric(source, 'z', where),
    y: numeric(source, 'y', where),
    rotationDegrees: numeric(source, 'rotationDegrees', where),
    size: source['size'] === undefined ? 1 : positive(source, 'size', where),
  };
}

function zoneTunnel(value: unknown, where: string): ZoneTunnel {
  const source: Fields = fields(value, where);
  const path: TunnelPoint[] = each(source['path'], `${where}.path`, tunnelPoint);
  if (path.length < 2) throw new ContentError(`${where}.path`, 'a tunnel runs between at least two points');
  const roof: TunnelRoof[] = each(source['roof'], `${where}.roof`, tunnelRoof);
  if (roof.length === 0) throw new ContentError(`${where}.roof`, 'a tunnel needs at least one piece of roof');
  return { id: text(source, 'id', where), path, width: positive(source, 'width', where), roof };
}

export function zoneTunnels(value: unknown, where: string): ZoneTunnel[] {
  if (value === undefined) return [];
  return [...byId(each(value, where, zoneTunnel), where).values()];
}
