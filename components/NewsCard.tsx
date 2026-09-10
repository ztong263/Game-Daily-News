import type { BriefItem } from "@/lib/brief/schema";
import { categoryLabels as labels } from "@/lib/brief/labels";
export function NewsCard({
  item,
  index,
  current,
}: {
  item: BriefItem;
  index: number;
  current: boolean;
}) {
  return (
    <article
      key={item.id}
      id={item.id}
      className={current ? "story active" : "story"}
    >
      <div className="story-label">
        <span>
          {String(index + 1).padStart(2, "0")} / {labels[item.category]}
        </span>
        {current && <span>当前内容</span>}
      </div>
      <h2>{item.headline}</h2>
      <p>{item.summary}</p>
      <p className="relevance">{item.userRelevance}</p>
      {item.gameRadar && (
        <section className="radar-details" aria-label="游戏推荐依据">
          <p>{item.gameRadar.gameTitle} · {item.gameRadar.developer} · {{released:"已发售",early_access:"抢先体验",demo:"试玩版",announced:"已公布"}[item.gameRadar.status]} · {{play:"值得玩",study:"重点研究",both:"值得玩，也值得研究"}[item.gameRadar.recommendation]}</p>
          {[
            ["怎么玩", item.gameRadar.whatIsIt],
            ["哪里有趣", item.gameRadar.whyFun],
            ["值得研究什么", item.gameRadar.whyStudy],
            ["观察一个问题", item.gameRadar.observeWhilePlaying],
            ["小团队可以借鉴", item.gameRadar.indieTakeaway],
            ["依据与局限", item.gameRadar.evidence],
          ].map(([label,value]) => <p key={label}><strong>{label}</strong> {value}</p>)}
        </section>
      )}
      {item.uncertainty && (
        <p className="uncertainty">需留意：{item.uncertainty}</p>
      )}
      {item.design && (
        <div className="design-chain">
          {[
            ["问题", item.design.problem],
            ["决策", item.design.decision],
            ["行为", item.design.behaviour],
            ["体验", item.design.experience],
            ["启发", item.design.takeaway],
          ].map(([label, value]) => (
            <div key={label}>
              <small>{label}</small>
              <p>{value}</p>
            </div>
          ))}
        </div>
      )}
      {item.workflow && (
        <details>
          <summary>对你的工作流有什么帮助？</summary>
          <p>
            {item.workflow.oldWorkflow} → {item.workflow.newWorkflow}
          </p>
          <p>{item.workflow.improvement}</p>
          <p>限制：{item.workflow.limitations}</p>
          <p>{item.workflow.worthTrying}</p>
        </details>
      )}
      <div className="sources">
        {item.sources.map((source) => (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            key={source.url}
          >
            {source.publisher || source.title}
            <span> ↗</span>
            {source.publishedAt && (
              <small> · {source.publishedAt.slice(0, 10)}</small>
            )}
          </a>
        ))}
      </div>
    </article>
  );
}
