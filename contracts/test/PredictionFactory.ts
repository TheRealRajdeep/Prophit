import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, parseEther } from "viem";

describe("PredictionFactory", function () {
  async function deployFixture() {
    const [streamer, moderator, user1, user2, user3] =
      await hre.viem.getWalletClients();

    const predictionFactory = await hre.viem.deployContract("PredictionFactory");
    const publicClient = await hre.viem.getPublicClient();

    return {
      predictionFactory,
      publicClient,
      streamer: streamer!,
      moderator: moderator!,
      user1: user1!,
      user2: user2!,
      user3: user3!,
    };
  }

  describe("Deployment", function () {
    it("Should start with nextPredictionId 0", async function () {
      const { predictionFactory } = await loadFixture(deployFixture);
      expect(await predictionFactory.read.nextPredictionId()).to.equal(0n);
    });
  });

  describe("Moderator management", function () {
    it("Streamer can add moderator", async function () {
      const { predictionFactory, streamer, moderator } =
        await loadFixture(deployFixture);

      await predictionFactory.write.addStreamerModerator([
        moderator.account.address,
      ], { account: streamer.account });

      expect(
        await predictionFactory.read.streamerModerators([
          streamer.account.address,
          moderator.account.address,
        ])
      ).to.be.true;
    });

    it("Streamer can remove moderator", async function () {
      const { predictionFactory, streamer, moderator } =
        await loadFixture(deployFixture);

      await predictionFactory.write.addStreamerModerator([
        moderator.account.address,
      ], { account: streamer.account });
      await predictionFactory.write.removeStreamerModerator([
        moderator.account.address,
      ], { account: streamer.account });

      expect(
        await predictionFactory.read.streamerModerators([
          streamer.account.address,
          moderator.account.address,
        ])
      ).to.be.false;
    });
  });

  describe("Create Prediction", function () {
    it("Streamer can create prediction", async function () {
      const { predictionFactory, streamer } = await loadFixture(deployFixture);

      const tx = await predictionFactory.write.createPrediction(
        [
          streamer.account.address,
          "Will Team A win?",
          "Yes",
          "No",
        ],
        { account: streamer.account }
      );

      expect(await predictionFactory.read.nextPredictionId()).to.equal(1n);

      const p = await predictionFactory.read.predictions([0n]);
      expect(p[1]).to.equal(getAddress(streamer.account.address));
      expect(p[2]).to.equal("Will Team A win?");
      expect(p[3]).to.equal("Yes");
      expect(p[4]).to.equal("No");
      expect(p[5]).to.equal(0n); // totalBetOption1
      expect(p[6]).to.equal(0n); // totalBetOption2
      expect(p[7]).to.equal(0); // Open status
    });

    it("Moderator can create prediction for streamer", async function () {
      const { predictionFactory, streamer, moderator } =
        await loadFixture(deployFixture);

      await predictionFactory.write.addStreamerModerator([
        moderator.account.address,
      ], { account: streamer.account });

      await predictionFactory.write.createPrediction(
        [
          streamer.account.address,
          "Moderator prediction",
          "Option A",
          "Option B",
        ],
        { account: moderator.account }
      );

      const p = await predictionFactory.read.predictions([0n]);
      expect(p[1]).to.equal(getAddress(streamer.account.address));
      expect(p[2]).to.equal("Moderator prediction");
    });

    it("Reverts if non-streamer/moderator creates", async function () {
      const { predictionFactory, streamer, user1 } =
        await loadFixture(deployFixture);

      await expect(
        predictionFactory.write.createPrediction(
          [
            streamer.account.address,
            "Unauthorized",
            "A",
            "B",
          ],
          { account: user1.account }
        )
      ).to.be.rejected;
    });
  });

  describe("Betting", function () {
    it("Users can place bets on options 1 and 2", async function () {
      const { predictionFactory, streamer, user1, user2 } =
        await loadFixture(deployFixture);

      await predictionFactory.write.createPrediction(
        [streamer.account.address, "Test", "Yes", "No"],
        { account: streamer.account }
      );

      await predictionFactory.write.placeBet([0n, 1], {
        account: user1.account,
        value: parseEther("1"),
      });
      await predictionFactory.write.placeBet([0n, 2], {
        account: user2.account,
        value: parseEther("2"),
      });

      const p = await predictionFactory.read.predictions([0n]);
      expect(p[5]).to.equal(parseEther("1")); // totalBetOption1
      expect(p[6]).to.equal(parseEther("2")); // totalBetOption2

      expect(
        await predictionFactory.read.userBets([
          0n,
          user1.account.address,
          1,
        ])
      ).to.equal(parseEther("1"));
      expect(
        await predictionFactory.read.userBets([
          0n,
          user2.account.address,
          2,
        ])
      ).to.equal(parseEther("2"));
    });

    it("Reverts on invalid option", async function () {
      const { predictionFactory, streamer, user1 } =
        await loadFixture(deployFixture);

      await predictionFactory.write.createPrediction(
        [streamer.account.address, "Test", "Yes", "No"],
        { account: streamer.account }
      );

      await expect(
        predictionFactory.write.placeBet([0n, 0], {
          account: user1.account,
          value: parseEther("1"),
        })
      ).to.be.rejected;

      await expect(
        predictionFactory.write.placeBet([0n, 3], {
          account: user1.account,
          value: parseEther("1"),
        })
      ).to.be.rejected;
    });
  });

  describe("Lock and Resolve", function () {
    it("Streamer can lock prediction", async function () {
      const { predictionFactory, streamer } = await loadFixture(deployFixture);

      await predictionFactory.write.createPrediction(
        [streamer.account.address, "Test", "Yes", "No"],
        { account: streamer.account }
      );

      await predictionFactory.write.lockPrediction([0n], {
        account: streamer.account,
      });

      const p = await predictionFactory.read.predictions([0n]);
      expect(p[7]).to.equal(1); // Locked status
    });

    it("Moderator can lock prediction", async function () {
      const { predictionFactory, streamer, moderator } =
        await loadFixture(deployFixture);

      await predictionFactory.write.addStreamerModerator([
        moderator.account.address,
      ], { account: streamer.account });
      await predictionFactory.write.createPrediction(
        [streamer.account.address, "Test", "Yes", "No"],
        { account: streamer.account }
      );

      await predictionFactory.write.lockPrediction([0n], {
        account: moderator.account,
      });

      const p = await predictionFactory.read.predictions([0n]);
      expect(p[7]).to.equal(1); // Locked status
    });

    it("Streamer can resolve prediction", async function () {
      const { predictionFactory, streamer } = await loadFixture(deployFixture);

      await predictionFactory.write.createPrediction(
        [streamer.account.address, "Test", "Yes", "No"],
        { account: streamer.account }
      );
      await predictionFactory.write.lockPrediction([0n], {
        account: streamer.account,
      });
      await predictionFactory.write.resolvePrediction([0n, 1], {
        account: streamer.account,
      });

      const p = await predictionFactory.read.predictions([0n]);
      expect(p[7]).to.equal(2); // Resolved
      expect(p[8]).to.equal(1); // winningOption
    });
  });

  describe("Payout formula (Twitch-style)", function () {
    it("Distributes winnings correctly: payout = bet + (bet/totalWin)*totalLoss", async function () {
      const { predictionFactory, streamer, user1, user2, user3, publicClient } =
        await loadFixture(deployFixture);

      // Create prediction
      await predictionFactory.write.createPrediction(
        [streamer.account.address, "Who wins?", "Team A", "Team B"],
        { account: streamer.account }
      );

      // User1 bets 1 ETH on option 1 (Team A)
      // User2 bets 2 ETH on option 1 (Team A)
      // User3 bets 3 ETH on option 2 (Team B)
      await predictionFactory.write.placeBet([0n, 1], {
        account: user1.account,
        value: parseEther("1"),
      });
      await predictionFactory.write.placeBet([0n, 1], {
        account: user2.account,
        value: parseEther("2"),
      });
      await predictionFactory.write.placeBet([0n, 2], {
        account: user3.account,
        value: parseEther("3"),
      });

      // Total: Option1 = 3 ETH, Option2 = 3 ETH
      // Resolve: Option 1 wins
      await predictionFactory.write.lockPrediction([0n], {
        account: streamer.account,
      });
      await predictionFactory.write.resolvePrediction([0n, 1], {
        account: streamer.account,
      });

      const bal1Before = await publicClient.getBalance({
        address: user1.account.address,
      });
      const bal2Before = await publicClient.getBalance({
        address: user2.account.address,
      });

      // User1: bet=1, totalWin=3, totalLoss=3 => payout = 1 + (1*3)/3 = 2
      // User2: bet=2, totalWin=3, totalLoss=3 => payout = 2 + (2*3)/3 = 4
      const expectedPayout1 = parseEther("2");
      const expectedPayout2 = parseEther("4");
      expect(
        await predictionFactory.read.getPayout([0n, user1.account.address])
      ).to.equal(expectedPayout1);
      expect(
        await predictionFactory.read.getPayout([0n, user2.account.address])
      ).to.equal(expectedPayout2);

      await predictionFactory.write.claimWinnings([0n], {
        account: user1.account,
      });
      await predictionFactory.write.claimWinnings([0n], {
        account: user2.account,
      });

      const bal1After = await publicClient.getBalance({
        address: user1.account.address,
      });
      const bal2After = await publicClient.getBalance({
        address: user2.account.address,
      });

      // Verify balance increased by payout (account for gas)
      expect(
        bal1After - bal1Before >= expectedPayout1 - parseEther("0.01")
      ).to.be.true;
      expect(
        bal2After - bal2Before >= expectedPayout2 - parseEther("0.01")
      ).to.be.true;
    });

    it("getPayout returns correct amount", async function () {
      const { predictionFactory, streamer, user1, user2 } =
        await loadFixture(deployFixture);

      await predictionFactory.write.createPrediction(
        [streamer.account.address, "Test", "A", "B"],
        { account: streamer.account }
      );
      await predictionFactory.write.placeBet([0n, 1], {
        account: user1.account,
        value: parseEther("1"),
      });
      await predictionFactory.write.placeBet([0n, 2], {
        account: user2.account,
        value: parseEther("1"),
      });

      await predictionFactory.write.lockPrediction([0n], {
        account: streamer.account,
      });
      await predictionFactory.write.resolvePrediction([0n, 1], {
        account: streamer.account,
      });

      // User1 bet 1 on winning side (total 1), total loss = 1
      // Payout = 1 + (1*1)/1 = 2
      const payout = await predictionFactory.read.getPayout([
        0n,
        user1.account.address,
      ]);
      expect(payout).to.equal(parseEther("2"));
    });
  });

  describe("Cancel and Refund", function () {
    it("Cancelled prediction allows refunds", async function () {
      const { predictionFactory, streamer, user1, publicClient } =
        await loadFixture(deployFixture);

      await predictionFactory.write.createPrediction(
        [streamer.account.address, "Test", "Yes", "No"],
        { account: streamer.account }
      );
      await predictionFactory.write.placeBet([0n, 1], {
        account: user1.account,
        value: parseEther("1"),
      });

      await predictionFactory.write.cancelPrediction([0n], {
        account: streamer.account,
      });

      const refundAmount = await predictionFactory.read.getRefundAmount([
        0n,
        user1.account.address,
      ]);
      expect(refundAmount).to.equal(parseEther("1"));

      const balBefore = await publicClient.getBalance({
        address: user1.account.address,
      });
      await predictionFactory.write.claimRefund([0n], {
        account: user1.account,
      });
      const balAfter = await publicClient.getBalance({
        address: user1.account.address,
      });

      expect(balAfter - balBefore >= parseEther("0.99")).to.be.true;
    });
  });
});
