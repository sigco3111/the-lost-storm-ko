export interface TunnelPoint {
  readonly x: number;
  readonly z: number;
}

export interface TunnelRoof {
  readonly prop: string;
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly rotationDegrees: number;
  readonly size: number;
}

export interface ZoneTunnel {
  readonly id: string;
  readonly path: readonly TunnelPoint[];
  readonly width: number;
  readonly roof: readonly TunnelRoof[];
}
