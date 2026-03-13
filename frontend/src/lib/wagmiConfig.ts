import { http } from "@wagmi/core";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { sepolia, hardhat } from "@reown/appkit/networks";

export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "";

export const networks = [sepolia, hardhat] as const;

export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: [sepolia, hardhat],
  transports: {
    [sepolia.id]: http("https://sepolia.gateway.tenderly.co/2fzYxtU8bvUzrChMEpPUhp"),
    [hardhat.id]: http("http://127.0.0.1:8545"),
  },
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
