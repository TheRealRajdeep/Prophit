// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

/**
 * @title PredictionFactory
 * @notice Creates and manages predictions. Streamers or their moderators can create
 * predictions. Payout uses Twitch-style pari-mutuel formula:
 * Payout = bet + (bet / totalWinningPool) * totalLosingPool
 */
contract PredictionFactory {
    enum PredictionStatus {
        Open,      // Accepting bets
        Locked,    // Betting closed, awaiting resolution
        Resolved,  // Winners paid out
        Cancelled  // Refunded
    }

    struct Prediction {
        uint256 id;
        address streamer;
        string title;
        string option1;
        string option2;
        uint256 totalBetOption1;
        uint256 totalBetOption2;
        PredictionStatus status;
        uint8 winningOption; // 1 or 2 when resolved
        uint256 lockTimestamp;
    }

    uint256 public nextPredictionId;
    mapping(uint256 => Prediction) public predictions;

    // predictionId => user => option (1 or 2) => bet amount
    mapping(uint256 => mapping(address => mapping(uint8 => uint256))) public userBets;

    // streamer => moderator => is moderator (all streamer moderators can manage predictions)
    mapping(address => mapping(address => bool)) public streamerModerators;

    event PredictionCreated(
        uint256 indexed predictionId,
        address indexed streamer,
        string title,
        string option1,
        string option2
    );

    event BetPlaced(uint256 indexed predictionId, address indexed user, uint8 option, uint256 amount);
    event PredictionLocked(uint256 indexed predictionId);
    event PredictionResolved(uint256 indexed predictionId, uint8 winningOption);
    event PredictionCancelled(uint256 indexed predictionId);
    event PayoutClaimed(uint256 indexed predictionId, address indexed user, uint256 amount);

    error Unauthorized();
    error InvalidOption();
    error InvalidStatus();
    error InvalidAmount();
    error NoBetToClaim();
    error TransferFailed();
    error PredictionNotFound();

    modifier onlyStreamerOrModerator(uint256 predictionId) {
        Prediction storage p = predictions[predictionId];
        if (p.streamer == address(0)) revert PredictionNotFound();
        if (msg.sender != p.streamer && !streamerModerators[p.streamer][msg.sender]) {
            revert Unauthorized();
        }
        _;
    }

    modifier predictionExists(uint256 predictionId) {
        if (predictions[predictionId].streamer == address(0)) revert PredictionNotFound();
        _;
    }

    /// @notice Streamer adds a global moderator who can create/manage predictions for them
    function addStreamerModerator(address moderator) external {
        streamerModerators[msg.sender][moderator] = true;
    }

    /// @notice Streamer removes a global moderator
    function removeStreamerModerator(address moderator) external {
        streamerModerators[msg.sender][moderator] = false;
    }

    /// @notice Create a new prediction. Caller must be streamer or streamer's moderator
    /// @param streamer The streamer who owns this prediction
    /// @param title Prediction question/title
    /// @param option1 First outcome option
    /// @param option2 Second outcome option
    function createPrediction(
        address streamer,
        string calldata title,
        string calldata option1,
        string calldata option2
    ) external returns (uint256 predictionId) {
        require(msg.sender == streamer || streamerModerators[streamer][msg.sender], "Not streamer or moderator");
        require(bytes(title).length > 0, "Title required");
        require(bytes(option1).length > 0 && bytes(option2).length > 0, "Options required");

        predictionId = nextPredictionId++;
        predictions[predictionId] = Prediction({
            id: predictionId,
            streamer: streamer,
            title: title,
            option1: option1,
            option2: option2,
            totalBetOption1: 0,
            totalBetOption2: 0,
            status: PredictionStatus.Open,
            winningOption: 0,
            lockTimestamp: 0
        });

        emit PredictionCreated(predictionId, streamer, title, option1, option2);
    }

    /// @notice Place a bet on a prediction. Option 1 or 2.
    function placeBet(uint256 predictionId, uint8 option) external payable predictionExists(predictionId) {
        Prediction storage p = predictions[predictionId];
        if (p.status != PredictionStatus.Open) revert InvalidStatus();
        if (option != 1 && option != 2) revert InvalidOption();
        if (msg.value == 0) revert InvalidAmount();

        userBets[predictionId][msg.sender][option] += msg.value;

        if (option == 1) {
            p.totalBetOption1 += msg.value;
        } else {
            p.totalBetOption2 += msg.value;
        }

        emit BetPlaced(predictionId, msg.sender, option, msg.value);
    }

    /// @notice Lock the prediction (stop accepting bets). Streamer or moderator only.
    function lockPrediction(uint256 predictionId)
        external
        predictionExists(predictionId)
        onlyStreamerOrModerator(predictionId)
    {
        Prediction storage p = predictions[predictionId];
        if (p.status != PredictionStatus.Open) revert InvalidStatus();

        p.status = PredictionStatus.Locked;
        p.lockTimestamp = block.timestamp;

        emit PredictionLocked(predictionId);
    }

    /// @notice Resolve the prediction and enable winner payouts. Streamer or moderator only.
    /// @param winningOption 1 or 2 - the winning outcome
    function resolvePrediction(uint256 predictionId, uint8 winningOption)
        external
        predictionExists(predictionId)
        onlyStreamerOrModerator(predictionId)
    {
        Prediction storage p = predictions[predictionId];
        if (p.status != PredictionStatus.Locked) revert InvalidStatus();
        if (winningOption != 1 && winningOption != 2) revert InvalidOption();

        p.status = PredictionStatus.Resolved;
        p.winningOption = winningOption;

        emit PredictionResolved(predictionId, winningOption);
    }

    /// @notice Cancel prediction and refund all bets. Streamer or moderator only.
    function cancelPrediction(uint256 predictionId)
        external
        predictionExists(predictionId)
        onlyStreamerOrModerator(predictionId)
    {
        Prediction storage p = predictions[predictionId];
        if (p.status != PredictionStatus.Open && p.status != PredictionStatus.Locked) revert InvalidStatus();

        p.status = PredictionStatus.Cancelled;

        emit PredictionCancelled(predictionId);
    }

    /// @notice Claim winnings after resolution. Uses Twitch-style payout formula:
    /// Payout = bet + (bet / totalWinningPool) * totalLosingPool
    function claimWinnings(uint256 predictionId) external predictionExists(predictionId) {
        Prediction storage p = predictions[predictionId];
        if (p.status != PredictionStatus.Resolved) revert InvalidStatus();

        uint256 bet = userBets[predictionId][msg.sender][p.winningOption];
        if (bet == 0) revert NoBetToClaim();

        uint256 totalWinning = p.winningOption == 1 ? p.totalBetOption1 : p.totalBetOption2;
        uint256 totalLosing = p.winningOption == 1 ? p.totalBetOption2 : p.totalBetOption1;

        // Clear bet before transfer (reentrancy guard)
        userBets[predictionId][msg.sender][p.winningOption] = 0;

        uint256 payout = _calculatePayout(bet, totalWinning, totalLosing);

        (bool success, ) = payable(msg.sender).call{value: payout}("");
        if (!success) revert TransferFailed();

        emit PayoutClaimed(predictionId, msg.sender, payout);
    }

    /// @notice Claim refund when prediction is cancelled
    function claimRefund(uint256 predictionId) external predictionExists(predictionId) {
        Prediction storage p = predictions[predictionId];
        if (p.status != PredictionStatus.Cancelled) revert InvalidStatus();

        uint256 refund1 = userBets[predictionId][msg.sender][1];
        uint256 refund2 = userBets[predictionId][msg.sender][2];
        uint256 totalRefund = refund1 + refund2;

        if (totalRefund == 0) revert NoBetToClaim();

        userBets[predictionId][msg.sender][1] = 0;
        userBets[predictionId][msg.sender][2] = 0;

        (bool success, ) = payable(msg.sender).call{value: totalRefund}("");
        if (!success) revert TransferFailed();

        emit PayoutClaimed(predictionId, msg.sender, totalRefund);
    }

    /**
     * @dev Twitch-style pari-mutuel payout formula:
     * Payout = bet + (bet / totalWinningPool) * totalLosingPool
     * Each winner gets their stake back plus proportional share of losing pool
     */
    function _calculatePayout(
        uint256 bet,
        uint256 totalWinningPool,
        uint256 totalLosingPool
    ) internal pure returns (uint256) {
        if (totalLosingPool == 0) {
            return bet; // No losing pool, just return stake
        }
        // payout = bet + (bet * totalLosingPool) / totalWinningPool
        // Round down to prevent over-distribution
        uint256 shareOfLosingPool = (bet * totalLosingPool) / totalWinningPool;
        return bet + shareOfLosingPool;
    }

    /// @notice View: Get payout for a user without claiming (for frontend display)
    function getPayout(uint256 predictionId, address user) external view returns (uint256) {
        Prediction storage p = predictions[predictionId];
        if (p.status != PredictionStatus.Resolved) return 0;

        uint256 bet = userBets[predictionId][user][p.winningOption];
        if (bet == 0) return 0;

        uint256 totalWinning = p.winningOption == 1 ? p.totalBetOption1 : p.totalBetOption2;
        uint256 totalLosing = p.winningOption == 1 ? p.totalBetOption2 : p.totalBetOption1;

        return _calculatePayout(bet, totalWinning, totalLosing);
    }

    /// @notice View: Get user's total refund amount when cancelled
    function getRefundAmount(uint256 predictionId, address user) external view returns (uint256) {
        Prediction storage p = predictions[predictionId];
        if (p.status != PredictionStatus.Cancelled) return 0;

        return userBets[predictionId][user][1] + userBets[predictionId][user][2];
    }

    /// @notice View: Check if address can manage prediction (streamer or streamer's moderator)
    function canManagePrediction(uint256 predictionId, address account) external view returns (bool) {
        Prediction storage p = predictions[predictionId];
        if (p.streamer == address(0)) return false;
        return account == p.streamer || streamerModerators[p.streamer][account];
    }

    /// @notice Required to receive ETH for bets
    receive() external payable {}
}
