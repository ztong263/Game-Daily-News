import {z} from "zod";
import {cloudFailure} from "./errors";
const reasons:Record<string,string>={
 UNCERTAIN_RESPONSE_START:"上次模型请求是否成功尚不确定，已停止自动重发。手动重新生成会启动新任务，可能产生新的费用。",
 GENERATION_EXPIRED:"生成任务已超过有效期，请重新生成。",
 "No traceable sources":"本次检索没有取得可核验的新闻来源，未发布早报。",
 "No qualified candidates":"本次候选经分类筛选和历史去重后，没有符合要求的新闻。",
 "Research response incomplete":"新闻检索未完整结束，未发布早报。",
 "Candidate response incomplete":"新闻筛选未完整结束，未发布早报。",
 "Editorial response incomplete":"早报撰写未完整结束，未发布早报。",
 "Draft violates editorial preferences":"生成内容不符合当前分类设置，未发布早报。",
 "Game Radar draft did not match a verified selected candidate":"游戏推荐未通过来源一致性核验，未发布早报。",
 "Story already published in another brief":"发现与历史早报重复的新闻，未发布本次结果。",
};
export function generationError(error:unknown){
 if(error instanceof z.ZodError)return "生成内容未通过早报格式校验，未发布早报。";
 if(error instanceof SyntaxError)return "模型返回的内容不是有效 JSON，未发布早报。";
 return error instanceof Error&&reasons[error.message]||cloudFailure(error).error;
}
