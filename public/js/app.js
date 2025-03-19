// Ana uygulama kodu
let provider;
let signer;
let contract;
let userAddress;
let gameCreationData = {}; // Oyun oluşturma verilerini saklamak için

// Modal işlemleri
let selectedMove = null;
let selectedStake = null;

// Otomatik reveal seçeneğini sakla
let autoRevealEnabled = true;

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
        
        // Oyun durumunu dinle ve otomatik reveal yap
        await setupGameEventListeners();
        
        return true;
    } catch (error) {
        console.error("Cüzdan bağlantı hatası:", error);
        showResult('create-result', "Cüzdan bağlantı hatası: " + error.message, false);
        return false;
    }
}

// Oyun oluşturma işleyicisi - artık kullanılmıyor, popup kullanılıyor
async function handleCreateGame() {
    openCreateGameModal();
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

        const receipt = await joinGameTransaction(gameId, move);
        
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
        
        // Reveal gerektiren oyunları kontrol et
        checkGamesForReveal();
        
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
        maxFeePerGas: ethers.utils.formatUnits(baseFee.mul(2), "gwei")
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

// Oyuna katılma işlemi
async function joinGameTransaction(gameId, move) {
    try {
        // Oyun durumunu kontrol et
        const gameState = await contract.getGameState(gameId);
        if (gameState.state !== 0) { // 0: Created
            throw new Error("Bu oyun artık geçerli değil");
        }

        // İşlemi gönder
        const tx = await contract.joinGame(gameId, move, {
            value: ethers.utils.parseEther("0.001"), // Örnek stake değeri
            gasLimit: 300000
        });

        // İşlemi bekle
        const receipt = await tx.wait();
        console.log("Transaction onaylandı:", receipt);

        return receipt;
    } catch (error) {
        console.error("Join Transaction detaylı hata:", error);
        // Hata mesajını kullanıcıya göster
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
    
    // Otomatik reveal seçeneğini varsayılan olarak etkinleştir
    document.getElementById('auto-reveal').checked = true;
    autoRevealEnabled = true;
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
    
    // Otomatik reveal seçeneği değiştiğinde
    document.getElementById('auto-reveal').addEventListener('change', function() {
        autoRevealEnabled = this.checked;
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
                
                // Otomatik reveal seçeneğini sakla
                localStorage.setItem(`autoReveal_${receipt.events[0].args.gameId}`, autoRevealEnabled);
                
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

// Oyun durumunu kontrol et ve gerekirse reveal hatırlatıcısı göster
async function checkGamesForReveal() {
    try {
        if (!contract || !userAddress) return;
        
        // Toplam oyun sayısını al
        const gameCount = await contract.gameCount();
        
        // Son 20 oyunu kontrol et
        for (let i = gameCount.toNumber() - 1; i >= Math.max(0, gameCount.toNumber() - 20); i--) {
            try {
                // Oyun bilgilerini al
                const gameInfo = await contract.getGameInfo(i);
                
                // Eğer oyun yaratıcısı kullanıcı ise ve oyun durumu "Joined" ise
                if (gameInfo.creator === userAddress && gameInfo.state === 1) {
                    // Reveal hatırlatıcısı göster
                    showRevealReminder(i);
                    break; // İlk bulunan oyun için göster
                }
            } catch (error) {
                console.error(`Oyun ${i} kontrol edilirken hata:`, error);
            }
        }
    } catch (error) {
        console.error("Reveal kontrolü hatası:", error);
    }
}

// Reveal hatırlatıcısı göster
function showRevealReminder(gameId) {
    // Eğer zaten bir hatırlatıcı varsa gösterme
    if (document.querySelector('.reveal-reminder')) return;
    
    const reminder = document.createElement('div');
    reminder.className = 'reveal-reminder';
    reminder.innerHTML = `
        <div class="reminder-content">
            <h3>Reveal İşlemi Gerekiyor!</h3>
            <p>Oyun #${gameId} için hamlenizi açıklamanız gerekiyor.</p>
            <button class="btn primary" onclick="handleRevealMove(${gameId})">Şimdi Reveal Et</button>
            <button class="btn outline" onclick="dismissReminder()">Daha Sonra</button>
        </div>
    `;
    
    document.body.appendChild(reminder);
    
    // Animasyon ile göster
    setTimeout(() => {
        reminder.classList.add('show');
    }, 100);
}

// Hatırlatıcıyı kapat
function dismissReminder() {
    const reminder = document.querySelector('.reveal-reminder');
    if (reminder) {
        reminder.classList.remove('show');
        setTimeout(() => {
            reminder.remove();
        }, 300);
    }
}

// Oyuna katılma popup'ını aç
function openJoinGameModal(gameId, stake) {
    // Oyun ID'sini ve bahis miktarını sakla
    selectedGameId = gameId;
    selectedGameStake = stake;
    
    // Modal'ı göster
    document.getElementById('join-game-modal').style.display = 'block';
    document.getElementById('modal-overlay').style.display = 'block';
    
    // Modal başlığını güncelle
    document.querySelector('#join-game-modal .modal-header h3').textContent = `Oyun #${gameId}'e Katıl`;
    
    // Bahis bilgisini göster
    document.querySelector('#join-game-modal .stake-info').textContent = `Bahis: ${stake} ETH`;
    
    // Seçimleri sıfırla
    selectedJoinMove = null;
    document.querySelectorAll('#join-game-modal .move-option').forEach(option => {
        option.classList.remove('selected');
    });
    
    // Katıl butonunu devre dışı bırak
    document.getElementById('modal-join-game').disabled = true;
}

// Oyun durumunu dinle ve otomatik reveal yap
async function setupGameEventListeners() {
    if (!contract || !userAddress) return;
    
    try {
        // GameJoined olayını dinle
        contract.on("GameJoined", async (gameId, challenger, stake, event) => {
            console.log("Oyuna katılım olayı:", { gameId, challenger, stake });
            
            // Oyun bilgilerini kontrol et
            const gameInfo = await contract.getGameInfo(gameId);
            
            // Eğer oyun yaratıcısı kullanıcı ise otomatik reveal yap
            if (gameInfo.creator === userAddress && gameInfo.state === 1) {
                console.log(`Oyun #${gameId} için otomatik reveal başlatılıyor...`);
                
                try {
                    // Kullanıcıya bildirim göster
                    showNotification(`Oyun #${gameId} için otomatik reveal işlemi başlatılıyor...`);
                    
                    // Reveal işlemini gerçekleştir
                    const receipt = await revealMove(gameId);
                    
                    // Başarılı bildirim göster
                    showNotification(`Oyun #${gameId} için reveal işlemi başarıyla tamamlandı!`, "success");
                    
                    // Oyun listesini güncelle
                    await loadGames();
                } catch (error) {
                    console.error("Otomatik reveal hatası:", error);
                    showNotification(`Otomatik reveal başarısız: ${error.message}`, "error");
                }
            }
        });
        
        console.log("Oyun olayları dinleniyor...");
    } catch (error) {
        console.error("Olay dinleyici hatası:", error);
    }
}

// Bildirim göster
function showNotification(message, type = "info") {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-message">${message}</span>
            <button class="notification-close">&times;</button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Animasyon ile göster
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    // Otomatik kapat
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 5000);
    
    // Kapatma butonuna tıklandığında
    notification.querySelector('.notification-close').addEventListener('click', () => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    });
}

document.getElementById('join-game').addEventListener('click', async () => {
    const gameId = parseInt(document.getElementById('game-id').value);
    const move = parseInt(document.getElementById('join-move').value);
    
    // Butonun birden fazla kez tıklanmasını önlemek için devre dışı bırak
    const joinButton = document.getElementById('join-game');
    joinButton.disabled = true;
    
    try {
        await joinGameTransaction(gameId, move);
    } catch (error) {
        console.error("Hata:", error);
    } finally {
        // İşlem tamamlandıktan sonra butonu tekrar etkinleştir
        joinButton.disabled = false;
    }
}); 