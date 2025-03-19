// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract RockPaperScissors {
    enum Move { None, Rock, Paper, Scissors }
    enum GameState { Created, Finished, Cancelled }
    
    struct Game {
        address creator;
        address challenger;
        uint256 stake;
        bytes32 commitHash; // Şifrelenmiş hamle
        string salt; // Tuz değeri (reveal için)
        Move creatorMove;
        Move challengerMove;
        GameState state;
        address winner;
        uint256 createdAt;
        uint256 finishedAt;
    }
    
    mapping(uint256 => Game) public games;
    uint256 public gameCount;
    
    // Kullanıcı başına maksimum aktif oyun sayısı
    uint256 public constant MAX_GAMES_PER_USER = 5;
    
    // Minimum bahis miktarı
    uint256 public MIN_STAKE = 0.001 ether;
    
    // Oyun oluşturma aralığı (saniye)
    uint256 public GAME_CREATION_INTERVAL = 60;
    
    // Kullanıcı başına son oyun oluşturma zamanı
    mapping(address => uint256) public lastGameCreationTime;
    
    // Kullanıcı başına aktif oyun sayısı
    mapping(address => uint256) public activeGamesCount;
    
    // Platform istatistikleri
    uint256 public totalGamesPlayed;
    uint256 public totalEthTraded;
    
    // Olaylar
    event GameCreated(uint256 indexed gameId, address indexed creator, uint256 stake);
    event GameJoined(uint256 indexed gameId, address indexed challenger, uint256 stake);
    event GameFinished(uint256 indexed gameId, address indexed winner, uint256 stake);
    event GameCancelled(uint256 indexed gameId);
    
    // Reentrancy koruması için durum değişkeni
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;

    constructor() {
        _status = _NOT_ENTERED;
    }

    // Daha güvenli reentrancy koruması için modifier
    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
    
    // Oyun oluştur - geliştirilmiş front-running koruması
    function createGame(bytes32 commitHash, string memory salt) external payable {
        require(msg.value >= MIN_STAKE, "Stake too low");
        require(activeGamesCount[msg.sender] < MAX_GAMES_PER_USER, "Too many active games");
        require(block.timestamp >= lastGameCreationTime[msg.sender] + GAME_CREATION_INTERVAL, "Please wait before creating another game");
        
        // Salt değerinin yeterince karmaşık olduğunu kontrol et
        require(bytes(salt).length >= 32, "Salt must be at least 32 characters");
        
        // Salt değerinin benzersiz olduğunu kontrol et
        bytes32 saltHash = keccak256(abi.encodePacked(salt));
        
        // Kullanıcının son 20 oyununu kontrol et
        uint256 startIndex = gameCount > 20 ? gameCount - 20 : 0;
        for (uint256 i = startIndex; i < gameCount; i++) {
            if (games[i].creator == msg.sender && 
                keccak256(abi.encodePacked(games[i].salt)) == saltHash &&
                games[i].state == GameState.Created) {
                revert("Salt already used in an active game");
            }
        }
        
        // Commit hash'in geçerli olduğunu kontrol et
        bool validHash = false;
        for (uint8 m = 1; m <= 3; m++) {
            if (keccak256(abi.encodePacked(m, salt)) == commitHash) {
                validHash = true;
                break;
            }
        }
        require(validHash, "Invalid commit hash");
        
        uint256 gameId = gameCount;
        games[gameId] = Game({
            creator: msg.sender,
            challenger: address(0),
            stake: msg.value,
            commitHash: commitHash,
            salt: salt,
            creatorMove: Move.None, // Henüz açıklanmadı
            challengerMove: Move.None,
            state: GameState.Created,
            winner: address(0),
            createdAt: block.timestamp,
            finishedAt: 0
        });
        
        gameCount++;
        activeGamesCount[msg.sender]++;
        lastGameCreationTime[msg.sender] = block.timestamp;
        
        emit GameCreated(gameId, msg.sender, msg.value);
    }
    
    // Oyuna katıl ve otomatik reveal - reentrancy koruması eklenmiş
    function joinGame(uint256 gameId, Move move) external payable nonReentrant {
        Game storage game = games[gameId];
        
        require(game.state == GameState.Created, "Game not available");
        require(game.creator != msg.sender, "Cannot join your own game");
        require(msg.value == game.stake, "Stake doesn't match");
        require(move == Move.Rock || move == Move.Paper || move == Move.Scissors, "Invalid move");
        
        game.challenger = msg.sender;
        game.challengerMove = move;
        
        // Otomatik reveal işlemi
        Move creatorMove = _revealMove(gameId);
        
        // Kazananı belirle
        _determineWinner(gameId, creatorMove, move);
        
        activeGamesCount[msg.sender]++;
        
        emit GameJoined(gameId, msg.sender, msg.value);
    }
    
    // Hamleyi açıkla - geliştirilmiş doğrulama
    function _revealMove(uint256 gameId) private returns (Move) {
        Game storage game = games[gameId];
        
        // Salt değerini kullanarak hamleyi çöz
        string memory salt = game.salt;
        bytes32 commitHash = game.commitHash;
        
        // Tüm olası hamleleri kontrol et
        for (uint8 m = 1; m <= 3; m++) {
            bytes32 moveHash = keccak256(abi.encodePacked(m, salt));
            if (commitHash == moveHash) {
                Move move = Move(m);
                game.creatorMove = move;
                return move;
            }
        }
        
        // Geçerli hamle bulunamadı
        revert("Invalid move hash");
    }
    
    // Güvenli para transferi için yardımcı fonksiyon
    function _safeTransfer(address payable recipient, uint256 amount) private {
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Transfer failed");
    }
    
    // Kazananı belirle - güvenli transfer ile
    function _determineWinner(uint256 gameId, Move creatorMove, Move challengerMove) private {
        Game storage game = games[gameId];
        
        // Kazananı belirle
        address winner;
        
        if (creatorMove == challengerMove) {
            // Berabere
            winner = address(0);
            
            // Önce durumu güncelle
            game.winner = winner;
            game.state = GameState.Finished;
            game.finishedAt = block.timestamp;
            
            // Aktif oyun sayılarını güncelle
            activeGamesCount[game.creator]--;
            activeGamesCount[game.challenger]--;
            
            // İstatistikleri güncelle
            totalGamesPlayed++;
            totalEthTraded += game.stake * 2;
            
            // Güvenli transfer işlemleri
            _safeTransfer(payable(game.creator), game.stake);
            _safeTransfer(payable(game.challenger), game.stake);
        } else if (
            (creatorMove == Move.Rock && challengerMove == Move.Scissors) ||
            (creatorMove == Move.Paper && challengerMove == Move.Rock) ||
            (creatorMove == Move.Scissors && challengerMove == Move.Paper)
        ) {
            // Oluşturucu kazandı
            winner = game.creator;
            
            // Önce durumu güncelle
            game.winner = winner;
            game.state = GameState.Finished;
            game.finishedAt = block.timestamp;
            
            // Aktif oyun sayılarını güncelle
            activeGamesCount[game.creator]--;
            activeGamesCount[game.challenger]--;
            
            // İstatistikleri güncelle
            totalGamesPlayed++;
            totalEthTraded += game.stake * 2;
            
            // Güvenli transfer işlemi
            _safeTransfer(payable(winner), game.stake * 2);
        } else {
            // Meydan okuyan kazandı
            winner = game.challenger;
            
            // Önce durumu güncelle
            game.winner = winner;
            game.state = GameState.Finished;
            game.finishedAt = block.timestamp;
            
            // Aktif oyun sayılarını güncelle
            activeGamesCount[game.creator]--;
            activeGamesCount[game.challenger]--;
            
            // İstatistikleri güncelle
            totalGamesPlayed++;
            totalEthTraded += game.stake * 2;
            
            // Şimdi transfer işlemini yap
            payable(winner).transfer(game.stake * 2);
        }
        
        emit GameFinished(gameId, winner, game.stake * 2);
    }
    
    // Oyunu iptal et - reentrancy koruması eklenmiş
    function cancelGame(uint256 gameId) external nonReentrant {
        Game storage game = games[gameId];
        
        require(game.state == GameState.Created, "Game cannot be cancelled");
        require(game.creator == msg.sender, "Only creator can cancel");
        
        // Önce durumu güncelle
        game.state = GameState.Cancelled;
        
        // Aktif oyun sayısını güncelle
        activeGamesCount[game.creator]--;
        
        // Şimdi transfer işlemini yap
        payable(game.creator).transfer(game.stake);
        
        emit GameCancelled(gameId);
    }
    
    // Oyun bilgilerini al
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
    
    // Oyun durumunu al
    function getGameState(uint256 gameId) external view returns (
        GameState state,
        uint256 createdAt,
        uint256 finishedAt
    ) {
        Game storage game = games[gameId];
        return (
            game.state,
            game.createdAt,
            game.finishedAt
        );
    }
    
    // Oyun geçerli mi kontrol et
    function isValidGame(uint256 gameId) external view returns (bool) {
        if (gameId >= gameCount) return false;
        Game storage game = games[gameId];
        return game.state != GameState.Cancelled;
    }
    
    // Kullanıcının aktif oyun sayısını al
    function getActiveGames(address user) external view returns (uint256) {
        return activeGamesCount[user];
    }
    
    // Kullanıcının bir sonraki oyun oluşturma zamanını al
    function getNextAllowedGameTime(address user) external view returns (uint256) {
        uint256 nextTime = lastGameCreationTime[user] + GAME_CREATION_INTERVAL;
        if (block.timestamp >= nextTime) return 0;
        return nextTime;
    }
    
    // Platform istatistiklerini al
    function getPlatformStats() external view returns (
        uint256 _totalGamesPlayed,
        uint256 _totalEthTraded
    ) {
        return (totalGamesPlayed, totalEthTraded);
    }
    
    // Zaman aşımı süresi (örneğin 24 saat)
    uint256 public GAME_TIMEOUT_PERIOD = 86400;
    
    // Zaman aşımı nedeniyle oyunu iptal et - geliştirilmiş
    function claimTimeout(uint256 gameId) external nonReentrant {
        Game storage game = games[gameId];
        
        require(game.state == GameState.Created, "Game not in created state");
        require(block.timestamp > game.createdAt + GAME_TIMEOUT_PERIOD, "Timeout period not passed yet");
        
        // Sadece herhangi biri değil, ilgili taraflar iptal edebilir
        require(
            msg.sender == game.creator || 
            (game.challenger != address(0) && msg.sender == game.challenger),
            "Only creator or challenger can claim timeout"
        );
        
        // Önce durumu güncelle
        game.state = GameState.Cancelled;
        
        // Aktif oyun sayısını güncelle
        if (game.creator != address(0)) {
            activeGamesCount[game.creator]--;
        }
        
        emit GameCancelled(gameId);
        
        // Güvenli transfer işlemi
        if (game.creator != address(0)) {
            _safeTransfer(payable(game.creator), game.stake);
        }
    }
} 