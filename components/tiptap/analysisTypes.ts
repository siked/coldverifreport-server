export type AnalysisTableType = 'deviceAnalysis' | 'terminalBinding' | 'intervalDuration' | 'certificate';

export type DeviceAnalysisField = 'deviceId' | 'max' | 'min' | 'avg' | 'range';

export interface DeviceAnalysisConfig {
  tableType: 'deviceAnalysis';
  dataType: 'temperature' | 'humidity';
  locationTagIds: string[];
  startTagId?: string;
  endTagId?: string;
  fields: DeviceAnalysisField[];
  searchKeyword?: string;
  maxColor?: string;
  minColor?: string;
}

export interface TerminalBindingConfig {
  tableType: 'terminalBinding';
  dataType: 'temperature' | 'humidity';
  terminalTagId?: string;
  validationTagId?: string;
  startTagId?: string;
  endTagId?: string;
  searchKeyword?: string;
}

export interface IntervalDurationConfig {
  tableType: 'intervalDuration';
  dataType: 'temperature' | 'humidity';
  locationTagIds: string[];
  startTagId?: string;
  endTagId?: string;
  upperLimit?: string;
  lowerLimit?: string;
  maxRows: number;
}

export type CertificateAnalysisField =
  | 'layoutNumber'
  | 'locationTag'
  | 'deviceNumber'
  | 'certificateNumber'
  | 'issueDate'
  | 'expiryDate'
  | 'validity';

export interface CertificateAnalysisConfig {
  tableType: 'certificate';
  validationTagIds: string[];
  certificateYear: string;
  fields: CertificateAnalysisField[];
}

export type AnalysisTableConfig =
  | DeviceAnalysisConfig
  | TerminalBindingConfig
  | IntervalDurationConfig
  | CertificateAnalysisConfig;

