declare module 'fuzzy-search' {
  export interface FuzzySearchOptions {
    caseSensitive?: boolean;
    sort?: boolean;
  }
  export default class FuzzySearch<T = Record<string, unknown>> {
    constructor(haystack?: T[], keys?: string[], options?: FuzzySearchOptions);
    haystack: T[];
    keys: string[];
    options: FuzzySearchOptions;
    search(query?: string): T[];
  }
}

declare module 'virtual:uno.css';
