import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const path=resolve(root,'.env');
if(existsSync(path)){console.log('.env ya existe; no se modificó.');process.exit(0);}
mkdirSync(resolve(root,'.local'),{recursive:true,mode:0o700});
const value=`APP_ENV=local\nAUTH_MODE=local\nHOST=127.0.0.1\nPORT=3000\nPUBLIC_ORIGIN=http://127.0.0.1:3000\nLOCAL_AUTH_SECRET=${randomBytes(48).toString('hex')}\nMEDIA_SIGNING_SECRET=${randomBytes(48).toString('hex')}\nMEDIA_DIR=.local/media\nEMBEDDED_DB=.local/postgres\nEXPO_PUBLIC_API_URL=http://127.0.0.1:3000\nEXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:3000\nEXPO_PUBLIC_SUPABASE_ANON_KEY=local-development-not-a-secret\nAI_API_KEY=\nAI_MODEL=\nREVENUECAT_SECRET_KEY=\nREVENUECAT_WEBHOOK_AUTH=\n`;
writeFileSync(path,value,{encoding:'utf8',mode:0o600,flag:'wx'});
console.log('Entorno local creado con secretos nuevos. Correo de prueba: .local/mail. No publicar .env. Para teléfono/emulador configure direcciones accesibles antes de compilar.');
