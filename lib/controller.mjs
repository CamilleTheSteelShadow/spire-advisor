import { normalize, choices, heuristic, shopReady, fingerprint, notificationConclusion, cardSelection, cardSelectionKey } from './state.mjs';
import {mapNotification} from './map-notification.mjs';

function eventFinished(state){
  if(state?.room_context?.is_event_room&&state.room_context.available===true)return state.room_context.is_finished===true;
  const options=(state?.event?.options??[]).filter(o=>!o.was_chosen&&!o.is_locked&&o.enabled!==false);
  return state?.event?.is_finished===true||(options.length>0&&options.every(o=>o.is_proceed===true));
}

export class Controller {
  constructor({analyze,record=async()=>{},notify=async()=>{}}) {
    this.analyze=analyze; this.record=record; this.state=null; this.advice=null; this.error=null; this.busy=false;
    this.mode='demo'; this.connected=false; this.auto=false; this.epoch=0; this.pending=null; this.cache=new Map(); this.lastMap=null;
    this.viewingMap=false; this.previewPosition=null;
    this.notify=notify;
    this.analysisAutomatic=false;
    this.autoVisits=new Set();this.viewingUpgrade=false;this.viewingDeck=false;this.notificationId=null;this.jobSerial=0;
  }
  invalidate() {
    if(this.busy&&this.notificationId){const id=this.notificationId;void Promise.resolve().then(()=>this.notify('cancel','局面已变化，本次分析已中断。',id)).catch(()=>{});}
    this.epoch++; this.pending?.abort(); this.pending=null; this.busy=false; this.advice=null; this.error=null;
    this.viewingMap=false; this.previewPosition=null;
    this.viewingUpgrade=false;this.viewingDeck=false;this.notificationId=null;
  }
  set(raw,source) {
    const next=normalize(raw,source);
    if(['menu','game_over'].includes(next.kind)||(this.state&&Number(next.run.floor)<Number(this.state.run.floor)))this.autoVisits.clear();
    const sameRoom=source==='live'&&this.state?.source===source&&fingerprint(next.run)===fingerprint(this.state.run)&&fingerprint(next.player)===fingerprint(this.state.player);
    const deckView=next.kind==='overlay'&&/deck/i.test(next.overlay?.screen_type??'');
    const upgradeView=next.kind==='card_select'&&next.card_select?.screen_type==='upgrade'&&this.state?.kind==='rest_site';
    if(sameRoom&&(deckView||upgradeView)&&['map','rest_site','shop','event','card_reward','card_select'].includes(this.state?.kind)){
      this.viewingDeck=deckView;this.viewingUpgrade=upgradeView;return false;
    }
    this.viewingDeck=false;this.viewingUpgrade=false;
    const rewardPending=next.kind==='map'&&(next.room_context?.card_reward_pending===true||next.room_context?.reward_state_available===false);
    if(sameRoom&&this.state?.kind==='card_reward'&&rewardPending){
      this.viewingMap=true;this.lastMap={act:next.run.act,map:next.map};return false;
    }
    const eventPreview=next.kind==='map'&&(next.room_context?.is_event_room===true?next.room_context.is_finished!==true:!next.room_context&&!eventFinished(this.state));
    if(sameRoom&&(this.state?.kind==='event'||cardSelection(this.state??{}))&&eventPreview){
      this.viewingMap=true;this.lastMap={act:next.run.act,map:next.map};return false;
    }
    // The bridge reports a map overlay as a new state_type even while the
    // player remains in the unresolved rest room. Retain only an existing AI
    // analysis; never use this snapshot to start another request from the map.
    const position=next.map?.current_position;
    if(source==='live'&&next.source===this.state?.source&&next.kind==='map'&&this.state?.kind==='rest_site'&&this.state.rest_site?.can_proceed!==true&&
       (this.busy||this.advice?.engine==='ai'||(this.viewingMap&&this.error))&&Number.isFinite(next.run.floor)&&
       fingerprint(next.run)===fingerprint(this.state.run)&&fingerprint(next.player)===fingerprint(this.state.player)&&
       /^restsite$/i.test(position?.type??'')&&Number.isFinite(position?.col)&&Number.isFinite(position?.row)&&
       (!this.previewPosition||fingerprint(position)===fingerprint(this.previewPosition))){
      this.viewingMap=true;this.previewPosition=position;
      this.lastMap={act:next.run.act,map:next.map};
      return false;
    }
    this.viewingMap=false;
    if(sameRoom&&cardSelectionKey(next)&&cardSelectionKey(next)===cardSelectionKey(this.state))return false;
    if(next.id===this.state?.id) return false;
    this.invalidate(); this.state=next;
    if(next.kind==='map') this.lastMap={act:next.run.act,map:next.map};
    if(this.lastMap?.act!==next.run.act) this.lastMap=null;
    return true;
  }
  disconnect(message) {
    this.invalidate(); this.state=null; this.connected=false; this.error=message;
  }
  supported() { return !this.viewingMap && !this.viewingUpgrade && !this.viewingDeck && this.state && this.state.player.deck_available && shopReady(this.state) && ['map','shop','card_reward','event','rest_site','card_select'].includes(this.state.kind) && (choices(this.state).length>0 || this.state.kind==='shop'); }
  visitKey(){
    const s=this.state;if(!s||!['map','rest_site','shop','event','card_reward'].includes(s.kind)&&!cardSelection(s))return null;
    return fingerprint({source:s.source,run:s.run,kind:s.kind,position:s.kind==='map'?s.map?.current_position:null,decision:s.kind==='card_reward'?s.card_reward:s.kind==='event'?s.event:s.kind==='card_select'?cardSelectionKey(s):null});
  }
  hasRouteChoice(){return this.state?.kind!=='map'||new Set((this.state.map?.next_options??[]).filter(n=>Number.isInteger(n.col)&&Number.isInteger(n.row)).map(n=>`${n.col},${n.row}`)).size>1;}
  eventMapPreview(){const s=this.state,c=s?.room_context;return s?.kind==='map'&&(c?.available===false||c?.card_reward_pending===true||c?.reward_state_available===false||(c?.is_event_room===true&&c.is_finished!==true));}
  autoReady(){const key=this.visitKey();return this.auto&&!this.eventMapPreview()&&!(this.state?.kind==='event'&&eventFinished(this.state))&&this.hasRouteChoice()&&this.supported()&&!this.viewingDeck&&!this.viewingUpgrade&&!this.busy&&key&&!this.autoVisits.has(key);}
  async recommend(useAI=true,{automatic=false}={}) {
    if(!this.supported()||this.viewingDeck||this.viewingUpgrade) return;
    if(automatic&&(!this.hasRouteChoice()||this.eventMapPreview()||(this.state?.kind==='event'&&eventFinished(this.state))))return;
    const state=this.state, epoch=this.epoch;
    if(this.busy) return;
    if(useAI&&this.visitKey()){this.autoVisits.add(this.visitKey());if(this.autoVisits.size>256)this.autoVisits.delete(this.autoVisits.values().next().value);}
    if(useAI && this.cache.has(state.id)) {this.advice=this.cache.get(state.id);this.error=null;return;}
    this.pending=new AbortController(); this.busy=true; this.error=null;
    this.analysisAutomatic=useAI&&automatic;
    const notificationId=`${Date.now()}-${++this.jobSerial}`;this.notificationId=useAI?notificationId:null;
    if(useAI)void Promise.resolve().then(()=>{if(epoch===this.epoch)return this.notify('start',`${automatic?'自动 ':''}AI 分析中，请稍候……`,notificationId);}).catch(()=>{});
    try {
      const advice=useAI?await this.analyze(state,{signal:this.pending.signal,historyMap:this.lastMap}):heuristic(state);
      if(epoch!==this.epoch) return;
      this.advice={...advice,state_id:state.id,at:new Date().toISOString()};
      if(useAI) {this.cache.set(state.id,this.advice);if(this.cache.size>100)this.cache.delete(this.cache.keys().next().value);}
      try {await this.record({at:this.advice.at,state,advice:this.advice});} catch {this.error='建议已生成，但本地记录保存失败。';}
      if(useAI&&epoch===this.epoch)void Promise.resolve().then(()=>{if(epoch===this.epoch){const view=mapNotification(state,this.advice);return this.notify('success',view?.message??notificationConclusion(this.advice,state),notificationId,view?.map??null);}}).catch(()=>{});
    } catch(e) {if(epoch===this.epoch){this.error=e.name==='AbortError'?'分析已取消。':e.message;if(useAI)void Promise.resolve().then(()=>{if(epoch===this.epoch)return this.notify(e.name==='AbortError'?'cancel':'error',this.error,notificationId);}).catch(()=>{});}}
    finally {if(epoch===this.epoch){this.busy=false;this.pending=null;}}
  }
}
