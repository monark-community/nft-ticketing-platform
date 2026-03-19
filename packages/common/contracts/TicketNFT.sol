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
    uint256 public royaltyPercentage;
    string public baseTokenURI;
    mapping(uint256 => uint256) public maxResalePrice;
    mapping(uint256 => uint256) public tokenEventId;

    // Roles
    bytes32 public constant ORGANIZER_ROLE = keccak256("ORGANIZER_ROLE");
    bytes32 public constant SCANNER_ROLE = keccak256("SCANNER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

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
        _grantRole(UPGRADER_ROLE, defaultAdmin);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

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

    // Core functions
    function mintTicket(
        address to,
        uint256 eventId,
        string memory uri,
        uint256 maxPrice
    ) public onlyRole(ORGANIZER_ROLE) {
        tokenIdCounter++;
        uint256 newTokenId = tokenIdCounter;
        _safeMint(to, newTokenId);
        _setTokenURI(newTokenId, uri);
        maxResalePrice[newTokenId] = maxPrice;
        tokenEventId[newTokenId] = eventId;
    }

    function checkInTicket(uint256 tokenId)
    public
    onlyRole(SCANNER_ROLE)
    {
        require(tokenEventId[tokenId] != 0, "Ticket does not exist");
        require(!isUsed[tokenId], "Ticket already used");
        isUsed[tokenId] = true;
    }
}