// Ana uygulama kodu
let provider;
let signer;
let contract;
let userAddress;
let gameCreationData = {}; // Oyun oluşturma verilerini saklamak için

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', async () => {
    // Kontrat adresini göster
    document.getElementById('contract-address').textContent = contractAddress;
    
    // Cüzdana bağlan butonuna tıklandığında
    document.getElementById('connect-wallet').addEventListener('click', connectWallet);
    
    // Oyun oluştur butonuna tıklandığında
    document.getElementById('create-game').addEventListener('click', createGame);
    
    // Oyunları yenile butonuna tıklandığında
    document.getElementById('refresh-games').addEventListener('click', loadGames);
    
    // Oyuna katıl butonuna tıklandığında
    document.getElementById('join-game').addEventListener('click', joinGame);
    
    // Oyun ID'si değiştiğinde
    document.getElementById('game-id').addEventListener('change', loadGameDetails);
    
    // Ethereum sağlayıcısını kontrol et
    if (window.ethereum) {
        provider = new ethers.providers.Web3Provider(window.ethereum);
        contract = new ethers.Contract(contractAddress, contractABI, provider);
        
        // Cüzdan bağlı mı kontrol et
        try {
            const accounts = await provider.listAccounts();
            if (accounts.length > 0) {
                await connectWallet();
            }
        } catch (error) {
            console.error("Cüzdan kontrolü hatası:", error);
        }
        
        // Platform istatistiklerini yükle
        loadPlatformStats();
    } else {
        alert("Ethereum sağlayıcısı bulunamadı. Lütfen MetaMask yükleyin.");
    }
});

// Cüzdana bağlan
async function connectWallet() {
    try {
        await provider.send("eth_requestAccounts", []);
        signer = provider.getSigner();
        userAddress = await signer.getAddress();
        
        // Bağlı cüzdan bilgisini göster
        const walletInfo = document.getElementById('wallet-info');
        walletInfo.textContent = shortenAddress(userAddress);
        walletInfo.style.display = 'block';
        
        // Kontratı signer ile bağla
        contract = new ethers.Contract(contractAddress, contractABI, signer);
        
        // Oyunları yükle
        loadGames();
        
        // Kullanıcı bilgilerini yükle
        loadUserInfo();
        
        return true;
    } catch (error) {
        console.error("Cüzdan bağlantı hatası:", error);
        showResult('create-result', "Cüzdan bağlantı hatası: " + error.message, false);
        return false;
    }
}

// Oyun oluştur
async function createGame() {
    if (!signer) {
        const connected = await connectWallet();
        if (!connected) return;
    }
    
    try {
        const move = document.getElementById('move-select').value;
        const stakeEth = document.getElementById('stake-amount').value;
        const stakeWei = ethToWei(stakeEth);
        
        // Salt değeri oluştur
        const salt = generateRandomSalt();
        
        // Commitment oluştur
        const commitment = await createCommitment(move, salt);
        
        // Oyun oluşturma verilerini sakla
        gameCreationData[commitment] = {
            move: move,
            salt: salt,
            stake: stakeEth
        };
        
        // LocalStorage'a kaydet
        saveToLocalStorage('gameCreationData', gameCreationData);
        
        // Kontrat çağrısı
        const tx = await contract.createGame(commitment, salt, { value: stakeWei });
        
        showResult('create-result', "Oyun oluşturuluyor... İşlem hash: " + tx.hash);
        
        // İşlem onayını bekle
        const receipt = await tx.wait();
        
        // Oyun ID'sini bul
        const gameCreatedEvent = receipt.events.find(e => e.event === 'GameCreated');
        if (gameCreatedEvent) {
            const gameId = gameCreatedEvent.args.gameId.toString();
            showResult('create-result', `Oyun başarıyla oluşturuldu! Oyun ID: ${gameId}`);
            
            // Oyun bilgilerini göster
            const gameInfo = `
                <div class="game-details">
                    <p><strong>Oyun ID:</strong> ${gameId}</p>
                    <p><strong>Hamle:</strong> ${moveToString(move)}</p>
                    <p><strong>Bahis:</strong> ${stakeEth} ETH</p>
                    <p><strong>Salt:</strong> ${salt}</p>
                    <p><strong>Commitment:</strong> ${commitment}</p>
                    <p><em>Bu bilgileri kaydedin! Özellikle salt değeri önemlidir.</em></p>
                </div>
            `;
            
            document.getElementById('create-result').innerHTML += gameInfo;
            
            // Oyunları yenile
            loadGames();
        }
    } catch (error) {
        console.error("Oyun oluşturma hatası:", error);
        showResult('create-result', "Oyun oluşturma hatası: " + error.message, false);
    }
}

