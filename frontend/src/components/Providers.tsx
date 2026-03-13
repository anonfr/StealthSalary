"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppKit } from "@reown/appkit/react";
import { sepolia, hardhat } from "@reown/appkit/networks";
import { wagmiAdapter, projectId } from "@/lib/wagmiConfig";
import { WagmiProvider, type Config } from "wagmi";
import { useState, type ReactNode } from "react";

const metadata = {
  name: "Confidential Payroll",
  description: "Fully encrypted onchain payroll powered by FHE",
  url: "https://localhost:3000",
  icons: [],
};

createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks: [sepolia, hardhat],
  defaultNetwork: sepolia,
  metadata,
  themeMode: "light",
  themeVariables: {
    "--w3m-accent": "#ffd208",
  },
  features: {
    analytics: false,
    swaps: false,
    onramp: false,
  },
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
