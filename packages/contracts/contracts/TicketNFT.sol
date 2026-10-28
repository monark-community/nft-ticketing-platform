// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
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
    using SafeERC20 for IERC20;

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
        uint256 perWalletLimit; // max tickets one wallet may hold for the event (checked on platform purchases/resales); 0 = no limit
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
    mapping(uint256 => mapping(address => uint256)) public eventTicketsHeld; // eventId => wallet => tickets held
    struct Listing {
        address seller;
        uint256 price;
    }
    mapping(uint256 => Listing) public listings;

    // Events
    event TicketMinted(uint256 indexed tokenId, uint256 indexed eventId, uint256 typeId, address indexed to, string tokenURI);
    event TicketCheckedIn(uint256 indexed tokenId, address indexed scanner);
    event WhitelistUpdated(uint256 indexed eventId, address indexed wallet, bool status);
    event PresaleStatusUpdated(uint256 indexed eventId, bool active);
    event TicketResold(uint256 indexed tokenId, address indexed from, address indexed to, uint256 price);
    event ScannerUpdated(uint256 indexed eventId, address indexed wallet, bool status);
    event UpgradesLocked(address indexed by);
    event EventConfigured(uint256 indexed eventId, address indexed organizer, uint256 endTime, uint256 royaltyBps, uint256 resaleCapBps, uint256 perWalletLimit);
    event TicketTypeConfigured(uint256 indexed eventId, uint256 indexed typeId, uint256 price, uint256 maxSupply, string metadataURI);
    event SaleStatusUpdated(uint256 indexed eventId, bool active);
    event TicketPurchased(uint256 indexed tokenId, uint256 indexed eventId, uint256 typeId, address indexed buyer, uint256 price);
    event RevenueWithdrawn(uint256 indexed eventId, address indexed organizer, uint256 amount);
    event TicketListed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event ListingCancelled(uint256 indexed tokenId, address indexed seller);
    event EventSettingsUpdatedByAdmin(uint256 indexed eventId, address indexed admin);

    // Roles
    bytes32 public constant ORGANIZER_ROLE = keccak256("ORGANIZER_ROLE");

    modifier onlyEventOrganizer(uint256 eventId) {
        require(eventOrganizer[eventId] == msg.sender, "Not the event organizer");
        _;
    }

    modifier onlyEventOrganizerOrAdmin(uint256 eventId) {
        require(_isEventOrganizerOrAdmin(eventId, msg.sender), "Not the event organizer or admin");
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
    /// @param perWalletLimit Max tickets one wallet may hold for this event, checked on platform
    /// purchases and resales (plain transfers are never blocked); 0 = no limit.
    function configureEvent(
        uint256 eventId,
        uint256 endTime,
        uint256 royaltyBps,
        uint256 resaleCapBps,
        uint256 perWalletLimit
    )
        public onlyRole(ORGANIZER_ROLE)
    {
        address organizer = eventOrganizer[eventId];
        require(organizer == address(0) || organizer == msg.sender, "Not the event organizer");
        EventConfig storage config = eventConfigs[eventId];
        require(config.sold == 0, "Event terms locked: tickets already sold");
        _validateEventSettings(endTime, royaltyBps, resaleCapBps);

        if (organizer == address(0)) {
            eventOrganizer[eventId] = msg.sender;
        }

        config.endTime = endTime;
        config.resaleCapBps = resaleCapBps;
        config.perWalletLimit = perWalletLimit;
        config.configured = true;
        royaltyPercentage[eventId] = royaltyBps;

        emit EventConfigured(eventId, msg.sender, endTime, royaltyBps, resaleCapBps, perWalletLimit);
    }

    /// @notice Lets the admin change an event's settings at any time, including after the first sale.
    /// Organizers stay locked once tickets are sold (configureEvent); the event keeps its organizer.
    function adminUpdateEventSettings(
        uint256 eventId,
        uint256 endTime,
        uint256 royaltyBps,
        uint256 resaleCapBps,
        uint256 perWalletLimit
    )
        public onlyRole(DEFAULT_ADMIN_ROLE)
    {
        EventConfig storage config = eventConfigs[eventId];
        require(config.configured, "Event not configured");
        _validateEventSettings(endTime, royaltyBps, resaleCapBps);

        config.endTime = endTime;
        config.resaleCapBps = resaleCapBps;
        config.perWalletLimit = perWalletLimit;
        royaltyPercentage[eventId] = royaltyBps;

        // Same event as configureEvent(), with the event's organizer, so existing consumers keep working
        emit EventConfigured(eventId, eventOrganizer[eventId], endTime, royaltyBps, resaleCapBps, perWalletLimit);
        emit EventSettingsUpdatedByAdmin(eventId, msg.sender);
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
        if (config.perWalletLimit > 0) {
            require(
                eventTicketsHeld[eventId][msg.sender] + quantity <= config.perWalletLimit,
                "Per-wallet limit reached"
            );
        }

        uint256 total = ticketType.price * quantity;

        // Effects before interactions
        ticketType.sold += quantity;
        config.sold += quantity;
        eventRevenue[eventId] += total;

        if (total > 0) {
            IERC20(usdcToken).safeTransferFrom(msg.sender, address(this), total);
        }

        firstTokenId = tokenIdCounter;
        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = _mintTicket(msg.sender, eventId, typeId, ticketType.price, ticketType.metadataURI);
            emit TicketPurchased(tokenId, eventId, typeId, msg.sender, ticketType.price);
        }
    }

    /// @notice Issues free tickets of a type (e.g. comps, VIP passes). Counts toward the type's supply,
    /// skips the presale whitelist, and does not lock the event's terms.
    function issueTickets(uint256 eventId, uint256 typeId, address[] memory recipients)
        public nonReentrant onlyEventOrganizerOrAdmin(eventId)
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
        IERC20(usdcToken).safeTransfer(msg.sender, amount);

        emit RevenueWithdrawn(eventId, msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Check-in
    // ---------------------------------------------------------------------

    function checkInTicket(uint256 tokenId) public {
        uint256 eventId = tokenEventId[tokenId];
        require(
            eventScanners[eventId][msg.sender] || 
            _isEventOrganizerOrAdmin(eventId, msg.sender),
            "Not authorized to check in"
        );

        ownerOf(tokenId); 

        require(!isUsed[tokenId], "Ticket already used");
        isUsed[tokenId] = true;

        address seller = listings[tokenId].seller;
        if (seller != address(0)) {
            delete listings[tokenId];
            emit ListingCancelled(tokenId, seller);
        }

        emit TicketCheckedIn(tokenId, msg.sender);
    }

    function isValidTicket(uint256 tokenId) public view returns (bool) {
        return _ownerOf(tokenId) != address(0) && !isUsed[tokenId];
    }

    // ---------------------------------------------------------------------
    // Presale whitelist and scanners
    // ---------------------------------------------------------------------

    function setPresaleActive(uint256 eventId, bool active) 
        public onlyEventOrganizerOrAdmin(eventId) 
    {
        presaleActive[eventId] = active;
        emit PresaleStatusUpdated(eventId, active);
    }

    function addToWhitelist(uint256 eventId, address wallet) 
        public onlyEventOrganizerOrAdmin(eventId) 
    {
        _whitelist[eventId][wallet] = true;
        emit WhitelistUpdated(eventId, wallet, true);
    }

    function batchAddToWhitelist(uint256 eventId, address[] memory wallets)
        public onlyEventOrganizerOrAdmin(eventId) 
    {   
        require(wallets.length > 0, "Must provide at least one address");
        require(wallets.length <= 100, "Batch size cannot exceed 100");
        for (uint256 i = 0; i < wallets.length; i++) {
            _whitelist[eventId][wallets[i]] = true;
            emit WhitelistUpdated(eventId, wallets[i], true);
        }
    }

    function setEventScanner(uint256 eventId, address wallet, bool status)
        public onlyEventOrganizerOrAdmin(eventId) 
    {
        eventScanners[eventId][wallet] = status;
        emit ScannerUpdated(eventId, wallet, status);
    }

    function removeFromWhitelist(uint256 eventId, address wallet) 
        public onlyEventOrganizerOrAdmin(eventId) 
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

    /// @notice Lists a ticket for resale. Nothing moves until a buyer calls buyResaleTicket().
    /// The price cap applies while resaleCapApplies() is true. Listing again changes the price.
    function listForResale(uint256 tokenId, uint256 price) public {
        require(ownerOf(tokenId) == msg.sender, "You do not own this ticket");
        require(price > 0, "Price must be greater than zero");
        if (resaleCapApplies(tokenId)) {
            require(price <= maxResalePriceOf(tokenId), "Sale price exceeds maximum resale price");
        }

        listings[tokenId] = Listing(msg.sender, price);
        emit TicketListed(tokenId, msg.sender, price);
    }

    /// @notice Removes the seller's listing.
    function cancelListing(uint256 tokenId) public {
        require(listings[tokenId].seller == msg.sender, "Not the seller of this listing");
        delete listings[tokenId];
        emit ListingCancelled(tokenId, msg.sender);
    }

    /// @notice Buys a listed ticket: the buyer pays (approve USDC first) and receives the ticket.
    /// The organizer's royalty is taken from the price. `expectedPrice` must match the listing,
    /// so the seller can't raise the price while the purchase is pending.
    function buyResaleTicket(uint256 tokenId, uint256 expectedPrice) public nonReentrant {
        Listing memory listing = listings[tokenId];
        require(listing.seller != address(0), "Ticket is not listed");
        require(listing.price == expectedPrice, "Listing price changed");
        require(msg.sender != listing.seller, "Cannot buy your own ticket");

        if (resaleCapApplies(tokenId)) {
            require(listing.price <= maxResalePriceOf(tokenId), "Sale price exceeds maximum resale price");
        }
        uint256 eventId = tokenEventId[tokenId];
        uint256 limit = eventConfigs[eventId].perWalletLimit;
        if (limit > 0) {
            require(eventTicketsHeld[eventId][msg.sender] + 1 <= limit, "Per-wallet limit reached");
        }

        (address royaltyReceiver, uint256 royaltyAmount) = royaltyInfo(tokenId, listing.price);
        uint256 sellerAmount = listing.price - royaltyAmount;

        // Effects before interactions (the transfer also clears the listing, see _update)
        _transfer(listing.seller, msg.sender, tokenId);

        IERC20 usdc = IERC20(usdcToken);
        usdc.safeTransferFrom(msg.sender, address(this), listing.price);
        if (royaltyAmount > 0) {
            usdc.safeTransfer(royaltyReceiver, royaltyAmount);
        }
        usdc.safeTransfer(listing.seller, sellerAmount);

        emit TicketResold(tokenId, listing.seller, msg.sender, listing.price);
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _isEventOrganizerOrAdmin(uint256 eventId, address account) internal view returns (bool){
        return hasRole(DEFAULT_ADMIN_ROLE, account)
            || (eventOrganizer[eventId] == account && hasRole(ORGANIZER_ROLE, account));
    }

    /// @dev Checks shared by configureEvent() and adminUpdateEventSettings().
    function _validateEventSettings(uint256 endTime, uint256 royaltyBps, uint256 resaleCapBps) internal view {
        require(endTime > block.timestamp, "End time must be in the future");
        require(royaltyBps <= 10000, "Royalty cannot exceed 100%");
        require(resaleCapBps == 0 || resaleCapBps >= 10000, "Resale cap must be 0 or at least 100% of face value");
    }

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

    /// @dev Keeps per-event holdings up to date on every mint and transfer, including plain transfers
    /// and outside marketplaces. It only counts; the limit is enforced in buyTickets() and buyResaleTicket().
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address from)
    {
        from = super._update(to, tokenId, auth);

        // Any transfer (including a resale) ends the listing, so it can't come back to life
        if (listings[tokenId].seller != address(0)) {
            delete listings[tokenId];
        }

        uint256 eventId = tokenEventId[tokenId];
        if (from != address(0)) {
            eventTicketsHeld[eventId][from] -= 1;
        }
        if (to != address(0)) {
            eventTicketsHeld[eventId][to] += 1;
        }
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
