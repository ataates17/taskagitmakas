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
    try {
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

        // Loading mesajı göster
        resultDiv.innerHTML = `
            <div class="loading">
                Transaction işleniyor...
                <div class="spinner"></div>
            </div>
        `;
        resultDiv.className = "result pending";

        // Oyuna katıl
        const receipt = await joinGameTransaction(gameId, move, stake);
        
        // Başarı mesajı göster
        resultDiv.innerHTML = `
            Oyuna başarıyla katıldınız!<br>
            Transaction: <a href="https://sepolia.etherscan.io/tx/${receipt.transactionHash}" target="_blank">
                ${receipt.transactionHash.substring(0, 10)}...
            </a>
        `;
        resultDiv.className = "result success";
        
        // Formu temizle
        document.getElementById('game-id').value = "";
        moveSelect.value = "1";
        stakeInput.value = "";
        
        // Oyun listesini güncelle
        await loadGames();
        
    } catch (error) {
        console.error("Oyuna katılma hatası:", error);
        // Hata mesajı göster
        resultDiv.innerHTML = "Hata: " + error.message;
        resultDiv.className = "result error";
    }
}

// Oyuna katılma transaction'ı
async function joinGameTransaction(gameId, move, stake) {
    try {
        if (!move || move < 1 || move > 3) {
            throw new Error("Geçersiz hamle!");
        }

        // gameId'yi BigNumber'a çevir ve kontrol et
        const gameIdBN = ethers.BigNumber.from(gameId);
        console.log("GameID kontrol:", {
            original: gameId,
            asBigNumber: gameIdBN.toString(),
            move: move,
            stake: stake
        });

        // Oyun bilgilerini kontrol et
        const gameInfo = await contract.getGameInfo(gameIdBN);
        console.log("Oyun bilgileri:", {
            creator: gameInfo.creator,
            challenger: gameInfo.challenger,
            stake: ethers.utils.formatEther(gameInfo.stake),
            state: gameInfo.state
        });

        if (!gameInfo || gameInfo.creator === ethers.constants.AddressZero) {
            throw new Error("Oyun bulunamadı");
        }

        // Oyun durumunu kontrol et
        const gameState = await contract.getGameState(gameIdBN);
        console.log("Oyun durumu:", gameState);

        if (gameState.state !== 0) { // 0 = Created
            throw new Error("Bu oyuna katılınamaz");
        }

        // Stake kontrolü
        const stakeWei = ethers.utils.parseEther(stake.toString());
        if (!stakeWei.eq(gameInfo.stake)) {
            throw new Error(`Bahis miktarı ${ethers.utils.formatEther(gameInfo.stake)} ETH olmalı`);
        }

        // Gas fiyatını hesapla
        const gasPrice = await provider.getGasPrice();
        const increasedGasPrice = gasPrice.mul(120).div(100); // %20 artış

        // Transaction parametrelerini hazırla
        const txParams = {
            value: stakeWei,
            gasLimit: 300000, // Sabit gas limiti kullan
            gasPrice: increasedGasPrice
        };

        console.log("Transaction parametreleri:", {
            gameId: gameIdBN.toString(),
            move: move,
            value: ethers.utils.formatEther(stakeWei),
            gasLimit: txParams.gasLimit,
            gasPrice: txParams.gasPrice.toString()
        });

        // Transaction'ı gönder
        const tx = await contract.joinGame(gameIdBN, move, txParams);
        console.log("Transaction gönderildi:", tx.hash);

        // Transaction'ı bekle
        console.log("Transaction onayı bekleniyor...");
        const receipt = await tx.wait(1);
        console.log("Transaction onaylandı:", receipt);

        if (receipt.status === 0) {
            throw new Error("Transaction başarısız oldu");
        }

        return receipt;

    } catch (error) {
        console.error("Join Transaction detaylı hata:", error);

        // Hata mesajını daha anlaşılır hale getir
        let errorMessage = "Oyuna katılırken bir hata oluştu";

        if (error.error && error.error.message) {
            errorMessage = error.error.message;
        } else if (error.message) {
            if (error.message.includes("insufficient funds")) {
                errorMessage = "Yetersiz bakiye";
            } else if (error.message.includes("gas required exceeds")) {
                errorMessage = "Gas limiti çok düşük";
            } else if (error.message.includes("nonce")) {
                errorMessage = "Lütfen biraz bekleyip tekrar deneyin";
            } else if (error.message.includes("arithmetic")) {
                errorMessage = "Geçersiz oyun ID";
            } else if (error.message.includes("execution reverted")) {
                const revertReason = error.message.split("execution reverted:")[1]?.trim() || "Bilinmeyen hata";
                errorMessage = revertReason;
            }
        }

        throw new Error(errorMessage);
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

// Oyunları yükle
async function loadGames() {
    try {
        const gameCount = await contract.gameCount();
        let gamesHtml = '';
        
        if (gameCount.eq(0)) {
            gamesHtml = '<p>Henüz oyun oluşturulmamış.</p>';
        } else {
            // En son 10 oyunu göster
            const start = Math.max(0, gameCount.sub(10).toNumber());
            const end = gameCount.toNumber();
            
            for (let i = start; i < end; i++) {
                const isValid = await contract.isValidGame(i);
                if (!isValid) continue;

                const gameInfo = await contract.getGameInfo(i);
                const stake = ethers.utils.formatEther(gameInfo.stake);
                
                gamesHtml += `
                    <div class="game-item">
                        <h3>Oyun #${i}</h3>
                        <p><strong>Oluşturan:</strong> ${shortenAddress(gameInfo.creator)}</p>
                        <p><strong>Bahis:</strong> ${stake} ETH</p>
                        ${gameInfo.state === 0 ? `
                            <button onclick="prepareJoinGame(${i}, '${stake}')" class="btn secondary">
                                Bu Oyuna Katıl (${stake} ETH)
                            </button>
                        ` : ''}
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

// Oyuna katılmak için hazırlık
function prepareJoinGame(gameId, stake) {
    if (!gameId || isNaN(gameId)) {
        console.error("Geçersiz oyun ID:", gameId);
        return;
    }

    console.log("Oyuna katılım hazırlığı:", { gameId, stake });
    document.getElementById('game-id').value = gameId;
    document.getElementById('join-stake').value = stake;
    document.querySelector('.card:nth-child(3)').scrollIntoView({ behavior: 'smooth' });
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