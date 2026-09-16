const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(process.env.CLEO_SYNC_SOURCE || require('node:path').join(__dirname, '../src/cloudSync.js'), 'utf8')
  .replace(/import[\s\S]*?from\s+["'][^"']+["'];/g, '').replace(/export /g, '');
const snap = name => ({ cleo_clientes: [{ id: 1, nombre: name }] });
function setup(local, remote, owner = 'A', fail = () => false) {
  const values = new Map(Object.entries(local).map(([k,v]) => [k, JSON.stringify(v)]));
  if (owner) values.set('cleo_cache_owner_user_id', owner);
  let row = remote === null ? null : { data: remote, updated_at: 'v1', tipo_perfil: null };
  let writes = 0;
  const chain = { select(){return this}, eq(){return this}, maybeSingle(){ return Promise.resolve({data:row,error:null}); },
    update(payload){ writes++; row = {...row,...payload,updated_at:'v2'}; return this; },
    insert(payload){writes++;row={...payload,updated_at:'v2'};return this;},
    then(resolve,reject){return Promise.resolve({data:[{updated_at:row.updated_at}],error:null}).then(resolve,reject);} };
  const context = { console:{error(){}}, Blob, Date, JSON, TextEncoder, crypto:require("node:crypto").webcrypto,
    supabase:{from(){return chain;}},
    localStorage:{getItem:k=>values.get(k)??null,setItem(k,v){if(fail(k,v))throw Error('quota');values.set(k,v);},removeItem:k=>values.delete(k)},
    setInterval(){return 1},clearInterval(){},setTimeout,
    window:{addEventListener(){},removeEventListener(){}},document:{addEventListener(){},removeEventListener(){}},
    inicializarDiagnostico(){},registrarSyncExitoso(){},reportarErrorSync(){},reportarConflictoVersion(){} };
  vm.createContext(context); vm.runInContext(source, context);
  return {c:context,values,get writes(){return writes},setRemote(next){row={data:next,updated_at:'v3',tipo_perfil:null}}};
}
test('recarga conserva cambios locales sin enviar y pausa sincronización', async()=>{
 const h=setup(snap('pendiente'),snap('anterior'));
 const r=await h.c.pullUserData('A');
 assert.equal(r.snapshot,null);assert.deepEqual(JSON.parse(h.values.get('cleo_clientes')),snap('pendiente').cleo_clientes);
 const sync=h.c.startCloudSync('A',()=>{},r); assert.equal((await sync.flush()).estado,'conflicto');assert.equal(h.writes,0);sync.stop();
});
test('fallar al respaldar un conflicto no toca datos locales',async()=>{
 const h=setup(snap('pendiente'),snap('remoto'),'A',k=>k==='cleo_conflict_backup');
 await assert.rejects(h.c.pullUserData('A'));assert.equal(JSON.parse(h.values.get('cleo_clientes'))[0].nombre,'pendiente');assert.equal(h.writes,0);
});
test('carga inicial con almacenamiento lleno falla, no devuelve éxito',async()=>{
 const h=setup({},snap('remoto'),'A',k=>k==='cleo_clientes');
 await assert.rejects(h.c.pullUserData('A'));assert.equal(h.writes,0);
});
test('fallo a mitad de carga revierte las escrituras anteriores',async()=>{
 const local=snap('confirmado'),remote={...snap('nuevo'),cleo_ventas:[{id:4}]};
 const h=setup(local,remote,'A',k=>k==='cleo_ventas');await h.c.recordarConfirmado('A',local);
 await assert.rejects(h.c.pullUserData('A'));assert.equal(JSON.parse(h.values.get('cleo_clientes'))[0].nombre,'confirmado');assert.equal(h.values.has('cleo_ventas'),false);
});
test('caché confirmado permite recibir cambios remotos sin falso conflicto',async()=>{
 const local=snap('confirmado'),h=setup(local,snap('nuevo'));await h.c.recordarConfirmado('A',local);
 const r=await h.c.pullUserData('A');assert.equal(r.snapshot.cleo_clientes[0].nombre,'nuevo');assert.equal(h.values.has('cleo_conflict_backup'),false);
});
test('cambiar de cuenta no ofrece datos de la cuenta anterior',async()=>{
 const h=setup(snap('cuenta A'),snap('cuenta B'),'A');
 const r=await h.c.pullUserData('B');assert.equal(r.snapshot.cleo_clientes[0].nombre,'cuenta B');assert.equal(h.values.has('cleo_conflict_backup'),false);
});
test('salir del demo recupera los datos reales',async()=>{
 const h=setup({...snap('demo'),cleo_perfil:{modoDemo:true}},snap('real'));
 const r=await h.c.pullUserData('A');assert.equal(r.snapshot.cleo_clientes[0].nombre,'real');assert.equal(h.values.has('cleo_conflict_backup'),false);
});
test('fallo al elegir nube mantiene el conflicto pendiente',async()=>{
 let blocked=false;const h=setup(snap('pendiente'),snap('remoto'),'A',k=>blocked&&k==='cleo_clientes');
 const r=await h.c.pullUserData('A');const sync=h.c.startCloudSync('A',()=>{},r);blocked=true;
 assert.equal((await sync.resolverConflictoUsarRemoto()).estado,'error');assert.equal(sync.hayConflictoPendiente(),true);
 assert.equal(JSON.parse(h.values.get('cleo_clientes'))[0].nombre,'pendiente');sync.stop();
});
test('elegir nube con éxito no reabre conflicto al recargar',async()=>{
 const h=setup(snap('pendiente'),snap('remoto'));const r=await h.c.pullUserData('A');const sync=h.c.startCloudSync('A',()=>{},r);
 assert.equal((await sync.resolverConflictoUsarRemoto()).estado,'ok');sync.stop();
 assert.equal((await h.c.pullUserData('A')).snapshot.cleo_clientes[0].nombre,'remoto');
});
test('un guardado confirmado deja una referencia para la próxima apertura',async()=>{
 const h=setup(snap('primero'),snap('primero'));const r=await h.c.pullUserData('A');const sync=h.c.startCloudSync('A',()=>{},r);
 h.values.set('cleo_clientes',JSON.stringify(snap('segundo').cleo_clientes));await sync.flush();sync.stop();
 assert.equal(await h.c.cacheConfirmado('A',snap('segundo')),true);
 h.setRemote(snap('tercero'));assert.equal((await h.c.pullUserData('A')).snapshot.cleo_clientes[0].nombre,'tercero');
});
test('el orden de propiedades no produce conflictos',async()=>{
 const h=setup({cleo_perfil:{nombre:'A',tipoPerfil:'servicios'}},{cleo_perfil:{tipoPerfil:'servicios',nombre:'A'}});
 assert.notEqual((await h.c.pullUserData('A')).snapshot,null);assert.equal(h.values.has('cleo_conflict_backup'),false);
});
test('sin fila remota se conserva el caché propio para su primer envío',async()=>{
 const h=setup(snap('pendiente'),null);const r=await h.c.pullUserData('A');
 assert.equal(r.tieneDatos,false);assert.equal(JSON.parse(h.values.get('cleo_clientes'))[0].nombre,'pendiente');
});
test('una estructura remota inválida no reemplaza el caché',async()=>{
 const h=setup(snap('local'),[]);await assert.rejects(h.c.pullUserData('A'));
 assert.equal(JSON.parse(h.values.get('cleo_clientes'))[0].nombre,'local');
});
test('la referencia de sincronización es pequeña y no contiene nombres',async()=>{
 const h=setup(snap('dato privado'),snap('dato privado'));await h.c.pullUserData('A');
 const raw=h.values.get('cleo_sync_confirmado');assert.ok(raw.length<150);assert.equal(raw.includes('dato privado'),false);
});
test('fallar al guardar la huella no descarta las diferencias en la siguiente apertura',async()=>{
 const h=setup(snap('primero'),snap('primero'),'A',k=>k==='cleo_sync_confirmado');await h.c.pullUserData('A');
 h.setRemote(snap('otro dispositivo'));assert.equal((await h.c.pullUserData('A')).snapshot,null);
 assert.equal(JSON.parse(h.values.get('cleo_clientes'))[0].nombre,'primero');
});
test('otra pestaña cambia el caché durante la huella: carga abortada',async()=>{
 const local=snap('confirmado'), h=setup(local,snap('nube nueva'));
 await h.c.recordarConfirmado('A',local);
 const digest=h.c.crypto.subtle.digest.bind(h.c.crypto.subtle);
 h.c.crypto={subtle:{async digest(...args){
   h.values.set('cleo_clientes',JSON.stringify(snap('edición en otra pestaña').cleo_clientes));
   return digest(...args);
 }}};
 await assert.rejects(h.c.pullUserData('A'),/caché cambió/);
 assert.equal(JSON.parse(h.values.get('cleo_clientes'))[0].nombre,'edición en otra pestaña');assert.equal(h.writes,0);
});
test('escritura silenciosamente rechazada no se considera una carga exitosa',async()=>{
 const h=setup({},snap('remoto'));const write=h.c.localStorage.setItem;
 h.c.localStorage.setItem=(k,v)=>{if(k!=='cleo_clientes')write(k,v)};
 await assert.rejects(h.c.pullUserData('A'),/incompleta/);assert.equal(h.writes,0);
});

