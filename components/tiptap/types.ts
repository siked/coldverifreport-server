export type HeadingItem = {
  id: string;
  level: 1 | 2 | 3;
  text: string;
  pos: number;
  endPos: number;
};

export interface ApiFormState {
  name: string;
  url: string;
  method: 'GET' | 'POST';
  headers: string;
  body: string;
  dataPath: string;
}

export type ApiTestResult = { success: boolean; value?: string; message: string } | null;

