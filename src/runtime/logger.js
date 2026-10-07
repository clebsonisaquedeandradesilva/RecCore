export const useWorkersLogger=()=>async(c,next)=>next();
export const logger={info:console.info,warn:console.warn,error:console.error,debug:()=>{}};
export class WorkersLogger{constructor(){}debug(...a){}info(...a){console.info(...a);}warn(...a){console.warn(...a);}error(...a){console.error(...a);}log(...a){console.log(...a);}}
