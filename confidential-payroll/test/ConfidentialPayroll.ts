import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { ConfidentialPayroll, ConfidentialPayroll__factory, PayrollToken, PayrollToken__factory } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SALARY_ALICE = 3_000n; // e.g. 3000 token units per pay period
const SALARY_BOB = 4_500n;
const MIN_WAGE = 2_000n;
const INITIAL_MINT = 1_000_000n; // total supply minted to deployer
const INITIAL_DEPOSIT = 500_000n; // tokens deposited into payroll contract
const MAX_UINT48 = (1n << 48n) - 1n;

type Signers = {
  deployer: HardhatEthersSigner; // acts as employer
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  carol: HardhatEthersSigner; // external verifier (bank / landlord)
  gateway: HardhatEthersSigner; // simulates the Zama gateway
};

async function deployFixture(signers: Signers) {
  // 1. Deploy PayrollToken
  const tokenFactory = (await ethers.getContractFactory("PayrollToken")) as PayrollToken__factory;
  const token = (await tokenFactory.connect(signers.deployer).deploy()) as PayrollToken;
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();

  // 2. Deploy ConfidentialPayroll
  const factory = (await ethers.getContractFactory("ConfidentialPayroll")) as ConfidentialPayroll__factory;
  const contract = (await factory
    .connect(signers.deployer)
    .deploy(signers.gateway.address, tokenAddress)) as ConfidentialPayroll;
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  // 3. Mint tokens to deployer
  await (await token.connect(signers.deployer).mint(signers.deployer.address, INITIAL_MINT)).wait();

  // 4. Set payroll contract as operator (so it can pull tokens via transferFrom)
  await (await token.connect(signers.deployer).setOperator(contractAddress, MAX_UINT48)).wait();

  // 5. Deposit tokens into the payroll contract
  await (await contract.connect(signers.deployer).depositTokensPlaintext(INITIAL_DEPOSIT)).wait();

  // 6. Set the minimum wage after deployment
  const encryptedMinWage = await fhevm
    .createEncryptedInput(contractAddress, signers.deployer.address)
    .add64(MIN_WAGE)
    .encrypt();
  await (await contract.connect(signers.deployer).updateMinWage(encryptedMinWage.handles[0], encryptedMinWage.inputProof)).wait();

  return { contract, contractAddress, token, tokenAddress };
}

