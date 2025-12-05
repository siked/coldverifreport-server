declare module 'mammoth' {
  interface ConvertOptions {
    arrayBuffer?: ArrayBuffer;
    buffer?: Buffer;
    styleMap?: string[];
    convertImage?: any;
    [key: string]: any;
  }

  interface ConvertResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }

  namespace images {
    function imgElement(handler: (image: any) => Promise<any>): any;
  }

  export function convertToHtml(
    options: ConvertOptions,
    additionalOptions?: ConvertOptions
  ): Promise<ConvertResult>;
}


