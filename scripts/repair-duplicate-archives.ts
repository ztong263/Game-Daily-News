import {readFile,writeFile,copyFile,rename} from "node:fs/promises";
import {briefSchema} from "../lib/brief/schema";
import {citationKey} from "../lib/brief/source-url";
async function main(){
 const older=briefSchema.parse(JSON.parse(await readFile("data/2026-09-09.json","utf8")).brief);
 const file="data/2026-09-10.json";
 const job=JSON.parse(await readFile(file,"utf8"));const brief=briefSchema.parse(job.brief);
 const urls=new Set(older.items.flatMap(i=>i.sources.map(s=>citationKey(s.url))));
 const removed=brief.items.filter(i=>i.sources.some(s=>urls.has(citationKey(s.url))));
 if(!removed.length)return;
 brief.items=brief.items.filter(i=>!removed.some(r=>r.id===i.id));
 brief.todaysSignal={text:"今日观察｜分析：Warlock案例和双牌组试玩雷达，都值得从玩家的实际选择出发观察：意外路线是否带来了有趣的解法，探索阶段的准备是否真正改变了战斗。对小团队，可以先挑一个关键行为做小范围试玩，再决定是否增加更多机制。这是设计实践建议，不是行业趋势结论。",itemIds:["warlock-emergent-routes","shroom-and-gloom-demo"]};
 brief.editorNote="本期保留4条内容。暴雪工会合同与同步试玩方法已收录于9月9日，本期不再重复。";
 brief.version=crypto.randomUUID();
 briefSchema.parse(brief);
 await copyFile(file,"data/2026-09-10.before-dedup-"+Date.now()+".json");
 const temp=file+".tmp";await writeFile(temp,JSON.stringify({...job,brief,updatedAt:Date.now()}));await rename(temp,file);
 console.log(JSON.stringify({removed:removed.map(i=>i.headline),remaining:brief.items.length}));
}
void main();
