// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

contract TicketNFT is 
    Initializable, 
    ERC721Upgradeable, 
    ERC721URIStorageUpgradeable,
    AccessControlUpgradeable, 
    ERC2981Upgradeable, 
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    // State variables
    // Upgradeable contract: only ADD new variables at the end; never reorder or remove (see UPGRADES.md).
    uint256 private tokenIdCounter;
    mapping(uint256 => bool) public isUsed;
    mapping(uint256 => mapping(address => bool)) private _whitelist;
    mapping(uint256 => bool) public presaleActive;
    mapping(uint256 => uint256)public royaltyPercentage;
    string public baseTokenURI;
    mapping(uint256 => uint256) public maxResalePrice; // Deprecated: no longer used, kept for storage layout. Use maxResalePriceOf().
    mapping(uint256 => uint256) public tokenEventId;
    mapping(uint256 => address) public eventOrganizer;
    mapping(uint256 => mapping(address => bool)) public eventScanners;
    address public usdcToken;
    bool public upgradesLocked;

    // Event setup and ticket types: tickets are minted at the moment of purchase.
    struct EventConfig {
        uint256 endTime;
        uint256 resaleCapBps;   // resale cap as % of face value in basis points; 0 = no cap, 11000 = 110%
        uint256 ticketTypeCount;
        uint256 sold;           // paid tickets across all types; event terms lock once this is > 0
        bool configured;
        bool active;
    }

    struct TicketType {
        uint256 price;          // face value, in USDC's smallest unit
        uint256 maxSupply;      // sold + issued can never exceed this
        uint256 sold;           // paid tickets; this type's terms lock once this is > 0
        uint256 issued;         // organizer-issued tickets (e.g. comps)
        string metadataURI;
    }

    mapping(uint256 => EventConfig) public eventConfigs;
    mapping(uint256 => mapping(uint256 => TicketType)) public ticketTypes;
    mapping(uint256 => uint256) public eventRevenue;
    mapping(uint256 => uint256) public tokenTicketType;
    mapping(uint256 => uint256) public tokenFaceValue;

    // Events
    event TicketMinted(uint256 indexed tokenId, uint256 indexed eventId, uint256 typeId, address indexed to, string tokenURI);
    event TicketCheckedIn(uint256 indexed tokenId, address indexed scanner);
    event WhitelistUpdated(uint256 indexed eventId, address indexed wallet, bool status);
    event PresaleStatusUpdated(uint256 indexed eventId, bool active);
    event TicketResold(uint256 indexed tokenId, address indexed from, address indexed to, uint256 price);
    event ScannerUpdated(uint256 indexed eventId, address indexed wallet, bool status);
    event UpgradesLocked(address indexed by);
    event EventConfigured(uint256 indexed eventId, address indexed organizer, uint256 endTime, uint256 royaltyBps, uint256 resaleCapBps);
    event TicketTypeConfigured(uint256 indexed eventId, uint256 indexed typeId, uint256 price, uint256 maxSupply, string metadataURI);
    event SaleStatusUpdated(uint256 indexed eventId, bool active);
    event TicketPurchased(uint256 indexed tokenId, uint256 indexed eventId, uint256 typeId, address indexed buyer, uint256 price);
    event RevenueWithdrawn(uint256 indexed eventId, address indexed organizer, uint256 amount);

    // Roles
    bytes32 public constant ORGANIZER_ROLE = keccak256("ORGANIZER_ROLE");

    modifier onlyEventOrganizer(uint256 eventId) {
        require(eventOrganizer[eventId] == msg.sender, "Not the event organizer");
        _;
    }

    // Constructor to disable initializers for the implementation contract
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // Initializer function to set up the contract
    function initialize(address defaultAdmin, address _usdcToken) public initializer {
        __ERC721_init("NFTicketPass", "NFTP");
        __ERC721URIStorage_init();
        __AccessControl_init();
        __ERC2981_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        usdcToken = _usdcToken;

    }

    function _authorizeUpgrade(address /* newImplementation */)
        internal
        view
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(!upgradesLocked, "Upgrades are locked");
    }

    /// @notice Permanently disables all future upgrades. Cannot be undone.
    /// Call this before any public sale so purchased tickets have fixed conditions.
    /// The admin keeps its other powers (granting and revoking roles).
    function lockUpgrades() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!upgradesLocked, "Upgrades already locked");
        upgradesLocked = true;
        emit UpgradesLocked(msg.sender);
    }

    // ---------------------------------------------------------------------
    // Event setup (organizer)
    // ---------------------------------------------------------------------

    /// @notice Sets the event's rules. The first organizer to configure an event becomes its organizer.
    /// The rules lock once the first ticket is sold.
    /// @param endTime When the event ends (unix timestamp). After it, sales stop and resale is uncapped.
    /// @param royaltyBps Royalty paid to the organizer on every resale, in basis points (500 = 5%).
    /// @param resaleCapBps Resale cap as % of face value in basis points (11000 = 110%); 0 = no cap.
    function configureEvent(uint256 eventId, uint256 endTime, uint256 royaltyBps, uint256 resaleCapBps)
        public onlyRole(ORGANIZER_ROLE)
    {
        address organizer = eventOrganizer[eventId];
        require(organizer == address(0) || organizer == msg.sender, "Not the event organizer");
        EventConfig storage config = eventConfigs[eventId];
        require(config.sold == 0, "Event terms locked: tickets already sold");
        require(endTime > block.timestamp, "End time must be in the future");
        require(royaltyBps <= 10000, "Royalty cannot exceed 100%");
        require(resaleCapBps == 0 || resaleCapBps >= 10000, "Resale cap must be 0 or at least 100% of face value");

        if (organizer == address(0)) {
            eventOrganizer[eventId] = msg.sender;
        }

        config.endTime = endTime;
        config.resaleCapBps = resaleCapBps;
        config.configured = true;
        royaltyPercentage[eventId] = royaltyBps;

        emit EventConfigured(eventId, msg.sender, endTime, royaltyBps, resaleCapBps);
    }

    /// @notice Adds a ticket type (e.g. General Admission, VIP). Returns its type ID (0, 1, 2, ...).
    function addTicketType(uint256 eventId, uint256 price, uint256 maxSupply, string memory metadataURI)
        public onlyRole(ORGANIZER_ROLE) onlyEventOrganizer(eventId) returns (uint256 typeId)
    {
        EventConfig storage config = eventConfigs[eventId];
        require(config.configured, "Event not configured");
        require(maxSupply > 0, "Max supply must be greater than zero");
        require(bytes(metadataURI).length > 0, "Metadata URI is required");

        typeId = config.ticketTypeCount;
        config.ticketTypeCount++;

        TicketType storage ticketType = ticketTypes[eventId][typeId];
        ticketType.price = price;
        ticketType.maxSupply = maxSupply;
        ticketType.metadataURI = metadataURI;

        emit TicketTypeConfigured(eventId, typeId, price, maxSupply, metadataURI);
    }

    /// @notice Updates a ticket type. Locked once that type has its first paid sale.
    function updateTicketType(uint256 eventId, uint256 typeId, uint256 price, uint256 maxSupply, string memory metadataURI)
        public onlyRole(ORGANIZER_ROLE) onlyEventOrganizer(eventId)
    {
        require(typeId < eventConfigs[eventId].ticketTypeCount, "Ticket type does not exist");
        TicketType storage ticketType = ticketTypes[eventId][typeId];
        require(ticketType.sold == 0, "Ticket type locked: tickets already sold");
        require(maxSupply > 0, "Max supply must be greater than zero");
        require(maxSupply >= ticketType.issued, "Max supply is below tickets already issued");
        require(bytes(metadataURI).length > 0, "Metadata URI is required");

        ticketType.price = price;
        ticketType.maxSupply = maxSupply;
        ticketType.metadataURI = metadataURI;

        emit TicketTypeConfigured(eventId, typeId, price, maxSupply, metadataURI);
    }

    /// @notice Opens or pauses ticket sales (allowed at any time).
    function setSaleActive(uint256 eventId, bool active)
        public onlyRole(ORGANIZER_ROLE) onlyEventOrganizer(eventId)
    {
        require(eventConfigs[eventId].ticketTypeCount > 0, "No ticket types");
        eventConfigs[eventId].active = active;
        emit SaleStatusUpdated(eventId, active);
    }

    // ---------------------------------------------------------------------
    // Getting tickets
    // ---------------------------------------------------------------------

    /// @notice Buys `quantity` tickets of a type. Pulls price x quantity in USDC from the buyer
    /// (approve first) and mints the tickets to them. Returns the first token ID.
    function buyTickets(uint256 eventId, uint256 typeId, uint256 quantity)
        public nonReentrant returns (uint256 firstTokenId)
    {
        EventConfig storage config = eventConfigs[eventId];
        require(config.active, "Sale is not active");
        require(block.timestamp < config.endTime, "Event has ended");
        require(typeId < config.ticketTypeCount, "Ticket type does not exist");
        require(quantity > 0 && quantity <= 100, "Quantity must be between 1 and 100");

        TicketType storage ticketType = ticketTypes[eventId][typeId];
        require(ticketType.sold + ticketType.issued + quantity <= ticketType.maxSupply, "Not enough tickets left");
        if (presaleActive[eventId]) {
            require(_whitelist[eventId][msg.sender], "Address not whitelisted for presale");
        }

        uint256 total = ticketType.price * quantity;
        if (total > 0) {
            require(
                IERC20(usdcToken).transferFrom(msg.sender, address(this), total),
                "USDC payment failed"
            );
        }

        ticketType.sold += quantity;
        config.sold += quantity;
        eventRevenue[eventId] += total;

        firstTokenId = tokenIdCounter;
        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = _mintTicket(msg.sender, eventId, typeId, ticketType.price, ticketType.metadataURI);
            emit TicketPurchased(tokenId, eventId, typeId, msg.sender, ticketType.price);
        }
    }

    /// @notice Issues free tickets of a type (e.g. comps, VIP passes). Counts toward the type's supply,
    /// skips the presale whitelist, and does not lock the event's terms.
    function issueTickets(uint256 eventId, uint256 typeId, address[] memory recipients)
        public nonReentrant onlyRole(ORGANIZER_ROLE) onlyEventOrganizer(eventId)
    {
        require(typeId < eventConfigs[eventId].ticketTypeCount, "Ticket type does not exist");
        require(recipients.length > 0, "Must issue at least one ticket");
        require(recipients.length <= 100, "Batch size cannot exceed 100");

        TicketType storage ticketType = ticketTypes[eventId][typeId];
        require(ticketType.sold + ticketType.issued + recipients.length <= ticketType.maxSupply, "Not enough tickets left");
        ticketType.issued += recipients.length;

        for (uint256 i = 0; i < recipients.length; i++) {
            _mintTicket(recipients[i], eventId, typeId, ticketType.price, ticketType.metadataURI);
        }
    }

    /// @notice Sends the event's accumulated sale revenue to its organizer.
    function withdraw(uint256 eventId) public nonReentrant onlyEventOrganizer(eventId) {
        uint256 amount = eventRevenue[eventId];
        require(amount > 0, "No revenue to withdraw");

        eventRevenue[eventId] = 0;
        require(IERC20(usdcToken).transfer(msg.sender, amount), "USDC transfer failed");

        emit RevenueWithdrawn(eventId, msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Check-in
    // ---------------------------------------------------------------------

    function checkInTicket(uint256 tokenId) public {
        uint256 eventId = tokenEventId[tokenId];
        require(
            eventScanners[eventId][msg.sender] || 
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

    // ---------------------------------------------------------------------
    // Presale whitelist and scanners
    // ---------------------------------------------------------------------

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

    function setEventScanner(uint256 eventId, address wallet, bool status)
        public onlyRole(ORGANIZER_ROLE)
    {
        eventScanners[eventId][wallet] = status;
        emit ScannerUpdated(eventId, wallet, status);
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

    // ---------------------------------------------------------------------
    // Royalties and resale
    // ---------------------------------------------------------------------

    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        public view override returns (address receiver, uint256 amount)
    {
        uint256 eventId = tokenEventId[tokenId];
        uint256 royalty = (salePrice * royaltyPercentage[eventId]) / 10000;
        return (eventOrganizer[eventId], royalty);
    }

    /// @notice True if the resale price cap applies: the ticket is unused, the event has not ended,
    /// and the event has a cap. Used tickets and tickets after the event are collectibles: no cap.
    function resaleCapApplies(uint256 tokenId) public view returns (bool) {
        EventConfig storage config = eventConfigs[tokenEventId[tokenId]];
        return !isUsed[tokenId] && block.timestamp < config.endTime && config.resaleCapBps > 0;
    }

    /// @notice The ticket's maximum resale price while the cap applies: face value x resale cap.
    function maxResalePriceOf(uint256 tokenId) public view returns (uint256) {
        return (tokenFaceValue[tokenId] * eventConfigs[tokenEventId[tokenId]].resaleCapBps) / 10000;
    }

    /// @notice Platform resale. The price cap applies only while resaleCapApplies() is true;
    /// the organizer's royalty applies to every resale.
    function resell(uint256 tokenId, address buyer, uint256 salePrice) public nonReentrant {
        require(ownerOf(tokenId) == msg.sender, "You do not own this ticket");
        require(buyer != address(0), "Invalid buyer address");

        if (resaleCapApplies(tokenId)) {
            require(salePrice <= maxResalePriceOf(tokenId), "Sale price exceeds maximum resale price");
        }

        IERC20 usdc = IERC20(usdcToken);

        require(
            usdc.transferFrom(buyer, address(this), salePrice),
            "USDC transfer from buyer failed"
        );

        (address royaltyReceiver, uint256 royaltyAmount) = royaltyInfo(tokenId, salePrice);
        uint256 sellerAmount = salePrice - royaltyAmount;

        if (royaltyAmount > 0) {
            require(usdc.transfer(royaltyReceiver, royaltyAmount), "Royalty transfer failed");
        }

        require(usdc.transfer(msg.sender, sellerAmount), "Seller transfer failed");

        _transfer(msg.sender, buyer, tokenId);

        emit TicketResold(tokenId, msg.sender, buyer, salePrice);
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    /// @dev The only mint path: every ticket belongs to an event and a ticket type.
    function _mintTicket(address to, uint256 eventId, uint256 typeId, uint256 faceValue, string memory uri)
        internal returns (uint256 tokenId)
    {
        tokenId = tokenIdCounter;
        tokenIdCounter++;

        tokenEventId[tokenId] = eventId;
        tokenTicketType[tokenId] = typeId;
        tokenFaceValue[tokenId] = faceValue;

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);

        emit TicketMinted(tokenId, eventId, typeId, to, uri);
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
