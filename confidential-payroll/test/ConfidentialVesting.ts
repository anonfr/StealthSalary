import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { ConfidentialVesting, ConfidentialVesting__factory, PayrollToken, PayrollToken__factory } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRANT_ALICE = 120_000n; // 120k token units total grant
const CLIFF = 365 * 24 * 3600; // 1 year cliff
const VESTING = 4 * 365 * 24 * 3600; // 4 year total vesting
const INITIAL_MINT = 1_000_000n;
const INITIAL_DEPOSIT = 500_000n;
const MAX_UINT48 = (1n << 48n) - 1n;

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  gateway: HardhatEthersSigner;
};

async function deployFixture(signers: Signers) {
  // 1. Deploy PayrollToken
  const tokenFactory = (await ethers.getContractFactory("PayrollToken")) as PayrollToken__factory;
  const token = (await tokenFactory.connect(signers.deployer).deploy(signers.deployer.address)) as PayrollToken;
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();

  // 2. Deploy ConfidentialVesting
  const factory = (await ethers.getContractFactory("ConfidentialVesting")) as ConfidentialVesting__factory;
  const contract = (await factory
    .connect(signers.deployer)
    .deploy(signers.gateway.address, tokenAddress)) as ConfidentialVesting;
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  // 3. Mint tokens to deployer
  await (await token.connect(signers.deployer).mint(signers.deployer.address, INITIAL_MINT)).wait();

  // 4. Set vesting contract as operator
  await (await token.connect(signers.deployer).setOperator(contractAddress, MAX_UINT48)).wait();

  // 5. Deposit tokens
  await (await contract.connect(signers.deployer).depositTokens(INITIAL_DEPOSIT)).wait();

  return { contract, contractAddress, token, tokenAddress };
}

