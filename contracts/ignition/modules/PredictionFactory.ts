import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const PredictionFactoryModule = buildModule("PredictionFactoryModule", (m) => {
  const predictionFactory = m.contract("PredictionFactory");

  return { predictionFactory };
});

export default PredictionFactoryModule;
