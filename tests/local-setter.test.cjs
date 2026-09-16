const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const file=fs.readFileSync(require('node:path').join(__dirname,'../src/CLEO.jsx'),'utf8');
const guardSource=fs.readFileSync(require('node:path').join(__dirname,'../src/localWriteGuard.js'),'utf8').replace(/export /g,'');
const source=file.slice(file.indexOf('function crearSetterPersistente('),file.indexOf('export default function CLEO('));
function setup(fail=false){
 const values=new Map();const alerts=[];
 const ctx={console:{error(){}},flushSync:fn=>fn(),localStorage:{getItem:k=>values.get(k)??null,removeItem:k=>values.delete(k),setItem(k,v){if(fail)throw Error('quota');values.set(k,v)}},
 tamanoAproxSnapshotStorage:()=>0,LIMITE_AVISO_ALMACENAMIENTO_BYTES:100000,MSG_ALMACENAMIENTO_LLENO:'Sin espacio',
 alert:m=>alerts.push(m),reportarErrorAlmacenamiento(){},EsErrorControladoCleo:m=>Error(m),avisoAlmacenamientoRef:{current:null}};
 vm.createContext(ctx);vm.runInContext(guardSource+"\n"+source,ctx);
 return {ctx,values,alerts};
}
test('sin espacio, el setter mantiene estado y almacenamiento y lanza un error',()=>{
 const h=setup(true);let state=[{id:1}];h.values.set('cleo_clientes',JSON.stringify(state));
 const save=h.ctx.crearSetterPersistente(fn=>{state=fn(state)},'cleo_clientes',h.ctx.createLocalWriteGuard(h.ctx.localStorage));
 assert.throws(()=>save([{id:1},{id:2}]),/cuota/);
 assert.deepEqual(state,[{id:1}]);assert.deepEqual(JSON.parse(h.values.get('cleo_clientes')),[{id:1}]);assert.equal(h.alerts.length,1);
});
test('una segunda pestaña obsoleta no sobrescribe al primer guardado ni cierra el formulario',()=>{
 const h=setup();let tabA=[{id:1}], tabB=[{id:1}];
 h.values.set('cleo_clientes',JSON.stringify(tabA));
 const guardA=h.ctx.createLocalWriteGuard(h.ctx.localStorage),guardB=h.ctx.createLocalWriteGuard(h.ctx.localStorage);
 const saveA=h.ctx.crearSetterPersistente(fn=>{tabA=fn(tabA)},'cleo_clientes',guardA);
 const saveB=h.ctx.crearSetterPersistente(fn=>{tabB=fn(tabB)},'cleo_clientes',guardB);
 saveA([...tabA,{id:2}]);
 let formOpen=true;const draft={nombre:'pendiente'};
 assert.throws(()=>{saveB([...tabB,{id:3}]);formOpen=false;draft.nombre='';},/pestana/);
 assert.deepEqual(JSON.parse(h.values.get('cleo_clientes')),[{id:1},{id:2}]);
 assert.deepEqual(tabB,[{id:1}]);assert.equal(formOpen,true);assert.equal(draft.nombre,'pendiente');
});
test('cambios consecutivos propios y transformaciones iniciales no se bloquean',()=>{
 const h=setup();h.values.set('cleo_clientes',JSON.stringify([{id:1}]));
 const guard=h.ctx.createLocalWriteGuard(h.ctx.localStorage);let state=[{id:1,normalizado:true}];
 const save=h.ctx.crearSetterPersistente(fn=>{state=fn(state)},'cleo_clientes',guard);
 save(prev=>[...prev,{id:2}]);save(prev=>[...prev,{id:3}]);
 assert.equal(state.length,3);assert.equal(state[0].normalizado,true);assert.equal(h.alerts.length,0);
});
test('un cambio externo de otra colección bloquea la operación antes de escribir',()=>{
 const h=setup();const guard=h.ctx.createLocalWriteGuard(h.ctx.localStorage);let state=[];
 const save=h.ctx.crearSetterPersistente(fn=>{state=fn(state)},'cleo_ventas',guard);
 h.values.set('cleo_clientes','[{"id":4}]');
 assert.throws(()=>save([{id:1}]),/pestana/);assert.equal(h.values.has('cleo_ventas'),false);
});
test('cambio de cuenta bloquea escrituras de una interfaz anterior',()=>{
 const h=setup();h.values.set('cleo_cache_owner_user_id','A');const guard=h.ctx.createLocalWriteGuard(h.ctx.localStorage);
 h.values.set('cleo_cache_owner_user_id','B');
 assert.throws(()=>guard.write('cleo_perfil','{}'),/otra pestaña/);assert.equal(h.values.has('cleo_perfil'),false);
});
test('una interfaz recién montada puede continuar con los datos actuales',()=>{
 const h=setup();const stale=h.ctx.createLocalWriteGuard(h.ctx.localStorage);
 h.values.set('cleo_clientes','[{"id":1}]');assert.throws(()=>stale.write('cleo_clientes','[]'));
 const fresh=h.ctx.createLocalWriteGuard(h.ctx.localStorage);fresh.write('cleo_clientes','[{"id":1},{"id":2}]');
 assert.equal(JSON.parse(h.values.get('cleo_clientes')).length,2);
});
test('perfil obsoleto conserva el formulario y no escribe ninguno de sus campos',()=>{
 const h=setup();h.values.set('cleo_perfil','{"nombre":"antes"}');
 h.ctx.writeGuard=h.ctx.createLocalWriteGuard(h.ctx.localStorage);
 h.ctx.setPerfilRaw=()=>{throw Error('no debe actualizar estado')};h.ctx.setFormPerfil=()=>{throw Error('no debe cerrar formulario')};
 const start=file.indexOf('  function setPerfil(v){');const end=file.indexOf('  // Respaldo de los datos reales',start);
 vm.runInContext(file.slice(start,end),h.ctx);
 h.values.set('cleo_perfil','{"nombre":"otra pestaña"}');
 assert.throws(()=>h.ctx.setPerfil({nombre:'obsoleto',tipoPerfil:'servicios'}));
 assert.equal(JSON.parse(h.values.get('cleo_perfil')).nombre,'otra pestaña');assert.equal(h.values.has('cleo_tipo_perfil'),false);
 assert.match(h.alerts[0],/otra pestaña/);
});

test('aviso entre pestañas refleja datos actuales, incluso eventos retrasados y clear',()=>{
 const h=setup();h.values.set('cleo_clientes','[{"id":1}]');
 h.ctx.writeGuard=h.ctx.createLocalWriteGuard(h.ctx.localStorage);
 let warning=false;h.ctx.setOtraPestanaActiva=value=>{warning=value};
 const start=file.indexOf('    function onStorage(ev){');
 const end=file.indexOf('    window.addEventListener("storage",onStorage);',start);
 vm.runInContext(file.slice(start,end),h.ctx);
 const event={storageArea:h.ctx.localStorage,key:'cleo_clientes'};
 h.ctx.onStorage(event);assert.equal(warning,false);
 h.values.set('cleo_clientes','[{"id":2}]');h.ctx.onStorage(event);assert.equal(warning,true);
 h.values.set('cleo_clientes','[{"id":1}]');h.ctx.onStorage(event);assert.equal(warning,false);
 h.values.clear();h.ctx.onStorage({storageArea:h.ctx.localStorage,key:null});assert.equal(warning,true);
});
