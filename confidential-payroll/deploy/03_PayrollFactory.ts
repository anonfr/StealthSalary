import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const result = await deploy("PayrollFactory", {
    from: deployer,
    args: [],
    log: true,
  });

  console.log("PayrollFactory deployed to:", result.address);
};

export default func;
func.id = "deploy_PayrollFactory";
func.tags = ["PayrollFactory"];