// Oyuna katıl
async function joinGame() {
    if (!signer) {
        const connected = await connectWallet();
        if (!connected) return;
    }
    
    try {
        const gameId = document.getElementById('game-id').value;
        const move = document.getElementById('join-move').value;
        const stakeEth = document.getElementById('join-stake').value;
        const stakeWei = ethToWei(stakeEth);
        
        // Kontrat çağrısı
        const tx = await contract.joinGame(gameId, move, { value: stakeWei });
        
        showResult('join-result', "Oyuna katılınıyor... İşlem hash: " + tx.hash);
        
        // İşlem onayını bekle
        const receipt = await tx.wait();
        
        showResult('join-result', "Oyuna başarıyla katıldınız!");
        
        // Oyunları yenile
        loadGames();
    } catch (error) {
        console.error("Oyuna katılma hatası:", error);
        showResult('join-result', "Oyuna katılma hatası: " + error.message, false);
    }
}

// Oyun detaylarını yükle
async function loadGameDetails() {
    try {
        const gameId = document.getElementById('game-id').value;
        if (!gameId) return;
        
        const gameInfo = await contract.getGameInfo(gameId);
        const stake = weiToEth(gameInfo.stake);
        
        // Bahis miktarını güncelle
        document.getElementById('join-stake').value = stake;
    } catch (error) {
        console.error("Oyun detayları yükleme hatası:", error);
    }
}

// Platform istatistiklerini yükle
async function loadPlatformStats() {
    try {
        const stats = await contract.getPlatformStats();
        const platformWallet = stats.wallet;
        const feePercent = stats.feePercent.toString();
        const totalFees = weiToEth(stats.totalFees);
        
        const statsHtml = `
            <div class="stat-item">
                <div class="stat-label">Platform Cüzdanı</div>
                <div class="stat-value">${shortenAddress(platformWallet)}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Komisyon Oranı</div>
                <div class="stat-value">%${feePercent}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Toplam Komisyon</div>
                <div class="stat-value">${totalFees} ETH</div>
            </div>
        `;
        
        document.getElementById('platform-stats').innerHTML = statsHtml;
    } catch (error) {
        console.error("Platform istatistikleri yükleme hatası:", error);
        document.getElementById('platform-stats').innerHTML = `<p>Hata: ${error.message}</p>`;
    }
}

// Oyunları yükle
async function loadGames() {
    try {
        const gameCount = await contract.gameCount();
        let gamesHtml = '';
        
        if (gameCount == 0) {
            gamesHtml = '<p>Henüz oyun oluşturulmamış.</p>';
        } else {
            // En son 10 oyunu göster
            const start = Math.max(0, gameCount - 10);
            const end = gameCount;
            
            for (let i = start; i < end; i++) {
                const gameInfo = await contract.getGameInfo(i);
                const creator = gameInfo.creator;
                const challenger = gameInfo.challenger;
                const stake = weiToEth(gameInfo.stake);
                const state = gameInfo.state;
                const winner = gameInfo.winner;
                
                const stateText = stateToString(state);
                const stateClass = getStateColorClass(state);
                
                gamesHtml += `
                    <div class="game-item ${stateClass}">
                        <h3>Oyun #${i}</h3>
                        <p><strong>Oluşturan:</strong> ${shortenAddress(creator)}</p>
                        <p><strong>Rakip:</strong> ${challenger === '0x0000000000000000000000000000000000000000' ? 'Yok' : shortenAddress(challenger)}</p>
                        <p><strong>Bahis:</strong> ${stake} ETH</p>
                        <p><strong>Durum:</strong> ${stateText}</p>
                        ${winner !== '0x0000000000000000000000000000000000000000' ? `<p><strong>Kazanan:</strong> ${shortenAddress(winner)}</p>` : ''}
                    </div>
                `;
            }
        }
        
        document.getElementById('games-list').innerHTML = gamesHtml;
    } catch (error) {
        console.error("Oyunları yükleme hatası:", error);
        document.getElementById('games-list').innerHTML = `<p>Hata: ${error.message}</p>`;
    }
}

// Kullanıcı bilgilerini yükle
async function loadUserInfo() {
    try {
        // LocalStorage'dan oyun oluşturma verilerini yükle
        const savedData = getFromLocalStorage('gameCreationData');
        if (savedData) {
            gameCreationData = savedData;
        }
    } catch (error) {
        console.error("Kullanıcı bilgileri yükleme hatası:", error);
    }
} 