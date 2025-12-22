'use client';

import type { TemplateTag } from '../TemplateTagList';

export type TagFunctionType =
  | 'tempReachUpper'
  | 'tempReachLower'
  | 'humidityReachUpper'
  | 'humidityReachLower'
  | 'tempExceedUpper'
  | 'tempExceedLower'
  | 'humidityExceedUpper'
  | 'humidityExceedLower'
  | 'maxTemp'
  | 'minTemp'
  | 'avgTemp'
  | 'maxHumidity'
  | 'minHumidity'
  | 'avgHumidity'
  | 'maxTempLocation'
  | 'minTempLocation'
  | 'centerPointTempDeviation'
  | 'tempUniformity'
  | 'centerPointTempFluctuation'
  | 'tempVariationRangeSum'
  | 'tempFirstReachUpperTime'
  | 'tempFirstReachLowerTime'
  | 'tempAvgDeviation'
  | 'tempUniformityMax'
  | 'tempUniformityMin'
  | 'tempUniformityValue'
  | 'tempMaxTime'
  | 'tempMinTime'
  | 'powerConsumptionRate'
  | 'maxPowerUsageDuration'
  | 'avgCoolingRate'
  | 'deviceTimePointTemp'
  | 'maxTempDiffAtSameTime'
  | 'maxTempDiffTimePoint'
  | 'tempFluctuation'
  | 'tempUniformityAverage';

export interface TagFunctionConfig {
  functionType: TagFunctionType;
  locationTagIds: string[];
  startTagId?: string;
  endTagId?: string;
  threshold?: number;
  centerPointTagId?: string;
  maxTempTagId?: string;
  minTempTagId?: string;
  maxTemp?: number;
  minTemp?: number;
  startPowerTagId?: string;
  endPowerTagId?: string;
  timeTagId?: string;
  decimalPlaces?: number;
  lastRunAt?: string;
  lastMessage?: string;
  lastStatus?: TagFunctionStatus;
  lastResult?: string | number;
}

export type TagFunctionStatus = 'idle' | 'running' | 'success' | 'error';

export interface TagFunctionHookParams {
  tag: TemplateTag;
  allTags: TemplateTag[];
  taskId?: string | null;
  onApply: (tagId: string, payload: Partial<TemplateTag>) => void;
}

