import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  console.log("Deploying PayrollFactory...");
  const Factory = await ethers.getContractFactory("PayrollFactory");
  const factory = await Factory.connect(deployer).deploy({
    gasLimit: 6_000_000,
  });
  await factory.waitForDeployment();
  const addr = await factory.getAddress();
  console.log("PayrollFactory deployed to:", addr);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
