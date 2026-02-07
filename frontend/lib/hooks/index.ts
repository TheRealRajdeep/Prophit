export { usePlatformBalance } from "./usePlatformBalance";
export { usePlatformWallet } from "./usePlatformWallet";
export { useOngoingPredictions } from "./useOngoingPredictions";
export type { OngoingPredictionItem } from "./useOngoingPredictions";
export {
  usePredictions,
  getPayout,
  getUserBetOutcome,
  getTopScorer,
  getBiddersCount,
  getPredictionStartTime,
  predictionStatusLabel,
  isLive,
  canLock,
  canResolve,
  canCancel,
  checkCanManagePrediction,
} from "./usePredictions";
export type { Prediction, TopScorer, UserBetOutcome } from "./usePredictions";
