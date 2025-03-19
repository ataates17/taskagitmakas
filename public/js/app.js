// Ana uygulama kodu
let provider;
let signer;
let contract;
let userAddress;
let gameCreationData = {}; // Oyun oluşturma verilerini saklamak için

// Modal işlemleri
let selectedMove = null;
let selectedStake = null;

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', async () => {
    // Kontrat adresini göster
    document.getElementById('contract-address').textContent = contractAddress;
    
    // Cüzdana bağlan butonuna tıklandığında
    document.getElementById('connect-wallet').addEventListener('click', connectWallet);
    
    // Oyun oluştur butonuna tıklandığında
    document.getElementById('create-game').addEventListener('click', handleCreateGame);
    
    // Oyunları yenile butonuna tıklandığında
    document.getElementById('refresh-games').addEventListener('click', loadGames);
    
    // Oyuna katıl butonuna tıklandığında
    document.getElementById('join-game').addEventListener('click', handleJoinGame);
    
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

// Oyun oluşturma işleyicisi
async function handleCreateGame() {
    try {
        if (!signer) {
            alert("Lütfen önce cüzdanınızı bağlayın!");
            return;
        }

        // Form değerlerini al
        const moveSelect = document.getElementById('create-move');
        const stakeInput = document.getElementById('create-stake');
        
        const move = parseInt(moveSelect.value);
        const stake = stakeInput.value;

        if (!move || !stake) {
            alert("Lütfen hamle ve bahis miktarını girin!");
            return;
        }

        // Loading mesajı göster
        const resultDiv = document.getElementById('create-result');
        resultDiv.innerHTML = "Oyun oluşturuluyor...";
        resultDiv.className = "result pending";

        // Oyun oluştur
        const receipt = await createGameTransaction(move, stake);
        
        // Başarı mesajı göster
        resultDiv.innerHTML = `Oyun başarıyla oluşturuldu! Transaction: ${receipt.transactionHash}`;
        resultDiv.className = "result success";
        
        // Formu temizle
        moveSelect.value = "";
        stakeInput.value = "";
        
        // Oyun listesini güncelle
        await loadGames();
        
    } catch (error) {
        console.error("Oyun oluşturma hatası:", error);
        // Hata mesajı göster
        const resultDiv = document.getElementById('create-result');
        resultDiv.innerHTML = "Hata: " + error.message;
        resultDiv.className = "result error";
    }
}

// Oyun oluşturma transaction'ı
async function createGameTransaction(move, stake) {
    try {
        if (!move || move < 1 || move > 3) {
            throw new Error("Geçersiz hamle!");
        }

        // Minimum stake kontrolü
        const minStake = await contract.MIN_STAKE();
        const stakeWei = ethers.utils.parseEther(stake.toString());
        if (stakeWei.lt(minStake)) {
            throw new Error(`Minimum bahis miktarı: ${ethers.utils.formatEther(minStake)} ETH`);
        }

        // Aktif oyun sayısı kontrolü
        const activeGames = await contract.getActiveGames(userAddress);
        const maxGames = await contract.MAX_GAMES_PER_USER();
        if (activeGames.gte(maxGames)) {
            throw new Error(`Maksimum ${maxGames} aktif oyununuz olabilir`);
        }

        // Zaman kontrolü
        const nextAllowedTime = await contract.getNextAllowedGameTime(userAddress);
        if (nextAllowedTime.gt(0)) {
            const waitTime = Math.ceil(nextAllowedTime.toNumber() - Date.now() / 1000);
            throw new Error(`Lütfen ${waitTime} saniye bekleyin`);
        }

        // Gas limitini ve fiyatını kontrol et
        const gasPrice = await provider.getGasPrice();
        const gasLimit = await contract.estimateGas.createGame(move, {
            value: stakeWei
        });
        
        console.log("Transaction detayları:", {
            move,
            stakeWei: stakeWei.toString(),
            gasLimit: gasLimit.toString(),
            gasPrice: gasPrice.toString()
        });

        // Move değerini uint8 olarak gönder
        const tx = await contract.createGame(move, {
            value: stakeWei,
            gasLimit: gasLimit.mul(120).div(100), // %20 buffer
            gasPrice: gasPrice
        });
        
        console.log("Transaction gönderildi:", tx.hash);
        
        const receipt = await tx.wait();
        console.log("Transaction onaylandı:", receipt);
        
        if (receipt.status === 0) {
            throw new Error("Transaction başarısız oldu");
        }
        
        return receipt;
        
    } catch (error) {
        console.error("Transaction detaylı hata:", error);
        
        // Kontrat hata mesajını çıkar
        let errorMessage = "Oyun oluşturulurken bir hata oluştu";
        if (error.error && error.error.message) {
            errorMessage = error.error.message;
        } else if (error.message && error.message.includes("execution reverted")) {
            // Revert sebebini bul
            const revertReason = error.message.split("execution reverted:")[1]?.trim() || "Bilinmeyen hata";
            errorMessage = revertReason;
        }
        
        throw new Error(errorMessage);
    }
}

