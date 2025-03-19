// Zaman aşımı süresi (örneğin 24 saat)
uint256 public timeoutPeriod = 86400;

// Zaman aşımı nedeniyle oyunu iptal et
function claimTimeout(uint256 gameId) external {
    Game storage game = games[gameId];
    
    // Oyun durumunu kontrol et
    require(game.state == GameState.Joined, "Game is not in joined state");
    
    // Zaman aşımını kontrol et
    require(block.timestamp > game.joinTime + timeoutPeriod, "Timeout period not passed yet");
    
    // Meydan okuyan oyuncuya parasını geri gönder
    payable(game.challenger).transfer(game.stake);
    
    // Oyun durumunu güncelle
    game.state = GameState.Cancelled;
    
    emit GameCancelled(gameId);
} 