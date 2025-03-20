#!/bin/bash

# Layer Edge CLI Node Kurulumu
echo "-------------------------------------"
echo "Layer Edge CLI Node Kurulumu..."
echo "-------------------------------------"

echo "Kurulum başlıyor. Biraz uzun sürebilir..."
sleep 5

echo "Sistem güncelleniyor..."
sudo apt update && sudo apt upgrade -y

echo "Bağımlılıklar kuruluyor..."
sudo apt update && sudo apt install -y build-essential clang pkg-config

echo "Docker kuruluyor..."
if ! command -v docker &> /dev/null; then
    echo "Docker yüklü değil, kuruluyor..."
    sudo apt install -y docker.io
    sudo systemctl enable --now docker
    sudo usermod -aG docker $(whoami)
else
    echo "Docker zaten kurulu."
fi

echo "Go kuruluyor..."
if ! command -v go &> /dev/null; then
    echo "Go yüklü değil, kuruluyor..."
    wget https://go.dev/dl/go1.22.1.linux-amd64.tar.gz
    sudo tar -C /usr/local -xzf go1.22.1.linux-amd64.tar.gz
    echo 'export PATH=$PATH:/usr/local/go/bin' >> $HOME/.profile
    source $HOME/.profile
else
    echo "Go zaten kurulu."
fi

rm -f go1.22.1.linux-amd64.tar.gz

echo "Rust ve Risc0 kuruluyor..."
if ! command -v rustup &> /dev/null; then
    echo "Rust yüklü değil, kuruluyor..."
    curl -L https://sh.rustup.rs -o rustup-init.sh
    chmod +x rustup-init.sh
    ./rustup-init.sh -y
    source "$HOME/.cargo/env"
else
    echo "Rust zaten kurulu."
fi

echo "Risc0 kurulum dosyaları indiriliyor..."
if [ ! -f "$HOME/.cargo/bin/risc0" ]; then
    echo "Risc0 yüklü değil, kuruluyor..."
    curl -L https://risczero.com/install -o risc0-install.sh
    chmod +x risc0-install.sh
    ./risc0-install.sh
else
    echo "Risc0 zaten kurulu."
fi

echo 'export PATH="$HOME/.risc0/bin:$PATH"' >> $HOME/.profile
echo 'export PATH="$HOME/.risc0/bin:$PATH"' >> $HOME/.bashrc
if [ -f "$HOME/.zshrc" ]; then
    echo 'export PATH="$HOME/.risc0/bin:$PATH"' >> $HOME/.zshrc
fi

source $HOME/.profile
if [ -f "$HOME/.bashrc" ]; then
    source "$HOME/.bashrc"
fi
if [ -f "$HOME/.zshrc" ]; then
    source "$HOME/.zshrc"
fi

rm -f rustup-init.sh risc0-install.sh

echo "Risc0 araçları kuruluyor..."
export PATH="$HOME/.risc0/bin:$PATH"
rzup install
rzup --version

echo "Repo klonlanıyor..."
git clone https://github.com/Layer-Edge/light-node.git
cd light-node

echo "Lütfen CLI Node Private Key'inizi girin:"
read -r PRIVATE_KEY

echo "Ortam değişkenleri ayarlanıyor..."
cat <<EOF > .env
GRPC_URL=34.31.74.109:9090
CONTRACT_ADDR=cosmos1ufs3tlq4umljk0qfe8k5ya0x6hpavn897u2cnf9k0en9jr7qarqqt56709
ZK_PROVER_URL=https://layeredge.mintair.xyz/
API_REQUEST_TIMEOUT=100
POINTS_API=https://light-node.layeredge.io
PRIVATE_KEY='$PRIVATE_KEY'
EOF

echo "Risc0 ve Light Node hazırlanıyor..."
cd $HOME/light-node
chmod +x scripts/build-risczero.sh
export PATH="$HOME/.risc0/bin:$PATH"
./scripts/build-risczero.sh
if [ $? -ne 0 ]; then
    echo "Risc0 derleme hatası. Lütfen hata mesajlarını kontrol edin."
    exit 1
fi
sleep 5
go build

echo "Risc0 Servis dosyası oluşturuluyor..."
sudo tee /etc/systemd/system/risc0.service <<EOF
[Unit]
Description=Risc0
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$HOME/light-node
ExecStart=$HOME/light-node/risc0-merkle-service/target/release/host
Restart=always
RestartSec=5
Environment="PATH=/usr/local/go/bin:/usr/bin:/bin:$HOME/.cargo/bin:$HOME/.risc0/bin"

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable risc0
sudo systemctl start risc0

echo "Light Node Servis dosyası oluşturuluyor..."
sudo tee /etc/systemd/system/layer-edge.service <<EOF
[Unit]
Description=Layer Edge Light Node
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$HOME/light-node
ExecStart=$HOME/light-node/light-node
Restart=always
RestartSec=5
EnvironmentFile=$HOME/light-node/.env
Environment="PATH=/usr/local/go/bin:/usr/bin:/bin:$HOME/.cargo/bin:$HOME/.risc0/bin"

[Install]
WantedBy=multi-user.target
EOF

echo "Servis başlatılıyor..."
sudo systemctl daemon-reload
sudo systemctl enable layer-edge
sudo systemctl start layer-edge

echo "Layer Edge CLI Node Kurulumu tamamlandı!"
echo "-------------------------------------"
echo "Node Public key almak için: journalctl -fo cat -u layer-edge (Geç Yüklenebilir!)"
echo "Risc0 kontrol etmek için: journalctl -fo cat -u risc0 (Geç Yüklenebilir!)"
echo "Node durumunu kontrol etmek için: sudo systemctl status layer-edge"
echo "-------------------------------------"