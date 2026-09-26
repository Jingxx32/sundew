export type TodayActivityKey = "vocabulary" | "tcf-listening" | "tcf-reading" | "writing" | "conjugation";

export type RecommendationSignals = {
  learningMode: "general" | "tcf";
  dueVocabulary: number;
  repeatedConjugationIssue: boolean;
  wroteToday: boolean;
  suggestedTcfSkill: "listening" | "reading";
};

export function recommendActivity(signals: RecommendationSignals): TodayActivityKey {
  if (signals.dueVocabulary > 0) return "vocabulary";
  if (signals.repeatedConjugationIssue) return "conjugation";
  if (signals.learningMode === "tcf") return `tcf-${signals.suggestedTcfSkill}`;
  if (!signals.wroteToday) return "writing";
  return "conjugation";
}
