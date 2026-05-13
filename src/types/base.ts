export type HumanPathType = 'bezier' | 'arc' | 'random' | 'linear';

export interface HumanConfig {
  enabled: boolean;
  pathType: HumanPathType;
}

export type DiffScope = number | 'full' | string;

export interface BaseCommand {
  id: string;
  action: string;
}
