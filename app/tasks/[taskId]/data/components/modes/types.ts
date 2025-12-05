import type { TemperatureHumidityData } from '../../types';

export type ChartMode = 'basic' | 'drag' | 'magicPen';

export interface AlertState {
  isOpen: boolean;
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
}

export interface CopiedData {
  data: Record<string, TemperatureHumidityData[]>;
  copiedDeviceId: string | null;
}

export interface SelectionRange {
  start: number;
  end: number;
}

export interface ContextMenuState {
  x: number;
  y: number;
  targetDeviceId: string | null;
  targetTimestamp: number;
  isSelectionArea: boolean;
}

export interface ChartRange {
  min: number;
  max: number;
}

