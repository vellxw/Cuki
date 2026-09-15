import { DatabaseSync } from 'node:sqlite';
import type { SQLDriver,SQLConnection,SqlValue } from '../../packages/core/repository';
export function sqlite(path=':memory:'){
 const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;');let tail=Promise.resolve();
 const tx:SQLConnection={async exec(sql,values=[]){if(values.length)db.prepare(sql).run(...values);else db.exec(sql);},async all<T>(sql:string,values:SqlValue[]=[]){return db.prepare(sql).all(...values) as T[];}};
 const driver:SQLDriver={...tx,transaction<T>(fn:(c:SQLConnection)=>Promise<T>){let done!:()=>void;const old=tail;tail=new Promise<void>(r=>done=r);return(async()=>{await old;db.exec('BEGIN IMMEDIATE');try{const value=await fn(tx);db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}finally{done();}})();}};
 return{driver,close:()=>db.close(),db};
}
