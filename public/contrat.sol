// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract RockPaperScissorsV2 {
    enum Move { None, Rock, Paper, Scissors }
    enum GameState { Created, Joined, Revealed, Finished }
    
    struct Game {
        address creator;
        address challenger;
        bytes32 creatorCommitment;  // Şifrelenmiş hamle
        Move challengerMove;
        Move creatorMove;           // Açıklanmış hamle
        uint256 stake;
        GameState state;
        uint256 creationTime;
        uint256 joinTime;
        bytes32 salt;              // Otomatik oluşturulan salt
        address winner;
    }
    
    mapping(uint256 => Game) public games;
    uint256 public gameCount;
    uint256 public timeoutPeriod = 1 days;
    
    // Platform geliri için değişkenler - sabit ve değiştirilemez
    address public constant PLATFORM_WALLET = 0xaf524482ebd10D6017D5106D15a0B6DC986313a8;
    uint256 public constant PLATFORM_FEE_PERCENT = 1; // %1
    uint256 public constant MIN_PLATFORM_FEE = 1; // Minimum 1 wei komisyon
    uint256 public totalPlatformFees;
    
    // Minimum bahis miktarı - 100 wei olarak ayarlandı
    // Bu değer, %1 komisyon için en az 1 wei komisyon alınmasını sağlar
    uint256 public constant MIN_STAKE = 100;
    
    // Oyun başına kullanıcı limiti için mapping
    mapping(address => uint256) public userGameCount;
    uint256 public constant MAX_GAMES_PER_USER = 3;
    
    // Rate limiting için
    mapping(address => uint256) public lastGameCreationTime;
    uint256 public constant GAME_CREATION_COOLDOWN = 5 minutes;
    
    // Oyun başına gas limiti
    uint256 private constant MAX_GAS_LIMIT = 300000;
    
    // Commitment için nonce takibi
    mapping(address => uint256) public userNonces;
    
    // Oyun durumu için ek kontroller
    mapping(uint256 => bool) private gameExists;
    mapping(uint256 => uint256) private gameLastAction;
    uint256 private constant GAME_TIMEOUT = 1 hours;
    
    event GameCreated(uint256 gameId, address creator, uint256 stake);
    event GameJoined(uint256 gameId, address challenger, Move move);
    event GameFinished(uint256 gameId, address winner, uint256 prize);
    event GameCancelled(uint256 gameId);
    event PlatformFeeCollected(uint256 gameId, uint256 amount);
    
    // Reentrancy koruması için
    bool private _locked;
    modifier nonReentrant() {
        require(!_locked, "Reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    // Güvenli transfer için
    function _safeTransfer(address payable recipient, uint256 amount) private {
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Transfer failed");
    }

    // Güvenli hash için
    function _secureHash(Move move, bytes32 salt, address player) private view returns (bytes32) {
        require(move != Move.None, "Invalid move");
        require(player != address(0), "Invalid player address");
        
        return sha256(abi.encodePacked(
            uint8(move),
            salt,
            player,
            "RPS_GAME_V2",
            block.chainid // block.chainid için view gerekli
        ));
    }

    // Güvenli commitment oluşturma
    function _createCommitment(Move move, address player) private view returns (bytes32, bytes32) {
        require(move != Move.None, "Invalid move");
        require(player != address(0), "Invalid player address");
        
        // Salt oluştur - timestamp ve difficulty kullanmıyoruz
        bytes32 salt = keccak256(abi.encodePacked(
            blockhash(block.number - 1),
            player,
            userNonces[player],
            address(this)
        ));
        
        // Commitment oluştur
        bytes32 commitment = keccak256(abi.encodePacked(
            uint8(move),
            salt,
            player,
            block.chainid,
            address(this),
            userNonces[player]
        ));
        
        return (commitment, salt);
    }

    // Input validasyonu için yardımcı fonksiyon
    function _validateGameState(uint256 gameId, Game storage game) private view {
        require(gameExists[gameId], "Game does not exist");
        require(block.timestamp - gameLastAction[gameId] <= GAME_TIMEOUT, "Game timed out");
        require(game.state != GameState.Finished, "Game already finished");
    }

    function createGame(Move move) external payable nonReentrant returns (uint256) {
        require(tx.gasprice <= block.basefee * 2, "Gas price too high");
        require(gasleft() >= MAX_GAS_LIMIT, "Insufficient gas");
        require(msg.value >= MIN_STAKE, "Stake must be at least 100 wei");
        require(msg.value <= 1 ether, "Stake cannot exceed 1 ether");
        require(move == Move.Rock || move == Move.Paper || move == Move.Scissors, "Invalid move");
        
        // Rate limiting kontrolü
        require(
            block.timestamp >= lastGameCreationTime[msg.sender] + GAME_CREATION_COOLDOWN,
            "Please wait before creating another game"
        );
        
        // Kullanıcı oyun limiti kontrolü
        require(
            userGameCount[msg.sender] < MAX_GAMES_PER_USER,
            "Maximum active game limit reached"
        );
        
        // Güvenli commitment oluştur
        (bytes32 commitment, bytes32 salt) = _createCommitment(move, msg.sender);
        
        uint256 gameId = gameCount;
        gameExists[gameId] = true;
        gameLastAction[gameId] = block.timestamp;
        
        games[gameId] = Game({
            creator: msg.sender,
            challenger: address(0),
            creatorCommitment: commitment,
            challengerMove: Move.None,
            creatorMove: Move.None,
            stake: msg.value,
            state: GameState.Created,
            creationTime: block.timestamp,
            joinTime: 0,
            salt: salt,
            winner: address(0)
        });
        
        gameCount++;
        userGameCount[msg.sender]++;
        lastGameCreationTime[msg.sender] = block.timestamp;
        
        emit GameCreated(gameId, msg.sender, msg.value);
        
        return gameId;
    }
    
    function joinGame(uint256 gameId, Move move) external payable nonReentrant {
        require(gasleft() >= 100000, "Insufficient gas"); // Minimum gas limitini düşür
        require(gameId < gameCount && gameId >= gameCount - 100, "Invalid game ID");
        
        Game storage game = games[gameId];
        require(gameExists[gameId], "Game does not exist");
        _validateGameState(gameId, game);
        
        require(game.state == GameState.Created, "Game is not in Created state");
        require(msg.sender != game.creator, "Creator cannot join their own game");
        require(game.challenger == address(0), "Game already has a challenger");
        require(move == Move.Rock || move == Move.Paper || move == Move.Scissors, "Invalid move");
        require(msg.value == game.stake, "Stake amount must match the creator's stake");
        require(block.timestamp <= game.creationTime + 1 days, "Game expired");
        
        // State'i güncelle
        game.challenger = msg.sender;
        game.challengerMove = move;
        game.state = GameState.Joined;
        game.joinTime = block.timestamp;
        
        gameLastAction[gameId] = block.timestamp;
        
        emit GameJoined(gameId, msg.sender, move);
    }
    
    function revealMove(uint256 gameId) external nonReentrant {
        require(gasleft() >= 80000, "Insufficient gas for reveal"); // Reveal için gas limitini düşür
        
        Game storage game = games[gameId];
        _validateGameState(gameId, game);
        
        require(game.state == GameState.Joined, "Game is not in Joined state");
        require(msg.sender == game.creator, "Only creator can reveal move");
        
        _revealMove(gameId);
    }
    
    function _revealMove(uint256 gameId) private {
        Game storage game = games[gameId];
        _validateGameState(gameId, game);
        
        // Input validasyonu
        require(game.state == GameState.Joined, "Game is not in Joined state");
        require(game.creatorCommitment != bytes32(0), "Invalid commitment");
        require(game.salt != bytes32(0), "Invalid salt");
        
        bool moveFound = false;
        Move foundMove = Move.None;
        uint8 attempts = 0;
        
        // Sınırlı sayıda deneme yap
        for (uint8 i = 1; i <= 3 && attempts < 3; i++) {
            attempts++;
            Move move = Move(i);
            
            // Commitment'ı doğrula
            bytes32 testCommitment = keccak256(abi.encodePacked(
                uint8(move),
                game.salt,
                game.creator,
                block.chainid,
                address(this),
                userNonces[game.creator]
            ));
            
            if (testCommitment == game.creatorCommitment) {
                foundMove = move;
                moveFound = true;
                break;
            }
        }
        
        require(moveFound, "Invalid move commitment");
        require(gasleft() >= MAX_GAS_LIMIT / 4, "Insufficient gas for finish");
        
        game.creatorMove = foundMove;
        game.state = GameState.Revealed;
        
        _finishGame(gameId);
        
        gameLastAction[gameId] = block.timestamp;
    }
    
    function _calculatePlatformFee(uint256 amount) private pure returns (uint256) {
        uint256 fee = (amount * PLATFORM_FEE_PERCENT) / 100;
        
        // Eğer hesaplanan komisyon 0 ise ve miktar 0 değilse, minimum komisyonu kullan
        if (fee == 0 && amount > 0) {
            return MIN_PLATFORM_FEE;
        }
        
        return fee;
    }
    
    function _finishGame(uint256 gameId) private {
        Game storage game = games[gameId];
        _validateGameState(gameId, game);
        
        // State değişikliklerini önce yap
        game.state = GameState.Finished;
        
        // Oyun sayılarını güncelle - underflow kontrolü
        if (userGameCount[game.creator] > 0) {
            unchecked {
                userGameCount[game.creator]--;
            }
        }

        Move creatorMove = game.creatorMove;
        Move challengerMove = game.challengerMove;
        
        if (creatorMove == challengerMove) {
            // Beraberlik durumu
            uint256 platformFee = _calculatePlatformFee(game.stake);
            uint256 returnAmount = game.stake - platformFee;
            
            // Önce state'i güncelle
            game.winner = address(0);
            
            // Platform ücretini topla
            if (platformFee > 0) {
                totalPlatformFees += platformFee * 2;
                _safeTransfer(payable(PLATFORM_WALLET), platformFee * 2);
                emit PlatformFeeCollected(gameId, platformFee * 2);
            }
            
            // En son transferleri yap
            _safeTransfer(payable(game.creator), returnAmount);
            _safeTransfer(payable(game.challenger), returnAmount);
            
            emit GameFinished(gameId, address(0), returnAmount);
        }
        else if (
            (creatorMove == Move.Rock && challengerMove == Move.Scissors) ||
            (creatorMove == Move.Paper && challengerMove == Move.Rock) ||
            (creatorMove == Move.Scissors && challengerMove == Move.Paper)
        ) {
            // Creator kazandı
            uint256 totalPrize = 2 * game.stake;
            uint256 platformFee = _calculatePlatformFee(totalPrize);
            uint256 creatorPrize = totalPrize - platformFee;
            
            // Önce state'i güncelle
            game.winner = game.creator;
            
            // Platform ücretini topla
            if (platformFee > 0) {
                totalPlatformFees += platformFee;
                _safeTransfer(payable(PLATFORM_WALLET), platformFee);
                emit PlatformFeeCollected(gameId, platformFee);
            }
            
            // En son transferi yap
            _safeTransfer(payable(game.creator), creatorPrize);
            
            emit GameFinished(gameId, game.creator, creatorPrize);
        }
        else {
            // Challenger kazandı
            uint256 totalPrize = 2 * game.stake;
            uint256 platformFee = _calculatePlatformFee(totalPrize);
            uint256 challengerPrize = totalPrize - platformFee;
            
            // Önce state'i güncelle
            game.winner = game.challenger;
            
            // Platform ücretini topla
            if (platformFee > 0) {
                totalPlatformFees += platformFee;
                _safeTransfer(payable(PLATFORM_WALLET), platformFee);
                emit PlatformFeeCollected(gameId, platformFee);
            }
            
            // En son transferi yap
            _safeTransfer(payable(game.challenger), challengerPrize);
            
            emit GameFinished(gameId, game.challenger, challengerPrize);
        }
        
        // Oyunu bitir
        gameExists[gameId] = false;
        gameLastAction[gameId] = block.timestamp;
    }
    
    function getGameInfo(uint256 gameId) external view returns (
        address creator,
        address challenger,
        uint256 stake,
        GameState state,
        address winner
    ) {
        require(gameId < gameCount, "Game does not exist");
        Game storage game = games[gameId];
        
        return (
            game.creator,
            game.challenger,
            game.stake,
            game.state,
            game.winner
        );
    }
    
    function cancelGame(uint256 gameId) external nonReentrant {
        require(gameId < gameCount, "Game does not exist");
        Game storage game = games[gameId];
        
        require(msg.sender == game.creator, "Only creator can cancel the game");
        require(game.state == GameState.Created, "Game is not in Created state");
        
        // State'i önce güncelle
        game.state = GameState.Finished;
        if (userGameCount[game.creator] > 0) {
            userGameCount[game.creator]--;
        }
        
        // En son transferi yap
        _safeTransfer(payable(game.creator), game.stake);
        
        emit GameCancelled(gameId);
    }
    
    function claimTimeoutAsChallenger(uint256 gameId) external nonReentrant {
        require(gameId < gameCount, "Game does not exist");
        Game storage game = games[gameId];
        
        require(msg.sender == game.challenger, "Only challenger can claim timeout");
        require(game.state == GameState.Joined, "Game is not in Joined state");
        require(block.timestamp > game.joinTime + timeoutPeriod, "Timeout period has not passed yet");
        
        // State'i önce güncelle
        game.state = GameState.Finished;
        game.winner = game.challenger;
        
        // Platform ücreti hesapla
        uint256 totalPrize = 2 * game.stake;
        uint256 platformFee = _calculatePlatformFee(totalPrize);
        uint256 challengerPrize = totalPrize - platformFee;
        
        // Platform ücretini topla
        if (platformFee > 0) {
            totalPlatformFees += platformFee;
            _safeTransfer(payable(PLATFORM_WALLET), platformFee);
            emit PlatformFeeCollected(gameId, platformFee);
        }
        
        // En son transferi yap
        _safeTransfer(payable(game.challenger), challengerPrize);
        
        emit GameFinished(gameId, game.challenger, challengerPrize);
    }
    
    // Platform istatistiklerini görüntüleme
    function getPlatformStats() external view returns (
        address wallet,
        uint256 feePercent,
        uint256 totalFees
    ) {
        return (PLATFORM_WALLET, PLATFORM_FEE_PERCENT, totalPlatformFees);
    }
    
    // Yeni fonksiyon: Oyunun durumunu kontrol etmek için
    function isGameFinished(uint256 gameId) external view returns (bool) {
        require(gameId < gameCount, "Game does not exist");
        return games[gameId].state == GameState.Finished;
    }
    
    // Yeni fonksiyon: Oyunun mevcut durumunu kontrol etmek için
    function getGameState(uint256 gameId) external view returns (
        GameState state,
        bool hasChallenger,
        uint256 stake
    ) {
        require(gameId < gameCount, "Game does not exist");
        Game storage game = games[gameId];
        return (
            game.state,
            game.challenger != address(0),
            game.stake
        );
    }
    
    // Yeni güvenlik fonksiyonları
    function getActiveGames(address user) external view returns (uint256) {
        return userGameCount[user];
    }
    
    function getNextAllowedGameTime(address user) external view returns (uint256) {
        uint256 nextTime = lastGameCreationTime[user] + GAME_CREATION_COOLDOWN;
        return block.timestamp >= nextTime ? 0 : nextTime;
    }
    
    // Yeni güvenlik fonksiyonları
    function isValidGame(uint256 gameId) external view returns (bool) {
        return gameExists[gameId] && 
               block.timestamp - gameLastAction[gameId] <= GAME_TIMEOUT;
    }
    
    function getGameTimeout(uint256 gameId) external view returns (uint256) {
        require(gameExists[gameId], "Game does not exist");
        uint256 lastAction = gameLastAction[gameId];
        if (block.timestamp <= lastAction + GAME_TIMEOUT) {
            return lastAction + GAME_TIMEOUT - block.timestamp;
        }
        return 0;
    }
    
    // Acil durum fonksiyonu
    function emergencyWithdraw(uint256 gameId) external nonReentrant {
        require(gameExists[gameId], "Game does not exist");
        Game storage game = games[gameId];
        require(block.timestamp - gameLastAction[gameId] > GAME_TIMEOUT * 2, "Emergency timeout not reached");
        require(msg.sender == game.creator || msg.sender == game.challenger, "Not a game participant");
        
        // Oyunu iptal et ve paraları iade et
        if (game.state == GameState.Created) {
            _safeTransfer(payable(game.creator), game.stake);
        } else if (game.state == GameState.Joined) {
            uint256 returnAmount = game.stake;
            _safeTransfer(payable(game.creator), returnAmount);
            _safeTransfer(payable(game.challenger), returnAmount);
        }
        
        // Oyunu temizle
        game.state = GameState.Finished;
        gameExists[gameId] = false;
        if (userGameCount[game.creator] > 0) {
            unchecked {
                userGameCount[game.creator]--;
            }
        }
        
        emit GameCancelled(gameId);
    }
} 