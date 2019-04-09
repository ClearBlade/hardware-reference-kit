declare function log(thing: any): void;
interface ErrorFirstCb {
  (err: boolean, data: any): void;
}
interface RequestsObj {
  post: (options: object, cb: ErrorFirstCb) => void;
  get: (options: object, cb: ErrorFirstCb) => void;
}
declare function Requests(): RequestsObj;