async function encryptAmount(contractAddress: string, signer: HardhatEthersSigner, amount: bigint) {
  return fhevm.createEncryptedInput(contractAddress, signer.address).add64(amount).encrypt();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ConfidentialVesting", function () {
  let signers: Signers;
  let contract: ConfidentialVesting;
  let contractAddress: string;
  let token: PayrollToken;
  let tokenAddress: string;

  before(async function () {
    const s = await ethers.getSigners();
    signers = { deployer: s[0], alice: s[1], bob: s[2], gateway: s[4] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("ConfidentialVesting tests require the FHEVM mock environment");
      this.skip();
      return;
    }
    ({ contract, contractAddress, token, tokenAddress } = await deployFixture(signers));
  });

  // -------------------------------------------------------------------------
  // Deployment
  // -------------------------------------------------------------------------

  describe("Deployment", function () {
    it("sets employer and gateway correctly", async function () {
      expect(await contract.employer()).to.equal(signers.deployer.address);
      expect(await contract.gateway()).to.equal(signers.gateway.address);
    });

    it("sets the vesting token address", async function () {
      expect(await contract.vestingToken()).to.equal(tokenAddress);
    });

    it("records initial token deposit", async function () {
      expect(await contract.totalGranted()).to.equal(INITIAL_DEPOSIT);
    });
  });

  // -------------------------------------------------------------------------
  // Schedule creation
  // -------------------------------------------------------------------------

  describe("Schedule creation", function () {
    it("employer can create an encrypted vesting schedule", async function () {
      const enc = await encryptAmount(contractAddress, signers.deployer, GRANT_ALICE);
      await expect(
        contract.connect(signers.deployer).createSchedule(
          signers.alice.address, enc.handles[0], enc.inputProof, CLIFF, VESTING,
        ),
      )
        .to.emit(contract, "ScheduleCreated")
        .withArgs(signers.alice.address, CLIFF, VESTING);

      expect(await contract.hasSchedule(signers.alice.address)).to.be.true;
      expect(await contract.beneficiaryCount()).to.equal(1n);
    });

    it("beneficiary can read their own encrypted grant", async function () {
      const enc = await encryptAmount(contractAddress, signers.deployer, GRANT_ALICE);
      await (await contract.connect(signers.deployer).createSchedule(
        signers.alice.address, enc.handles[0], enc.inputProof, CLIFF, VESTING,
      )).wait();

      const grantHandle = await contract.connect(signers.alice).getMyGrant();
      const clearGrant = await fhevm.userDecryptEuint(FhevmType.euint64, grantHandle, contractAddress, signers.alice);
      expect(clearGrant).to.equal(GRANT_ALICE);
    });

    it("bob cannot read alice's grant", async function () {
      const enc = await encryptAmount(contractAddress, signers.deployer, GRANT_ALICE);
      await (await contract.connect(signers.deployer).createSchedule(
        signers.alice.address, enc.handles[0], enc.inputProof, CLIFF, VESTING,
      )).wait();

      const grantHandle = await contract.connect(signers.alice).getMyGrant();
      await expect(
        fhevm.userDecryptEuint(FhevmType.euint64, grantHandle, contractAddress, signers.bob),
      ).to.be.rejected;
    });

    it("reverts on duplicate schedule for same beneficiary", async function () {
      const enc = await encryptAmount(contractAddress, signers.deployer, GRANT_ALICE);
      await (await contract.connect(signers.deployer).createSchedule(
        signers.alice.address, enc.handles[0], enc.inputProof, CLIFF, VESTING,
      )).wait();

      const enc2 = await encryptAmount(contractAddress, signers.deployer, GRANT_ALICE);
      await expect(
        contract.connect(signers.deployer).createSchedule(
          signers.alice.address, enc2.handles[0], enc2.inputProof, CLIFF, VESTING,
        ),
      ).to.be.revertedWithCustomError(contract, "ScheduleAlreadyExists");
    });

    it("non-employer cannot create a schedule", async function () {
      const enc = await encryptAmount(contractAddress, signers.alice, GRANT_ALICE);
      await expect(
        contract.connect(signers.alice).createSchedule(
          signers.bob.address, enc.handles[0], enc.inputProof, CLIFF, VESTING,
        ),
      ).to.be.revertedWithCustomError(contract, "OnlyEmployer");
    });

    it("reverts with zero vestingDuration", async function () {
      const enc = await encryptAmount(contractAddress, signers.deployer, GRANT_ALICE);
      await expect(
        contract.connect(signers.deployer).createSchedule(
          signers.alice.address, enc.handles[0], enc.inputProof, CLIFF, 0,
        ),
      ).to.be.revertedWithCustomError(contract, "InvalidDuration");
    });
  });

  // -------------------------------------------------------------------------
  // Cliff enforcement
  // -------------------------------------------------------------------------

  describe("Cliff enforcement", function () {
    beforeEach(async function () {
      const enc = await encryptAmount(contractAddress, signers.deployer, GRANT_ALICE);
      await (await contract.connect(signers.deployer).createSchedule(
        signers.alice.address, enc.handles[0], enc.inputProof, CLIFF, VESTING,
      )).wait();
    });

    it("hasPassedCliff returns false before cliff", async function () {
      expect(await contract.hasPassedCliff(signers.alice.address)).to.be.false;
    });

    it("hasPassedCliff returns true after cliff", async function () {
      await time.increase(CLIFF + 1);
      expect(await contract.hasPassedCliff(signers.alice.address)).to.be.true;
    });

    it("initiateVestingClaim reverts before cliff", async function () {
      await expect(
        contract.connect(signers.alice).initiateVestingClaim(),
      ).to.be.revertedWithCustomError(contract, "CliffNotReached");
    });
  });

  // -------------------------------------------------------------------------
  // Claim flow
  // -------------------------------------------------------------------------

  describe("Vesting claim flow", function () {
    beforeEach(async function () {
      const enc = await encryptAmount(contractAddress, signers.deployer, GRANT_ALICE);
      await (await contract.connect(signers.deployer).createSchedule(
        signers.alice.address, enc.handles[0], enc.inputProof, CLIFF, VESTING,
      )).wait();
      await time.increase(CLIFF + 1);
    });

    it("beneficiary can initiate a vesting claim after cliff", async function () {
      await expect(contract.connect(signers.alice).initiateVestingClaim())
        .to.emit(contract, "ClaimInitiated")
        .withArgs(signers.alice.address);

      expect(await contract.hasPendingClaim(signers.alice.address)).to.be.true;
    });

    it("gateway processes claim and transfers ERC-7984 tokens", async function () {
      await (await contract.connect(signers.alice).initiateVestingClaim()).wait();

      const vestedAmount = 30_000n; // 25% after 1 year of 4-year vesting

      await expect(
        contract.connect(signers.gateway).processVestingClaim(signers.alice.address, vestedAmount),
      )
        .to.emit(contract, "ClaimProcessed")
        .withArgs(signers.alice.address, vestedAmount);

      // Alice should have received ERC-7984 tokens
      const aliceTokenBal = await token.confidentialBalanceOf(signers.alice.address);
      const clearBal = await fhevm.userDecryptEuint(FhevmType.euint64, aliceTokenBal, tokenAddress, signers.alice);
      expect(clearBal).to.equal(vestedAmount);

      expect(await contract.hasPendingClaim(signers.alice.address)).to.be.false;
    });

    it("claimed balance updates after processing", async function () {
      await (await contract.connect(signers.alice).initiateVestingClaim()).wait();
      const vestedAmount = 30_000n;
      await (await contract.connect(signers.gateway).processVestingClaim(signers.alice.address, vestedAmount)).wait();

      const claimedHandle = await contract.connect(signers.alice).getMyClaimed();
      const claimed = await fhevm.userDecryptEuint(FhevmType.euint64, claimedHandle, contractAddress, signers.alice);
      expect(claimed).to.equal(vestedAmount);
    });

    it("non-gateway cannot process vesting claims", async function () {
      await (await contract.connect(signers.alice).initiateVestingClaim()).wait();
      await expect(
        contract.connect(signers.alice).processVestingClaim(signers.alice.address, 30_000n),
      ).to.be.revertedWithCustomError(contract, "OnlyGateway");
    });

    it("reverts if no pending claim", async function () {
      await expect(
        contract.connect(signers.gateway).processVestingClaim(signers.alice.address, 30_000n),
      ).to.be.revertedWithCustomError(contract, "NoPendingClaim");
    });
  });

  // -------------------------------------------------------------------------
  // Employer fund management
  // -------------------------------------------------------------------------

  describe("Employer fund management", function () {
    it("employer can withdraw tokens from the contract", async function () {
      const withdrawAmount = 50_000n;
      await expect(contract.connect(signers.deployer).withdrawFunds(withdrawAmount))
        .to.emit(contract, "FundsWithdrawn")
        .withArgs(signers.deployer.address, withdrawAmount);
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
      ).to.be.revertedWithCustomError(contract, "InsufficientFunds");
    });
  });

  // -------------------------------------------------------------------------
  // Schedule revocation
  // -------------------------------------------------------------------------

  describe("Schedule revocation", function () {
    it("employer can revoke a vesting schedule", async function () {
      const enc = await encryptAmount(contractAddress, signers.deployer, GRANT_ALICE);
      await (await contract.connect(signers.deployer).createSchedule(
        signers.alice.address, enc.handles[0], enc.inputProof, CLIFF, VESTING,
      )).wait();

      await expect(contract.connect(signers.deployer).revokeSchedule(signers.alice.address))
        .to.emit(contract, "ScheduleRevoked")
        .withArgs(signers.alice.address);

      expect(await contract.hasSchedule(signers.alice.address)).to.be.false;
    });
  });
});
