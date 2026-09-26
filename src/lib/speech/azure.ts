import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import type { TurnAssessment } from "@/lib/db/schema";

export type AssessmentResult = { transcript: string } & TurnAssessment;

/**
 * Runs Azure pronunciation assessment on a 16kHz mono PCM16 WAV buffer.
 * `referenceText` set  → scripted assessment (miscue detection on).
 * `referenceText` null → unscripted assessment (Phase 2 dialogue mode).
 * Assessment language is fr-FR (standard French, per spec).
 * recognizeOnceAsync caps at ~30s of speech — fine for per-sentence use.
 */
export async function assessPronunciation(
  wav: Buffer,
  referenceText: string | null,
): Promise<AssessmentResult | null> {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    throw new Error("AZURE_SPEECH_KEY / AZURE_SPEECH_REGION not set");
  }

  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechRecognitionLanguage = "fr-FR";

  const audioConfig = sdk.AudioConfig.fromWavFileInput(wav);
  const pronConfig = new sdk.PronunciationAssessmentConfig(
    referenceText ?? "",
    sdk.PronunciationAssessmentGradingSystem.HundredMark,
    sdk.PronunciationAssessmentGranularity.Phoneme,
    referenceText !== null, // enableMiscue only makes sense with a reference
  );

  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
  pronConfig.applyTo(recognizer);

  const result = await new Promise<sdk.SpeechRecognitionResult>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Speech recognition timed out")), 45_000);
    recognizer.recognizeOnceAsync(
      (value) => { clearTimeout(timeout); resolve(value); },
      (error) => { clearTimeout(timeout); reject(error); },
    );
  }).finally(() => recognizer.close());

  if (result.reason !== sdk.ResultReason.RecognizedSpeech) {
    return null; // no speech detected / canceled
  }

  const pron = sdk.PronunciationAssessmentResult.fromResult(result);
  const detail = JSON.parse(
    result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult),
  );
  type RawPhoneme = { Phoneme: string; PronunciationAssessment?: { AccuracyScore?: number } };
  type RawWord = {
    Word: string;
    PronunciationAssessment?: { AccuracyScore?: number; ErrorType?: string };
    Phonemes?: RawPhoneme[];
  };
  const words = ((detail?.NBest?.[0]?.Words ?? []) as RawWord[]).map((w) => ({
    word: w.Word,
    accuracyScore: w.PronunciationAssessment?.AccuracyScore ?? 0,
    errorType: w.PronunciationAssessment?.ErrorType ?? "None",
    phonemes: (w.Phonemes ?? []).map((p) => ({
      phoneme: p.Phoneme,
      accuracyScore: p.PronunciationAssessment?.AccuracyScore ?? 0,
    })),
  }));

  return {
    transcript: result.text,
    accuracyScore: pron.accuracyScore,
    fluencyScore: pron.fluencyScore,
    completenessScore: pron.completenessScore,
    pronunciationScore: pron.pronunciationScore,
    words,
  };
}
