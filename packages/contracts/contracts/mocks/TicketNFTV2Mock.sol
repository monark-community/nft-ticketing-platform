// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../TicketNFT.sol";

/// @notice Test-only "version 2" of TicketNFT, used to prove upgrades work.
/// It inherits everything from TicketNFT (so existing storage stays in the
/// same order) and only adds new things at the end. Never deploy this for real.
contract TicketNFTV2Mock is TicketNFT {
    function version() external pure returns (string memory) {
        return "v2";
    }
}