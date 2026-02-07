// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

/**
 * @title PredictionFactoryUSDC
 * @notice Creates and manages predictions. Bets use USDC (ERC20). Payout uses Twitch-style pari-mutuel formula.
 */
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract PredictionFactoryUSDC {
    enum PredictionStatus {
        Open,
        Locked,
        Resolved,
        Cancelled
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
        uint8 winningOption;
        uint256 lockTimestamp;
    }

    IERC20 public immutable usdc;
    uint256 public nextPredictionId;
    mapping(uint256 => Prediction) public predictions;
    mapping(uint256 => mapping(address => mapping(uint8 => uint256))) public userBets;
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
        if (msg.sender != p.streamer && !streamerModerators[p.streamer][msg.sender]) revert Unauthorized();
        _;
    }

    modifier predictionExists(uint256 predictionId) {
        if (predictions[predictionId].streamer == address(0)) revert PredictionNotFound();
        _;
    }

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }

    function addStreamerModerator(address moderator) external {
        streamerModerators[msg.sender][moderator] = true;
    }

    function removeStreamerModerator(address moderator) external {
        streamerModerators[msg.sender][moderator] = false;
    }

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

    /// @notice Place a bet with USDC. User must approve this contract first.
    function placeBet(uint256 predictionId, uint8 option, uint256 amount) external predictionExists(predictionId) {
        Prediction storage p = predictions[predictionId];
        if (p.status != PredictionStatus.Open) revert InvalidStatus();
        if (option != 1 && option != 2) revert InvalidOption();
        if (amount == 0) revert InvalidAmount();

        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();

        userBets[predictionId][msg.sender][option] += amount;
        if (option == 1) {
            p.totalBetOption1 += amount;
        } else {
            p.totalBetOption2 += amount;
        }
        emit BetPlaced(predictionId, msg.sender, option, amount);
    }

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

    function claimWinnings(uint256 predictionId) external predictionExists(predictionId) {
        Prediction storage p = predictions[predictionId];
        if (p.status != PredictionStatus.Resolved) revert InvalidStatus();

        uint256 bet = userBets[predictionId][msg.sender][p.winningOption];
        if (bet == 0) revert NoBetToClaim();

        uint256 totalWinning = p.winningOption == 1 ? p.totalBetOption1 : p.totalBetOption2;
        uint256 totalLosing = p.winningOption == 1 ? p.totalBetOption2 : p.totalBetOption1;

        userBets[predictionId][msg.sender][p.winningOption] = 0;
        uint256 payout = _calculatePayout(bet, totalWinning, totalLosing);

        if (!usdc.transfer(msg.sender, payout)) revert TransferFailed();
        emit PayoutClaimed(predictionId, msg.sender, payout);
    }

    function claimRefund(uint256 predictionId) external predictionExists(predictionId) {
        Prediction storage p = predictions[predictionId];
        if (p.status != PredictionStatus.Cancelled) revert InvalidStatus();

        uint256 refund1 = userBets[predictionId][msg.sender][1];
        uint256 refund2 = userBets[predictionId][msg.sender][2];
        uint256 totalRefund = refund1 + refund2;
        if (totalRefund == 0) revert NoBetToClaim();

        userBets[predictionId][msg.sender][1] = 0;
        userBets[predictionId][msg.sender][2] = 0;

        if (!usdc.transfer(msg.sender, totalRefund)) revert TransferFailed();
        emit PayoutClaimed(predictionId, msg.sender, totalRefund);
    }

    function _calculatePayout(
        uint256 bet,
        uint256 totalWinningPool,
        uint256 totalLosingPool
    ) internal pure returns (uint256) {
        if (totalLosingPool == 0) return bet;
        uint256 shareOfLosingPool = (bet * totalLosingPool) / totalWinningPool;
        return bet + shareOfLosingPool;
    }

    function getPayout(uint256 predictionId, address user) external view returns (uint256) {
        Prediction storage p = predictions[predictionId];
        if (p.status != PredictionStatus.Resolved) return 0;
        uint256 bet = userBets[predictionId][user][p.winningOption];
        if (bet == 0) return 0;
        uint256 totalWinning = p.winningOption == 1 ? p.totalBetOption1 : p.totalBetOption2;
        uint256 totalLosing = p.winningOption == 1 ? p.totalBetOption2 : p.totalBetOption1;
        return _calculatePayout(bet, totalWinning, totalLosing);
    }

    function getRefundAmount(uint256 predictionId, address user) external view returns (uint256) {
        if (predictions[predictionId].status != PredictionStatus.Cancelled) return 0;
        return userBets[predictionId][user][1] + userBets[predictionId][user][2];
    }

    function canManagePrediction(uint256 predictionId, address account) external view returns (bool) {
        Prediction storage p = predictions[predictionId];
        if (p.streamer == address(0)) return false;
        return account == p.streamer || streamerModerators[p.streamer][account];
    }
}
