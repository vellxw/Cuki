import {configuration} from '../packages/server/config';
import {postgres,embedded,migrate} from '../packages/server/db';
const config=configuration();const db=config.databaseUrl?await postgres(config.databaseUrl):await embedded(config.embeddedPath??'.local/postgres');
try{await migrate(db);console.log('Migraciones aplicadas.');}finally{await db.close();}
