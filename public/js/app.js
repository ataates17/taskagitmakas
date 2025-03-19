// Global değişkenler
let provider, signer, contract, userAddress;

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize provider
    provider = new ethers.providers.Web3Provider(window.ethereum);
    
    // Kontrat adresi ve ABI yükleme
    document.getElementById('contract-address').textContent = contractAddress;
    
    // Event listeners
    setupEventListeners();
    
    // Otomatik cüzdan bağlantısı
    try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
            await connectWallet();
        }
    } catch (error) {
        console.error("Otomatik bağlantı hatası:", error);
    }
});

// Event listeners
function setupEventListeners() {
    // Cüzdan bağlantısı
    document.getElementById('connect-wallet').addEventListener('click', connectWallet);
    
    // Oyun oluşturma
    document.getElementById('create-game').addEventListener('click', openCreateGameModal);
    
    // Oyunları yenile
    document.getElementById('refresh-games').addEventListener('click', loadGames);
    
    // Oyun ID değişince detayları yükle
    document.getElementById('game-id').addEventListener('change', loadGameDetails);
    
    // Oyuna katılma butonu
    document.getElementById('join-game').addEventListener('click', handleJoinGame);
    
    // Modal event listeners
    setupModalEventListeners();
}

// Modal event handlers
function setupModalEventListeners() {
    // Modal kapatma butonları
    document.querySelectorAll('.close-modal, .cancel-modal').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(modal => {
                modal.style.display = 'none';
            });
        });
    });
    
    // Oyun oluşturma modal
    const createGameModal = document.getElementById('create-game-modal');
    
    // Hamle seçme
    const moveOptions = document.querySelectorAll('#create-game-modal .move-option');
    moveOptions.forEach(option => {
        option.addEventListener('click', () => {
            // Önceki seçimi kaldır
            moveOptions.forEach(opt => opt.classList.remove('selected'));
            
            // Yeni seçimi ekle
            option.classList.add('selected');
            
            // Seçilen hamleyi göster
            const moveValue = option.dataset.move;
            document.querySelector('#create-game-modal .selected-move .value').textContent = 
                moveValue == "1" ? "Taş" : moveValue == "2" ? "Kağıt" : "Makas";
            
            // Butonları etkinleştir
            const createButton = document.getElementById('modal-create-game');
            createButton.disabled = false;
        });
    });
    
    // Yeni oyun oluştur butonu
    document.getElementById('modal-create-game').addEventListener('click', async () => {
        try {
            const selectedMove = document.querySelector('#create-game-modal .move-option.selected');
            if (!selectedMove) {
                alert("Lütfen bir hamle seçin!");
                return;
            }
            
            const move = selectedMove.dataset.move;
            // Hamleyi bir string olarak al
            const moveString = move == "1" ? "Rock" : move == "2" ? "Paper" : "Scissors";
            
            // Secret oluştur
            const secret = "mySecret";
            
            // moveAndSecret string'ini oluştur
            const moveAndSecret = `${moveString}:${secret}`;
            
            // Commit hash'i oluştur - solidity ile uyumlu olacak şekilde güncellendi
            const commit = ethers.utils.keccak256(
                ethers.utils.solidityPack(
                    ["string", "string"], 
                    [moveString, secret]
                )
            );
            
            console.log("Oluşturulan commit hash:", commit);
            console.log("moveString:", moveString, "secret:", secret);
            
            // Transaction'ı gönder
            document.getElementById('create-result').innerHTML = `
                <div class="loading">
                    <p>Transaction hazırlanıyor...</p>
                    <div class="spinner"></div>
                </div>
            `;
            document.getElementById('create-result').className = "result pending";
            
            const receipt = await createGameTransaction(commit, moveAndSecret);
            
            // Başarılı sonucu göster
            document.getElementById('create-result').innerHTML = `
                <div class="success">
                    <p>Oyun başarıyla oluşturuldu!</p>
                    <p>Transaction: <a href="https://sepolia.etherscan.io/tx/${receipt.transactionHash}" target="_blank">
                        ${receipt.transactionHash.substring(0, 10)}...
                    </a></p>
                    <p>Gas kullanımı: ${receipt.gasUsed.toString()}</p>
                    <p><strong>Önemli:</strong> Hamlenizi ve secret'ınızı unutmayın!</p>
                    <p>Hamle: ${moveString}, Secret: ${secret}</p>
                </div>
            `;
            document.getElementById('create-result').className = "result success";
            
            // Modal'ı kapat
            createGameModal.style.display = 'none';
            
            // Oyunları yenile
            await loadGames();
            
        } catch (error) {
            console.error("Oyun oluşturma hatası:", error);
            document.getElementById('create-result').innerHTML = `
                <div class="error">
                    <p>Hata: ${error.message}</p>
                </div>
            `;
            document.getElementById('create-result').className = "result error";
        }
    });
    
    // Oyuna katılma modal
    const joinGameModal = document.getElementById('join-game-modal');
    
    // Hamle seçme (katılma)
    const joinMoveOptions = document.querySelectorAll('#join-game-modal .move-option');
    joinMoveOptions.forEach(option => {
        option.addEventListener('click', () => {
            // Önceki seçimi kaldır
            joinMoveOptions.forEach(opt => opt.classList.remove('selected'));
            
            // Yeni seçimi ekle
            option.classList.add('selected');
            
            // Seçilen hamleyi göster
            const moveValue = option.dataset.move;
            document.querySelector('#join-game-modal .selected-move .value').textContent = 
                moveValue == "1" ? "Taş" : moveValue == "2" ? "Kağıt" : "Makas";
            
            // Butonları etkinleştir
            document.getElementById('modal-join-game').disabled = false;
        });
    });
    
    // Oyuna katıl butonu (modal)
    document.getElementById('modal-join-game').addEventListener('click', async () => {
        try {
            const selectedMove = document.querySelector('#join-game-modal .move-option.selected');
            if (!selectedMove) {
                alert("Lütfen bir hamle seçin!");
                return;
            }
            
            const gameId = document.getElementById('join-game-id').textContent;
            const move = parseInt(selectedMove.dataset.move);
            
            // Sonuç div'ini hazırla
            const resultDiv = document.getElementById('join-result');
            resultDiv.innerHTML = `
                <div class="loading">
                    <p>Transaction hazırlanıyor...</p>
                    <div class="spinner"></div>
                </div>
            `;
            resultDiv.className = "result pending";
            
            // İşlemi gönder
            const receipt = await joinGameTransaction(gameId, move);
            
            // Başarılı sonucu göster
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
            
            // Modal'ı kapat
            joinGameModal.style.display = 'none';
            
            // Oyunları yenile
            await loadGames();
            
        } catch (error) {
            console.error("Oyuna katılma hatası:", error);
            const resultDiv = document.getElementById('join-result');
            resultDiv.innerHTML = `
                <div class="error">
                    <p>Hata: ${error.message}</p>
                </div>
            `;
            resultDiv.className = "result error";
        }
    });
}

