// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract RockPaperScissorsV4 {
    enum Move { None, Rock, Paper, Scissors }
    enum GameState { Created, Finished }
    
    struct Game {
        address creator;
        address challenger;
        bytes32 creatorCommit;
        Move creatorMove;
        Move challengerMove;
        uint256 stake;
        GameState state;
        address winner;
        string moveAndSecret; // İlk oyuncunun hamle ve secret'ı şifrelenmiş string olarak
    }
    
    mapping(uint256 => Game) public games;
    uint256 public gameCount;

    event GameCreated(uint256 gameId, address indexed creator, uint256 stake);
    event GameFinished(uint256 gameId, Move creatorMove, Move challengerMove, address winner);
    
    function createGame(bytes32 commit, string memory moveAndSecret) external payable {
        require(msg.value > 0, "Stake must be greater than 0");

        uint256 gameId = gameCount++;
        games[gameId] = Game({
            creator: msg.sender,
            challenger: address(0),
            creatorCommit: commit,
            creatorMove: Move.None,
            challengerMove: Move.None,
            stake: msg.value,
            state: GameState.Created,
            winner: address(0),
            moveAndSecret: moveAndSecret
        });

        emit GameCreated(gameId, msg.sender, msg.value);
    }

    function joinGame(uint256 gameId, Move move) external payable {
        Game storage game = games[gameId];
        require(game.state == GameState.Created, "Game must be in Created state");
        require(msg.sender != game.creator, "Creator cannot join their own game");
        require(msg.value == game.stake, "Stake must match");
        require(move != Move.None, "Invalid move");

        game.challenger = msg.sender;
        game.challengerMove = move;
        
        // İlk oyuncunun hamle ve secret'ını ayrıştır
        (Move creatorMove, string memory secret) = parseCreatorMoveAndSecret(game.moveAndSecret);
        
        // Hamlenin commit'e uygun olduğunu doğrula
        require(verifyCommit(creatorMove, secret, game.creatorCommit), "Invalid creator move or secret");
        
        game.creatorMove = creatorMove;
        
        // Determine the winner
        address winner;
        if (creatorMove == move) {
            // It's a tie
            winner = address(0);
            payable(game.creator).transfer(game.stake);
            payable(game.challenger).transfer(game.stake);
        } else if (
            (creatorMove == Move.Rock && move == Move.Scissors) ||
            (creatorMove == Move.Paper && move == Move.Rock) ||
            (creatorMove == Move.Scissors && move == Move.Paper)
        ) {
            // Creator wins
            winner = game.creator;
            payable(game.creator).transfer(2 * game.stake);
        } else {
            // Challenger wins
            winner = game.challenger;
            payable(game.challenger).transfer(2 * game.stake);
        }
        
        game.winner = winner;
        game.state = GameState.Finished;
        
        emit GameFinished(gameId, creatorMove, move, winner);
    }
    
    // İlk oyuncunun hamle ve secret'ını ayrıştır
    function parseCreatorMoveAndSecret(string memory moveAndSecret) private pure returns (Move, string memory) {
        // Expected format: "move:secret"
        bytes memory moveAndSecretBytes = bytes(moveAndSecret);
        uint colonPos = 0;
        
        // Find position of colon
        for (uint i = 0; i < moveAndSecretBytes.length; i++) {
            if (moveAndSecretBytes[i] == ':') {
                colonPos = i;
                break;
            }
        }
        
        require(colonPos > 0, "Invalid format");
        
        // Extract move string and secret
        string memory moveStr = substring(moveAndSecret, 0, colonPos);
        string memory secret = substring(moveAndSecret, colonPos + 1, moveAndSecretBytes.length - colonPos - 1);
        
        // Convert move string to Move enum
        Move move;
        if (keccak256(bytes(moveStr)) == keccak256(bytes("Rock"))) {
            move = Move.Rock;
        } else if (keccak256(bytes(moveStr)) == keccak256(bytes("Paper"))) {
            move = Move.Paper;
        } else if (keccak256(bytes(moveStr)) == keccak256(bytes("Scissors"))) {
            move = Move.Scissors;
        } else {
            revert("Invalid move");
        }
        
        return (move, secret);
    }
    
    // Commit hash'i doğrula
    function verifyCommit(Move move, string memory secret, bytes32 commit) private pure returns (bool) {
        string memory moveStr;
        
        if (move == Move.Rock) {
            moveStr = "Rock";
        } else if (move == Move.Paper) {
            moveStr = "Paper";
        } else if (move == Move.Scissors) {
            moveStr = "Scissors";
        } else {
            return false;
        }
        
        bytes32 computedCommit = keccak256(abi.encodePacked(moveStr, secret));
        return computedCommit == commit;
    }
    
    // String'i belirli bir aralıkta döndür
    function substring(string memory str, uint startIndex, uint length) private pure returns (string memory) {
        bytes memory strBytes = bytes(str);
        
        require(startIndex + length <= strBytes.length, "Out of bounds");
        
        bytes memory result = new bytes(length);
        for (uint i = 0; i < length; i++) {
            result[i] = strBytes[startIndex + i];
        }
        
        return string(result);
    }
}