// Oyuna katılma işleyicisi
async function handleJoinGame() {
    const resultDiv = document.getElementById('join-result');
    const joinButton = document.getElementById('join-game');
    
    try {
        joinButton.disabled = true;
        joinButton.textContent = 'İşlem Hazırlanıyor...';
        
        if (!signer) {
            alert("Lütfen önce cüzdanınızı bağlayın!");
            return;
        }

        // Form değerlerini al
        const gameId = document.getElementById('game-id').value;
        const moveSelect = document.getElementById('join-move');
        const stakeInput = document.getElementById('join-stake');
        
        const move = parseInt(moveSelect.value);
        const stake = stakeInput.value;

        if (!gameId || !move || !stake) {
            alert("Lütfen oyun ID, hamle ve bahis miktarını girin!");
            return;
        }

        resultDiv.innerHTML = `
            <div class="loading">
                <p>Transaction hazırlanıyor...</p>
                <div class="spinner"></div>
            </div>
        `;
        resultDiv.className = "result pending";

        const receipt = await joinGameTransaction(gameId, move, stake);
        
        resultDiv.innerHTML = `
            <div class="success">
                <p>Oyuna başarıyla katıldınız!</p>
                <p>Transaction: <a href="https://sepolia.etherscan.io/tx/${receipt.transactionHash}" target="_blank">
                    ${receipt.transactionHash.substring(0, 10)}...
                </a></p>
                <p>Gas kullanımı: ${receipt.gasUsed.toString()}</p>
            </div>
        `;
        resultDiv.className = "result success";
        
        // Formu temizle
        document.getElementById('game-id').value = "";
        moveSelect.value = "1";
        stakeInput.value = "";
        
        // Oyun listesini güncelle
        await loadGames();
        
        // İşlem başarılı olduğunda
        joinButton.textContent = 'Başarılı!';
        setTimeout(() => {
            joinButton.disabled = false;
            joinButton.textContent = 'Oyuna Katıl';
        }, 3000);

    } catch (error) {
        joinButton.disabled = false;
        joinButton.textContent = 'Oyuna Katıl';
        
        resultDiv.innerHTML = `
            <div class="error">
                <p>Hata: ${error.message}</p>
                <p>Lütfen MetaMask ayarlarınızı kontrol edin ve tekrar deneyin.</p>
            </div>
        `;
        resultDiv.className = "result error";
    }
}

