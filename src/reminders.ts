import {localDate,minutes,type Settings} from './shared';
export class ReminderClock {
  last:number;delivered=new Set<string>();date='';
  constructor(now=new Date()){this.last=now.getTime();}
  resume(now=new Date()){this.last=now.getTime();}
  tick(now:Date,s:Settings):('water'|'evening')[]{
    const previous=this.last;this.last=now.getTime();const date=localDate(now);
    if(this.date!==date){this.date=date;this.delivered.clear();}
    if(!s.remindersEnabled||s.pausedDate===date||this.last-previous>75000||this.last<=previous||Math.floor(previous/60000)===Math.floor(this.last/60000))return [];
    const minute=now.getHours()*60+now.getMinutes();const result:('water'|'evening')[]=[];
    if(minute>=minutes(s.reminderStart)&&minute<minutes(s.reminderEnd)&&(minute-minutes(s.reminderStart))%s.reminderInterval===0)result.push('water');
    if(minute===minutes(s.eveningTime))result.push('evening');
    return result.filter(kind=>{const key=`${kind}:${minute}`;if(this.delivered.has(key))return false;this.delivered.add(key);return true;});
  }
}
