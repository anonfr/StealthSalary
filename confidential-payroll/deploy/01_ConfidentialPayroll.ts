import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;
  const { ethers, fhevm } = hre as any;

  const gatewayAddress = process.env.GATEWAY_ADDRESS ?? deployer;

  // Get the already-deployed PayrollToken address
  const tokenDeployment = await hre.deployments.get("PayrollToken");
  const tokenAddress = tokenDeployment.address;

  console.log("Deployer:", deployer);
  console.log("Gateway:", gatewayAddress);
  console.log("PayrollToken:", tokenAddress);

  const result = await deploy("ConfidentialPayroll", {
    from: deployer,
    args: [deployer, gatewayAddress, tokenAddress],
    log: true,
  });

  console.log("ConfidentialPayroll deployed to:", result.address);

  // In mock environment: mint tokens to deployer, set operator, deposit, and set min wage
  if (fhevm?.isMock) {
    const token = await ethers.getContractAt("PayrollToken", tokenAddress);
    const payroll = await ethers.getContractAt("ConfidentialPayroll", result.address);
    const deployerSigner = await ethers.getSigner(deployer);

    // Mint 1,000,000 tokens to the deployer (decimals=6, so 1M tokens = 1_000_000_000_000 units)
    const MINT_AMOUNT = 1_000_000n; // 1M token units
    console.log("Minting tokens to deployer...");
    await (await token.connect(deployerSigner).mint(deployer, MINT_AMOUNT)).wait();

    // Set the payroll contract as an operator for the deployer (max uint48 = far future)
    console.log("Setting payroll contract as token operator...");
    const MAX_UINT48 = (1n << 48n) - 1n;
    await (await token.connect(deployerSigner).setOperator(result.address, MAX_UINT48)).wait();

    // Deposit tokens into the payroll contract
    const DEPOSIT = 500_000n;
    console.log("Depositing tokens into payroll contract...");
    await (await payroll.connect(deployerSigner).depositTokensPlaintext(DEPOSIT)).wait();

    // Set minimum wage
    const MIN_WAGE = 2_000n;
    console.log("Setting encrypted minimum wage (mock)...");
    const encryptedMinWage = await fhevm
      .createEncryptedInput(result.address, deployer)
      .add64(MIN_WAGE)
      .encrypt();
    await (await payroll.connect(deployerSigner).updateMinWage(encryptedMinWage.handles[0], encryptedMinWage.inputProof)).wait();
    console.log("Minimum wage set.");
  } else {
    console.log("Live network — use the frontend or relayer SDK to mint, deposit, and set min wage.");
  }
};

export default func;
func.id = "deploy_ConfidentialPayroll";
func.tags = ["ConfidentialPayroll"];
func.dependencies = ["PayrollToken"];
