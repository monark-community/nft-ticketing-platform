// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract TicketNFT is 
    Initializable, 
    ERC721Upgradeable, 
    ERC721URIStorageUpgradeable,
    AccessControlUpgradeable, 
    ERC2981Upgradeable, 
    UUPSUpgradeable 
{
    // State variables
    uint256 private tokenIdCounter;
    mapping(uint256 => bool) public isUsed;
    mapping(uint256 => mapping(address => bool)) private _whitelist;
    mapping(uint256 => bool) public presaleActive;
    uint256 public royaltyPercentage;
    string public baseTokenURI;
    mapping(uint256 => uint256) public maxResalePrice;
    mapping(uint256 => uint256) public tokenEventId;

    // Events
    event TicketMinted(uint256 indexed tokenId, uint256 indexed eventId, address indexed to, string tokenURI);
    event TicketCheckedIn(uint256 indexed tokenId, address indexed scanner);
    event WhitelistUpdated(uint256 indexed eventId, address indexed wallet, bool status);
    event PresaleStatusUpdated(uint256 indexed eventId, bool active);

    // Roles
    bytes32 public constant ORGANIZER_ROLE = keccak256("ORGANIZER_ROLE");
    bytes32 public constant SCANNER_ROLE = keccak256("SCANNER_ROLE");

    // Constructor to disable initializers for the implementation contract
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // Initializer function to set up the contract
    function initialize(address defaultAdmin) public initializer {
        __ERC721_init("NFTicketPass", "NFTP");
        __ERC721URIStorage_init();
        __AccessControl_init();
        __ERC2981_init();

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {}

    function mintTicket(
        address to,
        string memory _tokenURI,
        uint256 eventId,
        uint256 maxPrice
        ) public onlyRole(ORGANIZER_ROLE) {  
        if (presaleActive[eventId]) {
            require(_whitelist[eventId][to], "Address not whitelisted for presale");
        }
        uint256 tokenId = tokenIdCounter;
        tokenIdCounter++;

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, _tokenURI);

        tokenEventId[tokenId] = eventId;

        if (maxPrice > 0) {
            maxResalePrice[tokenId] = maxPrice;
        }

        emit TicketMinted(tokenId, eventId, to, _tokenURI);
    }

    function batchMint(
        address[] memory recipients,
        string[] memory tokenURIs,
        uint256[] memory maxPrices,
        uint256 eventId
        ) public onlyRole(ORGANIZER_ROLE) {
        require(recipients.length > 0, "Must mint at least one ticket");
        require(recipients.length <= 100, "Batch size cannot exceed 100");
        require(
            recipients.length == tokenURIs.length && 
            recipients.length == maxPrices.length,
            "Array lengths must match"
        );

        if (presaleActive[eventId]) {
            for (uint256 i = 0; i < recipients.length; i++) {
                require(_whitelist[eventId][recipients[i]], "Address not whitelisted for presale");
            }
        }
        for (uint256 i = 0; i < recipients.length; i++) {
            uint256 tokenId = tokenIdCounter;
            tokenIdCounter++;

            _safeMint(recipients[i], tokenId);
            _setTokenURI(tokenId, tokenURIs[i]);

            tokenEventId[tokenId] = eventId;

            if (maxPrices[i] > 0) {
                maxResalePrice[tokenId] = maxPrices[i];
            }

            emit TicketMinted(tokenId, eventId, recipients[i], tokenURIs[i]);
        }
    }

    function checkInTicket(uint256 tokenId) public {
        require(
            hasRole(SCANNER_ROLE, msg.sender) || 
            hasRole(ORGANIZER_ROLE, msg.sender) ||
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Not authorized to check in"
        );

        ownerOf(tokenId); 

        require(!isUsed[tokenId], "Ticket already used");
        isUsed[tokenId] = true;
        emit TicketCheckedIn(tokenId, msg.sender);
    }

    function isValidTicket(uint256 tokenId) public view returns (bool) {
        return _ownerOf(tokenId) != address(0) && !isUsed[tokenId];
    }

    function setPresaleActive(uint256 eventId, bool active) 
        public onlyRole(ORGANIZER_ROLE) 
    {
        presaleActive[eventId] = active;
        emit PresaleStatusUpdated(eventId, active);
    }

    function addToWhitelist(uint256 eventId, address wallet) 
        public onlyRole(ORGANIZER_ROLE) 
    {
        _whitelist[eventId][wallet] = true;
        emit WhitelistUpdated(eventId, wallet, true);
    }

    function batchAddToWhitelist(uint256 eventId, address[] memory wallets)
        public onlyRole(ORGANIZER_ROLE)
    {   
        require(wallets.length > 0, "Must provide at least one address");
        require(wallets.length <= 100, "Batch size cannot exceed 100");
        for (uint256 i = 0; i < wallets.length; i++) {
            _whitelist[eventId][wallets[i]] = true;
            emit WhitelistUpdated(eventId, wallets[i], true);
        }
    }

    function removeFromWhitelist(uint256 eventId, address wallet) 
        public onlyRole(ORGANIZER_ROLE) 
    {
        _whitelist[eventId][wallet] = false;
        emit WhitelistUpdated(eventId, wallet, false);
    }

    function isWhitelisted(uint256 eventId, address wallet) 
        public view returns (bool) 
    {
        return _whitelist[eventId][wallet];
    }

    // Overrides functions
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721Upgradeable, ERC721URIStorageUpgradeable)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Upgradeable, ERC721URIStorageUpgradeable, AccessControlUpgradeable, ERC2981Upgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}