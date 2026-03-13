import { task } from "hardhat/config";

task("payroll:add-employee", "Add an employee with an encrypted salary")
  .addParam("contract", "ConfidentialPayroll contract address")
  .addParam("employee", "Employee wallet address")
  .addParam("salary", "Clear-text salary amount (will be encrypted)")
  .setAction(async ({ contract: contractAddress, employee, salary }, hre) => {
    const { ethers, fhevm } = hre as any;
    const [deployer] = await ethers.getSigners();
    const payroll = await ethers.getContractAt("ConfidentialPayroll", contractAddress);

    const encrypted = await fhevm
      .createEncryptedInput(contractAddress, deployer.address)
      .add64(BigInt(salary))
      .encrypt();

    const tx = await payroll.connect(deployer).addEmployee(employee, encrypted.handles[0], encrypted.inputProof);
    const receipt = await tx.wait();
    console.log(`Employee ${employee} added. Tx: ${receipt?.hash}`);
  });

task("payroll:run", "Run payroll for all active employees")
  .addParam("contract", "ConfidentialPayroll contract address")
  .setAction(async ({ contract: contractAddress }, hre) => {
    const { ethers } = hre as any;
    const [deployer] = await ethers.getSigners();
    const payroll = await ethers.getContractAt("ConfidentialPayroll", contractAddress);

    const tx = await payroll.connect(deployer).runPayroll();
    const receipt = await tx.wait();
    console.log(`Payroll run. Tx: ${receipt?.hash}`);
  });

task("payroll:check-compliance", "Verify an employee's salary meets minimum wage")
  .addParam("contract", "ConfidentialPayroll contract address")
  .addParam("employee", "Employee wallet address")
  .setAction(async ({ contract: contractAddress, employee }, hre) => {
    const { ethers } = hre as any;
    const [deployer] = await ethers.getSigners();
    const payroll = await ethers.getContractAt("ConfidentialPayroll", contractAddress);

    const tx = await payroll.connect(deployer).checkCompliance(employee);
    const receipt = await tx.wait();
    console.log(`Compliance check emitted. Tx: ${receipt?.hash}`);
    console.log("The Zama gateway will decrypt the ebool result publicly.");
  });

task("payroll:employee-count", "Get the number of active employees")
  .addParam("contract", "ConfidentialPayroll contract address")
  .setAction(async ({ contract: contractAddress }, hre) => {
    const { ethers } = hre as any;
    const payroll = await ethers.getContractAt("ConfidentialPayroll", contractAddress);
    const count = await payroll.employeeCount();
    console.log(`Active employees: ${count}`);
  });
