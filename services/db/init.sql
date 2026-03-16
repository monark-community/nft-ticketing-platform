CREATE TABLE users (
    wallet_address VARCHAR(42) PRIMARY KEY,
    nonce VARCHAR(50) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'organizer', 'user')),
    nickname VARCHAR(255),
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
); 

CREATE INDEX idx_users_role ON users(role);

CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blockchain_id BIGINT UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    start_date TIMESTAMP NOT NULL,
    total_supply INTEGER NOT NULL,
    location VARCHAR(255),
    image_url VARCHAR(500),
    organizer_wallet VARCHAR(42) REFERENCES users(wallet_address),
    ipfs_hash VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
);

CREATE INDEX idx_events_organizer ON events(organizer_wallet);

CREATE INDEX idx_events_date ON events(start_date);

CREATE TABLE ticket_types (
    id SERIAL PRIMARY KEY,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    price DECIMAL NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'USDC',
    max_supply INTEGER,
    metadata_uri VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ticket_types_event ON ticket_types(event_id);

CREATE TABLE tickets (
    token_id INTEGER PRIMARY KEY,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    ticket_type_id INTEGER REFERENCES ticket_types(id),
    owner_wallet VARCHAR(42) REFERENCES users(wallet_address),
    status VARCHAR(20) DEFAULT 'VALID' CHECK (status IN ('VALID', 'USED')),
    seat_number VARCHAR(50),
    metadata_uri VARCHAR(500) NOT NULL,
    minted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMP
);

CREATE INDEX idx_tickets_owner ON tickets(owner_wallet);

CREATE INDEX idx_tickets_status ON tickets(status);

CREATE INDEX idx_tickets_type ON tickets(ticket_type_id);

CREATE INDEX idx_tickets_event ON tickets(event_id);

CREATE TABLE scanner_assignments (
    id SERIAL PRIMARY KEY,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    scanner_wallet VARCHAR(42) REFERENCES users(wallet_address) NOT NULL,
    assigned_by VARCHAR(42) REFERENCES users(wallet_address) NOT NULL,
    synced_to_chain BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, scanner_wallet)
);

CREATE INDEX idx_scanners_event ON scanner_assignments(event_id);

CREATE INDEX idx_scanners_wallet ON scanner_assignments(scanner_wallet);

CREATE INDEX idx_scanners_synced ON scanner_assignments(synced_to_chain);

CREATE TABLE whitelist_entries (
    id SERIAL PRIMARY KEY,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    wallet_address VARCHAR(42) REFERENCES users(wallet_address) NOT NULL,
    added_by VARCHAR(42) REFERENCES users(wallet_address) NOT NULL,
    synced_to_chain BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, wallet_address)
);

CREATE INDEX idx_whitelist_event ON whitelist_entries(event_id);

CREATE INDEX idx_whitelist_wallet ON whitelist_entries(wallet_address);

CREATE INDEX idx_whitelist_synced ON whitelist_entries(synced_to_chain);

CREATE TABLE checkin_logs (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES tickets(token_id),
    scanned_by VARCHAR(42),
    scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_checkin_ticket ON checkin_logs(ticket_id);

CREATE INDEX idx_checkin_time ON checkin_logs(scanned_at);

CREATE INDEX idx_checkin_scanner ON checkin_logs(scanned_by);

