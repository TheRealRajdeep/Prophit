import "dotenv/config";
import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";

const baseSepoliaRpc =
  process.env.BASE_SEPOLIA_RPC_URL ?? "https://base-sepolia-rpc.publicnode.com";

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    baseSepolia: {
      url: baseSepoliaRpc,
      chainId: 84532,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};

export default config;