// Modal açma fonksiyonları
function openCreateGameModal() {
    // Modal'ı göster
    const modal = document.getElementById('create-game-modal');
    modal.style.display = 'block';
    
    // Form sıfırla
    document.querySelectorAll('#create-game-modal .move-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    
    document.querySelector('#create-game-modal .selected-move .value').textContent = "Seçilmedi";
    document.getElementById('modal-create-game').disabled = true;
}

function openJoinGameModal(gameId, stake) {
    // Modal'ı göster
    const modal = document.getElementById('join-game-modal');
    modal.style.display = 'block';
    
    // Oyun bilgilerini doldur
    document.getElementById('join-game-id').textContent = gameId;
    document.getElementById('join-game-stake').textContent = stake;
    
    // Form sıfırla
    document.querySelectorAll('#join-game-modal .move-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    
    document.querySelector('#join-game-modal .selected-move .value').textContent = "Seçilmedi";
    document.getElementById('modal-join-game').disabled = true;
}

// Cüzdana bağlan
async function connectWallet() {
    try {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        userAddress = await signer.getAddress();
        
        // Kontrat bağlantısı
        contract = new ethers.Contract(contractAddress, contractABI, signer);
        
        // Kullanıcı adresini göster - HTML yapınıza göre güncellendi
        const walletInfo = document.getElementById('wallet-info');
        if (walletInfo) {
        walletInfo.textContent = shortenAddress(userAddress);
        walletInfo.style.display = 'block';
        }
        
        // Connect butonunu gizle
        const connectButton = document.getElementById('connect-wallet');
        if (connectButton) {
            connectButton.style.display = 'none';
        }
        
        // Oyunları yükle
        await loadGames();
        
        return true;
    } catch (error) {
        console.error("Bağlantı hatası:", error);
        alert("Cüzdan bağlantısı kurulamadı: " + error.message);
        return false;
    }
}

// Oyun oluşturma transaction'ı
async function createGameTransaction(commit, moveAndSecret) {
    try {
        if (!contract) {
            throw new Error("Kontrat bağlantısı yok");
        }

        const stakeInEther = "0.01"; // Sabit stake değeri
        const stake = ethers.utils.parseEther(stakeInEther);

        console.log("Kontrata gönderilen değerler:");
        console.log("- commit:", commit);
        console.log("- moveAndSecret:", moveAndSecret);
        console.log("- stake:", stake.toString());

        const tx = await contract.createGame(commit, moveAndSecret, {
            value: stake,
            gasLimit: 300000
        });
        
        console.log("Transaction gönderildi:", tx.hash);
        
        const receipt = await tx.wait();
        console.log("Transaction onaylandı:", receipt);
        
        if (receipt.status === 0) {
            throw new Error("Transaction başarısız oldu");
        }
        
        // Oluşturulan oyunu kontrol et
        const gameId = await contract.gameCount() - 1;
        const game = await contract.games(gameId);
        
        console.log("Oluşturulan oyun kontrol:", {
            gameId: gameId.toString(),
            creatorCommit: game.creatorCommit,
            moveAndSecret: game.moveAndSecret
        });
        
        // Commit hash'lerini kontrol et
        const storedCommit = game.creatorCommit;
        if (storedCommit.toLowerCase() !== commit.toLowerCase()) {
            console.warn("DİKKAT: Oluşturulan commit hash ile kontrata kaydedilen hash farklı!");
            console.warn("JavaScript commit:", commit);
            console.warn("Kontrat commit:", storedCommit);
        }

        return receipt;

    } catch (error) {
        console.error("Create Transaction detaylı hata:", error);
        throw new Error("Oyun oluştururken bir hata oluştu: " + error.message);
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
            joinButton.disabled = false;
            joinButton.textContent = 'Oyuna Katıl';
            return;
        }

        // Form değerlerini al
        const gameId = document.getElementById('game-id').value;
        const moveSelect = document.getElementById('join-move');
        const stakeInput = document.getElementById('join-stake');
        
        const move = parseInt(moveSelect.value);
        
        if (!gameId || !move) {
            alert("Lütfen oyun ID ve hamle seçin!");
            joinButton.disabled = false;
            joinButton.textContent = 'Oyuna Katıl';
            return;
        }
        
        // Oyun bilgilerini al
        const game = await contract.games(gameId);
        if (game.creator.toLowerCase() === userAddress.toLowerCase()) {
            alert("Kendi oyununuza katılamazsınız!");
            joinButton.disabled = false;
            joinButton.textContent = 'Oyuna Katıl';
            return;
        }
        
        if (game.finished) {
            alert("Bu oyun zaten tamamlanmış!");
            joinButton.disabled = false;
            joinButton.textContent = 'Oyuna Katıl';
            return;
        }

        resultDiv.innerHTML = `
            <div class="loading">
                <p>Transaction hazırlanıyor...</p>
                <div class="spinner"></div>
            </div>
        `;
        resultDiv.className = "result pending";

        // İşlemi gönder
        const receipt = await joinGameTransaction(gameId, move);
        console.log("Transaction onaylandı:", receipt);
        
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
        console.error("Hata:", error);
        resultDiv.innerHTML = `<div class="error">Hata: ${error.message}</div>`;
        resultDiv.className = "result error";
        joinButton.disabled = false;
        joinButton.textContent = 'Oyuna Katıl';
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

        const game = await contract.games(gameIdNum);
        if (!game || !game.creator || game.creator === ethers.constants.AddressZero) {
            throw new Error("Oyun bulunamadı");
        }

        const stake = ethers.utils.formatEther(game.stake);
        
        // Bahis miktarını güncelle
        document.getElementById('join-stake').value = stake;
    } catch (error) {
        console.error("Oyun detayları yükleme hatası:", error);
        document.getElementById('join-stake').value = "";
        alert("Hata: " + error.message);
    }
}

// Oyunları yükle
async function loadGames() {
    try {
        if (!contract) return;
        
        const gamesList = document.getElementById('games-list');
        gamesList.innerHTML = '<p>Oyunlar yükleniyor...</p>';
        
        // Toplam oyun sayısını al
        const gameCount = await contract.gameCount();
        console.log("Toplam oyun sayısı:", gameCount.toString());
        
        if (gameCount.toNumber() === 0) {
            gamesList.innerHTML = '<p>Henüz oyun bulunmuyor.</p>';
            return;
        }
        
        // Tüm oyunları yükle
        const gameItems = [];
        
        for (let i = 0; i < gameCount.toNumber(); i++) {
            try {
                const game = await contract.games(i);
                
                // Oyun bilgilerini oluştur
                const gameItem = document.createElement('div');
                gameItem.className = 'game-item';
                
                // Oyun durumunu belirle
                let status;
                if (game.state == 0) { // Created
                    status = "Açık (Katılım Bekliyor)";
                } else if (game.state == 1) { // Played
                    status = "Oynanmış (Sonuç Bekleniyor)";
                } else if (game.state == 2) { // Finished
                    if (game.winner === ethers.constants.AddressZero) {
                        status = "Berabere";
                    } else if (game.winner === game.creator) {
                        status = "Yaratıcı Kazandı";
                    } else {
                        status = "Rakip Kazandı";
                    }
                }
                
                // Kullanıcının oyunu mu?
                const isUserGame = game.creator.toLowerCase() === userAddress.toLowerCase() || 
                                  game.challenger.toLowerCase() === userAddress.toLowerCase();
                
                // Oyun template'ini oluştur
                gameItem.innerHTML = `
                    <div class="game-header">
                        <div class="game-id">Oyun ID: ${i}</div>
                        <div class="game-stake">${ethers.utils.formatEther(game.stake)} ETH</div>
        </div>
                    <div class="game-details">
                        <div class="creator">Yaratıcı: ${shortenAddress(game.creator)}</div>
                        <div class="challenger">Rakip: ${game.challenger !== ethers.constants.AddressZero ? shortenAddress(game.challenger) : "Bekleniyor"}</div>
                        <div class="status">Durum: ${status}</div>
                        ${game.state == 2 ? `<div class="balance">Bakiyen: ${ethers.utils.formatEther(game.creatorBalance.add(game.challengerBalance))} ETH</div>` : ''}
                    </div>
                    <div id="game-${i}-actions" class="game-actions"></div>
                `;
                
                // Oyun aksiyonlarını ekle
                const gameActions = gameItem.querySelector('.game-actions');
                
                // Açık oyun ve kullanıcı oyunun yaratıcısı değilse "Katıl" butonu ekle
                if (game.state == 0 && // Created 
                    game.challenger === ethers.constants.AddressZero && 
                    game.creator.toLowerCase() !== userAddress.toLowerCase()) {
                    const joinButton = document.createElement('button');
                    joinButton.className = 'btn primary small';
                    joinButton.textContent = 'Katıl';
                    joinButton.addEventListener('click', () => {
                        openJoinGameModal(i, ethers.utils.formatEther(game.stake));
                    });
                    gameActions.appendChild(joinButton);
                }
                
                // Oyun Played durumundaysa ve kullanıcı oyunun bir parçasıysa "Sonucu Göster" butonu ekle
                if (game.state == 1 && isUserGame) {
                    const revealButton = document.createElement('button');
                    revealButton.className = 'btn primary small';
                    revealButton.textContent = 'Sonucu Göster';
                    revealButton.addEventListener('click', () => handleRevealResult(i));
                    gameActions.appendChild(revealButton);
                }
                
                // Oyun Finished durumundaysa ve kullanıcının çekebileceği bakiye varsa "Ödülü Çek" butonu ekle
                if (game.state == 2 && isUserGame) {
                    let userBalance = ethers.BigNumber.from(0);
                    
                    if (game.creator.toLowerCase() === userAddress.toLowerCase()) {
                        userBalance = game.creatorBalance;
                    } else if (game.challenger.toLowerCase() === userAddress.toLowerCase()) {
                        userBalance = game.challengerBalance;
                    }
                    
                    if (userBalance.gt(0)) {
                        const claimButton = document.createElement('button');
                        claimButton.className = 'btn primary small';
                        claimButton.textContent = 'Ödülü Çek';
                        claimButton.addEventListener('click', () => handleClaimReward(i));
                        gameActions.appendChild(claimButton);
                    }
                    
                    // Kazanan bilgisi
                    const winnerText = document.createElement('div');
                    winnerText.className = 'winner-text';
                    if (game.winner === ethers.constants.AddressZero) {
                        winnerText.textContent = 'Berabere!';
                    } else if (game.winner.toLowerCase() === userAddress.toLowerCase()) {
                        winnerText.textContent = 'Tebrikler! Kazandınız!';
                        winnerText.className += ' win';
                } else {
                        winnerText.textContent = 'Üzgünüz, kaybettiniz.';
                        winnerText.className += ' lose';
                    }
                    gameActions.appendChild(winnerText);
                }
                
                gameItems.push(gameItem);
    } catch (error) {
                console.error(`Oyun ${i} yüklenirken hata:`, error);
            }
        }
        
        // Oyunları ekle
        gamesList.innerHTML = '';
        gameItems.forEach(item => {
            gamesList.appendChild(item);
        });
        
    } catch (error) {
        console.error("Oyunları yükleme hatası:", error);
        document.getElementById('games-list').innerHTML = '<p>Oyunlar yüklenirken hata oluştu.</p>';
    }
}

// Oyuna katılma transaction'ı
async function joinGameTransaction(gameId, move) {
    try {
        // Oyun bilgilerini al
        const game = await contract.games(gameId);
        if (game.state != 0) { // 0 = Created state
            throw new Error("Bu oyun zaten tamamlandı veya geçerli değil");
        }
        
        // Stake miktarını kontrol et
        const stake = game.stake;
        if (!stake) {
            throw new Error("Geçersiz bahis miktarı");
        }
        
        console.log("Gönderilen stake miktarı:", ethers.utils.formatEther(stake), "ETH");
        
        // Move değerini kontrol et (1, 2, 3 aralığında olmalı)
        if (move < 1 || move > 3) {
            throw new Error("Geçersiz hamle! 1-Taş, 2-Kağıt, 3-Makas olmalıdır.");
        }
        
        // Oyun verilerini kontrol et
        console.log(`Oyun ${gameId} detayları:`, {
            creator: game.creator,
            creatorCommit: game.creatorCommit,
            moveAndSecret: game.moveAndSecret,
            state: game.state.toString()
        });

        // Farklı bir hash hesaplama yöntemi dene
        const moveAndSecretParts = game.moveAndSecret.split(':');
        if (moveAndSecretParts.length !== 2) {
            console.error("moveAndSecret format hatası:", game.moveAndSecret);
        } else {
            const moveStr = moveAndSecretParts[0];
            const secret = moveAndSecretParts[1];
            
            // Kontratın yaptığı gibi hash hesapla
            const testHash = ethers.utils.solidityKeccak256(
                ["string", "string"],
                [moveStr, secret]
            );
            console.log("Test hash (solidityKeccak256):", testHash);
            console.log("Kontrat commit:", game.creatorCommit);
            console.log("Hash'ler uyumlu mu:", testHash.toLowerCase() === game.creatorCommit.toLowerCase());
        }
        
        console.log(`Oyun ${gameId}'ye katılım: Hamle=${move}`);
        
        // İşlemi gönder - yeni kontratta secret parametresi yok
        const tx = await contract.joinGame(gameId, move, {
            value: stake,
            gasLimit: 300000
        });
        
        console.log("Transaction gönderildi:", tx.hash);

        const receipt = await tx.wait();
        console.log("Transaction onaylandı:", receipt);

        if (receipt.status === 0) {
            throw new Error("Transaction başarısız oldu");
        }

        return receipt;

    } catch (error) {
        console.error("Join Transaction detaylı hata:", error);
        
        // Hatanın daha detaylı analizi
        let errorMessage = "Oyuna katılırken bir hata oluştu: ";
        
        // Kontrat hata mesajını çıkarmaya çalış
        if (error.error && error.error.message) {
            errorMessage += error.error.message;
        } else if (error.data) {
            // Revert sebebini bulmaya çalış
            errorMessage += "Kontrat hatası";
            } else {
            errorMessage += error.message;
        }
        
        throw new Error(errorMessage);
    }
}

// Yardımcı fonksiyonlar
function shortenAddress(address) {
    return address.substring(0, 6) + '...' + address.substring(address.length - 4);
}

// Oyun sonucunu gösterme transaction'ı
async function revealResultTransaction(gameId) {
    try {
        console.log(`Oyun ${gameId} sonucu gösteriliyor`);
        
        const tx = await contract.revealResult(gameId, {
            gasLimit: 300000
        });
        
        console.log("Transaction gönderildi:", tx.hash);
        
        const receipt = await tx.wait();
        console.log("Transaction onaylandı:", receipt);
        
        if (receipt.status === 0) {
            throw new Error("Transaction başarısız oldu");
        }
        
        return receipt;
        
    } catch (error) {
        console.error("Sonuç gösterme hatası:", error);
        
        let errorMessage = "Sonuç gösterilirken bir hata oluştu: ";
        
        if (error.error && error.error.message) {
            errorMessage += error.error.message;
        } else if (error.data) {
            errorMessage += "Kontrat hatası";
        } else {
            errorMessage += error.message;
        }
        
        throw new Error(errorMessage);
    }
}

// Ödül çekme transaction'ı
async function claimRewardTransaction(gameId) {
    try {
        console.log(`Oyun ${gameId} ödülü çekiliyor`);
        
        const tx = await contract.claimReward(gameId, {
            gasLimit: 300000
        });
        
        console.log("Transaction gönderildi:", tx.hash);
        
        const receipt = await tx.wait();
        console.log("Transaction onaylandı:", receipt);
        
        if (receipt.status === 0) {
            throw new Error("Transaction başarısız oldu");
        }
        
        return receipt;
        
    } catch (error) {
        console.error("Ödül çekme hatası:", error);
        
        let errorMessage = "Ödül çekilirken bir hata oluştu: ";
        
        if (error.error && error.error.message) {
            errorMessage += error.error.message;
        } else if (error.data) {
            errorMessage += "Kontrat hatası";
    } else {
            errorMessage += error.message;
        }
        
        throw new Error(errorMessage);
    }
}

// Düğme event handler'ları için yardımcı fonksiyonlar
async function handleRevealResult(gameId) {
    try {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading';
        loadingDiv.innerHTML = `
            <p>Sonuç gösteriliyor...</p>
            <div class="spinner"></div>
        `;
        document.getElementById(`game-${gameId}-actions`).appendChild(loadingDiv);
        
        const receipt = await revealResultTransaction(gameId);
        
        loadingDiv.remove();
        
        alert("Sonuç başarıyla gösterildi!");
        
        // Oyunları yenile
                await loadGames();
                
            } catch (error) {
        console.error("Sonuç gösterme hatası:", error);
        alert("Hata: " + error.message);
    }
}

async function handleClaimReward(gameId) {
    try {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading';
        loadingDiv.innerHTML = `
            <p>Ödül çekiliyor...</p>
            <div class="spinner"></div>
        `;
        document.getElementById(`game-${gameId}-actions`).appendChild(loadingDiv);
        
        const receipt = await claimRewardTransaction(gameId);
        
        loadingDiv.remove();
        
        alert("Ödül başarıyla çekildi!");
        
        // Oyunları yenile
                    await loadGames();
        
    } catch (error) {
        console.error("Ödül çekme hatası:", error);
        alert("Hata: " + error.message);
    }
} 
