/**
 * Minimal ABI for PredictionFactoryUSDC (create, lock, resolve, cancel, read).
 * Status: 0 = Open, 1 = Locked, 2 = Resolved, 3 = Cancelled.
 * Includes custom errors for decoding revert reasons.
 */
export const PREDICTION_FACTORY_ABI = [
  { inputs: [], name: "Unauthorized", type: "error" },
  { inputs: [], name: "InvalidOption", type: "error" },
  { inputs: [], name: "InvalidStatus", type: "error" },
  { inputs: [], name: "InvalidAmount", type: "error" },
  { inputs: [], name: "NoBetToClaim", type: "error" },
  { inputs: [], name: "TransferFailed", type: "error" },
  { inputs: [], name: "PredictionNotFound", type: "error" },
  {
    inputs: [],
    name: "nextPredictionId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "predictionId", type: "uint256" }],
    name: "predictions",
    outputs: [
      { internalType: "uint256", name: "id", type: "uint256" },
      { internalType: "address", name: "streamer", type: "address" },
      { internalType: "string", name: "title", type: "string" },
      { internalType: "string", name: "option1", type: "string" },
      { internalType: "string", name: "option2", type: "string" },
      { internalType: "uint256", name: "totalBetOption1", type: "uint256" },
      { internalType: "uint256", name: "totalBetOption2", type: "uint256" },
      { internalType: "uint8", name: "status", type: "uint8" },
      { internalType: "uint8", name: "winningOption", type: "uint8" },
      { internalType: "uint256", name: "lockTimestamp", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "streamer", type: "address" },
      { internalType: "address", name: "moderator", type: "address" },
    ],
    name: "streamerModerators",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "predictionId", type: "uint256" },
      { internalType: "address", name: "account", type: "address" },
    ],
    name: "canManagePrediction",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "streamer", type: "address" },
      { internalType: "string", name: "title", type: "string" },
      { internalType: "string", name: "option1", type: "string" },
      { internalType: "string", name: "option2", type: "string" },
    ],
    name: "createPrediction",
    outputs: [{ internalType: "uint256", name: "predictionId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "predictionId", type: "uint256" }],
    name: "lockPrediction",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "predictionId", type: "uint256" },
      { internalType: "uint8", name: "winningOption", type: "uint8" },
    ],
    name: "resolvePrediction",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "predictionId", type: "uint256" }],
    name: "cancelPrediction",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "predictionId", type: "uint256" },
      { internalType: "uint8", name: "option", type: "uint8" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "placeBet",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "predictionId", type: "uint256" }],
    name: "claimWinnings",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "predictionId", type: "uint256" },
      { internalType: "address", name: "user", type: "address" },
    ],
    name: "getPayout",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "predictionId", type: "uint256" },
      { internalType: "address", name: "account", type: "address" },
      { internalType: "uint8", name: "option", type: "uint8" },
    ],
    name: "userBets",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "predictionId", type: "uint256" },
      { indexed: true, internalType: "address", name: "streamer", type: "address" },
      { indexed: false, internalType: "string", name: "title", type: "string" },
      { indexed: false, internalType: "string", name: "option1", type: "string" },
      { indexed: false, internalType: "string", name: "option2", type: "string" },
    ],
    name: "PredictionCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "predictionId", type: "uint256" },
      { indexed: true, internalType: "address", name: "user", type: "address" },
      { indexed: false, internalType: "uint8", name: "option", type: "uint8" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "BetPlaced",
    type: "event",
  },
] as const;

export type PredictionStatus = 0 | 1 | 2 | 3; // Open, Locked, Resolved, Cancelled
