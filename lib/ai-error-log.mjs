import {mkdir,appendFile,stat,rename,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';

export async function createAIErrorLogger(directory,{maxBytes=2000000,maxFiles=14}={}){
  await mkdir(directory,{recursive:true});let queue=Promise.resolve();
  return record=>{
    const job=queue.then(async()=>{
      const date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
      const file=join(directory,`ai-errors-${date}.jsonl`);
      let size=0;try{size=(await stat(file)).size;}catch(e){if(e.code!=='ENOENT')throw e;}
      if(size>=maxBytes){await rm(file+'.previous',{force:true});await rename(file,file+'.previous');}
      // Record only explicitly allowed diagnostic fields, never request/response bodies.
      const fields=['at','request_id','endpoint','model','scene','stage','http_status','content_type','finish_reason','elapsed_ms','error_type','message','diagnostics'];
      const safe=Object.fromEntries(fields.filter(k=>record[k]!==undefined).map(k=>[k,record[k]]));
      await appendFile(file,JSON.stringify(safe)+'\n',{mode:0o600});
      const files=(await readdir(directory)).filter(n=>/^ai-errors-\d{4}-\d{2}-\d{2}\.jsonl(?:\.previous)?$/.test(n)).sort().reverse();
      for(const name of files.slice(maxFiles))await rm(join(directory,name),{force:true});
    });queue=job.catch(()=>{});return job;
  };
}