// Dos navegadores: almacenamiento separado y un servidor compartido que
// aplica de verdad el filtro de versión y la restricción única user_id.
function versionedServer(initial) {
 let row=initial ? {user_id:'A',data:initial,tipo_perfil:null,updated_at:'v1'} : null;
 let version=1;
 const clone=x=>JSON.parse(JSON.stringify(x));
 return {
  get row(){return clone(row)},
  from(){
   let operation='select',payload,filters={};
   const q={select(){return q},eq(k,v){filters[k]=v;return q},
    insert(v){operation='insert';payload=clone(v);return q},
    update(v){operation='update';payload=clone(v);return q},
    maybeSingle(){return Promise.resolve({data:clone(row),error:null})},
    then(resolve,reject){
     let result;
     if(operation==='insert'&&row) result={data:null,error:{code:'23505'}};
     else if(operation==='update'&&(!row||Object.entries(filters).some(([k,v])=>row[k]!==v))) result={data:[],error:null};
     else {row={...row,...payload,updated_at:'v'+(++version)};result={data:[{updated_at:row.updated_at}],error:null};}
     return Promise.resolve(result).then(resolve,reject);
    }};
   return q;
  }
 };
}
test('dos navegadores: el segundo guardado no sobrescribe la nube y conserva su versión local',async()=>{
 const initial=snap('Inicial'),server=versionedServer(initial);
 const a=setup(initial,initial),b=setup(initial,initial);
 a.c.supabase=server;b.c.supabase=server;
 const baseA=await a.c.pullUserData('A'),baseB=await b.c.pullUserData('A');
 const syncA=a.c.startCloudSync('A',()=>{},baseA),syncB=b.c.startCloudSync('A',()=>{},baseB);
 await syncA.flush();await syncB.flush();
 a.values.set('cleo_clientes',JSON.stringify([{id:1,nombre:'Inicial'},{id:2,nombre:'Prueba A'}]));
 assert.equal((await syncA.flush()).estado,'ok');
 b.values.set('cleo_clientes',JSON.stringify([{id:1,nombre:'Inicial'},{id:3,nombre:'Prueba B'}]));
 assert.equal((await syncB.flush()).estado,'conflicto');
 assert.deepEqual(server.row.data.cleo_clientes.map(c=>c.nombre),['Inicial','Prueba A']);
 assert.deepEqual(JSON.parse(b.values.get('cleo_conflict_backup')).snapshot.cleo_clientes.map(c=>c.nombre),['Inicial','Prueba B']);
 assert.equal((await syncB.flush()).estado,'conflicto');
 syncA.stop();syncB.stop();
 // La recarga mantiene el conflicto sin sustituir el caché B con la nube A.
 assert.equal((await b.c.pullUserData('A')).snapshot,null);
 assert.equal(JSON.parse(b.values.get('cleo_clientes'))[1].nombre,'Prueba B');
});
test('dos navegadores con cuenta nueva: segundo INSERT produce conflicto y no reemplaza el primero',async()=>{
 const server=versionedServer(null),a=setup({},null),b=setup({},null);
 a.c.supabase=server;b.c.supabase=server;
 const baseA=await a.c.pullUserData('A'),baseB=await b.c.pullUserData('A');
 const syncA=a.c.startCloudSync('A',()=>{},baseA),syncB=b.c.startCloudSync('A',()=>{},baseB);
 await syncA.flush();await syncB.flush();
 a.values.set('cleo_clientes',JSON.stringify(snap('Prueba A').cleo_clientes));
 b.values.set('cleo_clientes',JSON.stringify(snap('Prueba B').cleo_clientes));
 assert.equal((await syncA.flush()).estado,'ok');assert.equal((await syncB.flush()).estado,'conflicto');
 assert.equal(server.row.data.cleo_clientes[0].nombre,'Prueba A');
 assert.equal(JSON.parse(b.values.get('cleo_conflict_backup')).snapshot.cleo_clientes[0].nombre,'Prueba B');
 syncA.stop();syncB.stop();
});
test('resolver local no publica un respaldo anterior si el caché cambió después del conflicto',async()=>{
 const h=setup(snap('B'),snap('A'));const baseline=await h.c.pullUserData('A');
 const sync=h.c.startCloudSync('A',()=>{},baseline);
 h.values.set('cleo_clientes',JSON.stringify(snap('C posterior').cleo_clientes));
 assert.equal((await sync.resolverConflictoConservarLocal()).estado,'conflicto');
 assert.equal(h.writes,0);assert.equal((await sync.flush()).estado,'conflicto');sync.stop();
});
test('resolver local con caché estable confirma la versión elegida y permite seguir',async()=>{
 const h=setup(snap('B'),snap('A'));const baseline=await h.c.pullUserData('A');
 const sync=h.c.startCloudSync('A',()=>{},baseline);
 assert.equal((await sync.resolverConflictoConservarLocal()).estado,'ok');
 assert.equal(h.writes,1);assert.equal(sync.hayConflictoPendiente(),false);
 assert.equal((await sync.flush()).estado,'nada');sync.stop();
});
test('resolver nube no borra cambios locales que aparecen durante la consulta',async()=>{
 const h=setup(snap('B'),snap('A'));const baseline=await h.c.pullUserData('A');
 const sync=h.c.startCloudSync('A',()=>{},baseline);
 const from=h.c.supabase.from;
 h.c.supabase.from=()=>{const q=from();q.maybeSingle=()=>{
  h.values.set('cleo_clientes',JSON.stringify(snap('C posterior').cleo_clientes));
  return Promise.resolve({data:{data:snap('A'),updated_at:'v2'},error:null});
 };return q;};
 assert.equal((await sync.resolverConflictoUsarRemoto()).estado,'conflicto');
 assert.equal(JSON.parse(h.values.get('cleo_clientes'))[0].nombre,'C posterior');assert.equal(sync.hayConflictoPendiente(),true);sync.stop();
});
