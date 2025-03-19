// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract RockPaperScissorsV3 {
    enum Move { None, Rock, Paper, Scissors }
    
    struct Game {
        address creator;
        address challenger;
        bytes32 creatorCommit;
        Move creatorMove;
        Move challengerMove;
        uint256 stake;
        bool finished;
        address winner;
    }
    
    mapping(uint256 => Game) public games;
    uint256 public gameCount;

    event GameCreated(uint256 gameId, address indexed creator, uint256 stake);
    event GameJoined(uint256 gameId, address indexed challenger, Move move);
    event GameFinished(uint256 gameId, address winner, uint256 prize);
    
    function createGame(bytes32 commit) external payable {
        require(msg.value > 0, "Stake must be greater than 0");

        uint256 gameId = gameCount++;
        games[gameId] = Game({
            creator: msg.sender,
            challenger: address(0),
            creatorCommit: commit,
            creatorMove: Move.None,
            challengerMove: Move.None,
            stake: msg.value,
            finished: false,
            winner: address(0)
        });

        emit GameCreated(gameId, msg.sender, msg.value);
    }

    function joinGame(uint256 gameId, Move move, string memory secret) external payable {
        Game storage game = games[gameId];
        require(!game.finished, "Game already finished");
        require(game.challenger == address(0), "Game already joined");
        require(msg.sender != game.creator, "Creator cannot join their own game");
        require(msg.value == game.stake, "Stake must match");
        require(move != Move.None, "Invalid move");

        game.challenger = msg.sender;
        game.challengerMove = move;

        // İlk oyuncunun (creator) hamlesini çözüyoruz.
        Move creatorMove = _revealMove(game.creatorCommit, secret);
        require(creatorMove != Move.None, "Invalid commitment");

        game.creatorMove = creatorMove;

        // Kazananı belirleyelim
        if (creatorMove == move) {
            game.winner = address(0); // Berabere
            payable(game.creator).transfer(game.stake);
            payable(game.challenger).transfer(game.stake);
        } else if (
            (creatorMove == Move.Rock && move == Move.Scissors) ||
            (creatorMove == Move.Paper && move == Move.Rock) ||
            (creatorMove == Move.Scissors && move == Move.Paper)
        ) {
            game.winner = game.creator;
            payable(game.creator).transfer(2 * game.stake);
        } else {
            game.winner = game.challenger;
            payable(game.challenger).transfer(2 * game.stake);
        }

        game.finished = true;
        emit GameFinished(gameId, game.winner, 2 * game.stake);
    }

    function _revealMove(bytes32 commit, string memory secret) private pure returns (Move) {
        bytes32 rockHash = keccak256(abi.encodePacked("Rock", secret));
        bytes32 paperHash = keccak256(abi.encodePacked("Paper", secret));
        bytes32 scissorsHash = keccak256(abi.encodePacked("Scissors", secret));

        if (commit == rockHash) return Move.Rock;
        if (commit == paperHash) return Move.Paper;
        if (commit == scissorsHash) return Move.Scissors;

        return Move.None;
    }
}
