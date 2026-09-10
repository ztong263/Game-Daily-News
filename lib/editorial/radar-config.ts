// Editorial preferences live here rather than in the player or presentation layer.
export const radarConfig = {
  maxPicks: 2,
  minimumWeightedScore: 0.65,
  minimumLearning: 3,
  minimumTransferability: 3,
  interests: ["游戏与关卡设计", "系统交互", "平台跳跃", "独立开发"],
  weights: { learning: 4, transferability: 4, playInterest: 3, novelty: 3, reception: 2, relevance: 3 },
};
