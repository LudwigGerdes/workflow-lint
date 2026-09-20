// json-source-map@0.6.1 ships no type declarations and has no @types package.
declare module 'json-source-map' {
  export interface JsonPointerLocation {
    line: number;
    column: number;
    pos: number;
  }
  export interface JsonPointer {
    key?: JsonPointerLocation;
    keyEnd?: JsonPointerLocation;
    value: JsonPointerLocation;
    valueEnd: JsonPointerLocation;
  }
  export function parse(text: string): { data: unknown; pointers: Record<string, JsonPointer> };
}
