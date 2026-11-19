export interface HostRules {
  readonly pauseWhenHidden: boolean;
  readonly stillPage: boolean;
}

export const HOST: HostRules = {
  pauseWhenHidden: false,
  stillPage: false,
};
