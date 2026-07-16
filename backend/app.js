const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'coupons.json');

// Helper to read coupons from the JSON datastore
function readData() {
    try {
        const rawData = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(rawData);
    } catch (error) {
        console.error("Error reading data file:", error);
        return [];
    }
}

// Helper to write coupons to the JSON datastore
function writeData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error("Error writing data file:", error);
    }
}

// AMP Email Security & CORS Middleware Configuration
app.use(cors({
    origin: true,
    credentials: true
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// AMP Security Headers Interceptor
app.use((req, res, next) => {
    // AMP-Same-Origin is present if the request is sent from the same origin, 
    // but AMP Source Origin checking is required for cross-origin email clients like Gmail.
    const ampSourceOrigin = req.query.__amp_source_origin;
    if (ampSourceOrigin) {
        res.setHeader('AMP-Access-Control-Allow-Source-Origin', ampSourceOrigin);
    }
    res.setHeader('Access-Control-Expose-Headers', 'AMP-Access-Control-Allow-Source-Origin');
    next();
});

// GET /api/spin?userId=1001
app.get('/api/spin', (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
        return res.status(400).json({ error: "Missing userId parameter" });
    }

    const coupons = readData();
    const userCoupon = coupons.find(c => c.userId === String(userId));

    if (!userCoupon) {
        return res.status(404).json({ error: "User not found" });
    }

    // Return payload structured for amp-list ingestion
    // Wrapped in an object containing an array targetable by standard expressions
    res.json({
        items: [
            {
                coupon: userCoupon.coupon,
                discount: userCoupon.discount,
                animation: userCoupon.animation,
                claimed: userCoupon.claimed
            }
        ]
    });
});

// POST /api/claim
app.post('/api/claim', (req, res) => {
    const { userId, coupon } = req.body;

    if (!userId || !coupon) {
        return res.status(400).json({ status: "FAILED", message: "Missing required parameters" });
    }

    const coupons = readData();
    const userIndex = coupons.findIndex(c => c.userId === String(userId) && c.coupon === coupon);

    if (userIndex === -1) {
        return res.status(404).json({ status: "FAILED", message: "Coupon and User pairing mismatch" });
    }

    if (coupons[userIndex].claimed) {
        return res.status(400).json({ status: "FAILED", message: "Already Claimed" });
    }

    // Persistent mutation updates state within local JSON
    coupons[userIndex].claimed = true;
    writeData(coupons);

    res.json({
        status: "SUCCESS",
        message: "Coupon Claimed Successfully"
    });
});

app.listen(PORT, () => {
    console.log(`AMP Spin & Win backend server running seamlessly on port ${PORT}`);
});