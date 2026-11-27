
    export type RemoteKeys = 'itemsMfe/ItemList';
    type PackageType<T> = T extends 'itemsMfe/ItemList' ? typeof import('itemsMfe/ItemList') :any;