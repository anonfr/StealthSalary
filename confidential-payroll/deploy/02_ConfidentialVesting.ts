import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;
  const { ethers, fhevm } = hre as any;

  const gatewayAddress = process.env.GATEWAY_ADDRESS ?? deployer;
  const tokenDeployment = await hre.deployments.get("PayrollToken");
  const tokenAddress = tokenDeployment.address;

  console.log("Deployer:", deployer);
  console.log("Gateway:", gatewayAddress);
  console.log("VestingToken:", tokenAddress);

  const result = await deploy("ConfidentialVesting", {
    from: deployer,
    args: [gatewayAddress, tokenAddress],
    log: true,
  });

  console.log("ConfidentialVesting deployed to:", result.address);

  // In mock environment: set operator and deposit tokens
  if (fhevm?.isMock) {
    const token = await ethers.getContractAt("PayrollToken", tokenAddress);
    const vesting = await ethers.getContractAt("ConfidentialVesting", result.address);
    const deployerSigner = await ethers.getSigner(deployer);

    // Set the vesting contract as an operator for the deployer
    const MAX_UINT48 = (1n << 48n) - 1n;
    console.log("Setting vesting contract as token operator...");
    await (await token.connect(deployerSigner).setOperator(result.address, MAX_UINT48)).wait();

    // Deposit tokens into the vesting contract
    const DEPOSIT = 100_000n;
    console.log("Depositing tokens into vesting contract...");
    await (await vesting.connect(deployerSigner).depositTokens(DEPOSIT)).wait();
  }
};

export default func;
func.id = "deploy_ConfidentialVesting";
func.tags = ["ConfidentialVesting"];
func.dependencies = ["PayrollToken", "ConfidentialPayroll"];
