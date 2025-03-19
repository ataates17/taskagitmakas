// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract RockPaperScissors {
    enum Move { None, Rock, Paper, Scissors }
    enum GameState { Created, Joined, Revealed, Finished }
    
    struct Game {
        address creator;
        address challenger;
        uint256 stake;
        bytes32 commitHash;
        Move creatorMove;
        Move challengerMove;
        GameState state;
        address winner;
    }
    
    mapping(uint256 => Game) public games;
    uint256 public gameCount;
    
    event GameCreated(uint256 indexed gameId, address indexed creator, uint256 stake);
    event GameJoined(uint256 indexed gameId, address indexed challenger, uint256 stake);
    event GameRevealed(uint256 indexed gameId, Move creatorMove, Move challengerMove, address winner);
    
    // Oyun oluştur
    function createGame(bytes32 commitHash) external payable returns (uint256) {
        require(msg.value > 0, "Stake must be greater than 0");
        
        uint256 gameId = gameCount;
        games[gameId] = Game({
            creator: msg.sender,
            challenger: address(0),
            stake: msg.value,
            commitHash: commitHash,
            creatorMove: Move.None,
            challengerMove: Move.None,
            state: GameState.Created,
            winner: address(0)
        });
        
        gameCount++;
        
        emit GameCreated(gameId, msg.sender, msg.value);
        
        return gameId;
    }
    
    // Oyuna katıl
    function joinGame(uint256 gameId, Move move) external payable {
        Game storage game = games[gameId];
        
        require(game.creator != address(0), "Game does not exist");
        require(game.state == GameState.Created, "Game is not in Created state");
        require(game.creator != msg.sender, "Creator cannot join their own game");
        require(msg.value == game.stake, "Stake must match the game stake");
        require(move > Move.None && move <= Move.Scissors, "Invalid move");
        
        game.challenger = msg.sender;
        game.challengerMove = move;
        game.state = GameState.Joined;
        
        emit GameJoined(gameId, msg.sender, msg.value);
    }
    
    // Hamleyi açıkla ve sonucu belirle
    function revealMove(uint256 gameId, Move move, string memory salt) external {
        Game storage game = games[gameId];
        
        require(game.state == GameState.Joined, "Game is not in Joined state");
        require(game.creator == msg.sender, "Only creator can reveal");
        require(move > Move.None && move <= Move.Scissors, "Invalid move");
        
        // Commit hash'i doğrula
        bytes32 computedHash = keccak256(abi.encodePacked(uint(move), salt));
        require(computedHash == game.commitHash, "Invalid move or salt");
        
        game.creatorMove = move;
        game.state = GameState.Revealed;
        
        // Kazananı belirle
        address winner = determineWinner(game.creatorMove, game.challengerMove, game.creator, game.challenger);
        game.winner = winner;
        game.state = GameState.Finished;
        
        // Ödülü gönder
        uint256 reward = game.stake * 2;
        if (winner == address(0)) {
            // Berabere durumunda her iki oyuncuya da stake'lerini geri gönder
            payable(game.creator).transfer(game.stake);
            payable(game.challenger).transfer(game.stake);
        } else {
            // Kazanan tüm ödülü alır
            payable(winner).transfer(reward);
        }
        
        emit GameRevealed(gameId, game.creatorMove, game.challengerMove, winner);
    }
    
    // Kazananı belirle
    function determineWinner(Move creatorMove, Move challengerMove, address creator, address challenger) internal pure returns (address) {
        if (creatorMove == challengerMove) {
            return address(0); // Berabere
        }
        
        if (
            (creatorMove == Move.Rock && challengerMove == Move.Scissors) ||
            (creatorMove == Move.Paper && challengerMove == Move.Rock) ||
            (creatorMove == Move.Scissors && challengerMove == Move.Paper)
        ) {
            return creator; // Creator kazandı
        } else {
            return challenger; // Challenger kazandı
        }
    }
    
    // Oyun bilgilerini getir
    function getGameInfo(uint256 gameId) external view returns (
        address creator,
        address challenger,
        uint256 stake,
        GameState state,
        address winner
    ) {
        Game storage game = games[gameId];
        return (
            game.creator,
            game.challenger,
            game.stake,
            game.state,
            game.winner
        );
    }
    
    // Oyun sonucunu getir
    function getGameResult(uint256 gameId) external view returns (
        address winner,
        Move creatorMove,
        Move challengerMove
    ) {
        Game storage game = games[gameId];
        require(game.state == GameState.Finished, "Game is not finished");
        
        return (
            game.winner,
            game.creatorMove,
            game.challengerMove
        );
    }
}