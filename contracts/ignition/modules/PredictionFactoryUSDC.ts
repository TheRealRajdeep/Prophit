import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/** USDC on Base Sepolia */
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const PredictionFactoryUSDCModule = buildModule("PredictionFactoryUSDCModule", (m) => {
  const usdc = m.getParameter("usdc", USDC_BASE_SEPOLIA);
  const predictionFactory = m.contract("PredictionFactoryUSDC", [usdc]);
  return { predictionFactory };
});

export default PredictionFactoryUSDCModule;
