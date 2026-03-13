import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const result = await deploy("PayrollToken", {
    from: deployer,
    args: [],
    log: true,
  });

  console.log("PayrollToken deployed to:", result.address);
};

export default func;
func.id = "deploy_PayrollToken";
func.tags = ["PayrollToken"];
