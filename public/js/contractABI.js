// Yeni kontrat ABI'si
const contractABI = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "gameId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "stake",
        "type": "uint256"
      }
    ],
    "name": "GameCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "gameId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "enum RockPaperScissorsV4.Move",
        "name": "creatorMove",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "enum RockPaperScissorsV4.Move",
        "name": "challengerMove",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "winner",
        "type": "address"
      }
    ],
    "name": "GameFinished",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "commit",
        "type": "bytes32"
      },
      {
        "internalType": "string",
        "name": "moveAndSecret",
        "type": "string"
      }
    ],
    "name": "createGame",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "gameCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "games",
    "outputs": [
      {
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "challenger",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "creatorCommit",
        "type": "bytes32"
      },
      {
        "internalType": "enum RockPaperScissorsV4.Move",
        "name": "creatorMove",
        "type": "uint8"
      },
      {
        "internalType": "enum RockPaperScissorsV4.Move",
        "name": "challengerMove",
        "type": "uint8"
      },
      {
        "internalType": "uint256",
        "name": "stake",
        "type": "uint256"
      },
      {
        "internalType": "enum RockPaperScissorsV4.GameState",
        "name": "state",
        "type": "uint8"
      },
      {
        "internalType": "address",
        "name": "winner",
        "type": "address"
      },
      {
        "internalType": "string",
        "name": "moveAndSecret",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "gameId",
        "type": "uint256"
      },
      {
        "internalType": "enum RockPaperScissorsV4.Move",
        "name": "move",
        "type": "uint8"
      }
    ],
    "name": "joinGame",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  }
];

// Sepolia testnet üzerindeki kontrat adresi
const contractAddress = "0xB21FEcD272573Bc2cE67744f1a00258cb464E12e"; // Kontrat adresinizi buraya yazın