// Oyun detaylarını yükle
async function loadGameDetails() {
    try {
        const gameId = document.getElementById('game-id').value;
        if (!gameId) return;
        
        // gameId'yi sayıya çevir ve kontrol et
        const gameIdNum = parseInt(gameId);
        if (isNaN(gameIdNum) || gameIdNum < 0) {
            throw new Error("Geçersiz oyun ID");
        }

        const gameInfo = await contract.getGameInfo(gameIdNum);
        if (!gameInfo || !gameInfo.creator || gameInfo.creator === ethers.constants.AddressZero) {
            throw new Error("Oyun bulunamadı");
        }

        const stake = ethers.utils.formatEther(gameInfo.stake);
        
        // Bahis miktarını güncelle
        document.getElementById('join-stake').value = stake;
    } catch (error) {
        console.error("Oyun detayları yükleme hatası:", error);
        document.getElementById('join-stake').value = "";
        alert("Hata: " + error.message);
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

// Oyunları yükle ve kategorilere ayır
async function loadGames() {
    try {
        if (!contract || !userAddress) return;
        
        const gamesList = document.getElementById('games-list');
        gamesList.innerHTML = '<p>Oyunlar yükleniyor...</p>';
        
        // Toplam oyun sayısını al
        const gameCount = await contract.gameCount();
        console.log("Toplam oyun sayısı:", gameCount.toString());
        
        // Son 30 oyunu kontrol et
        const openGames = [];
        const activeGames = [];
        const finishedGames = [];
        
        const startIndex = Math.max(0, gameCount.toNumber() - 30);
        
        for (let i = gameCount.toNumber() - 1; i >= startIndex; i--) {
            try {
                // Oyun bilgilerini al
                const gameInfo = await contract.getGameInfo(i);
                const gameState = await contract.getGameState(i);
                
                const gameData = {
                    id: i,
                    creator: gameInfo.creator,
                    challenger: gameInfo.challenger,
                    stake: ethers.utils.formatEther(gameInfo.stake),
                    state: gameInfo.state,
                    winner: gameInfo.winner,
                    isUserGame: gameInfo.creator === userAddress || gameInfo.challenger === userAddress
                };
                
                // Oyunları kategorilere ayır
                if (gameInfo.state === 0) { // Created
                    openGames.push(gameData);
                } else if (gameInfo.creator === userAddress || gameInfo.challenger === userAddress) {
                    if (gameInfo.state === 3) { // Finished
                        finishedGames.push(gameData);
                    } else { // Joined or Revealed
                        activeGames.push(gameData);
                    }
                }
            } catch (error) {
                console.error(`Oyun ${i} yüklenirken hata:`, error);
            }
        }
        
        // Oyunları render et
        renderGameTabs(openGames, activeGames, finishedGames);
        
    } catch (error) {
        console.error("Oyunları yükleme hatası:", error);
        document.getElementById('games-list').innerHTML = '<p>Oyunlar yüklenirken hata oluştu.</p>';
    }
}

// Oyunları sekmelere ayırarak render et
function renderGameTabs(openGames, activeGames, finishedGames) {
    const gamesList = document.getElementById('games-list');
    gamesList.innerHTML = '';
    
    // Sekme başlıkları
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'tabs-container';
    
    tabsContainer.innerHTML = `
        <div class="tabs">
            <button class="tab-btn active" data-tab="open-games">Açık Oyunlar <span class="badge">${openGames.length}</span></button>
            <button class="tab-btn" data-tab="active-games">Aktif Oyunlarım <span class="badge">${activeGames.length}</span></button>
            <button class="tab-btn" data-tab="finished-games">Tamamlanan Oyunlarım <span class="badge">${finishedGames.length}</span></button>
        </div>
    `;
    
    // Sekme içerikleri
    const tabContents = document.createElement('div');
    tabContents.className = 'tab-contents';
    
    // Açık oyunlar sekmesi
    const openGamesTab = document.createElement('div');
    openGamesTab.className = 'tab-content active';
    openGamesTab.id = 'open-games';
    openGamesTab.appendChild(renderGamesTable(openGames, 'open'));
    
    // Aktif oyunlar sekmesi
    const activeGamesTab = document.createElement('div');
    activeGamesTab.className = 'tab-content';
    activeGamesTab.id = 'active-games';
    activeGamesTab.appendChild(renderGamesTable(activeGames, 'active'));
    
    // Tamamlanan oyunlar sekmesi
    const finishedGamesTab = document.createElement('div');
    finishedGamesTab.className = 'tab-content';
    finishedGamesTab.id = 'finished-games';
    finishedGamesTab.appendChild(renderGamesTable(finishedGames, 'finished'));
    
    // Sekme içeriklerini ekle
    tabContents.appendChild(openGamesTab);
    tabContents.appendChild(activeGamesTab);
    tabContents.appendChild(finishedGamesTab);
    
    // Sekmeleri ve içerikleri ana container'a ekle
    gamesList.appendChild(tabsContainer);
    gamesList.appendChild(tabContents);
    
    // Sekme değiştirme işlevselliği
    const tabButtons = tabsContainer.querySelectorAll('.tab-btn');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Aktif sekme butonunu değiştir
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Aktif içeriği değiştir
            const tabId = button.getAttribute('data-tab');
            const tabContents = document.querySelectorAll('.tab-content');
            tabContents.forEach(content => content.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
        });
    });
}