async function encryptAmount(contractAddress: string, signer: HardhatEthersSigner, amount: bigint) {
  return fhevm.createEncryptedInput(contractAddress, signer.address).add64(amount).encrypt();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ConfidentialPayroll", function () {
  let signers: Signers;
  let contract: ConfidentialPayroll;
  let contractAddress: string;
  let token: PayrollToken;
  let tokenAddress: string;

  before(async function () {
    const s = await ethers.getSigners();
    signers = {
      deployer: s[0],
      alice: s[1],
      bob: s[2],
      carol: s[3],
      gateway: s[4],
    };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("ConfidentialPayroll tests require the FHEVM mock environment");
      this.skip();
    }
    ({ contract, contractAddress, token, tokenAddress } = await deployFixture(signers));
  });

  // -------------------------------------------------------------------------
  // Deployment
  // -------------------------------------------------------------------------

  describe("Deployment", function () {
    it("sets the employer to the deployer", async function () {
      expect(await contract.employer()).to.equal(signers.deployer.address);
    });

    it("sets the gateway address", async function () {
      expect(await contract.gateway()).to.equal(signers.gateway.address);
    });

    it("sets the payroll token address", async function () {
      expect(await contract.payrollToken()).to.equal(tokenAddress);
    });

    it("records the initial token deposit", async function () {
      expect(await contract.totalDeposited()).to.equal(INITIAL_DEPOSIT);
    });
  });

  // -------------------------------------------------------------------------
  // Employee management
  // -------------------------------------------------------------------------

  describe("Employee management", function () {
    it("employer can add an employee with an encrypted salary", async function () {
      const enc = await encryptAmount(contractAddress, signers.deployer, SALARY_ALICE);
      await expect(
        contract.connect(signers.deployer).addEmployee(signers.alice.address, enc.handles[0], enc.inputProof),
      )
        .to.emit(contract, "EmployeeAdded")
        .withArgs(signers.alice.address);

      expect(await contract.isEmployee(signers.alice.address)).to.be.true;
      expect(await contract.employeeCount()).to.equal(1n);
    });

    it("employee can read their own encrypted salary", async function () {
      const enc = await encryptAmount(contractAddress, signers.deployer, SALARY_ALICE);
      await (await contract.connect(signers.deployer).addEmployee(signers.alice.address, enc.handles[0], enc.inputProof)).wait();

      const salaryHandle = await contract.connect(signers.alice).getMySalary();
      const clearSalary = await fhevm.userDecryptEuint(FhevmType.euint64, salaryHandle, contractAddress, signers.alice);
      expect(clearSalary).to.equal(SALARY_ALICE);
    });

    it("non-employee cannot read another employee's salary", async function () {
      const enc = await encryptAmount(contractAddress, signers.deployer, SALARY_ALICE);
      await (await contract.connect(signers.deployer).addEmployee(signers.alice.address, enc.handles[0], enc.inputProof)).wait();

      const salaryHandle = await contract.connect(signers.alice).getMySalary();
      await expect(
        fhevm.userDecryptEuint(FhevmType.euint64, salaryHandle, contractAddress, signers.bob),
      ).to.be.rejected;
    });

    it("reverts when adding a duplicate employee", async function () {
      const enc = await encryptAmount(contractAddress, signers.deployer, SALARY_ALICE);
      await (await contract.connect(signers.deployer).addEmployee(signers.alice.address, enc.handles[0], enc.inputProof)).wait();

      const enc2 = await encryptAmount(contractAddress, signers.deployer, SALARY_ALICE);
      await expect(
        contract.connect(signers.deployer).addEmployee(signers.alice.address, enc2.handles[0], enc2.inputProof),
      ).to.be.revertedWithCustomError(contract, "EmployeeAlreadyExists");
    });

    it("non-employer cannot add employees", async function () {
      const enc = await encryptAmount(contractAddress, signers.alice, SALARY_ALICE);
      await expect(
        contract.connect(signers.alice).addEmployee(signers.bob.address, enc.handles[0], enc.inputProof),
      ).to.be.revertedWithCustomError(contract, "OnlyEmployer");
    });

    it("employer can update an employee salary", async function () {
      const enc = await encryptAmount(contractAddress, signers.deployer, SALARY_ALICE);
      await (await contract.connect(signers.deployer).addEmployee(signers.alice.address, enc.handles[0], enc.inputProof)).wait();

      const newSalary = 5_000n;
      const enc2 = await encryptAmount(contractAddress, signers.deployer, newSalary);
      await (await contract.connect(signers.deployer).updateSalary(signers.alice.address, enc2.handles[0], enc2.inputProof)).wait();

      const salaryHandle = await contract.connect(signers.alice).getMySalary();
      const clearSalary = await fhevm.userDecryptEuint(FhevmType.euint64, salaryHandle, contractAddress, signers.alice);
      expect(clearSalary).to.equal(newSalary);
    });

    it("employer can remove an employee", async function () {
      const enc = await encryptAmount(contractAddress, signers.deployer, SALARY_ALICE);
      await (await contract.connect(signers.deployer).addEmployee(signers.alice.address, enc.handles[0], enc.inputProof)).wait();

      await expect(contract.connect(signers.deployer).removeEmployee(signers.alice.address))
        .to.emit(contract, "EmployeeRemoved")
        .withArgs(signers.alice.address);

      expect(await contract.isEmployee(signers.alice.address)).to.be.false;
    });
  });

  // -------------------------------------------------------------------------
  // Payroll execution
  // -------------------------------------------------------------------------

  describe("Payroll execution", function () {
    beforeEach(async function () {
      const encAlice = await encryptAmount(contractAddress, signers.deployer, SALARY_ALICE);
      await (await contract.connect(signers.deployer).addEmployee(signers.alice.address, encAlice.handles[0], encAlice.inputProof)).wait();

      const encBob = await encryptAmount(contractAddress, signers.deployer, SALARY_BOB);
      await (await contract.connect(signers.deployer).addEmployee(signers.bob.address, encBob.handles[0], encBob.inputProof)).wait();
    });

    it("runPayroll credits each employee's encrypted balance", async function () {
      await expect(contract.connect(signers.deployer).runPayroll())
        .to.emit(contract, "PayrollRun");

      const aliceBalHandle = await contract.connect(signers.alice).getMyBalance();
      const aliceBal = await fhevm.userDecryptEuint(FhevmType.euint64, aliceBalHandle, contractAddress, signers.alice);
      expect(aliceBal).to.equal(SALARY_ALICE);

      const bobBalHandle = await contract.connect(signers.bob).getMyBalance();
      const bobBal = await fhevm.userDecryptEuint(FhevmType.euint64, bobBalHandle, contractAddress, signers.bob);
      expect(bobBal).to.equal(SALARY_BOB);
    });

    it("balances accumulate across multiple payroll runs", async function () {
      await (await contract.connect(signers.deployer).runPayroll()).wait();
      await (await contract.connect(signers.deployer).runPayroll()).wait();
      await (await contract.connect(signers.deployer).runPayroll()).wait();

      const handle = await contract.connect(signers.alice).getMyBalance();
      const bal = await fhevm.userDecryptEuint(FhevmType.euint64, handle, contractAddress, signers.alice);
      expect(bal).to.equal(SALARY_ALICE * 3n);
    });

    it("runPayrollFor only credits specified employees", async function () {
      await (await contract.connect(signers.deployer).runPayrollFor([signers.alice.address])).wait();

      const aliceHandle = await contract.connect(signers.alice).getMyBalance();
      const aliceBal = await fhevm.userDecryptEuint(FhevmType.euint64, aliceHandle, contractAddress, signers.alice);
      expect(aliceBal).to.equal(SALARY_ALICE);

      const bobHandle = await contract.connect(signers.bob).getMyBalance();
      const bobBal = await fhevm.userDecryptEuint(FhevmType.euint64, bobHandle, contractAddress, signers.bob);
      expect(bobBal).to.equal(0n);
    });

    it("non-employer cannot run payroll", async function () {
      await expect(contract.connect(signers.alice).runPayroll()).to.be.revertedWithCustomError(
        contract,
        "OnlyEmployer",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Compliance — the killer feature
  // -------------------------------------------------------------------------

  describe("Compliance verification (checkCompliance)", function () {
    it("returns true for salary above minimum wage", async function () {
      const enc = await encryptAmount(contractAddress, signers.deployer, SALARY_ALICE);
      await (await contract.connect(signers.deployer).addEmployee(signers.alice.address, enc.handles[0], enc.inputProof)).wait();

      const tx = await contract.connect(signers.deployer).checkCompliance(signers.alice.address);
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);
      await expect(tx).to.emit(contract, "ComplianceChecked").withArgs(signers.alice.address);
    });

    it("reverts for unknown address", async function () {
      await expect(
        contract.connect(signers.deployer).checkCompliance(signers.carol.address),
      ).to.be.revertedWithCustomError(contract, "EmployeeNotFound");
    });
  });

  // -------------------------------------------------------------------------
  // Income proof (selective disclosure)
  // -------------------------------------------------------------------------

  describe("Proof of income (generateIncomeProof)", function () {
    it("employee can grant transient salary access to a verifier", async function () {
      const enc = await encryptAmount(contractAddress, signers.deployer, SALARY_ALICE);
      await (await contract.connect(signers.deployer).addEmployee(signers.alice.address, enc.handles[0], enc.inputProof)).wait();

      await expect(contract.connect(signers.alice).generateIncomeProof(signers.carol.address))
        .to.emit(contract, "IncomeProofGranted")
        .withArgs(signers.alice.address, signers.carol.address);
    });

    it("non-employee cannot generate an income proof", async function () {
      await expect(
        contract.connect(signers.carol).generateIncomeProof(signers.deployer.address),
      ).to.be.revertedWithCustomError(contract, "EmployeeNotFound");
    });
  });

  // -------------------------------------------------------------------------
  // Withdrawal flow
  // -------------------------------------------------------------------------

  describe("Withdrawal flow", function () {
    beforeEach(async function () {
      const enc = await encryptAmount(contractAddress, signers.deployer, SALARY_ALICE);
      await (await contract.connect(signers.deployer).addEmployee(signers.alice.address, enc.handles[0], enc.inputProof)).wait();
      await (await contract.connect(signers.deployer).runPayroll()).wait();
    });

    it("employee can initiate a withdrawal", async function () {
      await expect(contract.connect(signers.alice).initiateWithdrawal())
        .to.emit(contract, "WithdrawalInitiated")
        .withArgs(signers.alice.address);

      expect(await contract.hasPendingWithdrawal(signers.alice.address)).to.be.true;
    });

    it("gateway processes withdrawal and transfers ERC-7984 tokens", async function () {
      await (await contract.connect(signers.alice).initiateWithdrawal()).wait();

      // Check Alice's token balance before
      const aliceTokenBalBefore = await token.confidentialBalanceOf(signers.alice.address);
      // In mock mode, uninitialised euint64 = 0

      await expect(
        contract.connect(signers.gateway).processWithdrawal(signers.alice.address, SALARY_ALICE),
      )
        .to.emit(contract, "WithdrawalProcessed")
        .withArgs(signers.alice.address, SALARY_ALICE);

      // Alice should now have tokens
      const aliceTokenBal = await token.confidentialBalanceOf(signers.alice.address);
      const clearBal = await fhevm.userDecryptEuint(FhevmType.euint64, aliceTokenBal, tokenAddress, signers.alice);
      expect(clearBal).to.equal(SALARY_ALICE);

      expect(await contract.hasPendingWithdrawal(signers.alice.address)).to.be.false;
    });

    it("encrypted balance resets to zero after withdrawal", async function () {
      await (await contract.connect(signers.alice).initiateWithdrawal()).wait();
      await (await contract.connect(signers.gateway).processWithdrawal(signers.alice.address, SALARY_ALICE)).wait();

      const handle = await contract.connect(signers.alice).getMyBalance();
      const bal = await fhevm.userDecryptEuint(FhevmType.euint64, handle, contractAddress, signers.alice);
      expect(bal).to.equal(0n);
    });

    it("non-gateway cannot process withdrawals", async function () {
      await (await contract.connect(signers.alice).initiateWithdrawal()).wait();
      await expect(
        contract.connect(signers.alice).processWithdrawal(signers.alice.address, SALARY_ALICE),
      ).to.be.revertedWithCustomError(contract, "OnlyGateway");
    });

    it("reverts if no pending withdrawal", async function () {
      await expect(
        contract.connect(signers.gateway).processWithdrawal(signers.alice.address, SALARY_ALICE),
      ).to.be.revertedWithCustomError(contract, "NoPendingWithdrawal");
    });

    it("reverts if contract has insufficient token funds", async function () {
      await (await contract.connect(signers.alice).initiateWithdrawal()).wait();
      // Try to withdraw more than deposited
      const tooMuch = INITIAL_DEPOSIT + 1n;
      await expect(
        contract.connect(signers.gateway).processWithdrawal(signers.alice.address, tooMuch),
      ).to.be.revertedWithCustomError(contract, "InsufficientContractFunds");
    });
  });

  // -------------------------------------------------------------------------
  // Employer fund withdrawal
  // -------------------------------------------------------------------------

  describe("Employer withdrawFunds", function () {
    it("employer can withdraw tokens from the contract", async function () {
      const withdrawAmount = 100_000n;

      await expect(contract.connect(signers.deployer).withdrawFunds(withdrawAmount))
        .to.emit(contract, "FundsWithdrawn")
        .withArgs(signers.deployer.address, withdrawAmount);

      expect(await contract.totalWithdrawn()).to.equal(withdrawAmount);
    });

    it("non-employer cannot withdraw funds", async function () {
      await expect(
        contract.connect(signers.alice).withdrawFunds(100n),
      ).to.be.revertedWithCustomError(contract, "OnlyEmployer");
    });

    it("reverts if withdrawal amount exceeds deposited balance", async function () {
      const tooMuch = INITIAL_DEPOSIT + 1n;
      await expect(
        contract.connect(signers.deployer).withdrawFunds(tooMuch),
      ).to.be.revertedWithCustomError(contract, "InsufficientContractFunds");
    });
  });

  // -------------------------------------------------------------------------
  // ERC-7984 Token integration
  // -------------------------------------------------------------------------

  describe("ERC-7984 Token integration", function () {
    it("PayrollToken has correct name and symbol", async function () {
      expect(await token.name()).to.equal("Payroll Token");
      expect(await token.symbol()).to.equal("PAY");
      expect(await token.decimals()).to.equal(6);
    });

    it("only owner can mint tokens", async function () {
      await expect(
        token.connect(signers.alice).mint(signers.alice.address, 1000n),
      ).to.be.revertedWithCustomError(token, "OnlyOwner");
    });

    it("employer can deposit tokens into payroll via depositTokensPlaintext", async function () {
      const additionalDeposit = 50_000n;
      await (await contract.connect(signers.deployer).depositTokensPlaintext(additionalDeposit)).wait();
      expect(await contract.totalDeposited()).to.equal(INITIAL_DEPOSIT + additionalDeposit);
    });
  });

  // -------------------------------------------------------------------------
  // End-to-end payroll cycle
  // -------------------------------------------------------------------------

  describe("End-to-end payroll cycle", function () {
    it("full cycle: add → payroll × 2 → withdraw → balance is zero, tokens received", async function () {
      // 1. Add Alice
      const enc = await encryptAmount(contractAddress, signers.deployer, SALARY_ALICE);
      await (await contract.connect(signers.deployer).addEmployee(signers.alice.address, enc.handles[0], enc.inputProof)).wait();

      // 2. Run payroll twice
      await (await contract.connect(signers.deployer).runPayroll()).wait();
      await (await contract.connect(signers.deployer).runPayroll()).wait();

      // 3. Verify accumulated balance = 2 × salary
      const handle = await contract.connect(signers.alice).getMyBalance();
      const bal = await fhevm.userDecryptEuint(FhevmType.euint64, handle, contractAddress, signers.alice);
      expect(bal).to.equal(SALARY_ALICE * 2n);

      // 4. Initiate withdrawal
      await (await contract.connect(signers.alice).initiateWithdrawal()).wait();

      // 5. Gateway processes with the decrypted amount
      await (await contract.connect(signers.gateway).processWithdrawal(signers.alice.address, SALARY_ALICE * 2n)).wait();

      // 6. Alice should have received ERC-7984 tokens
      const aliceTokenBal = await token.confidentialBalanceOf(signers.alice.address);
      const clearTokenBal = await fhevm.userDecryptEuint(FhevmType.euint64, aliceTokenBal, tokenAddress, signers.alice);
      expect(clearTokenBal).to.equal(SALARY_ALICE * 2n);

      // 7. Payroll balance is zero
      const handleAfter = await contract.connect(signers.alice).getMyBalance();
      const balAfter = await fhevm.userDecryptEuint(FhevmType.euint64, handleAfter, contractAddress, signers.alice);
      expect(balAfter).to.equal(0n);
    });
  });
});
