-- =====================================
-- MILESNATION REGISTRATION DATABASE
-- =====================================

CREATE TABLE IF NOT EXISTS registrations (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    registration_code TEXT UNIQUE NOT NULL,

    -- Personal details
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,

    -- Address details
    house_number TEXT NOT NULL,
    street TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    pincode TEXT NOT NULL,

    -- Selected challenge
    activity TEXT NOT NULL
        CHECK(activity IN ('Running', 'Cycling', 'Walking')),

    distance TEXT NOT NULL,

    -- Payment details
    amount INTEGER NOT NULL DEFAULT 29900,
    currency TEXT NOT NULL DEFAULT 'INR',

    payment_status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK(payment_status IN ('PENDING', 'PAID', 'FAILED')),

    razorpay_order_id TEXT UNIQUE,
    razorpay_payment_id TEXT UNIQUE,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =====================================
-- DATABASE INDEXES
-- =====================================

CREATE INDEX IF NOT EXISTS idx_email
ON registrations(email);

CREATE INDEX IF NOT EXISTS idx_activity
ON registrations(activity);

CREATE INDEX IF NOT EXISTS idx_distance
ON registrations(distance);

CREATE INDEX IF NOT EXISTS idx_payment_status
ON registrations(payment_status); 