// Oyun tablosunu oluştur
function renderGamesTable(games, tableType) {
    if (games.length === 0) {
        const emptyMessage = document.createElement('p');
        
        if (tableType === 'open') {
            emptyMessage.textContent = 'Katılabileceğiniz açık oyun bulunmuyor.';
        } else if (tableType === 'active') {
            emptyMessage.textContent = 'Aktif oyununuz bulunmuyor.';
        } else {
            emptyMessage.textContent = 'Tamamlanan oyununuz bulunmuyor.';
        }
        
        return emptyMessage;
    }
    
    const table = document.createElement('table');
    table.className = 'games-table';
    
    // Tablo başlığı
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>ID</th>
            <th>Oluşturan</th>
            <th>Katılan</th>
            <th>Bahis</th>
            <th>Durum</th>
            <th>İşlem</th>
        </tr>
    `;
    table.appendChild(thead);
    
    // Tablo içeriği
    const tbody = document.createElement('tbody');
    games.forEach(game => {
        const tr = document.createElement('tr');
        
        // Kullanıcının kendi oyunlarını vurgula
        if (game.isUserGame) {
            tr.className = 'user-game';
        }
        
        // Durum metni ve butonlar
        let statusBadge = '';
        let actionButton = '';
        
        switch(game.state) {
            case 0: // Created
                statusBadge = '<span class="status-badge status-created">Oluşturuldu</span>';
                if (game.creator === userAddress) {
                    actionButton = `<button class="btn small danger" onclick="cancelGame(${game.id})">İptal Et</button>`;
                } else {
                    actionButton = `<button class="btn small primary" onclick="prepareJoinGame(${game.id})">Katıl</button>`;
                }
                break;
            case 1: // Joined
                statusBadge = '<span class="status-badge status-joined">Katılındı</span>';
                if (game.creator === userAddress) {
                    actionButton = `<button class="btn small primary" onclick="handleRevealMove(${game.id})">Reveal</button>`;
                } else if (game.challenger === userAddress) {
                    statusBadge = '<span class="status-badge status-joined">Reveal Bekleniyor</span>';
                }
                break;
            case 2: // Revealed
                statusBadge = '<span class="status-badge status-revealed">Açıklandı</span>';
                break;
            case 3: // Finished
                statusBadge = '<span class="status-badge status-finished">Tamamlandı</span>';
                if (game.winner === userAddress) {
                    statusBadge += ' <span class="badge win-badge">Kazandınız!</span>';
                } else if (game.winner !== ethers.constants.AddressZero && 
                          (game.creator === userAddress || game.challenger === userAddress)) {
                    statusBadge += ' <span class="badge lose-badge">Kaybettiniz</span>';
                } else if (game.winner === ethers.constants.AddressZero) {
                    statusBadge += ' <span class="badge draw-badge">Berabere</span>';
                }
                break;
        }
        
        tr.innerHTML = `
            <td>${game.id}</td>
            <td>${shortenAddress(game.creator)}${game.creator === userAddress ? ' <span class="badge user-badge">Siz</span>' : ''}</td>
            <td>${game.challenger ? shortenAddress(game.challenger) + (game.challenger === userAddress ? ' <span class="badge user-badge">Siz</span>' : '') : '-'}</td>
            <td>${game.stake} ETH</td>
            <td>${statusBadge}</td>
            <td>${actionButton}</td>
        `;
        
        tbody.appendChild(tr);
    });
    
    table.appendChild(tbody);
    return table;
}

// Oyuna katılmak için hazırlık
function prepareJoinGame(gameId) {
    document.getElementById('game-id').value = gameId;
    loadGameDetails();
    
    // Sayfayı oyuna katıl bölümüne kaydır
    document.querySelector('section:nth-child(3)').scrollIntoView({ behavior: 'smooth' });
}

// Oyun durumu metni
function getGameStateText(state) {
    switch(state) {
        case 0: return "Katılım Bekliyor";
        case 1: return "Oyun Başladı";
        case 2: return "Hamle Açıklandı";
        case 3: return "Tamamlandı";
        default: return "Bilinmiyor";
    }
}

// Oyun durumu CSS sınıfı
function getGameStateClass(state) {
    switch(state) {
        case 0: return "state-waiting";
        case 1: return "state-active";
        case 2: return "state-revealed";
        case 3: return "state-finished";
        default: return "state-unknown";
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

// Oyun listesini güncelleme fonksiyonu
async function updateGameList() {
    try {
        const contract = new ethers.Contract(contractAddress, contractABI, provider);
        const gameCount = await contract.gameCount();
        
        const gameListElement = document.getElementById("gameList");
        gameListElement.innerHTML = "";
        
        for (let i = gameCount - 1; i >= Math.max(0, gameCount - 10); i--) {
            const game = await contract.games(i);
            const isValid = await contract.isValidGame(i);
            
            if (!isValid) continue;
            
            const gameState = await contract.getGameState(i);
            const gameInfo = document.createElement("div");
            gameInfo.className = "game-info";
            
            let stateText = "";
            switch (gameState.state) {
                case 0: stateText = "Oluşturuldu"; break;
                case 1: stateText = "Katılındı"; break;
                case 2: stateText = "Açıklandı"; break;
                case 3: stateText = "Tamamlandı"; break;
            }
            
            gameInfo.innerHTML = `
                <p>Oyun #${i}</p>
                <p>Oluşturan: ${game.creator}</p>
                <p>Bahis: ${ethers.utils.formatEther(game.stake)} ETH</p>
                <p>Durum: ${stateText}</p>
                ${game.state === 0 ? `
                    <button onclick="joinGamePrompt(${i}, '${ethers.utils.formatEther(game.stake)}')">
                        Oyuna Katıl
                    </button>
                ` : ''}
            `;
            
            gameListElement.appendChild(gameInfo);
        }
    } catch (error) {
        console.error("Oyun listesi güncelleme hatası:", error);
    }
}

// Yeni fonksiyonlar
async function getActiveGames(address) {
    const contract = new ethers.Contract(contractAddress, contractABI, provider);
    return await contract.getActiveGames(address);
}

async function getNextAllowedGameTime(address) {
    const contract = new ethers.Contract(contractAddress, contractABI, provider);
    return await contract.getNextAllowedGameTime(address);
}

async function emergencyWithdraw(gameId) {
    try {
        const signer = provider.getSigner();
        const contract = new ethers.Contract(contractAddress, contractABI, signer);
        const tx = await contract.emergencyWithdraw(gameId);
        await tx.wait();
        console.log("Acil durum çekilmesi başarılı!");
        updateGameList();
    } catch (error) {
        console.error("Acil durum çekilmesi hatası:", error);
    }
}

// Gas fiyatlarını kontrol et
async function checkGasPrices() {
    const block = await provider.getBlock("latest");
    const baseFee = block.baseFeePerGas;
    const gasPrice = await provider.getGasPrice();
    
    console.log("Gas Fiyatları:", {
        baseFee: ethers.utils.formatUnits(baseFee, "gwei") + " gwei",
        currentPrice: ethers.utils.formatUnits(gasPrice, "gwei") + " gwei",
        maxFeePerGas: ethers.utils.formatUnits(baseFee.mul(2), "gwei") + " gwei"
    });

    return {
        baseFee,
        gasPrice,
        maxFeePerGas: baseFee.mul(2)
    };
}

// Transaction göndermeden önce gas kontrolü
async function validateTransaction(value) {
    const gasPrices = await checkGasPrices();
    const balance = await provider.getBalance(userAddress);
    
    // Tahmini gas maliyeti (150,000 gas * current gas price)
    const estimatedGasCost = gasPrices.gasPrice.mul(150000);
    const totalCost = estimatedGasCost.add(value);
    
    if (balance.lt(totalCost)) {
        throw new Error(`Yetersiz bakiye. Gereken: ${ethers.utils.formatEther(totalCost)} ETH`);
    }
    
    return {
        gasPrice: gasPrices.gasPrice,
        gasLimit: 150000
    };
}

// Oyuna katılma transaction'ı
async function joinGameTransaction(gameId, move, stake) {
    try {
        // Move enum kontrolü (1: Rock, 2: Paper, 3: Scissors)
        const moveMap = {
            1: "Rock",
            2: "Paper", 
            3: "Scissors"
        };

        if (!moveMap[move]) {
            throw new Error("Geçersiz hamle! Lütfen Taş (1), Kağıt (2) veya Makas (3) seçin");
        }

        // gameId'yi sayı olarak kontrol et ve BigNumber'a çevir
        const gameIdNum = parseInt(gameId);
        if (isNaN(gameIdNum) || gameIdNum < 0) {
            throw new Error("Geçersiz oyun ID");
        }

        // Move'u uint8 olarak gönder
        const moveValue = ethers.BigNumber.from(move);
        
        // Stake'i BigNumber'a çevir
        const stakeWei = ethers.utils.parseEther(stake.toString());

        // Oyun bilgilerini kontrol et
        const gameInfo = await contract.getGameInfo(gameIdNum);
        console.log("Oyun bilgileri:", {
            creator: gameInfo.creator,
            challenger: gameInfo.challenger,
            stake: ethers.utils.formatEther(gameInfo.stake),
            state: gameInfo.state
        });

        if (gameInfo.creator === ethers.constants.AddressZero) {
            throw new Error("Oyun bulunamadı");
        }

        if (gameInfo.creator === userAddress) {
            throw new Error("Kendi oyununuza katılamazsınız");
        }

        // Oyun durumunu kontrol et
        const gameState = await contract.getGameState(gameIdNum);
        console.log("Oyun durumu:", gameState);

        if (gameState.state !== 0) {
            throw new Error("Bu oyuna katılınamaz");
        }

        // Stake kontrolü
        if (!stakeWei.eq(gameInfo.stake)) {
            throw new Error(`Bahis miktarı ${ethers.utils.formatEther(gameInfo.stake)} ETH olmalı`);
        }

        // Bakiye kontrolü
        const balance = await provider.getBalance(userAddress);
        if (balance.lt(stakeWei)) {
            throw new Error("Yetersiz bakiye");
        }

        // Transaction'ı göndermeden önce son kontroller
        const gameCount = await contract.gameCount();
        console.log("Toplam oyun sayısı:", gameCount.toString());

        // Oyun geçerliliğini kontrol et
        const isValid = await contract.isValidGame(gameIdNum);
        if (!isValid) {
            throw new Error("Bu oyun artık geçerli değil");
        }

        // Aktif oyun sayısını kontrol et
        const activeGames = await contract.getActiveGames(userAddress);
        console.log("Aktif oyun sayısı:", activeGames.toString());

        // Gas fiyatını al ve yüksek tut
        const feeData = await provider.getFeeData();
        console.log("Fee data:", {
            maxFeePerGas: ethers.utils.formatUnits(feeData.maxFeePerGas, "gwei"),
            maxPriorityFeePerGas: ethers.utils.formatUnits(feeData.maxPriorityFeePerGas, "gwei"),
            gasPrice: ethers.utils.formatUnits(feeData.gasPrice, "gwei")
        });

        // Basit transaction parametreleri
        const txParams = {
            value: stakeWei,
            gasLimit: 500000  // Çok yüksek gas limiti
        };

        console.log("Transaction gönderiliyor...");
        const tx = await contract.joinGame(gameIdNum, moveValue, txParams);
        console.log("Transaction gönderildi:", tx.hash);

        // Transaction'ı bekle
        console.log("Transaction onayı bekleniyor...");
        const receipt = await tx.wait(1);
        console.log("Transaction onaylandı:", receipt);

        if (receipt.status === 0) {
            // Hata sebebini bulmaya çalış
            try {
                await provider.call(tx, receipt.blockNumber);
            } catch (error) {
                const reason = error.data || error.message;
                throw new Error("Transaction başarısız oldu: " + reason);
            }
            throw new Error("Transaction başarısız oldu");
        }

        // Oyun durumunu kontrol et
        const gameStateAfter = await contract.getGameState(gameIdNum);
        console.log("Oyun durumu (katılımdan sonra):", gameStateAfter);

        return receipt;

    } catch (error) {
        console.error("Join Transaction detaylı hata:", error);
        
        // Hata mesajını daha anlaşılır hale getir
        let errorMessage = "Oyuna katılırken bir hata oluştu";
        
        if (error.data) {
            // Revert reason'ı bul
            const data = error.data;
            const reason = data.substring(138);
            const decoded = ethers.utils.toUtf8String('0x' + reason);
            errorMessage = decoded;
        } else if (error.message) {
            if (error.message.includes("insufficient funds")) {
                errorMessage = "Yetersiz bakiye";
            } else if (error.message.includes("gas required exceeds")) {
                errorMessage = "Gas limiti çok yüksek";
            } else if (error.message.includes("nonce")) {
                errorMessage = "Lütfen bekleyen işlemlerin tamamlanmasını bekleyin";
            } else if (error.message.includes("execution reverted")) {
                const revertReason = error.message.split("execution reverted:")[1]?.trim() || "Bilinmeyen hata";
                errorMessage = revertReason;
            } else {
                errorMessage = error.message;
            }
        }
        
        throw new Error(errorMessage);
    }
}

// Yeni oyun oluştur ve katıl
async function createAndJoinGame() {
    try {
        // Yeni oyun oluştur
        const createTx = await contract.createGame(1, {
            value: ethers.utils.parseEther("0.001"),
            gasLimit: 300000
        });
        const createReceipt = await createTx.wait();
        console.log("Oyun oluşturuldu:", createReceipt);
        
        // Oyun ID'sini al
        const gameId = await contract.gameCount() - 1;
        console.log("Oluşturulan oyun ID:", gameId.toString());
        
        // Oyuna katıl
        const joinTx = await contract.joinGame(gameId, 2, {
            value: ethers.utils.parseEther("0.001"),
            gasLimit: 300000
        });
        const joinReceipt = await joinTx.wait();
        console.log("Oyuna katılındı:", joinReceipt);
        
        return joinReceipt;
    } catch (error) {
        console.error("Hata:", error);
        throw error;
    }
}

// Test butonu için event listener
document.getElementById('create-and-join').addEventListener('click', async () => {
    const resultDiv = document.getElementById('test-result');
    resultDiv.innerHTML = "Test işlemi başlatılıyor...";
    resultDiv.className = "result pending";
    
    try {
        const receipt = await createAndJoinGame();
        resultDiv.innerHTML = "Test başarılı! Transaction: " + receipt.transactionHash;
        resultDiv.className = "result success";
        
        // Oyun listesini güncelle
        await loadGames();
    } catch (error) {
        resultDiv.innerHTML = "Test başarısız: " + error.message;
        resultDiv.className = "result error";
    }
});

// Reveal işlemi için fonksiyon
async function revealMove(gameId) {
    try {
        const gameIdNum = parseInt(gameId);
        if (isNaN(gameIdNum) || gameIdNum < 0) {
            throw new Error("Geçersiz oyun ID");
        }
        
        // Oyun bilgilerini kontrol et
        const gameInfo = await contract.getGameInfo(gameIdNum);
        
        if (gameInfo.creator !== userAddress) {
            throw new Error("Sadece oyun yaratıcısı reveal yapabilir");
        }
        
        if (gameInfo.state !== 1) { // 1 = Joined state
            throw new Error("Oyun reveal için uygun durumda değil");
        }
        
        console.log("Reveal işlemi başlatılıyor...");
        const tx = await contract.revealMove(gameIdNum, {
            gasLimit: 300000
        });
        
        console.log("Reveal transaction gönderildi:", tx.hash);
        const receipt = await tx.wait(1);
        console.log("Reveal transaction onaylandı:", receipt);
        
        return receipt;
    } catch (error) {
        console.error("Reveal hatası:", error);
        throw error;
    }
}

// Reveal butonu için handler
async function handleRevealMove(gameId) {
    const resultDiv = document.getElementById('join-result');
    resultDiv.innerHTML = "Reveal işlemi başlatılıyor...";
    resultDiv.className = "result pending";
    
    try {
        const receipt = await revealMove(gameId);
        resultDiv.innerHTML = "Reveal başarılı! Transaction: " + receipt.transactionHash;
        resultDiv.className = "result success";
        
        // Oyun listesini güncelle
        await loadGames();
    } catch (error) {
        resultDiv.innerHTML = "Reveal başarısız: " + error.message;
        resultDiv.className = "result error";
    }
}

// Oyunu iptal et
async function cancelGame(gameId) {
    try {
        const gameIdNum = parseInt(gameId);
        if (isNaN(gameIdNum) || gameIdNum < 0) {
            throw new Error("Geçersiz oyun ID");
        }
        
        // Oyun bilgilerini kontrol et
        const gameInfo = await contract.getGameInfo(gameIdNum);
        
        if (gameInfo.creator !== userAddress) {
            throw new Error("Sadece oyun yaratıcısı iptal edebilir");
        }
        
        if (gameInfo.state !== 0) { // 0 = Created state
            throw new Error("Oyun iptal için uygun durumda değil");
        }
        
        console.log("İptal işlemi başlatılıyor...");
        const tx = await contract.cancelGame(gameIdNum, {
            gasLimit: 200000
        });
        
        console.log("İptal transaction gönderildi:", tx.hash);
        const receipt = await tx.wait(1);
        console.log("İptal transaction onaylandı:", receipt);
        
        // Oyun listesini güncelle
        await loadGames();
        
        return receipt;
    } catch (error) {
        console.error("İptal hatası:", error);
        alert("Oyun iptal edilirken hata: " + error.message);
        throw error;
    }
}

// Modal'ı aç
function openCreateGameModal() {
    document.getElementById('create-game-modal').style.display = 'block';
    document.getElementById('modal-overlay').style.display = 'block';
    document.body.style.overflow = 'hidden'; // Sayfanın kaydırılmasını engelle
    
    // Seçimleri sıfırla
    resetModalSelections();
}

// Modal'ı kapat
function closeCreateGameModal() {
    document.getElementById('create-game-modal').style.display = 'none';
    document.getElementById('modal-overlay').style.display = 'none';
    document.body.style.overflow = 'auto'; // Sayfanın kaydırılmasını tekrar etkinleştir
}

// Modal seçimlerini sıfırla
function resetModalSelections() {
    selectedMove = null;
    selectedStake = null;
    
    // Seçimleri temizle
    document.querySelectorAll('.move-option').forEach(option => {
        option.classList.remove('selected');
    });
    
    document.querySelectorAll('.stake-option').forEach(option => {
        option.classList.remove('selected');
    });
    
    document.getElementById('custom-stake').value = '';
    
    // Özet bilgilerini güncelle
    updateSelectionSummary();
    
    // Oluştur butonunu devre dışı bırak
    document.getElementById('modal-create-game').disabled = true;
}

// Seçim özetini güncelle
function updateSelectionSummary() {
    const moveValue = document.querySelector('.selected-move .value');
    const stakeValue = document.querySelector('.selected-stake .value');
    
    // Hamle seçimi
    if (selectedMove === 1) {
        moveValue.textContent = 'Taş';
    } else if (selectedMove === 2) {
        moveValue.textContent = 'Kağıt';
    } else if (selectedMove === 3) {
        moveValue.textContent = 'Makas';
    } else {
        moveValue.textContent = 'Seçilmedi';
    }
    
    // Bahis seçimi
    if (selectedStake) {
        stakeValue.textContent = `${selectedStake} ETH`;
    } else {
        stakeValue.textContent = 'Seçilmedi';
    }
    
    // Oluştur butonunu etkinleştir/devre dışı bırak
    const createButton = document.getElementById('modal-create-game');
    if (selectedMove && selectedStake) {
        createButton.disabled = false;
    } else {
        createButton.disabled = true;
    }
}

// Event listener'ları ekle
document.addEventListener('DOMContentLoaded', function() {
    // Yeni oyun oluştur butonuna tıklandığında
    document.getElementById('create-game').addEventListener('click', function() {
        openCreateGameModal();
    });
    
    // Modal'ı kapatma butonları
    document.querySelector('.close-modal').addEventListener('click', closeCreateGameModal);
    document.querySelector('.cancel-modal').addEventListener('click', closeCreateGameModal);
    document.getElementById('modal-overlay').addEventListener('click', closeCreateGameModal);
    
    // Hamle seçimi
    document.querySelectorAll('.move-option').forEach(option => {
        option.addEventListener('click', function() {
            // Önceki seçimi temizle
            document.querySelectorAll('.move-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            
            // Yeni seçimi işaretle
            this.classList.add('selected');
            selectedMove = parseInt(this.getAttribute('data-move'));
            
            // Özeti güncelle
            updateSelectionSummary();
        });
    });
    
    // Bahis seçimi (hazır opsiyonlar)
    document.querySelectorAll('.stake-option:not(.custom)').forEach(option => {
        option.addEventListener('click', function() {
            // Önceki seçimi temizle
            document.querySelectorAll('.stake-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            
            // Yeni seçimi işaretle
            this.classList.add('selected');
            selectedStake = parseFloat(this.getAttribute('data-stake'));
            
            // Özel girişi temizle
            document.getElementById('custom-stake').value = '';
            
            // Özeti güncelle
            updateSelectionSummary();
        });
    });
    
    // Özel bahis girişi
    document.getElementById('custom-stake').addEventListener('input', function() {
        const value = parseFloat(this.value);
        
        if (value && value >= 0.001) {
            // Önceki seçimi temizle
            document.querySelectorAll('.stake-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            
            // Özel seçeneği işaretle
            this.parentElement.classList.add('selected');
            selectedStake = value;
            
            // Özeti güncelle
            updateSelectionSummary();
        } else {
            selectedStake = null;
            this.parentElement.classList.remove('selected');
            updateSelectionSummary();
        }
    });
    
    // Modal içinde oyun oluştur butonuna tıklandığında
    document.getElementById('modal-create-game').addEventListener('click', async function() {
        if (selectedMove && selectedStake) {
            try {
                // Loading mesajı göster
                const resultDiv = document.getElementById('create-result');
                resultDiv.innerHTML = "Oyun oluşturuluyor...";
                resultDiv.className = "result pending";
                
                // Modal'ı kapat
                closeCreateGameModal();
                
                // Oyun oluştur
                const receipt = await createGameTransaction(selectedMove, selectedStake);
                
                // Başarı mesajı göster
                resultDiv.innerHTML = `Oyun başarıyla oluşturuldu! Transaction: ${receipt.transactionHash}`;
                resultDiv.className = "result success";
                
                // Oyun listesini güncelle
                await loadGames();
                
            } catch (error) {
                console.error("Oyun oluşturma hatası:", error);
                // Hata mesajı göster
                const resultDiv = document.getElementById('create-result');
                resultDiv.innerHTML = "Hata: " + error.message;
                resultDiv.className = "result error";
            }
        }
    });
}); 