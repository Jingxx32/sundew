export type TodayActivityKey = "notebook" | "tcf-listening" | "tcf-reading" | "writing" | "conjugation";

export type RecommendationSignals = {
  learningMode: "general" | "tcf";
  dueVocabulary: number;
  dueNotebook: number;
  repeatedConjugationIssue: boolean;
  wroteToday: boolean;
  suggestedTcfSkill: "listening" | "reading";
};

export function recommendActivity(signals: RecommendationSignals): TodayActivityKey {
  if (signals.dueVocabulary + signals.dueNotebook > 0) return "notebook";
  if (signals.repeatedConjugationIssue) return "conjugation";
  if (signals.learningMode === "tcf") return `tcf-${signals.suggestedTcfSkill}`;
  if (!signals.wroteToday) return "writing";
  return "conjugation";
}
