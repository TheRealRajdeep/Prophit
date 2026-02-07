# Deploy PredictionFactoryUSDC (USDC betting)

The frontend uses USDC for prediction betting. Deploy the new contract and update the address:

1. Set `PRIVATE_KEY` in `contracts/.env` (deployer wallet with Base Sepolia ETH for gas)
2. Run: `npx hardhat ignition deploy ignition/modules/PredictionFactoryUSDC.ts --network baseSepolia`
3. Copy the deployed address from the output
4. Update `frontend/lib/constants.ts`: set `PREDICTION_FACTORY_ADDRESS` to the new address

Note: The old ETH contract will be replaced. Streamers must create new predictions on the USDC contract.
