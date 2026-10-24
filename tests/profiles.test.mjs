import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {loadProfiles} from '../lib/profiles.mjs';
async function path(){const dir=join(process.cwd(),'work');await mkdir(dir,{recursive:true});return join(await mkdtemp(join(dir,'profile-test-')),'config.local.json');}
const input=(name,key='')=>({profileId:'',name,baseUrl:'https://provider.example/v1',model:name,apiKey:key});
test('旧单配置无损迁移，新增配置不继承原密钥，切换和重启保留选择',async()=>{
  const file=await path(),legacy={baseUrl:'https://old.example/v1',model:'old-model',apiKey:'old-test-secret',jsonMode:false};await writeFile(file,JSON.stringify(legacy));
  const store=await loadProfiles(file);assert.equal(store.active().apiKey,legacy.apiKey);assert.equal(store.publicConfig().hasKey,true);
  const newConfig=await store.save(input('second'));assert.equal(store.active().apiKey,'');const second=newConfig.activeId;
  await store.activate('legacy');assert.equal(store.active().apiKey,legacy.apiKey);assert.equal(store.active().jsonMode,false);
  await store.save({profileId:'legacy',name:'renamed',baseUrl:legacy.baseUrl,model:'edited',apiKey:'',jsonMode:false});assert.equal(store.active().apiKey,legacy.apiKey);
  await store.activate(second);const restored=await loadProfiles(file);assert.equal(restored.publicConfig().activeId,second);assert.equal(restored.publicConfig().profiles.length,2);
  assert.ok(!JSON.stringify(restored.publicConfig()).includes(legacy.apiKey));assert.ok(!(await readFile(file,'utf8')).includes('undefined'));
});
test('并发保存不丢失配置，密钥更新及清除仅作用于指定配置',async()=>{
  const store=await loadProfiles(await path());await Promise.all([store.save(input('one','test-one')),store.save(input('two','test-two'))]);
  const all=store.publicConfig().profiles;assert.equal(all.length,3);const one=all.find(p=>p.name==='one'),two=all.find(p=>p.name==='two');
  await store.save({...input('one'),profileId:one.id,clearKey:true});assert.equal(store.active().apiKey,'');await store.activate(two.id);assert.equal(store.active().apiKey,'test-two');
  assert.ok(!JSON.stringify(store.publicConfig()).includes('test-two'));
});
test('无效配置或未知选择不覆盖已经保存的配置',async()=>{
  const file=await path(),store=await loadProfiles(file);await store.save(input('valid','test-secret'));const before=await readFile(file,'utf8');
  await assert.rejects(()=>store.save({...input('bad'),baseUrl:'http://remote.example/v1'}),/HTTPS/);await assert.rejects(()=>store.activate('missing'),/不存在/);
  await assert.rejects(()=>store.save({...input('bad'),profileId:'missing'}),/不存在/);assert.equal(await readFile(file,'utf8'),before);
});
