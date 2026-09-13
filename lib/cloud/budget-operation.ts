import {AsyncLocalStorage} from "node:async_hooks";
export type Operation={id:string;kind:"generation"|"playback"|"question"};
export const budgetOperation=new AsyncLocalStorage<Operation>();
