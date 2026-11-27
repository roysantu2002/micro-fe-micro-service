export interface Item {
    id: number;
    name: string;
    createdBy: string;
    createdAt: string;
}
export declare function setTokenProvider(fn: () => Promise<string>): void;
export declare const getItems: () => Promise<Item[]>;
export declare const createItem: (name: string) => Promise<Item>;
