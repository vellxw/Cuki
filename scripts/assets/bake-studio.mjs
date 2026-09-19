// Offline asset generation only. The browser does not render or test the native app.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'../..');
const {chromium}=await import(process.env.CUKI_PLAYWRIGHT_MODULE);
const html=`<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script><script type="module">
import * as THREE from 'three';import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
window.bake=async()=>{const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(16,16);document.body.appendChild(renderer.domElement);const room=new RoomEnvironment(),generator=new THREE.PMREMGenerator(renderer);const target=generator.fromScene(room,.035,.1,30,{size:128});const pixels=new Uint16Array(target.width*target.height*4);renderer.readRenderTargetPixels(target,0,0,target.width,target.height,pixels);const error=renderer.getContext().getError();const bytes=new Uint8Array(pixels.buffer);let raw='';for(let i=0;i<bytes.length;i+=32768)raw+=String.fromCharCode(...bytes.subarray(i,i+32768));const result={width:target.width,height:target.height,type:target.texture.type,mapping:target.texture.mapping,format:target.texture.format,flipY:target.texture.flipY,colorSpace:target.texture.colorSpace,error,base64:btoa(raw)};target.dispose();generator.dispose();room.dispose();renderer.dispose();return result};</script>`;
const three=resolve(root,'node_modules/three');
const server=createServer(async(req,res)=>{try{
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
 if(!req.url?.startsWith('/three/')){res.writeHead(404);res.end();return;}
 const path=resolve(three,decodeURIComponent(req.url.slice(7)));
 if(!path.startsWith(three+'/')){res.writeHead(403);res.end();return;}
 res.setHeader('Content-Type',extname(path)==='.js'?'text/javascript':'application/octet-stream');res.end(await readFile(path));
}catch{res.writeHead(404);res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage();
 page.on('console',m=>{if(m.type()==='error')console.error(m.text())});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction('window.bake !== undefined');
 const result=await page.evaluate(()=>window.bake());
 const bytes=Buffer.from(result.base64,'base64');delete result.base64;
 if(result.error!==0||bytes.length!==result.width*result.height*8)throw Error('Invalid half-float framebuffer');
 let nonzero=0;for(let i=0;i<bytes.length;i+=8)if(bytes.readUInt16LE(i)!==0)nonzero++;
 if(nonzero<result.width*result.height*.2)throw Error('Empty or unreadable baked environment');
 const path=resolve(root,'apps/mobile/assets/studio-room-1.2.bin');await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);
 const metadata={...result,source:'Three.js RoomEnvironment, MIT license; original geometric studio with no photographs or fonts',threeVersion:JSON.parse(await readFile(resolve(three,'package.json'),'utf8')).version,parameters:{sigma:.035,near:.1,far:30,cubeSize:128},encoding:'RGBA half-float little-endian, CubeUVReflectionMapping',sha256:createHash('sha256').update(bytes).digest('hex'),byteLength:bytes.length,scope:'Baked reflection lighting asset only; not native rendering evidence'};
 await writeFile(resolve(root,'apps/mobile/assets/studio-room-1.2.json'),JSON.stringify(metadata,null,2)+'\n');
 console.log(JSON.stringify(metadata));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
